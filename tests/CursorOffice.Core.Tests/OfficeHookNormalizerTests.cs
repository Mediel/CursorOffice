using System.Text.Json;

namespace CursorOffice.Core.Tests;

public sealed class OfficeHookNormalizerTests : IDisposable
{
    private readonly string root = Directory.CreateTempSubdirectory("CursorOfficeHookNormalize-").FullName;
    private readonly OfficeHookNormalizer normalizer;

    public OfficeHookNormalizerTests()
    {
        normalizer = new OfficeHookNormalizer(
            new WindowCorrelationStore(root),
            new SubagentSessionStore(root));
    }

    [Fact]
    public void CommonPayload_PersistsModelIdAndSafeModelParams()
    {
        var hookEvent = Normalize(
            """
            {
              "conversation_id": "conv-123",
              "generation_id": "gen-456",
              "model": "claude-opus-4-7-thinking-max",
              "model_id": "claude-opus-4-7",
              "model_params": [
                { "id": "thinking", "value": "true" },
                { "id": "context", "value": "1m" },
                { "id": "effort", "value": "max" },
                { "id": "prompt", "value": "secret user prompt that must not persist" }
              ],
              "hook_event_name": "postToolUse",
              "tool_name": "Read",
              "workspace_roots": ["C:/tmp/SampleWorkspace"]
            }
            """);

        Assert.Equal("claude-opus-4-7", hookEvent.Model);
        Assert.Equal("true", hookEvent.ModelParams?.Thinking);
        Assert.Equal("max", hookEvent.ModelParams?.Effort);
        Assert.Equal("1m", hookEvent.ModelParams?.Context);
        Assert.Null(hookEvent.Usage);
        Assert.Null(hookEvent.ContextUsage);
        Assert.Contains("Read", hookEvent.CurrentTask, StringComparison.Ordinal);
        Assert.DoesNotContain("secret", hookEvent.CurrentTask, StringComparison.Ordinal);
        Assert.DoesNotContain("secret", hookEvent.Detail, StringComparison.Ordinal);
    }

    [Fact]
    public void CommonPayload_FallsBackToLegacyModelWhenModelIdIsMissing()
    {
        var hookEvent = Normalize(
            """
            {
              "conversation_id": "conv-legacy",
              "model": "grok-4.6",
              "hook_event_name": "afterAgentThought",
              "workspace_roots": ["C:/tmp/SampleWorkspace"]
            }
            """);

        Assert.Equal("grok-4.6", hookEvent.Model);
        Assert.Contains("grok-4.6", hookEvent.Role, StringComparison.Ordinal);
        Assert.Null(hookEvent.ModelParams);
        Assert.Null(hookEvent.Usage);
    }

    [Fact]
    public void PayloadWithoutTokens_LeavesUsageNullAndDoesNotEstimate()
    {
        var hookEvent = Normalize(
            """
            {
              "conversation_id": "conv-no-tokens",
              "model_id": "claude-opus-4-7",
              "hook_event_name": "afterAgentResponse",
              "context_tokens": 120000,
              "context_window_size": 128000,
              "context_usage_percent": 85,
              "workspace_roots": ["C:/tmp/SampleWorkspace"]
            }
            """);

        Assert.Null(hookEvent.Usage);
        Assert.Null(hookEvent.ContextUsage);
        Assert.Equal("claude-opus-4-7", hookEvent.Model);
    }

    [Fact]
    public void GetUsage_ReadsOnlyDeclaredGenerationTokenFields()
    {
        var hookEvent = Normalize(
            """
            {
              "conversation_id": "conv-usage",
              "generation_id": "gen-usage",
              "model_id": "composer",
              "hook_event_name": "stop",
              "status": "completed",
              "input_tokens": 100,
              "outputTokens": 20,
              "usage": {
                "cache_read_tokens": 8,
                "cacheWriteTokens": 3,
                "context_tokens": 99999
              },
              "workspace_roots": ["C:/tmp/SampleWorkspace"]
            }
            """);

        Assert.NotNull(hookEvent.Usage);
        Assert.Equal(100, hookEvent.Usage.InputTokens);
        Assert.Equal(20, hookEvent.Usage.OutputTokens);
        Assert.Equal(8, hookEvent.Usage.CacheReadTokens);
        Assert.Equal(3, hookEvent.Usage.CacheWriteTokens);
        Assert.Null(hookEvent.ContextUsage);
    }

