using System.Text.Json;
using System.Text.Json.Serialization;
using CursorOffice.Application.Agents;
using CursorOffice.Core.Agents;
using CursorOffice.Host.Protocol;
using CursorOffice.Infrastructure;
using CursorOffice.Infrastructure.Activity;
using CursorOffice.Infrastructure.Cursor;
using CursorOffice.Infrastructure.Usage;

var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web)
{
    Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
};

var registry = new AgentRegistry();
var windowPresence = new CursorWindowPresenceDirectory();
var eventSource = new CursorConversationTitleEventSource(
    new CompositeAgentEventSource(
        new CursorHooksAgentEventSource(),
        new CursorTranscriptAgentEventSource()),
    new CursorComposerHeaderStore());
var monitor = new AgentMonitor(registry, eventSource);
var usageLedger = new LocalUsageLedger();
var activityLog = new LocalActivityLog();
using var outputGate = new SemaphoreSlim(1, 1);
using var shutdown = new CancellationTokenSource();
Console.CancelKeyPress += (_, eventArgs) =>
{
    eventArgs.Cancel = true;
    shutdown.Cancel();
};

await WriteAsync(
    ProtocolEnvelope<object>.Create("host.ready", new { hostVersion = "0.1.49" }),
    shutdown.Token);
await WriteAsync(
    ProtocolEnvelope<CursorOffice.Core.Usage.UsageLedgerSnapshot>.Create("usage.changed", usageLedger.GetSnapshot()),
    shutdown.Token);

foreach (var agent in activityLog.GetLatestAgents())
{
    registry.Upsert(agent);
}

foreach (var agent in RetireOrphanedWindowAgents())
{
    registry.Upsert(agent);
    activityLog.Append(agent, AgentActivityEvent.FromSnapshot(agent));
}

foreach (var agent in DowngradeStaleWorkingAgents())
{
    registry.Upsert(agent);
    activityLog.Append(agent, AgentActivityEvent.FromSnapshot(agent));
}

_ = RemoveExpiredAgents();

await WriteAsync(
    ProtocolEnvelope<AgentsSnapshot>.Create(
        "agents.snapshot",
        new AgentsSnapshot(
            registry.GetSnapshot(),
            activityLog.GetTimeline(LocalActivityLog.DefaultMaximumLines))),
    shutdown.Token);

var monitorTask = monitor.RunAsync(
    OnAgentChangedAsync,
    shutdown.Token);
var cleanupTask = RunCleanupAsync(shutdown.Token);
await Task.WhenAll(monitorTask, cleanupTask);

return;

async ValueTask OnAgentChangedAsync(AgentSnapshot agent, CancellationToken cancellationToken)
{
    await WriteAsync(
        ProtocolEnvelope<AgentSnapshot>.Create("agent.changed", agent),
        cancellationToken);
    activityLog.Append(agent, AgentActivityEvent.FromSnapshot(agent));
    if (usageLedger.TryRecord(agent))
    {
        await WriteAsync(
            ProtocolEnvelope<CursorOffice.Core.Usage.UsageLedgerSnapshot>.Create("usage.changed", usageLedger.GetSnapshot()),
            cancellationToken);
    }
}

async ValueTask WriteAsync<T>(ProtocolEnvelope<T> message, CancellationToken cancellationToken)
{
    var json = JsonSerializer.Serialize(message, jsonOptions);
    await outputGate.WaitAsync(cancellationToken);
    try
    {
        await Console.Out.WriteLineAsync(json.AsMemory(), cancellationToken);
    }
    finally
    {
        outputGate.Release();
    }
}

async Task RunCleanupAsync(CancellationToken cancellationToken)
{
    while (!cancellationToken.IsCancellationRequested)
    {
        await Task.Delay(TimeSpan.FromSeconds(5), cancellationToken);
        foreach (var agent in RetireOrphanedWindowAgents())
        {
            await OnAgentChangedAsync(agent, cancellationToken);
        }

        foreach (var agent in DowngradeStaleWorkingAgents())
        {
            await OnAgentChangedAsync(agent, cancellationToken);
        }

        foreach (var id in RemoveExpiredAgents())
        {
            await WriteAsync(
                ProtocolEnvelope<object>.Create("agent.removed", new { id }),
                cancellationToken);
        }
    }
}

IReadOnlyList<AgentSnapshot> RetireOrphanedWindowAgents()
{
    var liveWindowIds = windowPresence.TryReadLiveWindowIds(DateTimeOffset.UtcNow);
    if (liveWindowIds is null || liveWindowIds.Count == 0)
    {
        return [];
    }

    var retired = OrphanedWindowAgentRetirer.CreateOfflineSnapshots(
        registry.GetSnapshot(),
        liveWindowIds,
        DateTimeOffset.UtcNow);
    foreach (var agent in retired)
    {
        registry.Upsert(agent);
    }

    return retired;
}

IReadOnlyList<AgentSnapshot> DowngradeStaleWorkingAgents()
{
    var idle = AgentLifecycle.CreateIdleSnapshotsForStaleWork(
        registry.GetSnapshot(),
        DateTimeOffset.UtcNow);
    foreach (var agent in idle)
    {
        registry.Upsert(agent);
    }

    return idle;
}

List<string> RemoveExpiredAgents()
{
    var now = DateTimeOffset.UtcNow;
    var removed = new List<string>();
    foreach (var agent in registry.GetSnapshot())
    {
        if (!AgentLifecycle.IsExpired(agent, now))
        {
            continue;
        }

        if (registry.Remove(agent.Id))
        {
            activityLog.AppendRemoval(agent.Id);
            removed.Add(agent.Id);
        }
    }

    return removed;
}
