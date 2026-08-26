# Integrace s lokálním Cursorem

Cursor Office nepoužívá Cursor Cloud API. Integrace je rozdělena na tři lokální adaptéry, aby vizualizace nebyla svázaná s jedním harness skriptem.

## 1. Cursor Hooks – primární observační vrstva

Oficiální Cursor Hooks běží jako lokální procesy nad JSON přes standardní vstup/výstup. Uživatelská konfigurace je v `~/.cursor/hooks.json` a platí pro všechna lokální Cursor okna. Pro Cursor Office jsou důležité zejména:

- `sessionStart` / `sessionEnd` – životní cyklus hlavní konverzace,
- `beforeSubmitPrompt` – okamžik odeslání nového zadání bez uložení jeho textu,
- `preToolUse` – začátek práce nástroje bez uložení vstupu,
- `postToolUse` / `postToolUseFailure` – činnost a chyba,
- `afterAgentThought` – změna aktivity bez ukládání reasoning textu,
- `afterFileEdit` – úprava souboru; bridge si nechá jen basename, ne cestu ani obsah,
- `preCompact` – zaplnění kontextového okna, nikoli účtovaná generace,
- `afterAgentResponse` – dokončení odpovědi bez ukládání jejího textu,
- `subagentStart` / `subagentStop` – příchod a dokončení, chyba nebo přerušení podagenta,
- `stop` – konec agent loopu.

Společný payload obsahuje stabilní `conversation_id`, `generation_id`, model, `workspace_roots`, verzi Cursoru a volitelnou `transcript_path`. Od Cursoru 3.18 přichází `workspace_roots` na Windows jako URI cesta `/c:/Users/...`; bridge ji před korelací s heartbeat okna převede na běžnou filesystem cestu. Cursor Office instaluje všechny uvedené hooky jako pasivní pozorovatele (`observedEvents` v instalátoru, včetně `afterFileEdit` a `preCompact`): vrací prázdnou odpověď, nic nepovolují, nezakazují ani nemění. Metadata transkriptu zůstávají fallbackem pro verze a workflow, které některý lifecycle hook nevyšlou.

Bridge je fail-open. Z raw payloadu neukládá prompt, reasoning, příkaz, obsah souboru ani výstup nástroje. Krátký očištěný `task`/`description` podagenta smí zůstat jako popisek práce (max. 140 znaků). Do lokální spool fronty předá jen normalizovaná metadata potřebná pro stav postavy.

Spool `%LOCALAPPDATA%/CursorOffice/events-v3` není work queue s jediným spotřebitelem. Události zůstávají po dobu deseti minut jako lokální broadcast, každý host spuštěný jednotlivým Cursor oknem vede vlastní seznam přečtených souborů a úklid nastane až po expiraci. Verzovaný adresář není sledovaný staršími destruktivními hosty, kteří mohou stále běžet v nerestartovaných Cursor oknech. Nově spuštěný host přehraje nejvýše dvě minuty nedávných událostí, aby obnovil aktivní projekci bez dlouhé historické laviny.

### Sociální signály bez čtení konverzace

- `beforeSubmitPrompt` nebo změna `generation_id` u existující hlavní konverzace znamená nový uživatelský vstup a vyvolá návštěvu agenta u majitele,
- `afterAgentResponse` potvrdí dokončení odpovědi; text odpovědi bridge zahodí,
- `subagentStart` značí začátek delegace; nově pozorovaný aktivní soubor v `subagents/` je pouze fallback,
- `subagentStop` značí handoff výsledku rodičovské konverzaci; krátké `description` nebo `task` se očistí, omezí na 140 znaků a použije jako popis práce, zatímco výstupní `summary` se neukládá.

Webview tyto signály frontuje. Jedna postava proto nevede několik rozhovorů současně a pozdější handoff počká na dokončení dřívější interakce. Přestože Cursor tyto hooky umí používat i pro řízení oprávnění, bridge Cursor Office jejich rozhodovací výstupy vůbec nevytváří.

### Model, činnost, tokeny a kontext

Model pochází ze společného hook payloadu: pole `model` nebo `model_id`. Podagent může dodat vlastní `subagent_model`; jinak zdědí model rodičovské události. Cursor Office model nedoplňuje z výběru v UI. Pokud pozdější hook stejné `generation_id` model vynechá, `AgentMonitor` ponechá poslední prokázanou hodnotu. Volitelné `model_params` (`thinking`, `effort`, `context`) se berou stejně: jen oznámené knoby, bez raw parametrů a bez textu promptu.

