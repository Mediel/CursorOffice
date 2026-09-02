# Roadmap

## M0 — solution foundation

- [x] Original greenfield repository
- [x] Visual Studio `.slnx`
- [x] Layered .NET projects and tests
- [x] TypeScript `.esproj` projects
- [x] Architecture, protocol, and asset policy
- [x] Demonstration agent events

## M1 — editor tab

- [x] Extension Development Host
- [x] `Cursor Office` editor tab
- [x] Original procedural Three.js office
- [x] Extension-to-host integration
- [x] Owner, state zones, inspector, and camera controls
- [x] Webview split into world, character, navigation, contracts, and HUD responsibilities
- [x] A* navigation between points of interest
- [x] Serialized narrow-door traffic and deadlock prevention
- [x] Work seating, idle destinations, state emotions, and owner control
- [x] Reproducible VSIX packaging with `@vscode/vsce`
- [x] Bundled .NET host and Hook bridge

## M2 — real Cursor events

- [x] Passive Cursor Hooks bridge
- [x] Early filtering of prompts, reasoning, file contents, and tool output
- [x] End-to-end Hook → spool → host → `agent.changed` flow
- [x] Distinct concurrent subagent instances from transcript metadata
- [x] Normalized primary/subagent hierarchy and states
- [x] Local activity history
- [x] Owner-position persistence across projection updates and Webview restoration
- [x] Lifecycle TTL and controlled retirement
- [x] Exact local token aggregation by workspace, model, and day
- [x] Event-driven social interactions without reading conversation contents
- [x] Multi-window broadcast delivery without single-consumer races
- [x] User, lifecycle, timing, and troubleshooting documentation
- [x] Local-history restoration after a full extension restart

## M3 — agent control

- [ ] Cursor ACP adapter
- [ ] Start and stop an agent
- [ ] Assign follow-up work
- [ ] Permission approval flow

## M4 — original production 3D assets

- [ ] Final art direction
- [ ] Original modular office
- [ ] Original rigged characters
- [ ] Animation and expression set
- [ ] GLB, texture, and instancing optimization

## M5 — functional parity for Cursor

- [ ] Inspector with history, technical logs, and tool calls
- [ ] Kanban and activity timeline
- [x] Main-conversation/subagent hierarchy
- [ ] `waitingForUser` approval flow
- [ ] Navmesh derived from the final office
- [ ] Rigged characters with state-driven animation blending
- [x] Procedural state machine, POI reservation, and smooth sit/stand transitions
- [x] Local crowd avoidance and stuck-route watchdog
- [ ] Stable performance with dozens of concurrent agents
