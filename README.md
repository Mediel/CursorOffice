# Cursor Office

Cursor Office is a local 3D visualization of AI agents running in Cursor IDE. It opens as a regular editor tab and turns Cursor windows, chats, and subagents into characters working together in a shared virtual office.

This is an original implementation. It does not reuse source code or 3D assets from The Delegation.

> **Project status:** functional interactive milestone. The extension starts a local .NET 10 host, consumes its versioned NDJSON stream, and observes Cursor through a privacy-filtered Hooks bridge plus transcript-file metadata fallback. ACP-based agent control is not implemented yet.

## Highlights

- One shared office for all locally detected Cursor windows and teams.
- Live hierarchy of window managers, main chats, senior agents, and subagents.
- Procedural Three.js office, characters, animation state machine, seating, rooms, and ambient social behavior.
- Collision-aware A* navigation, FIFO door traffic, dynamic avoidance, and reserved points of interest.
- Visual handoffs for prompts, delegation, subagent completion, and agent responses.
- Exact model and token metadata when Cursor provides it; missing values are never guessed.
- Local-only architecture with no Cursor Cloud API and no network service.
- English and Czech in-product UI.

For day-to-day use, see the [user guide](docs/user-guide.md). For exact lifecycle rules and timings, see the [behavior model](docs/behavior-model.md). If something looks wrong, start with [troubleshooting](docs/troubleshooting.md).

## Quick start

The repository does not contain generated binaries or a committed VSIX. Build and install a local package from the repository root:

```powershell
dotnet publish src/CursorOffice.Host -c Release --no-self-contained -o src/CursorOffice.Extension/host
dotnet publish src/CursorOffice.Hook -c Release --no-self-contained -o src/CursorOffice.Extension/bridge
pnpm install --frozen-lockfile
pnpm build
pnpm --filter cursor-office exec vsce package --no-dependencies --out ../../artifacts/CursorOffice.vsix
cursor.cmd --install-extension artifacts\CursorOffice.vsix --force
```

Run `Developer: Reload Window` in every Cursor window that was already open. Then run these commands from the Command Palette:

1. `Cursor Office: Install Global Hooks`
2. `Cursor Office: Open Office`

The extension, .NET host, hook bridge, Webview, activity log, and usage ledger all run locally.

## How Cursor maps to the office

```text
office owner (the user)
└── Cursor window manager
    ├── main chat / working agent
    │   └── subagent / temporary worker
    └── another chat in the same window
        └── its own subagents
```

| Office entity | Meaning |
|---|---|
| Owner | The single user-controlled character |
| Manager | One live Cursor desktop window |
| Main chat | One Cursor conversation assigned to that window |
| Senior agent | The same main chat while it coordinates subagents |
| Subagent | One concrete instance of delegated work |

Every recognized window and team appears in the same office. Opening Cursor Office in another window creates another view of the same local state, not another world. Window filters change visibility only; hidden characters keep their position, state, reservations, and lifecycle.

A manager is a presentation entity and therefore has no model generation of its own. Model and token data belongs to the actual chat or subagent. Multiple chats in one Cursor window appear as separate working agents under the same manager.

## Event-driven workflow

When a prompt is submitted in the focused Cursor window, the office can visualize this chain:

```text
owner ↔ active window manager
manager ↔ main chat / senior
senior ↔ subagents
```

- `beforeSubmitPrompt` starts the assignment flow without transferring prompt text.
- `subagentStart` brings a worker to its parent senior.
- `subagentStop` triggers a result handoff back to the senior.
- `afterAgentResponse` can carry the result through the manager to the owner.
- Interactions are queued so a character cannot hold several conversations at once.

Cursor Office only shows steps supported by an observed event. It never submits prompts, creates work, or fabricates a missing handoff for the sake of animation.

