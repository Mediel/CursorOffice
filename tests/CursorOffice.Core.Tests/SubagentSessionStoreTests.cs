namespace CursorOffice.Core.Tests;

public sealed class SubagentSessionStoreTests : IDisposable
{
    private readonly string root = Directory.CreateTempSubdirectory("CursorOfficeSubagentSessions-").FullName;
    private readonly DateTimeOffset now = new(2026, 8, 25, 10, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Resolve_BindsLaterToolConversationToPendingStart()
    {
        var store = new SubagentSessionStore(root);
        store.RememberStart("tool-call-1", "parent-conversation", "CursorOffice", now);

        var bound = store.Resolve(
            "child-conversation",
            parentConversationId: null,
            transcriptPath: null,
            "CursorOffice",
            now.AddSeconds(8));

        Assert.NotNull(bound);
        Assert.Equal("tool-call-1", bound.SubagentId);
        Assert.Equal("parent-conversation", bound.ParentConversationId);
        Assert.Equal("child-conversation", bound.ChildConversationId);
    }

    [Fact]
    public void Resolve_UsesTranscriptPathWhenParentLinkIsMissing()
    {
        var store = new SubagentSessionStore(root);
        store.RememberStart("file-id-9", "parent-conversation", "CursorOffice", now);

        var bound = store.Resolve(
            "fresh-conversation",
            parentConversationId: null,
            transcriptPath: @"C:\Users\me\.cursor\projects\demo\agent-transcripts\parent-conversation\subagents\file-id-9.jsonl",
            "CursorOffice",
            now.AddSeconds(3));

        Assert.NotNull(bound);
        Assert.Equal("file-id-9", bound.SubagentId);
        Assert.Equal("fresh-conversation", bound.ChildConversationId);
    }

    [Fact]
    public void Resolve_DoesNotGuessWhenTwoStartsArePending()
    {
        var store = new SubagentSessionStore(root);
        store.RememberStart("worker-a", "parent-conversation", "CursorOffice", now);
        store.RememberStart("worker-b", "parent-conversation", "CursorOffice", now.AddSeconds(1));

        var bound = store.Resolve(
            "ambiguous-conversation",
            parentConversationId: null,
            transcriptPath: null,
            "CursorOffice",
            now.AddSeconds(2));

        Assert.Null(bound);
    }

    public void Dispose()
    {
        Directory.Delete(root, true);
    }
}
