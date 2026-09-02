# Office and character behavior model

This document is the source of truth for what each character represents, where its state comes from, and how it moves between work, waiting, free time, and retirement.

Cursor Office is observational. It visualizes locally evidenced Cursor activity but does not assign real work to agents or intervene in their decisions.

## Organizational model

All detected Cursor windows and teams appear in one shared office. Opening `Cursor Office` in another window creates another view of the same local state. Window filters hide teams without deleting them or resetting their lifecycle.

```text
office owner (the user)
└── Cursor window manager
    ├── main chat / working agent
    │   └── subagent / temporary worker
    └── another active or recent chat
        └── its own subagents
```

| Character | Represents | Stable identity | Model and tokens |
|---|---|---|---|
| Owner | Local user | One character in the office | No model or runtime tokens |
| Manager | One live Cursor desktop window | Temporary extension-host identity plus heartbeat | Team summary only; no generation of its own |
| Main chat | One Cursor conversation | `conversation_id` | Hook model, generation usage, optional `preCompact` context, privacy-safe activity |
| Senior agent | A main chat currently coordinating children | Same `conversation_id` | Same runtime data as the main chat |
| Subagent | One concrete delegated-work instance | Subagent ID plus parent conversation ID | Its own model, usage, context, and activity only when reported |

A workspace or repository is organizational context, not automatically another character. Manager names use forms such as `Manager Frontend` or `Manager Backend`, with a short window suffix when several live windows share a workspace.

### Role and state use separate colors

Shirt color is stable and communicates role: owner, window manager, main chat/senior, or subagent. A separate light ring and overhead-label color communicates the dynamic runtime state.

Managers, chats, and subagents wear a horizontal white name badge with dark text; the owner does not. The owner's overhead label uses a distinct gold treatment. Character height, build, skin tone, hair color, and hairstyle vary deterministically by identity while remaining within navigation and seating constraints.

### One window can contain multiple chats

Every detected main chat is a separate working agent under the manager for that window. A chat without children is shown as an `Agent`. When it has active subagents, the same character becomes a `Senior agent`; no duplicate is created.

On Windows, a chat title is resolved from stable `conversation_id` through a read-only lookup in Cursor's `state.vscdb`. Only `composerId` and the `name` field in `composerHeaders` are read. Messages, prompts, responses, and the full-text index are not queried. When a header is unavailable, the safe fallback is `Agent <short ID>`.

### Detecting Cursor windows

Every activated extension window writes a heartbeat every two seconds. It contains a temporary window ID, extension-host PID, workspace label and roots, focus state, and time. A dead PID is removed immediately; an unreadable or missing PID falls back to a seven-second lease.

When a reopened logical window receives a new runtime ID, its manager can retain the existing visual character, position, and reservation. Two genuinely concurrent windows with the same workspace remain separate.

Cursor Hooks do not expose a public desktop-window ID. During `beforeSubmitPrompt`, the bridge correlates a conversation with the focused live window whose normalized workspace roots match. Windows URI paths such as `/c:/Users/...` are normalized before comparison. The association is stored under a cryptographic hash of the conversation ID. Ambiguous conversations remain in the `Unassigned` filter.

## Sources of truth and precedence

Cursor Office merges several local sources. A less precise estimate must not overwrite stronger evidence.

1. **Cursor Hooks** — primary source for prompt start, tools, response, delegation, handoff, failure, and termination.
2. **Local transcript file metadata** — fallback for workflows that omit a required Hook. Only path, size, and modification time are observed; `.jsonl` contents are never opened.
3. **Webview presentation projection** — derives managers, hierarchy, destinations, and animations from host state. It cannot change real Cursor state.

Older fallback metadata cannot cancel a terminal Hook state of `completed`, `offline`, or `error`. A genuinely newer transcript write may establish new `working` evidence for the same ID. When a `stop` event is missing and both Hooks and transcripts stop producing evidence, fallback expiry may demote non-terminal `working` to `idle`.

