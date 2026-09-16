# Research OS — F2 implementation and review

F1 contracts and acceptance authority: [FRONTEND_REVIEW.md](./FRONTEND_REVIEW.md). This document records the F2 increment (harness #103): same-source canvas/outline, semantic evidence, versioned context and safe saving. It is written in the present tense and states what is not connected.

## Canvas format v2: four relations kept apart

`thinking.canvas.json` now has a versioned v2 schema in `src/features/projects/canvas-model.ts`:

- **Visual position** stays `x`/`y` on each node. Nothing else reads it for meaning.
- **Outline hierarchy and writing order** live in `outlines`: per-artifact arrangements (`artifact: 'canvas'` is the canvas's own outline; other artifacts are F1 draft IDs). Each arrangement orders shared node IDs independently — two artifacts can share a card and keep separate order. Arrangements store order only; the artifact body stays in `research-drafts.json` (no content is copied).
- **Semantic relations** are an optional `relation` on an edge (`supports` / `contradicts` / `depends` / `exemplifies` / `continues` / `cites`). An edge without `relation` is a plain association and is never read as causality, hierarchy or execution order — the v2 prompt lists only labeled edges under `## 语义关系`.
- **Evidence and writing constraints** live on the node: `evidence[]` (path or URL, observed `digest`, `excerpt`, source `note`) and `writing` (`purpose` / `conditions` / `template`). An evidence item without a digest is shown and exported as *version cannot be auto-verified*; no version is ever invented.

`semanticFingerprint()` covers content, hierarchy, order, relations, evidence and constraints, and excludes `x`/`y` and collapse state: moving a card changes neither the outline order nor the fingerprint.

## Loading, migration and version policy

- v1 files load and are migrated in memory: node IDs, refs, anchors, bodies and unknown extension fields are preserved; chapter→idea edges and y/x order seed the outline **once** as an initialization suggestion; all v1 edges remain unlabeled plain associations.
- The first v2 write after a v1 load first PUTs the original v1 bytes createOnly to `thinking.canvas.v1.backup.json` (`canvas-migration.ts`). Backup failure blocks the v2 write; an existing backup (409) counts as the safety copy. New canvases and already-v2 files never trigger a backup.
- Unknown versions (e.g. 3) fail closed with the existing `invalid` load state — never an empty canvas, never a silent rewrite. Malformed JSON, dangling outline/edge references, duplicate outline nodes and unknown relations are rejected the same way.
- The mounted canvas session remains the **only** writer: one live session per project (`sessionOwners` disposes a stale session on remount), the F1 `canvasReferences` → `attachDraftReference` queue still flows through it, there is no second background PUT, and the reference node keeps the `research-drafts.json#<id>` anchor contract.

## Same-source canvas and outline

`ThinkingCanvas.tsx` + `OutlinePanel.tsx` are two views of one document in one save session: reorder (up/down), hierarchy (indent/outdent), collapse, an unarranged-ideas bucket, per-artifact arrangement creation from canvas reference nodes, and two-way locating (outline row → centered/selected card; card → outline). Moving a card on the canvas changes only `x`/`y`. Local undo/redo snapshots (per-field coalescing for typing) revert edits inside the session. A click selects on release; a drag only moves layout and does not open the inspector mid-gesture.

The node inspector edits evidence (multi-reference, with locate-source navigation through the F1 source path) and writing constraints. The edge inspector sets or clears the explicit relation; unlabeled links render dashed with the plain-association hint.

## Visible, versioned Chat context

`context-model.ts` + `ContextPanel.tsx` (mounted incrementally in `ChatPage`; F1 intake/quote paths untouched):

- Items record object, kind, owning project, reference, source, observed digest and excerpt. Adding to the set is not sending; the only way content reaches the composer is the explicit *insert manifest* action, which appends text to the draft and says so.
- View, remove, locate original (canvas/draft/source navigation), and refresh. Refresh re-reads the file digest and compares: same → current; different → `update-available`, and the user chooses *adopt new revision* or *keep old snapshot (labeled)*; missing file → `missing`; no digest on either side → *version cannot be auto-verified*.
- Pre-send check excludes foreign-project and missing items and flags stale/unverifiable ones. The panel displays the UI project and the native session scope side by side: switching the UI project does not switch the native session, and items keep their recorded project.
- The agent-organizing entry only places a suggestion request in the draft. No canvas/outline write-back exists in F2; that is F3 review territory. Nothing is displayed as executed.

## Saving, conflicts and recovery

The F1 serialized conditional-write session is unchanged in shape (`createFileSession`: port/decode/encode, expectedDigest CAS, createOnly first write, conflict/save-error/load-error/invalid states), so F3's write-coordinator (`registerReviewEditor`/`acquireReviewWrite` shape) can hook editors without a session redesign. Verified by test: serialized saves with edits in flight, an older save resolving late never marks newer edits saved, conflicts keep both sides with export/manual retry/discard-reload, and refresh/project-switch/unload do not silently drop dirty state (sessions stay mounted per project; beforeunload guards remain).

## Validation actually executed here (Node 22.17.1, product TS ~5.6.3)

- `npm run build` (tsc -b + vite build): pass.
- `npm test` (vitest): **33 passed** (28 F1 regressions + 5 new context-store tests).
- `npx eslint src tests` and `npm run lint:review`: clean.
- Node checks (`node --experimental-strip-types --test`): **212 passed, 0 failed** — the six F1 scripts (167) plus `check-f2-canvas-model.mts` (26), `check-f2-save-migration.mts` (10), `check-f2-context.mts` (9).
- Rendered browser checks against a local dev server with simulated workspace file APIs (`RESEARCH_UI_URL=http://127.0.0.1:5199`, `RESEARCH_TEST_PROJECT=paper-e2e-f1`):
  - `scripts/check-f2-browser.mjs`: **PASS** — v1 load without write, first-save v1 backup, outline reorder, card move leaving outline order intact, semantic edge labeling, pinned + unverifiable evidence, undo/redo, context add/check/insert (draft only), refresh → keep-labeled-old-snapshot, conflict keep-both + discard reload. No unexpected writes.
  - `scripts/check-f1-browser.mjs` and `scripts/check-draft-authoring-browser.mjs`: **PASS** (F1 regression).

Not executed here: `check-project-objects-browser.mjs` (needs two distinct registered test workspaces and a shared real file), the older `check-research.mjs`/navigation scripts with known-stale selectors, and any real-backend persistence acceptance. Browser checks simulate the workspace file API; they are rendered-frontend evidence, not real-backend proof.

## Honest boundaries

- Context items live in the page session (like the F1 intake queue); they are not server-persisted.
- Refresh compares file digests only; it does not diff content, and historical chat messages keep whatever content they used at the time.
- Per-artifact arrangements order canvas cards only; artifact bodies remain edited in `research-drafts.json`.
- The agent-organizing entry produces a draft request, not a canvas change; there is no proposal/apply pipeline in F2.
- Undo/redo is in-memory for the mounted session and resets on reload.
