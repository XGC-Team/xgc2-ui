# Research OS — F1 implementation and review

## Authority, baseline and delivery

Source-of-intent: [research-os-agent-native-vision](https://github.com/XGC-Team/xgc2-dev-memory/blob/master/now/research-os-agent-native-vision.md). [Research #12](https://github.com/XGC-Team/xgc2-research-os/issues/12) remains the vision anchor; [UI #17](https://github.com/XGC-Team/xgc2-ui/issues/17) tracks implementation. This document records implementation and evidence, not a second product vision.

This F1.1–F1.5 increment builds on **PR #18 head `b5d74daeb510a5562368d796260eceeaf50ff533`**, itself based on the merged UI `main@7d77ca8e2ac67b467277c3cdec4ab80fdbca8b64`. Main and the PR head must be read again before publishing. All changes stay under `products/research-os`.

The user explicitly requested PR delivery after the earlier main-only policy. Continue the existing #18 review branch and target UI main; do not create another product, rewrite main, touch devops pins, or restart 3201. PR publication, merge, runtime rollout and user acceptance are separate events.

**Status: F1 implementation submitted for review; full product/browser/runtime acceptance is still pending.** A passing model test does not close F1 acceptance.

Visual baseline remains this product's `DESIGN_SYSTEM.md`: monochrome shell, full-width topbar, existing rail/sidebar, shared controls and content-instance tabs. The retained Chat/canvas/PDF workspace is reused, not replaced.

## User action → component → authority/storage → working path → boundary

| Package / user action | Components and existing authority | This increment | Remaining boundary |
| --- | --- | --- | --- |
| F1.1: load, edit, save and recover | Existing workspace file GET/PUT; `file-session`, `useCanvasDocument`, `useDraftBook` | Missing vs invalid/unsupported vs load failure; serialized conditional writes; dirty-close warning, retry, export and explicit discard; disposed saves guarded | Not offline storage, automatic Git commit, guaranteed close-time flush or a multi-file transaction |
| F1.2: find and return to project objects | `ProjectObjects`, `Sidebar`, `BrowserPanel`, Zustand; native thread archive remains existing API behavior | Material directories, source notes, workspace Markdown, canvas, workflow, research objects and real built-PDF entry points; immutable file scope; deduplication; archive/restore for drafts and project references | Archiving a reference does not delete its original file or stop a workflow. Legacy App still maps paper workspace IDs to projects |
| F1.3: input → read → note → research structure | `intake-queue`, `IntakePanel`, `FilesPage`, `Reader`, `DocumentPanel`, PDF reader wrapper | Shared intake receipts; text imports use create-only workspace PUT; existing PDF intake retained; URL references; bounded selection captures rendered revision/excerpt; common source picker; canvas reference and return to original object; knowledge-promotion suggestion/withdrawal | Intake queue is page-session state. Project files and the object book are server-stored. Global knowledge promotion is a reviewable suggestion, not an automatic write |
| F1.4: prepare multiple artifacts | `DraftsPage`, `draft-model`; `research-drafts.json` | Paper goals/templates/citation requirements, section/paragraph intent, ordered slides and speaker notes, shots/narration/duration, per-block evidence/media references; list/cards use the exact same blocks and IDs; create/edit/archive/restore/reopen | No PPT export, video renderer or automatic paper generation. Card view is not the later semantic/free-form graph |
| F1.5: methods and experiments | Existing project plans UI and real run receipts, plus draft definitions | Existing-workflow association/navigation, editable workflow definitions, RSS source/filter/action drafts, experiment questions/parameters/inputs/expected outputs/measurement/acceptance | Draft saving does not approve, schedule, subscribe or execute. No fake simulator results or node-level executor |

## Object and source contracts

`research-drafts.json` is one versioned project/workspace book. Exactly one deduplicated book tab owns its file session. Material references, source notes, papers, slides, storyboards, workflow definitions, rules and experiment requirements have stable object and block IDs. Unknown extension fields are retained. Unsupported versions or malformed data block editing rather than being rewritten as empty state. Optional experimental input/output fields from the earlier unpublished v1 draft remain readable.

The linear and card views both use `draft.blocks`; F2 must extend these objects, not copy their content into a second outline. A canvas association is an explicit, reversible **reference node**, with an anchor `research-drafts.json#<draft-id>`. Clicking it resolves the original book/object. The node's editable label is navigation metadata, not the object's title/body. A saved object is required before association. Only the existing mounted canvas session writes the canvas; there is no competing background file writer. Removing the reference leaves the original object intact.

F2 is delivered on top of this contract: see [F2_REVIEW.md](./F2_REVIEW.md) for the canvas v2 schema (layout/outline/semantics/evidence separated), the v1 backup migration, the same-source outline view, and the versioned Chat context set. The reference-node anchor contract above is preserved by the v2 serializer.

Source notes preserve the source workspace, path, observed digest and bounded selection text. PDF captures also retain build/page when available. Common-source selection references the same source identity from multiple artifacts; per-page/shot/block associations use source IDs. A reference without a pinned digest is explicitly labeled as opening the current original.

Returning to a changed source never silently repins the old quote: the reader shows a revision warning. Exact-text positioning occurs only for a unique match in the recorded revision. Hidden readers cannot steal selection/focus. Missing or ambiguous wiki links produce an error; unavailable historical PDF versions do not silently fall back to the newest PDF.

A note's knowledge-promotion suggestion records rationale and `suggested`/`dismissed`. It is not a verified fact, global knowledge item or successful backend promotion. Existing typed knowledge and PDF annotation APIs remain available; this project-note path does not impersonate them.

## Real intake versus draft state

Text imports are actual create-only workspace writes with a generated filename and an observed response digest. Inputs are never written over an existing daily research file. An accepted text receipt can be registered into the project book; book save state remains independently visible. HTTP errors, unsupported types and excessive sizes do not become accepted receipts. PDF retries reuse the same idempotency key.

PDF uses the existing `/api/v1/intakes/pdf` archive path, including global Chat without a selected project. This frontend interface currently does not expose an actionable reader target from that intake response. The queue therefore states only API acceptance and does not fabricate a source file, PDF preview or version. Existing manuscript build/PDF navigation is unchanged. URL intake records a link; it does not claim that the page was fetched.

Browser refresh does not restore the intake receipt queue or ephemeral tab layout. It does allow reopening saved text files and the project book through their real workspace paths. Unregistered successful-upload receipts expose the original source for recovery during the session. This is not an offline application or a replacement backend.

## Validation actually executed in this authoring environment

- Node **22.16.0**: `check-draft-authoring.mts`, `check-file-session-lifecycle.mts` and `check-f1-loop.mts`: **83 tests passed**, none failed or skipped. The full F1 model path serializes through a test file port, disposes and reopens. HTTP transport tests replace fetch; explicitly named source guards inspect wiring and are not rendered tests.
- Strict standalone TypeScript **5.8.3** checks for the dependency-free production modules. This is not the product's locked TypeScript build.
- TS/TSX syntax/transpilation diagnostics and JavaScript browser-script syntax checks are recorded with this delivery. These do not prove React integration correctness.
- Real Zustand/Vitest tests and actual-product Playwright scripts are included, **not executed here**.

Not executed: complete locked/vendor installation, full `npm run build`/typecheck, full `npm test`, rendered React/Playwright checks, or the user's 3201 service. Direct GitHub/npm access is unavailable in this authoring container; connector repository reads/writes are separate. No full-build success, screenshot equivalence, deployment or user acceptance is asserted.

## Required F1 acceptance on a dedicated runtime

Use a full, clean checkout and the existing runtime owner's process. Do not compete for occupied ports or use daily research drafts.

```sh
cd products/research-os
npm ci
npm run build
npm test
node --experimental-strip-types --test scripts/check-workspace-layout.mts scripts/check-project-objects.mts scripts/check-canvas-persistence.mts scripts/check-file-session-lifecycle.mts scripts/check-draft-authoring.mts scripts/check-f1-loop.mts
```

For the actual frontend against isolated file fixtures, set `RESEARCH_UI_URL`, `RESEARCH_TEST_PROJECT` to an existing registered `paper-e2e-*` project, and optionally `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, then run:

```sh
node scripts/check-draft-authoring-browser.mjs
node scripts/check-f1-browser.mjs
```

These scripts block all non-fixture writes. They are **rendered frontend tests with simulated file APIs**, not real backend persistence evidence. The older `check-research.mjs`/navigation scripts contain stale selectors and must not be cited as passing migration gates.

The separate real-service acceptance must cover:

1. Import a dedicated Markdown/text material. Confirm actual source location and digest. Open it, select text, create a source note, edit its interpretation, save and reopen. Open the original source and return without losing reading position or an unsent Chat draft.
2. Add the saved note/object reference to the project canvas. Open its anchor back to the same object. Remove the reference to undo the association; confirm the note is not deleted. Exercise an externally changed canvas and verify no forced overwrite occurs.
3. Create paper, slides and storyboard objects with a shared source and block-level references. Edit the same paper block through list/cards, archive/restore, close and reopen, then refresh and reopen. IDs, order and content must persist.
4. Navigate to the existing project workflow without execution. Edit rule and experiment drafts, including inputs and expected results. Save/reopen; confirm no scheduler, subscription or simulator was started. Submit and withdraw a knowledge-promotion suggestion without writing global knowledge.
5. Repeat with two projects sharing filenames; verify scope and Chat quotation routing. Exercise file errors, unsupported versions, save 503, 409/412 conflict, retry/export/discard, close-during-save, and pending-capture close warnings. Test light/dark, zh/en, keyboard-only, wide/narrow, Chat/canvas/PDF retention and hidden-surface shortcuts.

Only actual logs, observed results and user review can close the F1 acceptance checklist. F2/F3 semantic relations, context bundles, reviewed multi-object changes and transactional rollback remain outside this increment.

## Historical evidence and rollback

The complete pre-increment F1a/F1b and historical #16 evidence is preserved at [the immutable b5d74da review document](https://github.com/XGC-Team/xgc2-ui/blob/b5d74daeb510a5562368d796260eceeaf50ff533/products/research-os/FRONTEND_REVIEW.md). Its 57 model checks and the subsequent 8 lifecycle checks retain their original scope; they are neither erased nor relabeled as full product/browser checks.

After merge, roll back code with a new revert commit, never a force-push/reset of main. Archive restoration is an object-level operation, not a code rollback. Do not delete project research data as part of a code rollback. Export new-format project books before running older UI versions that do not understand them.
