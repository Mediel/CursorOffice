# Cursor Office documentation

## For users

1. [User guide](user-guide.md) — installation, first verification, controls, filters, models, and tokens.
2. [Office and character behavior model](behavior-model.md) — exact meaning of managers, chats, and subagents; workflows, states, autonomy, and retirement.
3. [Troubleshooting](troubleshooting.md) — missing managers, stale states, old versions, models, tokens, and navigation.

## For developers

1. [Architecture](architecture.md) — components, dependency direction, Webview responsibilities, and security boundaries.
2. [Local development](development.md) — build, tests, extension debugging, demo modes, and VSIX packaging.
3. [Local Cursor integration](cursor-integration.md) — Hooks, metadata fallback, window correlation, and the privacy model.
4. [Communication protocol](protocol.md) — versioned NDJSON contract and the local broadcast spool.
5. [ADR-0001](adr/0001-hybrid-dotnet-typescript.md) — why the project uses .NET and TypeScript together.

## Visual direction and assets

1. [Visual and functional parity](visual-parity.md) — current quality and planned improvements.
2. [Lessons from The Delegation](upstream-lessons.md) — product principles adopted without copying code or assets.
3. [3D asset pipeline](3d-pipeline.md) — path from procedural geometry to original GLB models.
4. [Asset policy](../assets/README.md) — licensing, provenance, and validation rules.
5. [Roadmap](roadmap.md) — completed and planned milestones.

## Documentation ownership

| Change | Documentation to update |
|---|---|
| User-facing feature or control | root `README.md`, `user-guide.md` |
| Hierarchy, state, lifecycle, or timing | `behavior-model.md`, and possibly `cursor-integration.md` |
| Data source or privacy boundary | `cursor-integration.md`, `architecture.md`, root `README.md` |
| Extension ↔ host protocol | `protocol.md`; increment `protocolVersion` when incompatible |
| Build, test, or packaging process | `development.md` |
| New 3D asset | `3d-pipeline.md`, `assets/README.md`, and an asset manifest |

Documented timing must match the implementation. Constants such as owner manual override, heartbeat lease, fallback activity windows, host retention, and retirement delay must be documented in the same change that modifies them.
