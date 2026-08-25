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
                // Hooks own terminal lifecycle. Fallback must not undo completed,
                // offline or error. A fresh transcript write is still allowed to
                // resume working after a non-terminal hook such as afterAgentResponse
                // when preToolUse hooks did not arrive for the same generation.
                if (activity.Status != AgentStatus.Working
                    || previous.Status is AgentStatus.Completed
                        or AgentStatus.Offline
                        or AgentStatus.Error)
                {
                    continue;
                }
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

            var status = activity.Status;
            var currentTask = activity.CurrentTask;
            var detail = activity.Detail;
            if (activity.Kind == AgentKind.Primary
                && status is AgentStatus.WaitingForUser or AgentStatus.Idle or AgentStatus.Completed
                && HasWorkingChild(registry, activity.AgentId, activity.AgentId))
            {
                status = AgentStatus.Working;
                currentTask = CoordinatingTask(activity.Workspace);
                detail = CoordinatingDetail(activity.Workspace, activity.Detail);
            }

            var snapshot = new AgentSnapshot(
                activity.AgentId,
                activity.DisplayName,
                activity.Role,
                status,
                currentTask,
                detail,
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

            if (snapshot.Kind == AgentKind.Subagent
                && snapshot.Status == AgentStatus.Working
                && snapshot.ParentAgentId is not null
                && TryPromoteParent(registry, snapshot, out var parent))
            {
                await onAgentChanged(parent, cancellationToken).ConfigureAwait(false);
            }
        }
    }

    private static bool TryPromoteParent(
        AgentRegistry registry,
        AgentSnapshot child,
        out AgentSnapshot parent)
    {
        parent = null!;
        if (!registry.TryGet(child.ParentAgentId!, out var existing) || existing is null)
        {
            return false;
        }
        if (existing.Status is AgentStatus.Offline or AgentStatus.Error)
        {
            return false;
        }
        if (existing.Status == AgentStatus.Working
            && string.Equals(existing.CurrentTask, CoordinatingTask(existing.Workspace), StringComparison.Ordinal))
        {
            return false;
        }

        parent = new AgentSnapshot(
            existing.Id,
            existing.DisplayName,
            existing.Role,
            AgentStatus.Working,
            CoordinatingTask(existing.Workspace),
            CoordinatingDetail(existing.Workspace, existing.Detail),
            child.LastActivityAt,
            existing.Kind,
            existing.ParentAgentId,
            existing.Workspace,
            existing.Model,
            existing.IsParallelWorker,
            existing.GenerationId,
            existing.Usage,
            existing.InteractionKind,
            existing.WorkspacePath,
            existing.IsFallback,
            existing.WindowId,
            existing.WindowLabel,
            existing.WindowCorrelation,
            existing.ConversationTitle);
        registry.Upsert(parent);
        return true;
    }

    private static bool HasWorkingChild(AgentRegistry registry, string parentId, string excludingId) =>
        registry.GetSnapshot().Any(agent =>
            string.Equals(agent.ParentAgentId, parentId, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(agent.Id, excludingId, StringComparison.OrdinalIgnoreCase)
            && agent.Status == AgentStatus.Working);

    private static string CoordinatingTask(string? workspace) =>
        $"{workspace ?? "Cursor workspace"}: koordinuje aktivní podagenty";

    private static string CoordinatingDetail(string? workspace, string? previous) =>
        previous is null
            ? $"{workspace ?? "Cursor workspace"} · rodič aktivního podagenta"
            : previous;
}
