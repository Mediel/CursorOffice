namespace CursorOffice.Core.Usage;

/// <summary>Token counts reported by a runtime. Missing usage is represented by null, never by an estimate.</summary>
public sealed record TokenUsage(
    long InputTokens,
    long OutputTokens,
    long CacheReadTokens,
    long CacheWriteTokens)
{
    public long TotalTokens => InputTokens + OutputTokens + CacheReadTokens + CacheWriteTokens;
}

/// <summary>Safe model knobs announced by Cursor. Prompt text and other raw params are never stored.</summary>
public sealed record ModelParams(
    string? Thinking,
    string? Effort,
    string? Context);

/// <summary>
/// Context-window fill from preCompact. Missing evidence is null, never a zeroed estimate,
/// and these values are not generation usage.
/// </summary>
public sealed record ContextUsage(
    long? ContextTokens,
    long? ContextWindowSize,
    double? ContextUsagePercent);

public sealed record UsageBucket(
    string Key,
    long InputTokens,
    long OutputTokens,
    long CacheReadTokens,
    long CacheWriteTokens,
    long RequestCount)
{
    public long TotalTokens => InputTokens + OutputTokens + CacheReadTokens + CacheWriteTokens;
}

public sealed record UsageLedgerSnapshot(
    UsageBucket Total,
    IReadOnlyList<UsageBucket> ByWorkspace,
    IReadOnlyList<UsageBucket> ByModel,
    IReadOnlyList<UsageBucket> ByWorkspaceModel,
    IReadOnlyList<UsageBucket> ByDay,
    DateTimeOffset? UpdatedAt);
