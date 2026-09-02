using CursorOffice.Core.Agents;

namespace CursorOffice.Application.Agents;

/// <summary>
/// Marks chat and subagent snapshots offline when their Cursor window heartbeat is gone.
/// A manager is synthesized only from live windows; this keeps the same lease for workers.
/// </summary>
public static class OrphanedWindowAgentRetirer
{
    public static IReadOnlyList<AgentSnapshot> CreateOfflineSnapshots(
        IReadOnlyList<AgentSnapshot> agents,
        IReadOnlySet<string> liveWindowIds,
        DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(agents);
        ArgumentNullException.ThrowIfNull(liveWindowIds);
        if (liveWindowIds.Count == 0)
        {
            return [];
        }

        var live = new HashSet<string>(liveWindowIds, StringComparer.OrdinalIgnoreCase);
        var byId = new Dictionary<string, AgentSnapshot>(StringComparer.OrdinalIgnoreCase);
        foreach (var agent in agents)
        {
            byId[agent.Id] = agent;
        }

        var retired = new List<AgentSnapshot>();
        foreach (var agent in agents)
        {
            if (agent.Status == AgentStatus.Offline
                || !IsOrphaned(agent, byId, live, []))
            {
                continue;
            }

            retired.Add(ToOffline(agent, now));
        }

        return retired;
    }

    private static bool IsOrphaned(
        AgentSnapshot agent,
        IReadOnlyDictionary<string, AgentSnapshot> byId,
        HashSet<string> liveWindowIds,
        HashSet<string> visiting)
    {
        if (!visiting.Add(agent.Id))
        {
            return false;
        }

        if (!string.IsNullOrWhiteSpace(agent.WindowId)
            && !liveWindowIds.Contains(agent.WindowId))
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(agent.ParentAgentId)
            || !byId.TryGetValue(agent.ParentAgentId, out var parent))
        {
            return false;
        }

        return IsOrphaned(parent, byId, liveWindowIds, visiting);
    }

    private static AgentSnapshot ToOffline(AgentSnapshot agent, DateTimeOffset now)
    {
        var workspace = string.IsNullOrWhiteSpace(agent.Workspace)
            ? "Cursor"
            : agent.Workspace.Trim();
        return new AgentSnapshot(
            agent.Id,
            agent.DisplayName,
            agent.Role,
            AgentStatus.Offline,
            $"{workspace}: window closed",
            $"{workspace} · Cursor window is no longer live",
            now,
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
            isFallback: false,
            agent.WindowId,
            agent.WindowLabel,
            agent.WindowCorrelation,
            agent.ConversationTitle);
    }
}
