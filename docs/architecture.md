# Architecture

## Context

Cursor Office is a desktop extension for Cursor built on the VS Code Extension API. Editor integration must run in the Node.js extension host and graphics must run in a Webview. Domain, lifecycle, persistence, and Cursor-integration logic is intentionally isolated in local C# processes.

## Components

```text
Cursor Hooks ─┐
              ├──> CursorOffice.Hook (.NET 10, passive) ──> local event spool
              │                                             │
Transcript metadata ─────────────────────────────────────────┤
              ├──> CursorOffice.Host (.NET 10) <────────────┘
Cursor ACP ───┘     ├── infrastructure adapters
  (planned)         ├── application orchestration
                    ├── core agent model
                    ├── local token-usage ledger
                    └── local activity log
                               │
                               │ NDJSON / stdio
                               ▼
                    CursorOffice.Extension (TypeScript)
                               │
                               │ Webview messages
                               ▼
                    CursorOffice.Webview (Three.js)
```

## .NET layers

### CursorOffice.Core

Pure domain model: agent identity, status, `Primary`/`Subagent` kind, parent conversation, workspace, snapshots, safe model parameters, generation `TokenUsage`, and `ContextUsage` from `preCompact`. It has no infrastructure or UI dependency.

### CursorOffice.Application

Use-case orchestration. It converts incoming activity into current agent snapshots through event-source abstractions.

`AgentLifecycle` owns retention TTLs and the evidence window for silent `working` states. `OrphanedWindowAgentRetirer` marks chats belonging to dead window heartbeats as `offline`.

### CursorOffice.Infrastructure

Boundary adapters and local persistence:

- `CursorHooksAgentEventSource` reads the privacy-filtered `events-v3` spool as a retained broadcast. Every host has its own in-memory cursor; successful reads do not delete files, and expired files are cleaned only after retention.
- Workspace roots from Cursor 3.18 on Windows are normalized from `/c:/Users/...` URI form before heartbeat correlation.
- `CursorTranscriptAgentEventSource` observes only path, size, and modification time under `~/.cursor/projects`. It never opens transcript contents. UUID filenames distinguish the main session and each subagent instance.
- The transcript fallback uses three-minute activity evidence, extended to eight minutes for a subagent whose parent is still active. An active subagent keeps the parent in a coordination state.
- Terminal Hook evidence wins over older fallback metadata. A newer transcript write can reactivate an identity; expired fallback evidence can demote non-terminal `working` to `idle` when a stop event is missing.
- `CompositeAgentEventSource` merges the Hook and transcript streams.
- `CursorWindowPresenceDirectory` reads `windows-v1` heartbeats with the same seven-second lease and process-ID validation as the extension reporter.
- `CursorComposerHeaderStore` performs a narrow read-only lookup of `composerId` and chat `name` in Cursor's local database.
- `LocalUsageLedger` deduplicates runtime-reported generation tokens, merges progressive values by maximum, retains up to 50,000 records, and aggregates by full workspace path, model, workspace/model, and day. It never estimates missing usage. Context-window fill is not written to this ledger.
- `LocalActivityLog` is append-only NDJSON at `%LOCALAPPDATA%/CursorOffice/activity-log.ndjson`. It retains the last snapshot per agent and a slim timeline containing only kind, tool, time, and status.
- `AgentMonitor` preserves the last evidenced model, safe model parameters, usage, and context usage within the same generation when a later event omits them.

Future control adapters belong in this layer.

### CursorOffice.Host

A local console process owned by the extension. Standard input and output are reserved for the versioned NDJSON protocol; diagnostics go to standard error.

Startup order is deliberate:

1. Emit `host.ready` and the current `usage.changed` aggregate.
2. Restore the latest snapshots from `LocalActivityLog` into `AgentRegistry`.
3. Mark members of dead heartbeat windows as `offline`.
4. Demote restored `working` states without fresh evidence to `idle` without changing their last-activity time.
5. Apply the same TTL rules used by periodic cleanup.
6. Emit `agents.snapshot`.
7. Start live monitoring and cleanup loops.

Later `agent.changed` events and successful removals are appended to the activity log.

### CursorOffice.Hook

A short-lived passive process invoked by global Cursor Hooks. The extension installs it to a stable per-user path.

The process deliberately discards prompts, responses, reasoning, file contents, commands, and tool results. It keeps only normalized state metadata, an optional sanitized subagent task, model evidence, optional generation usage, safe model parameters, and separate context-window usage from `preCompact`. Events are written atomically to `%LOCALAPPDATA%/CursorOffice/events-v3`.

The Hook is fail-open and returns no permission decision.

