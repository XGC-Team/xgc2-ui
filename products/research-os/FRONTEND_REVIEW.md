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
