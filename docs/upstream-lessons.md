# Poučení z porovnání s The Delegation

Referenční projekt The Delegation je měřítkem kvality zážitku, nikoli architekturou k převzetí. Cursor Office zůstává lokální pozorovací vrstvou nad skutečnými Cursor agenty a nebude přebírat vlastní Gemini orchestraci, ukládání promptů ani assety s nekompatibilní licencí.

## Co zachovat z Cursor Office

- lokální a privacy-filtered Cursor Hooks bridge,
- skutečnou hierarchii workspace → konverzace → podagent,
- přesné tokeny bez dopočítaných odhadů,
- vlastní kolizní navigaci, dveřní provoz a lifecycle dočasných agentů,
- lehký Webview vhodný jako záložka IDE.

## V čem se přiblížit referenci

1. **Prostorová uvěřitelnost.** Postava musí používat konkrétní nábytek, nikoli pouze dojít na přibližnou souřadnici. Každý interaktivní kus nábytku má mít walkable approach point, vizuální kotvu, orientaci, typ posedu a obsazenost.
2. **Čitelnost práce.** Inspector doplnit o perzistentní activity timeline, tool call signály, delegaci, handoff a review stav.
3. **Vizuální asset pipeline.** Po stabilizaci behavior kontraktu nahradit vybrané procedurální modely vlastními optimalizovanými GLB assety a baked animacemi.
4. **Udržitelnost frontendu.** Rozdělit `OfficeWorld` na scénu/prostor, lifecycle, sociální koordinátor, navigaci a prezentační vrstvu dříve, než přibude workflow UI.
5. **Škálování.** Až profilování ukáže limit, zavést instancing/LOD pro postavy a opakovaný nábytek.

## Realizovaný první krok

Gauč a konferenční stolek používají sdílené fixture definice, ze kterých vzniká geometrie i kolizní mapa. Gaučové POI odděluje bezpečný bod příchodu před colliderem od lokální vizuální kotvy na sedáku. Procedurální rig při sedání plynule přejede na kotvu a použije samostatný uvolněný `sofaSeat` posed; poradní židle zůstávají vzpřímené. Stejný kontrakt lze později použít pro křesla, barové stoličky, kuchyňku a vlastní GLB nábytek.

## Následující pořadí

1. Doplnit kotvy a typy posedu ke všem židlím a křeslům.
2. Oddělit prostorové fixtures a stavbu scény z `OfficeWorld`.
3. Přidat lokální activity timeline do inspectoru.
4. Vytvořit jednu vlastní rigovanou GLB postavu jako vertical slice.
5. Teprve potom přidávat Kanban/review ovládání a optimalizovat instancing.
