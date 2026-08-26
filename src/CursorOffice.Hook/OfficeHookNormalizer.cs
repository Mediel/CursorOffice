using System.Globalization;
using System.Text.Json;

/// <summary>
/// Maps an official Cursor hook payload to privacy-filtered office metadata.
/// Prompt, reasoning, file contents, commands and tool output are discarded.
/// </summary>
public sealed class OfficeHookNormalizer
{
    private readonly WindowCorrelationStore windows;
    private readonly SubagentSessionStore sessions;

    public OfficeHookNormalizer(
        WindowCorrelationStore? windows = null,
        SubagentSessionStore? sessions = null)
    {
        this.windows = windows ?? new WindowCorrelationStore();
        this.sessions = sessions ?? new SubagentSessionStore();
    }

    public OfficeHookEvent Normalize(JsonElement input)
    {
        var eventName = GetString(input, "hook_event_name") ?? "unknown";
        var conversationId = FirstNonEmpty(
            GetString(input, "conversation_id"),
            GetString(input, "session_id")) ?? "unknown";
        var model = FirstNonEmpty(GetString(input, "model_id"), GetString(input, "model"));
        var modelParams = GetModelParams(input);
        var generationId = GetString(input, "generation_id");
        var usage = GetUsage(input);
        HookContextUsage? contextUsage = null;
        var workspaceRoots = GetWorkspaceRoots(input);
        var workspaceContext = GetWorkspaceContext(workspaceRoots);
        var workspace = workspaceContext.Name;
        var parentConversationId = GetString(input, "parent_conversation_id");
        var occurredAt = DateTimeOffset.UtcNow;
        var windowAssociation = windows.Resolve(
            conversationId,
            eventName is "subagentStart" or "subagentStop" ? parentConversationId : null,
            workspaceRoots,
            eventName,
            occurredAt);
        var displayName = $"Manažer {workspace}";
        var role = model is null ? $"{workspace} · agent" : $"{workspace} · {Limit(model, 70)}";
        var status = "working";
        var currentTask = $"Pracuje v {workspace}";
        var detail = $"{workspace} · Cursor hook: {eventName}";
        var agentId = $"cursor-{conversationId}";
        var kind = "primary";
        string? parentAgentId = null;
        var isParallelWorker = false;
        string? interactionKind = null;

        switch (eventName)
        {
            case "beforeSubmitPrompt":
                interactionKind = "userPrompt";
                currentTask = $"{workspace}: přijímá nové zadání";
                detail = $"{workspace} · uživatel předal zadání";
                break;
            case "sessionStart":
                currentTask = GetBoolean(input, "is_background_agent")
                    ? $"{workspace}: spouští práci na pozadí"
                    : $"{workspace}: zahajuje agentní relaci";
                detail = $"{workspace} · režim: {GetString(input, "composer_mode") ?? "agent"}";
                break;
            case "sessionEnd":
                var reason = GetString(input, "reason") ?? "completed";
                status = reason == "error" ? "error" : "offline";
                currentTask = $"{workspace}: relace byla ukončena";
                detail = $"{workspace} · důvod: {reason}";
                break;
            case "afterAgentResponse":
                interactionKind = "agentResponse";
                status = "waitingForUser";
                currentTask = $"{workspace}: předává odpověď uživateli";
                detail = $"{workspace} · odpověď dokončena";
                break;
            case "postToolUse":
                var tool = GetString(input, "tool_name") ?? "nástroj";
                currentTask = $"{workspace}: použil nástroj {Limit(tool, 60)}";
                detail = GetNumber(input, "duration") is { } duration
                    ? $"{workspace} · dokončeno za {duration.ToString(CultureInfo.InvariantCulture)} ms"
                    : $"{workspace} · nástroj dokončen";
                break;
            case "preToolUse":
                var startedTool = GetString(input, "tool_name") ?? "nástroj";
                currentTask = $"{workspace}: používá nástroj {Limit(startedTool, 60)}";
                detail = $"{workspace} · lokální Cursor tool";
                break;
            case "postToolUseFailure":
                status = "error";
                currentTask = $"{workspace}: nástroj {Limit(GetString(input, "tool_name") ?? "neznámý", 60)} selhal";
                detail = $"{workspace} · typ chyby: {GetString(input, "failure_type") ?? "error"}";
                break;
            case "afterAgentThought":
                currentTask = $"{workspace}: analyzuje další krok";
                detail = GetNumber(input, "duration_ms") is { } thoughtDuration
                    ? $"{workspace} · analýza trvala {thoughtDuration.ToString(CultureInfo.InvariantCulture)} ms"
                    : $"{workspace} · analýza dokončena";
                break;
            case "afterFileEdit":
                var editedFile = Basename(GetString(input, "file_path"));
                currentTask = editedFile is null
                    ? $"{workspace}: upravil soubor"
                    : $"{workspace}: upravil {Limit(editedFile, 60)}";
                detail = $"{workspace} · úprava souboru";
                break;
            case "preCompact":
                contextUsage = GetContextUsage(input);
                var trigger = GetString(input, "trigger") ?? "auto";
                currentTask = $"{workspace}: komprimuje kontext";
                detail = FormatCompactDetail(workspace, trigger, contextUsage);
                break;
            case "subagentStart":
                interactionKind = "delegationStarted";
                var startedAgentType = GetString(input, "subagent_type") ?? "subagent";
                var startedAgentId = GetSubagentId(input, conversationId, startedAgentType);
                var startedTask = SubagentPresentation.FormatActivity(GetString(input, "task"));
                agentId = $"cursor-subagent-{startedAgentId}";
                displayName = SubagentPresentation.FormatDisplayName(startedAgentType, startedAgentId);
                kind = "subagent";
                parentAgentId = $"cursor-{parentConversationId ?? conversationId}";
                isParallelWorker = GetBoolean(input, "is_parallel_worker");
                model = FirstNonEmpty(GetString(input, "subagent_model"), model);
                role = $"{workspace} · {SubagentPresentation.FormatType(startedAgentType)}";
                currentTask = startedTask ?? $"{workspace}: zahajuje dílčí úkol";
                var branch = SubagentPresentation.FormatActivity(GetString(input, "git_branch"), 70);
                detail = (isParallelWorker
                    ? $"{workspace} · paralelní pracovník"
                    : $"{workspace} · podagent")
                    + (branch is null ? string.Empty : $" · větev {branch}");
                sessions.RememberStart(startedAgentId, parentConversationId ?? conversationId, workspace, occurredAt);
                break;
            case "subagentStop":
                interactionKind = "handoffCompleted";
                var agentType = GetString(input, "subagent_type") ?? "subagent";
                var stoppedAgentId = GetSubagentId(input, conversationId, agentType);
                var stoppedTask = SubagentPresentation.FormatActivity(
                    GetString(input, "description") ?? GetString(input, "task"));
                agentId = $"cursor-subagent-{stoppedAgentId}";
                displayName = SubagentPresentation.FormatDisplayName(agentType, stoppedAgentId);
                kind = "subagent";
                parentAgentId = $"cursor-{parentConversationId ?? conversationId}";
                role = $"{workspace} · {SubagentPresentation.FormatType(agentType)}";
                var subagentStatus = GetString(input, "status") ?? "completed";
                status = subagentStatus switch
                {
                    "completed" => "completed",
                    "error" => "error",
                    _ => "offline",
                };
                currentTask = stoppedTask is null
                    ? $"{workspace}: předává výsledek vedoucímu"
                    : $"Předává: {stoppedTask}";
                detail = $"{workspace} · zprávy: {GetNumber(input, "message_count") ?? 0}, nástroje: {GetNumber(input, "tool_call_count") ?? 0}";
                break;
            case "stop":
                var stopStatus = GetString(input, "status") ?? "completed";
                status = stopStatus switch
                {
                    "completed" => "completed",
                    "error" => "error",
                    _ => "offline",
                };
                currentTask = status switch
                {
                    "completed" => $"{workspace}: agent dokončil práci",
                    "error" => $"{workspace}: agent skončil s chybou",
                    _ => $"{workspace}: agent byl zastaven",
                };
                detail = $"{workspace} · agent loop: {stopStatus}";
                break;
        }

        if (kind == "primary"
            && eventName is not "beforeSubmitPrompt" and not "sessionStart" and not "sessionEnd")
        {
            var bound = sessions.Resolve(
                conversationId,
                parentConversationId,
                GetString(input, "agent_transcript_path") ?? GetString(input, "transcript_path"),
                workspace,
                occurredAt);
            if (bound is not null)
            {
                agentId = $"cursor-subagent-{bound.SubagentId}";
                displayName = SubagentPresentation.FormatDisplayName("subagent", bound.SubagentId);
                kind = "subagent";
                parentAgentId = $"cursor-{bound.ParentConversationId}";
                role = $"{workspace} · Subagent";
                if (status is not "completed" and not "error" and not "offline")
                {
                    status = "working";
                }
            }
        }

        return new OfficeHookEvent(
            agentId,
            displayName,
            role,
            status,
            currentTask,
            detail,
            occurredAt,
            kind,
            parentAgentId,
            workspace,
            model,
            isParallelWorker,
            generationId,
            usage,
            modelParams,
            contextUsage,
            interactionKind,
            workspaceContext.Path,
            windowAssociation?.WindowId,
            windowAssociation?.WindowLabel,
            windowAssociation?.Resolution);
    }

