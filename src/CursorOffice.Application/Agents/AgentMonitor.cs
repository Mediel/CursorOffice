using CursorOffice.Application.Abstractions;
using CursorOffice.Core.Agents;

namespace CursorOffice.Application.Agents;

/// <summary>
/// Applies normalized activities to the registry and publishes resulting snapshots.
/// </summary>
public sealed class AgentMonitor(AgentRegistry registry, IAgentEventSource eventSource)
{
    public async Task RunAsync(
        Func<AgentSnapshot, CancellationToken, ValueTask> onAgentChanged,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(onAgentChanged);

        await foreach (var activity in eventSource
            .ReadAllAsync(cancellationToken)
            .WithCancellation(cancellationToken)
            .ConfigureAwait(false))
        {
            registry.TryGet(activity.AgentId, out var previous);
            if (activity.IsFallback && previous is { IsFallback: false })
            {
                // Cursor Hooks describe the actual agent loop. File timestamps are
                // only a fallback and must never resurrect work after response/stop.
                continue;
            }
            var interactionKind = activity.InteractionKind;
            if (interactionKind is null
                && activity.Kind == AgentKind.Primary
                && !string.IsNullOrWhiteSpace(activity.GenerationId)
                && !string.Equals(previous?.GenerationId, activity.GenerationId, StringComparison.Ordinal))
            {
                interactionKind = AgentInteractionKind.UserPrompt;
            }

            var sameGeneration = previous is not null
                && !string.IsNullOrWhiteSpace(activity.GenerationId)
                && string.Equals(previous.GenerationId, activity.GenerationId, StringComparison.Ordinal);
            // Cursor does not repeat every optional field on every hook. Keep the
            // last known model, and keep counters while the same generation moves
            // from response to stop, instead of erasing proven telemetry.
            var model = string.IsNullOrWhiteSpace(activity.Model)
                ? previous?.Model
                : activity.Model;
            var usage = activity.Usage ?? (sameGeneration ? previous?.Usage : null);
            var conversationTitle = string.IsNullOrWhiteSpace(activity.ConversationTitle)
                ? previous?.ConversationTitle
                : activity.ConversationTitle;

            var snapshot = new AgentSnapshot(
                activity.AgentId,
                activity.DisplayName,
                activity.Role,
                activity.Status,
                activity.CurrentTask,
                activity.Detail,
                activity.OccurredAt,
                activity.Kind,
                activity.ParentAgentId,
                activity.Workspace,
                model,
                activity.IsParallelWorker,
                activity.GenerationId,
                usage,
                interactionKind,
                activity.WorkspacePath,
                activity.IsFallback,
                activity.WindowId,
                activity.WindowLabel,
                activity.WindowCorrelation,
                conversationTitle);

            registry.Upsert(snapshot);
            await onAgentChanged(snapshot, cancellationToken).ConfigureAwait(false);
        }
    }
}