Veřejný Cursor Hooks kontrakt **účtované (billing) tokeny negarantuje**. Když je konkrétní runtime přesto dodá jako `input_tokens`/`inputTokens`, `output_tokens`/`outputTokens`, `cache_read_tokens`/`cacheReadTokens` a `cache_write_tokens`/`cacheWriteTokens` (na kořeni nebo v objektu `usage`), bridge je předá jako generační `usage`. Lokální ledger je zapíše jen tehdy, když existuje `generation_id` a součet čítačů je větší než nula. Ledger **nic neodhaduje**: chybějící spotřebu nenahrazuje nulou, délkou textu ani cenou. Stejnou generaci nezapočítá dvakrát a průběžné čítače slučuje maximem. Agregace jsou celkem, po úplné cestě workspace, po modelu, po jejich kombinaci a po lokálním kalendářním dni.

`preCompact` je jiný údaj: zaplnění **kontextového okna** (`context_tokens`, `context_window_size`, `context_usage_percent`). Není to účtovaná generace. Hodnota jde do `contextUsage` na snapshotu a do UI jako „kontextové okno“. Do `usage` ani do ledgeru se nezapočítává.

Činnost agenta je krátký privacy-safe popisek, ne obsah konverzace. Bridge z hooku bere název nástroje, „analyzuje další krok“, basename upraveného souboru, očištěný `task`/`description` podagenta (max. 140 znaků) nebo stav komprese kontextu. Prompt, reasoning, příkaz, obsah souboru, výstup nástroje i `summary` se zahazují.

Tato data nejsou totéž co úplný účet Cursoru. UI proto rozlišuje „zaznamenané tokeny“ poslední generace, workspace agregaci manažera a volitelné zaplnění kontextu. Chybějící údaj zůstane prázdný. ACP/CLI adaptér bude moci v budoucnu přidat přesnou spotřebu z runtime výsledku stejným doménovým kontraktem.