An active subagent keeps its parent conversation in `working` even after `afterAgentResponse`. Transcript metadata is polled at roughly 300 ms. A file is normally considered active for three minutes; a subagent may remain active for up to eight minutes while its parent transcript continues changing. The host applies the same evidence windows to activity-log snapshots restored after restart so stale `working` entries do not fill the office.

## Workflows and social handoffs

Social interactions are not random decoration when backed by a real Cursor signal. The Webview queues them so one character cannot talk to several people at once.

### New user assignment

```text
user submits a prompt
→ manager of the active Cursor window visits the owner
→ working agent for that chat receives the assignment from the manager
→ any subagents visit the senior agent for delegation
```

The signal comes from `beforeSubmitPrompt`. Prompt text never enters Cursor Office. The visual chain shows who received the assignment, not its contents.

### Delegation to a subagent

`subagentStart` creates or activates a concrete worker and links it to the parent chat. The subagent plans a safe route to the senior, both face one another, briefly alternate speaking and listening, then the worker moves to a work position. The parent chat is presented as a senior/coordination agent.

### Completion and handoff

```text
subagent completes work
→ returns to the senior with a handoff
→ main chat can pass the result to the manager
→ manager can pass the response to the owner
```

Only steps evidenced by Cursor or a compatible harness are shown. Cursor Office does not invent missing handoffs. A completed subagent's retirement deadline is paused while a queued handoff is still pending.

### Conversation queue

- A real pending interaction has priority over ambient conversation.
- A normal pair interaction lasts about 9.5 seconds.
- Participants return to their previous reserved destinations afterward.
- Return has a 24-second safety timeout.
- Manual owner control immediately interrupts a conversation involving the owner.
- Two participants use separate overhead-label heights while talking.

## State semantics

| State | Data meaning | Default destination and behavior |
|---|---|---|
| `working` | Generation, tool, or active subagent is in progress | Available desk; overflow uses standing hot desks outside door lanes |
| `waitingForUser` | Agent is awaiting a decision or user input | Real chat/subagent stands and requests attention; manager only aggregates |
| `error` | Tool or agent ended in failure | Debug lab with concerned animation |
| `completed` | Generation or delegated work completed | Brief celebration, lounge, then type-specific lifecycle |
| `idle` | Agent is known but no work is currently evidenced | Free POIs, lounge, kitchen, gestures, and conversations |
| `offline` | Session ended or its owning window disappeared | Lounge or retirement preparation |
| `unknown` | Identity is known but no precise state was supplied | Neutral behavior without claiming work |

State changes assign an appropriate point of interest. Desks, meeting seats, lounge positions, kitchen equipment, and debug positions are reserved so two characters never receive the same place. The office does not hide agents when chairs run out.

### Waiting for input and Plan mode

Cursor Office does not read plan or response text and cannot determine whether a plan contains a question by inspecting its words. It uses the generic runtime state `waitingForUser`.

A real main chat, senior, or subagent in this state:

- reserves an available standing attention point rather than a chair;
- leaves the ambient idle planner;
- faces the owner's current position;
- after roughly one to two seconds, raises both hands, looks up, and highlights the hand icon;
- repeats the gesture after roughly 9–15 seconds of quiet waiting; and
- stops immediately when a new Hook changes state or a real social interaction begins.

A synthetic window manager may aggregate `waitingForUser` for the team but never repeats the gesture. The character that can actually receive a reply is the one requesting attention.

## Inactivity, completion, and retirement

An invisible or unused chat tab is not a reliable Cursor lifecycle event, so lifecycle never depends on tab visibility alone.

### Main chat

