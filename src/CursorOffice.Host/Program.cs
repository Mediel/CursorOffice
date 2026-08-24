using System.Text.Json;
using System.Text.Json.Serialization;
using CursorOffice.Application.Agents;
using CursorOffice.Core.Agents;
using CursorOffice.Host.Protocol;
using CursorOffice.Infrastructure;
using CursorOffice.Infrastructure.Cursor;
using CursorOffice.Infrastructure.Usage;

var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web)
{
    Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
};

var registry = new AgentRegistry();
var eventSource = new CursorConversationTitleEventSource(
    new CompositeAgentEventSource(
        new CursorHooksAgentEventSource(),
        new CursorTranscriptAgentEventSource()),
    new CursorComposerHeaderStore());
var monitor = new AgentMonitor(registry, eventSource);
var usageLedger = new LocalUsageLedger();
using var outputGate = new SemaphoreSlim(1, 1);
using var shutdown = new CancellationTokenSource();
Console.CancelKeyPress += (_, eventArgs) =>
{
    eventArgs.Cancel = true;
    shutdown.Cancel();
};

await WriteAsync(
    ProtocolEnvelope<object>.Create("host.ready", new { hostVersion = "0.1.30" }),
    shutdown.Token);
await WriteAsync(
    ProtocolEnvelope<CursorOffice.Core.Usage.UsageLedgerSnapshot>.Create("usage.changed", usageLedger.GetSnapshot()),
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
        var now = DateTimeOffset.UtcNow;
        foreach (var agent in registry.GetSnapshot())
        {
            var retention = agent.Status switch
            {
                AgentStatus.Offline when agent.Kind == AgentKind.Subagent => TimeSpan.FromSeconds(12),
                AgentStatus.Offline => TimeSpan.FromSeconds(28),
                AgentStatus.Completed when agent.Kind == AgentKind.Subagent => TimeSpan.FromMinutes(2),
                AgentStatus.Completed => TimeSpan.FromMinutes(20),
                AgentStatus.Error when agent.Kind == AgentKind.Subagent => TimeSpan.FromMinutes(2),
                AgentStatus.Idle when agent.Kind == AgentKind.Subagent => TimeSpan.FromMinutes(2),
                AgentStatus.Idle => TimeSpan.FromMinutes(30),
                AgentStatus.Unknown => TimeSpan.FromMinutes(10),
                _ => Timeout.InfiniteTimeSpan,
            };
            if (retention == Timeout.InfiniteTimeSpan || now - agent.LastActivityAt < retention)
            {
                continue;
            }
            if (registry.Remove(agent.Id))
            {
                await WriteAsync(
                    ProtocolEnvelope<object>.Create("agent.removed", new { id = agent.Id }),
                    cancellationToken);
            }
        }
    }
}