When agents are idle, they may use the lounge, meeting room, or kitchen, sit down, wave, stretch, make coffee, or join conversations of two to four people. Real Cursor events always preempt ambient scenes. Completed temporary workers remain briefly for a handoff and cooldown, then leave through the exit; new activity with the same identity can bring them back.

## Controls

| Input | Action |
|---|---|
| Left drag | Orbit the camera |
| Middle drag or right drag | Pan across the office |
| Mouse wheel | Zoom |
| `WASD` / arrow keys without the owner selected | Move the camera |
| `Q` / `E` | Rotate the view |
| `Home` or `0` | Reset the camera |
| Click open floor | Move the owner to that location |
| `WASD` / arrow keys with the owner selected | Walk relative to the camera |
| `Esc` | Deselect the owner and return the keyboard to camera control |

Manual owner movement always has priority. After nine seconds without input, counted from the end of a longer route, the owner may resume autonomous behavior: react to a real Cursor interaction, monitor work at the owner's desk, or visit an idle team member. Autonomy never creates Cursor work.

## Implemented today

- Installable Cursor/VS Code extension opened with `Cursor Office: Open Office`.
- Multi-room procedural low-poly office with a studio, debug lab, lounge, meeting room, kitchen, corridors, and interactive furniture.
- Procedural articulated characters with deterministic visual variety, facial animation, work poses, conversation, attention, celebration, error, and complete coffee-cycle animations.
- Selectable characters, team hierarchy, inspector, expandable 3D labels, state summaries, and configurable HUD details.
- Clear separation between permanent role colors and dynamic runtime-state colors.
- Dedicated `waitingForUser` attention behavior for real chats and subagents.
- Autonomous idle seating, gestures, coffee, and atomic multi-character social formations.
- Visibility-graph A* routing around walls and furniture, exclusive POI reservations, serialized narrow doors, dynamic character avoidance, and stuck-route recovery.
- Versioned extension-to-host NDJSON protocol over standard input/output.
- Privacy-filtered Cursor Hooks bridge and a ten-minute local broadcast spool shared safely by multiple Cursor windows.
- Window heartbeat registry, focused-window correlation, stable conversation identity, and parent/child subagent hierarchy.
- Read-only local chat-title lookup that reads headers only, never message bodies.
- Transcript metadata fallback based on path, size, and modification time without opening transcript contents.
- Local activity history and an exact, deduplicated token ledger grouped by workspace path, model, workspace/model, and day.
- Lifecycle retention and controlled retirement for completed, offline, or abandoned agents.
- Deterministic Webview demo scenarios for visual and behavioral development.

## Architecture

```text
Cursor Hooks ──> CursorOffice.Hook ──> local event spool ──┐
Cursor transcript metadata ────────────────────────────────┤
                                                          ▼
Cursor ACP (planned) ─────────────────────────> CursorOffice.Host
                                                          │ NDJSON / stdio
                                                          ▼
                                                CursorOffice.Extension
                                                          │ Webview messages
                                                          ▼
                                                CursorOffice.Webview
```

The repository combines:

- **.NET 10** for the domain model, orchestration, Cursor adapters, persistence, host, and hook bridge;
- **TypeScript** for the Cursor/VS Code extension adapter;
- **TypeScript and Three.js** for the 3D Webview;
- **xUnit** for .NET tests;
- **NDJSON over stdio** for local process communication.

```text
CursorOffice.slnx
├── src/
│   ├── CursorOffice.Core/             # domain types and rules
│   ├── CursorOffice.Application/      # application orchestration
│   ├── CursorOffice.Infrastructure/   # Cursor and storage adapters
│   ├── CursorOffice.Host/             # local .NET process
│   ├── CursorOffice.Hook/             # passive Cursor Hooks bridge
│   ├── CursorOffice.Extension/        # Cursor/VS Code extension
│   └── CursorOffice.Webview/          # Three.js office
├── tests/
│   └── CursorOffice.Core.Tests/
├── assets/                            # original or license-verified assets only
└── docs/
```

