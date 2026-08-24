# Model kanceláře a chování postav

Tento dokument je zdrojem pravdy pro to, co jednotlivé postavy představují, odkud se berou jejich stavy a jak se pohybují mezi prací, čekáním, volným časem a odchodem. Cursor Office je observační vrstva: zobrazuje lokálně doložené dění v Cursoru, ale sám agentům nezadává skutečné úkoly a nezasahuje do jejich rozhodování.

## Organizační model

Všechna rozpoznaná Cursor okna a jejich týmy se zobrazují v jedné společné kanceláři. Otevření záložky `Cursor Office` v jiném okně nevytvoří nový oddělený svět; jde o další pohled na stejná lokální data. Filtr okna pouze skryje ostatní týmy, nemaže je ani nerestartuje jejich lifecycle.

```text
majitel kanceláře (uživatel)
└── manažer Cursor okna
    ├── hlavní chat / pracovní agent
    │   └── subagent / dočasný pracovník
    └── další současně aktivní nebo nedávný chat
        └── jeho vlastní subagenti
```

| Postava | Co představuje | Stabilní identita | Model a tokeny |
|---|---|---|---|
| Majitel | Lokálního uživatele | Jedna postava v kanceláři | Nemá model ani runtime tokeny |
| Manažer | Jedno živé desktopové okno Cursoru | Dočasné ID extension hostu a heartbeat | Ukazuje souhrn týmu; nemá vlastní generaci |
| Hlavní chat | Jednu Cursor konverzaci | `conversation_id` | Patří sem model, generace a spotřeba skutečného chatu |
| Vedoucí agent / senior | Hlavní chat, který právě má potomky | Stejné `conversation_id` jako chat | Stejná runtime data jako hlavní chat |
| Subagent / pracovník | Jednu konkrétní instanci delegované práce | ID podagenta a ID rodičovské konverzace | Vlastní model a tokeny pouze tehdy, když je runtime oznámí |

Workspace nebo repozitář je organizační kontext, nikoli automaticky další postava. Manažer se jmenuje například `Manažer Frontend` nebo `Manažer Backend`. Pokud je otevřeno více oken stejného workspace, jméno dostane krátký suffix okna.

### Role a stav používají dvě barvy

Stálá barva košile a malého odznaku na hrudi vyjadřuje roli: majitel je zelený, manažer tyrkysový, hlavní chat/senior modrý a subagent fialový. Majitelova jmenovka zůstává zlatá jako decentní označení role; samotná postava nenosí korunu ani trvale plovoucí korunkovou emoci. Odstín košile se podle stabilní identity mírně liší, ale zůstává ve své rolové barevné rodině. Proměnná barva světelného kruhu, jmenovky a stavového textu vyjadřuje výhradně lifecycle stav podle tabulky níže. Spodní legenda i avatary v týmovém panelu používají stejnou mapu. Barvy místností již nejsou vydávány za role ani za stav postavy.

Vzhled postavy se deterministicky odvozuje z její stabilní identity. Postavy proto mohou být nižší, vyšší, štíhlé, běžné, širší, podsadité nebo atletické a používají různé odstíny pokožky a vlasů. Účesy zahrnují pleš, velmi krátké a krátké vlasy, pěšinku, bob, delší vlasy, kudrny, drdol a mohykán. Majitel má stabilní reprezentativní executive variantu: plný tmavý účes, zřetelnou pěšinku, boční vlasy a tvarovanou patku, která je čitelná i z horní izometrické kamery. Stejná identita dostane po reloadu stejný vzhled; rozměrové odchylky jsou omezené tak, aby zůstala zachována navigace, sezení a průchod dveřmi.

### Jedno okno a více chatů

Jedno Cursor okno může mít současně více chatů. Každý rozpoznaný hlavní chat je samostatný pracovní agent pod manažerem daného okna. Chat bez potomků se prezentuje jako `Agent`; jakmile má aktivní subagenty, stejná postava se označí jako `Vedoucí agent` a plní roli seniora nebo koordinátora. Nejde o novou kopii postavy.