- A real `completed` or `offline` state allows free time and eventual visual retirement.
- A merely inactive chat normally becomes `idle` and can remain in the host for up to 30 minutes from last activity so returning to it does not require a fresh entrance.
- `working` without a fresh Hook or transcript write becomes `idle` after three minutes. A subagent may use up to eight minutes when the parent remains fresh. This demotion does not change last-activity time, allowing an old restored snapshot to expire immediately under idle retention.
- `waitingForUser` uses the same host retention as `idle`: 30 minutes for a primary chat, two minutes for a subagent.
- A completed or failed primary snapshot has 20-minute host retention, although its visual worker may leave earlier after a terminal signal.
- `unknown` has ten-minute retention.
- A primary `offline` snapshot has 28-second retention.
- When a window heartbeat dies, the host marks its chats and subagents `offline`. Primary chats remain for 28 seconds and subagents for 12 seconds before removal.
- Transcript fallback cannot revive an offline agent without a new live `windowId`; new Hook activity associated with a live window can.
- New activity with the same `conversation_id` cancels departure or legitimately brings the character back.

### Subagent

- A completed, stopped, failed, or vanished subagent is marked for temporary retirement.
- An available handoff to its parent senior has priority.
- It may then wander, sit, celebrate, or make coffee for roughly 48–90 seconds, depending on terminal state and team order.
- After the deadline, it plans a route to the exit. Once exit begins, the Webview has a 42-second removal safety timeout.
- The host retains completed, failed, or idle subagents for at most two minutes and offline subagents for 12 seconds. Visual retirement may finish after the snapshot is removed.

### Window manager

A manager exists while the window heartbeat is alive. A terminated extension-host PID removes the record immediately; otherwise the seven-second lease is the fallback. The manager then starts a physical exit and the host marks its assigned chats and subagents `offline`.

Reopening the same logical window can rebind a new runtime ID to the existing visual manager so the office does not show an entering and departing duplicate. A manager is not a runtime agent and has no model, token generation, or Cursor task of its own.

All timings are current implementation defaults, not Cursor API guarantees. A queued conversation, door wait, or long collision-safe route may delay visual departure.

## Free time and emotions

An idle character does not remain permanently at the entrance. After reaching a reserved destination, it considers another action approximately every 22–40 seconds. It may:

- sit on a sofa or lounge chair;
- visit the meeting room;
- make, carry, drink, return, and wash coffee;
- look around, stretch, wave, or celebrate; or
- join a conversation of two to four characters.

The ambient social coordinator considers a new group approximately every 12–32 seconds, but only when no higher-priority real interaction is waiting. It chooses two to four available characters and an atomic formation: adjacent sofa seats, meeting-table seats, or an open standing group. The scene starts only after the final participant arrives. One member speaks while the others listen, and the speaker changes irregularly.

Time at a destination begins after actual arrival, not when the route starts. Current ranges include:

| Activity | Approximate duration |
|---|---:|
| Sofa | 18–58 seconds; completed agents may stay up to 72 seconds |
| Meeting seat | 12–46 seconds |
| Other idle destination | 10–48 seconds |
| Coffee preparation | 2–5 seconds |
| Fast drinker | 4–10 seconds |
| Normal drinker | 16–48 seconds |
| Slow drinker | 55–150 seconds |
| Cup washing | 4–7 seconds |
| Stretch | 3–7 seconds |
| Wave | 2–5 seconds |
| Look around | 2–6 seconds |
| Group conversation | 8–46 seconds, speaker changes every 1–5 seconds |

Coffee equipment is reserved separately. A cup is visible only after preparation and until washing completes. It remains upright while carried, rises to the mouth for repeated sips, and is washed under a visible water stream. A character with an empty cup finishes a current conversation before retrying a busy sink.

`working` always has priority. A working agent never starts a coffee cycle, and a transition to work immediately ends the current cycle, releases its POIs, and routes the agent to a computer.

A real prompt, response, delegation, or handoff preempts an ambient group. The group dissolves safely and the real event proceeds through the regular queue. A completed subagent's exit deadline pauses during the group and resumes afterward.

Durations are pseudo-random but derived from character identity, activity, and cycle order. They vary naturally while remaining stable per action and reproducible for diagnosis.

