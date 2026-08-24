# Pravidla pro 3D a grafické assety

Produkční assety Cursor Office budou vlastní. Adresář nesmí obsahovat modely, textury, animace ani environment mapy převzaté z The Delegation.

## Povinná evidence

Každý externí asset musí mít vedle souboru záznam obsahující:

- autora a zdroj,
- datum získání,
- přesnou licenci,
- povolené způsoby distribuce a úprav,
- provedené změny.

Preferované jsou vlastní assety a CC0. Asset s omezením `NonCommercial`, `NoDerivatives` nebo nejasnou licencí se do distribuovaného rozšíření nesmí přidat.

## Technické konvence

- formát runtime modelů: GLB,
- souřadnice: Y nahoru, jeden unit = jeden metr,
- modely musí mít stabilní názvy uzlů,
- POI uzly používají tvar `poi-{type}-{id}`,
- navmesh je samostatně pojmenovaný uzel,
- zdrojové Blender soubory budou oddělené od optimalizovaných runtime exportů.

## Automatická kontrola

Příkaz `pnpm assets:validate` kontroluje hlavičku GLB 2 a vyžaduje pro každý runtime model odpovídající licenční manifest. Je také součástí `pnpm check` a `pnpm build`.
