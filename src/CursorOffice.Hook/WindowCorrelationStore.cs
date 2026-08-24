using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

/// <summary>
/// Correlates public Cursor hook identities with local extension-window heartbeats.
/// A prompt may rebind a conversation because Cursor lets users reopen a chat in
/// another window. Later background events keep using the stored conversation map.
/// </summary>
public sealed class WindowCorrelationStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly TimeSpan PresenceLifetime = TimeSpan.FromSeconds(20);

    private readonly string windowsDirectory;
    private readonly string bindingsDirectory;

    public WindowCorrelationStore(string? rootDirectory = null)
    {
        var root = rootDirectory ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "CursorOffice");
        windowsDirectory = Path.Combine(root, "windows-v1");
        bindingsDirectory = Path.Combine(root, "conversation-windows-v1");
    }

    public CursorWindowAssociation? Resolve(
        string conversationId,
        string? parentConversationId,
        IReadOnlyList<string> workspaceRoots,
        string hookEventName,
        DateTimeOffset now)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(conversationId);
        ArgumentException.ThrowIfNullOrWhiteSpace(hookEventName);

        var bindingConversationId = string.IsNullOrWhiteSpace(parentConversationId)
            ? conversationId
            : parentConversationId;
        var existing = TryReadBinding(bindingConversationId);
        var canRebind = string.Equals(hookEventName, "beforeSubmitPrompt", StringComparison.Ordinal)
            || string.Equals(hookEventName, "sessionStart", StringComparison.Ordinal);

        if (!canRebind && existing is not null)
        {
            return new CursorWindowAssociation(existing.WindowId, existing.WindowLabel, "conversation");
        }

        var normalizedRoots = workspaceRoots
            .Where(root => !string.IsNullOrWhiteSpace(root))
            .Select(NormalizePath)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var candidates = ReadActiveWindows(now)
            .Where(window => normalizedRoots.Length == 0
                || window.WorkspaceRoots.Any(root => normalizedRoots.Contains(NormalizePath(root), StringComparer.OrdinalIgnoreCase)))
            .ToArray();
        var focused = candidates
            .Where(window => window.IsFocused && now - window.LastFocusedAt <= PresenceLifetime)
            .OrderByDescending(window => window.LastFocusedAt)
            .ThenByDescending(window => window.UpdatedAt)
            .FirstOrDefault();

        CursorWindowPresence? selected = focused;
        var resolution = "focused";
        if (selected is null && existing is not null)
        {
            selected = candidates.FirstOrDefault(window => string.Equals(window.Id, existing.WindowId, StringComparison.OrdinalIgnoreCase));
            resolution = "conversation";
        }
        if (selected is null && candidates.Length == 1)
        {
            selected = candidates[0];
            resolution = "workspace";
        }
        if (selected is null && existing is not null)
        {
            return new CursorWindowAssociation(existing.WindowId, existing.WindowLabel, "conversation");
        }
        if (selected is null)
        {
            return null;
        }

        var association = new CursorWindowAssociation(selected.Id, selected.Label, resolution);
        if (canRebind || existing is null)
        {
            TryWriteBinding(new ConversationWindowBinding(
                bindingConversationId,
                association.WindowId,
                association.WindowLabel,
                normalizedRoots,
                now));
        }
        return association;
    }

    public IReadOnlyList<CursorWindowPresence> ReadActiveWindows(DateTimeOffset now)
    {
        if (!Directory.Exists(windowsDirectory))
        {
            return [];
        }

        var windows = new List<CursorWindowPresence>();
        foreach (var path in Directory.EnumerateFiles(windowsDirectory, "*.json", SearchOption.TopDirectoryOnly))
        {
            try
            {
                var window = JsonSerializer.Deserialize<CursorWindowPresence>(File.ReadAllText(path), JsonOptions);
                if (window is null
                    || string.IsNullOrWhiteSpace(window.Id)
                    || string.IsNullOrWhiteSpace(window.Label)
                    || now - window.UpdatedAt > PresenceLifetime)
                {
                    continue;
                }
                windows.Add(window);
            }
            catch (Exception exception) when (exception is IOException or JsonException or UnauthorizedAccessException)
            {
                // Heartbeats are independently replaced by other Cursor windows.
            }
        }
        return windows;
    }

    private ConversationWindowBinding? TryReadBinding(string conversationId)
    {
        var path = BindingPath(conversationId);
        if (!File.Exists(path))
        {
            return null;
        }
        try
        {
            return JsonSerializer.Deserialize<ConversationWindowBinding>(File.ReadAllText(path), JsonOptions);
        }
        catch (Exception exception) when (exception is IOException or JsonException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    private void TryWriteBinding(ConversationWindowBinding binding)
    {
        try
        {
            Directory.CreateDirectory(bindingsDirectory);
            var path = BindingPath(binding.ConversationId);
            var temporaryPath = $"{path}.{Guid.NewGuid():N}.tmp";
            File.WriteAllText(temporaryPath, JsonSerializer.Serialize(binding, JsonOptions));
            File.Move(temporaryPath, path, true);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            // Correlation is observational and must never interrupt Cursor.
        }
    }

    private string BindingPath(string conversationId)
    {
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(conversationId)));
        return Path.Combine(bindingsDirectory, $"{hash}.json");
    }

    private static string NormalizePath(string path)
    {
        try
        {
            return Path.GetFullPath(path)
                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        }
        catch (Exception exception) when (exception is ArgumentException or NotSupportedException)
        {
            return path.Trim().TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        }
    }
}

public sealed record CursorWindowAssociation(string WindowId, string WindowLabel, string Resolution);

public sealed record CursorWindowPresence(
    string Id,
    string Label,
    string[] WorkspaceRoots,
    bool IsFocused,
    DateTimeOffset LastFocusedAt,
    DateTimeOffset UpdatedAt);

public sealed record ConversationWindowBinding(
    string ConversationId,
    string WindowId,
    string WindowLabel,
    string[] WorkspaceRoots,
    DateTimeOffset UpdatedAt);
