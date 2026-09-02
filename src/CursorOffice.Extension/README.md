# Cursor Office

A local 3D office for observing Cursor windows, main chats, and subagents. The extension bundles a .NET 10 host, a passive Cursor Hooks bridge, and a Three.js office opened as a regular editor tab.

## First run

1. After installation or upgrade, run `Developer: Reload Window` in every open Cursor window.
2. Run `Cursor Office: Install Global Hooks` once.
3. Run `Cursor Office: Open Office`.

## Organization model

```text
owner
└── Cursor window manager
    └── main chat / working agent
        └── subagent / temporary worker
```

Each live Cursor window has one manager. Multiple chats in the same window are separate working agents under that manager. A main chat with active subagents is presented as a senior agent; its subagents are temporary workers.

All windows appear in one shared office. The window filter changes visibility only and does not reset characters or lifecycle state.

## Behavior

- A new prompt creates a visual `owner → manager → main chat` handoff.
- Delegation and completion connect a chat with concrete subagent instances.
- Working characters use desks; errors use the debug lab.
- A real chat or subagent in `waitingForUser` stands, faces the owner, and periodically raises both hands for attention.
- Idle characters may use the lounge or kitchen, sit, wave, make coffee, and talk.
- A completed subagent remains briefly after handoff, then exits.
- New activity with the same identity can cancel retirement or bring the character back.

Cursor Office only displays observed events. It does not submit prompts, assign work, or control agents.

## Controls

- Left drag: orbit
- Middle drag or right drag: pan
- Mouse wheel: zoom
- `WASD`/arrows: camera movement, or owner movement while selected
- Click the floor: move the owner
- `Q`/`E`: rotate the view
- `Home` or `0`: reset the camera
- `Esc`: deselect the owner

## Models, tokens, and privacy

Model and token data belongs to the real chat or subagent, not its window manager. Only exact values supplied by the runtime are shown; missing data is never estimated.

The integration runs locally and does not use the Cursor Cloud API. The bridge discards prompts, responses, reasoning, file contents, commands, and tool output. The fallback observes transcript file metadata only. On Windows, chat titles come from a narrow read-only lookup of conversation headers; message bodies are not read.

Diagnostics are available in the `Cursor Office` Output channel. Leave `Cursor Office: Host Path` empty for an installed build unless you are intentionally overriding host discovery.