Název chatu se získává pomocí stabilního `conversation_id`. Na Windows host otevře Cursor databázi `state.vscdb` pouze pro čtení a z tabulky `composerHeaders` načte jen dvojici `composerId` a pole `name`. Zprávy, prompty, odpovědi ani fulltextový index nečte. Když hlavička není dostupná, použije bezpečný název `Agent <krátké ID>`.

### Rozpoznání Cursor oken

Každé aktivované okno extension zapisuje každé dvě sekundy malý heartbeat s dočasným ID okna, PID extension hostu, názvem workspace, cestami otevřených workspace a informací o zaměření. Záznam mrtvého procesu se zahodí okamžitě a heartbeat starší než sedm sekund expiruje jako záložní lease. Když znovuotevřené okno dostane nové runtime ID, logický manažer stejného workspace převezme původní vizuální postavu a její polohu; dvě skutečně současně živá okna stejného workspace se neslučují.

Cursor Hooks neposkytují veřejné ID desktopového okna. Při `beforeSubmitPrompt` proto bridge spojí konverzaci s právě zaměřeným živým oknem, které odpovídá workspace. Jednoznačnou vazbu si uloží pod kryptografickým hashem ID konverzace. Pokud je případ nejednoznačný, systém nic nehádá a chat zůstane ve filtru `Nezařazené`.

## Zdroje pravdy a jejich priorita

Cursor Office slučuje několik lokálních zdrojů. Vyšší zdroj nesmí být přepsán méně přesným odhadem.

1. **Cursor Hooks** – primární zdroj začátku promptu, použití nástroje, odpovědi, delegace, handoffu, chyby a ukončení.
2. **Lokální metadata transcript souborů** – fallback pro workflow, které nevyšle potřebný hook. Sleduje pouze cestu, velikost a čas změny; obsah `.jsonl` neotevírá.
3. **Prezentační projekce Webview** – z agentů a živých oken sestaví manažery, týmovou hierarchii, cíle v místnostech a animace. Nemění skutečný Cursor stav.

Jakmile bylo stejné ID pozorováno přes skutečný hook, starší fallback metadata je nesmí znovu falešně označit jako pracující. Fallback kontroluje změny přibližně po 300 ms a za aktivní považuje metadata změněná v posledních 12 sekundách.

## Pracovní tok a sociální předávání

Sociální interakce nejsou náhodnou dekorací, pokud pro ně existuje skutečný Cursor signál. Webview je ukládá do fronty, aby jedna postava nemluvila s několika lidmi současně.

### Nové zadání uživatele

```text
uživatel odešle prompt
→ manažer aktivního Cursor okna přijde k majiteli
→ pracovní agent daného chatu převezme zadání od manažera
→ případní subagenti přijdou k vedoucímu agentovi pro svou delegaci
```

Signál pochází z `beforeSubmitPrompt`. Text promptu se do Cursor Office nepřenáší. Vizuální řetězec ukazuje, kdo zadání převzal, nikoli jeho obsah.

### Delegace subagentovi

`subagentStart` vytvoří nebo aktivuje konkrétního pracovníka a spojí jej s rodičovským chatem. Subagent naplánuje bezpečnou cestu k vedoucímu agentovi, oba se natočí proti sobě, krátce střídají mluvení a naslouchání a pracovník poté odchází na své pracovní místo. Rodičovský chat se současně prezentuje jako senior/koordinátor.

### Dokončení a handoff

```text
subagent dokončí práci
→ vrátí se k vedoucímu agentovi s handoffem
→ hlavní chat předá výsledek manažerovi
→ manažer může předat odpověď majiteli
```

Jednotlivé kroky se zobrazí pouze tehdy, když je Cursor nebo harness doloží odpovídající událostí. Cursor Office nevyrábí falešné předání jen proto, aby animace vypadala úplně. Dokončenému podagentovi se během čekajícího handoffu pozastaví deadline odchodu.

### Fronta rozhovorů

- čekající skutečná interakce má přednost před náhodným idle rozhovorem,
- jedna konverzace trvá přibližně 9,5 sekundy,
- účastníci se vracejí na předchozí rezervované místo,
- návrat má bezpečnostní limit 24 sekund,
- ruční ovládání majitele rozhovor s majitelem okamžitě přeruší,
- štítky dvou účastníků se během hovoru rozdělí do dvou výškových úrovní.

