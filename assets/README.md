# 3D and graphic asset policy

Production Cursor Office assets must be original or have a verified compatible license. This directory must not contain models, textures, animations, or environment maps copied from The Delegation.

## Required provenance

Every external asset must have a nearby manifest recording:

- author and source;
- acquisition date;
- exact license;
- permitted distribution and modification; and
- modifications made for Cursor Office.

Original assets and CC0 are preferred. Assets restricted by `NonCommercial`, `NoDerivatives`, or an unclear license must not be included in the distributed extension.

Brand assets are not automatically covered by the repository's MIT License. See [NOTICE.md](../NOTICE.md) and any asset-specific README.

## Technical conventions

- Runtime model format: GLB
- Coordinates: Y-up, one unit equals one meter
- Stable model node names
- POI nodes named `poi-{type}-{id}`
- Navmesh in a separately named node
- Source Blender files separated from optimized runtime exports

## Automated validation

`pnpm assets:validate` checks the GLB 2 header and requires a matching license manifest for every runtime model. The command is part of both `pnpm check` and `pnpm build`.
