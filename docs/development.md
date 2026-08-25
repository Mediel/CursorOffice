# Lokální vývoj

## Nástroje

- .NET SDK 10.0.400+
- Visual Studio s workloady pro .NET a Node.js/TypeScript
- Node.js 22.12+
- pnpm 11

## .NET

```powershell
dotnet restore CursorOffice.slnx
dotnet build CursorOffice.slnx
dotnet test CursorOffice.slnx
```

Projekt používá warnings-as-errors. Společná pravidla jsou v `Directory.Build.props` a `.editorconfig`.

## Frontend a extension

```powershell
pnpm install
pnpm check
pnpm build
```

`CursorOffice.Webview` sestaví statické soubory do `CursorOffice.Extension/media`. `CursorOffice.Extension` následně vytvoří Node.js bundle do `CursorOffice.Extension/dist`.

Samostatný Vite náhled podporuje `?socialDemo=1` pro frontu reálných párových rozhovorů, `?groupDemo=sofa`, `?groupDemo=meeting` a `?groupDemo=standing` pro deterministické idle skupiny, `?crowdDemo=1` pro deterministický head-on test dvou agentů, `?workDemo=1` pro detail pracovního posedu, `?kitchenDemo=1` pro celý cyklus kávovar → nesení k pracovnímu nebo společenskému místu → několik doušků → návrat → mytí pod tekoucí vodou, `?couchDemo=1` pro přechod z walkable bodu na vizuální kotvu sedáku, `?ownerDemo=1` pro WASD chůzi majitele a následný návrat autonomie, `?attentionDemo=1` pro periodické upozornění agenta ve stavu `waitingForUser` a `?retirementDemo=1` pro zrychlený lifecycle odcházejícího podagenta. Stav scénáře je během testu dostupný v `data-kitchen-demo`, včetně `coffeePhase`, `coffeeState`, aktivity kávovaru a proudu vody. Crowd scénář musí skončit bočními waypointy a bezpečným minutím, nikoli posouváním stojící postavy.

Generované adresáře `media`, `dist`, `node_modules`, publikovaný C# host a hook bridge se necommitují.

## Spuštění C# hostu

```powershell
dotnet run --project src/CursorOffice.Host
```

Standardní výstup je strojově čitelný NDJSON. Pro diagnostické zprávy používejte `Console.Error`, nikdy `Console.Out`.

## Debug extension v Cursoru

Po `dotnet build` a `pnpm build` spusťte nové okno Cursoru s cestou k vývojové extension:

```powershell
$repoRoot = (Resolve-Path .).Path
Cursor.exe --new-window `
  --extensionDevelopmentPath="$repoRoot\src\CursorOffice.Extension" `
  $repoRoot
```

V tomto okně spusťte z Command Palette `Cursor Office: Open Office`. Po změně extension kódu použijte `Developer: Reload Window`; změna samotného Webview vyžaduje také `pnpm build`.

Výpis lokálního hostu je v Output panelu pod kanálem `Cursor Office`. Automatickou detekci lze přepsat nastavením `cursorOffice.hostPath`, které přijímá `.dll`, `.csproj` nebo spustitelný soubor.

## Test Cursor Hooks

Nainstalovaná extension spravuje uživatelskou konfiguraci `~/.cursor/hooks.json` příkazy `Install Global Hooks` a `Uninstall Global Hooks`. Bridge běží ze stabilní cesty `%LOCALAPPDATA%/CursorOffice/bridge` a sleduje všechny lokální Cursor workspaces.

Testovací pořadí:

1. `Developer: Reload Window`, aby extension spustila aktuální dlouho běžící host.
2. `Cursor Office: Open Office`.
3. V Output panelu zkontrolovat kanály `Cursor Office` a `Hooks`.
4. Spustit lokální hlavní agentní relaci nebo harness s více subagenty.
5. Ověřit příchod postav po hook události nebo po vzniku unikátního souboru v `agent-transcripts/<conversation>/subagents/`.

Hook je fail-open. Poslouchá také `beforeSubmitPrompt`, `preToolUse` a `subagentStart`, ale vrací prázdnou odpověď a žádnou akci neblokuje ani nemění. Syntetický end-to-end test musí poslat událost do `%LOCALAPPDATA%/CursorOffice/events-v3`; dva souběžné hosty ji musí oba převést na `agent.changed` a soubor zůstane do konce retenčního okna. Záložní `CursorTranscriptAgentEventSource` musí rozlišit hlavní transcript a každý podagentní soubor bez otevření jejich obsahu. Aktivní podagent musí navíc promítnout svého rodiče jako pracujícího koordinátora, i když je hlavní transcript starší než počáteční lookback. Terminální hook stav nesmí fallback přepsat; čerstvý transcript zápis může znovu nastavit `working` po neterminálním hook stavu. Aktivní podagent drží rodiče ve `working`. Výchozí fallback okno je 3 minuty, u podagenta s čerstvým rodičem až 8 minut; přesné ukončení řídí hooky.

## VSIX

Před balením musí být publikovány oba .NET procesy:

```powershell
dotnet publish src/CursorOffice.Host -c Release --no-self-contained -o src/CursorOffice.Extension/host
dotnet publish src/CursorOffice.Hook -c Release --no-self-contained -o src/CursorOffice.Extension/bridge
pnpm build
pnpm --filter cursor-office exec vsce package --no-dependencies --out ../../artifacts/CursorOffice.vsix
```
