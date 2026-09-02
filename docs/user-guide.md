# User guide

## What Cursor Office does

Cursor Office is a local editor tab for Cursor. It displays live Cursor windows, their main chats, and temporary subagents together in one 3D office.

It is not another chat client and does not directly control agents. It visualizes local events that Cursor or a compatible harness actually provides.

## Installation

The repository does not commit a generated VSIX. After following the [VSIX build instructions](development.md#build-a-vsix), install `artifacts/CursorOffice.vsix`:

```powershell
cursor.cmd --install-extension artifacts\CursorOffice.vsix --force
```

After installation or upgrade, run `Developer: Reload Window` in every Cursor window that was already open. Each window has its own extension host and may otherwise continue running an older C# process or Hook bridge.

Then run these commands from the Command Palette:

1. `Cursor Office: Install Global Hooks` — installs passive Hooks once for the local user.
2. `Cursor Office: Open Office` — opens the office as a regular editor tab.

Hooks are stored in `~/.cursor/hooks.json`. The command preserves unrelated Hook configuration and manages only Cursor Office entries. Remove them with `Cursor Office: Uninstall Global Hooks`.

## First verification

After opening the office, you should see the owner and one manager for every live Cursor window. A manager exists even when its window currently has no active chat.

Quick verification:

1. Open two Cursor windows with different workspaces.
2. Run `Developer: Reload Window` in both.
3. Open Cursor Office and select the `All windows` filter.
4. Expect two managers, for example `Manager Frontend` and `Manager Backend`.
5. Submit a prompt in one chat. Its window manager should react and the chat should appear as a working agent.
6. Start a harness with subagents. Each detected instance should receive a character under its parent chat.

Small delays are normal: the Hook spool is polled roughly every 150 ms, transcript metadata roughly every 300 ms, and window heartbeats renew every two seconds.

## Reading the hierarchy

```text
owner
└── Cursor window manager
    ├── main chat / working agent
    │   └── subagent / temporary worker
    └── another main chat
        └── its subagents
```

| Role | Meaning |
|---|---|
| Owner | The local user and only directly controlled character |
| Manager | One live Cursor desktop window |
| Main chat | One Cursor conversation assigned to that window |
| Senior agent | The same chat while coordinating active subagents |
| Subagent | One concrete delegated-work instance |

The manager aggregates a team but has no model generation or token usage of its own. Model, activity, and generation usage belong to the real chat or subagent.

Multiple chats in the same window appear as distinct agents under one manager. When a chat gains children, its existing character changes presentation to a senior agent rather than being duplicated.

## Camera controls

| Input | Action |
|---|---|
| Left drag | Orbit the camera |
| Middle drag or right drag | Pan across the floor plan |
| Mouse wheel | Zoom |
| `WASD` / arrows | Move the camera when the owner is not selected |
| `Q` / `E` | Rotate the view |
| `Home` or `0` | Restore the default camera position and target |

The camera position and target are retained in Webview state.

## Owner controls

- Click open floor to send the owner there through collision-safe navigation.
- Click the owner to select it; `WASD` or arrow keys then walk relative to camera direction.
- Press `Esc` to deselect the owner and return the keyboard to camera control.
- If the owner is seated, the stand-up transition completes before walking begins.

Manual input always wins. After nine seconds without manual movement, counted after arrival for a long clicked route, owner autonomy can resume. It may respond to a real handoff, monitor work from the owner's desk, visit an idle team member, or sit quietly. It never submits prompts or starts agents.

## Selection and labels

Click a character or its team card to select it. Selection keeps the inspector and expanded overhead label open.

The compact 3D label shows only the name. Hovering over the character or name expands state, model, current privacy-safe activity, and exact last-generation token evidence when enabled. The expanded label remains briefly after the pointer leaves.

Every manager, chat, and subagent also wears a standard white shirt badge. The owner does not.

### Reading colors

Two independent layers avoid confusing role with state:

- **Shirt color** is stable and identifies owner, manager, main chat/senior, or subagent.
- **Light ring and overhead-label color** changes with `working`, `waitingForUser`, `error`, `completed`, `idle`, `offline`, or `unknown`.

Role colors can be customized in Office Settings. State colors remain semantic.

## Team panel and filters

The team panel groups characters as workspace → Cursor window manager → main chat → subagent.

Available filters:

- `All windows` — the complete shared office
- a specific window — its manager, chats, and subagents
- `Unassigned` — conversations that could not be safely correlated with a desktop window

Filtering changes visibility only. Hidden characters continue holding state, position, reservations, and lifecycle. Showing them again does not respawn them at the entrance.

## States and rooms

| State | Typical behavior |
|---|---|
| `working` | Uses an available desk or standing hot desk |
| `waitingForUser` | Real agent stands, faces the owner, and periodically raises both hands |
| `error` | Goes to the debug lab with a concerned animation |
| `completed` | Brief celebration, then free time or retirement according to character type |
| `idle` | Lounge, kitchen, meeting room, gestures, coffee, and conversations |
| `offline` | Prepares to leave |
| `unknown` | Neutral behavior without claiming work |

POIs are exclusively reserved. If every work chair is occupied, extra agents use standing work positions rather than disappearing.

Idle characters can sit, stretch, wave, make coffee, and form conversations of two to four people. Coffee is a complete sequence: reserve the machine, prepare a cup, carry it, take repeated sips, reserve the sink, return the cup, and wash it. Real Cursor activity immediately preempts ambient behavior.

## Models, activity, tokens, and context

All four values are observational and appear only when a precise runtime source provides them.

| Value | Meaning | When missing |
|---|---|---|
| Model | `model` / `model_id` from a Hook; a subagent may report `subagent_model` | Cursor Office leaves it unknown rather than reading the UI |
| Activity | Privacy-safe tool, analysis, file basename, subagent task, or compaction label | Shows no current assignment; prompt text is never displayed |
| Tokens | Exact reported generation input/output/cache counters | Missing is unknown, not zero; the public Hook contract does not guarantee billing data |
| Context | Optional context-window fill from `preCompact` | Hidden until a Hook supplies numeric evidence |

Token data marked with an asterisk opens the local ledger. The ledger contains exact reported generation values grouped by total, full workspace path, model, workspace/model pair, and local day.

Each generation is counted once. Progressive counters are merged by maximum. The ledger does not estimate missing usage or price. Context-window fill is a separate value and is not added to the ledger.

Managers may show a clearly labeled workspace aggregate, not personal generation usage.

## What happens after completion

- A subagent attempts a handoff to its parent senior, remains briefly in free time, then exits through the door.
- A terminal main chat may also retire, but a merely inactive chat remains much longer to support returning to it.
- Closing a Cursor window ends its heartbeat. The manager exits and the host marks associated chats/subagents `offline` for short retention.
- New activity with the same stable identity can cancel retirement or bring the character back.

Exact timings are in [Inactivity, completion, and retirement](behavior-model.md#inactivity-completion-and-retirement).

## Office Settings

Click the gear in the HUD to open Office Settings. Changes write the same keys as Cursor Settings and update the open office immediately.

| Section | Options |
|---|---|
| Language | Automatic, Czech, or English |
| Name and logo | Office title and a PNG/JPEG/WebP/GIF logo up to 2 MB |
| Owner | Nickname; empty uses the local user name |
| Owner appearance | Hairstyle, hair color, skin tone, facial hair, and eyewear |
| Shirt colors | Owner, manager, main chat/senior, and subagent |
| Office display | Show model, tokens/context, and activity |

Display switches hide presentation in the team list, inspector, and 3D labels. They do not change data collection or ledger storage. `hostPath` is intentionally absent from this panel because it is a development/diagnostic override.

The same values are available in Cursor Settings:

| Setting | Meaning |
|---|---|
| `cursorOffice.ownerName` | Owner nickname; empty uses the local user name |
| `cursorOffice.ownerAppearance.*` | Owner hairstyle, colors, facial hair, and eyewear |
| `cursorOffice.officeName` | Header and editor-tab title |
| `cursorOffice.officeLogoPath` | Absolute logo path; empty uses office-name initials |
| `cursorOffice.language` | `auto`, `cs`, or `en`; auto uses Czech on Czech Windows and English otherwise |
| `cursorOffice.shirtColors.*` | Role shirt colors |
| `cursorOffice.hud.showModel` | Model in list, inspector, and 3D label |
| `cursorOffice.hud.showTokens` | Exact generation tokens and context-window fill |
| `cursorOffice.hud.showActivity` | Privacy-safe current activity |
| `cursorOffice.hostPath` | Optional host `.dll`, `.csproj`, or executable override |

You can also choose a logo with `Cursor Office: Select Office Logo`. An installed VSIX contains its published .NET host and normally needs no manual host path.

## Privacy and local files

Cursor Office does not use the Cursor Cloud API or run its own network server.

| Location | Contents |
|---|---|
| `~/.cursor/hooks.json` | User-level passive Hook configuration |
| `%LOCALAPPDATA%/CursorOffice/events-v3` | Privacy-filtered events with ten-minute retention |
| `%LOCALAPPDATA%/CursorOffice/windows-v1` | Live Cursor-window heartbeats |
| `%LOCALAPPDATA%/CursorOffice/conversation-windows-v1` | Hashed conversation-to-window associations |
| `%LOCALAPPDATA%/CursorOffice/usage-ledger.json` | Exact reported local token aggregates |
| `%LOCALAPPDATA%/CursorOffice/activity-log.ndjson` | Last snapshots and privacy-safe kind/tool/time/status timeline |
| `~/.cursor/projects/.../agent-transcripts` | File metadata fallback only; contents are not opened |
| `%APPDATA%/Cursor/User/globalStorage/state.vscdb` | Read-only conversation header/title lookup |

The bridge discards prompt text, response text, reasoning, file contents, commands, and tool output. A short subagent `task` or `description` may be sanitized and limited to 140 characters; result `summary` is discarded.

See [Local Cursor integration](cursor-integration.md) for the complete data model.

## Updating

After installing a new VSIX:

1. run `Developer: Reload Window` in every open Cursor window;
2. reopen Cursor Office;
3. allow extension activation to refresh an already-installed Hook bridge at its stable path; and
4. verify the version:

```powershell
cursor.cmd --list-extensions --show-versions | Select-String cursor-office
```

If the office still behaves unexpectedly, continue with [troubleshooting](troubleshooting.md).
