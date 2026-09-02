using CursorOffice.Application.Agents;
using CursorOffice.Core.Agents;

namespace CursorOffice.Core.Tests;

public sealed class OrphanedWindowAgentRetirerTests
{
    [Fact]
    public void MarksChatAndChildOfflineWhenWindowIsGone()
    {
        var now = DateTimeOffset.Parse("2026-08-26T14:00:00Z");
        var chat = Agent(
            "chat-a",
            AgentStatus.WaitingForUser,
            windowId: "window-dead",
            workspace: "Baumueller-PA");
        var child = Agent(
            "sub-a",
            AgentStatus.Working,
            kind: AgentKind.Subagent,
            parentId: "chat-a",
            workspace: "Baumueller-PA");
        var other = Agent("chat-b", AgentStatus.Working, windowId: "window-live");

        var retired = OrphanedWindowAgentRetirer.CreateOfflineSnapshots(
            [chat, child, other],
            new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "window-live" },
            now);

        Assert.Equal(2, retired.Count);
        Assert.All(retired, agent =>
        {
            Assert.Equal(AgentStatus.Offline, agent.Status);
            Assert.False(agent.IsFallback);
            Assert.Equal(now, agent.LastActivityAt);
            Assert.Equal("Baumueller-PA: window closed", agent.CurrentTask);
        });
        Assert.DoesNotContain(retired, agent => agent.Id == "chat-b");
    }

    [Fact]
    public void LeavesAlreadyOfflineAgentsUntouched()
    {
        var agent = Agent("chat-a", AgentStatus.Offline, windowId: "window-dead");

        var retired = OrphanedWindowAgentRetirer.CreateOfflineSnapshots(
            [agent],
            new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "window-live" },
            DateTimeOffset.UtcNow);

        Assert.Empty(retired);
    }

    [Fact]
    public void SkipsRetirementWhenNoLiveWindowsAreKnown()
    {
        var agent = Agent("chat-a", AgentStatus.Working, windowId: "window-dead");

        var retired = OrphanedWindowAgentRetirer.CreateOfflineSnapshots(
            [agent],
            new HashSet<string>(StringComparer.OrdinalIgnoreCase),
            DateTimeOffset.UtcNow);

        Assert.Empty(retired);
    }

    [Fact]
    public void LeavesUnassignedChatsInPlace()
    {
        var agent = Agent("chat-a", AgentStatus.Working);

        var retired = OrphanedWindowAgentRetirer.CreateOfflineSnapshots(
            [agent],
            new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "window-live" },
            DateTimeOffset.UtcNow);

        Assert.Empty(retired);
    }

    private static AgentSnapshot Agent(
        string id,
        AgentStatus status,
        string? windowId = null,
        AgentKind kind = AgentKind.Primary,
        string? parentId = null,
        string? workspace = "Sample") =>
        new(
            id,
            id,
            "Cursor chat",
            status,
            "Sample: active",
            null,
            DateTimeOffset.Parse("2026-08-26T13:00:00Z"),
            kind,
            parentId,
            workspace,
            windowId: windowId);
}
