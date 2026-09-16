# Product frontends

`products/research-os` and `products/xgc2` are independent frontend projects.
Their entry points, layouts, styling, dependency locks and tests remain separate.
Shared packages stay under `packages/`. Co-location does not require either product
to adopt the other's shell.

Run from this repository:

| Product | Install | Build | Test |
| --- | --- | --- | --- |
| XGC2 | `npm run install:xgc2` | `npm run build:xgc2` | `npm run test:xgc2` |
| Research OS | `npm run install:research-os` | `npm run build:research-os` | `npm run test:research-os` |

Research builds from `products/research-os`. The product npm projects are
excluded from the library's pnpm workspace.
