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
                "Preparing the extension host",
                "Writing TypeScript",
                timestamp),
            new AgentActivity(
                "bob",
                "Bob",
                "Reviewer",
                AgentStatus.WaitingForUser,
                "Waiting for proposal approval",
                "Requires a user decision",
                timestamp),
            new AgentActivity(
                "ema",
                "Ema",
                "Test Engineer",
                AgentStatus.Completed,
                "Verified the domain model",
                "Tests passed",
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
