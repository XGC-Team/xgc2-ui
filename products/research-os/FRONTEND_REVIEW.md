# Research workspace: project objects / F1 review

## Current delivery — 2026-09-16

This increment implements the **F1a audit and a bounded F1b navigation/persistence slice** on `XGC-Team/xgc2-ui`, under `products/research-os`, starting from freshly read `main@7d77ca8e2ac67b467277c3cdec4ab80fdbca8b64` (merged #16). It is not F1c authoring or the completed stage-one writing loop. Product/browser acceptance is pending; submit as a Draft PR rather than placing unverified UI directly on main.

Source-of-intent: [research-os-agent-native-vision](https://github.com/XGC-Team/xgc2-dev-memory/blob/master/now/research-os-agent-native-vision.md). The local knowledge-checkout prefix `memory/` is not part of that repository path. [Research #12](https://github.com/XGC-Team/xgc2-research-os/issues/12) remains the vision anchor; [UI #17](https://github.com/XGC-Team/xgc2-ui/issues/17) tracks frontend implementation. Do not copy a second vision into this document.

**Delivery override:** #17 records main-only delivery. The user's subsequent explicit instruction for this increment was “开始实现…实现完了以后，交 PR”. Accordingly, use a short-lived review branch targeting the current UI main, not a new repository, prototype or long-running fork. This exception does not rewrite the wider policy. No force-push, devops pin change, service restart, or claim that the user's running checkout has updated.

Visual contract remains `DESIGN_SYSTEM.md`: existing monochrome shell, rail, typography, content-instance tabs, shared controls, and retained Chat/canvas instances. No published package or dependency changes.

## F1a path × implementation × capability × remaining gap

| User path | Existing implementation / authority | This increment | Remaining boundary |
| --- | --- | --- | --- |
| Project → objects → return | `Sidebar`, `ResearchWorkspace`, `BrowserPanel` | Five project-scoped object actions; explicit return from files/builds to the owning project | Current `App` still maps `paper-*` workspace IDs to project records; no backend identity migration |
| Materials → source → quote | Workspace directory/file APIs; `FilesPage` | Frozen `{projectId, workspace, view, path}` target, file-instance deduplication, paginated directories, version/location display, quotation to the owning project | Read-only file viewer; unsupported attachments stay original files, not editable artifacts |
| Project notes → knowledge | Workspace Markdown and separate academic knowledge reader | Project-local Markdown filter with explicit scope wording | Not the typed-knowledge backlink list; no global promotion, project-memory merge or synthetic knowledge relationships |
| Canvas → source anchor | `thinking.canvas.json`; existing workspace file PUT with `expectedDigest` / `createOnly` | Anchor opens the exact file; serialized CAS saves, load/format/error/conflict distinctions, retry/export/discard recovery | Existing v1 structure and prompt export remain; no new semantic edges, same-object outline or Context Bundle |
| Project → workflow | Existing project `/plans` revisions, approvals and run receipts | Direct navigation to the existing project workflow surface | No invented node-level run status, new executor or workflow-library association model |
| Project → artifacts → source | Existing manuscript build records and PDF viewer | Successful-build list, exact build PDF opening, clearly labeled **current** source action | No PDF fabrication, editable external PDF assumption, PPT/video authoring or XGC2 execution |

## Persistence and safety contract

File/explorer tabs capture their scope once; changing the current project cannot reinterpret an open file. Identical filenames in different projects/workspaces remain distinct. Activating a tab does not implicitly change the current project; the explicit return/quote actions do. Concrete files deduplicate across Materials and Notes. Closing and reopening a file uses its saved workspace path; browser refresh does not restore the ephemeral tab layout.

Only a file-read 404 produces a **not-created** canvas. Network/auth/server failures and damaged/unsupported formats do not render an editable empty canvas. A valid v1 canvas retains unknown root/node/edge fields through parsing and editing. Unsupported versions are not migrated or silently overwritten. The older permissive parser is retained only for its existing non-editor consumers.

Autosave is single-flight and coalesces edits made during a write into the next save using the returned digest. Failure keeps the local edits and requires explicit retry. A 409/412 conflict blocks writes and offers a local export plus an explicitly confirmed discard-and-reload. Export alone does not unblock writes; there is no overwrite/force control. Late reads and disposed sessions cannot update another instance. Dirty canvases install an unload warning. This is not durable offline storage, guaranteed browser-close flushing, automatic Git commit creation, cross-file atomic edits, or proposal-based undo.

## Validation recorded for this increment

- Verified all eight modified source-file originals and this review document against Git blob SHAs at the starting main before patching.
- Node 22.16.0: `check-project-objects.mts` + `check-canvas-persistence.mts`: **57/57 passed**. Includes identity, pagination/API errors, strict editor parsing, debouncing, in-flight edits, CAS conflicts, retry, dispose and reopen. Explicitly labeled source guards are not DOM tests.
- Strict standalone TypeScript 5.8.3 checking passed for six dependency-free production modules: object model/copy, file session, canvas model, project file transport and API helper.
- TS/TSX syntax/transpilation checks passed for this source slice. This is not the locked TypeScript 5.6 product build.
- Added six actual Zustand/Vitest store cases in `tests/project-object-store.test.ts` and a read-only browser script against the real product. **These have not been run in the authoring container.**

**Blocked/not run here:** a complete checkout with locked/vendor dependencies, `npm run build`, full product typecheck, `npm test`, rendered React/Playwright checks and the user's loopback `3201` service. Direct GitHub clone failed with `Could not resolve host: github.com`; connector text reads/writes work, but the container cannot fetch the complete dependencies. No substitute React runtime, fabricated screenshot, mock PDF, or production-success claim is used.

## Required review before merge

Run from a full runtime-owned checkout with the PR changes, without competing for an occupied service port:

```sh
cd products/research-os
npm ci
npm run build
npm test
node --experimental-strip-types --test scripts/check-workspace-layout.mts scripts/check-project-objects.mts scripts/check-canvas-persistence.mts
```

The new browser check requires an **already running actual product**, two dedicated test repositories, and the same existing `.tex`, `.md`, or `.txt` relative path in both. Set `RESEARCH_UI_URL`, `RESEARCH_TEST_PROJECT_A`, `RESEARCH_TEST_PROJECT_B`, and `RESEARCH_TEST_FILE`, then run:

```sh
node scripts/check-project-objects-browser.mjs
```

It opens project entries, checks same-path file-tab isolation, return and close/reopen, then reloads the browser and reopens the saved file. It does not create repositories, send Chat, compile, or write files. Run it only against stable test data; it is not a full product or persistence test.

Manually check light/dark and zh/en at wide/narrow widths; retained unsent Chat/canvas/PDF states; keyboard-only entry/return; and quoting A's open file while project B is selected. With a dedicated canvas test file, exercise read 403/500, invalid JSON/version, slow successive saves, write failure/retry, and an external edit causing 409/412. Confirm export preserves the local content and discard requires confirmation. The final saved file must be reopened through the real backend, not only the in-memory test port.

Do not mark #17's whole F1b/F1 exit conditions or the stage-one writing loop complete from this slice. F1c, same-object outline, Context Bundle, semantic mapping, change proposals, cross-object rollback and knowledge promotion remain open. For rollback after merge, create a normal revert commit; do not reset published main or alter research data.

---

<details>
<summary>Historical PR #16 authoring evidence (pre-merge; not current delivery instructions)</summary>

# Research workspace: frontend shape review

Status: **Draft; browser/product acceptance is pending.** This is an incremental change to the current frontend, not a replacement app or a completed backend milestone.

## Source of truth

- Repository: `XGC-Team/xgc2-ui`
- Product: `products/research-os`
- Verified starting commit: `fd99f73481c6312d77a446ccd90e90affac10203` (`main`)
- Visual contract: this product's `DESIGN_SYSTEM.md` (refined monochrome/editorial), not the old graphite prototype.
- Existing runtime entry: `http://127.0.0.1:3201/`.
- Vision: https://github.com/XGC-Team/xgc2-research-os/issues/12 and https://github.com/XGC-Team/xgc2-research-os/pull/13.

Keep the agreed order: **record vision → refine the complete frontend shape and interaction → frontend PR and user review → decide the first backend loop**. The four subsequent backend/research phases remain directions, not prerequisites for this PR.

No development is based on `xgc2-research-os/web/`, its withdrawn PRs #8–#11, or `prototypes/research-space-v4/`. Do not recreate an isolated prototype to demonstrate this change.

## What this increment changes

The existing `ChatPage` returned early when a project whiteboard was open, replacing `NativeConversation`. It now composes both existing components through `ResearchWorkspace`; the existing content-instance `BrowserPanel` is still the PDF/materials surface.

- A selected project has a Research canvas action in the existing page-actions slot.
- Chat and canvas can be visible together; the existing right-panel PDF makes the three-work-surface layout. Chat-only and canvas-only focus modes remain available.
- The center area's measured width, not the whole window, determines whether split view fits. Narrow center areas offer focus switching instead of squeezing both panes below their minimum widths. A requested split is restored when room becomes available.
- Resizing uses the existing hairline divider, with arrow keys, Shift+arrow, Home/End and double-click reset. Pointer cancellation or divider unmount restores the previous body cursor/selection styles.
- Chat is not conditionally unmounted. Opened canvases keep stable project keys within the page session, including when hidden. A previous project's canvas is not paired with another project's conversation. This is not a new browser-storage or server-persistence guarantee.
- Canvas “Add to chat draft” explicitly targets its project, reveals the conversation and focuses the editor. It does not send the message or run a workflow.
- Canvas Delete/Backspace handling is local to its focused surface, not a global window listener. Hidden canvases must not delete selected nodes while another pane is in use.
- The canvas reuses the existing 36px tool-row components, adds a fit action, and reports copy success only after the clipboard promise resolves. Save-error text no longer claims that a retry is running when none is scheduled.

No fake messages, papers, PDFs, build success, workflow results or backend endpoints are introduced. Native Agent/session logic, PDF rendering/SyncTeX, workflow execution, the rail, global search, fonts, theme tokens, vendor archives and package locks are unchanged. Existing canvas loading/autosave behavior is not comprehensively redesigned by this layout PR; conflict recovery and refresh-time durability are not acceptance claims here.

This increment establishes concurrent work surfaces on the right codebase. It does **not** complete the entire vision: the same-object linear outline, semantic cross-artifact mapping, reviewed edit proposals, and additional artifact authoring remain subsequent frontend work to evaluate with the user, before declaring the product shape accepted.

## Actual checks in the authoring environment

- The fetched original `ChatPage.tsx`, `ThinkingCanvas.tsx` and `ResizeHandle.tsx` were reproduced byte-for-byte and checked against their Git blob SHAs at the starting commit before patching.
- `node --experimental-strip-types --test scripts/check-workspace-layout.mts`: **27/27 passed** on Node 22.16.0. These exercise layout math, compact/focus policy, project identity and retained keys, plus label parity; they are not rendered React tests.
- Strict standalone TypeScript checking passed for `workspace-layout.ts` and `workspace-copy.ts`.
- Six changed/new TS/TSX modules passed TypeScript syntax/transpilation diagnostics using the environment's TypeScript 5.8.3. This is not the product's full typecheck, and is not its locked TypeScript 5.6 build.

**Not run:** installation of the product's locked/vendor dependencies, full product build/typecheck, Vitest suite, or the actual browser at the user's `3201` runtime. The authoring container cannot reach the user's loopback service and cannot retrieve the complete runtime dependencies. No screenshot or visual-equivalence claim is made. Keep this PR Draft until those checks and user review are complete.

## Validation in the existing runtime checkout

Use the runtime owner's process to switch/check out the PR. Do not start a second Vite process on the occupied port or replace the runtime with a standalone HTML app.

```sh
cd products/research-os
npm ci
npm run build
npm test
node --experimental-strip-types --test scripts/check-workspace-layout.mts
```

For an isolated session only, after the runtime-owned frontend has been stopped, the existing README documents:

```sh
npm run dev -- --host 127.0.0.1 --port 3201 --strictPort
```

Review using a dedicated research test project and its existing real files, not daily research drafts:

1. Confirm the accepted monochrome shell, typefaces, rail, search, theme and right content tabs are unchanged. Open a project canvas and a real manuscript PDF: use Chat/canvas/PDF concurrently when the measured center width permits it.
2. Type an unsent chat draft; switch focus, hide/reopen the canvas and resize. Verify that the draft, canvas state, camera and PDF tab remain. Add the canvas to the draft; verify it is visible, project-scoped and **not sent**.
3. Open another project. Verify its conversation never shows the previous project's canvas. Return and reopen the original canvas. With a node selected there, use Delete outside that canvas and check that nothing is removed from the hidden surface.
4. Narrow the center area below 681px by resizing the window or expanding side panels. Check chat/canvas focus switching, keyboard access and overflow. Restore width; check requested split mode and bounded divider resizing. Test pointer cancellation, including hiding a panel during drag.
5. Check light/dark themes and both locales, then regression-test real Chat, workflow, materials/PDF and source navigation. Record actual results; do not treat the standalone model checks above as this browser gate.

User acceptance and backend-phase scope are recorded separately in the long-running vision issue. This PR does not close that issue or initiate the backend milestones.

</details>
