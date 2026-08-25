using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

/// <summary>
/// Cursor currently fires <c>subagentStart</c> in the parent conversation and later
/// tool hooks under a fresh <c>conversation_id</c> with no parent link. This store
/// remembers the start and binds later tool activity to the same worker doll.
/// </summary>
public sealed class SubagentSessionStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly TimeSpan BindingLifetime = TimeSpan.FromMinutes(30);
    private readonly string directory;

    public SubagentSessionStore(string? rootDirectory = null)
    {
        var root = rootDirectory ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "CursorOffice");
        directory = Path.Combine(root, "subagent-sessions-v1");
    }

    public SubagentSessionBinding RememberStart(
        string subagentId,
        string parentConversationId,
        string workspace,
        DateTimeOffset now)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(subagentId);
        ArgumentException.ThrowIfNullOrWhiteSpace(parentConversationId);

        var binding = new SubagentSessionBinding(
            subagentId,
            parentConversationId,
            ChildConversationId: null,
            workspace,
            now);
        TryWrite(binding);
        return binding;
    }

    public SubagentSessionBinding? Resolve(
        string conversationId,
        string? parentConversationId,
        string? transcriptPath,
        string workspace,
        DateTimeOffset now)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(conversationId);

        var fromChild = TryReadByChild(conversationId);
        if (fromChild is not null && now - fromChild.StartedAt <= BindingLifetime)
        {
            return fromChild;
        }

        var transcriptId = TranscriptSubagentId(transcriptPath);
        if (!string.IsNullOrWhiteSpace(transcriptId))
        {
            var fromTranscript = TryReadBySubagent(transcriptId)
                ?? new SubagentSessionBinding(
                    transcriptId,
                    parentConversationId ?? conversationId,
                    conversationId,
                    workspace,
                    now);
            return RememberChild(fromTranscript, conversationId, now);
        }

        var distinctParent = !string.IsNullOrWhiteSpace(parentConversationId)
            && !string.Equals(parentConversationId, conversationId, StringComparison.OrdinalIgnoreCase);
        if (distinctParent)
        {
            var fromParent = FindPending(parentConversationId!, workspace, now)
                ?? new SubagentSessionBinding(
                    conversationId,
                    parentConversationId!,
                    conversationId,
                    workspace,
                    now);
            return RememberChild(fromParent, conversationId, now);
        }

        var fromKnownId = TryReadBySubagent(conversationId);
        if (fromKnownId is not null && now - fromKnownId.StartedAt <= BindingLifetime)
        {
            return RememberChild(fromKnownId, conversationId, now);
        }

        var pending = FindPendingInWorkspace(workspace, now);
        return pending is null ? null : RememberChild(pending, conversationId, now);
    }

    private SubagentSessionBinding RememberChild(
        SubagentSessionBinding binding,
        string childConversationId,
        DateTimeOffset now)
    {
        var next = binding with
        {
            ChildConversationId = childConversationId,
            StartedAt = binding.StartedAt == default ? now : binding.StartedAt,
        };
        TryWrite(next);
        return next;
    }

    private SubagentSessionBinding? FindPending(string parentConversationId, string workspace, DateTimeOffset now)
    {
        return ReadAll()
            .Where(binding =>
                string.Equals(binding.ParentConversationId, parentConversationId, StringComparison.OrdinalIgnoreCase)
                && string.Equals(binding.Workspace, workspace, StringComparison.OrdinalIgnoreCase)
                && string.IsNullOrWhiteSpace(binding.ChildConversationId)
                && now - binding.StartedAt <= BindingLifetime)
            .OrderByDescending(binding => binding.StartedAt)
            .FirstOrDefault();
    }

    private SubagentSessionBinding? FindPendingInWorkspace(string workspace, DateTimeOffset now)
    {
        var pending = ReadAll()
            .Where(binding =>
                string.Equals(binding.Workspace, workspace, StringComparison.OrdinalIgnoreCase)
                && string.IsNullOrWhiteSpace(binding.ChildConversationId)
                && now - binding.StartedAt <= BindingLifetime)
            .OrderByDescending(binding => binding.StartedAt)
            .ToArray();
        return pending.Length == 1 ? pending[0] : null;
    }

    private IEnumerable<SubagentSessionBinding> ReadAll()
    {
        if (!Directory.Exists(directory))
        {
            yield break;
        }

        foreach (var path in Directory.EnumerateFiles(directory, "*.json", SearchOption.TopDirectoryOnly))
        {
            var binding = TryRead(path);
            if (binding is not null)
            {
                yield return binding;
            }
        }
    }

    private SubagentSessionBinding? TryReadBySubagent(string subagentId) =>
        TryRead(PathFor("id", subagentId));

    private SubagentSessionBinding? TryReadByChild(string conversationId) =>
        TryRead(PathFor("child", conversationId));

    private SubagentSessionBinding? TryRead(string path)
    {
        if (!File.Exists(path))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<SubagentSessionBinding>(File.ReadAllText(path), JsonOptions);
        }
        catch (Exception exception) when (exception is IOException or JsonException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    private void TryWrite(SubagentSessionBinding binding)
    {
        try
        {
            Directory.CreateDirectory(directory);
            WriteAtomic(PathFor("id", binding.SubagentId), binding);
            if (!string.IsNullOrWhiteSpace(binding.ChildConversationId))
            {
                WriteAtomic(PathFor("child", binding.ChildConversationId), binding);
            }
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            // Observational metadata must never interrupt Cursor.
        }
    }

    private static void WriteAtomic(string path, SubagentSessionBinding binding)
    {
        var temporaryPath = $"{path}.{Guid.NewGuid():N}.tmp";
        File.WriteAllText(temporaryPath, JsonSerializer.Serialize(binding, JsonOptions));
        File.Move(temporaryPath, path, true);
    }

    private string PathFor(string kind, string key)
    {
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{kind}:{key}")));
        return Path.Combine(directory, $"{kind}-{hash}.json");
    }

    private static string? TranscriptSubagentId(string? transcriptPath)
    {
        if (string.IsNullOrWhiteSpace(transcriptPath))
        {
            return null;
        }

        var normalized = transcriptPath.Replace('\\', '/');
        var marker = "/subagents/";
        var index = normalized.LastIndexOf(marker, StringComparison.OrdinalIgnoreCase);
        if (index < 0)
        {
            return null;
        }

        var fileName = Path.GetFileNameWithoutExtension(normalized[(index + marker.Length)..]);
        return string.IsNullOrWhiteSpace(fileName) ? null : fileName;
    }
}

public sealed record SubagentSessionBinding(
    string SubagentId,
    string ParentConversationId,
    string? ChildConversationId,
    string Workspace,
    DateTimeOffset StartedAt);
