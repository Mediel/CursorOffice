namespace CursorOffice.Core.Agents;

/// <summary>
/// High-level state used to project an agent into the office world.
/// </summary>
public enum AgentStatus
{
    Unknown = 0,
    Idle = 1,
    Working = 2,
    WaitingForUser = 3,
    Error = 4,
    Completed = 5,
    Offline = 6,
}
