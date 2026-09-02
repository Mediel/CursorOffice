# Local Cursor integration

Cursor Office does not use the Cursor Cloud API. Integration is split into local adapters so the visualization is not tied to one harness or event source.

## 1. Cursor Hooks: primary observational layer

Cursor Hooks run local processes that exchange JSON over standard input/output. The per-user configuration in `~/.cursor/hooks.json` applies to all local Cursor windows. Cursor Office observes:

- `sessionStart` / `sessionEnd` — main-conversation lifecycle
- `beforeSubmitPrompt` — a new assignment, without retaining prompt text
- `preToolUse` — work starting, without retaining tool input
- `postToolUse` / `postToolUseFailure` — activity and failure
- `afterAgentThought` — activity change, without retaining reasoning text
- `afterFileEdit` — file activity; only the basename is retained
- `preCompact` — context-window fill, not generation billing
- `afterAgentResponse` — response completion, without retaining response text
- `subagentStart` / `subagentStop` — subagent arrival, completion, failure, or interruption
- `stop` — end of an agent loop

The common payload can contain stable `conversation_id` and `generation_id` values, a model, `workspace_roots`, Cursor version, and an optional `transcript_path`. Cursor 3.18 on Windows emits workspace roots in URI form such as `/c:/Users/...`; the bridge normalizes these to regular file-system paths before matching window heartbeats.

The extension installs these hooks as passive observers. They return an empty response and never approve, deny, block, or modify an action. Transcript metadata remains a fallback for versions and workflows that do not emit every lifecycle event.

### Privacy filtering

The bridge is fail-open and discards sensitive fields before writing anything to the local spool. It does not retain:

- prompts or responses;
- reasoning or agent-thought text;
- commands or tool inputs;
- source-file contents;
- tool output; or
- subagent result summaries.

A short subagent `task` or `description` may be sanitized and limited to 140 characters for the work label. File-edit activity retains only the basename, not the full path or contents.

The normalized event spool at `%LOCALAPPDATA%/CursorOffice/events-v3` is a broadcast, not a single-consumer queue. Events remain for ten minutes, each host maintains its own read set, and cleanup occurs only after expiry. The versioned directory prevents an older destructive host in an unreloaded Cursor window from consuming current events. A newly started host replays at most two minutes of recent events to restore active state without processing a large history.

### Social signals without conversation contents

- `beforeSubmitPrompt`, or a new `generation_id` for an existing main conversation, produces a user-assignment interaction.
- `afterAgentResponse` confirms completion; the response body is discarded.
- `subagentStart` produces a delegation interaction; a newly active file under `subagents/` is fallback evidence only.
- `subagentStop` produces a handoff to the parent conversation; `summary` is discarded.

The Webview queues these signals so one character does not participate in multiple conversations simultaneously. Cursor Hooks can support permission decisions, but Cursor Office intentionally emits no such decision output.

### Models, activity, tokens, and context

The model comes from `model` or `model_id` in the common Hook payload. A subagent can report `subagent_model`; otherwise the bridge may use the parent event's model. Cursor Office does not infer a model from the editor UI. Later events in the same `generation_id` do not erase an already evidenced model or safe `model_params` values merely by omitting them.

The public Cursor Hooks contract does not guarantee billed token counters. If a runtime supplies `input_tokens`, `output_tokens`, `cache_read_tokens`, and `cache_write_tokens` in supported snake_case or camelCase locations, the bridge converts them into generation `usage`. The local ledger records usage only when a `generation_id` exists and at least one counter is greater than zero.

The ledger never estimates missing usage from text length, prices, or UI state. It deduplicates a generation and merges progressive counters by taking their maxima. Aggregates are available by:

- total usage;
- full workspace path;
- model;
- workspace/model pair; and
- local calendar day.

`preCompact` reports a different measurement: context-window fill through `context_tokens`, `context_window_size`, and `context_usage_percent`. This becomes `contextUsage` on the current snapshot and is displayed separately. It is not billed generation usage and is never added to the token ledger.

Agent activity is a short privacy-safe description: tool name, generic analysis state, edited-file basename, sanitized subagent assignment, or context-compaction state. It is not conversation content.

These values do not represent a complete Cursor bill. The UI therefore distinguishes last-generation recorded tokens, manager workspace aggregates, and optional context-window fill. Missing data stays unknown. A future ACP/CLI adapter can add exact runtime usage through the same domain contract.