    [Fact]
    public void PreCompact_SetsActivityAndContextUsageWithoutBilling()
    {
        var hookEvent = Normalize(
            """
            {
              "conversation_id": "conv-compact",
              "generation_id": "gen-compact",
              "model_id": "claude-opus-4-7",
              "hook_event_name": "preCompact",
              "trigger": "auto",
              "context_usage_percent": 85,
              "context_tokens": 120000,
              "context_window_size": 128000,
              "workspace_roots": ["C:/tmp/SampleWorkspace"]
            }
            """);

        Assert.Equal("working", hookEvent.Status);
        Assert.Equal("SampleWorkspace: komprimuje kontext", hookEvent.CurrentTask);
        Assert.Contains("kontext 85%", hookEvent.Detail, StringComparison.Ordinal);
        Assert.Contains("120000/128000", hookEvent.Detail, StringComparison.Ordinal);
        Assert.Contains("auto", hookEvent.Detail, StringComparison.Ordinal);
        Assert.Equal("claude-opus-4-7", hookEvent.Model);
        Assert.Null(hookEvent.Usage);
        Assert.Equal(120000, hookEvent.ContextUsage?.ContextTokens);
        Assert.Equal(128000, hookEvent.ContextUsage?.ContextWindowSize);
        Assert.Equal(85, hookEvent.ContextUsage?.ContextUsagePercent);
    }

    [Fact]
    public void AfterFileEdit_UsesBasenameAndDiscardsEdits()
    {
        var hookEvent = Normalize(
            """
            {
              "conversation_id": "conv-edit",
              "hook_event_name": "afterFileEdit",
              "file_path": "C:/work/SampleWorkspace/src/Office/Program.cs",
              "edits": [
                { "old_string": "secret old code", "new_string": "secret new code" }
              ],
              "workspace_roots": ["C:/tmp/SampleWorkspace"]
            }
            """);

        Assert.Equal("SampleWorkspace: upravil Program.cs", hookEvent.CurrentTask);
        Assert.DoesNotContain("secret", hookEvent.CurrentTask, StringComparison.Ordinal);
        Assert.DoesNotContain("secret", hookEvent.Detail, StringComparison.Ordinal);
        Assert.DoesNotContain("C:/work", hookEvent.CurrentTask, StringComparison.Ordinal);
        Assert.DoesNotContain("C:/work", hookEvent.Detail, StringComparison.Ordinal);
    }

    [Fact]
    public void BeforeSubmitPrompt_DiscardsPromptText()
    {
        var hookEvent = Normalize(
            """
            {
              "conversation_id": "conv-prompt",
              "hook_event_name": "beforeSubmitPrompt",
              "prompt": "please leak this prompt into the office",
              "model_id": "grok-4.6",
              "workspace_roots": ["C:/tmp/SampleWorkspace"]
            }
            """);

        Assert.Equal("userPrompt", hookEvent.InteractionKind);
        Assert.Equal("grok-4.6", hookEvent.Model);
        Assert.DoesNotContain("leak", hookEvent.CurrentTask, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("leak", hookEvent.Detail, StringComparison.OrdinalIgnoreCase);
        Assert.Null(hookEvent.Usage);
    }

    [Fact]
    public void SubagentStart_PrefersSubagentModel()
    {
        var hookEvent = Normalize(
            """
            {
              "conversation_id": "parent-1",
              "parent_conversation_id": "parent-1",
              "hook_event_name": "subagentStart",
              "subagent_id": "worker-9",
              "subagent_type": "explore",
              "subagent_model": "claude-sonnet-4-20250514",
              "model_id": "claude-opus-4-7",
              "task": "Explore authentication",
              "workspace_roots": ["C:/tmp/SampleWorkspace"]
            }
            """);

        Assert.Equal("claude-sonnet-4-20250514", hookEvent.Model);
        Assert.Equal("subagent", hookEvent.Kind);
        Assert.Equal("Explore authentication", hookEvent.CurrentTask);
    }

    public void Dispose()
    {
        Directory.Delete(root, true);
    }

    private OfficeHookEvent Normalize(string json)
    {
        using var document = JsonDocument.Parse(json);
        return normalizer.Normalize(document.RootElement);
    }
}
