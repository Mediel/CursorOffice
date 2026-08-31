using CursorOffice.Core.Agents;

namespace CursorOffice.Application.Agents;

/// <summary>
/// Shared retention and stale-work rules for host restore and periodic cleanup.
/// Working without fresh evidence must become idle so ghosts from the activity
/// log cannot fill the office after Cursor has gone quiet.
/// </summary>
public static class AgentLifecycle
{
    public static readonly TimeSpan WorkingEvidenceWindow = TimeSpan.FromMinutes(3);
    public static readonly TimeSpan SubagentWorkingGrace = TimeSpan.FromMinutes(8);

    public static TimeSpan RetentionFor(AgentSnapshot agent)
    {
        ArgumentNullException.ThrowIfNull(agent);
        return agent.Status switch
        {
            AgentStatus.Offline when agent.Kind == AgentKind.Subagent => TimeSpan.FromSeconds(12),
            AgentStatus.Offline => TimeSpan.FromSeconds(28),
            AgentStatus.Completed when agent.Kind == AgentKind.Subagent => TimeSpan.FromMinutes(2),
            AgentStatus.Completed => TimeSpan.FromMinutes(20),
            AgentStatus.Error when agent.Kind == AgentKind.Subagent => TimeSpan.FromMinutes(2),
            AgentStatus.Error => TimeSpan.FromMinutes(20),
            AgentStatus.Idle when agent.Kind == AgentKind.Subagent => TimeSpan.FromMinutes(2),
            AgentStatus.Idle => TimeSpan.FromMinutes(30),
            AgentStatus.WaitingForUser when agent.Kind == AgentKind.Subagent => TimeSpan.FromMinutes(2),
            AgentStatus.WaitingForUser => TimeSpan.FromMinutes(30),
            AgentStatus.Unknown => TimeSpan.FromMinutes(10),
            _ => Timeout.InfiniteTimeSpan,
        };
    }

    public static bool IsExpired(AgentSnapshot agent, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(agent);
        var retention = RetentionFor(agent);
        return retention != Timeout.InfiniteTimeSpan && now - agent.LastActivityAt >= retention;
    }

    public static IReadOnlyList<AgentSnapshot> CreateIdleSnapshotsForStaleWork(
        IReadOnlyList<AgentSnapshot> agents,
        DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(agents);

        var idle = new List<AgentSnapshot>();
        foreach (var agent in agents)
        {
            if (!IsStaleWorking(agent, agents, now))
            {
                continue;
            }

            idle.Add(ToIdle(agent));
        }

        return idle;
    }

    public static bool IsStaleWorking(
        AgentSnapshot agent,
        IReadOnlyList<AgentSnapshot> agents,
        DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(agent);
        ArgumentNullException.ThrowIfNull(agents);
        if (agent.Status != AgentStatus.Working)
        {
            return false;
        }

        return now - agent.LastActivityAt > EvidenceWindowFor(agent, agents, now);
    }

    private static TimeSpan EvidenceWindowFor(
        AgentSnapshot agent,
        IReadOnlyList<AgentSnapshot> agents,
        DateTimeOffset now)
    {
        if (agent.Kind == AgentKind.Subagent
            && !string.IsNullOrWhiteSpace(agent.ParentAgentId)
            && HasFreshWorkingParent(agent.ParentAgentId, agents, now))
        {
            return SubagentWorkingGrace;
        }

        return WorkingEvidenceWindow;
    }

    private static bool HasFreshWorkingParent(
        string parentId,
        IReadOnlyList<AgentSnapshot> agents,
        DateTimeOffset now) =>
        agents.Any(parent =>
            string.Equals(parent.Id, parentId, StringComparison.OrdinalIgnoreCase)
            && parent.Status == AgentStatus.Working
            && now - parent.LastActivityAt <= WorkingEvidenceWindow);

    private static AgentSnapshot ToIdle(AgentSnapshot agent)
    {
        var workspace = string.IsNullOrWhiteSpace(agent.Workspace)
            ? "Cursor"
            : agent.Workspace.Trim();
        return new AgentSnapshot(
            agent.Id,
            agent.DisplayName,
            agent.Role,
            AgentStatus.Idle,
            $"{workspace}: naposledy zaznamenaný",
            $"{workspace} · bez čerstvého důkazu práce",
            agent.LastActivityAt,
            agent.Kind,
            agent.ParentAgentId,
            agent.Workspace,
            agent.Model,
            agent.IsParallelWorker,
            agent.GenerationId,
            agent.Usage,
            agent.ModelParams,
            agent.ContextUsage,
            interactionKind: null,
            agent.WorkspacePath,
            agent.IsFallback,
            agent.WindowId,
            agent.WindowLabel,
            agent.WindowCorrelation,
            agent.ConversationTitle);
    }
}
