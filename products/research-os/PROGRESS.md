# Research OS: agent-native workbench progress (2026-09-24)

Branch: `feat/research-os-agent-native-workbench` · Draft PR XGC-Team/xgc2-ui#34 · Refs XGC-Team/xgc2-research-os#12

## Round 8: Design Argument Canvas (live T-RO 26-0979 demand)

**What.** A new resource tab **「论证画布」 / Design canvas**. It draws the paper's own argument graph from the writing side's `writing-map/index.json` + `units.jsonl` (schema-semantic v0.2). Nodes are **semantic argument units**: problem, challenge, method, assumption, lemma, guarantee, evidence, revision, roadblock. Sentences are not nodes. Edges are the five typed relations. The inspector shows each unit's flesh: why, adversarial notes, writing norms, formal checks, blocked-by, links.

**Why this, not Atom Trail.** The owner cancelled the ledger/Atom Trail plan as over-design. The paper workers (TRO-写作 / Terminal 12) already maintain the writing map and need to *see and think with* the argument, not a new ledger ceremony. So this slice only reads their files, where they already are.

**How it works:**
- **Loader** (`useWritingMap`):
  - It reads `<project>/<dir>/index.json`, then `units_path` (default `units.jsonl`), through the existing workspace file API. No backend change.
  - `dir` defaults to `review/tro-26-0979-v1/cleaned/reply-kb/writing-map` and can be changed per project from the canvas's "…" menu.
  - A clearly labelled 5-unit sample ships in `public/fixtures/argument-canvas-sample/` for offline UI work. It is labelled as not paper content everywhere it shows.
  - If the map is missing, the canvas shows a one-sentence state with the expected path.
- **Importer** (`writing-map.ts`, pure):
  - Tolerant, and never invents anything. Bad JSON lines, missing ids, duplicates, `id`≠`unit_id`, unknown roles/statuses (kept verbatim), unknown edge types, dangling or self edges, `units_path` escaping the folder, schema-version drift, and `index.json` count/id mismatches all become **line-numbered import notes**.
  - `mapping-seed.jsonl` is never read as nodes; the inspector only counts a unit's sentence locators.
- **Canvas:**
  - Deterministic layered layout, top to bottom (problem → challenges → methods/assumptions → lemmas/guarantees → evidence/revision/roadblocks). Within a row, units are ordered by their neighbours to reduce crossings.
  - Same interaction grammar as the knowledge graph: drag to pan, wheel to zoom about the pointer, click to select, double-click empty space to fit (eased flight), Esc to deselect.
  - Hover lights a unit's neighbourhood. A quiet status highlight offers All / Needs rewrite / Blocked & open.
  - Roles by glyph and border, statuses by badge, edges by stroke grammar (solid / dashed / dotted / heavy + × / dash-dot + R).
- **Inspector links, honestly:**
  - `D-*` opens reply-kb `decisions-log.md` (a hint says to find the id there).
  - `reply_kb_links` open the file in the side pane, and `vault_links` open in the reader.
  - Theory, figure, claim and scheme ids are shown as handles only.
  - `latex_anchors` are read-only `file:start–end` locators with copy. **There is no write-back to `.tex`.**
  - "加入对话" attaches the unit to Chat as a versioned reference (units.jsonl digest + id).
- **Entry points:** the project "…" menu, ⌘K "打开论证画布", and the resource "…" menu.

**Verified live** against a local `researchd` serving a shallow clone of `paper-dmpc@docs/writing-map-pilot-20260925`. The owner's repository was not modified.
- All **19 units / 74 typed edges** import with **zero** import notes.
- U-G-RF's inspector shows its real why, adversarial notes and norms, D-102/D-105/D-106/D-02/D-03, and its reply-kb modules. Those open the actual `theory-kernel-K5-theorem-outline.md` and `decisions-log.md`, and the vault link opens `paper-dmpc.md` in the reader.
- Hover highlights, the status filter, attach-to-chat, the missing-path state and the labelled sample all work, with no page errors.

**How to try:** open the paper project → "…" → 论证画布 (or ⌘K "打开论证画布"). Click a unit; double-click empty space to see everything.

**Tests:** `tests/writing-map.test.ts` covers:
- the importer (flesh, links, anchors);
- strict edge typing (unknown, dangling, self, duplicate);
- the no-invention diagnostics;
- empty and broken inputs, and a guarded `units_path`;
- the layered layout;
- the labelled fixture;
- a live-file check that runs only when this machine has the paper map.

`npm test` passes 294 tests, and `npm run build` and `npm run lint:review` pass.

**Layout optimisation (follow-up, `RESEARCH_OS_LAYOUT_OPTIMIZE.md`).** `layoutUnits` is now a deterministic, pure-TS, Sugiyama-style layered layout:
- **Assumption sub-band.** Role bands have explicit pitches. Assumptions get their own half-pitch band between methods and lemmas/guarantees, and the band vanishes when there are none.
- **Weighted sweeps.** Up to 8 alternating down/up sweeps, keyed by the **weighted median** of neighbour x (weighted mean for 1–2 neighbours). Weights come from the relation (supports/depends_on 1, answers_reviewer 0.8, refines 0.6, conflicts_with 0.35) and 1/band-span. The ordering with the fewest measured crossings is kept.
- **Transpose pass** for maps with ≤ 300 edges.
- **Determinism.** Edges are normalised and sorted first, so the result is independent of edge order.
- **Spacing.** Slightly calmer: gapX 24, gapY 96.

