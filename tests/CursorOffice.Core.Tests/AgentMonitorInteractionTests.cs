using System.Runtime.CompilerServices;
using CursorOffice.Application.Abstractions;
using CursorOffice.Application.Agents;
using CursorOffice.Core.Agents;

namespace CursorOffice.Core.Tests;

public sealed class AgentMonitorInteractionTests
{
    [Fact]
    public async Task MarksOnlyTheFirstEventOfANewPrimaryGenerationAsAUserPrompt()
    {
        var firstGeneration = Activity("generation-1", AgentStatus.Working);
        var sameGeneration = Activity("generation-1", AgentStatus.WaitingForUser);
        var nextGeneration = Activity("generation-2", AgentStatus.Working);
        var monitor = new AgentMonitor(
            new AgentRegistry(),
            new StubEventSource([firstGeneration, sameGeneration, nextGeneration]));
        var snapshots = new List<AgentSnapshot>();

        await monitor.RunAsync(
            (snapshot, _) =>
            {
                snapshots.Add(snapshot);
                return ValueTask.CompletedTask;
            },
            CancellationToken.None);

        Assert.Equal(AgentInteractionKind.UserPrompt, snapshots[0].InteractionKind);
        Assert.Null(snapshots[1].InteractionKind);
        Assert.Equal(AgentInteractionKind.UserPrompt, snapshots[2].InteractionKind);
    }

    [Fact]
    public async Task FreshTranscriptActivityCanResumeWorkingAfterNonTerminalHookState()
    {
        var now = DateTimeOffset.UtcNow;
        var precise = Activity("generation-1", AgentStatus.WaitingForUser) with
        {
            OccurredAt = now,
        };
        var fallback = Activity("generation-1", AgentStatus.Working) with
        {
            OccurredAt = now.AddSeconds(1),
            IsFallback = true,
        };
        var monitor = new AgentMonitor(
            new AgentRegistry(),
            new StubEventSource([precise, fallback]));
        var snapshots = new List<AgentSnapshot>();

        await monitor.RunAsync(
            (snapshot, _) =>
            {
                snapshots.Add(snapshot);
                return ValueTask.CompletedTask;
            },
            CancellationToken.None);

        Assert.Equal(2, snapshots.Count);
        Assert.Equal(AgentStatus.WaitingForUser, snapshots[0].Status);
        Assert.Equal(AgentStatus.Working, snapshots[1].Status);
        Assert.True(snapshots[1].IsFallback);
    }

    [Fact]
    public async Task TerminalHookStateIsNotResurrectedByTranscriptFallback()
    {
        var now = DateTimeOffset.UtcNow;
        var precise = Activity("generation-1", AgentStatus.Completed) with
        {
            OccurredAt = now,
        };
        var fallback = Activity("generation-1", AgentStatus.Working) with
        {
            OccurredAt = now.AddSeconds(1),
            IsFallback = true,
        };
        var monitor = new AgentMonitor(
            new AgentRegistry(),
            new StubEventSource([precise, fallback]));
        var snapshots = new List<AgentSnapshot>();

        await monitor.RunAsync(
            (snapshot, _) =>
            {
                snapshots.Add(snapshot);
                return ValueTask.CompletedTask;
            },
            CancellationToken.None);

        var only = Assert.Single(snapshots);
        Assert.Equal(AgentStatus.Completed, only.Status);
        Assert.False(only.IsFallback);
    }

    [Fact]
    public async Task WorkingChildKeepsParentFromWaitingForUser()
    {
        var child = new AgentActivity(
            "cursor-subagent-child",
            "General Purpose child",
            "CursorOffice · Subagent",
            AgentStatus.Working,
            "CursorOffice: aktivní",
            null,
            DateTimeOffset.UtcNow,
            AgentKind.Subagent,
            "primary-agent");
        var parentWaiting = Activity("generation-1", AgentStatus.WaitingForUser);
        var monitor = new AgentMonitor(
            new AgentRegistry(),
            new StubEventSource([child, parentWaiting]));
        var snapshots = new List<AgentSnapshot>();

        await monitor.RunAsync(
            (snapshot, _) =>
            {
                snapshots.Add(snapshot);
                return ValueTask.CompletedTask;
            },
            CancellationToken.None);

        Assert.Contains(snapshots, snapshot =>
            snapshot.Id == "primary-agent" && snapshot.Status == AgentStatus.Working);
        Assert.DoesNotContain(snapshots, snapshot =>
            snapshot.Id == "primary-agent" && snapshot.Status == AgentStatus.WaitingForUser);
    }

    [Fact]
    public async Task WorkingChildPromotesExistingParentToCoordinator()
    {
        var parent = Activity("generation-1", AgentStatus.WaitingForUser);
        var child = new AgentActivity(
            "cursor-subagent-child",
            "General Purpose child",
            "CursorOffice · Subagent",
            AgentStatus.Working,
            "CursorOffice: aktivní",
            null,
            DateTimeOffset.UtcNow,
            AgentKind.Subagent,
            "primary-agent");
        var monitor = new AgentMonitor(
            new AgentRegistry(),
            new StubEventSource([parent, child]));
        var snapshots = new List<AgentSnapshot>();

        await monitor.RunAsync(
            (snapshot, _) =>
            {
                snapshots.Add(snapshot);
                return ValueTask.CompletedTask;
            },
            CancellationToken.None);

        Assert.Equal(AgentStatus.WaitingForUser, snapshots[0].Status);
        Assert.Contains(snapshots, snapshot =>
            snapshot.Id == "primary-agent"
            && snapshot.Status == AgentStatus.Working
            && snapshot.CurrentTask == "Cursor workspace: koordinuje aktivní podagenty");
    }

    private static AgentActivity Activity(string generationId, AgentStatus status) => new(
        AgentId: "primary-agent",
        DisplayName: "Primary Agent",
        Role: "Cursor chat",
        Status: status,
        CurrentTask: null,
        Detail: null,
        OccurredAt: DateTimeOffset.UtcNow,
        GenerationId: generationId);

    private sealed class StubEventSource(IReadOnlyList<AgentActivity> activities) : IAgentEventSource
    {
        public async IAsyncEnumerable<AgentActivity> ReadAllAsync(
            [EnumeratorCancellation] CancellationToken cancellationToken)
        {
            foreach (var activity in activities)
            {
                cancellationToken.ThrowIfCancellationRequested();
                yield return activity;
                await Task.Yield();
            }
        }
    }
}
