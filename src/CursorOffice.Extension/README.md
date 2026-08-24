# Cursor Office

Lokální 3D kancelář pro sledování Cursor oken, hlavních chatů a jejich subagentů. Rozšíření obsahuje .NET 10 host, pasivní bridge pro Cursor Hooks a Three.js kancelář otevřenou jako běžná editorová záložka.

## První spuštění

1. Po instalaci nebo aktualizaci spusťte v každém otevřeném Cursor okně `Developer: Reload Window`.
2. Jednou spusťte `Cursor Office: Install Global Hooks`.
3. Spusťte `Cursor Office: Open Office`.

## Organizační model

```text
majitel
└── manažer Cursor okna
    └── hlavní chat / pracovní agent
        └── subagent / dočasný pracovník
```

Každé živé Cursor okno má jednoho manažera. Více chatů ve stejném okně jsou samostatní pracovní agenti pod ním. Hlavní chat s aktivními subagenty se prezentuje jako vedoucí agent nebo senior; subagenti jsou jeho dočasní pracovníci.

Všechna okna se zobrazují v jedné společné kanceláři. Filtr okna mění pouze viditelnost a neresetuje postavy ani jejich lifecycle.

## Chování

- Nový prompt vyvolá vizuální předání `majitel → manažer → hlavní chat`.
- Delegace a handoff propojí hlavní chat s konkrétními subagenty.
- Pracující postavy sedí u PC; čekající manažer používá zasedačku a chyby debug laboratoř.
- Skutečný chat nebo subagent ve stavu `Čeká na vás` stojí, natočí se k majiteli a periodicky zamává oběma rukama nad hlavou.
- Volné postavy mohou jít do lounge nebo kuchyňky, sednout si, mávat a hovořit. Kávový cyklus zahrnuje přípravu, nesení hrnku před tělem, několik doušků, návrat k dřezu a umytí pod tekoucí vodou; mimo cyklus se hrnek ani kávová ikona nezobrazují.
- Dokončený subagent po handoffu chvíli zůstává a potom odejde přes východ.
- Nová aktivita stejného ID může odchod zrušit nebo postavu znovu přivést.

Cursor Office zobrazuje pouze doložené události. Sám neodesílá prompt, nezadává práci a neovládá agenty.

## Ovládání

- levé tažení: otočení kamery,
- stisknuté kolečko nebo pravé tažení: posun,
- kolečko: zoom,
- `WASD`/šipky: pohyb kamery; po výběru majitele jeho chůze,
- kliknutí na podlahu: majitel dojde na místo,
- `Q`/`E`: otočení pohledu,
- `Home` nebo `0`: reset kamery,
- `Esc`: zrušení výběru majitele.

Po nečinnosti se majitel může vrátit ke svému PC nebo navštívit volného člena týmu. Ruční vstup má vždy prioritu a autonomní pohyb přeruší.

Volní členové týmu mohou vytvářet dvou- až čtyřčlenné rozhovory: sednout si vedle sebe na gauč, sejít se kolem poradního stolu nebo vytvořit stojící hlouček. Skutečné Cursor události mají před těmito ambientními scénami vždy prioritu.

## Modely, tokeny a soukromí

Model a tokeny patří skutečnému chatu nebo subagentovi, nikoli manažerovi. Zobrazují se pouze přesné údaje oznámené runtime; chybějící data se neodhadují.

Integrace běží lokálně a nepoužívá Cursor Cloud API. Hook bridge zahazuje prompty, odpovědi, reasoning, obsah souborů, příkazy a výstupy nástrojů. Fallback sleduje pouze metadata transcript souborů. Název chatu se na Windows dohledává úzkým read-only dotazem na hlavičku konverzace; zprávy se nečtou.

Diagnostiku najdete v Output kanálu `Cursor Office`. Nastavení `Cursor Office: Host Path` ponechte u instalované verze prázdné; je určené hlavně pro vývoj.