## Office owner

The owner is the only directly controlled character.

- Clicking open floor plans a collision-safe route to that location.
- With the owner selected, `WASD` or arrow keys move relative to the camera.
- Direct movement uses the same `walk` state as a planned path, including leg and arm animation.
- Manual input creates a nine-second autonomy override. For a long clicked route, the countdown starts on arrival.
- New manual input cancels an autonomous social sequence and always has priority.

After inactivity, owner autonomy prioritizes:

1. real Cursor conversations or handoffs;
2. monitoring active work at the owner's computer;
3. visiting an idle team member; and
4. sitting quietly when no appropriate partner exists.

Autonomy reevaluates roughly every 20–28 seconds. When someone is actively working, the owner usually monitors from the desk and only occasionally visits an idle agent. Autonomy never submits a prompt, starts an agent, or creates Cursor work.

## Navigation and avoidance

Static obstacles are part of the collision map. Visibility-graph A* routes around walls, desks, sofas, and other furniture. Studio and debug desks face one another across a central aisle so seated workers do not occupy door corridors.

Doors have FIFO traffic management. The first character actually entering a portal briefly reserves it; others wait before the threshold. A character merely working near a door does not hold the reservation.

Outside doors, the system predicts moving-character conflicts. Stable priority prevents both participants from oscillating, one may wait briefly, and side waypoints route around the obstruction. Seated and stationary characters become immediate dynamic obstacles.

A progress watchdog remains active even while yielding. If a local detour fails, it replans the full route with other characters represented as temporary circular obstacles. In a dense cluster where no safe route is available, the yielding character is released for about 1.1 seconds so dynamic separation can create space; stable priority then resumes.

Furniture seats keep a walkable approach point separate from the visual seat anchor, so a character can reach a sofa without walking through its collider.

## Names, activity, models, tokens, and context

The compact overhead label shows only the name. Hovering over a character or its name expands details and holds them briefly after the pointer leaves; selecting the character keeps them open. The team card exposes the same metadata.

Office Settings controls whether model, token/context, and activity details appear in the list, inspector, and 3D label. These switches hide presentation only; they do not change Hook processing or ledger storage.

Details can include:

- role and state;
- privacy-safe current activity such as tool name, generic analysis, file basename, subagent task, or context compaction;
- chat title;
- workspace and Cursor window;
- Hook-provided model and optional safe `thinking`, `effort`, and `context` controls;
- exact last-generation token counters; and
- context-window fill from `preCompact`, when supplied.

“Waiting for model evidence” means the runtime did not provide a model. Missing token data is not zero: the Hooks contract does not guarantee billing data, and Cursor Office does not estimate usage or price. Context-window fill is not generation usage and is not stored in the token ledger.

The local ledger deduplicates each generation, retains maximum progressive counters, and aggregates by total, full workspace path, model, workspace/model pair, and day.

## Filters

- `All windows` shows the complete shared office.
- A specific Cursor window shows its manager, chats, and subagents.
- `Unassigned` shows conversations that could not be safely correlated with a desktop window.

Filtering changes visibility only. A hidden character keeps its position, state, reservation, and lifecycle, and therefore does not respawn at the entrance when shown again.

## Current guarantees and limitations

- Cursor does not expose one public API containing all windows, chats, subagents, models, billed tokens, and context-window usage.
- Accuracy depends on Hooks emitted by the current Cursor version and harness. Billing tokens are not guaranteed; `preCompact` reports context, not billing.
- Changing the visible chat tab alone may not produce a lifecycle event.
- Missing model, token, or context data cannot be safely inferred from the UI.
- Social sequences display evidenced steps only; a missing Hook means a missing handoff animation.
- Cursor Office is observational. Clicking a character and owner autonomy do not send commands to agents.

See the [user guide](user-guide.md), [Cursor integration](cursor-integration.md), and [troubleshooting guide](troubleshooting.md) for practical use and diagnostics.
