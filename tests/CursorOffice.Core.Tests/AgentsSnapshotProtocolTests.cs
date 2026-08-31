using System.Text.Json;
using System.Text.Json.Serialization;
using CursorOffice.Core.Agents;

namespace CursorOffice.Core.Tests;

public sealed class AgentsSnapshotProtocolTests
{
    [Fact]
    public void AgentsSnapshotSerializesCamelCaseEnvelopeAtProtocolVersion1()
    {
        var occurredAt = DateTimeOffset.Parse("2026-08-26T10:00:00Z");
        var snapshot = new AgentSnapshot(
            "primary-agent",
            "Primary Agent",
            "Cursor chat",
            AgentStatus.Working,
            "CursorOffice: používá nástroj Shell",
            "never persist this prompt",
            occurredAt,
            model: "claude-opus-4-7");
        var activity = AgentActivityEvent.FromSnapshot(snapshot);
        var envelope = new ProtocolTestEnvelope(
            1,
            "agents.snapshot",
            occurredAt,
            new AgentsSnapshot([snapshot], [activity]));
        var json = JsonSerializer.Serialize(envelope, ProtocolJsonOptions);
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        var payload = root.GetProperty("payload");
        var agent = Assert.Single(payload.GetProperty("agents").EnumerateArray());
        var row = Assert.Single(payload.GetProperty("activity").EnumerateArray());

        Assert.Equal(1, root.GetProperty("protocolVersion").GetInt32());
        Assert.Equal("agents.snapshot", root.GetProperty("type").GetString());
        Assert.False(root.TryGetProperty("ProtocolVersion", out _));
        Assert.False(payload.TryGetProperty("Agents", out _));
        Assert.False(payload.TryGetProperty("Activity", out _));
        Assert.Equal("primary-agent", agent.GetProperty("id").GetString());
        Assert.Equal("working", agent.GetProperty("status").GetString());
        Assert.Equal("primary", agent.GetProperty("kind").GetString());
        Assert.Equal("claude-opus-4-7", agent.GetProperty("model").GetString());
        Assert.Equal("primary-agent", row.GetProperty("agentId").GetString());
        Assert.Equal("tool", row.GetProperty("kind").GetString());
        Assert.Equal("working", row.GetProperty("status").GetString());
        Assert.Equal("Shell", row.GetProperty("tool").GetString());
        Assert.False(row.TryGetProperty("currentTask", out _));
        Assert.False(row.TryGetProperty("detail", out _));
        Assert.False(row.TryGetProperty("Status", out _));
        Assert.False(row.TryGetProperty("Kind", out _));
        Assert.DoesNotContain("never persist this prompt", row.GetRawText(), StringComparison.Ordinal);
        Assert.DoesNotContain("používá nástroj", row.GetRawText(), StringComparison.Ordinal);
    }

    [Fact]
    public void EmptyAgentsSnapshotStillSerializesAgentsAndActivityArrays()
    {
        var envelope = new ProtocolTestEnvelope(
            1,
            "agents.snapshot",
            DateTimeOffset.Parse("2026-08-26T10:00:00Z"),
            new AgentsSnapshot([], []));
        var json = JsonSerializer.Serialize(envelope, ProtocolJsonOptions);
        using var document = JsonDocument.Parse(json);
        var payload = document.RootElement.GetProperty("payload");

        Assert.Equal(1, document.RootElement.GetProperty("protocolVersion").GetInt32());
        Assert.Equal("agents.snapshot", document.RootElement.GetProperty("type").GetString());
        Assert.Equal(JsonValueKind.Array, payload.GetProperty("agents").ValueKind);
        Assert.Equal(0, payload.GetProperty("agents").GetArrayLength());
        Assert.Equal(JsonValueKind.Array, payload.GetProperty("activity").ValueKind);
        Assert.Equal(0, payload.GetProperty("activity").GetArrayLength());
    }

    private static readonly JsonSerializerOptions ProtocolJsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    private sealed record ProtocolTestEnvelope(
        int ProtocolVersion,
        string Type,
        DateTimeOffset OccurredAt,
        AgentsSnapshot Payload);
}
