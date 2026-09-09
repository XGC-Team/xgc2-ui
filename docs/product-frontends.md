# Product frontends

`products/research-os` is the active Research frontend. `products/xgc2` is a
migration candidate; its cutover is pending until active writers in the backend
checkout finish. Do not maintain the candidate and the backend copy in parallel.
The XGC2 runner remains gated on an explicit, byte-identical adoption.

The two products are independent frontend projects.
Their entry points, layouts, styling, dependency locks and tests remain separate.
Shared packages stay under `packages/`; co-location does not require either product
to adopt the other's shell. The designer reference is a separate local project.

Run from this repository:

| Product | Install | Build | Test |
| --- | --- | --- | --- |
| XGC2 | `npm run install:xgc2` | `npm run build:xgc2` | `npm run test:xgc2` |
| Research OS | `npm run install:research-os` | `npm run build:research-os` | `npm run test:research-os` |

XGC2's product profile generation, native-agent preparation and backend integration
tests depend on the backend checkout. Set `XGC2_PRODUCT_ROOT` when it is not at the
usual DevOps sibling location. The runner materializes `products/xgc2` into that
checkout's `web/` build directory. Edit the source here, not the generated build
copy. `scripts/sync-product-frontend.py` records every owned file and refuses to
replace local edits in the build copy. Preserve such changes in the owner and
reconcile the receipt explicitly before further synchronization; do not reset them.
Dependencies and generated outputs in the build directory are retained.

Research builds directly from `products/research-os`. Its API remains the Research
service; runtime lifecycle belongs to the harness runtime entry. The shared runtime
starts the workbench on 3201 with the existing API on 3200. The original designer
project is independent of the API and product runtime.

The product npm projects are deliberately excluded from the library's pnpm
workspace. Moving sources does not upgrade the library, change palettes, replace
controls, modify business callbacks or refresh visual baselines.
