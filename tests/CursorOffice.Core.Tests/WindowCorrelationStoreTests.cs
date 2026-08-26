using System.Text.Json;

namespace CursorOffice.Core.Tests;

public sealed class WindowCorrelationStoreTests : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly string root = Directory.CreateTempSubdirectory("CursorOfficeWindowTests-").FullName;
    private readonly DateTimeOffset now = new(2026, 8, 24, 10, 30, 0, TimeSpan.Zero);

    [Fact]
    public void Resolve_AssignsPromptToFocusedMatchingWindow()
    {
        WriteWindow("window-a", "Shop · A", false, now.AddSeconds(-2), "C:\\work\\shop");
        WriteWindow("window-b", "Shop · B", true, now.AddSeconds(-1), "C:\\work\\shop");

        var result = Store().Resolve("conversation-1", null, ["C:\\work\\shop"], "beforeSubmitPrompt", now);

        Assert.NotNull(result);
        Assert.Equal("window-b", result.WindowId);
        Assert.Equal("focused", result.Resolution);
    }

    [Fact]
    public void Resolve_KeepsBackgroundEventsInBoundWindow()
    {
        WriteWindow("window-a", "Shop · A", true, now.AddSeconds(-2), "C:\\work\\shop");
        WriteWindow("window-b", "Shop · B", false, now.AddSeconds(-3), "C:\\work\\shop");
        var store = Store();
        store.Resolve("conversation-1", null, ["C:\\work\\shop"], "beforeSubmitPrompt", now.AddSeconds(-2));
        WriteWindow("window-a", "Shop · A", false, now.AddSeconds(-1), "C:\\work\\shop");
        WriteWindow("window-b", "Shop · B", true, now, "C:\\work\\shop");

        var result = store.Resolve("conversation-1", null, ["C:\\work\\shop"], "postToolUse", now);

        Assert.NotNull(result);
        Assert.Equal("window-a", result.WindowId);
        Assert.Equal("conversation", result.Resolution);
    }

    [Fact]
    public void Resolve_RebindsConversationWhenPromptMovesToAnotherWindow()
    {
        WriteWindow("window-a", "Shop · A", true, now.AddSeconds(-3), "C:\\work\\shop");
        WriteWindow("window-b", "Shop · B", false, now.AddSeconds(-3), "C:\\work\\shop");
        var store = Store();
        store.Resolve("conversation-1", null, ["C:\\work\\shop"], "beforeSubmitPrompt", now.AddSeconds(-2));
        WriteWindow("window-a", "Shop · A", false, now.AddSeconds(-1), "C:\\work\\shop");
        WriteWindow("window-b", "Shop · B", true, now, "C:\\work\\shop");

        var result = store.Resolve("conversation-1", null, ["C:\\work\\shop"], "beforeSubmitPrompt", now);

        Assert.NotNull(result);
        Assert.Equal("window-b", result.WindowId);
        Assert.Equal("focused", result.Resolution);
    }

    [Fact]
    public void Resolve_SubagentInheritsParentConversationWindow()
    {
        WriteWindow("window-a", "Shop · A", true, now, "C:\\work\\shop");
        var store = Store();
        store.Resolve("manager-conversation", null, ["C:\\work\\shop"], "beforeSubmitPrompt", now);

        var result = store.Resolve(
            "subagent-conversation",
            "manager-conversation",
            ["C:\\work\\shop"],
            "subagentStart",
            now.AddSeconds(1));

        Assert.NotNull(result);
        Assert.Equal("window-a", result.WindowId);
        Assert.Equal("conversation", result.Resolution);
    }

    [Fact]
    public void Resolve_DoesNotGuessBetweenUnfocusedIdenticalWorkspaces()
    {
        WriteWindow("window-a", "Shop · A", false, now, "C:\\work\\shop");
        WriteWindow("window-b", "Shop · B", false, now, "C:\\work\\shop");

        var result = Store().Resolve("conversation-1", null, ["C:\\work\\shop"], "postToolUse", now);

        Assert.Null(result);
    }

    [Fact]
    public void Resolve_MatchesCursorUriWorkspaceRootToWindowsHeartbeat()
    {
        WriteWindow("window-a", "CursorOffice · A", true, now, "C:\\Users\\erdtM\\source\\repos\\CursorOffice");

        var result = Store().Resolve(
            "conversation-1",
            null,
            ["/c:/Users/erdtM/source/repos/CursorOffice"],
            "beforeSubmitPrompt",
            now);

        Assert.NotNull(result);
        Assert.Equal("window-a", result.WindowId);
        Assert.Equal("focused", result.Resolution);
    }

    [Fact]
    public void Resolve_MatchesFileUriWorkspaceRootToHeartbeatFsPath()
    {
        WriteWindow("window-a", "CursorOffice · A", true, now, @"c:\users\erdtm\source\repos\cursoroffice");

        var result = Store().Resolve(
            "conversation-1",
            null,
            ["file:///c:/Users/erdtM/source/repos/CursorOffice"],
            "beforeSubmitPrompt",
            now);

        Assert.NotNull(result);
        Assert.Equal("window-a", result.WindowId);
        Assert.Equal("focused", result.Resolution);
    }

    public void Dispose()
    {
        Directory.Delete(root, true);
    }

    private WindowCorrelationStore Store() => new(root);

    private void WriteWindow(
        string id,
        string label,
        bool focused,
        DateTimeOffset lastFocusedAt,
        params string[] workspaceRoots)
    {
        var directory = Path.Combine(root, "windows-v1");
        Directory.CreateDirectory(directory);
        var presence = new CursorWindowPresence(
            id,
            label,
            workspaceRoots,
            focused,
            lastFocusedAt,
            now);
        File.WriteAllText(
            Path.Combine(directory, $"{id}.json"),
            JsonSerializer.Serialize(presence, JsonOptions));
    }
}
