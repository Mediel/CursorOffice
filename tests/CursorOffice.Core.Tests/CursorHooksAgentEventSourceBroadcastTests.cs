using CursorOffice.Application.Abstractions;
using CursorOffice.Application.Agents;
using CursorOffice.Core.Agents;
using CursorOffice.Infrastructure.Cursor;

namespace CursorOffice.Core.Tests;

public sealed class CursorHooksAgentEventSourceBroadcastTests
{
    [Fact]
    public async Task SameHookEventIsObservedByTwoConcurrentHostSources()
    {
        var root = Path.Combine(Path.GetTempPath(), $"cursor-office-hook-broadcast-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        var eventPath = Path.Combine(root, "event.json");
        await File.WriteAllTextAsync(eventPath, $$"""
            {
              "agentId": "cursor-conversation-1",
              "displayName": "Cursor Agent",
              "role": "Sample · agent",
              "status": "working",
              "currentTask": "Sample: analyzuje další krok",
              "detail": "Sample · test",
              "occurredAt": "{{DateTimeOffset.UtcNow:O}}",
              "kind": "primary",
              "workspace": "Sample",
              "workspacePath": "C:\\\\work\\\\Sample",
              "model": "grok-4.6",
              "generationId": "generation-1",
              "usage": {
                "inputTokens": 120,
                "outputTokens": 20,
                "cacheReadTokens": 30,
                "cacheWriteTokens": 5
              }
            }
            """);

        try
        {
            var firstSource = CreateSource(root);
            var secondSource = CreateSource(root);
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));

            var activities = await Task.WhenAll(
                ReadOneAsync(firstSource, timeout.Token),
                ReadOneAsync(secondSource, timeout.Token));

            Assert.All(activities, activity =>
            {
                Assert.Equal("cursor-conversation-1", activity.AgentId);
                Assert.Equal(AgentStatus.Working, activity.Status);
                Assert.Equal("grok-4.6", activity.Model);
                Assert.Equal(175, activity.Usage?.TotalTokens);
            });
            Assert.True(File.Exists(eventPath));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static CursorHooksAgentEventSource CreateSource(string root) => new(
        root,
        pollingInterval: TimeSpan.FromMilliseconds(10),
        retention: TimeSpan.FromMinutes(1),
        initialLookback: TimeSpan.FromMinutes(1));

    private static async Task<AgentActivity> ReadOneAsync(
        IAgentEventSource source,
        CancellationToken cancellationToken)
    {
        await foreach (var activity in source.ReadAllAsync(cancellationToken))
        {
            return activity;
        }
        throw new InvalidOperationException("The event source ended before producing an activity.");
    }
}