Oficiální reference: [Cursor Hooks](https://cursor.com/docs/hooks).

## 2. Metadata lokálních transkriptů – pasivní fallback

Když některá verze Cursoru nebo konkrétní workflow nevyšle hook pro vznik podagenta, fallback sleduje pouze cestu, velikost a čas změny souborů v `~/.cursor/projects/*/agent-transcripts`. Obsah `.jsonl` neotevírá. UUID názvu souboru dává stabilní instanci:

- hlavní transcript → `primary` agent,
- soubor v `subagents/` → `subagent` s rodičem podle adresáře konverzace.

Změna vlastního souboru v posledních 3 minutách znamená `working`. Pokud se rodičovský transcript ještě hýbe, podagent zůstává `working` až 8 minut i bez vlastního zápisu, protože Cursor často nepřepisuje soubor během přemýšlení nebo dlouhého nástroje. Je-li aktivní kterýkoli podagent, jeho hlavní konverzace zůstává `working` s činností „koordinuje aktivní podagenty“, i když hook mezitím poslal `afterAgentResponse`. Tool hooky podagenta běžně přijdou pod novým `conversation_id` bez vazby na rodiče; bridge proto pamatuje `subagentStart` a pozdější nástroje přiřadí stejnému pracovníkovi. Terminální stavy `completed`, `offline` a `error` smí nastavit pouze skutečný lifecycle hook. Starší fallback je nesmí zrušit; novější zápis do transcriptu může stejné ID znovu označit jako pracující.

## 3. Cursor CLI / ACP – budoucí řídicí adaptéry

Cursor Agent CLI umí `--output-format stream-json`. NDJSON stream obsahuje `session_id`, inicializaci, assistant delty, zahájení/dokončení tool callu a terminální `result`. To je vhodné pro agenty, které by Cursor Office samo spustilo.

ACP (`agent acp`) poskytuje lokální JSON-RPC 2.0 přes stdio, `session/new`, `session/load`, `session/prompt`, streaming `session/update` a žádosti o oprávnění. ACP je vhodné pro budoucí řízení a schvalování, ne pro pasivní převzetí všech už otevřených IDE chatů.

Oficiální reference: [CLI output format](https://cursor.com/docs/cli/reference/output-format), [Cursor ACP](https://cursor.com/docs/cli/acp).

## Organizační model

Cursor Hooks neposkytují stabilní ID desktopového okna. Extension ale běží samostatně v každém okně, vytvoří lokální identitu složenou z editor session a extension-host procesu a v krátkém heartbeat registru zveřejní pouze workspace, zaměření a časy. Hook tuto lokální přítomnost kombinuje s garantovaným `conversation_id`:

```text
majitel
└── workspace
    └── manažer lokálního Cursor okna / týmová zóna
        └── conversation_id (pracovní agent hlavního chatu)
            └── subagent_id (dočasný pracovník)
```

Při `beforeSubmitPrompt` dostane přednost právě zaměřené živé okno se shodným workspace. Vazba se uloží podle hashe konverzace, takže `postToolUse`, odpověď a další background události zůstanou ve správném okně i po změně fokusu. `subagentStart` a `subagentStop` používají vazbu `parent_conversation_id`. Nový prompt může tutéž konverzaci legitimně přestěhovat do jiného okna. Je-li více shodných oken bez jednoznačného fokusu a konverzace ještě vazbu nemá, systém nic nehádá a označí ji jako nezařazenou.

UI filtruje všechna okna, jedno konkrétní okno nebo nezařazené konverzace. Filtr nemění lifecycle: skryté týmy dál udržují stav a po návratu se objeví ve své skutečné poloze, nikoliv znovu u vchodu. Každé živé IDE okno vytváří právě jednoho stabilního manažera už z heartbeat registru, tedy i bez aktivní konverzace. Hlavní chaty jsou skuteční pracovní agenti pod tímto manažerem a nesou model, generace i spotřebu. Pokud mají podagenty, prezentačně se mění na vedoucí agenty/seniory; podagenti zůstávají pod svým skutečným rodičem.

Veřejné hook schéma neposkytuje titul chatu z postranního panelu Cursoru, ale poskytuje stabilní `conversation_id`. Host jej lokálně a pouze pro čtení spojí s primárním klíčem `composerId` v Cursor tabulce `composerHeaders` a z JSON hlavičky převezme jen pole `name`. Zprávy ani FTS index se nedotazují. Není-li hlavička dostupná, zůstává bezpečný fallback `Agent <krátké conversation_id>`. Vestavěné hodnoty podagentů jako `generalPurpose` se zobrazí jako `General Purpose`; názvy vlastních agentů z `.cursor/agents` nebo kompatibilního harnessu fungují stejně bez speciální konfigurace.

Jméno manažera má formu `Manažer <workspace>`. Vzniká přímo pro živé Cursor okno a zůstává přítomné i bez chatu; při více oknech stejného workspace dostane suffix okna. Každá hlavní konverzace se pod ním zobrazí názvem chatu a při existenci potomků se v detailu označí jako vedoucí agent; podagenti zůstávají vnoření pod tímto chatem. `beforeSubmitPrompt` vyvolá návštěvu manažera u majitele a následnou vizuální delegaci pracovnímu agentovi. Ruční ovládání majitele má vždy prioritu; po devíti sekundách nečinnosti se může autonomně vrátit ke stolu nebo navštívit volného agenta. Autonomie pouze vizualizuje skutečné události a běžný pohyb, sama nevytváří Cursor úkoly.

## Lifecycle a ochrana proti hromadění

1. První aktivita stabilního ID vytvoří postavu u vstupu.
2. `working`, `waitingForUser` a `error` přesouvají postavu k odpovídajícímu POI. Skutečný chat nebo subagent čekající na uživatele používá stojící attention bod; syntetický manažer zůstává jen týmovým agregátem.
3. Rezervační vrstva každé postavě přidělí jedinečnou židli nebo místo; po příchodu stavový automat plynule přehraje sednutí, práci, poradu či emoci.
4. `idle` zůstává v kanceláři a střídá volná POI, sezení, gesta a příležitostné rozhovory. `waitingForUser` se z volnočasového plánovače vyjme a periodicky žádá majitele o pozornost. Terminální `completed` spouští u pracovních postav omezený volný režim před odchodem.
5. Podagent po dokončení, zastavení, chybě nebo zániku instance nejprve provede dostupný sociální handoff a přejde do krátkého volného režimu. Může změnit odpočinkové místo nebo provést gesto a až po odchodovém deadlinu projde ke dveřím. Opakovaný starý snapshot rozběhnutý odchod neruší; nová skutečná aktivita jej naopak legitimně vrátí do práce. Pouze neaktivní hlavní chat bez terminálního signálu má dlouhou host retenci.
6. Odcházející postava naplánuje kolizně bezpečnou trasu ke vstupu a odejde.
7. .NET host po stavově odlišném TTL pošle `agent.removed` a odstraní snapshot z týmového panelu; primární členové mají dlouhou retenci, dočasní podagenti krátkou.
8. Stejný starý snapshot již postavu nespawnuje. Novější aktivita stejného ID ji může legitimně vrátit.

Tím je počet postav omezen životním cyklem Cursoru, nikoli délkou běhu kanceláře.

Konkrétní výchozí retenční časy hostu i vizuální retirement popisuje [model kanceláře a chování postav](behavior-model.md#neaktivita-dokončení-a-odchod).
