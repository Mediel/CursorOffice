namespace CursorOffice.Core.Agents;

/// <summary>
/// Restore payload: last known agents plus a privacy-safe activity timeline.
/// </summary>
public sealed record AgentsSnapshot(
    IReadOnlyList<AgentSnapshot> Agents,
    IReadOnlyList<AgentActivityEvent> Activity);
