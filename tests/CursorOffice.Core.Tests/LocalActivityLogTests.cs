using System.Text.Json;
using System.Text.Json.Serialization;
using CursorOffice.Core.Agents;
using CursorOffice.Infrastructure.Activity;

namespace CursorOffice.Core.Tests;

public sealed class LocalActivityLogTests
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    [Fact]
    public void DefaultPath_IsLocalAppDataCursorOfficeNdjson()
    {
        var expected = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "CursorOffice",
            "activity-log.ndjson");

        using var workspace = new TempLog();
        var log = new LocalActivityLog(workspace.LogPath);

        Assert.Equal(expected, LocalActivityLog.DefaultLogPath);
        Assert.Equal(workspace.LogPath, log.LogPath);
        Assert.EndsWith(".ndjson", expected, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CursorOffice"),
            Path.GetDirectoryName(expected));
    }

    [Fact]
    public void Append_WritesOneNdjsonLineWithoutFullRewrite()
    {
        using var workspace = new TempLog();
        var log = new LocalActivityLog(workspace.LogPath);
        var first = CreateSnapshot("agent-a", "Alice", AgentStatus.Working, DateTimeOffset.Parse("2026-08-26T10:00:00Z"));
        var second = CreateSnapshot("agent-b", "Bob", AgentStatus.Idle, DateTimeOffset.Parse("2026-08-26T10:01:00Z"));

        log.Append(first, AgentActivityEvent.FromSnapshot(first));
        var afterFirst = File.ReadAllText(workspace.LogPath);
        Assert.Equal(1, CountNonEmptyLines(workspace.LogPath));
        Assert.DoesNotContain('\n', afterFirst.TrimEnd('\n'));

        log.Append(second, AgentActivityEvent.FromSnapshot(second));
        var afterSecond = File.ReadAllText(workspace.LogPath);

        Assert.StartsWith(afterFirst, afterSecond, StringComparison.Ordinal);
        Assert.Equal(2, CountNonEmptyLines(workspace.LogPath));
        Assert.Equal(2, log.GetLatestAgents().Count);
        Assert.Equal(2, log.GetTimeline(10).Count);
    }

    [Fact]
    public void Reload_RestoresLastSnapshotPerAgentAndTimeOrderedTimeline()
    {
        using var workspace = new TempLog();
        var firstTime = DateTimeOffset.Parse("2026-08-26T10:00:00Z");
        var secondTime = DateTimeOffset.Parse("2026-08-26T10:02:00Z");
        var thirdTime = DateTimeOffset.Parse("2026-08-26T10:01:00Z");
        var first = CreateSnapshot("agent-a", "Alice", AgentStatus.Working, firstTime, currentTask: "Repo: analyzing the next step");
        var updated = CreateSnapshot("agent-a", "Alice", AgentStatus.WaitingForUser, secondTime, currentTask: "Repo: handing off a response");
        var other = CreateSnapshot("agent-b", "Bob", AgentStatus.Working, thirdTime);

        var log = new LocalActivityLog(workspace.LogPath);
        log.Append(first, AgentActivityEvent.FromSnapshot(first));
        log.Append(other, AgentActivityEvent.FromSnapshot(other));
        log.Append(updated, AgentActivityEvent.FromSnapshot(updated));

        var reloaded = new LocalActivityLog(workspace.LogPath);
        var agents = reloaded.GetLatestAgents();
        var alice = Assert.Single(agents, agent => agent.Id == "agent-a");
        Assert.Equal(AgentStatus.WaitingForUser, alice.Status);
        Assert.Equal("Repo: handing off a response", alice.CurrentTask);
        Assert.Equal("Bob", Assert.Single(agents, agent => agent.Id == "agent-b").DisplayName);

        var timeline = reloaded.GetTimeline(10);
        Assert.Equal(3, timeline.Count);
        Assert.Equal(new[] { firstTime, thirdTime, secondTime }, timeline.Select(item => item.OccurredAt).ToArray());
        Assert.All(timeline, item => Assert.Equal(AgentActivityEvent.StatusKind, item.Kind));
    }

    [Fact]
    public void Removal_WinsUnlessLaterUpsertExists()
    {
        using var workspace = new TempLog();
        var removed = CreateSnapshot("agent-gone", "Gone", AgentStatus.Idle, DateTimeOffset.Parse("2026-08-26T10:00:00Z"));
        var kept = CreateSnapshot("agent-kept", "Kept", AgentStatus.Working, DateTimeOffset.Parse("2026-08-26T10:01:00Z"));
        var restored = CreateSnapshot("agent-gone", "Returned", AgentStatus.Working, DateTimeOffset.Parse("2026-08-26T10:03:00Z"));

        var log = new LocalActivityLog(workspace.LogPath);
        log.Append(removed, AgentActivityEvent.FromSnapshot(removed));
        log.Append(kept, AgentActivityEvent.FromSnapshot(kept));
        log.AppendRemoval("agent-gone");

        var afterRemoval = new LocalActivityLog(workspace.LogPath);
        Assert.Equal("Kept", Assert.Single(afterRemoval.GetLatestAgents()).DisplayName);

        afterRemoval.Append(restored, AgentActivityEvent.FromSnapshot(restored));
        var afterRestore = new LocalActivityLog(workspace.LogPath);
        Assert.Equal(
            new[] { "Kept", "Returned" },
            afterRestore.GetLatestAgents().Select(agent => agent.DisplayName).ToArray());
    }

    [Fact]
    public void Cap_CompactsOldestLinesOnOverflowAndLoad()
    {
        using var workspace = new TempLog();
        var log = new LocalActivityLog(workspace.LogPath, maximumLines: 4);
        for (var index = 0; index < 6; index++)
        {
            var snapshot = CreateSnapshot(
                $"agent-{index}",
                $"Agent {index}",
                AgentStatus.Working,
                DateTimeOffset.Parse("2026-08-26T10:00:00Z").AddMinutes(index));
            log.Append(snapshot, AgentActivityEvent.FromSnapshot(snapshot));
        }

        Assert.Equal(4, CountNonEmptyLines(workspace.LogPath));
        Assert.Equal(new[] { "agent-2", "agent-3", "agent-4", "agent-5" }, log.GetLatestAgents().Select(agent => agent.Id).OrderBy(id => id).ToArray());
        Assert.Equal(4, log.GetTimeline(10).Count);
        Assert.DoesNotContain(log.GetTimeline(10), item => item.AgentId is "agent-0" or "agent-1");

        using var oversized = new TempLog();
        var writer = new LocalActivityLog(oversized.LogPath, maximumLines: 50);
        for (var index = 0; index < 6; index++)
        {
            var snapshot = CreateSnapshot(
                $"agent-{index}",
                $"Agent {index}",
                AgentStatus.Idle,
                DateTimeOffset.Parse("2026-08-26T11:00:00Z").AddMinutes(index));
            writer.Append(snapshot, AgentActivityEvent.FromSnapshot(snapshot));
        }

        Assert.Equal(6, CountNonEmptyLines(oversized.LogPath));
        var compacted = new LocalActivityLog(oversized.LogPath, maximumLines: 3);
        Assert.Equal(3, CountNonEmptyLines(oversized.LogPath));
        Assert.Equal(3, compacted.GetLatestAgents().Count);
        Assert.Equal(3, compacted.GetTimeline(10).Count);
        Assert.All(compacted.GetLatestAgents(), agent => Assert.DoesNotContain(agent.Id, new[] { "agent-0", "agent-1", "agent-2" }));
    }

    [Fact]
    public void Timeline_SerializesOnlyPrivacySafeFieldsAndDerivesKind()
    {
        using var workspace = new TempLog();
        var log = new LocalActivityLog(workspace.LogPath);
        var prompt = CreateSnapshot(
            "agent-a",
            "Alice",
            AgentStatus.Working,
            DateTimeOffset.Parse("2026-08-26T10:00:00Z"),
            currentTask: "Repo: receiving a new assignment",
            detail: "never persist this prompt or reasoning body",
            interactionKind: AgentInteractionKind.UserPrompt);
        var usesTool = CreateSnapshot(
            "agent-a",
            "Alice",
            AgentStatus.Working,
            DateTimeOffset.Parse("2026-08-26T10:01:00Z"),
            currentTask: "Repo: using tool Shell");
        var usedTool = CreateSnapshot(
            "agent-a",
            "Alice",
            AgentStatus.Working,
            DateTimeOffset.Parse("2026-08-26T10:02:00Z"),
            currentTask: "Repo: used tool ReadFile");
        var failedTool = CreateSnapshot(
            "agent-a",
            "Alice",
            AgentStatus.Error,
            DateTimeOffset.Parse("2026-08-26T10:03:00Z"),
            currentTask: "Repo: tool Delete failed");
        var response = CreateSnapshot(
            "agent-a",
            "Alice",
            AgentStatus.WaitingForUser,
            DateTimeOffset.Parse("2026-08-26T10:04:00Z"),
            interactionKind: AgentInteractionKind.AgentResponse);
        var delegated = CreateSnapshot(
            "agent-b",
            "Sub",
            AgentStatus.Working,
            DateTimeOffset.Parse("2026-08-26T10:05:00Z"),
            interactionKind: AgentInteractionKind.DelegationStarted);
        var handoff = CreateSnapshot(
            "agent-b",
            "Sub",
            AgentStatus.Completed,
            DateTimeOffset.Parse("2026-08-26T10:06:00Z"),
            interactionKind: AgentInteractionKind.HandoffCompleted);

        foreach (var snapshot in new[] { prompt, usesTool, usedTool, failedTool, response, delegated, handoff })
        {
            log.Append(snapshot, AgentActivityEvent.FromSnapshot(snapshot));
        }

        var timeline = log.GetTimeline(20);
        Assert.Equal(
            new[]
            {
                AgentActivityEvent.UserPromptKind,
                AgentActivityEvent.ToolKind,
                AgentActivityEvent.ToolKind,
                AgentActivityEvent.ToolKind,
                AgentActivityEvent.AgentResponseKind,
                AgentActivityEvent.DelegationStartedKind,
                AgentActivityEvent.HandoffCompletedKind,
            },
            timeline.Select(item => item.Kind).ToArray());
        Assert.Equal(new[] { null, "Shell", "ReadFile", "Delete", null, null, null }, timeline.Select(item => item.Tool).ToArray());

        foreach (var item in timeline)
        {
            using var document = JsonDocument.Parse(JsonSerializer.Serialize(item, JsonOptions));
            var names = document.RootElement.EnumerateObject().Select(property => property.Name).ToHashSet(StringComparer.Ordinal);
            AssertPrivacySafeTimelineFields(names);
            var json = document.RootElement.GetRawText();
            Assert.DoesNotContain("never persist this prompt or reasoning body", json, StringComparison.Ordinal);
            Assert.DoesNotContain("receiving a new assignment", json, StringComparison.Ordinal);
            Assert.DoesNotContain("using tool", json, StringComparison.Ordinal);
            Assert.DoesNotContain("used tool", json, StringComparison.Ordinal);
            Assert.DoesNotContain("failed", json, StringComparison.Ordinal);
        }

        foreach (var line in File.ReadLines(workspace.LogPath))
        {
            using var document = JsonDocument.Parse(line);
            var eventElement = document.RootElement.GetProperty("event");
            var names = eventElement.EnumerateObject().Select(property => property.Name).ToHashSet(StringComparer.Ordinal);
            AssertPrivacySafeTimelineFields(names);
        }
    }

    [Fact]
    public void Append_IsFailOpenOnIoErrors()
    {
        using var workspace = new TempLog();
        var blockedPath = Path.Combine(workspace.Folder, "blocked-as-file");
        Directory.CreateDirectory(blockedPath);
        var snapshot = CreateSnapshot("agent-a", "Alice", AgentStatus.Working, DateTimeOffset.UtcNow);
        var log = new LocalActivityLog(blockedPath);

        log.Append(snapshot, AgentActivityEvent.FromSnapshot(snapshot));
        log.AppendRemoval("agent-a");

        Assert.Empty(log.GetLatestAgents());
        Assert.Equal("agent-a", Assert.Single(log.GetTimeline(5)).AgentId);
    }

    private static void AssertPrivacySafeTimelineFields(HashSet<string> names)
    {
        var allowed = new HashSet<string>(StringComparer.Ordinal)
        {
            "agentId", "occurredAt", "kind", "status", "tool",
        };
        Assert.All(names, name => Assert.Contains(name, allowed));
        Assert.Contains("agentId", names);
        Assert.Contains("occurredAt", names);
        Assert.Contains("kind", names);
        Assert.Contains("status", names);
        Assert.DoesNotContain("currentTask", names);
        Assert.DoesNotContain("detail", names);
    }

    private static int CountNonEmptyLines(string path) =>
        File.ReadLines(path).Count(static line => !string.IsNullOrWhiteSpace(line));

    private static AgentSnapshot CreateSnapshot(
        string id,
        string displayName,
        AgentStatus status,
        DateTimeOffset lastActivityAt,
        string? currentTask = null,
        string? detail = null,
        AgentInteractionKind? interactionKind = null) =>
        new(
            id,
            displayName,
            "Developer",
            status,
            currentTask,
            detail,
            lastActivityAt,
            interactionKind: interactionKind);

    private sealed class TempLog : IDisposable
    {
        public TempLog()
        {
            Folder = Path.Combine(Path.GetTempPath(), "CursorOffice.Tests", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(Folder);
            LogPath = Path.Combine(Folder, "activity-log.ndjson");
        }

        public string Folder { get; }

        public string LogPath { get; }

        public void Dispose()
        {
            if (Directory.Exists(Folder))
            {
                Directory.Delete(Folder, true);
            }
        }
    }
}
