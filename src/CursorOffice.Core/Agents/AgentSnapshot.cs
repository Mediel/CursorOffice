using CursorOffice.Core.Usage;

namespace CursorOffice.Core.Agents;

/// <summary>
/// Immutable projection of an agent at a point in time.
/// </summary>
public sealed record AgentSnapshot
{
    public AgentSnapshot(
        string id,
        string displayName,
        string role,
        AgentStatus status,
        string? currentTask,
        string? detail,
        DateTimeOffset lastActivityAt,
        AgentKind kind = AgentKind.Primary,
        string? parentAgentId = null,
        string? workspace = null,
        string? model = null,
        bool isParallelWorker = false,
        string? generationId = null,
        TokenUsage? usage = null,
        AgentInteractionKind? interactionKind = null,
        string? workspacePath = null,
        bool isFallback = false,
        string? windowId = null,
        string? windowLabel = null,
        AgentWindowCorrelation? windowCorrelation = null,
        string? conversationTitle = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentException.ThrowIfNullOrWhiteSpace(displayName);
        ArgumentException.ThrowIfNullOrWhiteSpace(role);

        Id = id;
        DisplayName = displayName;
        Role = role;
        Status = status;
        CurrentTask = currentTask;
        Detail = detail;
        LastActivityAt = lastActivityAt;
        Kind = kind;
        ParentAgentId = parentAgentId;
        Workspace = workspace;
        Model = model;
        IsParallelWorker = isParallelWorker;
        GenerationId = generationId;
        Usage = usage;
        InteractionKind = interactionKind;
        WorkspacePath = workspacePath;
        IsFallback = isFallback;
        WindowId = windowId;
        WindowLabel = windowLabel;
        WindowCorrelation = windowCorrelation;
        ConversationTitle = conversationTitle;
    }

    public string Id { get; }

    public string DisplayName { get; }

    public string Role { get; }

    public AgentStatus Status { get; }

    public string? CurrentTask { get; }

    public string? Detail { get; }

    public DateTimeOffset LastActivityAt { get; }

    public AgentKind Kind { get; }

    public string? ParentAgentId { get; }

    public string? Workspace { get; }

    public string? Model { get; }

    public bool IsParallelWorker { get; }

    public string? GenerationId { get; }

    public TokenUsage? Usage { get; }

    public AgentInteractionKind? InteractionKind { get; }

    public string? WorkspacePath { get; }

    public bool IsFallback { get; }

    public string? WindowId { get; }

    public string? WindowLabel { get; }

    public AgentWindowCorrelation? WindowCorrelation { get; }

    public string? ConversationTitle { get; }
}
