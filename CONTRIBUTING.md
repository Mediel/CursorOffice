# Přispívání do Cursor Office

## Základní pravidla

- Nový C# kód musí mít zapnuté nullable reference types a projít buildem bez warningů.
- Doménová logika patří do `CursorOffice.Core`; nesmí záviset na Cursoru, Visual Studiu ani konkrétním úložišti.
- Integrace Cursor Hooks, ACP, souborového systému a databáze patří do `CursorOffice.Infrastructure`.
- Webview nesmí přistupovat přímo k souborovému systému ani spouštět procesy.
- Zprávy mezi procesy musí používat verzovaný kontrakt popsaný v `docs/protocol.md`.
- Do `assets` lze přidat pouze vlastní asset nebo asset s doloženou licencí a původem.

## Kontrola před změnou

```powershell
dotnet format CursorOffice.slnx --verify-no-changes
dotnet build CursorOffice.slnx
dotnet test CursorOffice.slnx
pnpm check
pnpm build
```

Každá změna veřejného protokolu musí aktualizovat dokumentaci protokolu a případné kontraktní testy.