On the live T-RO map (19 units / 74 edges), straight-line crossings between card centres dropped from **85 to 42 (−51%)** in about 28 ms. The assumption no longer shares the method row.

`tests/writing-map.test.ts` gains 8 cases (15 in the file): determinism; all ids placed; edge-order independence (shuffled); a crafted case untangled from > 0 to 0 crossings; the assumption sub-band never stacking on a method, with the band collapsing when absent; in-band card separation and band spacing; weighted median/mean keys and weights; the fixture; a live-map reduction check.

**Not built (by instruction):** Atom Trail / ledger parsers / append-only journal; the Reviews ceremony; mirroring units into `research-content.json`; Issue sync; PDF/SyncTeX; PPT/Remotion; sentence-level nodes; backend routes. There is also no editing of units from the canvas yet: the writing side owns `units.jsonl`.

---

## Round 7: knowledge base + academic graph to production grade (`RESEARCH_OS_KB_PRODUCTION.md`)

**How I chose.** Before changing anything I profiled a realistic synthetic vault: 3,092 linked notes in 30 topic folders, then 10,092 notes and 33k links in 80 folders, served by the local `researchd`. The baseline at 3k was not daily-use grade:
- about 15 fps with 5.1 s of main-thread long tasks while the layout settled;
- 30 fps while panning;
- off-centre, with no convergence after 6 s;
- a hairball in which arrowheads piled into black discs on hubs and bold labels collided.

On top of that, the whole graph was rebuilt and re-bloomed **on every window focus**: the snapshot was refetched and replaced even when unchanged. So the work went where the profile pointed: data lifecycle, layout, renderer and legibility, then motion and interlock.

