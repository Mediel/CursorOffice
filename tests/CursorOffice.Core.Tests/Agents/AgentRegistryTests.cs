using CursorOffice.Application.Abstractions;
using CursorOffice.Application.Agents;
using CursorOffice.Core.Agents;
using CursorOffice.Core.Usage;

namespace CursorOffice.Core.Tests.Agents;

public sealed class AgentRegistryTests
{
    [Fact]
    public void Upsert_AddsAgentToSnapshot()
    {
        var registry = new AgentRegistry();
        var agent = CreateAgent("alice", "Alice", AgentStatus.Working);

        registry.Upsert(agent);

        Assert.Equal([agent], registry.GetSnapshot());
    }

    [Fact]
    public void Upsert_ReplacesAgentIgnoringIdCasing()
    {
        var registry = new AgentRegistry();
        registry.Upsert(CreateAgent("alice", "Alice", AgentStatus.Idle));
        var updated = CreateAgent("ALICE", "Alice", AgentStatus.Completed);

        registry.Upsert(updated);

        var actual = Assert.Single(registry.GetSnapshot());
        Assert.Equal(AgentStatus.Completed, actual.Status);
    }

    [Fact]
    public void GetSnapshot_OrdersAgentsByDisplayName()
    {
        var registry = new AgentRegistry();
        registry.Upsert(CreateAgent("zdenek", "Zdeněk", AgentStatus.Idle));
        registry.Upsert(CreateAgent("alice", "Alice", AgentStatus.Working));

        var snapshot = registry.GetSnapshot();

        Assert.Collection(
            snapshot,
            agent => Assert.Equal("Alice", agent.DisplayName),
            agent => Assert.Equal("Zdeněk", agent.DisplayName));
    }

    [Fact]
    public void Remove_DropsAgentIgnoringIdCasing()
    {
        var registry = new AgentRegistry();
        registry.Upsert(CreateAgent("alice", "Alice", AgentStatus.Completed));

        var removed = registry.Remove("ALICE");

        Assert.True(removed);
        Assert.Empty(registry.GetSnapshot());
    }

    [Fact]
    public async Task Monitor_PreservesModelAndUsageAcrossSameGeneration()
    {
        var registry = new AgentRegistry();
        var usage = new TokenUsage(100, 20, 30, 0);
        var source = new StubEventSource(
            new AgentActivity("agent", "Agent", "Developer", AgentStatus.WaitingForUser, null, null,
                DateTimeOffset.UtcNow, Model: "grok-4.6", GenerationId: "generation-1", Usage: usage,
                ConversationTitle: "Terminal integration details"),
            new AgentActivity("agent", "Agent", "Developer", AgentStatus.Completed, null, null,
                DateTimeOffset.UtcNow.AddSeconds(1), GenerationId: "generation-1"));
        var monitor = new AgentMonitor(registry, source);

        await monitor.RunAsync((_, _) => ValueTask.CompletedTask, CancellationToken.None);

        var actual = Assert.Single(registry.GetSnapshot());
        Assert.Equal("grok-4.6", actual.Model);
        Assert.Equal(usage, actual.Usage);
        Assert.Equal("Terminal integration details", actual.ConversationTitle);
    }

    private sealed class StubEventSource(params AgentActivity[] activities) : IAgentEventSource
    {
        public async IAsyncEnumerable<AgentActivity> ReadAllAsync(
            [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
        {
            foreach (var activity in activities)
            {
                cancellationToken.ThrowIfCancellationRequested();
                yield return activity;
            }
            await Task.CompletedTask;
        }
    }

    private static AgentSnapshot CreateAgent(string id, string name, AgentStatus status) =>
        new(id, name, "Developer", status, null, null, DateTimeOffset.UtcNow);
}
