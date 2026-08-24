using System.Runtime.CompilerServices;
using CursorOffice.Application.Abstractions;
using CursorOffice.Application.Agents;
using CursorOffice.Core.Agents;

namespace CursorOffice.Infrastructure.Demo;

/// <summary>
/// Deterministic event source used until the Cursor adapters are implemented.
/// </summary>
public sealed class DemoAgentEventSource : IAgentEventSource
{
    public async IAsyncEnumerable<AgentActivity> ReadAllAsync(
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var timestamp = DateTimeOffset.UtcNow;

        var agents = new[]
        {
            new AgentActivity(
                "alice",
                "Alice",
                "Developer",
                AgentStatus.Working,
                "Připravuje extension host",
                "Píše TypeScript",
                timestamp),
            new AgentActivity(
                "bob",
                "Bob",
                "Reviewer",
                AgentStatus.WaitingForUser,
                "Čeká na potvrzení návrhu",
                "Vyžaduje rozhodnutí uživatele",
                timestamp),
            new AgentActivity(
                "ema",
                "Ema",
                "Test Engineer",
                AgentStatus.Completed,
                "Ověřila doménový model",
                "Testy prošly",
                timestamp),
        };

        foreach (var agent in agents)
        {
            cancellationToken.ThrowIfCancellationRequested();
            yield return agent;
            await Task.Yield();
        }
    }
}
