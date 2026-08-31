using System.Diagnostics;
using System.Text.Json;

namespace CursorOffice.Infrastructure.Cursor;

/// <summary>
/// Reads extension heartbeat leases from <c>windows-v1</c>. Lifetime matches the
/// reporter: seven seconds, or immediately when the extension-host PID is dead.
/// </summary>
public sealed class CursorWindowPresenceDirectory
{
    public static readonly TimeSpan PresenceLifetime = TimeSpan.FromSeconds(7);

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly string windowsDirectory;

    public CursorWindowPresenceDirectory(string? windowsDirectory = null)
    {
        this.windowsDirectory = windowsDirectory ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "CursorOffice",
            "windows-v1");
    }

    /// <summary>
    /// Live window IDs, or <c>null</c> when presence cannot be observed and
    /// retirement must be skipped.
    /// </summary>
    public IReadOnlySet<string>? TryReadLiveWindowIds(DateTimeOffset now)
    {
        if (!Directory.Exists(windowsDirectory))
        {
            return null;
        }

        try
        {
            var live = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var path in Directory.EnumerateFiles(
                windowsDirectory,
                "*.json",
                SearchOption.TopDirectoryOnly))
            {
                if (TryReadLiveWindowId(path, now) is { } windowId)
                {
                    live.Add(windowId);
                }
            }

            return live;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    private static string? TryReadLiveWindowId(string path, DateTimeOffset now)
    {
        try
        {
            var heartbeat = JsonSerializer.Deserialize<HeartbeatFile>(File.ReadAllText(path), JsonOptions);
            if (heartbeat is null
                || string.IsNullOrWhiteSpace(heartbeat.Id)
                || string.IsNullOrWhiteSpace(heartbeat.Label)
                || now - heartbeat.UpdatedAt > PresenceLifetime)
            {
                return null;
            }

            var processId = heartbeat.ProcessId ?? ProcessIdFromWindowId(heartbeat.Id);
            if (processId is { } pid && !IsProcessAlive(pid))
            {
                return null;
            }

            return heartbeat.Id;
        }
        catch (Exception exception) when (exception is IOException or JsonException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    private static int? ProcessIdFromWindowId(string windowId)
    {
        var separator = windowId.LastIndexOf('-');
        if (separator < 0 || separator == windowId.Length - 1)
        {
            return null;
        }

        return int.TryParse(windowId[(separator + 1)..], out var processId) && processId > 0
            ? processId
            : null;
    }

    private static bool IsProcessAlive(int processId)
    {
        try
        {
            using var process = Process.GetProcessById(processId);
            return !process.HasExited;
        }
        catch (ArgumentException)
        {
            return false;
        }
        catch (InvalidOperationException)
        {
            return false;
        }
        catch (System.ComponentModel.Win32Exception)
        {
            return true;
        }
    }

    private sealed record HeartbeatFile(
        string? Id,
        string? Label,
        int? ProcessId,
        DateTimeOffset UpdatedAt);
}
