using CursorOffice.Application.Agents;
using CursorOffice.Core.Agents;

namespace CursorOffice.Core.Tests;

public sealed class AgentLifecycleTests
{
    [Fact]
    public void StaleRestoredWorkingBecomesIdleWithoutRefreshingLastActivity()
    {
        var now = DateTimeOffset.Parse("2026-08-31T08:00:00Z");
        var lastActivity = now.AddHours(-6);
        var ghost = Agent("chat-old", AgentStatus.Working, lastActivity);

        var idle = Assert.Single(AgentLifecycle.CreateIdleSnapshotsForStaleWork([ghost], now));

        Assert.Equal(AgentStatus.Idle, idle.Status);
        Assert.Equal(lastActivity, idle.LastActivityAt);
        Assert.Equal("Sample: naposledy zaznamenaný", idle.CurrentTask);
        Assert.True(AgentLifecycle.IsExpired(idle, now));
        Assert.False(AgentLifecycle.IsExpired(ghost, now));
    }

    [Fact]
    public void FreshWorkingIsLeftInPlace()
    {
        var now = DateTimeOffset.Parse("2026-08-31T08:00:00Z");
        var live = Agent("chat-live", AgentStatus.Working, now.AddMinutes(-2));

        Assert.Empty(AgentLifecycle.CreateIdleSnapshotsForStaleWork([live], now));
        Assert.False(AgentLifecycle.IsStaleWorking(live, [live], now));
    }

    [Fact]
    public void FreshWorkingParentKeepsRecentlySilentSubagentWorking()
    {
        var now = DateTimeOffset.Parse("2026-08-31T08:00:00Z");
        var parent = Agent("chat-live", AgentStatus.Working, now.AddMinutes(-1));
        var child = Agent(
            "sub-quiet",
            AgentStatus.Working,
            now.AddMinutes(-5),
            kind: AgentKind.Subagent,
            parentId: "chat-live");

        Assert.Empty(AgentLifecycle.CreateIdleSnapshotsForStaleWork([parent, child], now));
    }

    [Fact]
    public void SilentSubagentIdlesWhenParentIsNotFreshWorking()
    {
        var now = DateTimeOffset.Parse("2026-08-31T08:00:00Z");
        var parent = Agent("chat-idle", AgentStatus.Idle, now.AddMinutes(-4));
        var child = Agent(
            "sub-stale",
            AgentStatus.Working,
            now.AddMinutes(-5),
            kind: AgentKind.Subagent,
            parentId: "chat-idle");

        var idle = Assert.Single(AgentLifecycle.CreateIdleSnapshotsForStaleWork([parent, child], now));
        Assert.Equal("sub-stale", idle.Id);
        Assert.Equal(AgentKind.Subagent, idle.Kind);
        Assert.True(AgentLifecycle.IsExpired(idle, now));
    }

    [Fact]
    public void SubagentPastGraceIdlesEvenWhenParentIsFresh()
    {
        var now = DateTimeOffset.Parse("2026-08-31T08:00:00Z");
        var parent = Agent("chat-live", AgentStatus.Working, now.AddMinutes(-1));
        var child = Agent(
            "sub-old",
            AgentStatus.Working,
            now.AddMinutes(-9),
            kind: AgentKind.Subagent,
            parentId: "chat-live");

        var idle = Assert.Single(AgentLifecycle.CreateIdleSnapshotsForStaleWork([parent, child], now));
        Assert.Equal("sub-old", idle.Id);
    }

    [Fact]
    public void AbandonedWaitingForUserEventuallyExpires()
    {
        var now = DateTimeOffset.Parse("2026-08-31T08:00:00Z");
        var waiting = Agent("chat-wait", AgentStatus.WaitingForUser, now.AddMinutes(-31));

        Assert.True(AgentLifecycle.IsExpired(waiting, now));
        Assert.Equal(TimeSpan.FromMinutes(30), AgentLifecycle.RetentionFor(waiting));
    }

    [Fact]
    public void LeavesNonWorkingStatusesUntouched()
    {
        var now = DateTimeOffset.Parse("2026-08-31T08:00:00Z");
        var agents = new[]
        {
            Agent("offline", AgentStatus.Offline, now.AddMinutes(-20), windowId: "window-dead"),
            Agent("idle", AgentStatus.Idle, now.AddMinutes(-10)),
            Agent("waiting", AgentStatus.WaitingForUser, now.AddMinutes(-10)),
        };

        Assert.Empty(AgentLifecycle.CreateIdleSnapshotsForStaleWork(agents, now));
    }

    private static AgentSnapshot Agent(
        string id,
        AgentStatus status,
        DateTimeOffset lastActivityAt,
        AgentKind kind = AgentKind.Primary,
        string? parentId = null,
        string? windowId = null) =>
        new(
            id,
            id,
            "Cursor chat",
            status,
            "Sample: aktivní",
            null,
            lastActivityAt,
            kind,
            parentId,
            "Sample",
            isFallback: true,
            windowId: windowId);
}
