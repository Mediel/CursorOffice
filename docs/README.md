# Dokumentace Cursor Office

## Pro uživatele

1. [Uživatelská příručka](user-guide.md) – instalace, první ověření, ovládání, filtry, modely a tokeny.
2. [Model kanceláře a chování postav](behavior-model.md) – přesný význam manažerů, chatů a subagentů, pracovní tok, stavy, autonomie a odchod.
3. [Diagnostika a řešení problémů](troubleshooting.md) – chybějící manažeři, neaktuální stavy, stará verze, modely, tokeny a navigace.

## Pro vývojáře

1. [Architektura](architecture.md) – komponenty, směry závislostí, Webview a bezpečnostní hranice.
2. [Lokální vývoj](development.md) – build, testy, debug extension, demonstrační režimy a VSIX.
3. [Integrace s lokálním Cursorem](cursor-integration.md) – hooky, fallback metadata, korelace oken a privacy model.
4. [Komunikační protokol](protocol.md) – verzovaný NDJSON kontrakt a lokální broadcast spool.
5. [ADR-0001](adr/0001-hybrid-dotnet-typescript.md) – důvod hybridní architektury .NET + TypeScript.

## Vizuální směr a assety

1. [Vizuální a funkční parita](visual-parity.md) – současná úroveň a plánované zlepšení.
2. [Poučení z The Delegation](upstream-lessons.md) – převzaté principy bez přebírání kódu nebo assetů.
3. [3D asset pipeline](3d-pipeline.md) – cesta od procedurální geometrie k vlastním GLB modelům.
4. [Pravidla pro assety](../assets/README.md) – licence, původ a validační pravidla.
5. [Roadmapa](roadmap.md) – dokončené a plánované milníky.

## Který dokument upravit při změně

| Druh změny | Povinná dokumentace |
|---|---|
| Nová uživatelská funkce nebo ovládání | root `README.md`, `user-guide.md` |
| Změna hierarchie, stavu, lifecycle nebo časování | `behavior-model.md`, případně `cursor-integration.md` |
| Změna datového zdroje nebo soukromí | `cursor-integration.md`, `architecture.md`, root `README.md` |
| Změna protokolu extension ↔ host | `protocol.md` a zvýšení `protocolVersion`, pokud není zpětně kompatibilní |
| Změna build/test/package procesu | `development.md` |
| Nový 3D asset | `3d-pipeline.md`, `assets/README.md` a evidence licence |

Časování v dokumentaci musí odpovídat implementaci. Pokud se mění například `ownerManualOverrideSeconds`, heartbeat, fallback `activeWindow`, host retention nebo retirement delay, musí se ve stejném commitu aktualizovat i [model chování](behavior-model.md).
