# ADR-0001: Hybridní architektura C# a TypeScript

- Stav: přijato
- Datum: 2026-08-21

## Kontext

Cursor Office má být rozšíření Cursor IDE, ale hlavní aplikační logika má být napsaná v C#. VS Code Extension API je dostupné z JavaScript/TypeScript extension hostu a Webview vykresluje webový obsah.

## Rozhodnutí

Doména, aplikační orchestrace, Cursor adaptéry a persistence budou napsané v C# na .NET 10. Tenká extension vrstva a 3D Webview budou napsané v TypeScriptu. C# host bude samostatný lokální proces a s extension bude komunikovat verzovaným NDJSON protokolem přes stdio.

## Důsledky

Pozitiva:

- většina netriviální aplikační logiky zůstane v C#,
- doménu lze testovat bez Cursoru a browseru,
- nevznikne lokální síťová služba ani konflikt portů,
- rendering zůstane v prostředí, pro které je Three.js navržený.

Náklady:

- projekt používá dva jazyky a dva build toolchainy,
- kontrakt mezi procesy musí být explicitně verzovaný a testovaný,
- výsledný `.vsix` bude později obsahovat platformně specifický self-contained .NET host.

## Odmítnuté alternativy

- **Pouze TypeScript:** jednodušší balení, ale neodpovídá požadavku na C# jako hlavní aplikační jazyk.
- **Blazor WebAssembly pro celou Webview:** zvyšuje velikost a komplikuje vysokofrekvenční komunikaci s Three.js.
- **Lokální ASP.NET server:** zavádí port, životní cyklus služby a větší bezpečnostní plochu bez přínosu pro MVP.
