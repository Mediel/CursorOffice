# Cursor Office

Cursor Office je lokální vizualizace AI agentů pro Cursor IDE. Otevírá se jako editorová záložka a zobrazuje agenty jako postavy ve vlastní 3D kanceláři. Projekt vzniká jako původní implementace; nepřebírá zdrojový kód ani 3D assety z projektu The Delegation.

> Stav projektu: funkční interaktivní 3D milestone. Extension automaticky spouští lokální .NET 10 host a přijímá jeho NDJSON události. Pasivní globální Cursor Hooks bridge a lokální pozorování metadat transkriptů jsou implementované; ACP a ovládání agentů ještě ne.

## Rychlá orientace

- [Jak kancelář mapuje Cursor](#jak-kancelář-mapuje-cursor)
- [Typický pracovní průběh](#typický-pracovní-průběh)
- [Ovládání](#ovládání)
- [Instalace do Cursoru](#instalace-do-cursoru)
- [Soukromí a přesnost dat](#soukromí-a-přesnost-dat)
- [Vývoj a Visual Studio](#první-sestavení)
- [Kompletní dokumentace](#dokumentace)

Pro běžné používání pokračujte [uživatelskou příručkou](docs/user-guide.md). Přesnou hierarchii, stavy, předávání práce, časování neaktivity a odchodu popisuje [model kanceláře a chování postav](docs/behavior-model.md). Pokud něco neodpovídá očekávání, použijte [diagnostiku](docs/troubleshooting.md).

## Rychlý start

Repozitář neobsahuje generované binární soubory ani VSIX. Z kořene klonu vytvořte lokální balíček a nainstalujte ho:

```powershell
dotnet publish src/CursorOffice.Host -c Release --no-self-contained -o src/CursorOffice.Extension/host
dotnet publish src/CursorOffice.Hook -c Release --no-self-contained -o src/CursorOffice.Extension/bridge
pnpm install --frozen-lockfile
pnpm build
pnpm --filter cursor-office exec vsce package --no-dependencies --out ../../artifacts/CursorOffice.vsix
cursor.cmd --install-extension artifacts\CursorOffice.vsix --force
```

Potom v každém již otevřeném Cursor okně spusťte `Developer: Reload Window`. Z Command Palette jednou spusťte `Cursor Office: Install Global Hooks` a následně `Cursor Office: Open Office`.

Kancelář nepoužívá Cursor Cloud API. Extension, .NET 10 host, hook bridge, Webview i ledger běží lokálně.

## Jak kancelář mapuje Cursor

```text
majitel kanceláře (uživatel)
└── manažer Cursor okna
    ├── hlavní chat / pracovní agent
    │   └── subagent / dočasný pracovník
    └── další hlavní chat ve stejném okně
        └── jeho vlastní subagenti
```

| Úroveň | Význam |
|---|---|
| Majitel | Jedna uživatelsky ovladatelná postava |
| Manažer | Jedno živé desktopové okno Cursoru, například `Manažer Frontend` |
| Hlavní chat | Jedna konverzace pod manažerem daného okna |
| Vedoucí agent / senior | Tentýž hlavní chat ve chvíli, kdy koordinuje subagenty |
| Subagent / pracovník | Jedna konkrétní instance delegované práce |

Všechna rozpoznaná okna a týmy jsou v jedné společné kanceláři. Otevření Cursor Office v jiném okně je další pohled na stejná lokální data. Filtr okna mění pouze viditelnost; skryté postavy dál drží stav, pozici a lifecycle.

Manažer je prezentační entita, a proto nemá vlastní model ani generaci. Model a tokeny patří skutečnému chatu nebo subagentovi. Více současných chatů v jednom Cursor okně znamená více samostatných pracovních agentů pod jedním manažerem.

## Typický pracovní průběh

Po odeslání promptu v zaměřeném Cursor okně se vizuálně odehraje:

```text
majitel ↔ manažer aktivního okna
manažer ↔ hlavní chat / senior
senior ↔ subagenti
```

- `beforeSubmitPrompt` vyvolá převzetí zadání bez přenosu jeho textu,
- `subagentStart` přivede pracovníka k rodičovskému seniorovi,
- `subagentStop` vyvolá handoff výsledku zpět seniorovi,
- `afterAgentResponse` může předat výsledek přes manažera majiteli,
- sociální kroky se frontují, aby jedna postava nevedla několik rozhovorů současně.

Cursor Office zobrazuje jen kroky doložené skutečnou událostí. Neodesílá prompty, nevytváří úkoly a nedoplňuje chybějící handoff pouze kvůli animaci.

Když agent nepracuje, může jít do lounge, zasedačky nebo kuchyňky, sednout si, zamávat, protáhnout se či se zapojit do dvou- až čtyřčlenné konverzace. Káva je úplná rezervovaná sekvence: postava přijde ke kávovaru, počká na přípravu, odnese si hrnek na volné místo, při několika doušcích jej drží před tělem a zvedá k ústům, potom počká na volný dřez, vrátí prázdný hrnek a umyje jej pod tekoucí vodou. Hrnek ani ikona kávy se mimo tuto sekvenci nezobrazují. Skupiny mohou sedět vedle sebe na gauči, vést poradu kolem stolu nebo vytvořit stojící hlouček. Místa se rezervují atomicky, rozhovor začne až po příchodu celé skupiny a skutečný Cursor prompt, delegace či handoff ambientní scénu okamžitě přeruší. Dokončený subagent před odchodem dostane čas na handoff a volný režim. Pouze neaktivní hlavní chat zůstává výrazně déle než terminálně dokončený pracovník a nová aktivita stejného ID jej znovu oživí.

## Ovládání

| Vstup | Chování |
|---|---|
| Levé tažení | Otočení kamery |
| Stisknuté kolečko nebo pravé tažení | Posun kamery po kanceláři |
| Kolečko | Zoom |
| `WASD` / šipky bez vybraného majitele | Posun pohledu |
| `Q` / `E` | Otočení pohledu |
| `Home` nebo `0` | Reset kamery |
| Kliknutí na volnou podlahu | Majitel dojde na místo |
| `WASD` / šipky s vybraným majitelem | Přímá chůze majitele relativně ke kameře |
| `Esc` | Zrušení výběru majitele a návrat kláves kameře |

Ruční pohyb majitele má vždy prioritu. Po devíti sekundách nečinnosti, počítaných až od dokončení delší trasy, může majitel znovu přejít do autonomie: reagovat na skutečnou Cursor interakci, jít monitorovat práci ke svému PC nebo navštívit volného člena týmu. Autonomie nikdy sama nezadává práci.

## Co už funguje

- příkaz `Cursor Office: Open Office` otevře kancelář jako editorovou záložku,
- vlastní procedurální low-poly budova s ředitelnou, pracovním studiem, debug laboratoří, lounge, zasedačkou, kuchyňkou a chodbami; základ tvoří tlumená dřevěná podlaha s nepravidelnými odstíny prken, jemnou kresbou, spárami a nízkým leskem,
- kompletní MedielSoft logo uprostřed lounge stěny naproti gauči a konferenčnímu stolku; originální PNG je uložen přímo mezi lokálními assety aplikace a vykresluje se celé, bez ořezu nebo změny barev, jako transparentní nástěnná malba se zeleným kruhem a bílým nápisem — při změně kamery zachovává polohu a přirozeně přebírá perspektivu stěny,
- majitel kanceláře se jménem z lokálního systému nebo z nastavení,
- volná pozorovací kamera: levým tažením změna úhlu, tažením stisknutého kolečka nebo pravého tlačítka posun po kanceláři, kolečkem zoom, WASD přesun pohledu, Q/E otočení a `Home` reset; pozice i cíl kamery se uchovávají,
- kliknutí na volnou podlahu pošle majitele na místo bez předchozího výběru; po výběru majitele řídí WASD jeho postavu včetně plné animace chůze a `Esc` vrací klávesy kameře,
- výběr postavy, detail agenta, týmový panel a souhrn stavů,
- jednotná dvouvrstvá legenda: stálá barva košile rozlišuje majitele, manažera okna, hlavní chat/seniora a subagenta, zatímco proměnná barva světelného kruhu a jmenovky nad hlavou znamená runtime stav; každý zaměstnanec má navíc standardní vodorovnou bílou jmenovku připnutou na košili (majitel ji nenosí) a postavy mají deterministicky různou výšku, stavbu těla, odstín pokožky, barvu vlasů a účes včetně plešatých variant,
- kompaktní jmenovky nad postavami; po najetí na postavu nebo jméno se plynule rozbalí stav, model, aktuální činnost a přesně zaznamenané tokeny poslední generace, po odjetí zůstanou krátce otevřené a u vybrané postavy trvale,
- vlastní deklarativní stavový automat postav s plynulým sednutím/vstáváním, prací u klávesnice, hovorem, nasloucháním, rozhlížením, máváním, protažením, úplným cyklem přípravy–pití–vrácení–mytí kávy, oslavou a chybovou emocí,
- výrazné upozornění `waitingForUser`: skutečný chat/senior nebo subagent stojí, natočí se k majiteli, podívá se vzhůru a periodicky zamává oběma rukama nad hlavou; manažer okna pouze agreguje stav a gesto neopakuje,
- ergonomický pracovní posed s rukama na stole a jemným psaním; každý stůl má samostatnou klávesnici, klávesy, podložku a myš,
- nepravidelné mrkání, gesta i vsedě a autonomní volnočasové chování: hotový hlavní agent zůstává v kanceláři, volní agenti střídají lounge, poradu, kuchyňku a volná místa, mávají majiteli, protahují se, absolvují rezervovaný kávový cyklus od kávovaru až po umytí hrnku a vytvářejí dvou- až čtyřčlenné konverzace na gauči, kolem poradního stolu i ve stojících hloučcích; délka posezení, gest, pití, rozhovorů i střídání mluvčích se mění v přirozených rozsazích pro každou další aktivitu,
- sociální sekvence odvozené z reálných Cursor událostí: při novém chatu přijde agent za majitelem, při delegaci nebo handoffu podagent za rodičem; postavy se natočí, střídají mluvení/naslouchání a vrátí se ke své činnosti,
- ruční pohyb majitele má devítisekundový override; po nečinnosti se vrátí autonomie, která dává přednost skutečným Cursor rozhovorům a předáním, jinak jej pošle k pracovnímu stolu nebo za volným členem týmu; libovolný nový ruční pohyb autonomní akci přeruší,
- fronta rozhovorů chrání jednu postavu před několika souběžnými návštěvami, terminální podagent neodejde před předáním a jmenovky účastníků používají dvě výškové úrovně,
- visibility-graph A* nad kolizní mapou; agenti i majitel obcházejí stěny, stoly, sedačku a další nábytek dveřmi,
- jednosměrná rezervace úzkého dveřního průchodu s FIFO frontou; postavy čekají před prahem a separace je netlačí do futer,
- dynamické vyhýbání postavám: stabilní právo přednosti, krátké vyčkání, boční objížďka se zachováním původního cíle a watchdog, který i během dávání přednosti přepočítá zaseknutou trasu s ostatními postavami jako dočasnými překážkami,
- plynulá chůze nezávislá na FPS, procedurální kloubový rig s obličejem, mrkáním, emocemi a klidovými mikroanimacemi,
- exkluzivní rezervace pracovních židlí, míst na poradě, v lounge a debug zóně; skupinová scéna rezervuje celou sousední formaci atomicky, takže se agenti nepřekrývají ani nevymění místa napůl rozběhnuté konverzace,
- nábytkové POI odděluje bezpečný bod příchodu od vizuální kotvy: postava dojde před gauč, plynule dosedne přímo na sedák a použije uvolněný gaučový posed; geometrie, kolize a kotvy vycházejí ze stejné fixture definice,
- lokální extension → .NET 10 host komunikace přes verzovaný NDJSON protokol,
- globální privacy-filtered Cursor Hooks bridge pro živé `beforeSubmitPrompt`, tool, subagent start/stop, failure a completion události ze všech lokálních Cursor oken; práce se projeví už při odeslání promptu nebo startu nástroje,
- retenční broadcast hook událostí pro více současných Cursor oken; každý lokální host obdrží stejnou událost a žádný ji destruktivně neodebere ostatním,
- lokální registr otevřených Cursor oken s heartbeat, PID extension hostu, workspace a stavem zaměření; mrtvé lease se okamžitě uklízejí a znovuotevřené logické okno převezme existující postavu manažera, zatímco dvě skutečně živá okna stejného repozitáře zůstávají odlišná,
- skutečný název hlavního Cursor chatu jako identita pracovního agenta; čte se pouze lokální hlavička `composerId + name`, nikoli obsah zpráv,
- filtr všech oken, konkrétního okna a nezařazených konverzací; týmový panel skládá `workspace → manažer Cursor okna → agent hlavního chatu → podagenti` a podagent dědí týmovou zónu rodiče,
- každé živé Cursor IDE okno má vždy právě jednoho manažera, například `Manažer Frontend` nebo `Manažer Backend`, i když v něm právě neběží chat; manažer agreguje stav okna, ale model a tokeny zůstávají u skutečných agentů,
- hlavní chat je pracovní agent pod manažerem; bez podagentů vystupuje jako `Agent`, při delegování se dynamicky změní na `Vedoucí agent` / seniora a jeho podagenti tvoří pracovní tým,
- podagent používá obecné jméno `kontext rodičovského chatu · typ/role · krátké ID`; vlastní Cursor/harness role se převede na čitelný tvar a hover detail ukáže krátký delegovaný úkol i aktuální nástrojovou činnost,
- verzovaný broadcast kanál `events-v3`, který nemohou spotřebovat starší destruktivní hosty již běžící v jiných Cursor oknech,
- záložní čistě lokální detekce hlavních agentů a unikátních instancí podagentů podle metadat souborů v `~/.cursor/projects`; aktivní podagent současně drží svého hlavního agenta ve stavu práce/koordinace,
- obecná hierarchie `majitel → workspace → manažer Cursor okna → agent hlavního chatu → subagent`, stabilní identity a časově omezený lifecycle ukončených instancí,
- model každé postavy, pokud jej Cursor oznámí, a otevíratelný privacy-preserving lokální tokenový ledger po úplné cestě workspace, modelu, kombinaci workspace/model a dni,
- skutečné hook stavy mají přednost před fallback odhadem podle času transcriptu, takže ukončenou práci znovu falešně neaktivuje starší metadata souboru,
- pouze neaktivní hlavní chat zůstává dlouhodobě jako člen kanceláře; terminálně dokončený pracovní agent a dočasný podagent po dokončení, zastavení, chybě nebo zániku instance krátce odpočívají či se potulují a až poté odejdou dveřmi. Zánik heartbeat Cursor okna odvede manažera i k němu přiřazené chaty,
- rozložení a týmový panel ověřené s deseti současnými agenty,
- samostatný demonstrační režim Webview pro vývoj scény; instalovaná extension při prázdném hostu nevytváří fiktivní agenty.

## Rozsah současného milníku

- instalovatelné Cursor/VS Code rozšíření (`.vsix`),
- kancelář otevřená jako záložka `Cursor Office`,
- lokální C# host přijímající události z Cursor Hooks; ACP adaptér je další plánovaná integrační vrstva,
- vlastní Three.js scéna, modely a animace,
- stavy agentů `idle`, `working`, `waitingForUser`, `error`, `completed` a `offline`,
- detail agenta a lokální historie činnosti.

## Technologie

- **.NET 10 (`net10.0`)** – doména, aplikační logika, integrace a lokální host,
- **TypeScript** – tenká vrstva Cursor/VS Code Extension API,
- **TypeScript + Three.js** – 3D kancelář ve Webview,
- **NDJSON přes standardní vstup/výstup** – lokální komunikace mezi extension a C# hostem,
- **xUnit** – C# testy.

## Struktura

```text
CursorOffice.slnx
├── src/
│   ├── CursorOffice.Core/             # doménové typy a pravidla
│   ├── CursorOffice.Application/      # aplikační orchestrace
│   ├── CursorOffice.Infrastructure/   # Cursor a úložné adaptéry
│   ├── CursorOffice.Host/             # lokální .NET proces
│   ├── CursorOffice.Extension/        # Cursor/VS Code extension
│   └── CursorOffice.Webview/          # Three.js kancelář
├── tests/
│   └── CursorOffice.Core.Tests/
├── assets/                            # pouze vlastní nebo prověřené assety
└── docs/
```

Podrobnosti jsou v [architektonickém dokumentu](docs/architecture.md). Rozdíl proti referenčnímu projektu a přesná definice cílové parity jsou v [matrici vizuální a funkční parity](docs/visual-parity.md).

## Požadavky

- Visual Studio s podporou .NET 10 a JavaScript/TypeScript projektů,
- .NET SDK 10.0.400 nebo novější feature band,
- Node.js 22.12 nebo novější,
- pnpm 11.

`global.json` drží projekt na podporované řadě SDK 10.0.400. Všechny C# projekty cílí na `net10.0`.

## První sestavení

```powershell
dotnet restore CursorOffice.slnx
dotnet build CursorOffice.slnx
dotnet test CursorOffice.slnx

pnpm install
pnpm build
```

Lokální C# prototyp lze spustit samostatně:

```powershell
dotnet run --project src/CursorOffice.Host
```

Na standardní výstup zapíše `host.ready` a zůstane spuštěný. Události z lokální Cursor spool fronty převádí průběžně na NDJSON `agent.changed`; ukončení je přes `Ctrl+C`.

Při vývoji extension host najde sestavený `CursorOffice.Host.dll` automaticky. V instalované verzi lze cestu přepsat nastavením `Cursor Office: Host Path`. Jméno majitele lze změnit přes `Cursor Office: Owner Name`.

## Instalace do Cursoru

Produkční build vytváří lokální balíček `artifacts/CursorOffice.vsix`. Adresář `artifacts/` je záměrně ignorovaný; distribuční balíčky mohou být později přiloženy ke GitHub Releases. VSIX obsahuje Webview, extension, .NET host i hook bridge a instaluje se standardním Cursor CLI:

```powershell
cursor.cmd --install-extension artifacts\CursorOffice.vsix --force
```

V Command Palette jsou potom dostupné příkazy:

- `Cursor Office: Open Office`,
- `Cursor Office: Install Global Hooks`,
- `Cursor Office: Uninstall Global Hooks`.

Globální hook se instaluje do `~/.cursor/hooks.json`, jeho runtime do `%LOCALAPPDATA%/CursorOffice/bridge`. Hooky nevracejí oprávnění, nic neblokují a nesbírají prompty, odpovědi, reasoning, obsah souborů ani výstupy nástrojů. Do kanceláře přenesou pouze identitu relace/generace, workspace, model, tokenové čítače oznámené terminální událostí, název použitého nástroje, dobu běhu, výsledný stav a typ sociálního signálu. Tokenové agregace zůstávají v `%LOCALAPPDATA%/CursorOffice/usage-ledger.json`; dvojité hooky se deduplikují podle agenta a generace. Lokální záložní detektor soubory transkriptů neotevírá: sleduje pouze cestu, velikost a čas změny, přičemž UUID názvu souboru používá jako identitu instance.

Každé otevřené okno extension zapisuje malý privacy-safe heartbeat do `%LOCALAPPDATA%/CursorOffice/windows-v1`: dočasné ID instance, popisek, cesty workspace, informaci o zaměření a čas. Hook při `beforeSubmitPrompt` spojí konverzaci s právě zaměřeným odpovídajícím oknem a vazbu uloží pod kryptografickým hashem `conversation_id` do `conversation-windows-v1`. Název hlavního chatu se za běhu dohledá read-only dotazem na jeho řádek v lokální tabulce Cursoru `composerHeaders`; Cursor Office čte pouze `composerId` a JSON pole `name`, neukládá kopii názvu do vlastního ledgeru a nikdy nedotazuje zprávy. U podagenta se lokálně a krátkodobě použije pouze oficiální typ/role a maximálně 140 znaků Cursor pole `task` nebo `description`; výstupní `summary` se zahazuje. Background odpovědi a podagenti používají uloženou vazbu; další prompt může chat legitimně přepnout do jiného okna.

Tokenový údaj označený hvězdičkou je zároveň tlačítko otevírající rozpad podle adresáře, modelu a jejich kombinace. Jde pouze o přesně doložené lokální události, nikoli odhad účtu. Veřejný Cursor Hooks kontrakt model poskytuje, ale přesné tokeny negarantuje; chybějící spotřeba se proto nezapisuje jako nula ani nedopočítává. Pokud runtime pošle pro jednu generaci průběžné čítače opakovaně, ledger zachová jejich nejvyšší přesné hodnoty bez dvojího započtení.

Po instalaci otevřete kancelář a spusťte agentní harness. Nový nebo právě zapisovaný soubor podagenta vytvoří samostatnou pracující postavu a jeho hlavní agent se zobrazí jako koordinátor i tehdy, když se hlavní transcript právě nemění. Cursor konfiguraci hooků běžně načítá automaticky. Po aktualizaci extension použijte v okně s kanceláří `Developer: Reload Window`, aby se spustil nový host a do stabilní cesty se zkopíroval nový bridge; verzovaný kanál pak izoluje nové události od starých hostů v dosud nerestartovaných oknech.

## Soukromí a přesnost dat

Cursor Office je lokální observační nástroj. Nemá vlastní cloudovou službu ani síťový port a pro živou detekci nepoužívá Cursor Cloud API.

| Lokální zdroj | Co se používá | Co se nepřenáší do kanceláře |
|---|---|---|
| Cursor Hooks | ID relace a generace, stav, workspace, model, nástroj, čas a případné tokenové čítače | prompt, odpověď, reasoning, příkaz, obsah souboru a výstup nástroje |
| Metadata transcriptů | cesta, velikost a čas změny | obsah `.jsonl` |
| `composerHeaders` v `state.vscdb` | `composerId` a pole `name` | zprávy, FTS index a obsah chatu |
| Heartbeat oken | dočasné ID, workspace, zaměření a čas | obsah editoru a otevřených souborů |
| Usage ledger | generace, workspace, model, čas a přesné čítače | prompt, odpověď a odhad ceny |

Krátké pole `task` nebo `description` podagenta může být očištěno a omezeno na 140 znaků, aby detail postavy vysvětlil její práci. Výstupní `summary` se zahazuje.

Model nebo tokeny se zobrazí pouze tehdy, když je runtime skutečně oznámí. `Model neuveden` a `tokeny nezaznamenány` proto nejsou nula ani odhad. Manažer okna může agregovat doložené modely a spotřebu týmu, ale nemá vlastní generaci.

Podrobná datová hranice je v [integraci s lokálním Cursorem](docs/cursor-integration.md) a význam UI údajů v [uživatelské příručce](docs/user-guide.md).

## Visual Studio

Otevřete `CursorOffice.slnx`. Solution obsahuje C# projekty i `.esproj` projekty pro extension a Webview. Build solution záměrně sestavuje pouze .NET část; frontend se sestavuje příkazem `pnpm build`, dokud nebude hotové balení `.vsix`.

## Dokumentace

- [Rozcestník dokumentace](docs/README.md)
- [Uživatelská příručka](docs/user-guide.md)
- [Model kanceláře a chování postav](docs/behavior-model.md)
- [Diagnostika a řešení problémů](docs/troubleshooting.md)
- [Architektura](docs/architecture.md)
- [Lokální vývoj](docs/development.md)
- [Komunikační protokol](docs/protocol.md)
- [Integrace s lokálním Cursorem](docs/cursor-integration.md)
- [Roadmapa](docs/roadmap.md)
- [Vizuální a funkční parita](docs/visual-parity.md)
- [Poučení z porovnání s The Delegation](docs/upstream-lessons.md)
- [3D asset pipeline](docs/3d-pipeline.md)
- [ADR-0001: Hybridní architektura](docs/adr/0001-hybrid-dotnet-typescript.md)
- [Pravidla pro assety](assets/README.md)

## Licence a původ

Kód v tomto repozitáři je vytvářen jako vlastní implementace. Licence projektu zatím nebyla zvolena. Každá externí knihovna a každý případný asset musí mít samostatně evidovanou kompatibilní licenci; pravidla jsou popsána v `assets/README.md`.
