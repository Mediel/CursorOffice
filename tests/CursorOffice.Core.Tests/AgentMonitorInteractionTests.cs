using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using CursorOffice.Application.Abstractions;
using CursorOffice.Application.Agents;
using CursorOffice.Core.Agents;
using CursorOffice.Core.Usage;

namespace CursorOffice.Core.Tests;

public sealed class AgentMonitorInteractionTests
{
    [Fact]
    public async Task MarksOnlyTheFirstEventOfANewPrimaryGenerationAsAUserPrompt()
    {
        var firstGeneration = Activity("generation-1", AgentStatus.Working);
        var sameGeneration = Activity("generation-1", AgentStatus.WaitingForUser);
        var nextGeneration = Activity("generation-2", AgentStatus.Working);
        var monitor = new AgentMonitor(
            new AgentRegistry(),
            new StubEventSource([firstGeneration, sameGeneration, nextGeneration]));
        var snapshots = new List<AgentSnapshot>();

        await monitor.RunAsync(
            (snapshot, _) =>
            {
                snapshots.Add(snapshot);
                return ValueTask.CompletedTask;
            },
            CancellationToken.None);

        Assert.Equal(AgentInteractionKind.UserPrompt, snapshots[0].InteractionKind);
        Assert.Null(snapshots[1].InteractionKind);
        Assert.Equal(AgentInteractionKind.UserPrompt, snapshots[2].InteractionKind);
    }

    [Fact]
    public async Task FallbackIdleCanDowngradeHookWorkingWhenStopHookIsMissing()
    {
        var now = DateTimeOffset.UtcNow;
        var precise = Activity("generation-1", AgentStatus.Working) with
        {
            OccurredAt = now,
        };
        var fallback = Activity("generation-1", AgentStatus.Idle) with
        {
            OccurredAt = now.AddMinutes(3),
            IsFallback = true,
        };
        var monitor = new AgentMonitor(
            new AgentRegistry(),
            new StubEventSource([precise, fallback]));
        var snapshots = new List<AgentSnapshot>();

        await monitor.RunAsync(
            (snapshot, _) =>
            {
                snapshots.Add(snapshot);
                return ValueTask.CompletedTask;
            },
            CancellationToken.None);

        Assert.Equal(2, snapshots.Count);
        Assert.Equal(AgentStatus.Working, snapshots[0].Status);
        Assert.Equal(AgentStatus.Idle, snapshots[1].Status);
        Assert.True(snapshots[1].IsFallback);
    }

    [Fact]
    public async Task FreshTranscriptActivityCanResumeWorkingAfterNonTerminalHookState()
    {
        var now = DateTimeOffset.UtcNow;
        var precise = Activity("generation-1", AgentStatus.WaitingForUser) with
        {
            OccurredAt = now,
        };
        var fallback = Activity("generation-1", AgentStatus.Working) with
        {
            OccurredAt = now.AddSeconds(1),
            IsFallback = true,
        };
        var monitor = new AgentMonitor(
            new AgentRegistry(),
            new StubEventSource([precise, fallback]));
        var snapshots = new List<AgentSnapshot>();

        await monitor.RunAsync(
            (snapshot, _) =>
            {
                snapshots.Add(snapshot);
                return ValueTask.CompletedTask;
            },
            CancellationToken.None);

        Assert.Equal(2, snapshots.Count);
        Assert.Equal(AgentStatus.WaitingForUser, snapshots[0].Status);
        Assert.Equal(AgentStatus.Working, snapshots[1].Status);
        Assert.True(snapshots[1].IsFallback);
    }

