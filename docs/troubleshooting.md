# Diagnostika a řešení problémů

## Nejdřív ověřte verzi a reload

Nejčastější příčinou zdánlivě neopraveného chování je starý extension host nebo starý C# proces v jednom z několika otevřených Cursor oken.

```powershell
cursor.cmd --list-extensions --show-versions | Select-String cursor-office
```

Po aktualizaci spusťte `Developer: Reload Window` v každém otevřeném Cursor okně. Reload pouze záložky Cursor Office nestačí, protože lokální host vlastní celý extension host okna.

Aktuální očekávaná verze je `cursor-office.cursor-office@0.1.49`.

## Kancelář se neotevře nebo zůstane prázdná

1. Otevřete `View: Toggle Output` a vyberte kanál `Cursor Office`.
2. Hledejte řádek `host.ready` nebo chybu při nalezení/spuštění hostu.
3. Ověřte, že nastavení `cursorOffice.hostPath` není vyplněné starou cestou. Pro instalovanou VSIX má být obvykle prázdné.
4. Spusťte `Developer: Reload Window`.
5. Znovu spusťte `Cursor Office: Open Office`.

Webview při prázdném hostu záměrně nevytváří demo agenty. Samotný majitel bez pracovních postav tedy může být správný stav.

## Vidím méně manažerů než otevřených Cursor oken

Manažer vzniká z heartbeat aktivované extension, nikoli z výčtu procesů operačního systému.

- Ověřte, že je Cursor Office nainstalovaný ve stejné uživatelské instalaci Cursoru.
- V každém okně spusťte `Developer: Reload Window`; tím se extension aktivuje a začne zapisovat heartbeat.
- Nastavte filtr `Všechna okna`.
- Počkejte dva až tři heartbeat cykly, tedy přibližně 4–6 sekund.
- Okno bez živého extension-host procesu se vyřadí okamžitě; heartbeat starší než 7 sekund expiruje i při nečitelném PID.

Více oken stejného repozitáře má více manažerů. Krátký suffix v názvu je rozlišuje.

## Po znovuotevření okna krátce vidím dva stejné manažery

Od verze `0.1.24` heartbeat obsahuje PID extension hostu. Mrtvý proces se z registru odstraní bez čekání na celou lease a nový runtime identifikátor stejného workspace převezme existující vizuální postavu, její pozici a obsazené místo. Dvě skutečně současně otevřená okna stejného repozitáře se nadále zobrazují jako dva manažeři.

Pokud dvojník přetrvá, ověřte `0.1.24` a proveďte `Developer: Reload Window` ve všech oknech; stará verze extension totiž zapisuje heartbeat bez PID a její Webview neumí vizuální identitu převázat.

## Manažer existuje, ale chat se nezobrazí

Manažer představuje okno a existuje i bez chatu. Chat se objeví až po rozpoznané aktivitě nebo nalezení relevantních lokálních metadat.

1. Ověřte, že jsou nainstalované globální hooky příkazem `Cursor Office: Install Global Hooks`.
2. Odešlete nový prompt, nestačí pouze otevřít starou záložku chatu.
3. Ověřte, že prompt byl odeslán v zaměřeném okně se správným workspace.
4. Pokud mají dvě okna stejné workspace a žádné není jednoznačně zaměřené, chat může skončit ve filtru `Nezařazené`.
5. Starý chat mimo počáteční fallback lookback se záměrně nemusí objevit, dokud nevznikne nová aktivita.

## Cursor pracuje, ale postava je `idle`

Když Cursor v editoru opravdu pracuje a postava v kanceláři sedí jako `idle` (nebo tým vůbec nevznikne), nejde o autonomii Webview. Chybí důkaz z hooku, nebo se workspace z URI kořene nespároval s heartbeat okna.

Nejdřív rozlište skutečný hook a fallback:

- Hook události se obvykle projeví během stovek milisekund.
- Fallback metadata označují práci po změně transcript souboru po dobu 3 minut. Podagent zůstává u stolu až 8 minut, pokud se ještě hýbe rodičovský transcript.
- Dlouhý vzdálený výpočet nebo tool call nemusí transcript průběžně zapisovat. Pokud jeho lifecycle hook daná verze Cursoru neposlala, fallback nemá bezpečný důkaz pokračující práce.

Zkontrolujte:

