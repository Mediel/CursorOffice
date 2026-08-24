using CursorOffice.Application.Agents;

namespace CursorOffice.Application.Abstractions;

/// <summary>
/// Produces normalized agent activities independently of their external source.
/// </summary>
public interface IAgentEventSource
{
    IAsyncEnumerable<AgentActivity> ReadAllAsync(CancellationToken cancellationToken);
}