## Význam stavů

| Stav | Význam v datech | Výchozí místo a chování |
|---|---|---|
| `working` | Probíhá generace, nástroj nebo aktivní subagent | Pracovní stůl, sezení a psaní na klávesnici |
| `waitingForUser` | Agent čeká na rozhodnutí nebo vstup uživatele | Skutečný chat/subagent stojí a periodicky žádá o pozornost; manažer agreguje stav v zasedačce |
| `error` | Nástroj nebo agent skončil chybou | Debug laboratoř a znepokojená animace |
| `completed` | Generace nebo delegovaná práce skončila | Krátká oslava, lounge a následný lifecycle podle typu postavy |
| `idle` | Agent je známý, ale právě není doložená práce | Volná místa, lounge, kuchyňka, gesta a rozhovory |
| `offline` | Relace byla ukončena nebo zmizela | Lounge nebo příprava na odchod |
| `unknown` | Identita je známá, ale zdroj nedal přesnější stav | Klidové chování bez tvrzení, že agent pracuje |

Změna stavu přidělí postavě vhodný bod zájmu. Pracovní židle, místa na poradě, lounge, kuchyňka a debug zóna se rezervují, takže dvě postavy nedostanou stejné místo. Pokud preferované místo není volné, použije se bezpečný fallback.

### Čekání na odpověď a Plan mode

Cursor Office nečte obsah plánu ani odpovědi, a proto bezpečně nerozlišuje „plán obsahuje otázku“ podle textu. Používá obecný runtime stav `waitingForUser`. Ten vzniká například po dokončené odpovědi nebo v okamžiku, kdy agent potřebuje další rozhodnutí.

Skutečný hlavní chat/senior nebo subagent v tomto stavu:

- rezervuje volné stojící místo místo židle,
- přestane se účastnit náhodného idle putování a ambientních rozhovorů,
- po příchodu se natočí k aktuální poloze majitele,
- přibližně po 1–2 sekundách zvedne obě ruce nad hlavu, podívá se vzhůru a zvýrazní ikonu ruky,
- po 9–15 sekundách klidného čekání gesto znovu opakuje,
- okamžitě přestane, jakmile nový hook změní stav nebo začne skutečná sociální interakce.

Syntetický manažer okna může týmový stav `waitingForUser` agregovat, ale gesto nedělá. Pozornost tak žádá postava skutečného runtime agenta, kterému lze odpovědět, nikoli obě úrovně současně.

## Neaktivita, dokončení a odchod

„Chat už nepoužívám“ může v Cursoru znamenat několik různých věcí. Cursor Office proto nerozhoduje pouze podle toho, která záložka je vidět.

### Hlavní chat

- Skutečný `completed` nebo `offline` stav dovolí postavě přejít do volného režimu a později odejít.
- Pouze neaktivní chat obvykle nejprve přejde do `idle`; host jej drží až 30 minut od poslední aktivity, aby se při návratu nemusel znovu rodit u vstupu.
- Dokončený primární snapshot má v hostu retenci 20 minut, ale jeho vizuální pracovní postava pod manažerem může po terminálním signálu odejít dříve.
- Neznámý stav má retenci 10 minut a primární `offline` stav 28 sekund.
- Nová aktivita se stejným `conversation_id` zruší odchod nebo postavu znovu legitimně přivede.

### Subagent

- Dokončený, zastavený, chybový nebo zaniklý subagent se označí jako dočasně odcházející.
- Přednost má dostupný handoff rodičovskému seniorovi.
- Potom se přibližně 48 až 90 sekund podle koncového stavu a pořadí týmu může potulovat, sedět, oslavovat nebo jít pro kávu.
- Následně naplánuje trasu ke dveřím. Po zahájení odchodu má Webview bezpečnostní limit 42 sekund na odstranění postavy.
- Host drží dokončené, chybové nebo idle subagenty nejvýše dvě minuty; offline subagenta 12 sekund. Vizuální retirement může doběhnout i po odstranění snapshotu.

