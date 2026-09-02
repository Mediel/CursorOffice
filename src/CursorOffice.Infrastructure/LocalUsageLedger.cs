using System.Text.Json;
using CursorOffice.Core.Agents;
using CursorOffice.Core.Usage;

namespace CursorOffice.Infrastructure.Usage;

/// <summary>
/// Privacy-preserving local ledger. It stores only correlation IDs, workspace,
/// model and runtime-reported generation token counters; never prompts, model
/// output, or context-window fill.
/// </summary>
public sealed class LocalUsageLedger
{
    private const int MaximumRecords = 50_000;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
    };

    private readonly object gate = new();
    private readonly string ledgerPath;
    private readonly List<UsageRecord> records;
    private readonly Dictionary<string, int> recordIndexes;

    public LocalUsageLedger(string? ledgerPath = null)
    {
        this.ledgerPath = ledgerPath ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "CursorOffice",
            "usage-ledger.json");
        records = Load(this.ledgerPath);
        recordIndexes = BuildRecordIndexes(records);
    }

    public bool TryRecord(AgentSnapshot snapshot)
    {
        ArgumentNullException.ThrowIfNull(snapshot);
        if (snapshot.Usage is not { TotalTokens: > 0 } usage
            || string.IsNullOrWhiteSpace(snapshot.GenerationId))
        {
            return false;
        }

        lock (gate)
        {
            var key = DeduplicationKey(snapshot.Id, snapshot.GenerationId);
            if (recordIndexes.TryGetValue(key, out var existingIndex))
            {
                var existing = records[existingIndex];
                var mergedUsage = new TokenUsage(
                    Math.Max(existing.Usage.InputTokens, usage.InputTokens),
                    Math.Max(existing.Usage.OutputTokens, usage.OutputTokens),
                    Math.Max(existing.Usage.CacheReadTokens, usage.CacheReadTokens),
                    Math.Max(existing.Usage.CacheWriteTokens, usage.CacheWriteTokens));
                if (mergedUsage == existing.Usage)
                {
                    return false;
                }
                records[existingIndex] = existing with
                {
                    Workspace = string.IsNullOrWhiteSpace(snapshot.Workspace) ? existing.Workspace : snapshot.Workspace,
                    WorkspacePath = string.IsNullOrWhiteSpace(snapshot.WorkspacePath) ? existing.WorkspacePath : snapshot.WorkspacePath,
                    Model = string.IsNullOrWhiteSpace(snapshot.Model) ? existing.Model : snapshot.Model,
                    OccurredAt = snapshot.LastActivityAt,
                    Usage = mergedUsage,
                };
                TryPersist();
                return true;
            }

            records.Add(new UsageRecord(
                snapshot.Id,
                snapshot.GenerationId,
                string.IsNullOrWhiteSpace(snapshot.Workspace) ? "Unknown workspace" : snapshot.Workspace,
                string.IsNullOrWhiteSpace(snapshot.WorkspacePath) ? snapshot.Workspace : snapshot.WorkspacePath,
                string.IsNullOrWhiteSpace(snapshot.Model) ? "Unknown model" : snapshot.Model,
                snapshot.LastActivityAt,
                usage));
            recordIndexes[key] = records.Count - 1;
            if (records.Count > MaximumRecords)
            {
                var removed = records
                    .OrderBy(record => record.OccurredAt)
                    .Take(records.Count - MaximumRecords)
                    .ToArray();
                foreach (var record in removed)
                {
                    records.Remove(record);
                }
                RebuildRecordIndexes();
            }
            TryPersist();
            return true;
        }
    }

    public UsageLedgerSnapshot GetSnapshot()
    {
        lock (gate)
        {
            var total = BuildBucket("Total", records);
            var workspaces = records
                .GroupBy(record => record.WorkspacePath ?? record.Workspace, StringComparer.OrdinalIgnoreCase)
                .Select(group => BuildBucket(group.Key, group))
                .OrderByDescending(bucket => bucket.TotalTokens)
                .ThenBy(bucket => bucket.Key, StringComparer.OrdinalIgnoreCase)
                .ToArray();
            var models = records
                .GroupBy(record => record.Model, StringComparer.OrdinalIgnoreCase)
                .Select(group => BuildBucket(group.Key, group))
                .OrderByDescending(bucket => bucket.TotalTokens)
                .ThenBy(bucket => bucket.Key, StringComparer.OrdinalIgnoreCase)
                .ToArray();
            var workspaceModels = records
                .GroupBy(record => new
                {
                    Workspace = record.WorkspacePath ?? record.Workspace,
                    record.Model,
                })
                .Select(group => BuildBucket($"{group.Key.Workspace} · {group.Key.Model}", group))
                .OrderByDescending(bucket => bucket.TotalTokens)
                .ThenBy(bucket => bucket.Key, StringComparer.OrdinalIgnoreCase)
                .ToArray();
            var days = records
                .GroupBy(record => record.OccurredAt.ToLocalTime().ToString("yyyy-MM-dd"), StringComparer.Ordinal)
                .Select(group => BuildBucket(group.Key, group))
                .OrderByDescending(bucket => bucket.Key, StringComparer.Ordinal)
                .ToArray();
            return new UsageLedgerSnapshot(
                total,
                workspaces,
                models,
                workspaceModels,
                days,
                records.MaxBy(record => record.OccurredAt)?.OccurredAt);
        }
    }

    private void Persist()
    {
        var directory = Path.GetDirectoryName(ledgerPath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }
        var temporaryPath = $"{ledgerPath}.{Guid.NewGuid():N}.tmp";
        File.WriteAllText(temporaryPath, JsonSerializer.Serialize(records, JsonOptions));
        File.Move(temporaryPath, ledgerPath, true);
    }

    private void TryPersist()
    {
        try
        {
            Persist();
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            // Usage observation is fail-open; keep the in-memory projection alive.
        }
    }

    private static Dictionary<string, int> BuildRecordIndexes(IReadOnlyList<UsageRecord> source)
    {
        var result = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < source.Count; index++)
        {
            result[DeduplicationKey(source[index].AgentId, source[index].GenerationId)] = index;
        }
        return result;
    }

    private void RebuildRecordIndexes()
    {
        recordIndexes.Clear();
        foreach (var pair in BuildRecordIndexes(records))
        {
            recordIndexes[pair.Key] = pair.Value;
        }
    }

    private static List<UsageRecord> Load(string path)
    {
        try
        {
            return File.Exists(path)
                ? JsonSerializer.Deserialize<List<UsageRecord>>(File.ReadAllText(path), JsonOptions) ?? []
                : [];
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or JsonException)
        {
            return [];
        }
    }

    private static UsageBucket BuildBucket(string key, IEnumerable<UsageRecord> source)
    {
        var items = source.ToArray();
        return new UsageBucket(
            key,
            items.Sum(item => item.Usage.InputTokens),
            items.Sum(item => item.Usage.OutputTokens),
            items.Sum(item => item.Usage.CacheReadTokens),
            items.Sum(item => item.Usage.CacheWriteTokens),
            items.LongLength);
    }

    private static string DeduplicationKey(string agentId, string generationId) => $"{agentId}\u001f{generationId}";

    private sealed record UsageRecord(
        string AgentId,
        string GenerationId,
        string Workspace,
        string? WorkspacePath,
        string Model,
        DateTimeOffset OccurredAt,
        TokenUsage Usage);
}
