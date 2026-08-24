namespace CursorOffice.Core.Agents;

/// <summary>
/// Privacy-preserving interaction signal used for social office animations.
/// The content of prompts, responses, tasks, and summaries is never required.
/// </summary>
public enum AgentInteractionKind
{
    UserPrompt,
    AgentResponse,
    DelegationStarted,
    HandoffCompleted,
}