### Manažer okna

Manažer existuje, dokud je živý heartbeat jeho Cursor okna. Po ukončení extension-host procesu se záznam vyřadí okamžitě; při nedostupném PID expiruje nejpozději po sedmisekundové heartbeat lease a manažer zahájí fyzický odchod. Znovuotevření stejného logického okna převáže nové runtime ID na existující postavu, aby nevznikl odcházející a přicházející dvojník. Manažer není runtime agent, proto nemá vlastní model, tokeny ani samostatný Cursor úkol.

Časy jsou výchozí implementační hodnoty, ne smlouva Cursor API. Rozhovor ve frontě, čekání ve dveřích nebo delší kolizně bezpečná cesta mohou vizuální odchod posunout.

## Volný čas a emoce

Postava ve volném režimu nezůstává trvale stát u východu. Po příchodu na rezervované místo přibližně každých 22 až 40 sekund zvažuje další aktivitu. Může:

- sedět na gauči nebo v lounge,
- přejít do zasedačky,
- jít ke kávovaru, připravit si kávu, odnést hrnek na volné místo, napít se a vrátit jej ke dřezu,
- rozhlédnout se, protáhnout se, zamávat nebo oslavit dokončení,
- zapojit se do rozhovoru ve dvojici nebo skupině až čtyř postav.

Ambientní sociální koordinátor přibližně každých 12 až 32 sekund zvažuje novou scénu, pouze pokud nečeká důležitější skutečná interakce. Vybere dvě až čtyři dostupné postavy a jednu z prostorových formací: sousední místa na gauči, židle kolem poradního stolu nebo otevřený stojící hlouček. Všechna místa se rezervují atomicky; pokud je některé obsazené neúčastníkem, koordinátor zvolí jinou scénu nebo ji odloží. Rozhovor začne až po příchodu a usazení posledního člena. Jeden člen mluví, ostatní naslouchají a role se nepravidelně střídají. Mrkání, dýchání a drobné pohyby běží nezávisle na lifecycle.

Volnočasové časování není společný pevný interval. Doba pobytu se začne počítat až po skutečném příchodu na místo: gauč přibližně 18–58 sekund (u hotového agenta až 72), porada 12–46 sekund a ostatní odpočinek 10–48 sekund podle typu POI. Kávový cyklus má vlastní fáze: příprava u rezervovaného kávovaru trvá přibližně 2–5 sekund, popíjení na jednom ze tří vyhrazených míst 9–18 sekund a mytí u samostatně rezervovaného dřezu 4–7 sekund. Hrnek je viditelný pouze od dokončení přípravy do konce mytí; při chůzi zůstává vzpřímený před tělem, při pití se opakovaně zvedá k ústům a u dřezu běží proud vody. Běžný stav `idle` používá neutrální emoci, nikoli trvalou ikonu kávy. Pokud je dřez obsazený, postava s prázdným hrnkem vyčká na svém místě a pravidelně rezervaci zkusí znovu. Protažení trvá 3–7 sekund, mávnutí 2–5 sekund a rozhlížení 2–6 sekund. Skupinový rozhovor trvá podle prostředí přibližně 8–46 sekund a mluvčí se střídají po 1–5 sekundách. Po poslední replice postavy ještě různě dlouho zůstávají sedět nebo stát, takže se nerozejdou v jediném synchronním okamžiku.

Skutečný `beforeSubmitPrompt`, odpověď, delegace nebo handoff má před ambientní skupinou vždy prioritu. Pokud se týká některého účastníka, skupina se bezpečně rozpustí, uvolní sociální režim a reálná událost pokračuje přes běžnou frontu. Odchodový deadline dokončeného podagenta je po dobu skupiny pozastaven a po jejím skončení obnoven.

Hodnoty jsou pseudo-náhodně odvozené z identity postavy, aktivity a pořadí cyklu. Díky tomu působí každá další akce jinak, ale čas se nemění mezi jednotlivými render snímky a chování zůstává reprodukovatelné při diagnostice.

## Majitel kanceláře

Majitel je jediná postava, kterou uživatel přímo ovládá.

