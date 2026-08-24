namespace CursorOffice.Core.Agents;

/// <summary>
/// Describes how confidently a Cursor conversation was associated with an IDE window.
/// </summary>
public enum AgentWindowCorrelation
{
    Focused,
    Conversation,
    Workspace,
}
