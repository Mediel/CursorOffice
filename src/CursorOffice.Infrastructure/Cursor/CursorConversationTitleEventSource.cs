using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using CursorOffice.Application.Abstractions;
using CursorOffice.Application.Agents;
using CursorOffice.Core.Agents;

namespace CursorOffice.Infrastructure.Cursor;

/// <summary>
/// Enriches primary agent events with the local Cursor chat title. The short
/// cache keeps hook latency low while still noticing generated or renamed titles.
/// </summary>
public sealed class CursorConversationTitleEventSource(
    IAgentEventSource source,
    CursorComposerHeaderStore headers,
    TimeProvider? timeProvider = null,
    TimeSpan? cacheLifetime = null) : IAgentEventSource
{
    private readonly TimeProvider clock = timeProvider ?? TimeProvider.System;
    private readonly TimeSpan lifetime = cacheLifetime ?? TimeSpan.FromSeconds(2);
    private readonly ConcurrentDictionary<string, CacheEntry> cache = new(StringComparer.OrdinalIgnoreCase);

    public async IAsyncEnumerable<AgentActivity> ReadAllAsync(
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        await foreach (var activity in source
            .ReadAllAsync(cancellationToken)
            .WithCancellation(cancellationToken)
            .ConfigureAwait(false))
        {
            var conversationId = GetConversationId(activity);
            if (conversationId is null)
            {
                yield return activity;
                continue;
            }

            var now = clock.GetUtcNow();
            if (!cache.TryGetValue(conversationId, out var entry) || now >= entry.ExpiresAt)
            {
                var title = await headers.TryGetTitleAsync(conversationId, cancellationToken).ConfigureAwait(false);
                entry = new CacheEntry(title, now + lifetime);
                cache[conversationId] = entry;
            }
            yield return string.IsNullOrWhiteSpace(entry.Title)
                ? activity
                : activity with { ConversationTitle = entry.Title };
        }
    }

    private static string? GetConversationId(AgentActivity activity)
    {
        const string prefix = "cursor-";
        return activity.Kind == AgentKind.Primary
            && activity.AgentId.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)
            && !activity.AgentId.StartsWith("cursor-subagent-", StringComparison.OrdinalIgnoreCase)
                ? activity.AgentId[prefix.Length..]
                : null;
    }

    private sealed record CacheEntry(string? Title, DateTimeOffset ExpiresAt);
}