    private static HookTokenUsage? GetUsage(JsonElement input)
    {
        var inputTokens = GetUsageNumber(input, "input_tokens", "inputTokens");
        var outputTokens = GetUsageNumber(input, "output_tokens", "outputTokens");
        var cacheReadTokens = GetUsageNumber(input, "cache_read_tokens", "cacheReadTokens");
        var cacheWriteTokens = GetUsageNumber(input, "cache_write_tokens", "cacheWriteTokens");
        if (inputTokens is null && outputTokens is null && cacheReadTokens is null && cacheWriteTokens is null)
        {
            return null;
        }

        return new HookTokenUsage(
            Math.Max(inputTokens ?? 0, 0),
            Math.Max(outputTokens ?? 0, 0),
            Math.Max(cacheReadTokens ?? 0, 0),
            Math.Max(cacheWriteTokens ?? 0, 0));
    }

    private static string[] GetWorkspaceRoots(JsonElement input)
    {
        if (input.TryGetProperty("workspace_roots", out var roots)
            && roots.ValueKind == JsonValueKind.Array
            && roots.GetArrayLength() > 0)
        {
            return roots.EnumerateArray()
                .Where(root => root.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(root.GetString()))
                .Select(root => WorkspacePathNormalizer.Normalize(root.GetString()!))
                .ToArray();
        }

        return [];
    }

