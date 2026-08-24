namespace CursorOffice.Host.Protocol;

/// <summary>
/// Versioned message envelope written as one JSON object per line.
/// </summary>
public sealed record ProtocolEnvelope<T>(
    int ProtocolVersion,
    string Type,
    DateTimeOffset OccurredAt,
    T Payload)
{
    public static ProtocolEnvelope<T> Create(string type, T payload)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(type);
        ArgumentNullException.ThrowIfNull(payload);

        return new ProtocolEnvelope<T>(1, type, DateTimeOffset.UtcNow, payload);
    }
}
