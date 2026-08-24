using System.Runtime.CompilerServices;
using CursorOffice.Application.Abstractions;
using CursorOffice.Application.Agents;
using CursorOffice.Core.Agents;

namespace CursorOffice.Infrastructure.Cursor;

/// <summary>
/// Observes only transcript file metadata (path, size and modification time).
/// Message and tool content is never opened or parsed.
/// </summary>
public sealed class CursorTranscriptAgentEventSource : IAgentEventSource
{
    private readonly string projectsDirectory;
    private readonly TimeProvider timeProvider;
    private readonly TimeSpan initialLookback;
    private readonly TimeSpan activeWindow;
    private readonly TimeSpan pollingInterval;
    private readonly Dictionary<string, ObservedTranscript> observed =
        new(StringComparer.OrdinalIgnoreCase);

    public CursorTranscriptAgentEventSource(
        string? projectsDirectory = null,
        TimeProvider? timeProvider = null,
        TimeSpan? initialLookback = null,
        TimeSpan? activeWindow = null,
        TimeSpan? pollingInterval = null)
    {
        this.projectsDirectory = projectsDirectory ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".cursor",
            "projects");
        this.timeProvider = timeProvider ?? TimeProvider.System;
        this.initialLookback = initialLookback ?? TimeSpan.FromMinutes(5);
        // Hooks are the authoritative real-time signal. Transcript timestamps are
        // only a short fallback, so they must stop claiming "working" quickly
        // after Cursor stops writing while still smoothing brief write gaps.
        this.activeWindow = activeWindow ?? TimeSpan.FromSeconds(12);
        this.pollingInterval = pollingInterval ?? TimeSpan.FromMilliseconds(300);
    }

    public async IAsyncEnumerable<AgentActivity> ReadAllAsync(
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var now = timeProvider.GetUtcNow();
            var transcripts = EnumerateRecentTranscripts(now - initialLookback).ToArray();
            var activeParentIds = transcripts
                .Where(transcript =>
                    transcript.IsSubagent
                    && transcript.ParentConversationId is not null
                    && now - transcript.LastWriteTime <= activeWindow)
                .Select(transcript => transcript.ParentConversationId!)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            foreach (var transcript in transcripts)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var isCoordinating = !transcript.IsSubagent
                    && activeParentIds.Contains(transcript.InstanceId);
                var status = isCoordinating || now - transcript.LastWriteTime <= activeWindow
                    ? AgentStatus.Working
                    : transcript.IsSubagent
                        ? AgentStatus.Completed
                        : AgentStatus.Idle;

                if (!observed.TryGetValue(transcript.Path, out var previous))
                {
                    observed[transcript.Path] = new ObservedTranscript(
                        transcript.LastWriteTime,
                        transcript.Length,
                        status,
                        isCoordinating);
                    yield return CreateActivity(
                        transcript,
                        status,
                        transcript.IsSubagent && status == AgentStatus.Working
                            ? AgentInteractionKind.DelegationStarted
                            : null,
                        isCoordinating,
                        status == AgentStatus.Working ? transcript.LastWriteTime : now);
                    continue;
                }

                if (previous.LastWriteTime != transcript.LastWriteTime
                    || previous.Length != transcript.Length)
                {
                    observed[transcript.Path] = new ObservedTranscript(
                        transcript.LastWriteTime,
                        transcript.Length,
                        AgentStatus.Working,
                        isCoordinating);
                    yield return CreateActivity(
                        transcript,
                        AgentStatus.Working,
                        isCoordinating: isCoordinating);
                    continue;
                }

                if (previous.Status != status || previous.IsCoordinating != isCoordinating)
                {
                    observed[transcript.Path] = previous with
                    {
                        Status = status,
                        IsCoordinating = isCoordinating,
                    };
                    yield return CreateActivity(
                        transcript,
                        status,
                        isCoordinating: isCoordinating,
                        occurredAt: now);
                }
            }

            await Task.Delay(pollingInterval, timeProvider, cancellationToken).ConfigureAwait(false);
        }
    }

    private IEnumerable<TranscriptDescriptor> EnumerateRecentTranscripts(DateTimeOffset cutoff)
    {
        if (!Directory.Exists(projectsDirectory))
        {
            yield break;
        }

        IEnumerable<string> projectDirectories;
        try
        {
            projectDirectories = Directory.EnumerateDirectories(projectsDirectory).ToArray();
        }
        catch (IOException)
        {
            yield break;
        }
        catch (UnauthorizedAccessException)
        {
            yield break;
        }

        foreach (var projectDirectory in projectDirectories)
        {
            var transcriptRoot = Path.Combine(projectDirectory, "agent-transcripts");
            if (!Directory.Exists(transcriptRoot))
            {
                continue;
            }

            string[] conversationDirectories;
            try
            {
                conversationDirectories = Directory.GetDirectories(transcriptRoot);
            }
            catch (IOException)
            {
                continue;
            }
            catch (UnauthorizedAccessException)
            {
                continue;
            }

            var workspace = FormatWorkspaceName(Path.GetFileName(projectDirectory));
            foreach (var conversationDirectory in conversationDirectories)
            {
                var conversationId = Path.GetFileName(conversationDirectory);
                var subagentDirectory = Path.Combine(conversationDirectory, "subagents");
                var subagents = DescribeSubagents(
                        subagentDirectory,
                        workspace,
                        conversationId,
                        cutoff)
                    .ToArray();
                var mainTranscript = Path.Combine(conversationDirectory, $"{conversationId}.jsonl");
                var main = TryDescribe(
                    mainTranscript,
                    workspace,
                    conversationId,
                    false,
                    null,
                    cutoff);

                // A harness often leaves the parent transcript untouched while its
                // subagents keep working. Include that parent even when its own file
                // is older than the startup lookback, then promote it to Working in
                // ReadAllAsync while at least one child is active.
                if (main is null && subagents.Length > 0)
                {
                    main = TryDescribe(
                        mainTranscript,
                        workspace,
                        conversationId,
                        false,
                        null,
                        DateTimeOffset.MinValue);
                }

                if (main is not null)
                {
                    yield return main;
                }
                foreach (var subagent in subagents)
                {
                    yield return subagent;
                }
            }
        }
    }

    private static IEnumerable<TranscriptDescriptor> DescribeSubagents(
        string subagentDirectory,
        string workspace,
        string conversationId,
        DateTimeOffset cutoff)
    {
        if (!Directory.Exists(subagentDirectory))
        {
            yield break;
        }

        string[] subagentTranscripts;
        try
        {
            subagentTranscripts = Directory.GetFiles(
                subagentDirectory,
                "*.jsonl",
                SearchOption.TopDirectoryOnly);
        }
        catch (IOException)
        {
            yield break;
        }
        catch (UnauthorizedAccessException)
        {
            yield break;
        }

        foreach (var subagentTranscript in subagentTranscripts)
        {
            var subagentId = Path.GetFileNameWithoutExtension(subagentTranscript);
            if (TryDescribe(
                    subagentTranscript,
                    workspace,
                    subagentId,
                    true,
                    conversationId,
                    cutoff) is { } subagent)
            {
                yield return subagent;
            }
        }
    }

    private static TranscriptDescriptor? TryDescribe(
        string path,
        string workspace,
        string instanceId,
        bool isSubagent,
        string? parentConversationId,
        DateTimeOffset cutoff)
    {
        try
        {
            var info = new FileInfo(path);
            if (!info.Exists || info.LastWriteTimeUtc < cutoff.UtcDateTime)
            {
                return null;
            }

            return new TranscriptDescriptor(
                path,
                workspace,
                instanceId,
                isSubagent,
                parentConversationId,
                info.LastWriteTimeUtc,
                info.Length);
        }
        catch (IOException)
        {
            return null;
        }
        catch (UnauthorizedAccessException)
        {
            return null;
        }
    }

    private static AgentActivity CreateActivity(
        TranscriptDescriptor transcript,
        AgentStatus status,
        AgentInteractionKind? interactionKind = null,
        bool isCoordinating = false,
        DateTimeOffset? occurredAt = null)
    {
        var shortId = transcript.InstanceId.Length > 6
            ? transcript.InstanceId[..6]
            : transcript.InstanceId;
        var kind = transcript.IsSubagent ? "Subagent" : "Agent";
        var agentId = transcript.IsSubagent
            ? $"cursor-subagent-{transcript.InstanceId}"
            : $"cursor-{transcript.InstanceId}";
        var taskState = isCoordinating
            ? "koordinuje aktivní podagenty"
            : status == AgentStatus.Working
                ? "aktivní"
                : "naposledy zaznamenaný";

        return new AgentActivity(
            agentId,
            transcript.IsSubagent ? $"Cursor {kind} {shortId}" : $"Cursor Agent {shortId}",
            $"{transcript.Workspace} · lokální {kind.ToLowerInvariant()}",
            status,
            $"{transcript.Workspace}: {taskState}",
            $"{transcript.Workspace} · sledována pouze metadata transkriptu",
            occurredAt ?? transcript.LastWriteTime,
            transcript.IsSubagent ? AgentKind.Subagent : AgentKind.Primary,
            transcript.ParentConversationId is null ? null : $"cursor-{transcript.ParentConversationId}",
            transcript.Workspace,
            InteractionKind: interactionKind,
            IsFallback: true);
    }

    private static string FormatWorkspaceName(string slug)
    {
        const string repositoriesMarker = "-source-repos-";
        var marker = slug.IndexOf(repositoriesMarker, StringComparison.OrdinalIgnoreCase);
        var projectPart = marker >= 0
            ? slug[(marker + repositoriesMarker.Length)..]
            : slug;
        var name = projectPart.Replace('-', ' ');
        var sourceSuffix = name.LastIndexOf(" Source", StringComparison.OrdinalIgnoreCase);
        if (sourceSuffix > 0)
        {
            var withoutSource = name[..sourceSuffix].TrimEnd();
            while (withoutSource.Length > 0
                && (char.IsDigit(withoutSource[^1]) || withoutSource[^1] is '.' or '_' or '-' or ' '))
            {
                withoutSource = withoutSource[..^1];
            }
            name = withoutSource;
        }
        return name.Length > 1 && char.IsLower(name[0]) && name.Skip(1).Any(char.IsUpper)
            ? $"{char.ToUpperInvariant(name[0])}{name[1..]}"
            : name;
    }

    private sealed record ObservedTranscript(
        DateTimeOffset LastWriteTime,
        long Length,
        AgentStatus Status,
        bool IsCoordinating);

    private sealed record TranscriptDescriptor(
        string Path,
        string Workspace,
        string InstanceId,
        bool IsSubagent,
        string? ParentConversationId,
        DateTimeOffset LastWriteTime,
        long Length);
}
