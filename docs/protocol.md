# Local communication protocol

## Transport

The C# host and TypeScript extension communicate locally over standard input and output. Every line is an independent JSON document (NDJSON); no network port is required.

The Cursor Hook shim and C# host exchange events through the per-user broadcast spool `%LOCALAPPDATA%/CursorOffice/events-v3`. The Hook writes a temporary file and atomically moves it into place. Every host maintains its own in-memory cursor, so reading does not delete an event. Any host may remove events only after the ten-minute retention period. The versioned directory isolates the broadcast design from older single-consumer hosts. Raw Hook payloads never enter this spool.

Standard output is reserved for protocol messages. Host diagnostics must use standard error.

## Message envelope

```json
{
  "protocolVersion": 1,
  "type": "agent.changed",
  "occurredAt": "2026-08-21T10:00:00+00:00",
  "payload": {}
}
```

Required fields:

- `protocolVersion` — integer contract version
- `type` — stable message name
- `occurredAt` — ISO 8601 event time
- `payload` — message-specific data

## Agent state

Allowed protocol values:

- `unknown`
- `idle`
- `working`
- `waitingForUser`
- `error`
- `completed`
- `offline`

`agent.changed.payload` also carries the local Cursor hierarchy and optional evidence:

- `kind` — `primary` for a main conversation or `subagent` for a temporary worker
- `parentAgentId` — main-conversation ID that launched the subagent
- `workspace` — local workspace/repository name
- `model` — model reported by Cursor Hooks, when available
- `modelParams` — optional safe model controls such as `thinking`, `effort`, and `context`; later events in the same generation do not erase earlier evidenced values merely by omitting them
- `isParallelWorker` — whether Cursor marked the instance as a parallel worker
- `generationId` — stable correlation ID for one model generation
- `usage` — optional exact generation counters: `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, and calculated `totalTokens`; this is not context-window fill, and missing evidence is `null`, not zero
- `contextUsage` — optional context-window fill from `preCompact`: `contextTokens`, `contextWindowSize`, and `contextUsagePercent`; it is not added to `usage` or the ledger
- `windowId` / `windowLabel` — optional local Cursor-window identity and human-readable label
- `windowCorrelation` — `focused`, `conversation`, or `workspace`, depending on the correlation evidence; ambiguous cases remain unassigned
- `conversationTitle` — optional main-chat title resolved read-only from `conversation_id`; messages are never queried

Main-conversation and subagent IDs remain stable across updates. A later tool event therefore updates the existing character rather than spawning a duplicate.

## Message types

- `host.ready` — initialization completed
- `agent.changed` — an agent was created or changed
- `agent.removed` — the lifecycle projection ended; payload contains `id`, and the UI should retire the character
- `usage.changed` — persistent local aggregates: `total`, `byWorkspace`, `byModel`, `byWorkspaceModel`, and `byDay`
- `agents.snapshot` — complete startup state before live `agent.changed` events; payload is `{ "agents": AgentSnapshot[], "activity": AgentActivityEvent[] }` and may be empty
- `host.error` — structured error; planned, not yet implemented

Activity entries contain only `agentId`, `occurredAt`, `kind`, `status`, and an optional `tool`. Prompt text, reasoning, file bodies, and tool output are excluded.

## Compatibility

Adding an optional field is backward compatible. Renaming, removing, or changing the meaning of an existing field requires a `protocolVersion` increment.
