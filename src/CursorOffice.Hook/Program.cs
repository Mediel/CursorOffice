using System.Globalization;
using System.Text.Json;

try
{
    var input = await Console.In.ReadToEndAsync().ConfigureAwait(false);
    if (!string.IsNullOrWhiteSpace(input))
    {
        using var document = JsonDocument.Parse(input);
        var hookEvent = Normalize(document.RootElement);
        WriteEvent(hookEvent);
        if (hookEvent.Kind == "subagent"
            && hookEvent.Status == "working"
            && !string.IsNullOrWhiteSpace(hookEvent.ParentAgentId))
        {
            var parentShortId = hookEvent.ParentAgentId.Replace("cursor-", string.Empty, StringComparison.OrdinalIgnoreCase);
            parentShortId = parentShortId.Length > 6 ? parentShortId[..6] : parentShortId;
            WriteEvent(hookEvent with
            {
                AgentId = hookEvent.ParentAgentId,
                DisplayName = $"Cursor Agent {parentShortId}",
                Role = $"{hookEvent.Workspace} · agent",
                Status = "working",
                CurrentTask = $"{hookEvent.Workspace}: koordinuje aktivní podagenty",
                Detail = $"{hookEvent.Workspace} · rodič aktivního podagenta",
                Kind = "primary",
                ParentAgentId = null,
                IsParallelWorker = false,
                InteractionKind = null,
            });
        }
    }
}
catch (Exception exception) when (exception is JsonException or IOException or UnauthorizedAccessException)
{
    // Telemetry is fail-open and must never affect Cursor's agent loop.
}

await Console.Out.WriteAsync("{}").ConfigureAwait(false);

static OfficeHookEvent Normalize(JsonElement input)
{
    var eventName = GetString(input, "hook_event_name") ?? "unknown";
    var conversationId = GetString(input, "conversation_id")
        ?? GetString(input, "session_id")
        ?? "unknown";
    var model = GetString(input, "model_id") ?? GetString(input, "model");
    var generationId = GetString(input, "generation_id");
    var usage = GetUsage(input);
    var workspaceRoots = GetWorkspaceRoots(input);
    var workspaceContext = GetWorkspaceContext(workspaceRoots);
    var workspace = workspaceContext.Name;
    var parentConversationId = GetString(input, "parent_conversation_id");
    var occurredAt = DateTimeOffset.UtcNow;
    var sessions = new SubagentSessionStore();
    var windowAssociation = new WindowCorrelationStore().Resolve(
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
            model = GetString(input, "subagent_model") ?? model;
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
        interactionKind,
        workspaceContext.Path,
        windowAssociation?.WindowId,
        windowAssociation?.WindowLabel,
        windowAssociation?.Resolution);
}

static void WriteEvent(OfficeHookEvent hookEvent)
{
    var eventDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "CursorOffice",
        "events-v3");
    Directory.CreateDirectory(eventDirectory);
    var eventId = $"{DateTime.UtcNow:yyyyMMddHHmmssfffffff}-{Guid.NewGuid():N}";
    var temporaryPath = Path.Combine(eventDirectory, $"{eventId}.tmp");
    var eventPath = Path.Combine(eventDirectory, $"{eventId}.json");
    File.WriteAllText(temporaryPath, JsonSerializer.Serialize(hookEvent, HookJson.Options));
    File.Move(temporaryPath, eventPath);
}

static string[] GetWorkspaceRoots(JsonElement input)
{
    if (input.TryGetProperty("workspace_roots", out var roots)
        && roots.ValueKind == JsonValueKind.Array
        && roots.GetArrayLength() > 0)
    {
        return roots.EnumerateArray()
            .Where(root => root.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(root.GetString()))
            .Select(root => Path.GetFullPath(root.GetString()!)
                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar))
            .ToArray();
    }

    return [];
}

static WorkspaceContext GetWorkspaceContext(IReadOnlyList<string> workspaceRoots)
{
    if (workspaceRoots.Count > 0)
    {
        var normalized = workspaceRoots[0];
        return new WorkspaceContext(WorkspaceNameResolver.Resolve(normalized), normalized);
    }

    return new WorkspaceContext("Cursor workspace", null);
}

static string? GetString(JsonElement input, string propertyName) =>
    input.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.String
        ? value.GetString()
        : null;

static long? GetNumber(JsonElement input, string propertyName) =>
    input.TryGetProperty(propertyName, out var value) && value.TryGetInt64(out var number)
        ? number
        : null;

static HookTokenUsage? GetUsage(JsonElement input)
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

static long? GetUsageNumber(JsonElement input, params string[] propertyNames)
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

static bool GetBoolean(JsonElement input, string propertyName) =>
    input.TryGetProperty(propertyName, out var value)
    && value.ValueKind is JsonValueKind.True;

static string Limit(string value, int length) =>
    value.Length <= length ? value : string.Concat(value.AsSpan(0, length - 1), "…");

static string GetSubagentId(JsonElement input, string conversationId, string agentType)
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

internal sealed record OfficeHookEvent(
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
    string? InteractionKind,
    string? WorkspacePath,
    string? WindowId,
    string? WindowLabel,
    string? WindowCorrelation);

internal sealed record WorkspaceContext(string Name, string? Path);

internal sealed record HookTokenUsage(
    long InputTokens,
    long OutputTokens,
    long CacheReadTokens,
    long CacheWriteTokens);

internal static class HookJson
{
    public static JsonSerializerOptions Options { get; } = new(JsonSerializerDefaults.Web);
}
