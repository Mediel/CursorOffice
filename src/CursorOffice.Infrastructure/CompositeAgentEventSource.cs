using System.Runtime.CompilerServices;
using System.Threading.Channels;
using CursorOffice.Application.Abstractions;
using CursorOffice.Application.Agents;

namespace CursorOffice.Infrastructure;

/// <summary>
/// Merges multiple local activity streams without giving any source control over another.
/// </summary>
public sealed class CompositeAgentEventSource : IAgentEventSource
{
    private readonly IReadOnlyList<IAgentEventSource> sources;

    public CompositeAgentEventSource(params IAgentEventSource[] sources)
    {
        ArgumentNullException.ThrowIfNull(sources);
        if (sources.Length == 0)
        {
            throw new ArgumentException("At least one event source is required.", nameof(sources));
        }

        this.sources = sources;
    }

    public async IAsyncEnumerable<AgentActivity> ReadAllAsync(
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var channel = Channel.CreateUnbounded<AgentActivity>(new UnboundedChannelOptions
        {
            SingleReader = true,
            SingleWriter = false,
        });
        var pumps = sources
            .Select(source => PumpAsync(source, channel.Writer, cancellationToken))
            .ToArray();
        var completion = CompleteAsync(pumps, channel.Writer);

        await foreach (var activity in channel.Reader
            .ReadAllAsync(cancellationToken)
            .ConfigureAwait(false))
        {
            yield return activity;
        }

        await completion.ConfigureAwait(false);
    }

    private static async Task PumpAsync(
        IAgentEventSource source,
        ChannelWriter<AgentActivity> writer,
        CancellationToken cancellationToken)
    {
        await foreach (var activity in source
            .ReadAllAsync(cancellationToken)
            .WithCancellation(cancellationToken)
            .ConfigureAwait(false))
        {
            await writer.WriteAsync(activity, cancellationToken).ConfigureAwait(false);
        }
    }

    private static async Task CompleteAsync(
        IReadOnlyCollection<Task> pumps,
        ChannelWriter<AgentActivity> writer)
    {
        try
        {
            await Task.WhenAll(pumps).ConfigureAwait(false);
            writer.TryComplete();
        }
        catch (OperationCanceledException)
        {
            writer.TryComplete();
        }
        catch (Exception exception)
        {
            writer.TryComplete(exception);
        }
    }
}
