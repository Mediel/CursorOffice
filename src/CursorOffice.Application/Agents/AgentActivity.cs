using CursorOffice.Core.Agents;
using CursorOffice.Core.Usage;

namespace CursorOffice.Application.Agents;

/// <summary>
/// Normalized activity received from Cursor Hooks, ACP, or a development source.
/// </summary>
public sealed record AgentActivity(
    string AgentId,
    string DisplayName,
    string Role,
    AgentStatus Status,
    string? CurrentTask,
    string? Detail,
    DateTimeOffset OccurredAt,
    AgentKind Kind = AgentKind.Primary,
    string? ParentAgentId = null,
    string? Workspace = null,
    string? Model = null,
    bool IsParallelWorker = false,
    string? GenerationId = null,
    TokenUsage? Usage = null,
    AgentInteractionKind? InteractionKind = null,
    string? WorkspacePath = null,
    bool IsFallback = false,
    string? WindowId = null,
    string? WindowLabel = null,
    AgentWindowCorrelation? WindowCorrelation = null,
    string? ConversationTitle = null);