See the full [architecture document](docs/architecture.md) and [local protocol](docs/protocol.md).

## Requirements

- Windows with Cursor IDE
- .NET SDK 10.0.400 or a newer compatible feature band
- Node.js 22.12 or newer
- pnpm 11
- Visual Studio is optional, but supported for the combined solution

`global.json` pins the supported .NET SDK line. All C# projects target `net10.0`.

## Build and test

```powershell
dotnet restore CursorOffice.slnx
dotnet format CursorOffice.slnx --verify-no-changes
dotnet build CursorOffice.slnx
dotnet test CursorOffice.slnx

pnpm install --frozen-lockfile
pnpm check
pnpm build
```

Run the host independently with:

```powershell
dotnet run --project src/CursorOffice.Host
```

Standard output is reserved for machine-readable NDJSON. Diagnostics are written to standard error and appear in the `Cursor Office` Output channel when the extension owns the host.

## Installation details

The production build creates `artifacts/CursorOffice.vsix`. The generated directory is intentionally ignored and release packages can be attached to GitHub Releases.

The VSIX contains the Webview, extension, .NET host, and hook bridge. Global hooks are installed into `~/.cursor/hooks.json`; their stable runtime is copied to `%LOCALAPPDATA%/CursorOffice/bridge`. Cursor Office manages only its own hook entries and leaves unrelated configuration intact.

After upgrading, run `Developer: Reload Window` in every open Cursor window. Reloading only the Cursor Office tab is not enough because each window owns a separate extension host and local .NET process.

## Privacy and data accuracy

Cursor Office is a local observational tool. It has no cloud service, opens no network port, and does not use the Cursor Cloud API for live detection.

| Local source | Data used | Data excluded from the office |
|---|---|---|
| Cursor Hooks | session/generation ID, state, workspace, model, tool name, time, and optional token counters | prompt, response, reasoning, command, file contents, and tool output |
| Transcript metadata | path, size, and modification time | `.jsonl` contents |
| `composerHeaders` in `state.vscdb` | `composerId` and chat `name` | messages, FTS index, and chat contents |
| Window heartbeats | temporary ID, workspace, focus state, and time | editor and open-file contents |
| Usage ledger | generation, workspace, model, time, and exact counters | prompt, response, context contents, and price estimates |

A short subagent `task` or `description` may be sanitized and limited to 140 characters so the character inspector can explain the assignment. Result `summary` data is discarded.

Model names and token counts are displayed only when the runtime provides them. Missing values are unknown, not zero. Context-window usage reported by `preCompact` is kept separate from billed generation usage and is not written to the token ledger.

Read the detailed [Cursor integration and privacy model](docs/cursor-integration.md) before deploying Cursor Office in a sensitive environment.

## Documentation

- [Documentation index](docs/README.md)
- [User guide](docs/user-guide.md)
- [Office and character behavior model](docs/behavior-model.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Architecture](docs/architecture.md)
- [Local development](docs/development.md)
- [Communication protocol](docs/protocol.md)
- [Local Cursor integration](docs/cursor-integration.md)
- [Roadmap](docs/roadmap.md)
- [Visual and functional parity](docs/visual-parity.md)
- [Lessons from The Delegation](docs/upstream-lessons.md)
- [3D asset pipeline](docs/3d-pipeline.md)
- [ADR-0001: Hybrid architecture](docs/adr/0001-hybrid-dotnet-typescript.md)
- [Asset policy](assets/README.md)

## Contributing and security

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Please report vulnerabilities through the private process described in [SECURITY.md](SECURITY.md), not through a public issue.

## License and provenance

Cursor Office source code and documentation are available under the [MIT License](LICENSE). The MedielSoft name and logo are separate brand assets and are not licensed under MIT; see [NOTICE.md](NOTICE.md).

Every external asset must have documented provenance and a compatible license. See the [asset policy](assets/README.md).