    private static WorkspaceContext GetWorkspaceContext(IReadOnlyList<string> workspaceRoots)
    {
        if (workspaceRoots.Count > 0)
        {
            var normalized = workspaceRoots[0];
            return new WorkspaceContext(WorkspaceNameResolver.Resolve(normalized), normalized);
        }

        return new WorkspaceContext("Cursor workspace", null);
    }

    private static HookModelParams? GetModelParams(JsonElement input)
    {
        if (!input.TryGetProperty("model_params", out var parameters)
            || parameters.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        string? thinking = null;
        string? effort = null;
        string? context = null;
        foreach (var item in parameters.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var id = GetString(item, "id");
            var value = GetScalarText(item, "value");
            if (string.IsNullOrWhiteSpace(id) || value is null)
            {
                continue;
            }

            switch (id.Trim().ToLowerInvariant())
            {
                case "thinking":
                    thinking = Limit(value, 40);
                    break;
                case "effort":
                    effort = Limit(value, 40);
                    break;
                case "context":
                    context = Limit(value, 40);
                    break;
            }
        }

        return thinking is null && effort is null && context is null
            ? null
            : new HookModelParams(thinking, effort, context);
    }

    private static HookContextUsage? GetContextUsage(JsonElement input)
    {
        var tokens = GetNumber(input, "context_tokens");
        var windowSize = GetNumber(input, "context_window_size");
        var percent = GetDouble(input, "context_usage_percent");
        if (tokens is null && windowSize is null && percent is null)
        {
            return null;
        }

        return new HookContextUsage(tokens, windowSize, percent);
    }

    private static string FormatCompactDetail(string workspace, string trigger, HookContextUsage? usage)
    {
        var parts = new List<string> { workspace };
        if (usage?.ContextUsagePercent is { } percent)
        {
            parts.Add($"kontext {percent.ToString(CultureInfo.InvariantCulture)}%");
        }

        if (usage?.ContextTokens is { } tokens && usage.ContextWindowSize is { } window)
        {
            parts.Add($"{tokens.ToString(CultureInfo.InvariantCulture)}/{window.ToString(CultureInfo.InvariantCulture)}");
        }

        parts.Add(trigger);
        return string.Join(" · ", parts);
    }

    private static string? GetString(JsonElement input, string propertyName) =>
        input.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private static string? GetScalarText(JsonElement input, string propertyName)
    {
        if (!input.TryGetProperty(propertyName, out var value))
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            JsonValueKind.Number => value.GetRawText(),
            _ => null,
        };
    }