- Kliknutí na volnou podlahu naplánuje kolizně bezpečnou trasu na zvolené místo.
- Po výběru majitele jej `WASD` nebo šipky ovládají relativně k aktuálnímu natočení kamery.
- Přímá chůze používá stejný stav `walk` jako plánovaná trasa, takže se pohybují nohy i paže.
- Každý ruční pohyb nastaví devítisekundový override. U delší kliknuté trasy začne čekání autonomie až po skutečném příchodu.
- Nový ruční vstup zruší autonomní rozhovor a má vždy prioritu.

Po nečinnosti majitel reaguje v tomto pořadí:

1. skutečný Cursor rozhovor nebo předání,
2. monitorování aktivní práce u vlastního počítače,
3. návštěva volného člena týmu,
4. klidové sezení u stolu, pokud není vhodný partner.

Autonomní rozhodnutí se znovu plánuje přibližně po 20 až 28 sekundách. Pokud právě někdo pracuje, majitel většinou zůstává u stolu a sociální návštěvu volí jen občas. Autonomie nikdy neodesílá prompt, nespouští agenta a nevytváří práci v Cursoru.

## Navigace a vyhýbání

Pevné překážky jsou součástí kolizní mapy. Visibility-graph A* vede trasu kolem stěn, stolů, gauče a dalšího nábytku. Dveře mají vlastní FIFO správu průchodu: první postava si portál krátce rezervuje, ostatní čekají před prahem.

Mimo dveře se předpovídají konflikty pohybujících se postav. Stabilní priorita zabrání tomu, aby obě střídavě uskakovaly; jedna krátce počká a případně dostane boční waypoint. Watchdog sleduje skutečný postup i během dávání přednosti. Pokud lokální úkrok selže, přepočítá celou trasu se všemi ostatními postavami jako dočasnými kruhovými překážkami, takže může obejít stolek nebo použít delší chodbu. Nábytková sedadla oddělují bezpečný bod chůze od vizuální kotvy na sedáku, takže postava neprochází colliderem gauče.

## Jména, modely a tokeny

Kompaktní štítek ukazuje pouze jméno. Hover nad postavou nebo jménem otevře detail a po odjetí jej ještě krátce podrží; výběr postavy jej nechá otevřený trvale. Detail může obsahovat:

- roli a stav,
- aktuální nástroj nebo krátký privacy-safe popis delegované práce,
- název chatu,
- workspace a Cursor okno,
- model oznámený runtime,
- přesně zaznamenané tokeny poslední generace.

Hodnota `model neuveden` znamená, že ji aktuální Cursor událost neposkytla. Stejně tak chybějící tokeny nejsou nula. Cursor Office je neodhaduje a nevypočítává cenu. Lokální ledger deduplikuje jednu generaci, zachovává maxima průběžných čítačů a nabízí součty celkem, podle úplné cesty workspace, modelu, kombinace workspace/model a dne.

## Filtry

- `Všechna okna` ukazuje celou společnou kancelář.
- Konkrétní Cursor okno zobrazí jeho manažera, chaty a podagenty.
- `Nezařazené` obsahuje konverzace, u kterých nebylo bezpečné určit desktopové okno.

Filtr mění pouze viditelnost. Skrytá postava dál drží svou pozici, stav, rezervaci a lifecycle. Po návratu filtru se proto neobjeví znovu u vstupu.

## Co zatím není garantováno

- Cursor nemá jedno veřejné API poskytující současně všechna okna, chaty, subagenty, modely a přesné tokeny.
- Přesnost závisí na hook událostech konkrétní verze Cursoru a použitého harnessu.
- Pouhé přepnutí viditelné záložky chatu nemusí být lifecycle událost.
- Chybějící model nebo tokeny nelze bezpečně doplnit z dojmu UI.
- Sociální řetězec zobrazuje jen doložené kroky; chybějící hook znamená chybějící animaci předání.
- Cursor Office je zatím observační. Kliknutí na postavu ani autonomie neposílají příkazy agentům.

Praktické použití popisuje [uživatelská příručka](user-guide.md), zdroje dat [integrace s Cursorem](cursor-integration.md) a problémy [diagnostika](troubleshooting.md).
