namespace CursorOffice.Core.Agents;

/// <summary>
/// Privacy-safe timeline row. Stores only identity, time, kind, status and an optional tool name.
/// Prompt, reasoning, file bodies and tool output are never part of this record.
/// </summary>
public sealed record AgentActivityEvent(
    string AgentId,
    DateTimeOffset OccurredAt,
    string Kind,
    AgentStatus Status,
    string? Tool = null)
{
    public const string UserPromptKind = "userPrompt";
    public const string AgentResponseKind = "agentResponse";
    public const string DelegationStartedKind = "delegationStarted";
    public const string HandoffCompletedKind = "handoffCompleted";
    public const string ToolKind = "tool";
    public const string StatusKind = "status";

    public static AgentActivityEvent FromSnapshot(AgentSnapshot snapshot)
    {
        ArgumentNullException.ThrowIfNull(snapshot);
        var (kind, tool) = DeriveKindAndTool(snapshot);
        return new AgentActivityEvent(
            snapshot.Id,
            snapshot.LastActivityAt,
            kind,
            snapshot.Status,
            tool);
    }

    internal static (string Kind, string? Tool) DeriveKindAndTool(AgentSnapshot snapshot)
    {
        if (snapshot.InteractionKind is { } interaction)
        {
            return interaction switch
            {
                AgentInteractionKind.UserPrompt => (UserPromptKind, null),
                AgentInteractionKind.AgentResponse => (AgentResponseKind, null),
                AgentInteractionKind.DelegationStarted => (DelegationStartedKind, null),
                AgentInteractionKind.HandoffCompleted => (HandoffCompletedKind, null),
                _ => (StatusKind, null),
            };
        }

        if (TryExtractToolName(snapshot.CurrentTask, out var tool))
        {
            return (ToolKind, tool);
        }

        return (StatusKind, null);
    }

    private static bool TryExtractToolName(string? currentTask, out string? tool)
    {
        tool = null;
        if (string.IsNullOrWhiteSpace(currentTask))
        {
            return false;
        }

        const string usesPrefix = "používá nástroj ";
        const string usedPrefix = "použil nástroj ";
        const string failedPrefix = "nástroj ";
        const string failedSuffix = " selhal";

        if (TrySuffixAfter(currentTask, usesPrefix, out tool)
            || TrySuffixAfter(currentTask, usedPrefix, out tool))
        {
            return true;
        }

        var failedAt = currentTask.LastIndexOf(failedSuffix, StringComparison.Ordinal);
        if (failedAt <= 0)
        {
            return false;
        }

        var prefixAt = currentTask.LastIndexOf(failedPrefix, failedAt, StringComparison.Ordinal);
        if (prefixAt < 0)
        {
            return false;
        }

        var start = prefixAt + failedPrefix.Length;
        if (start >= failedAt)
        {
            return false;
        }

        tool = currentTask[start..failedAt].Trim();
        return tool.Length > 0;
    }

    private static bool TrySuffixAfter(string currentTask, string marker, out string? tool)
    {
        var index = currentTask.LastIndexOf(marker, StringComparison.Ordinal);
        if (index < 0)
        {
            tool = null;
            return false;
        }

        tool = currentTask[(index + marker.Length)..].Trim();
        return tool.Length > 0;
    }
}
