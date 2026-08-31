using System.Text.Json;
using System.Text.Json.Serialization;
using CursorOffice.Core.Agents;

namespace CursorOffice.Infrastructure.Activity;

/// <summary>
/// Append-only local activity log. Persists the last <see cref="AgentSnapshot"/> per agent
/// for restore and a slim privacy-safe timeline. Never rewrites the file on the hot path.
/// </summary>
public sealed class LocalActivityLog
{
    public const int DefaultMaximumLines = 10_000;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    private readonly object gate = new();
    private readonly string logPath;
    private readonly int maximumLines;
    private readonly List<LogRecord> records;
    private readonly Dictionary<string, AgentSnapshot> latestAgents =
        new(StringComparer.OrdinalIgnoreCase);
    private readonly List<AgentActivityEvent> timeline = [];

    public LocalActivityLog(string? logPath = null, int maximumLines = DefaultMaximumLines)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(maximumLines);
        this.logPath = logPath ?? DefaultLogPath;
        this.maximumLines = maximumLines;
        records = Load(this.logPath);
        if (records.Count > this.maximumLines)
        {
            Compact();
        }
        else
        {
            RebuildProjections();
        }
    }

    public static string DefaultLogPath { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "CursorOffice",
        "activity-log.ndjson");

    public string LogPath => logPath;

    public void Append(AgentSnapshot snapshot, AgentActivityEvent activity)
    {
        ArgumentNullException.ThrowIfNull(snapshot);
        ArgumentNullException.ThrowIfNull(activity);

        var occurredAt = activity.OccurredAt == default
            ? snapshot.LastActivityAt
            : activity.OccurredAt;
        var stored = AgentActivityEvent.FromSnapshot(snapshot) with { OccurredAt = occurredAt };
        var record = new LogRecord("upsert", snapshot.Id, occurredAt, snapshot, stored);

        lock (gate)
        {
            records.Add(record);
            Apply(record);
            TryAppend(record);
            if (records.Count > maximumLines)
            {
                Compact();
            }
        }
    }

    public void AppendRemoval(string id)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        var record = new LogRecord("removed", id, DateTimeOffset.UtcNow);

        lock (gate)
        {
            records.Add(record);
            Apply(record);
            TryAppend(record);
            if (records.Count > maximumLines)
            {
                Compact();
            }
        }
    }

    public IReadOnlyList<AgentSnapshot> GetLatestAgents()
    {
        lock (gate)
        {
            return latestAgents.Values
                .OrderBy(agent => agent.DisplayName, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }
    }

    public IReadOnlyList<AgentActivityEvent> GetTimeline(int limit)
    {
        if (limit <= 0)
        {
            return [];
        }

        lock (gate)
        {
            if (timeline.Count <= limit)
            {
                return timeline.ToArray();
            }

            return timeline.Skip(timeline.Count - limit).ToArray();
        }
    }

    private void Apply(LogRecord record)
    {
        if (string.Equals(record.Type, "removed", StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(record.AgentId))
        {
            latestAgents.Remove(record.AgentId);
            return;
        }

        if (record.Snapshot is { } snapshot)
        {
            latestAgents[snapshot.Id] = snapshot;
        }

        if (record.Event is { } activity)
        {
            var insertAt = timeline.Count;
            while (insertAt > 0 && timeline[insertAt - 1].OccurredAt > activity.OccurredAt)
            {
                insertAt--;
            }

            timeline.Insert(insertAt, activity);
        }
    }

    private void RebuildProjections()
    {
        latestAgents.Clear();
        timeline.Clear();
        foreach (var record in records)
        {
            Apply(record);
        }
    }

    private void Compact()
    {
        var overflow = records.Count - maximumLines;
        if (overflow > 0)
        {
            records.RemoveRange(0, overflow);
        }

        RebuildProjections();
        TryRewrite();
    }

    private void TryAppend(LogRecord record)
    {
        try
        {
            EnsureDirectory();
            File.AppendAllText(logPath, JsonSerializer.Serialize(record, JsonOptions) + "\n");
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            // Activity observation is fail-open; keep the in-memory projection alive.
        }
    }

    private void TryRewrite()
    {
        try
        {
            EnsureDirectory();
            var temporaryPath = $"{logPath}.{Guid.NewGuid():N}.tmp";
            File.WriteAllLines(
                temporaryPath,
                records.Select(record => JsonSerializer.Serialize(record, JsonOptions)));
            File.Move(temporaryPath, logPath, true);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            // Compaction is fail-open; keep the in-memory projection alive.
        }
    }

    private void EnsureDirectory()
    {
        var directory = Path.GetDirectoryName(logPath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }
    }

    private static List<LogRecord> Load(string path)
    {
        try
        {
            if (!File.Exists(path))
            {
                return [];
            }

            var loaded = new List<LogRecord>();
            foreach (var line in File.ReadLines(path))
            {
                if (string.IsNullOrWhiteSpace(line))
                {
                    continue;
                }

                try
                {
                    var record = JsonSerializer.Deserialize<LogRecord>(line, JsonOptions);
                    if (record is not null)
                    {
                        loaded.Add(record);
                    }
                }
                catch (JsonException)
                {
                    // Skip a corrupt line; the rest of the log remains usable.
                }
            }

            return loaded;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or JsonException)
        {
            return [];
        }
    }

    private sealed record LogRecord(
        string Type,
        string? AgentId = null,
        DateTimeOffset? OccurredAt = null,
        AgentSnapshot? Snapshot = null,
        AgentActivityEvent? Event = null);
}
