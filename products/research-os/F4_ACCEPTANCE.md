# F4: full-path acceptance and backend integration contract

## Delivery / 2026-09-17

Implementation base: `d3c51a2` (F1–F3 merged on `main`). Acceptance was executed in a detached worktree at code SHA `85dea77`; the only product-code change on top of the base is the localStorage-resilience fix `8da5958`, the rest is test scripts and these documents. F4 adds no new feature surface: it verifies the F1–F3 product as one continuous research tool and records what the backend must honor. The backend contract itself lives in `BACKEND_CONTRACT.md`.

Source of intent remains the knowledge repository's `now/research-os-f1-f4-plan.md` §五; harness Issue #109 tracks the same scope.

## 1. Accepted interaction contract

This is how objects actually behave in the shipped F1–F3 implementation, verified by the F4 path checks.

| Object | Identity and storage | Create | Reference | Modify | Review | Recover |
| --- | --- | --- | --- | --- | --- | --- |
| Source note / material | `research-drafts.json#<id>` per project workspace | Reading selection with pinned digest+excerpt; intake upload receipt, then explicit registration | Canvas anchor node, Chat context item, artifact sources | Autosaved serialized CAS writes; archive/restore | Feedback from any saved field into a versioned proposal | Conflict keeps both sides; export local copy; discard-and-reload is explicit |
| Canvas card / outline | `thinking.canvas.json` v2: nodes, edges, per-artifact `outlines` | Chapter/idea cards; v1 files migrate with a createOnly backup | Semantic edge relations; evidence with pinned or explicitly unverifiable revision | x/y is layout only; hierarchy and writing order live in arrangements; local undo/redo | Card fields are review targets; layout-only edits raise no semantic impact | CAS conflict, corrupt/version-unknown files are refused without touching the original |
| Paper / slides / storyboard | Draft kinds in the same book; independent blocks and per-artifact canvas arrangements | From the draft list; never marked executed | Share one pinned source without sharing body or order | Each artifact edits and reorders its own blocks | Shared review identity for native block fields | A changed shared source never rewrites or repins artifacts silently |
| Chat context item | In-memory visible set, project-scoped | Added from canvas, drafts, sources — adding is not sending | Pre-send scope/validity check; manifest inserted into the draft only | Refresh compares against the observed revision | Foreign/missing items are excluded; stale or unverifiable ones are shown as warnings | Update available → adopt or keep an explicitly labeled old snapshot |
| Review proposal | `research-reviews.json`: proposals, decisions, attempts, notDispatched | From PDF/text/canvas/block feedback with the observed version | Operations bind target + base digest + before/after + reason + evidence | Preview writes nothing; apply is per-file CAS, sequential, not atomic | Operation selection respects dependency groups; cross-file groups stay preview-only | Baseline conflict blocks; lost journal acknowledgement → pending → inspect → human confirmation; guarded recovery only on the exact post-write version |
| Build / PDF preview | Manuscript build records; PDF artifacts by digest | Only real build receipts create previews | PDF feedback anchors to buildId + output digest + page/rects | A later failed build never replaces the last successful preview | Provenance compares current source digest against build inputs | Stale source/preview is shown as changed or needs-confirmation, never silently remapped |
| Workflow plan | Research project plan revisions with runs and receipts | Draft plan; approval requires explicit consent and the revision digest | Linked from the project; separate from any local workflow-definition draft | New revision via baseVersion | Approval, execute with Idempotency-Key, stage receipts, awaiting-input | Cancel endpoint; cancelled receipts stay visible |
| Intake receipt | Page-session queue | Text → workspace file (createOnly); PDF → existing global archive | Registered as project material after an accepted receipt | Unsupported formats are refused before upload | A failed upload says "failed, not confirmed" and retries | Receipts are session-scoped; nothing claims server-side tracking |
| Knowledge promotion | Draft `knowledgeSuggestion` + review `promotion` scope decision | Note-level suggestion with rationale | Review proposal with destination, conditions, verification | Suggestion can be withdrawn; scope decision is pending → approved-scope / rejected | Approving a scope records a review decision only | No global knowledge write exists; nothing is marked verified |

## 2. Capability gap table

**Really connected (exercised in checks):** Chat/native session draft insertion and connection states; workspace file API with digest CAS; reading with version-pinned selection capture; manuscript build records, PDF artifacts and source↔preview provenance; intake text/PDF endpoints with idempotency keys; workflow plan revisions, consent-gated approval, idempotent execute, cancel, exports; academic knowledge graph and reader.

