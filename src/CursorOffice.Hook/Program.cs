using System.Text.Json;

try
{
    var input = await Console.In.ReadToEndAsync().ConfigureAwait(false);
    if (!string.IsNullOrWhiteSpace(input))
    {
        using var document = JsonDocument.Parse(input);
        var hookEvent = new OfficeHookNormalizer().Normalize(document.RootElement);
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