1. `Cursor Office: Install Global Hooks` a poté `Developer: Reload Window` v každém okně. Starší instalace nemusí mít v `~/.cursor/hooks.json` novější události `afterFileEdit` a `preCompact`; příkaz spravované položky doplní.
2. Výstupní kanál `Cursor Office` — hledejte `host.ready` a chyby spoolu.
3. Zda v `%LOCALAPPDATA%/CursorOffice/events-v3` vznikají nové malé JSON soubory při promptu, nástroji, úpravě souboru nebo kompresi kontextu. Bez nových souborů hook do kanceláře nic neposlal.
4. V souboru události zkontrolujte `workspacePath` a korelaci okna. Cursor 3.18 posílá `workspace_roots` na Windows jako URI (`/c:/Users/...`). Bridge je musí převést na běžnou filesystem cestu (`C:\Users\...`). Tvar `C:\c:\Users\...` nebo prázdný `workspacePath` znamená, že URI kořen se nespároval s heartbeat okna a chat zůstane nezařazený nebo `idle`.
5. Ověřte, že prompt šel z okna, jehož workspace kořeny po normalizaci sedí na heartbeat v `%LOCALAPPDATA%/CursorOffice/windows-v1`.

Soubory v `events-v3` nemažte během testu: jde o desetiminutový broadcast pro všechny současné hosty a jejich přítomnost po přečtení je normální.

## Kancelář je plná pracujících agentů, ale v Cursoru nikdo neběží

Activity log obnovuje poslední snapshot každého ID. Stav `working` dříve neměl TTL, takže tiché chaty a transcript fallback bez `windowId` zůstaly u stolů i po restartu. Od této opravy host před `agents.snapshot` i každých 5 sekund:

- shodí `working` bez čerstvého důkazu práce (3 minuty, podagent až 8 minut při čerstvém rodiči) na `idle` bez posunu `lastActivityAt`,
- teprve potom uplatní idle/waiting retenci a staré identity odstraní.

Po aktualizaci hostu spusťte `Developer: Reload Window` v každém Cursor okně. Samotný reload záložky kanceláře starý proces nevymění. Pokud po reloadu přetrvá jediný čerstvý chat, jde o aktuální fallback nebo hook, ne o historický ghost.

## Postava stále ukazuje práci po dokončení

- Skutečný `afterAgentResponse`, `subagentStop`, `stop` nebo failure hook má stav ukončit.
- Pokud chybí terminální hook, fallback nebo host evidenční okno po 3 minutách přepne `working` na `idle`.
- Aktivní podagent záměrně drží rodičovský chat ve stavu koordinace.
- Frontovaný handoff může dočasně odložit odchod dokončeného subagenta.
- Otevřená kancelář ve starém nereloadovaném okně může používat starý host; reloadujte všechna okna.

## Chat nebo subagent neodejde

Pouhá neviditelná záložka není spolehlivá Cursor lifecycle událost. Přibližné výchozí chování:

- dokončený subagent má volný režim a odchází zhruba po 48–90 sekundách,
- zavřené Cursor okno přepne k němu přiřazené chaty do `offline`; hlavní chat odejde zhruba po 28 sekundách a subagent po 12 sekundách,
- idle nebo `waitingForUser` hlavní chat může host držet až 30 minut,
- `working` bez nového hooku ani transcript zápisu po 3 minutách přejde na `idle`,
- dokončený hlavní snapshot má host retenci 20 minut, ale vizuální postava může po terminálním signálu odejít dříve,
- rozhovor, čekání ve dveřích nebo návrat na původní místo může odchod posunout,
- čerstvá aktivita stejného ID odchod správně ruší.

Pokud počet postav dlouhodobě roste, poznamenejte si jejich jména, stav a krátká ID. Důležité je rozlišit několik skutečných instancí stejné role od duplikované identity.

## Model je „neuveden“

To není automaticky chyba. Cursor Office zobrazí model pouze tehdy, když jej poskytne hook nebo jiný přesný runtime zdroj. Manažer okna nemá vlastní model; může pouze agregovat modely členů týmu.

Model se nedoplňuje podle právě vybraného modelu v UI, protože jedna konverzace, background agent a jednotliví subagenti mohou použít různé modely.

## Tokeny jsou prázdné nebo se nezvyšují

Veřejný Cursor Hooks kontrakt **účtované tokeny negarantuje**. Ledger zapisuje pouze generační čítače skutečně dodané runtime událostí a jen s `generation_id`. Proto:

- chybějící tokeny nejsou nula,
- Cursor Office je neodhaduje z délky textu,
- nezobrazuje cenu bez spolehlivé cenové a modelové informace,
- manažer ukazuje workspace agregaci, nikoli vlastní spotřebu,
- jedna generace se deduplikuje a průběžné hodnoty se slučují maximem,
- zaplnění kontextu z `preCompact` není tokenový ledger; chybí-li řádek „kontextové okno“, hook zatím `preCompact` neposlal nebo nenesl `context_tokens` / `context_window_size` / `context_usage_percent`.

Lokální ledger je `%LOCALAPPDATA%/CursorOffice/usage-ledger.json`. Neobsahuje prompt, odpověď ani kontextové okno. Lokální activity log je `%LOCALAPPDATA%/CursorOffice/activity-log.ndjson`; timeline nese jen `kind`, volitelný `tool`, čas a `status`.

## Jména chatů jsou jen krátká ID

Na Windows se titul dohledává read-only z `%APPDATA%/Cursor/User/globalStorage/state.vscdb`. Bezpečný fallback nastane, když:

- `conversation_id` nemá odpovídající `composerHeaders` řádek,
- Cursor databázi právě nahrazuje nebo zamyká,
- schéma konkrétní verze titul neposkytne,
- název ještě nebyl v Cursoru vytvořen.

Další aktivita titul znovu zkusí načíst. Zprávy a transcript se kvůli názvu nečtou.

## Dvě postavy stojí v sobě nebo se zaseknou ve dveřích

Současná navigace používá pevnou kolizní mapu, FIFO rezervaci dveří, dynamickou separaci a watchdog trasy. Krátké čekání před dveřmi je očekávané; průchod nábytkem nebo trvalé poskakování ne. Watchdog zůstává aktivní i pro postavu dávající přednost a při zablokování plánuje novou trasu, v níž jsou ostatní postavy dočasné kruhové překážky. Když lokální úkrok ani delší objížďka nejsou v hustém shluku dostupné, watchdog na omezenou dobu uvolní dávající postavu, aby separace vytvořila prostor; postava proto nesmí zůstat pozastavená trvale.

Pro reprodukci si poznamenejte:

- místnost a konkrétní dveře,
- počet postav,
- zda některá seděla nebo právě vstávala,
- jména a stavy kolidujících postav,
- zda byl aktivní filtr okna,
- přibližný čas, aby šel dohledat odpovídající lifecycle.

Dočasně lze změnit úhel kamery nebo filtr, ale filtr nemění fyzický stav a problém sám neopravuje. Watchdog má zaseknutou trasu automaticky přepočítat.

## Majitel se nehýbe pomocí WASD

- Nejprve majitele kliknutím vyberte; jeho detail zůstane otevřený.
- Klikněte do canvasu kanceláře, aby měl klávesový fokus.
- `WASD` se vztahuje ke směru kamery, nikoli k pevným světovým osám.
- `Esc` výběr zruší a potom stejné klávesy opět pohybují kamerou.
- Když majitel sedí, nejprve přehraje vstávání; pohyb začne po dokončení přechodu.

Pokud se postava pohybuje, ale nohy zůstávají nehybné, ověřte verzi `0.1.49` a reload všech oken.

## Kamera je mimo kancelář nebo má špatný úhel

Stiskněte `Home` nebo `0`. Tím se obnoví výchozí pozice a cíl kamery. Tažení stisknutým kolečkem nebo pravým tlačítkem posouvá pohled; levé tlačítko jej otáčí.

## Po aktualizaci vidím staré chování

1. Ověřte instalovanou verzi přes Cursor CLI.
2. Reloadujte všechna otevřená okna, nejen to s kanceláří.
3. V Output kanálu `Cursor Office` ověřte verzi nově spuštěného hostu.
4. Pokud byly hooks dříve nainstalované, aktivace extension obnoví bridge ve stabilní cestě.
5. Verzovaný `events-v3` chrání nový host před starými destruktivními hosty, ale staré okno bude až do reloadu stále vykreslovat svůj starý kód.

## Co přiložit k hlášení chyby

- verzi Cursoru a Cursor Office,
- počet otevřených Cursor oken a jejich workspace,
- filtr zvolený v kanceláři,
- jméno, stav a krátké ID dotčené postavy,
- zda šlo o hlavní chat nebo subagenta,
- přibližný čas problému,
- relevantní řádky z Output kanálu `Cursor Office` bez soukromého obsahu,
- screenshot kanceláře.

Nepřikládejte prompty, odpovědi, transcript soubory ani zdrojový kód, pokud nejsou pro konkrétní chybu nezbytné.