    private static long? GetNumber(JsonElement input, string propertyName)
    {
        if (!input.TryGetProperty(propertyName, out var value))
        {
            return null;
        }

        if (value.TryGetInt64(out var number))
        {
            return number;
        }

        if (value.ValueKind == JsonValueKind.Number
            && value.TryGetDouble(out var real)
            && double.IsInteger(real)
            && real is >= long.MinValue and <= long.MaxValue)
        {
            return (long)real;
        }

        return null;
    }

    private static double? GetDouble(JsonElement input, string propertyName)
    {
        if (!input.TryGetProperty(propertyName, out var value) || value.ValueKind != JsonValueKind.Number)
        {
            return null;
        }

        if (value.TryGetInt64(out var integer))
        {
            return integer;
        }

        return value.TryGetDouble(out var number) ? number : null;
    }

    private static long? GetUsageNumber(JsonElement input, params string[] propertyNames)
    {
        foreach (var propertyName in propertyNames)
        {
            if (GetNumber(input, propertyName) is { } direct)
            {
                return direct;
            }
        }

        if (!input.TryGetProperty("usage", out var usage) || usage.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        foreach (var propertyName in propertyNames)
        {
            if (GetNumber(usage, propertyName) is { } nested)
            {
                return nested;
            }
        }

        return null;
    }

    private static bool GetBoolean(JsonElement input, string propertyName) =>
        input.TryGetProperty(propertyName, out var value)
        && value.ValueKind is JsonValueKind.True;

    private static string Limit(string value, int length) =>
        value.Length <= length ? value : string.Concat(value.AsSpan(0, length - 1), "…");

    private static string? FirstNonEmpty(params string?[] values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return null;
    }

    private static string? Basename(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return null;
        }

        var name = Path.GetFileName(path.Replace('\\', '/').TrimEnd('/'));
        return string.IsNullOrWhiteSpace(name) ? null : name;
    }

    private static string GetSubagentId(JsonElement input, string conversationId, string agentType)
    {
        var explicitId = GetString(input, "subagent_id");
        if (!string.IsNullOrWhiteSpace(explicitId))
        {
            return explicitId;
        }

        var transcriptPath = GetString(input, "agent_transcript_path");
        if (!string.IsNullOrWhiteSpace(transcriptPath))
        {
            var transcriptId = Path.GetFileNameWithoutExtension(transcriptPath);
            if (!string.IsNullOrWhiteSpace(transcriptId))
            {
                return transcriptId;
            }
        }

        return GetString(input, "tool_call_id")
            ?? $"{conversationId}-{agentType}-{GetString(input, "generation_id") ?? "unknown"}";
    }
}

public sealed record OfficeHookEvent(
    string AgentId,
    string DisplayName,
    string Role,
    string Status,
    string CurrentTask,
    string Detail,
    DateTimeOffset OccurredAt,
    string Kind,
    string? ParentAgentId,
    string Workspace,
    string? Model,
    bool IsParallelWorker,
    string? GenerationId,
    HookTokenUsage? Usage,
    HookModelParams? ModelParams,
    HookContextUsage? ContextUsage,
    string? InteractionKind,
    string? WorkspacePath,
    string? WindowId,
    string? WindowLabel,
    string? WindowCorrelation);

public sealed record HookModelParams(string? Thinking, string? Effort, string? Context);

public sealed record HookContextUsage(
    long? ContextTokens,
    long? ContextWindowSize,
    double? ContextUsagePercent);

internal sealed record WorkspaceContext(string Name, string? Path);

public sealed record HookTokenUsage(
    long InputTokens,
    long OutputTokens,
    long CacheReadTokens,
    long CacheWriteTokens);

internal static class HookJson
{
    public static JsonSerializerOptions Options { get; } = new(JsonSerializerDefaults.Web);
}
