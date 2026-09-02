# Contributing to Cursor Office

Thank you for helping improve Cursor Office. Bug fixes, documentation updates, tests, performance work, and focused feature proposals are all welcome.

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- Open an issue before investing in a large feature or architecture change.
- Keep pull requests focused. Separate unrelated refactors from behavior changes.
- Never include prompts, responses, transcript contents, credentials, or private workspace data in an issue, fixture, log, screenshot, or commit.
- Review the [architecture](docs/architecture.md), [behavior model](docs/behavior-model.md), and [privacy boundaries](docs/cursor-integration.md) when changing runtime behavior.

## Architecture rules

- New C# code must use nullable reference types and build without warnings.
- Domain logic belongs in `CursorOffice.Core` and must not depend on Cursor, Visual Studio, the file system, or a concrete database.
- Cursor Hooks, ACP, file-system, and database integrations belong in `CursorOffice.Infrastructure`.
- The Webview must not access the local file system or start processes directly.
- Cross-process messages must use the versioned contract documented in `docs/protocol.md`.
- Only original assets or assets with documented provenance and a compatible license may be added under `assets`.
- Preserve the privacy model: discard prompt text, response text, reasoning, file contents, commands, and tool output at the earliest boundary.

## Local setup

Requirements and debugging instructions are in [docs/development.md](docs/development.md). Install dependencies with:

```powershell
dotnet restore CursorOffice.slnx
pnpm install --frozen-lockfile
```

## Validation

Run the complete local validation set before submitting a pull request:

```powershell
dotnet format CursorOffice.slnx --verify-no-changes
dotnet build CursorOffice.slnx
dotnet test CursorOffice.slnx
pnpm check
pnpm build
```

Add or update tests for behavior changes. A public protocol change must update `docs/protocol.md` and its contract tests. Changes to state, lifecycle, or timing must update `docs/behavior-model.md` in the same pull request.

## Pull requests

- Use an English title and description.
- Explain the user-visible outcome and any privacy or compatibility impact.
- Link the relevant issue when one exists.
- Include screenshots or a short recording for visual changes, but remove private data first.
- Document manual validation that cannot be covered by automated tests.
- Confirm that new dependencies and assets have compatible licenses.

By contributing, you agree that your contribution is licensed under the repository's [MIT License](LICENSE).