    [Fact]
    public async Task StaleTranscriptDoesNotResurrectTerminalHookState()
    {
        var now = DateTimeOffset.UtcNow;
        var precise = Activity("generation-1", AgentStatus.Completed) with
        {
            OccurredAt = now,
        };
        var fallback = Activity("generation-1", AgentStatus.Working) with
        {
            OccurredAt = now.AddSeconds(-30),
            IsFallback = true,
        };
        var monitor = new AgentMonitor(
            new AgentRegistry(),
            new StubEventSource([precise, fallback]));
        var snapshots = new List<AgentSnapshot>();

        await monitor.RunAsync(
            (snapshot, _) =>
            {
                snapshots.Add(snapshot);
                return ValueTask.CompletedTask;
            },
            CancellationToken.None);

        var only = Assert.Single(snapshots);
        Assert.Equal(AgentStatus.Completed, only.Status);
        Assert.False(only.IsFallback);
    }

    [Fact]
    public async Task NewerTranscriptWriteCanResumeWorkingAfterTerminalHook()
    {
        var now = DateTimeOffset.UtcNow;
        var precise = Activity("generation-1", AgentStatus.Completed) with
        {
            OccurredAt = now,
        };
        var fallback = Activity("generation-2", AgentStatus.Working) with
        {
            OccurredAt = now.AddSeconds(5),
            IsFallback = true,
        };
        var monitor = new AgentMonitor(
            new AgentRegistry(),
            new StubEventSource([precise, fallback]));
        var snapshots = new List<AgentSnapshot>();

        await monitor.RunAsync(
            (snapshot, _) =>
            {
                snapshots.Add(snapshot);
                return ValueTask.CompletedTask;
            },
            CancellationToken.None);

        Assert.Equal(2, snapshots.Count);
        Assert.Equal(AgentStatus.Completed, snapshots[0].Status);
        Assert.Equal(AgentStatus.Working, snapshots[1].Status);
        Assert.True(snapshots[1].IsFallback);
    }

    [Fact]
    public async Task TranscriptFallbackDoesNotResurrectOfflineAgentBoundToTheSameWindow()
    {
        var now = DateTimeOffset.UtcNow;
        var offline = Activity("generation-1", AgentStatus.Offline) with
        {
            OccurredAt = now,
            WindowId = "cursor-window-dead",
        };
        var fallback = Activity("generation-2", AgentStatus.Working) with
        {
            OccurredAt = now.AddSeconds(5),
            IsFallback = true,
        };
        var monitor = new AgentMonitor(
            new AgentRegistry(),
            new StubEventSource([offline, fallback]));
        var snapshots = new List<AgentSnapshot>();

        await monitor.RunAsync(
            (snapshot, _) =>
            {
                snapshots.Add(snapshot);
                return ValueTask.CompletedTask;
            },
            CancellationToken.None);

        var only = Assert.Single(snapshots);
        Assert.Equal(AgentStatus.Offline, only.Status);
        Assert.False(only.IsFallback);
    }

    [Fact]
    public async Task TranscriptFallbackWithANewWindowCanResumeAfterOffline()
    {
        var now = DateTimeOffset.UtcNow;
        var offline = Activity("generation-1", AgentStatus.Offline) with
        {
            OccurredAt = now,
            WindowId = "cursor-window-dead",
        };
        var fallback = Activity("generation-2", AgentStatus.Working) with
        {
            OccurredAt = now.AddSeconds(5),
            IsFallback = true,
            WindowId = "cursor-window-live",
        };
        var monitor = new AgentMonitor(
            new AgentRegistry(),
            new StubEventSource([offline, fallback]));
        var snapshots = new List<AgentSnapshot>();

        await monitor.RunAsync(
            (snapshot, _) =>
            {
                snapshots.Add(snapshot);
                return ValueTask.CompletedTask;
            },
            CancellationToken.None);

        Assert.Equal(2, snapshots.Count);
        Assert.Equal(AgentStatus.Working, snapshots[1].Status);
        Assert.Equal("cursor-window-live", snapshots[1].WindowId);
    }

