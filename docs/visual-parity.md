# Visual and functional parity

The Delegation v0.2.0 is a quality reference, not a code or asset source. Cursor Office does not aim to reproduce its Gemini multimedia studio. The goal is comparable spatial clarity and agent transparency using local Cursor events.

## Current matrix

| Area | Cursor Office today | Next production step |
|---|---|---|
| 3D office | Original multi-room procedural layout | Original optimized GLB environment |
| Characters | Procedural articulated rig, face, and state machine | Blender/GLB rig preserving the same state contract |
| Movement | Visibility-graph A*, static collision, sliding, constant speed, reserved POIs | Navmesh generated from the final model |
| Interaction | Mouse/keyboard camera, persistence, raycasting, selection, accessible list, controllable owner | Context actions and approvals |
| Inspector | Role, task, state, model, exact last-generation tokens, privacy-safe timeline | Deeper history, tool calls, and usage dashboard |
| Live data | Cursor Hooks plus transcript metadata fallback, stable hierarchy and TTL cleanup | User-defined role names and ACP adapter |
| Workflow | State zones, furniture anchors, completion cooldown, exit, and removal | Timeline, Kanban, delegation, and review flow |
| Performance | One local bundle, capped DPR, shared render loop | Instancing, LOD, and profiling with dozens of agents |
| Asset licensing | Original or CC0 assets only; no upstream models | Export records and automated budget validation |

## Definition of parity

Parity is reached when a Cursor user can, without the Cursor Cloud API:

1. see all relevant local agents and their current activity;
2. understand delegation, human-wait states, and errors;
3. inspect history and technical details for each agent;
4. follow natural movement and animation in an original professional 3D office;
5. keep the Webview smooth at the target agent count; and
6. build, run, and use the entire solution locally.

Image, music, and video generation are outside this definition. They are a different product direction and do not fit a local, Cursor-first observational tool.

## Critical path

1. Stable subagent correlation and persistent activity history.
2. Inspector history and approval flow.
3. Blender vertical slice: one rigged character, one animation set, one office module.
4. GLB loading, animation blending, and navmesh.
5. Instancing, LOD, and performance measurement.
