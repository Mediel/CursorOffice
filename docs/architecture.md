# Architektura

## Kontext

Cursor Office je desktopové rozšíření pro Cursor založené na VS Code Extension API. Editorová část musí běžet v Node.js extension hostu a grafická část ve Webview. Doménová a integrační logika je záměrně přesunuta do lokálního procesu napsaného v C#.

## Komponenty

```text
Cursor Hooks ─┐
              ├──> CursorOffice.Hook (.NET 10, passive) ──> local event spool
              │                                             │
Cursor transcript metadata ──────────────────────────────────┤
              ├──> CursorOffice.Host (.NET 10) <────────────┘
Cursor ACP ───┘     ├── Infrastructure adapters
                    ├── Application orchestration
                    ├── Core agent model
                    ├── local token-usage ledger
                    └── local activity log
                               │
                               │ NDJSON / stdio
                               ▼
                    CursorOffice.Extension (TypeScript)
                               │
                               │ Webview messages
                               ▼
                    CursorOffice.Webview (Three.js)
```

## Vrstvy .NET

### CursorOffice.Core

Čistý doménový model. Obsahuje identitu agenta, stav, druh `Primary/Subagent`, rodičovskou konverzaci, workspace, snapshot, `ModelParams`, generační `TokenUsage` a `ContextUsage` z `preCompact`. Nemá závislost na infrastruktuře ani UI.

### CursorOffice.Application

Orchestrace případů užití. Převádí příchozí aktivity na aktuální snapshoty agentů a pracuje přes abstrakce zdrojů událostí. `AgentLifecycle` drží retenční TTL a evidenční okno pro tiché `working`; `OrphanedWindowAgentRetirer` označí chaty mrtvých heartbeat oken jako `offline`.

### CursorOffice.Infrastructure

Implementace okrajových adaptérů. Hook `workspace_roots` z Cursoru 3.18 na Windows přichází jako URI cesta `/c:/Users/...`; bridge ji před zápisem události převede na filesystem cestu, jinak se chat nespáruje s heartbeat okna a tým zůstane `idle`. `CursorHooksAgentEventSource` čte privacy-filtered lokální `events-v3` spool jako krátkodobý broadcast: každý současně běžící host má vlastní in-memory kurzor, úspěšné přečtení soubor nemaže a libovolný host uklízí až události starší než retenční okno. Verzovaný adresář zároveň brání starému single-consumer hostu z jiného Cursor okna v odcizení nové události. `CursorTranscriptAgentEventSource` pasivně sleduje pouze cestu, velikost a čas změny souborů v `~/.cursor/projects`. Druhý adaptér soubory neotevírá; UUID z názvu souboru používá k rozlišení hlavní relace a každé instance podagenta. Při aktivním podagentovi zahrne i starší rodičovský transcript a promítne rodiče jako pracujícího koordinátora; tříminutové fallback okno pokrývá pauzy mezi tool cally a podagent může zůstat aktivní až 8 minut, pokud se hýbe rodičovský transcript. Aktivní podagent drží rodiče ve `working` i po `afterAgentResponse`. Starší transcript fallback nesmí zrušit terminální hook stav; novější zápis do transcriptu může znovu nastavit `working` i po `stop`. Fallback `idle` smí shodit neterminální hook `working`, když chybí `stop` a soubor už není čerstvý. Po `offline` z mrtvého okna fallback bez nového `windowId` agenta neobnoví. `AgentLifecycle` sdílí retenční TTL a tříminutové evidenční okno pro `working`; obnovené snapshoty bez čerstvého důkazu práce přejdou do `idle` a teprve potom platí idle retence. `CompositeAgentEventSource` oba proudy slučuje. `CursorWindowPresenceDirectory` čte heartbeat lease z `windows-v1` se stejnou sedmisekundovou platností a kontrolou PID jako extension reporter. `LocalUsageLedger` deduplikuje runtimem oznámené **generační** tokeny podle generace, průběžné čítače stejné generace slučuje maximem, ukládá maximálně 50 000 záznamů a vytváří agregace podle úplné cesty workspace, modelu a dne. Chybějící spotřebu neodhaduje. Zaplnění kontextového okna z `preCompact` do ledgeru nepatří. `LocalActivityLog` je append-only NDJSON vedle ledgeru (`%LOCALAPPDATA%/CursorOffice/activity-log.ndjson`): drží poslední `AgentSnapshot` podle agenta a slim timeline (`kind` / `tool` / čas / `status`). `AgentMonitor` u stejné `generation_id` ponechá poslední prokázaný model, `modelParams`, `usage` i `contextUsage`, pokud je pozdější hook vynechá. Další adaptéry budou ACP.