    [Fact]
    public async Task WorkingChildKeepsParentFromWaitingForUser()
    {
        var child = new AgentActivity(
            "cursor-subagent-child",
            "General Purpose child",
            "CursorOffice · Subagent",
            AgentStatus.Working,
            "CursorOffice: active",
            null,
            DateTimeOffset.UtcNow,
            AgentKind.Subagent,
            "primary-agent");
        var parentWaiting = Activity("generation-1", AgentStatus.WaitingForUser);
        var monitor = new AgentMonitor(
            new AgentRegistry(),
            new StubEventSource([child, parentWaiting]));
        var snapshots = new List<AgentSnapshot>();

        await monitor.RunAsync(
            (snapshot, _) =>
            {
                snapshots.Add(snapshot);
                return ValueTask.CompletedTask;
            },
            CancellationToken.None);

        Assert.Contains(snapshots, snapshot =>
            snapshot.Id == "primary-agent" && snapshot.Status == AgentStatus.Working);
        Assert.DoesNotContain(snapshots, snapshot =>
            snapshot.Id == "primary-agent" && snapshot.Status == AgentStatus.WaitingForUser);
    }

    [Fact]
    public async Task WorkingChildPromotesExistingParentToCoordinator()
    {
        var parent = Activity("generation-1", AgentStatus.WaitingForUser);
        var child = new AgentActivity(
            "cursor-subagent-child",
            "General Purpose child",
            "CursorOffice · Subagent",
            AgentStatus.Working,
            "CursorOffice: active",
            null,
            DateTimeOffset.UtcNow,
            AgentKind.Subagent,
            "primary-agent");
        var monitor = new AgentMonitor(
            new AgentRegistry(),
            new StubEventSource([parent, child]));
        var snapshots = new List<AgentSnapshot>();

        await monitor.RunAsync(
            (snapshot, _) =>
            {
                snapshots.Add(snapshot);
                return ValueTask.CompletedTask;
            },
            CancellationToken.None);

        Assert.Equal(AgentStatus.WaitingForUser, snapshots[0].Status);
        Assert.Contains(snapshots, snapshot =>
            snapshot.Id == "primary-agent"
            && snapshot.Status == AgentStatus.Working
            && snapshot.CurrentTask == "Cursor workspace: coordinating active subagents");
    }

    [Fact]
    public async Task LaterHookWithoutTelemetryKeepsProvenValuesOfTheSameGeneration()
    {
        var usage = new TokenUsage(80, 20, 10, 5);
        var modelParams = new ModelParams("true", "max", "1m");
        var contextUsage = new ContextUsage(120000, 128000, 85);
        var proven = Activity("generation-1", AgentStatus.Working) with
        {
            Model = "claude-opus-4-7",
            ModelParams = modelParams,
            Usage = usage,
            ContextUsage = contextUsage,
        };
        var later = Activity("generation-1", AgentStatus.WaitingForUser);
        var monitor = new AgentMonitor(
            new AgentRegistry(),
            new StubEventSource([proven, later]));
        var snapshots = new List<AgentSnapshot>();

        await monitor.RunAsync(
            (snapshot, _) =>
            {
                snapshots.Add(snapshot);
                return ValueTask.CompletedTask;
            },
            CancellationToken.None);

        var actual = Assert.Single(snapshots, snapshot => snapshot.Status == AgentStatus.WaitingForUser);
        Assert.Equal("claude-opus-4-7", actual.Model);
        Assert.Equal(modelParams, actual.ModelParams);
        Assert.Equal(usage, actual.Usage);
        Assert.Equal(contextUsage, actual.ContextUsage);
        Assert.Null(later.Model);
        Assert.Null(later.Usage);
        Assert.Null(later.ModelParams);
        Assert.Null(later.ContextUsage);
    }

