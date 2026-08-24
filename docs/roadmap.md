# Roadmapa

## M0 – základ solution

- [x] vlastní greenfield repozitář,
- [x] `.slnx` pro Visual Studio,
- [x] .NET vrstvy a testovací projekt,
- [x] TypeScript `.esproj` projekty,
- [x] architektura, protokol a pravidla assetů,
- [x] demonstrační události agentů.

## M1 – editorová záložka

- [x] spustit Extension Development Host,
- [x] otevřít příkazem záložku `Cursor Office`,
- [x] zobrazit vlastní procedurální Three.js kancelář,
- [x] propojit extension s C# hostem,
- [x] zobrazit tři demonstrační agenty,
- [x] přidat majitele, stavové zóny, detail a kamerové ovládání,
- [x] rozdělit Webview na svět, postavy, navigaci, kontrakty a HUD,
- [x] přidat vlastní A* pohyb mezi body zájmu,
- [x] serializovat provoz v úzkých dveřích a zabránit deadlocku více postav u futer,
- [x] přidat pracovní sezení, volnočasové cíle, stavové emoce a ovládání majitele,
- [x] přidat reprodukovatelné balení `.vsix` pomocí `@vscode/vsce`,
- [x] přibalit .NET host a hook bridge,
- [x] nainstalovat extension a globální hooks do lokálního Cursoru.

## M2 – skutečné Cursor události

- [x] navrhnout a implementovat pasivní Cursor Hooks bridge,
- [x] filtrovat prompt, reasoning, obsah souborů a tool output už v hook procesu,
- [x] ověřit end-to-end převod hook → lokální spool → host → `agent.changed`,
- [x] rozlišit souběžné instance podagentů podle lokálních metadat transcript souborů,
- [x] normalizovat stavy agentů a hierarchii primary/subagent,
- [ ] ukládat lokální historii,
- [x] zachovat pozici majitele při aktualizaci projekce a obnově Webview,
- [x] řízeně odvádět a odstraňovat ukončené agenty pomocí lifecycle TTL,
- [x] ukládat přesně oznámenou tokenovou spotřebu po workspace/modelu/dni bez cloud API,
- [x] převést chat, delegaci a handoff na frontované sociální interakce postav bez čtení obsahu konverzace,
- [x] distribuovat hook události všem současným Cursor oknům bez závodu nad jedním spool souborem,
- [x] zdokumentovat uživatelské ovládání, organizační model, lifecycle, časování a diagnostiku,
- [ ] obnovit lokální historii po úplném restartu extension.

## M3 – řízení agentů

- [ ] Cursor ACP adaptér,
- [ ] spuštění a zastavení agenta,
- [ ] předání dalšího úkolu,
- [ ] schvalování oprávnění.

## M4 – vlastní 3D produkce

- [ ] finální výtvarný směr,
- [ ] vlastní modulární kancelář,
- [ ] vlastní rigované postavy,
- [ ] sada animací a výrazů,
- [ ] optimalizace GLB, textur a instancingu.

## M5 – funkční parita pro Cursor

- [ ] inspector s historií, technickými logy a tool calls,
- [ ] kanban a časová osa činnosti,
- [x] základní vizualizace hierarchie hlavní konverzace/podagent,
- [ ] schvalovací tok pro `waitingForUser`,
- [ ] navmesh odvozený z finální kanceláře,
- [ ] rigované postavy se stavovým animation blendingem,
- [x] procedurální stavový automat, POI rezervace a plynulé přechody sednutí/vstávání,
- [x] lokální crowd avoidance s boční objížďkou a watchdogem zaseknutých tras,
- [ ] stabilní výkon pro desítky souběžných agentů.