### CursorOffice.Host

Lokální konzolový proces vlastněný extension. Jeho standardní vstup a výstup jsou vyhrazené pro verzovaný NDJSON protokol; diagnostika musí směřovat na standardní chybový výstup. Po `host.ready` a `usage.changed` host načte `LocalActivityLog`, `Upsert`ne agenty do existujícího `AgentRegistry`, jednou označí chaty mrtvých heartbeat oken jako `offline`, tiché `working` bez čerstvého důkazu práce shodí na `idle` (čas poslední aktivity se nemění) a teprve potom aplikuje stejná TTL pravidla jako průběžný cleanup a pošle `agents.snapshot`. Smyčka `AgentMonitor` a periodický cleanup začínají až poté; pozdější `agent.changed` i úspěšné `Remove` se do logu také připisují. `CursorWindowPresenceDirectory` čte stejné sedmisekundové heartbeat lease jako extension reporter, včetně mrtvého PID.

### CursorOffice.Hook

Krátce žijící pasivní proces volaný globálními následnými Cursor hooks. Extension jej instaluje do stabilní uživatelské cesty. Z příchozího JSON vědomě zahazuje prompty, reasoning, obsah souborů, příkazy i výsledky nástrojů. Kromě stavu předá model ze společného payloadu, volitelné generační `usage`, `modelParams` a z `preCompact` samostatné `contextUsage`. Atomicky uloží pouze normalizované stavové metadata do `%LOCALAPPDATA%/CursorOffice/events-v3`. `CursorHooksAgentEventSource` je přečte jako retenční broadcast; zpracování jedním hostem je neodebere ostatním.

## TypeScript projekty

### CursorOffice.Extension

Co nejtenčí adaptér nad `vscode` API. Otevírá Webview, spravuje životní cyklus C# procesu a přeposílá zprávy. `LocalHostClient` automaticky hledá vývojový nebo zabalený host, spouští jej bez viditelného konzolového okna, validuje protokol verze 1 a slučuje události `agent.changed` do aktuální projekce. Doménová rozhodnutí sem nepatří.

### CursorOffice.Webview

Pracovní rig zvedá ramena a předklání trup tak, aby ruce dopadly na rovinu klávesnice místo do klína; stoly mají vlastní klávesy, podložku a myš. Kávový plánovač doplňuje nepracovní a společenské chování o vícefázový kuchyňský workflow. Kávovar a dřez jsou samostatná rezervovaná POI; po přípravě může postava odnést hrnek na židli, k volnému stolu, do lounge nebo do rozhovoru. Rig skládá držení a opakované doušky se sezením a sociální animací. Tempo sahá od rychlého dopití po dlouhé usrkávání a je deterministicky odvozené z identity. Přechod do `working` kávový cyklus preemptuje, uvolní jeho POI a přes běžné pracovní směrování pošle agenta ke stolu; pracující agent nový cyklus nezahajuje. S prázdným hrnkem se postava po skončení případného rozhovoru vrátí k dřezu a v režimu mytí používá obě ruce i viditelný proud vody. Hrnek je součástí kostry pravé ruky, ale kompenzuje její rotaci, aby při chůzi zůstal vzpřímený. Závažný nebo terminální lifecycle může cyklus rovněž zrušit. Stojící postavy se dále protahují, mávají majiteli a dvě až čtyři nepracující postavy mohou zahájit spontánní rozhovor na gauči, kolem poradního stolu nebo ve stojícím hloučku. Skupinový koordinátor atomicky rezervuje celou formaci, čeká na posledního příchozího, nepravidelně střídá jednoho mluvčího a po skončení nechá členy různě dlouho na místě. Skutečný agent ve stavu `waitingForUser` se z volnočasového plánovače vyjme, rezervuje stojící POI a periodicky přehrává samostatné gesto `attention`: natočení k majiteli, pohled vzhůru, pulzující ikona a obě ruce nad hlavou. Syntetický manažer okna toto gesto nepoužívá. Interaktivní nábytek odděluje walkable příchodový bod od lokální vizuální kotvy: navigační group zůstane před colliderem, zatímco procedurální rig, stín a výběrový kruh během sednutí přejedou na sedák; typ `sofaSeat` navíc používá uvolněnější posed než poradní židle. Jmenovka je ve výchozím stavu jen kompaktní jméno; raycast nad tělem i sprite jména otevře úplná metadata, po opuštění drží krátkou časovou prodlevu a výběr postavy ji ponechá otevřenou trvale.