Official reference: [Cursor Hooks](https://cursor.com/docs/hooks).

## 2. Transcript metadata: passive fallback

When a Cursor version or workflow does not emit the Hook needed to discover a subagent, the fallback observes only path, size, and modification time under `~/.cursor/projects/*/agent-transcripts`. It never opens `.jsonl` contents.

File identity supplies stable instances:

- main transcript → `primary` agent;
- file under `subagents/` → `subagent` with the parent conversation inferred from its directory.

A file changed in the last three minutes is evidence of `working`. If the parent transcript is still changing, a subagent may remain active for up to eight minutes because Cursor may not rewrite the subagent file during long reasoning or tool execution. An active subagent keeps its parent conversation in `working` with a coordination activity.

Tool events for a subagent may arrive under a new `conversation_id` without parent information. The bridge remembers `subagentStart` and associates later tools with the same worker.

Only real lifecycle events can establish terminal `completed`, `offline`, and `error` states. Older fallback metadata cannot overwrite them. A genuinely newer transcript write may reactivate the same identity. Conversely, fallback expiry may demote a non-terminal Hook `working` state to `idle` when a missing `stop` would otherwise leave the office permanently busy. The host applies the same evidence windows to snapshots restored from the activity log.

## 3. Cursor CLI and ACP: future control adapters

Cursor Agent CLI supports `--output-format stream-json`, including session initialization, assistant deltas, tool-call lifecycle, and terminal results. It is suitable for agents that Cursor Office may launch in the future.

ACP (`agent acp`) offers local JSON-RPC 2.0 over stdio, including `session/new`, `session/load`, `session/prompt`, streaming `session/update`, and permission requests. ACP is appropriate for future control and approval workflows, not passive discovery of already-open IDE chats.

Official references: [CLI output format](https://cursor.com/docs/cli/reference/output-format) and [Cursor ACP](https://cursor.com/docs/cli/acp).

## Window correlation and team hierarchy

Cursor Hooks do not expose a stable desktop-window ID. The extension runs separately in each Cursor window, creates a temporary local identity from the editor session and extension-host process, and publishes a short heartbeat containing only workspace roots, focus state, and timestamps.

```text
owner
└── workspace
    └── local Cursor window manager / team zone
        └── conversation_id (main-chat working agent)
            └── subagent_id (temporary worker)
```

During `beforeSubmitPrompt`, a focused live window with a matching workspace has priority. The resulting association is stored under a cryptographic hash of the conversation ID, so later tool, response, and background events remain with the correct window after focus changes. Subagents inherit the parent conversation's window. A later prompt may legitimately move the conversation to another focused window.

If several windows match and none is unambiguously focused, Cursor Office does not guess: the conversation remains unassigned. The UI can filter all windows, one window, or unassigned conversations. Filtering never changes lifecycle or physical state.

Each live IDE window creates one stable presentation manager from its heartbeat, even without an active chat. Main chats are real runtime agents under that manager and own their model, generation, and token data. A main chat with children is presented as a senior agent, while every subagent remains under its actual parent.

The public Hook schema provides `conversation_id` but not the sidebar title. On Windows, the host performs a narrow read-only lookup in Cursor's `state.vscdb`: it joins the ID to `composerHeaders` and reads only `composerId` plus the JSON `name` field. It does not query messages, transcripts, or the full-text index. When a title is unavailable, the fallback name is `Agent <short conversation_id>`.

Manager names use `Manager <workspace>`, with a short suffix when several live windows share a workspace. A prompt can produce `owner → manager → working agent`; delegation can continue from the senior to subagents. Manual owner control always takes priority. Autonomous owner behavior visualizes movement and real handoffs only; it never creates Cursor tasks.

## Lifecycle and accumulation control

1. First activity for a stable identity creates a character at the entrance.
2. `working`, `waitingForUser`, and `error` route the character to an appropriate POI.
3. Exclusive reservations assign a chair or standing position; the state machine handles sitting, work, meetings, and emotions.
4. `idle` uses free-time POIs and ambient behavior. A real `waitingForUser` agent leaves the idle planner and periodically asks the owner for attention.
5. A completed, stopped, failed, or vanished subagent performs an available handoff, enters a short cooldown, and then exits. Repeated old snapshots do not cancel departure; genuinely new activity does.
6. The departing character follows a collision-safe path to the exit.
7. The host eventually sends `agent.removed` according to state- and kind-specific TTL rules. Stale `working` evidence first becomes `idle`; offline window members use short retention.
8. An old duplicate snapshot cannot respawn a retired character, while new activity with the same stable ID can legitimately return it.

Exact defaults are documented in [Office and character behavior model](behavior-model.md#inactivity-completion-and-retirement).

## Local data inventory

| Location | Purpose and retained fields |
|---|---|
| `~/.cursor/hooks.json` | User-level passive Hook configuration managed only for Cursor Office entries |
| `%LOCALAPPDATA%/CursorOffice/events-v3` | Privacy-filtered normalized events, retained for ten minutes |
| `%LOCALAPPDATA%/CursorOffice/windows-v1` | Live-window heartbeats |
| `%LOCALAPPDATA%/CursorOffice/conversation-windows-v1` | Hashed conversation-to-window association |
| `%LOCALAPPDATA%/CursorOffice/usage-ledger.json` | Exact reported generation usage and aggregates |
| `%LOCALAPPDATA%/CursorOffice/activity-log.ndjson` | Last agent snapshots and slim privacy-safe activity timeline |
| `~/.cursor/projects/.../agent-transcripts` | Metadata only; file contents are not opened |
| `%APPDATA%/Cursor/User/globalStorage/state.vscdb` | Read-only lookup of conversation ID and title only |

Cursor Office has no local network listener. The Webview receives only the normalized projection produced by the extension and host.
