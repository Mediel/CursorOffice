using System.Text.Json;
using CursorOffice.Infrastructure.Cursor;

namespace CursorOffice.Core.Tests;

public sealed class CursorWindowPresenceDirectoryTests
{
    [Fact]
    public void MissingDirectoryIsUnobservable()
    {
        var directory = new CursorWindowPresenceDirectory(
            Path.Combine(Path.GetTempPath(), $"cursor-office-windows-missing-{Guid.NewGuid():N}"));

        Assert.Null(directory.TryReadLiveWindowIds(DateTimeOffset.UtcNow));
    }

    [Fact]
    public void ReadsFreshHeartbeatOfALiveProcess()
    {
        using var workspace = new PresenceWorkspace();
        var now = DateTimeOffset.Parse("2026-08-26T14:00:00Z");
        workspace.Write("window-live", Environment.ProcessId, now);

        var live = workspace.Presence.TryReadLiveWindowIds(now);

        Assert.NotNull(live);
        Assert.Equal("window-live", Assert.Single(live));
    }

    [Fact]
    public void IgnoresExpiredAndDeadHeartbeats()
    {
        using var workspace = new PresenceWorkspace();
        var now = DateTimeOffset.Parse("2026-08-26T14:00:00Z");
        workspace.Write("window-stale", Environment.ProcessId, now.AddSeconds(-8));
        workspace.Write("window-dead", 2_000_000_001, now);

        var live = workspace.Presence.TryReadLiveWindowIds(now);

        Assert.NotNull(live);
        Assert.Empty(live);
    }

    private sealed class PresenceWorkspace : IDisposable
    {
        private readonly string path = Path.Combine(
            Path.GetTempPath(),
            $"cursor-office-windows-{Guid.NewGuid():N}");

        public PresenceWorkspace()
        {
            System.IO.Directory.CreateDirectory(path);
            Presence = new CursorWindowPresenceDirectory(path);
        }

        public CursorWindowPresenceDirectory Presence { get; }

        public void Write(string id, int processId, DateTimeOffset updatedAt)
        {
            var payload = JsonSerializer.Serialize(new
            {
                id,
                label = "Sample · ABCD1",
                workspaceRoots = new[] { @"C:\work\Sample" },
                processId,
                isFocused = false,
                lastFocusedAt = updatedAt,
                updatedAt
            });
            File.WriteAllText(Path.Combine(path, $"{id}.json"), payload);
        }

        public void Dispose()
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, true);
            }
        }
    }
}