## TypeScript projects

### CursorOffice.Extension

A thin adapter over the `vscode` API. It opens the Webview, owns the C# host lifecycle, manages the global Hook installation, reports window presence, and forwards messages.

`LocalHostClient` discovers a development or packaged host, starts it without a visible console window, validates protocol version 1, and merges `agent.changed` messages into the current projection. Domain decisions do not belong here.

### CursorOffice.Webview

The presentation boundary. It receives a normalized state projection and has no direct access to Node.js, the local file system, or the C# host.

Its responsibilities include:

- Three.js scene, lighting, camera, procedural office, and rendering loop;
- procedural articulated character rig and animation blending;
- state-driven seating, work, attention, error, completion, and idle behavior;
- interaction queues for prompt assignment, delegation, and handoff;
- deterministic ambient groups, gestures, and the complete coffee lifecycle;
- collision-aware navigation, door traffic, dynamic avoidance, and recovery;
- POI reservations, furniture approach points, and visual anchors;
- team hierarchy, filters, settings, inspector, labels, and usage views;
- user-controlled owner character and optional owner autonomy.

Characters working at a desk use an ergonomic pose aligned to the keyboard surface. Furniture keeps a safe walkable approach point separate from the visual seating anchor. The coffee maker and sink are independently reserved POIs; a real work event can preempt the entire coffee cycle and release its reservations.

The visibility graph plans around static AABB obstacles. Narrow doors use FIFO portal reservations. Outside door cores, the crowd system predicts conflicts, assigns stable priority, inserts side waypoints, and replans stuck routes with other characters treated as temporary circular obstacles. Extra workers use standing hot desks rather than being hidden when chairs run out.

The Webview is split into focused responsibilities:

```text
main.ts                              # composition root and host messages
contracts.ts                         # Webview data contract
ui/OfficeHud.ts                      # metrics, list, selection, inspector, ledger
ui/OfficeSettings.ts                 # language, branding, appearance, colors, visibility
world/OfficeWorld.ts                 # scene, camera, lifecycle, and social coordination
world/AnimatedCharacterController.ts # procedural rig and animation blending
world/CharacterStateMachine.ts       # declarative visual states and transitions
world/OfficeNavigation.ts            # visibility-graph A*, collision, and sliding
world/OfficePoiManager.ts            # reservations and overlap prevention
world/DoorTrafficManager.ts          # FIFO door reservation and deadlock protection
world/layout.ts                      # rooms, obstacles, POIs, and state destinations
```

## Organizational projection

Cursor does not publicly expose a reliable desktop-window ID. Each extension host therefore creates a temporary local identity, publishes workspace/focus heartbeats, and lets `beforeSubmitPrompt` establish an evidence-limited conversation association.

```text
owner (user)
└── workspace / repository
    └── Cursor window manager (local extension heartbeat)
        └── working agent / main conversation (stable conversation_id)
            └── temporary subagent / worker (subagent ID + parent ID)
```

An ambiguous conversation remains unassigned. A later prompt can move the same conversation to the currently focused matching window. Background events use the stored association; subagents inherit their parent's window.

The manager is a stable presentation entity created from heartbeat presence. It has no model or generation, but may display an explicitly labeled team/model summary and workspace usage aggregate. Main chats own runtime model and usage data; a chat with children is presented as a senior agent.

Procedural geometry is both the current renderer and a rapid layout tool. Future production GLB assets enter through the same `OfficeWorld` boundary, without changing the behavior state contract or HUD.

## Dependency direction

```text
Core <- Application <- Infrastructure
                   ^
                   └── Host
```

`Core` must never reference a higher layer. The TypeScript projects share only serialized messages, not C# assemblies.

## Security boundaries

- All runtime communication is local; no network listener is opened.
- The Webview uses Content Security Policy and loads packaged local resources only.
- The Webview remains a single local JavaScript bundle so nonce-based CSP does not require additional script origins.
- Prompt text and source-file contents never enter the 3D projection.
- Global Hooks are passive lifecycle observers and cannot allow, deny, or change agent actions.
- The usage ledger contains generation ID, time, full local workspace path, model, and four token counters only. Missing values are not estimated.
- Context-window fill stays on the current snapshot and is not written to the token ledger.
- The activity log stores last snapshots plus a privacy-safe timeline; it excludes prompt, response, reasoning, file bodies, and tool output.
- The only direct Cursor database query is read-only and limited to `composerId` and the `name` field in `composerHeaders`.
- Transcript fallback reads file-system metadata only and never opens transcript contents.
- The extension package metadata and public documentation are English; runtime UI remains intentionally localized in English and Czech.
