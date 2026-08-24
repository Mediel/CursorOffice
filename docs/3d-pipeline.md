# 3D asset pipeline

Produkční modely budou vlastní a vzniknou v Blenderu. Procedurální scéna zůstane jako rychlý fallback, testovací fixture a nástroj pro ověřování dispozice.

## Adresářový model

```text
assets/
├── source/                 # .blend a zdrojové textury; neupravovat export ručně
│   ├── characters/
│   └── office/
├── manifests/              # autor, licence, verze a rozpočty
└── runtime/                # optimalizované .glb určené k zabalení
    ├── characters/
    └── office/
```

## Konvence exportu

- Y-up, metry, transformace aplikované před exportem.
- Kladný směr postavy je +Z.
- Rig postavy používá stabilní kostru a názvy klipů `Idle`, `Walk`, `Work`, `Talk`, `Celebrate`, `Error`.
- Body zájmu jsou prázdné uzly `poi-{type}-{id}`.
- Kolizní geometrie a navmesh nejsou renderované a mají samostatné uzly.
- Runtime používá GLB; zdrojové `.blend` se nikdy nenačítají ve Webview.

## Rozpočty prvního vertical slice

| Asset | Trojúhelníky | Textury | Poznámka |
| --- | ---: | ---: | --- |
| postava LOD0 | do 18 000 | 1× 1024² | jedna sdílená kostra |
| postava LOD1 | do 7 000 | sdílené | pro vzdálené agenty |
| kancelář | do 120 000 | atlas do 2× 2048² | modulární díly |
| jednotlivý prop | do 4 000 | atlas | preferovat instancing |

## Build krok

Plánovaný exporter musí být reprodukovatelný z příkazové řádky Blenderu a musí:

1. ověřit názvy uzlů a animačních klipů,
2. aplikovat definované exportní nastavení,
3. zapsat GLB do `assets/runtime`,
4. vypsat polygonový a texturový rozpočet,
5. selhat při chybějící licenci nebo překročení limitu.

První část této brány už je implementována příkazem `pnpm assets:validate`: ověřuje GLB 2 a povinný manifest. Kontrola rozpočtů proti kategoriím se doplní současně s prvním skutečným Blender vertical slice.
