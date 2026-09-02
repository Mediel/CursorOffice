using CursorOffice.Core.Agents;
using CursorOffice.Infrastructure.Cursor;

namespace CursorOffice.Core.Tests;

public sealed class CursorTranscriptAgentEventSourceTests
{
    [Fact]
    public async Task CreatesDistinctActivitiesFromMainAndSubagentMetadata()
    {
        var root = Path.Combine(Path.GetTempPath(), $"cursor-office-tests-{Guid.NewGuid():N}");
        var conversationId = "conversation-123";
        var subagentId = "subagent-456";
        var conversation = Path.Combine(
            root,
            "c-Users-test-source-repos-SampleProject",
            "agent-transcripts",
            conversationId);
        var subagents = Path.Combine(conversation, "subagents");
        Directory.CreateDirectory(subagents);
        await File.WriteAllTextAsync(
            Path.Combine(conversation, $"{conversationId}.jsonl"),
            "content-is-never-read");
        await File.WriteAllTextAsync(
            Path.Combine(subagents, $"{subagentId}.jsonl"),
            "content-is-never-read");

        try
        {
            var source = new CursorTranscriptAgentEventSource(
                root,
                initialLookback: TimeSpan.FromMinutes(1),
                activeWindow: TimeSpan.FromMinutes(1),
                pollingInterval: TimeSpan.FromMilliseconds(10));
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            var activities = new List<Application.Agents.AgentActivity>();

            await foreach (var activity in source.ReadAllAsync(timeout.Token))
            {
                activities.Add(activity);
                if (activities.Count == 2)
                {
                    break;
                }
            }

            Assert.Contains(activities, activity =>
                activity.AgentId == $"cursor-{conversationId}"
                && activity.DisplayName == "Cursor Agent conver"
                && activity.Status == AgentStatus.Working
                && activity.Kind == AgentKind.Primary
                && activity.ParentAgentId is null);
            Assert.Contains(activities, activity =>
                activity.AgentId == $"cursor-subagent-{subagentId}"
                && activity.Status == AgentStatus.Working
                && activity.Kind == AgentKind.Subagent
                && activity.InteractionKind == AgentInteractionKind.DelegationStarted
                && activity.ParentAgentId == $"cursor-{conversationId}");
            Assert.All(activities, activity => Assert.Contains("SampleProject", activity.Role));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task ActiveSubagentPromotesAnOldParentTranscriptToWorkingCoordinator()
    {
        var root = Path.Combine(Path.GetTempPath(), $"cursor-office-tests-{Guid.NewGuid():N}");
        var conversationId = "old-parent-123";
        var subagentId = "active-child-456";
        var conversation = Path.Combine(
            root,
            "c-Users-test-source-repos-HarnessProject",
            "agent-transcripts",
            conversationId);
        var subagents = Path.Combine(conversation, "subagents");
        Directory.CreateDirectory(subagents);
        var parentPath = Path.Combine(conversation, $"{conversationId}.jsonl");
        await File.WriteAllTextAsync(parentPath, "content-is-never-read");
        File.SetLastWriteTimeUtc(parentPath, DateTime.UtcNow - TimeSpan.FromMinutes(10));
        await File.WriteAllTextAsync(
            Path.Combine(subagents, $"{subagentId}.jsonl"),
            "content-is-never-read");

        try
        {
            var source = new CursorTranscriptAgentEventSource(
                root,
                initialLookback: TimeSpan.FromMinutes(1),
                activeWindow: TimeSpan.FromMinutes(1),
                pollingInterval: TimeSpan.FromMilliseconds(10));
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            var activities = new List<Application.Agents.AgentActivity>();

            await foreach (var activity in source.ReadAllAsync(timeout.Token))
            {
                activities.Add(activity);
                if (activities.Count == 2)
                {
                    break;
                }
            }

            Assert.Contains(activities, activity =>
                activity.AgentId == $"cursor-{conversationId}"
                && activity.Status == AgentStatus.Working
                && activity.Kind == AgentKind.Primary
                && activity.CurrentTask == "HarnessProject: coordinating active subagents");
            Assert.Contains(activities, activity =>
                activity.AgentId == $"cursor-subagent-{subagentId}"
                && activity.Status == AgentStatus.Working
                && activity.ParentAgentId == $"cursor-{conversationId}");
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task InitialInactiveTranscriptStartsItsRetentionAtObservedTransition()
    {
        var root = Path.Combine(Path.GetTempPath(), $"cursor-office-tests-{Guid.NewGuid():N}");
        var conversationId = "inactive-parent-789";
        var conversation = Path.Combine(
            root,
            "c-Users-test-source-repos-RetentionProject",
            "agent-transcripts",
            conversationId);
        Directory.CreateDirectory(conversation);
        var transcriptPath = Path.Combine(conversation, $"{conversationId}.jsonl");
        await File.WriteAllTextAsync(transcriptPath, "content-is-never-read");
        var observedAt = DateTimeOffset.UtcNow.AddMinutes(1);
        File.SetLastWriteTimeUtc(transcriptPath, observedAt.UtcDateTime - TimeSpan.FromSeconds(30));

        try
        {
            var source = new CursorTranscriptAgentEventSource(
                root,
                new FixedTimeProvider(observedAt),
                initialLookback: TimeSpan.FromMinutes(2),
                activeWindow: TimeSpan.FromSeconds(10),
                pollingInterval: TimeSpan.FromMilliseconds(10));
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));

            await foreach (var activity in source.ReadAllAsync(timeout.Token))
            {
                Assert.Equal(AgentStatus.Idle, activity.Status);
                Assert.Equal(observedAt, activity.OccurredAt);
                break;
            }
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task FreshParentKeepsRecentlySilentSubagentWorking()
    {
        var root = Path.Combine(Path.GetTempPath(), $"cursor-office-tests-{Guid.NewGuid():N}");
        var conversationId = "parent-fresh-123";
        var subagentId = "child-quiet-456";
        var conversation = Path.Combine(
            root,
            "c-Users-test-source-repos-QuietProject",
            "agent-transcripts",
            conversationId);
        var subagents = Path.Combine(conversation, "subagents");
        Directory.CreateDirectory(subagents);
        var parentPath = Path.Combine(conversation, $"{conversationId}.jsonl");
        var childPath = Path.Combine(subagents, $"{subagentId}.jsonl");
        await File.WriteAllTextAsync(parentPath, "content-is-never-read");
        await File.WriteAllTextAsync(childPath, "content-is-never-read");
        var observedAt = DateTimeOffset.UtcNow.AddMinutes(1);
        File.SetLastWriteTimeUtc(parentPath, observedAt.UtcDateTime);
        File.SetLastWriteTimeUtc(childPath, observedAt.AddSeconds(-90).UtcDateTime);

        try
        {
            var source = new CursorTranscriptAgentEventSource(
                root,
                new FixedTimeProvider(observedAt),
                initialLookback: TimeSpan.FromMinutes(5),
                activeWindow: TimeSpan.FromSeconds(45),
                childGrace: TimeSpan.FromMinutes(5),
                pollingInterval: TimeSpan.FromMilliseconds(10));
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            var activities = new List<Application.Agents.AgentActivity>();

            await foreach (var activity in source.ReadAllAsync(timeout.Token))
            {
                activities.Add(activity);
                if (activities.Count == 2)
                {
                    break;
                }
            }

            Assert.Contains(activities, activity =>
                activity.AgentId == $"cursor-{conversationId}"
                && activity.Status == AgentStatus.Working);
            Assert.Contains(activities, activity =>
                activity.AgentId == $"cursor-subagent-{subagentId}"
                && activity.Status == AgentStatus.Working);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task StaleSubagentTranscriptFallsBackToIdleInsteadOfCompleted()
    {
        var root = Path.Combine(Path.GetTempPath(), $"cursor-office-tests-{Guid.NewGuid():N}");
        var conversationId = "parent-456";
        var subagentId = "child-789";
        var conversation = Path.Combine(
            root,
            "c-Users-test-source-repos-StaleProject",
            "agent-transcripts",
            conversationId);
        var subagents = Path.Combine(conversation, "subagents");
        Directory.CreateDirectory(subagents);
        var subagentPath = Path.Combine(subagents, $"{subagentId}.jsonl");
        await File.WriteAllTextAsync(subagentPath, "content-is-never-read");
        var observedAt = DateTimeOffset.UtcNow;
        File.SetLastWriteTimeUtc(subagentPath, observedAt.AddSeconds(-30).UtcDateTime);

        try
        {
            var source = new CursorTranscriptAgentEventSource(
                root,
                new FixedTimeProvider(observedAt),
                initialLookback: TimeSpan.FromMinutes(2),
                activeWindow: TimeSpan.FromSeconds(10),
                pollingInterval: TimeSpan.FromMilliseconds(10));
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));

            await foreach (var activity in source.ReadAllAsync(timeout.Token))
            {
                Assert.Equal($"cursor-subagent-{subagentId}", activity.AgentId);
                Assert.Equal(AgentStatus.Idle, activity.Status);
                break;
            }
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }
}