**Local drafts that save and reopen honestly (no execution claimed):** paper/slides/storyboard structures, workflow definitions, RSS rules, experiment requirements, knowledge-promotion suggestions. Every one of them displays its draft boundary ("Draft · not executed", no generation/subscription/scheduling/simulation) and triggers no backend call beyond its own file.

**Executors not connected (nothing fakes them):** video/slides rendering, RSS fetching or tracking, experiment runners and result records, global knowledge promotion, agent structured write-back into canvas/outline (the only path today is an explicit suggestion in the Chat draft), cross-file transactions.

## 3. Reproducible acceptance record

Environment: Node v22.17.1; product dev server via `vite.config.f2check.mts` on `127.0.0.1:3205` proxying the real researchd on `3200` (changeOrigin required by its Host allowlist); Chromium headless shell 1228. Registered dedicated test projects: `paper-e2e-f1`, `paper-e2e-f2`, `paper-e2e-f3`. Browser checks use isolated file/build/plan fixtures on the real rendered frontend; they are not real-backend persistence evidence.

Gates at code SHA `85dea77`:

| Gate | Result |
| --- | --- |
| `npm run build` (tsc + vite) | OK |
| Vitest | 38/38 |
| `node --experimental-strip-types --test scripts/check-*.mts` | 281/281 (272 F1–F3 + 9 new F4 logic checks) |
| eslint browser scripts + `lint:review` | both OK |
| Browser checks | 10/10: F1, F2, F3, draft-authoring, project-objects, F4 paths 1–3, F4 paths 4–6, F4 resilience (14 scenarios), locale, project-navigation |

F4 path coverage: intake with accepted/unsupported/failed+retry receipts; sourced note, source locate, canvas reference; hypothesis structure with layout/order separation, supports/contradicts relations, pinned and unverifiable evidence, visible context with insert-not-send; the continuous paper journey canvas→outline→draft→PDF→annotation→proposal→preview→apply→version feedback→guarded recovery→reload; multi-artifact shared pinned source with independent blocks, order and per-artifact arrangements; workflow/rule drafts staying drafts while the real plan API runs consent approval → idempotent execute → cancel; experiment draft with empty results, knowledge suggestion and scope approval without any global write.

Resilience matrix: offline load (load-error, never an empty document), 403 on save (edits retained, retry), corrupt JSON / unsupported canvas version / foreign project book (invalid, never overwritten), CAS 409 conflict (both sides kept), localStorage write failure (app fully usable), rapid project switching with a dirty editor (hidden editors stay mounted and save to the right project), deleted/changed context sources (missing excluded, adoption explicit), interrupted apply (no blind retry; inspect + human confirmation), partial apply (per-file written vs NOT DISPATCHED receipts), dark/light themes, zh/en locales, narrow viewport (split disabled with reason), keyboard focus order and form autofocus, prefers-reduced-motion. Unsaved editors are never unloaded for memory reasons.

Capacity baseline (numbers, not assertions; fixture responses are local): 3 projects × 40-card canvas + 30-draft book, 16 open tabs, one 12-page PDF. Open canvas ≈ 0.93–1.01 s per project; outline render 0.49 s; card drag → autosaved 1.34 s; draft field type → saved 0.89 s; tab opens 0.46–2.53 s (PDF tab 2.53 s); canvas switch after all mounted ≈ 1.2–1.35 s; full reload → canvas recovered 4.44 s; DOM ≈ 2 780 nodes; JS heap flat at 43 MB across tab opening, switching and reload.

Bugs found and fixed during F4: localStorage write failure blanked the entire workbench (preference writes crashed React at mount) — fixed by a safe preference helper (`8da5958`), now covered by resilience scenario R5 and logic checks.

Script fixes (selectors only, product behavior unchanged): legacy locale/navigation checks referenced renamed chrome (`Main navigation`→`Primary`/`顶层菜单`, `浏览器右栏`→`右侧面板`) and a data-specific directory assertion; the native-agent composer is a vendor component whose label is intentionally not localized — the check now asserts that contract.

**Not covered by F4 automation:** `check-research.mjs` is a pre-F1 integration test against the old five-item information architecture and is superseded; its unique path — a real native-agent workflow run with live LLM profiles — has no F4 automation (requires live agents) and is marked unverified here. `check-pdf-inline`, `check-right-panel` and `check-workbench-layout` are bound to the 3201 runtime's `paper-temp` fixtures and were not run in this environment; PDF/source positioning is covered by the F3 check and path 3. The terminal surface and Chinese IME composition have no automated coverage. Real-backend persistence acceptance remains a separate step by design.
