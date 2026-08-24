namespace CursorOffice.Core.Agents;

/// <summary>
/// Thread-safe in-memory projection of known agents.
/// </summary>
public sealed class AgentRegistry
{
    private readonly object _gate = new();
    private readonly Dictionary<string, AgentSnapshot> _agents =
        new(StringComparer.OrdinalIgnoreCase);

    public AgentSnapshot Upsert(AgentSnapshot agent)
    {
        ArgumentNullException.ThrowIfNull(agent);

        lock (_gate)
        {
            _agents[agent.Id] = agent;
            return agent;
        }
    }

    public bool TryGet(string agentId, out AgentSnapshot? agent)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(agentId);

        lock (_gate)
        {
            return _agents.TryGetValue(agentId, out agent);
        }
    }

    public bool Remove(string agentId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(agentId);

        lock (_gate)
        {
            return _agents.Remove(agentId);
        }
    }

    public IReadOnlyList<AgentSnapshot> GetSnapshot()
    {
        lock (_gate)
        {
            return _agents.Values
                .OrderBy(agent => agent.DisplayName, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }
    }
}