    [Fact]
    public async Task PreToolUseAndAfterAgentThoughtAfterAgentResponseReturnPrimaryToWorking()
    {
        var response = Activity("generation-1", AgentStatus.WaitingForUser) with
        {
            InteractionKind = AgentInteractionKind.AgentResponse,
        };
        var preToolUse = Activity("generation-1", AgentStatus.Working);
        var laterResponse = Activity("generation-1", AgentStatus.WaitingForUser) with
        {
            InteractionKind = AgentInteractionKind.AgentResponse,
        };
        var afterAgentThought = Activity("generation-1", AgentStatus.Working);
        var monitor = new AgentMonitor(
            new AgentRegistry(),
            new StubEventSource([response, preToolUse, laterResponse, afterAgentThought]));
        var snapshots = new List<AgentSnapshot>();

        await monitor.RunAsync(
            (snapshot, _) =>
            {
                snapshots.Add(snapshot);
                return ValueTask.CompletedTask;
            },
            CancellationToken.None);

        Assert.Equal(AgentStatus.WaitingForUser, snapshots[0].Status);
        Assert.Equal(AgentStatus.Working, snapshots[1].Status);
        Assert.Equal(AgentStatus.WaitingForUser, snapshots[2].Status);
        Assert.Equal(AgentStatus.Working, snapshots[3].Status);
    }

    [Fact]
    public async Task AgentChangedSerializesTelemetryCamelCaseAtProtocolVersion1()
    {
        var snapshot = new AgentSnapshot(
            "primary-agent",
            "Primary Agent",
            "Cursor chat",
            AgentStatus.Working,
            "CursorOffice: active",
            null,
            DateTimeOffset.Parse("2026-08-25T10:00:00Z"),
            model: "claude-opus-4-7",
            generationId: "generation-1",
            usage: new TokenUsage(10, 4, 2, 1),
            modelParams: new ModelParams("true", "max", "1m"),
            contextUsage: new ContextUsage(120000, 128000, 85));
        var envelope = new ProtocolTestEnvelope(1, "agent.changed", snapshot.LastActivityAt, snapshot);
        var json = JsonSerializer.Serialize(envelope, ProtocolJsonOptions);
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        var payload = root.GetProperty("payload");

        Assert.Equal(1, root.GetProperty("protocolVersion").GetInt32());
        Assert.Equal("agent.changed", root.GetProperty("type").GetString());
        Assert.False(root.TryGetProperty("ProtocolVersion", out _));
        Assert.Equal("claude-opus-4-7", payload.GetProperty("model").GetString());
        Assert.Equal("true", payload.GetProperty("modelParams").GetProperty("thinking").GetString());
        Assert.Equal("max", payload.GetProperty("modelParams").GetProperty("effort").GetString());
        Assert.Equal("1m", payload.GetProperty("modelParams").GetProperty("context").GetString());
        Assert.Equal(10, payload.GetProperty("usage").GetProperty("inputTokens").GetInt64());
        Assert.Equal(17, payload.GetProperty("usage").GetProperty("totalTokens").GetInt64());
        Assert.Equal(120000, payload.GetProperty("contextUsage").GetProperty("contextTokens").GetInt64());
        Assert.Equal(85, payload.GetProperty("contextUsage").GetProperty("contextUsagePercent").GetDouble());
        Assert.False(payload.TryGetProperty("ModelParams", out _));
        Assert.False(payload.TryGetProperty("ContextUsage", out _));
        Assert.False(payload.GetProperty("usage").TryGetProperty("contextTokens", out _));
    }

    private static readonly JsonSerializerOptions ProtocolJsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    private sealed record ProtocolTestEnvelope(
        int ProtocolVersion,
        string Type,
        DateTimeOffset OccurredAt,
        AgentSnapshot Payload);

    private static AgentActivity Activity(string generationId, AgentStatus status) => new(
        AgentId: "primary-agent",
        DisplayName: "Primary Agent",
        Role: "Cursor chat",
        Status: status,
        CurrentTask: null,
        Detail: null,
        OccurredAt: DateTimeOffset.UtcNow,
        GenerationId: generationId);

    private sealed class StubEventSource(IReadOnlyList<AgentActivity> activities) : IAgentEventSource
    {
        public async IAsyncEnumerable<AgentActivity> ReadAllAsync(
            [EnumeratorCancellation] CancellationToken cancellationToken)
        {
            foreach (var activity in activities)
            {
                cancellationToken.ThrowIfCancellationRequested();
                yield return activity;
                await Task.Yield();
            }
        }
    }
}
