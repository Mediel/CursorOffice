# Uživatelská příručka

## Co Cursor Office dělá

Cursor Office je lokální editorová záložka v Cursoru. V jedné 3D kanceláři zobrazuje živá Cursor okna, jejich hlavní chaty a dočasné subagenty. Neslouží jako další chatovací klient a agenty přímo neovládá; vizualizuje lokální události, které Cursor nebo použitý harness skutečně poskytne.

## Instalace

Repozitář neobsahuje generovaný VSIX. Po lokálním sestavení podle [vývojové dokumentace](development.md#vsix) vznikne `artifacts/CursorOffice.vsix`; publikované verze mohou být později dostupné také v GitHub Releases.

```powershell
cursor.cmd --install-extension artifacts\CursorOffice.vsix --force
```

Po instalaci nebo aktualizaci spusťte v každém již otevřeném Cursor okně `Developer: Reload Window`. Každé okno má vlastní extension host a bez reloadu by mohlo dál používat starý C# proces nebo bridge.

V Command Palette potom spusťte:

1. `Cursor Office: Install Global Hooks` – jednorázově nainstaluje pasivní hooky pro lokálního uživatele.
2. `Cursor Office: Open Office` – otevře kancelář jako běžnou editorovou záložku.

Hooky se ukládají do uživatelského `~/.cursor/hooks.json`. Příkaz zachová cizí hook konfiguraci a spravuje pouze položky Cursor Office. Odinstalovat je lze přes `Cursor Office: Uninstall Global Hooks`.

## První ověření

Po otevření kanceláře by měla být vidět postava majitele a jeden manažer za každé živé Cursor okno. Manažer existuje i tehdy, když v jeho okně právě neběží chat.

Pro rychlou kontrolu:

1. Otevřete dvě Cursor okna s různými workspace.
2. V obou použijte `Developer: Reload Window`.
3. V kterémkoli z nich otevřete Cursor Office a nastavte filtr `Všechna okna`.
4. Očekávejte dva manažery, například `Manažer Frontend` a `Manažer Backend`.
5. Odešlete prompt v jednom chatu. Manažer příslušného okna má přejít do práce a chat se objeví jako jeho pracovní agent.
6. Spusťte harness se subagenty. Každá rozpoznaná instance má dostat vlastní postavu pod rodičovským chatem.

Krátké zpoždění je normální: hook spool se kontroluje zhruba po 150 ms, fallback metadata po 300 ms a heartbeat okna se obnovuje každé dvě sekundy.

## Jak číst hierarchii

```text
Majitel
└── Manažer Backend
    ├── Checkout confirmation / hlavní chat
    │   ├── General Purpose a13f2b / subagent
    │   └── Tester 91c04e / subagent
    └── QR payment euro support / další hlavní chat
```

- **Manažer** znamená Cursor okno, nikoli model nebo další placenou generaci.
- **Agent hlavního chatu** znamená jednu konverzaci. Nese skutečný model a případnou spotřebu.
- **Vedoucí agent / senior** je tentýž chat ve chvíli, kdy koordinuje subagenty.
- **Subagent** znamená jednu konkrétní instanci delegované práce, ne pouze název role v konfiguraci.

Podrobný lifecycle a předávání práce jsou v [modelu chování](behavior-model.md).

## Ovládání kamery

| Vstup | Akce |
|---|---|
| Tažení levým tlačítkem | Otočení kamery kolem cíle |
| Tažení stisknutým kolečkem | Posun pohledu po půdorysu |
| Tažení pravým tlačítkem | Posun pohledu po půdorysu |
| Kolečko | Zoom |
| `WASD` nebo šipky bez vybraného majitele | Posun kamery relativně k pohledu |
| `Q` / `E` | Otočení pohledu |
| `Home` nebo `0` | Výchozí kompozice kamery |

Pozice kamery i její cíl se ukládají do stavu Webview. Zavření a opětovné otevření panelu proto běžně zachová poslední pohled.

## Ovládání majitele

- Klikněte na volnou podlahu a majitel tam dojde bezpečnou trasou.
- Klikněte na majitele nebo jeho kartu v týmovém panelu; `WASD` a šipky potom ovládají jeho postavu relativně ke kameře.
- `Esc` zruší výběr a vrátí pohybové klávesy kameře.
- Ruční chůze přeruší autonomní rozhovor a na devět sekund vypne automatiku.
- U delší kliknuté trasy se čas nečinnosti začne počítat až po příchodu.
- Po nečinnosti může majitel jít ke svému PC, navštívit volného agenta nebo se účastnit skutečné Cursor interakce.

Majitelova autonomie pouze pohybuje postavou. Neodesílá prompt a nemůže bez uživatele spustit ani změnit agenta.

## Výběr a štítky

Nad hlavou zůstává běžně jen kompaktní jméno. Úplný panel se otevře:

- najetím myši na postavu,
- najetím na její jmenovku,
- kliknutím na postavu nebo její kartu.

Po odjetí myši detail krátce zůstane otevřený, aby nebliknul při přejezdu mezi tělem a štítkem. Vybraná postava jej drží otevřený trvale. Kliknutí mimo postavu výběr neruší, pokud kliknutí zároveň posílá majitele na podlahu; `Esc` je jistý způsob návratu.

Detail podle dostupných dat ukazuje stav, roli, workspace, chat, aktuální nástroj nebo činnost, model a tokeny. `Model neuveden` nebo `tokeny nezaznamenány` je vědomé přiznání chybějícího runtime údaje, ne chyba výpočtu.

### Jak číst barvy

Spodní legenda odděluje dvě různé informace:

- **Role / košile:** zelený majitel, tyrkysový manažer Cursor okna, modrý hlavní chat nebo senior a fialový programátor/subagent. Mírně odlišné odstíny v rámci jedné barevné rodiny pouze rozlišují jednotlivé postavy. Manažeři, chaty/senioři a subagenti mají na košili stejný standardní bílý obdélníkový štítek se svým jménem; tento štítek nevyjadřuje roli ani stav. Majitel jej nenosí a odlišuje jej zlatá jmenovka nad hlavou; postava nenosí korunu.
- **Vzhled:** výška, stavba těla, odstín pokožky, barva vlasů a účes jsou různorodé, ale pro stejnou identitu stabilní i po reloadu. Majitel má ve výchozím profilu upravený tmavý účes s pěšinkou a patkou.
- **Stav / tělo a kruh:** šedý neznámý, modrý volný, zelený pracující, žlutý čekající na uživatele, červený problém, fialový hotový a tmavě šedý offline.

Role se během života postavy nemění kromě prezentačního povýšení hlavního chatu na seniora, které používá stejnou modrou kategorii. Stav se naopak mění průběžně. Stejné rozdělení používají barevné avatary a stavové popisky v týmovém panelu.

## Týmový panel a filtry

Týmový panel vpravo používá stejnou hierarchii jako kancelář. Kliknutí na kartu vybere postavu a otevře její detail.

Filtr může zobrazit:

- všechna živá Cursor okna,
- jeden konkrétní tým okna,
- nezařazené konverzace.

Skrytí týmu filtrem jej nezastaví. Postavy dál pracují, přesouvají se a mohou odejít. Po přepnutí zpět se zobrazí v aktuálním stavu.

## Stavy a místnosti

| Co vidíte | Typický význam |
|---|---|
| Postava sedí u monitoru a píše | `working` |
| Skutečný agent stojí, dívá se vzhůru a mává oběma rukama | `waitingForUser`; potřebuje pozornost nebo odpověď |
| Postava je v debug laboratoři | `error` |
| Oslava, lounge nebo gauč | `completed` nebo volný režim |
| Kuchyňka, mávání, protažení | `idle` / volnočasové chování |
| Více postav na gauči, u poradního stolu nebo v kruhu | Ambientní idle konverzace; nejde o novou práci v Cursoru |
| Cesta ke vstupu | Ukončený lifecycle a odchod |

Místnost není vždy přímým důkazem aktuálního stavu. Postava může být na cestě, čekat ve dveřích, vracet se z rozhovoru nebo dokončovat předchozí animaci.

Délky volnočasových akcí se záměrně liší. Čas posezení začíná až po příchodu na gauč nebo židli; káva, protažení, mávání, postávání i nezávazné rozhovory mají vlastní rozsahy a při každém dalším cyklu dostanou jinou stabilní hodnotu. Idle konverzace může mít dva až čtyři členy. Skupina si předem rezervuje sousední místa, počká na posledního příchozího, střídá jednoho mluvčího a po skončení se rozpadá postupně. Reálný prompt nebo handoff má vždy přednost.

## Modely a tokeny

Model patří skutečnému chatu nebo subagentovi. Manažer může ukázat souhrn modelů týmu, ale nemá vlastní generaci. Cursor Hooks poskytují model častěji než přesné tokeny.

Tokenový údaj s hvězdičkou lze otevřít. Ledger ukazuje pouze přesně oznámené hodnoty:

- celkem,
- podle úplné cesty workspace,
- podle modelu,
- podle kombinace workspace a modelu,
- podle lokálního dne.

Jedna generace se započítá pouze jednou. Pokud runtime posílá průběžné čítače, uloží se jejich maxima. Chybějící spotřeba se nezapisuje jako nula a ceny se neodhadují.

## Co se stane po dokončení

- Subagent se pokusí předat výsledek seniorovi, chvíli zůstane ve volném režimu a potom odejde přes východ.
- Hlavní chat může po dokončení také odejít, ale pouhá neaktivita jej běžně drží výrazně déle.
- Zavřené Cursor okno ztratí heartbeat; jeho manažer následně odejde.
- Nová aktivita stejné identity může odchod zrušit nebo postavu znovu přivést.

Přesná současná časování jsou v části [Neaktivita, dokončení a odchod](behavior-model.md#neaktivita-dokončení-a-odchod).

## Nastavení

| Nastavení | Význam |
|---|---|
| `cursorOffice.ownerName` | Jméno majitele; prázdná hodnota použije lokální uživatelské jméno |
| `cursorOffice.hostPath` | Volitelná absolutní cesta k host `.dll`, `.csproj` nebo spustitelnému souboru |

`hostPath` je určen hlavně pro vývoj a diagnostiku. Instalovaná VSIX obsahuje vlastní publikovaný .NET 10 host a standardně žádnou ruční cestu nepotřebuje.

## Soukromí a lokální soubory

Cursor Office nepoužívá Cursor Cloud API ani vlastní síťový server. Lokálně pracuje s těmito daty:

| Umístění | Obsah |
|---|---|
| `~/.cursor/hooks.json` | Uživatelská konfigurace pasivních hooků |
| `%LOCALAPPDATA%/CursorOffice/events-v3` | Krátkodobé privacy-filtered události s desetiminutovou retencí |
| `%LOCALAPPDATA%/CursorOffice/windows-v1` | Heartbeat živých Cursor oken |
| `%LOCALAPPDATA%/CursorOffice/conversation-windows-v1` | Hashovaná vazba konverzace na okno |
| `%LOCALAPPDATA%/CursorOffice/usage-ledger.json` | Přesně oznámené lokální tokenové agregace |
| `~/.cursor/projects/.../agent-transcripts` | Pouze metadata souborů pro fallback; obsah se neotevírá |
| `%APPDATA%/Cursor/User/globalStorage/state.vscdb` | Read-only dotaz pouze na hlavičku a název chatu |

Bridge zahazuje text promptu, odpovědi, reasoning, obsah souborů, příkazy a výstupy nástrojů. Krátký `task` nebo `description` subagenta může být očištěn a omezen na 140 znaků pro popisek práce; výstupní `summary` se zahazuje.

## Aktualizace

Po instalaci nové VSIX:

1. spusťte `Developer: Reload Window` ve všech otevřených Cursor oknech,
2. znovu otevřete Cursor Office,
3. pokud byly hooks už nainstalované, extension při aktivaci obnoví svůj bridge ve stabilní cestě,
4. ověřte verzi příkazem:

```powershell
cursor.cmd --list-extensions --show-versions | Select-String cursor-office
```

Pokud něco nesedí, pokračujte podle [diagnostiky](troubleshooting.md).