**Data lifecycle**
- **Same snapshot, same page object.** Nothing rebuilds on focus. Focus-triggered re-checks are throttled to once a minute; parsing a multi-megabyte snapshot to learn nothing cost about 365 ms. In-app writes still refresh at once through `research:knowledge-changed`.
- **Pages at the service maximum.** The loader requests 5,000 nodes per page (the service's `MaxPageLimit`). At 10k notes, loading dropped from 3.5 s to 1.9 s.
- **Layout memory by resource id** (`graph-layout-seed.ts`). Search, filters, local graph, reading a note and coming back, or switching pages all re-use positions ("warm": low alpha, no re-bloom). New nodes appear beside a remembered neighbour.

**Layout**
- **d3-force in a Web Worker** (`graph-layout.worker.ts` / `graph-sim.ts`). It ticks in about 10 ms batches and sends positions back as transferable arrays. The main thread only paints. The same simulation runs as a main-thread fallback (tests, no Worker).
- **Cluster-aware seeding.** Each folder starts as a compact disc, hubs innermost. A gentle regional pull keeps topics legible as regions, and forces are scaled by graph size (local repulsion, shorter links). The first view is close to final, so the simulation only relaxes.

**Renderer** (`GraphView.tsx`, `graph-render.ts`)
- **Cached scene layer.** Edges, nodes and marks render into an offscreen bitmap padded beyond the viewport. Pan and zoom transform the bitmap; it re-renders only when the view leaves the padding, the zoom settles, the layout moves, or theme/marks change.
- **Live overlay.** Hover and focus draw only the neighbourhood, over a faded base.
- **Cheap draw calls:**
  - viewport culling;
  - edges in one stroke, with alpha scaled by density and sub-pixel edges skipped;
  - nodes batched into about 20 alpha buckets, drawn as rects below 1.6 px;
  - an O(1) grid hit test instead of scanning every node on each mousemove;
  - label widths cached, labels placed by priority with a screen-grid collision test;
  - the loop sleeps when idle.
- **Legibility:**
  - zoomed out, only the folder names show, as serif italic region labels with a paper halo; note titles fade in as the regions fade out;
  - node size grows with √k past 1×;
  - arrowheads only when zoomed in on edges longer than 36 px;
  - unresolved targets are hollow;
  - titles carry a paper halo instead of a box.

**Motion.** Eased camera flights (log-space zoom, duration by distance, at most 700 ms). The neighbourhood highlight cross-fades. The scene fades in once instead of popping per node. Under `prefers-reduced-motion`: instant camera, no springs, and a cold layout computed quietly and shown once settled.

**Interlock and daily use**
- Notes attached to this project's chat get a ring, and notes cited by its canvas cards get a hollow centre. The search footer shows "本项目 · N".
- The inspector (read / add to chat / open beside chat / link to canvas card / local graph) is unchanged and flies the camera.
- Search ranks exact and prefix title matches first: "kalman note 1" now returns Kalman note 1, not Aerial note 11.
- Keyboard: `/` searches, Enter opens the first hit, Esc clears or closes, and double-clicking empty space reframes.
- The knowledge tree shows note counts per folder.
- The empty side pane no longer takes a column on Knowledge, Workflow or Settings.

**Measured** (headless Chrome with software rasterisation, frame times p50 / p95):

| Vault | Phase | Before | After |
| --- | --- | --- | --- |
| 3k notes / 10k links | settle | 67 / 83 ms, 5.1 s long tasks | 16.7 / 16.8 ms, 0 long tasks |
| 3k | pan | 33 / 34 ms | 16.7 / 16.8 ms |
| 10k notes / 33k links | pan | 50 / 67 ms, 9.7 s long tasks (before the scene cache) | 16.7 / 50 ms, about 1 s |
| 10k | zoom · hover | 33–50 / 67 ms | 16.7 / 67 ms · 16.7 / 50 ms |
| 10k | load complete snapshot | 3.5 s | 1.9 s |

The remaining p95 spikes are full scene re-renders at 10k when the zoom settles. On a GPU-rasterised desktop browser these are much cheaper.

**Tests:** `tests/knowledge-graph-engine.test.ts` covers:
- clustering, seeding compactness and hub placement;
- warm detection and neighbour placement;
- convergence of the fallback simulation within budgets, and small drift on a warm start;
- grid hit testing;
- label placement with collision and a pinned focus;
- the LOD budget, the camera flight and fit;
- search ranking.

`npm test` passes 287 tests, `npm run build` passes (the worker is emitted as its own chunk), and `npm run lint:review` passes.

**Backend gaps (documented, not changed):**
- The knowledge-graph route rebuilds the vault inventory for **every page** (about 0.36 s each at 10k notes). Caching the inventory per snapshot would make paging nearly free.
- The client still validates and structured-clones every page. That is honest verification, but it costs about 0.8 s at 10k.

---

## Round 6: calm change review (owner addendum: declutter, premium, borrowed interaction grammar)

**Why this slice.** Round 5 routes every manuscript edit, and every canvas and artifact field edit, through the "修改审阅" tab. That makes it the place where revision decisions are actually made. It was also the loudest surface left:
- raw digests, base revisions and attempt ids sat in the main flow;
- an always-visible rejection form and an actor field;
- stacked monospace before/after blocks;
- "impact" boilerplate on every edit.

It was the owner's "every control seems important, nothing feels like the intelligent path" on the most important screen. The journal engine and its guarantees are unchanged; this is presentation only.

**What changed (Cursor / VS Code diff-review grammar, our own skin):**
- **List → detail.** A calm list: title, origin (Agent · manuscript / annotation / knowledge / writing), time, and "N 待审" vs "已处理". Opening a proposal shows the detail, and "← 全部修改" returns to the list.
- **Inline word diff** (`word-diff.ts`): deletions are struck through in faint ink, insertions sit on a light ground. A semantic-cleanup pass collapses a rewritten clause into one deletion plus one insertion, instead of interleaved fragments; this was found on a real edit. Diffs beyond the size budget fall back to a whole replacement.
- **One primary action.** Opening a proposal pre-selects every edit still awaiting review. A sticky bar holds "应用所选 · N", with "校验预览" second. Guarded recovery and reject live in "…", and the reject reason appears only when you choose reject. The selection clears after apply, revert or reject.
- **Details folded:**
  - base digest, object identity and impact → "详情" per edit;
  - write receipts → "写入记录" (except pending/uncertain writes, which stay visible with their inspect/confirm actions);
  - actor, journal path and exports → the header "…".
- **Evidence as chips.** The passage and the answered revision cards open back to their source.
- **The Chat overlay dock** (same component) now auto-opens only a proposal that still needs review, never an already-settled one.
- **Verified in a browser:**
  - file a test patch → ⌘K "打开修改审阅" → list → detail (2 edits pre-selected) → apply → both "已写入" with the "PDF 不会自动重新编译" note;
  - back to the list, which shows "已处理";
  - PDF annotation → Chat overlay dock still works and the composer keeps its height.

**Tests:** `tests/word-diff.test.ts` checks that both sides are reproduced exactly, TeX/CJK/empty sides, the budget fallback, and the clause collapse. `npm test` passes 276 tests, and `npm run build` and `npm run lint:review` pass.

---

## Round 5: plan → manuscript through Chat (owner vision handoff)

**Why this slice.** After round 4 a researcher could get from reviewer comments to settled decisions in the GUI (items, agent discussion, canvas proposals). But the step that finishes a revision, changing the paper, was still CLI or by hand. The owner's "edit canvas → paper with LLM assist" direction had no path at all. This round closes that loop without a new write path and without needing TeX.

**The loop, verified live** against the local `researchd` with one real Claude turn on synthetic data:
1. **Comments → items:** reviewer comments become revision-item cards (R1.1 MPC baseline, R1.2 trials per condition).
2. **Thread brief:** "New revision thread" builds a brief with the items, the canvas-patch contract, the **source-patch contract**, the real list of manuscript files and their saved text. The text is bounded and pinned to its digest, so the agent quotes real text instead of guessing.
3. **Agent proposes:** Claude answered with a `research-source-patch` block: `{path, before, after, reason, cards:[R1.1]}`.
4. **File into the journal:** the tray showed "Agent 提出 N 处稿件修改 · 审阅". One click resolves each edit against the saved file: `before` must occur exactly once, and edits must not overlap. Resolved edits are filed as one proposal in the existing review journal, under a stable id so nothing is filed twice, and the "修改审阅" tab opens.
5. **Review and apply:** the journal's own diff, preview, conditional apply and guarded revert. `manuscript/main.tex` was written with a before/after digest receipt. The panel says plainly that the PDF is not recompiled.
6. **Back to the plan:** "标为已修改并链接段落" set R1.1 to `addressed` and attached the edited passage (path, post-write digest, quote) to the card. R1.2 was untouched.

**Bugs found live and fixed:** the same agent message can appear twice in the stream (delta + final). That caused a double-detection and a "Duplicate proposal" error; detection is now deduplicated by stable id. And once a patch was filed, nothing led back to the review, so the tray now keeps a quiet "稿件修改 · 打开审阅" link, and ⌘K has "打开修改审阅".

**Tests:** `tests/source-patch.test.ts` covers:
- parsing, including rejected paths, identical edits and malformed JSON;
- unique-quote resolution: ambiguous, stale, missing and overlapping edits;
- the proposal passing real journal validation and `patchTarget` producing the expected text;
- the evidence carrying the answered cards;
- the contract text;
- the bounded, digest-pinned excerpt.

`npm test` passes 272 tests, and `npm run build` and `npm run lint:review` pass.

**Still open (honest):**
- The PDF is not rebuilt after a source edit, because LaTeX is off on this host (status bar). PDF → source jumps still need SyncTeX from a real build.
- Edits are located by exact quote only; there is no fuzzy matching. An agent quoting stale text gets "not in the saved file", never a guess.
- Findings and derivations are not yet pulled into the thread brief automatically. Attach them via the composer tray.

---

## Round 4: owner priority list (`RESEARCH_OS_PRIORITY_NEXT.md`)

This round follows the owner's ordered list and `RESEARCH_OS_DESIGN_DEEPEN.md`. Verified in a browser against a local `researchd` (devops copy, throwaway data root, sample project with a synthetic PDF).

**1. Quieter main surface (done)**
- **The composer is never squeezed.** The design-review dock and the intake receipts no longer sit in the Chat column's layout. They float over the top of the thread (`chat-overlays`). The dock opens from a "设计审阅 · N" chip in the context tray (or ⌘K); feedback still opens it on arrival. At every step of the revision walkthrough the composer keeps its full height.
- **Thread brief instead of a flooded composer.** "New revision thread" used to paste about 10 lines of item list + patch contract into the composer. That text is now a visible **brief chip** ("修订约定 · N 项"): it can be removed, and opening it shows the full text. It is sent verbatim ahead of the first message, then detached. The composer holds one plain sentence.
- **One calm status line for environment gates.** A 24px status bar at the bottom of the window shows the Agent, LaTeX and research-service state, derived only from `/capabilities` and the host settings document (`environment-status.ts`, tested). The tray's "未连接原生 Agent" line and the PDF pane's LaTeX sentence were removed. The composer still refuses to send, with its reason, when no agent can take the thread.
- **PDF pane shows real PDFs.** With builds disabled, the side pane lists the project's actual PDFs (found by signature) and opens one in place, instead of a warning.
- **"…" menus behave like menus.** `RightMore menu` left-aligns entries and closes on choice. Applied to the project row, context tray, revision board, drafts, canvas and resource menus. The PDF zoom/version panel stays a form.
- **Copy.** The dead "继续这篇论文" strings were deleted. "New revision thread" drops to a ghost button once the project's thread is live or drafted.
**2. Graph + documents: browse, open, attach, link (done)**
- **The Knowledge graph is a browser, not a demo.**
  - One search card: typing lists the matching notes. Choosing a note (or a graph node) moves the camera to it, highlights its neighbourhood (`GraphView focus`) and opens a **node inspector**.
  - The unresolved/orphan filters, local-graph depth and direction sit in one "筛选" popover.
  - The old `<select size=6>` "inspect via list" and the duplicate pinned hover card are gone.
- **One object, four exits.** The inspector offers:
  - Read (in place);
  - Add to chat (a versioned reference pinned to the node digest);
  - under "…": Open beside chat (a note tab next to the conversation), Link to selected canvas card (through the content writer) and Local graph.
  - Outgoing links, backlinks and canvas backlinks are clickable object lists. The reader and the inspector share `useNoteLinks`.
- **Project documents join the same continuum.**
  - Each file row in project files has a hover "Add to chat". Text files are read once to pin their digest; PDFs are attached by path and marked as unverified.
  - The composer's attach menu also lists the project's PDFs found on the shelf, not only open tabs.
- **Removed:** the reader's "引用到 Chat" top-bar button, which pasted the whole note into the draft. The reader's relation lists show note titles instead of raw paths.
- Verified live on a seeded academic repository (5 linked notes plus an unresolved link): search → inspect → add to chat → the chip appears in the project composer; read → back to graph; files → add README to chat.

**3. Artifact shelf: real PDFs, slide/video stubs, honest renderer gating (done)**
- **Artifacts pane** (`kind: 'artifacts'`, a first-class, restorable resource tab beside Chat/canvas). Open it from the sidebar "制品" heading, the resource "…" menu, or ⌘K.
  - **PDF:** the project's real PDFs; one click opens the annotating reader in place.
  - **Slides & video:** slots. An existing draft shows its render state from the build ledger (`loadArtifactView`). An empty slot is a dashed row with "Draft". Slides are drafted from the revision/decision cards when the canvas has any; a video storyboard starts empty. Drafting writes a draft object through the content writer and renders nothing. The sidebar shelf now follows the content session, so a new draft shows up immediately.
- **Renderer gate from observation, not assumption.** `/capabilities` does not report the artifact renderer, so the UI starts at "unknown".
  - A definitive refusal of an explicit build (HTTP 503, or the service's "artifact renderer unavailable") is classified by `classifyBuildRefusal`. It is recorded with its timestamp and shown in the status bar and on the artifact row.
  - The studio then says plainly that no file was produced and the definition/source are saved, and offers "Try generating again".
  - Any other failure stays "uncertain — reconcile the ledger", as before. "Rendered" appears only with a successful receipt.
- **Verified live:** draft slides → fill rights/attribution → Generate. `researchd` refused ("isolated artifact worker" unavailable: no `bwrap`). The studio, the status bar ("制品渲染不可用") and the pane ("未渲染 · 渲染器不可用（已观察）") all say so, and no success is shown anywhere.
- **Backend gap (documented, not faked):** `/capabilities` should expose `artifactRender: {available, detail}` from `buildworker.NewArtifactBuilder`, the same way it exposes `latex`. Then the gate could be known before the first request. This belongs in the backend tree (`xgc2-harness/devops/platforms/research-os/cmd/researchd/artifact_runtime.go`), which this session was asked not to touch.

**4. Detachable / floating panels: stabilized (done)**
- **Bug fixed: windows could cover the navigation rail and the status bar.** A float dragged to the left edge sat on top of the rail, so the page navigation stopped responding (caught by the browser stress run). Windows are now clamped into the workspace (`FLOAT_INSETS`): below the top bar, right of the rail, above the status bar. On tiny viewports they shrink to the room instead of spilling out.
- **Tear-off.** Dragging a tab out of its strip floats it at the drop point, with a dashed landing preview; a short drag is still a click.
  - The discussion tab becomes the floating discussion window.
  - Any other tab (research canvas, PDF, artifacts…) becomes the floating side pane's active tab.
  - So Chat plus any content pane can be torn off, floated and re-docked.
  - Drag tracking uses window listeners, because the pointer leaves a 28px tab almost immediately.
- **Re-dock tells the truth.** Double-clicking a window's grip re-docks it. If the discussion came from the docked column, the float header offers "停回讨论列" (back into the column), and "放回标签" really returns it to the tabs. Before, it silently went back to the column.
- **Narrow windows.** Below 1100px the three-column dock falls back to tabs: the discussion tab reappears in the strip, and the dock control is hidden. Widening restores the dock. The saved preference is untouched.
- **Guard.** No empty floating frame is drawn when the current project has no discussion tab.
- **Verified in a browser:**
  - float → drag to a corner → the rail still works;
  - double-click re-docks;
  - dock → float → back to the column;
  - narrow ↔ wide;
  - tear off the chat tab and the canvas tab;
  - the draft survives float and re-dock;
  - geometry persists across reload.
- **Tests:** `clampRect` insets and tiny viewports, the `tearOffPoint` threshold and `tornRect` landing.
- **Still open:** the canvas can float only through the side pane. There is no independent third window, and there are no OS-level pop-out windows: everything stays in-page.

**5. Closed-loop gaps: wired where a real API exists, documented where not**

| Gap | Status | How |
| --- | --- | --- |
| Native-agent live round-trip | **Verified live** | In the scratch backend, Claude was enabled; login discovery reported `authenticated`. Then: New revision thread (brief chip) → a real turn (`s_d98185`) → Claude answered with one `research-canvas-patch` → the tray showed "Agent 提出 1 项画布修改 · 审阅" → the board listed it as "Agent 回复 · claude" → Accept wrote it at content revision `ff7a658d`. The brief was sent with the first message and then detached. The status bar read "Agent · 1 个已登录". |
| Finding → global knowledge | **Wired to the real executor, verified live** | Finding row "晋升审查" → a review-journal proposal with a `candidate`; its evidence is the finding file pinned at the digest just read (`findingPromotionProposal`). "仅认可此审查范围" pins `approvalDigest` = the canonical intent digest (`knowledgePromotionDigest`). "写入全局知识库" calls `POST /workspaces/{ws}/knowledge-promotions/{id}` and shows the receipt. Live, the executor re-derived the same digest (frontend and Go agree), re-verified the evidence, and wrote `academic/memory/knowledge/note/paper-sample-derivation/<id>.md` with outcome `written`. The review hook re-reads the journal when another surface appends to it (`research:review-journal-changed`), so the open dock doesn't hit a stale-digest conflict. |
| Shared proposal inbox | Done in round 3 | `research-proposals.json` in the project workspace, CAS-written through the generic file API. A dedicated validated route still belongs in the backend. |
| PDF ↔ manuscript-source proposals | **Not wired (no API to wire to here)** | SyncTeX mapping exists only for built PDFs, and the LaTeX builder is disabled on this host (`/capabilities.latex.available=false`, shown in the status bar). Canvas → source diffs would go through the existing writing-review flow (`offerWriting`), which needs a signed-in agent *and* a buildable manuscript. Not faked. |
| Backend sibling skew | **Unchanged, documented** | `xgc2-research-os@1aa0f63` still `replace`s `native-agent` with `../../products/common/native-agent`, which doesn't exist (`go build ./cmd/researchd` fails at `cmd/researchd/native_agents.go`). All UI work in this round is verified against the runnable devops tree (`xgc2-harness/devops/platforms/research-os`, read and run only, not modified). Someone who owns both repositories needs to pick the canonical tree. |
| Artifact-renderer capability | **Backend gap** | See item 3: `/capabilities` should report the artifact renderer; until then the UI gates on observed refusals only. |

**Tests:** `npm test` passes 267 tests. The new ones are `tests/quiet-surface.test.ts` (status model, thread brief, renderer gate, artifacts tab) and the finding-promotion cases in `tests/revision-model.test.ts` (the proposal is valid, approval pins the canonical digest, writing is refused before approval). `npm run build` and `npm run lint:review` pass.

- **Known leftover:** the composer placeholder "Ask anything..." is hard-coded in the vendored `@xgc2/agent-runtime` and ignores locale. The fix belongs in the shared package, not a product overlay.

---

## Round 3: design deepening — calm hierarchy, Chat as control plane, detachable panels

This round follows `RESEARCH_OS_DESIGN_DEEPEN.md` (owner priority) and continues the closed loop from round 2. It borrows interaction grammar without copying skins:
- Cursor / VS Code: palette, "…" menus, tab instances, split and floating panes.
- Overleaf: PDF beside the working surface.
- Obsidian: links, backlinks, pop-out panes.
- T3 Code / Codex: honest sessions and composer attachments.

**1. Declutter and hierarchy (done first)**
- **Chat column:** it reads as project name + one sentence + the composer, with a single-line context tray above the composer. The context "details" box, the no-agent warning card and the writing-centric empty copy are gone. The no-agent gate is one quiet line linking to Settings.
- **Research desk:** greeting, starters and projects only. The agent roster lives in the Settings sidebar.
- **Gated panes:** the PDF pane gate (LaTeX unavailable), the canvas empty state and the workflow empty state are each one sentence + one action.
- **Menus:** project actions fold into one "…" menu on the project row. In the revision board, intake appears on "Paste comments", and proposal sources and outputs sit in "…" menus.
- **Status and review:** Research content keeps one status line (the sync line). The design-review dock is one line until expanded, and its form stays mounted.
- **Devtool:** the developer Mark/Herdr cluster is hidden by default and toggled from ⌘K.

**2. Chat is the control plane**
- The composer tray attaches canvas cards, knowledge notes, drafts and open PDFs as versioned references. Its "…" menu inserts the reference list, asks the agent for canvas changes (with the patch contract), or opens version management.
- `research-canvas-patch` blocks in the current thread's agent replies are detected and offered as "Agent proposed N canvas changes · Review". They are recorded on that click only and applied only on acceptance. Pending proposals stay visible as one quiet control.

**3. Backend coupling (real API, no new route)**
- Proposals moved from browser storage to `research-proposals.json` in the project workspace (schema `research.canvas-proposals/v1`). They are written through the existing workspace file API with compare-and-swap: `createOnly` first, then `expectedDigest`.
- A conflict re-reads the file and re-applies the one change, so a concurrent writer's proposals are kept.
- Proposals are now shared, versioned with the repository, and can be filed by any agent working in the tree. Verified live: an accepted proposal is recorded with the content revision it produced.

**4. Graph and documents**
- The knowledge reader adds **Add to chat** (with digest) and **Link to selected card** (a versioned knowledge ref on the card, through the content writer).
- It also lists **canvas backlinks**: the project's cards that cite the note.

**5. Artifact shelf**
- The active project's sidebar tree lists its PDFs (found by the `%PDF-` signature through workspace search, no guessed paths) and its letter/slides/storyboard drafts. Each opens in place.

**6. Detachable panels**
- Chat and the side pane (PDF/artifacts) can float as windows and re-dock, from pane headers or ⌘K.
- Floating swaps a keyed pane's grid area for a fixed rectangle. Nothing remounts, so drafts, streams and PDF scroll survive tear-off and re-dock.
- Windows persist their geometry, stay inside the viewport, resize from the corner, and raise on click (below the palette). Default positions don't overlap.
- A floating discussion stays usable over Workflow and Knowledge, e.g. talking to the agent while reading the graph.

**Tests:** `npm test` passes 256 tests, including `tests/proposal-store.test.ts` (CAS, conflict retry, dedup, no-op writes) and the float cases in `tests/chat-dock.test.ts`. `npm run build` and `npm run lint:review` pass. The closed-loop browser walkthrough passed after the declutter commit and the proposal-persistence commit. A final re-run after the floating commit could not start Chrome: the shared machine was out of memory, with other sessions active.

**Still open after round 3**
- **Shared backend change:** the proposal file uses the generic workspace file API. A dedicated `/research/projects/{id}/proposals` route with server-side validation belongs in the backend, but the sibling `xgc2-research-os` tree doesn't build against the local agent runtime. The runnable tree is the `xgc2-devops` copy, a separate repository I did not modify.
- **Floating scope:** only Chat and the side pane float. The canvas, graph and terminal don't yet. Floating is in-page; there are no pop-out browser windows.
- **Manuscript source:** there are still no manuscript-source proposals from PDF/canvas (the TeX builder is disabled here), no promotion of findings into global knowledge, and no live agent round-trip (no signed-in client here).

---

## Round 2: review-driven revision closed loop (TRO-shaped)

The goal of this round is that a researcher can run review-driven revision in the GUI instead of CLI and handmade files. Everything below lives on the existing shell and on the one `research-content.json` model. There is no new page family, no vault KM, and no new agent loop.

**The loop, verified in a browser against a live `researchd`.** Every step below writes through real APIs unless marked otherwise.
1. **Start the thread.** Open a project and choose **New revision thread** (sidebar project row, ⌘K, or the board). This docks the discussion, opens Research content › **Revision**, and drafts a message into the composer without sending it. The draft lists each revision card's id, title and status, plus the `research-canvas-patch` proposal contract.
2. **Turn comments into cards.** Paste reviewer comments (Reviewer N headings and numbered items). Each comment becomes a **revision-item card** with status open / planned / addressed / declined, saved in research content.
3. **Annotate the PDF.** Files › `manuscript/submitted-v1.pdf` opens in the annotating reader beside the canvas (Chat | canvas | PDF). A region annotation is saved as a thread knowledge item (existing route). From that annotation:
   - **Create canvas card:** a revision card anchored to the PDF digest, page and quote, created once per annotation.
   - **Add to chat context:** a versioned reference, not pasted text.
4. **Attach context.** Knowledge notes (reader: "Add to chat context") and canvas cards (inspector, board, ⌘K "Attach selected card to chat") join the same visible context set. It keeps its existing scope and version checks before anything is inserted.
5. **Review proposals.** The board reads fenced `research-canvas-patch` blocks from three sources: the current thread's agent replies, a pasted reply, or a **rule-based sample, labelled as not an agent**. Each proposal lists readable steps and validation problems. **Accept and write** applies it through the shared content writer and records the content revision it produced. **Reject** changes nothing.
6. **Work on the canvas.** Cards show their type (question, revision item, claim, decision, evidence, assumption, constraint…) and the inspector can change it. Accepted decisions sit beside the item they answer, with typed relations (supports, contradicts/rebuts, depends, cites…).
7. **Capture findings.** From the card inspector or a revision item, **Capture as knowledge** writes `academic/memory/findings/<project>/<date>-<slug>.md`. The note carries front-matter back-links to the card, the content revision and the thread, and is labelled "not yet promoted to global knowledge". The card then lists it under **Linked knowledge notes** with its saved digest.
8. **Draft outputs.** **Draft response letter** or **Draft talk slides** builds a project draft from the same revision and decision cards. The slides open in the existing drafts editor and `ArtifactStudio` (pptx / video / Remotion definitions). Rendering stays gated on the artifact worker.
9. **Sync strip.** A line under Research content shows:
   - which PDF is open: built vs original, with its digest;
   - the canvas revision, and whether it is saved;
   - proposals pending vs applied.
   It never implies a TeX compile.

**What is durable and what is local**
- **Durable (backend files):**
  - revision, decision and evidence cards, their relations and statuses (`research-content.json`, CAS-saved);
  - PDF annotations (thread knowledge items);
  - finding notes (academic memory);
  - letter and slides drafts.
- **Local to this browser:**
  - pending and decided proposals (`research-ui-canvas-proposals-v1`). A proposal is an intent, not content, and only its accepted effect is persisted.
  - the chat context set (as before).
- **Constraint discovered live:** the backend (`researchcontent.Validate`) accepts only `question|claim|assumption|evidence|design|note|method|workflow|tool`. So decision, constraint and revision item are stored as a preserved `role` field on claim, assumption and question. A test pins that every written object uses a backend-valid kind.

**Tests:** `tests/revision-model.test.ts` covers:
- comment splitting;
- patch extraction, validation and application;
- placement of new cards;
- the labelled sample proposer;
- role round-trips through the canvas;
- the backend-kind invariant;
- annotation → card;
- finding notes;
- letter/slides drafts accepted by the draft book.

`npm test` passes 248 tests, and `npm run build` and `npm run lint:review` pass.

**How to reproduce the walkthrough.** You need a running `researchd` with a sample project that contains a PDF (see "Live backend" below). Any workspace PDF works; I used a synthetic one-page `manuscript/submitted-v1.pdf` marked "SYNTHETIC SAMPLE".

**Open after round 2**
- **Live agent round-trip:** no native client is signed in here, so "Read proposals from this thread" was verified only up to extraction. The same parser was verified live through the paste path. A signed-in Codex, Claude, Grok, OpenCode or Cursor thread is needed to see a real agent answer the seeded contract.
- **Manuscript source:** there is no PDF → TeX source proposal yet (SyncTeX exists only for built PDFs, and the builder is disabled here). Canvas → manuscript proposals are also not wired; a decision does not yet produce a source diff.
- **Promotion to global knowledge:** a finding stays a project finding. Promoting it goes through the existing review-journal promotion flow, which is not wired from the finding note yet.
- **Proposals are per browser:** a shared proposal inbox needs a backend route.
- **Chat column empty state:** it still reads "继续这篇论文", and the design-review dock stacks above the composer. Both need a calmer layout for revision threads.

---

## Round 1: shell, agent-native Chat, canvas vs workflow

This round advances the existing `products/research-os` app. There is no parallel IA, no vault-style Today/Topics/Library, and no new agent loop. Slices A–C of the task are done. D and E were not started.

### What changed

**A — Shell and IA**
- Non-Chat pages (Workflow, Knowledge, Settings) now show a localized serif page title in the main-column header. It replaces the raw, untranslated `Workflow` / `Settings` / `Knowledge` nav key.
- Settings has its own secondary sidebar: section links (Appearance, Connections & models) plus the native agent roster. It no longer reuses the Chat thread list. `openSettings(section)` deep-links and scrolls to a section.
- The command palette is still the single search/URL entry. It now also offers **New thread**, **Open research canvas** (current project), **Dock / undock discussion**, and **Connections & models**.

**B — Agent-native Chat and connections**
- A **Research desk** landing replaces "继续写作 / Continue writing". It puts the greeting, numbered starters, the native agent roster and project binding on one page. "No project" means a general chat, and the copy says so.
- `agent-readiness.ts` derives provider state only from the host settings document: not installed, disabled, login unchecked, signed out, signed in. It **never says "online"**, and an unchecked login is shown as unchecked, not as available. Roster order is Codex, Grok, Claude, OpenCode, Cursor.
- When no agent can take a thread, the composer is blocked with an explicit reason. The desk and the project empty state both show a "Connections & models" notice. Previously the only signal was a grey send button.
- The Settings provider section is renamed **Connections & models**. It explains that each client signs in through its own CLI and that no credentials are collected here.

**C — Research canvas vs Workflow (kept distinct)**
- **Docked discussion (Chat | canvas | artifact):** a columns button in the primary tab strip moves the conversation into its own resizable left column. The research canvas or outline stays in the primary area and the PDF or artifact in the side area, so all three work together. It is the same keyed conversation instance with only its grid area changed, so drafts and streams are not remounted. Docking also never blanks the primary content tab. The choice persists.
- **Research canvas empty state:** says the canvas externalizes questions, ideas, claims, evidence and constraints, with explicitly labelled relations. It also says it is *not* model reasoning and *not* an execution plan, and links to Workflow.
- **Workflow empty state:** points back to the research canvas ("Workflow = repeatable steps, approvals, receipts").
- While research content isn't created yet, or the canvas is review-locked, the empty state explains the next step. It does not offer add buttons that cannot act.
- Removed the duplicate canvas/outline toggle that appeared under the table / outline / canvas switcher.

New rules for this round are recorded at the end of `DESIGN_SYSTEM.md`, including one trap: inside `.native-chat-host`, `variant="solid"` buttons wash out because the shared T3 CSS redefines `--accent`.

### How to review

```sh
cd products/research-os
npm ci
npm run dev -- --host 127.0.0.1 --port 3201 --strictPort
npm test          # 236 tests, including tests/agent-readiness.test.ts and tests/chat-dock.test.ts
npm run build
```

Walkthrough (zh default; switch to English in Settings):
1. The first screen is the Research desk. With no provider enabled, it shows the no-agent notice and the honest roster.
2. Open Settings. The sidebar lists sections and the roster. "Connections & models" scrolls to the provider settings.
3. Create or select a project and use the canvas icon on the project row. The research content opens with its empty-state card.
4. Click the columns icon in the tab strip to dock the discussion. You get Discussion | research canvas | PDF (the PDF pane shows the build gate honestly).
5. Go to Workflow. The empty state points back to the canvas. ⌘K lists the new commands.

**Live backend used for verification.** The sibling `xgc2-research-os` does not currently build against the local `xgc2-devops` agent runtime (see "Blocked" below). I verified against the devops-vendored copy instead. I built it with a temporary `-modfile` that points its `replace` at `devops/products/common/agent-runtime`, and ran it on `:3200` with a throwaway data root, mirroring `scripts/check-research.mjs`. Under that backend:
- Research content creation and saving are real.
- Workflow plans list as empty.
- LaTeX and the artifact worker are reported unavailable.

### Still blocked or open

Blocked on the backend or environment:
- **Sibling backend build skew:** `xgc2-research-os/cmd/researchd` imports `products/common/native-agent`, which is missing locally (renamed to `agent-runtime`). Even when redirected, the API doesn't match (`undefined: nativeagent`). Someone needs to reconcile which backend tree is canonical.
- **TeX / PDF preview:** the trusted local LaTeX builder is disabled by default. The UI shows the gate and does not fake a compile.
- **Artifact rendering:** the worker needs `bwrap`, so it is unavailable in this environment.
- **Native agent turns:** none of the five clients was enabled or signed in here. Claude and OpenCode CLIs were detected; Codex, Grok and Cursor were not installed. No live turn was run, and fixture success ≠ provider acceptance.
- **Sibling `xgc2-research-os` routes:** it has no canvas, outline, workflow-plan, annotation or edit-proposal routes. The devops copy does serve workspace documents and project plans.

Frontend follow-ups:
- **Slice D:** literature and PDF annotation toward the three-pane review flow.
- **Slice E:** artifact stubs (manuscript, slides, video).
- **Shared provider settings:** the vendored component still labels a not-installed client "Disabled" and sorts alphabetically. That belongs in the shared package, not a product overlay.
- **Docked discussion on narrow widths:** no automatic undock below about 1100px yet.
- **Canvas inspector:** in a narrow primary column it covers the canvas, and the research-content header wraps.
- **Project chat empty state:** its copy ("继续这篇论文") is still writing-centric.
