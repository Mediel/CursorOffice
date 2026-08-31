# Vizuální a funkční parita

Referenčním bodem je The Delegation v0.2.0. Cursor Office nemá kopírovat jeho Gemini multimediální studio; cílem je dosáhnout stejné kvality prostorové vizualizace a transparentnosti agentů nad lokálními Cursor událostmi.

## Aktuální matice

| Oblast | Cursor Office | Další produkční krok |
| --- | --- | --- |
| 3D kancelář | vlastní vícemístnostní dispozice: ředitelna, studio, debug lab, lounge, porada, recepce, kuchyňka a dveřní průchody | vlastní optimalizované GLB prostředí |
| Postavy | vlastní procedurální kloubový rig, obličej a deklarativní stavový automat: sednutí/vstávání, práce u klávesnice, hovor, poslech, mávání, protažení, pití kávy a emoce | Blender/GLB rig při zachování stejného stavového kontraktu |
| Pohyb | visibility-graph A*, kolize nábytku/stěn, sliding, konstantní rychlost a exkluzivně rezervované POI | navmesh generovaný z finálního modelu |
| Interakce | volná orbit/pan/zoom kamera ovládaná myší i klávesami, perzistence pohledu, raycasting, výběr, přístupný seznam a ovladatelný majitel | kontextové akce a schvalování |
| Inspector | role, úkol, stav, model, doložené tokeny poslední generace a privacy-safe activity timeline | activity historie, tool calls a usage dashboard |
| Živá data | Cursor Hooks + fallback metadata transcriptů, primary/subagent hierarchie, stabilní ID, parent/workspace/model a TTL cleanup | uživatelské názvy rolí, ACP adaptér |
| Workflow | stavové zóny, exkluzivní POI a nábytkové approach/visual kotvy, dokončení → prodleva → odchod dveřmi → odstranění | activity timeline, kanban, delegace a review flow |
| Výkon | jeden lokální bundle, omezené DPR a sdílený render loop | instancing, LOD a profilování desítek agentů |
| Asset licence | pouze vlastní/CC0, žádné upstream modely | evidence exportů a automatická validace rozpočtů |

## Co znamená „parita“

Parita je splněna, když uživatel v Cursoru bez cloudového Cursor API:

1. vidí všechny lokální agenty a jejich aktuální činnost,
2. rozumí předávání práce, čekání na člověka a chybám,
3. může otevřít historii a technické detaily každého agenta,
4. sleduje přirozený pohyb a animace ve vlastní profesionální 3D kanceláři,
5. udrží plynulý Webview při cílovém počtu agentů,
6. může celé řešení sestavit, spustit a používat lokálně.

Multimodální generování obrázků, hudby a videa není součástí parity: jde o jiný produktový cíl a odporovalo by požadavku na lokální Cursor-first nástroj.

## Nejbližší kritická cesta

1. Stabilní korelace subagentů a perzistentní activity log.
2. Inspector s historií a schvalovacím tokem.
3. Blender vertical slice: jedna rigovaná postava, jedna sada animací a jeden modul kanceláře.
4. GLB loader, animation blending a navmesh.
5. Instancing/LOD a měření výkonu.
