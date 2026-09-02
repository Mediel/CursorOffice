# 3D asset pipeline

Production models will be original and created in Blender. The procedural scene remains a fast fallback, test fixture, and layout-validation tool.

## Directory layout

```text
assets/
├── source/                 # .blend files and source textures; never hand-edit exports
│   ├── characters/
│   └── office/
├── manifests/              # author, license, version, and budgets
└── runtime/                # optimized .glb files included in the extension
    ├── characters/
    └── office/
```

## Export conventions

- Y-up, meters, transforms applied before export.
- Character forward direction is +Z.
- Character rigs use stable skeletons and clip names: `Idle`, `Walk`, `Work`, `Talk`, `Celebrate`, and `Error`.
- Points of interest are empty nodes named `poi-{type}-{id}`.
- Collision geometry and navmesh are non-rendered, separately named nodes.
- Runtime uses GLB; the Webview never loads source `.blend` files.

## First vertical-slice budgets

| Asset | Triangles | Textures | Notes |
|---|---:|---:|---|
| Character LOD0 | up to 18,000 | 1 × 1024² | one shared skeleton |
| Character LOD1 | up to 7,000 | shared | distant agents |
| Office | up to 120,000 | atlas up to 2 × 2048² | modular pieces |
| Individual prop | up to 4,000 | atlas | prefer instancing |

## Build step

The planned exporter must run reproducibly from the Blender command line and:

1. validate node and animation-clip names;
2. apply defined export settings;
3. write GLB files to `assets/runtime`;
4. report polygon and texture budgets; and
5. fail on a missing license or exceeded budget.

`pnpm assets:validate` already validates the GLB 2 header and requires a manifest for every runtime model. Category-budget checks will be added with the first real Blender vertical slice.