Vykreslování, kamera, pohyb, animace a prezentační UI. Webview pracuje pouze s projekcí stavu přijatou od extension a nemá přímý přístup k Node.js ani C# hostu. Budova je rozdělena na funkční místnosti propojené dveřmi. Visibility graph nad AABB kolizní mapou vede agenty i majitele kolem stěn, nábytku i sedících pracovníků u PC. Úzké dveře jsou navíc dynamické portály: první příchozí, který jimi skutečně prochází, si průchod krátce rezervuje, ostatní čekají ve FIFO frontě před prahem; jádro dveří vypíná boční separaci jen mezi dvěma pohybujícími se chodci. Sedící nebo stojící pracovník u počítače se obchází, dveře neblokuje. Mimo dveře funguje crowd avoidance: z trajektorie se předpoví konflikt, stabilní priorita zabrání oscilaci, jeden chodec krátce vyčká a poté dostane boční mezibody kolem dynamické překážky. Pracovní židle nestačí-li, další agenti dostanou stojící hot-desk mimo dveřní uličku; počet postav se neomezuje. Stavový watchdog měří skutečný postup a zaseknutou trasu automaticky přepočítá. Přijetí trasy porovnává všechny waypointy, takže objížďka ke stejnému cíli není chybně zahozena. Stav určuje pracovní sezení, poradní, chybovou nebo odpočinkovou zónu. Dokončený hlavní agent přejde do autonomního volného režimu; dočasný podagent po handoffu, zastavení, chybě nebo zániku instance přejde do časově omezeného volného režimu a poté odchází řízeně přes východ. Starý terminální snapshot odchod neruší, zatímco skutečná nová aktivita postavu oživí. Sociální koordinátor převádí diskrétní `UserPrompt`, `AgentResponse`, `DelegationStarted` a `HandoffCompleted` na frontované návštěvy mezi majitelem, hlavním agentem a podagentem. Účastníci plánují běžnou kolizní trasu, natočí se proti sobě, střídají mluvení a naslouchání a poté obnoví původní POI. Během rozhovoru používají štítky dvě výškové úrovně a dokončený podagent má odchod odložený až za handoff. Oddělený ambientní koordinátor spravuje vícečlenné idle skupiny; skutečná Cursor interakce jej může kdykoli preemptovat bez ztráty odchodového deadlinu. Každá postava má živě překreslovaný 3D štítek se jménem, stavem a podle přepínačů v Nastavení kanceláře i modelem, činností, doloženými tokeny poslední generace a zaplněním kontextu z `preCompact`. Strukturovaný inspector doplňuje workspace, knoby modelu a lokální ledger. Přepínače `hud.showModel`, `hud.showTokens` a `hud.showActivity` jen schovají prezentaci; data nemění. Nepracující postavy rezervují volná POI, střídají sezení, rozhlížení, mávání a skupinové spontánní rozhovory. Pozorovací kamera explicitně mapuje levé tažení na orbit, stisknuté kolečko a pravé tlačítko na půdorysný pan, rolování na zoom a WASD/QE na plynulý klávesový pohyb; `Home` obnoví výchozí kompozici. Pozice a cíl kamery se ukládají do stavu Webview. Majitel je lokálně ovladatelný pomocí WASD relativního k natočení kamery po výběru jeho postavy; přímý pohyb vstupuje do stejného `walk` stavu jako plánovaná trasa, takže hýbe nohama i pažemi. `Esc` vrací klávesy režimu kamery. Kliknutí na volnou podlahu jej přesune i bez předchozího výběru a jeho pozice se rovněž ukládá. Ruční vstup na devět sekund přebíjí autonomii a přeruší její sociální sekvenci. Po nečinnosti se majitel znovu zapojí do skutečné Cursor konverzace, případně se vrátí k monitorování u stolu nebo navštíví volného agenta; tato vrstva nevytváří fiktivní práci ani nové Cursor úlohy.

Webview je rozdělen na malé odpovědnosti:

```text
main.ts                         # composition root a host messages
contracts.ts                    # datový kontrakt webview
ui/OfficeHud.ts                 # metriky, seznam, výběr, inspector a ledger
ui/OfficeSettings.ts            # in-office GUI: jazyk, značka, vzhled, barvy a přepínače modelu/tokenů/činnosti
world/OfficeWorld.ts            # Three.js scéna, kamera, lifecycle a sociální koordinátor
world/AnimatedCharacterController.ts # vlastní procedurální rig a animation blending
world/CharacterStateMachine.ts  # deklarativní vizuální stavy a přechody
world/OfficeNavigation.ts       # visibility-graph A*, kolize a sliding
world/OfficePoiManager.ts       # rezervace míst a ochrana proti překryvu agentů
world/DoorTrafficManager.ts     # FIFO rezervace úzkých dveří a ochrana před deadlockem
world/layout.ts                 # místnosti, překážky, POI a stavové cíle
```

## Obecný organizační model

Cursor veřejně neposkytuje spolehlivé ID konkrétního desktopového okna. Každý extension host si proto vytvoří dočasnou lokální identitu, zveřejňuje heartbeat s workspace a stavem zaměření a hook při odeslání promptu provede důkazově omezenou korelaci. Nejednoznačný případ zůstane nezařazený:

```text
majitel (uživatel)
└── workspace / repozitář
    └── manažer Cursor okna (lokální extension heartbeat)
        └── pracovní agent / hlavní konverzace (stabilní conversation_id)
            └── dočasný podagent / pracovník (subagent_id, parent conversation_id)
```

`beforeSubmitPrompt` může vazbu konverzace přepnout do aktuálně zaměřeného okna. Pozdější background události zůstávají u uložené konverzace a podagent dědí okno rodiče. Manažer je stabilní prezentační entita vytvořená z heartbeat přítomnosti; nemá vlastní model ani generaci, ale zobrazuje výslovně označený souhrn modelů týmu a doloženou spotřebu workspace. Více chatů ve stejném okně jsou samostatní pracovní agenti pod ním; agent s potomky se mění na vedoucího/seniora, zatímco model i spotřeba jednotlivé generace zůstávají u skutečných runtime agentů. Hook metadata jsou primární zdroj životního cyklu, modelu, činnosti, volitelných generačních tokenů i kontextu z `preCompact`. Pasivní metadata transkriptů zůstávají krátkým fallbackem pro příchod unikátních podagentů; fallback tokeny ani kontext nevymýšlí.

Procedurální geometrie je současný fallback a současně rychlý nástroj pro návrh dispozice. Produkční GLB assety později vstoupí přes stejnou vrstvu `OfficeWorld`; stavový řadič ani HUD na konkrétní geometrii záviset nebudou.

## Směr závislostí

```text
Core <- Application <- Infrastructure
                   ^
                   └── Host
```

`Core` nesmí referencovat žádnou vyšší vrstvu. TypeScript projekty sdílejí pouze serializovaný protokol, nikoliv C# assembly.

## Bezpečnostní hranice

- Veškerá komunikace je lokální; MVP neotevírá síťový port.
- Webview používá Content Security Policy a načítá pouze zabalené lokální zdroje.
- Webview zůstává v jednom lokálním JavaScript bundle, aby nonce-based CSP nevyžadovala povolení dalších zdrojů skriptů.
- Obsah promptů a zdrojových souborů se do 3D scény neposílá, pokud jej uživatel později výslovně nepovolí.
- Globální hooks jsou pouze následné nebo lifecycle události; bridge nemůže povolit, zakázat ani změnit akci agenta.
- Usage ledger obsahuje pouze ID generace, čas, název a úplnou lokální cestu workspace, model a čtyři tokenové čítače. Chybějící hodnoty se neodhadují. `contextUsage` z `preCompact` zůstává jen na snapshotu a do ledgeru se nezapisuje.
- Activity log ukládá poslední známé snapshoty agentů a privacy-safe timeline. Řádek `activity` má jen identitu, čas, `kind`, `status` a volitelný název nástroje; prompt, reasoning, těla souborů ani výstup nástroje se nezapisují.
- Cursor Office nevolá neveřejné síťové API. Na Windows provádí úzce omezený read-only dotaz do lokální Cursor databáze `state.vscdb`: z `composerHeaders` čte pouze `composerId` a pole `name` pro název chatu. Zprávy, FTS index ani obsah konverzace nedotazuje. Záložní detektor pracuje pouze s metadaty lokálních transcript souborů a neotevírá jejich obsah.
