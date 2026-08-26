using CursorOffice.Core.Agents;
using CursorOffice.Core.Usage;
using CursorOffice.Infrastructure.Usage;

namespace CursorOffice.Core.Tests;

public sealed class LocalUsageLedgerTests
{
    [Fact]
    public void Ledger_DeduplicatesGenerationAndPersistsWorkspaceAndModelTotals()
    {
        var directory = Path.Combine(Path.GetTempPath(), "CursorOffice.Tests", Guid.NewGuid().ToString("N"));
        var path = Path.Combine(directory, "usage.json");
        try
        {
            var ledger = new LocalUsageLedger(path);
            var repoAPath = Path.Combine("C:\\", "Repos", "RepoA");
            var first = CreateSnapshot("agent-a", "generation-1", "RepoA", "composer", new TokenUsage(100, 20, 40, 5), repoAPath);

            Assert.True(ledger.TryRecord(first));
            Assert.False(ledger.TryRecord(first));
            Assert.True(ledger.TryRecord(CreateSnapshot(
                "agent-a",
                "generation-1",
                "RepoA",
                "composer",
                new TokenUsage(120, 25, 40, 5),
                repoAPath)));
            Assert.True(ledger.TryRecord(CreateSnapshot(
                "agent-b",
                "generation-2",
                "RepoB",
                "claude",
                new TokenUsage(50, 10, 0, 0))));

            var reloaded = new LocalUsageLedger(path).GetSnapshot();
            Assert.Equal(250, reloaded.Total.TotalTokens);
            Assert.Equal(2, reloaded.Total.RequestCount);
            Assert.Equal(190, Assert.Single(reloaded.ByWorkspace, item => item.Key == repoAPath).TotalTokens);
            Assert.Equal(60, Assert.Single(reloaded.ByModel, item => item.Key == "claude").TotalTokens);
            Assert.Equal(190, Assert.Single(reloaded.ByWorkspaceModel, item => item.Key == $"{repoAPath} · composer").TotalTokens);
            Assert.Single(reloaded.ByDay);
        }
        finally
        {
            if (Directory.Exists(directory))
            {
                Directory.Delete(directory, true);
            }
        }
    }

    [Fact]
    public void Ledger_WritesOnlyGenerationUsageAndIgnoresContextWindow()
    {
        var directory = Path.Combine(Path.GetTempPath(), "CursorOffice.Tests", Guid.NewGuid().ToString("N"));
        var path = Path.Combine(directory, "usage.json");
        try
        {
            var ledger = new LocalUsageLedger(path);
            var contextOnly = CreateSnapshot(
                "agent-a",
                "generation-1",
                "RepoA",
                "composer",
                usage: null,
                contextUsage: new ContextUsage(120000, 128000, 85));
            var zeroTokens = CreateSnapshot(
                "agent-a",
                "generation-1",
                "RepoA",
                "composer",
                new TokenUsage(0, 0, 0, 0));
            var missingGeneration = CreateSnapshot(
                "agent-a",
                "",
                "RepoA",
                "composer",
                new TokenUsage(40, 10, 0, 0));
            var billed = CreateSnapshot(
                "agent-a",
                "generation-1",
                "RepoA",
                "composer",
                new TokenUsage(40, 10, 0, 0),
                contextUsage: new ContextUsage(120000, 128000, 85));

            Assert.False(ledger.TryRecord(contextOnly));
            Assert.False(ledger.TryRecord(zeroTokens));
            Assert.False(ledger.TryRecord(missingGeneration));
            Assert.True(ledger.TryRecord(billed));

            var snapshot = ledger.GetSnapshot();
            Assert.Equal(50, snapshot.Total.TotalTokens);
            Assert.Equal(1, snapshot.Total.RequestCount);
        }
        finally
        {
            if (Directory.Exists(directory))
            {
                Directory.Delete(directory, true);
            }
        }
    }

    private static AgentSnapshot CreateSnapshot(
        string id,
        string generationId,
        string workspace,
        string model,
        TokenUsage? usage,
        string? workspacePath = null,
        ContextUsage? contextUsage = null) => new(
            id,
            id,
            "Agent",
            AgentStatus.Completed,
            null,
            null,
            DateTimeOffset.UtcNow,
            workspace: workspace,
            model: model,
            generationId: generationId,
            usage: usage,
            contextUsage: contextUsage,
            workspacePath: workspacePath);
}
