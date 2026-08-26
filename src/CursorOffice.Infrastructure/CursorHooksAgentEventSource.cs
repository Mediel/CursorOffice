using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using CursorOffice.Application.Abstractions;
using CursorOffice.Application.Agents;
using CursorOffice.Core.Agents;
using CursorOffice.Core.Usage;

namespace CursorOffice.Infrastructure.Cursor;

/// <summary>
/// Broadcasts privacy-filtered Cursor hook events from a local, per-user file spool.
/// Every host instance keeps its own in-memory cursor; files are retained briefly
/// so several Cursor windows can observe the same event instead of racing to delete it.
/// </summary>
public sealed class CursorHooksAgentEventSource : IAgentEventSource
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    private readonly string eventDirectory;
    private readonly TimeSpan pollingInterval;
    private readonly TimeSpan retention;
    private readonly DateTime initialCutoffUtc;
    private readonly HashSet<string> observedFiles = new(StringComparer.OrdinalIgnoreCase);

    public CursorHooksAgentEventSource(
        string? eventDirectory = null,
        TimeSpan? pollingInterval = null,
        TimeSpan? retention = null,
        TimeSpan? initialLookback = null)
    {
        this.eventDirectory = eventDirectory ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "CursorOffice",
            "events-v3");
        this.pollingInterval = pollingInterval ?? TimeSpan.FromMilliseconds(150);
        this.retention = retention ?? TimeSpan.FromMinutes(10);
        initialCutoffUtc = DateTime.UtcNow - (initialLookback ?? TimeSpan.FromMinutes(2));
    }

    public async IAsyncEnumerable<AgentActivity> ReadAllAsync(
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(eventDirectory);

        while (!cancellationToken.IsCancellationRequested)
        {
            var nowUtc = DateTime.UtcNow;
            var eventFiles = Directory
                .EnumerateFiles(eventDirectory, "*.json", SearchOption.TopDirectoryOnly)
                .OrderBy(File.GetCreationTimeUtc)
                .ToArray();

            foreach (var eventFile in eventFiles)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var lastWriteUtc = File.GetLastWriteTimeUtc(eventFile);
                if (lastWriteUtc < nowUtc - retention)
                {
                    TryDeleteExpired(eventFile);
                    observedFiles.Remove(eventFile);
                    continue;
                }
                if (!observedFiles.Add(eventFile) || lastWriteUtc < initialCutoffUtc)
                {
                    continue;
                }
                var activity = await TryReadAsync(eventFile, cancellationToken).ConfigureAwait(false);
                if (activity is not null)
                {
                    yield return activity;
                }
            }

            await Task.Delay(pollingInterval, cancellationToken).ConfigureAwait(false);
        }
    }

    private static void TryDeleteExpired(string eventFile)
    {
        try
        {
            File.Delete(eventFile);
        }
        catch (IOException)
        {
            // Another host may be reading or cleaning the same retained event.
        }
        catch (UnauthorizedAccessException)
        {
            // A passive telemetry source must never stop the host over cleanup.
        }
    }

    private static async Task<AgentActivity?> TryReadAsync(
        string eventFile,
        CancellationToken cancellationToken)
    {
        try
        {
            await using var stream = new FileStream(
                eventFile,
                FileMode.Open,
                FileAccess.Read,
                FileShare.Read,
                bufferSize: 4096,
                useAsync: true);
            var hookEvent = await JsonSerializer
                .DeserializeAsync<CursorHookEvent>(stream, JsonOptions, cancellationToken)
                .ConfigureAwait(false);

            return hookEvent is null
                ? null
                : new AgentActivity(
                    hookEvent.AgentId,
                    hookEvent.DisplayName,
                    hookEvent.Role,
                    hookEvent.Status,
                    hookEvent.CurrentTask,
                    hookEvent.Detail,
                    hookEvent.OccurredAt,
                    hookEvent.Kind,
                    hookEvent.ParentAgentId,
                    hookEvent.Workspace,
                    hookEvent.Model,
                    hookEvent.IsParallelWorker,
                    hookEvent.GenerationId,
                    hookEvent.Usage,
                    hookEvent.InteractionKind,
                    hookEvent.WorkspacePath,
                    false,
                    hookEvent.WindowId,
                    hookEvent.WindowLabel,
                    hookEvent.WindowCorrelation,
                    ModelParams: hookEvent.ModelParams,
                    ContextUsage: hookEvent.ContextUsage);
        }
        catch (IOException)
        {
            return null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private sealed record CursorHookEvent(
        string AgentId,
        string DisplayName,
        string Role,
        AgentStatus Status,
        string? CurrentTask,
        string? Detail,
        DateTimeOffset OccurredAt,
        AgentKind Kind = AgentKind.Primary,
        string? ParentAgentId = null,
        string? Workspace = null,
        string? Model = null,
        bool IsParallelWorker = false,
        string? GenerationId = null,
        TokenUsage? Usage = null,
        ModelParams? ModelParams = null,
        ContextUsage? ContextUsage = null,
        AgentInteractionKind? InteractionKind = null,
        string? WorkspacePath = null,
        string? WindowId = null,
        string? WindowLabel = null,
        AgentWindowCorrelation? WindowCorrelation = null);
}
