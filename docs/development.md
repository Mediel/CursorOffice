# Local development

## Toolchain

- .NET SDK 10.0.400 or newer compatible feature band
- Node.js 22.12 or newer
- pnpm 11
- Optional: Visual Studio with .NET and Node.js/TypeScript workloads

## .NET

```powershell
dotnet restore CursorOffice.slnx
dotnet format CursorOffice.slnx --verify-no-changes
dotnet build CursorOffice.slnx
dotnet test CursorOffice.slnx
```

Warnings are treated as errors. Shared rules live in `Directory.Build.props` and `.editorconfig`.

## Frontend and extension

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

`CursorOffice.Webview` writes static assets to `CursorOffice.Extension/media`. `CursorOffice.Extension` then creates the Node.js bundle in `CursorOffice.Extension/dist`.

The standalone Vite preview accepts deterministic demo query parameters:

- `?socialDemo=1` — queued pair conversations driven by event-shaped signals
- `?groupDemo=sofa`, `meeting`, or `standing` — idle social groups
- `?crowdDemo=1` — two-agent head-on avoidance
- `?workDemo=1` — detailed seated work pose
- `?kitchenDemo=1` — complete make, carry, drink, return, and wash coffee cycle
- `?couchDemo=1` — walkable approach point to visual sofa anchor
- `?ownerDemo=1` — owner movement followed by autonomy
- `?attentionDemo=1` — periodic `waitingForUser` attention behavior
- `?retirementDemo=1` — accelerated departing-subagent lifecycle

Generated `media`, `dist`, `node_modules`, published host/bridge folders, and VSIX packages must not be committed.

## Run the C# host

```powershell
dotnet run --project src/CursorOffice.Host
```

Standard output is machine-readable NDJSON. Write diagnostics to `Console.Error`, never `Console.Out`.

## Debug the extension in Cursor

After `dotnet build` and `pnpm build`, open a new Cursor window with the development extension:

```powershell
$repoRoot = (Resolve-Path .).Path
Cursor.exe --new-window `
  --extensionDevelopmentPath="$repoRoot\src\CursorOffice.Extension" `
  $repoRoot
```

Run `Cursor Office: Open Office` from the Command Palette. After extension-code changes, use `Developer: Reload Window`. A Webview-only change still requires `pnpm build`.

Host diagnostics are available in the `Cursor Office` Output channel. `cursorOffice.hostPath` can override automatic host discovery with a `.dll`, `.csproj`, or executable path.

## Test Cursor Hooks

The installed extension manages its entries in `~/.cursor/hooks.json` through `Install Global Hooks` and `Uninstall Global Hooks`. The bridge runs from `%LOCALAPPDATA%/CursorOffice/bridge` and observes all local Cursor workspaces.

Recommended sequence:

1. Run `Developer: Reload Window` so the current extension starts the current host.
2. Open Cursor Office.
3. Inspect the `Cursor Office` and `Hooks` Output channels.
4. Start a local main-agent session or a harness with multiple subagents.
5. Verify that characters appear from Hook events or unique files under `agent-transcripts/<conversation>/subagents/`.

The hook is fail-open: it returns an empty response and never blocks or changes an action. A synthetic end-to-end test should place an event in `%LOCALAPPDATA%/CursorOffice/events-v3`; two concurrent hosts must both emit `agent.changed`, and the spool file must survive until retention cleanup. The transcript fallback must distinguish main and subagent files without opening their contents.

## Build a VSIX

Publish both .NET processes before packaging:

```powershell
dotnet publish src/CursorOffice.Host -c Release --no-self-contained -o src/CursorOffice.Extension/host
dotnet publish src/CursorOffice.Hook -c Release --no-self-contained -o src/CursorOffice.Extension/bridge
pnpm build
pnpm --filter cursor-office exec vsce package --no-dependencies --out ../../artifacts/CursorOffice.vsix
```
