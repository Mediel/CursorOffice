using CursorOffice.Application.Abstractions;
using CursorOffice.Application.Agents;
using CursorOffice.Core.Agents;
using CursorOffice.Infrastructure.Cursor;
using Microsoft.Data.Sqlite;

namespace CursorOffice.Core.Tests;

public sealed class CursorComposerHeaderStoreTests
{
    [Fact]
    public async Task ReadsOnlyGeneratedConversationNameByComposerId()
    {
        var directory = Path.Combine(Path.GetTempPath(), "CursorOffice.Tests", Guid.NewGuid().ToString("N"));
        var path = Path.Combine(directory, "state.vscdb");
        Directory.CreateDirectory(directory);
        try
        {
            var store = new CursorComposerHeaderStore(path);
            await using (var connection = new SqliteConnection($"Data Source={path};Pooling=False"))
            {
                await connection.OpenAsync();
                await using var command = connection.CreateCommand();
                command.CommandText = """
                    CREATE TABLE composerHeaders (composerId TEXT PRIMARY KEY, value TEXT);
                    INSERT INTO composerHeaders (composerId, value)
                    VALUES ('conversation-1', '{"composerId":"conversation-1","name":"  Terminal   integration details  ","subtitle":"ignored"}');
                    """;
                await command.ExecuteNonQueryAsync();
            }

            var title = await store.TryGetTitleAsync("conversation-1");

            Assert.Equal("Terminal integration details", title);
        }
        finally
        {
            Directory.Delete(directory, true);
        }
    }

    [Fact]
    public async Task EventSourcePairsPrimaryCursorAgentWithConversationTitle()
    {
        var directory = Path.Combine(Path.GetTempPath(), "CursorOffice.Tests", Guid.NewGuid().ToString("N"));
        var path = Path.Combine(directory, "state.vscdb");
        Directory.CreateDirectory(directory);
        try
        {
            var store = new CursorComposerHeaderStore(path);
            await using (var connection = new SqliteConnection($"Data Source={path};Pooling=False"))
            {
                await connection.OpenAsync();
                await using var command = connection.CreateCommand();
                command.CommandText = """
                    CREATE TABLE composerHeaders (composerId TEXT PRIMARY KEY, value TEXT);
                    INSERT INTO composerHeaders (composerId, value)
                    VALUES ('conversation-1', '{"name":"Terminal integration details"}');
                    """;
                await command.ExecuteNonQueryAsync();
            }
            var activity = new AgentActivity(
                "cursor-conversation-1",
                "Cursor Agent",
                "Developer",
                AgentStatus.Working,
                null,
                null,
                DateTimeOffset.UtcNow);
            var source = new CursorConversationTitleEventSource(new StubEventSource(activity), store);

            AgentActivity? actual = null;
            await foreach (var item in source.ReadAllAsync(CancellationToken.None))
            {
                actual = item;
            }

            Assert.Equal("Terminal integration details", actual?.ConversationTitle);
        }
        finally
        {
            Directory.Delete(directory, true);
        }
    }

    private sealed class StubEventSource(params AgentActivity[] activities) : IAgentEventSource
    {
        public async IAsyncEnumerable<AgentActivity> ReadAllAsync(
            [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
        {
            foreach (var activity in activities)
            {
                cancellationToken.ThrowIfCancellationRequested();
                yield return activity;
            }
            await Task.CompletedTask;
        }
    }
}
