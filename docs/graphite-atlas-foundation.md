# Graphite Atlas foundation

This is an additive, opt-in foundation slice, not a Research OS rollout.
The existing workflow entry remains unchanged. The new entry is
`@xgc2/ui-workflow/graph`; it does not import React Flow or a second graph engine.
The existing workflow package still declares its existing React Flow peer.

## Components and ownership

- `GraphCanvas`: controlled selection, fit/zoom, resource-list search and
  pagination, a reduced-motion-aware renderer lifecycle, honest empty/error
  states, and immutable selection context callbacks.
- `GraphInspector`: existing resource metadata, incident directed relationships,
  an evidence slot, and explicit host-owned open/discuss/reveal actions.
- `GraphRendererFactory`: separates the browser surface from graph computation,
  transport, permissions, persistence, and any future renderer replacement.
- `indexGraph`, `projectGraph`, `neighbourhood`, `selectionContext`: validate and
  compose an input projection without inferring scientific relationships.

Nodes require a stable logical resource ID and an exact revision. Edges require
explicit confirmed/proposed state. Proposals are hidden by default. The graph
snapshot has its own identity, scope and completeness flag. Graph proximity is
not a claim of citation, support or causality. Filtering never creates edges.
An open graph is not an instruction for a model to process the whole library.

The product owns the authoritative projection, permission checks, routing,
resource content, chat transport, saved views and export confirmation. No network,
model call, CDN fallback, persistent storage, or content download is hidden inside
these components. A selection payload contains IDs/revisions and evidence
references, not document bytes; the host must resolve and authorize them.

## Renderer used by this slice

`createCytoscapeRenderer(engine)` adapts a host-supplied Cytoscape 3.33.x factory.
The actual browser checks used 3.33.1 from an available offline bundle. This is a
Canvas renderer with preset coordinates, not a Sigma/WebGL implementation or a
worker force-layout implementation. The engine was injected rather than adding
an unverified dependency or hand-editing the workspace lockfile.

The adapter keeps existing node positions and the graph-space camera on snapshot
replacement. It has finite focus transitions, theme changes, optional proposed
edges, zoom-dependent glyph detail, and a bounded, screen-space label budget.
The host should provide useful positions; the deterministic fallback is only an
initial placement, not a topic clustering or evidence-layout algorithm.

## Host composition

After publishing and installing matching immutable UI and policy release assets,
a consumer that already resolves an approved Cytoscape package can use:

```tsx
import { useMemo, useState } from 'react';
import cytoscape from 'cytoscape';
import '@xgc2/ui-react/styles.css';
import '@xgc2/ui-workflow/styles.css';
import {
  GraphCanvas,
  createCytoscapeRenderer,
  type GraphSnapshot,
  type SelectionContext,
} from '@xgc2/ui-workflow/graph';

export function Atlas({ snapshot, attachContext }: {
  snapshot: GraphSnapshot;
  attachContext: (context: SelectionContext) => void;
}) {
  const createRenderer = useMemo(() => createCytoscapeRenderer(cytoscape), []);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  return <GraphCanvas
    snapshot={snapshot}
    createRenderer={createRenderer}
    selectedIds={selectedIds}
    onSelectionChange={setSelectedIds}
    onDiscuss={attachContext}
  />;
}
```

The parent must give the canvas a bounded nonzero height. Initialize the shared
skin through the existing `initializeSkin` / `useSkin` lifecycle. Keep the factory
stable across renders. Replace a saved `initialCamera` deliberately, not on every
camera callback. Camera x/y denote the graph-space viewport centre.

The discussion callback creates an attachment, not an implicit model request.
The accessible resource list remains usable if graphical initialization fails.
The renderer's `capture()` returns pixels only; never expose it as an ungated
share action. Hiding titles does not anonymize a graph's topology.

## Verification ledger

Executed in the implementation environment:

- Strict TypeScript compilation of model and renderer contracts, including
  `noUncheckedIndexedAccess`, `isolatedModules` and `noImplicitOverride`.
- 17 data-model checks using Node's test runner on the compiled model: duplicate
  and dangling identifiers, invalid coordinates/states, immutable copies,
  proposal filtering, bounded traversal, Unicode search, isolated nodes,
  exact selection references, and a 10,000-node / 9,999-edge data projection.
- 14 real Chromium checks on the standalone interaction preview using this same
  adapter: 300 explicitly synthetic nodes, 409 default confirmed edges, theme
  switching without camera reset, labels, proposal/type filters, Chinese search,
  one-hop focus, additive selection, frozen context preview, confirmed PNG
  export, snapshot replacement, presentation mode, 390px layout and disposal.
  No browser exceptions or network requests were recorded in that test run.

Not executed / not established:

- The six React-wrapper Vitest tests are added but have not run in the complete
  workspace. Full pnpm install/build/typecheck/style policy and package release
  gates remain required. The implementation environment could not fetch the
  workspace dependencies.
- Standalone browser checks validate the engine adapter and HTML harness, not
  shared React chrome or the Research OS product shell.
- The 10k check is data-only: no 10k graphical benchmark, measured frame-rate
  claim, Obsidian comparison or WebGL performance claim.
- Saved-view reload persistence was not tested under a real browser origin.
- No package/policy release, Research OS wiring, real knowledge API, real main
  Chat request, graph database, history replay or worker layout is included.

Run the existing package and family gates before release. This change does not
relax them, publish a tag, mutate a default branch, or add an untracked runtime
installer. Keep the implementation PR in draft until full-workspace checks and
shared-chrome visual review have completed.
