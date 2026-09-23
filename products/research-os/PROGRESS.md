# Research OS: agent-native workbench progress (2026-09-24)

Branch: `feat/research-os-agent-native-workbench` · Draft PR XGC-Team/xgc2-ui#34 · Refs XGC-Team/xgc2-research-os#12

## Round 4: owner priority list (`RESEARCH_OS_PRIORITY_NEXT.md`)

This round follows the owner's ordered list and `RESEARCH_OS_DESIGN_DEEPEN.md`. Verified in a browser against a local `researchd` (devops copy, throwaway data root, sample project with a synthetic PDF).

**1. Quieter main surface (done)**
- **The composer is never squeezed.** The design-review dock and the intake receipts no longer sit in the Chat column's layout. They float over the top of the thread (`chat-overlays`). The dock opens from a "设计审阅 · N" chip in the context tray (or ⌘K); feedback still opens it on arrival. At every step of the revision walkthrough the composer keeps its full height.
- **Thread brief instead of a flooded composer.** "New revision thread" used to paste about 10 lines of item list + patch contract into the composer. That text is now a visible **brief chip** ("修订约定 · N 项"): it can be removed, and opening it shows the full text. It is sent verbatim ahead of the first message, then detached. The composer holds one plain sentence.
- **One calm status line for environment gates.** A 24px status bar at the bottom of the window shows the Agent, LaTeX and research-service state, derived only from `/capabilities` and the host settings document (`environment-status.ts`, tested). The tray's "未连接原生 Agent" line and the PDF pane's LaTeX sentence were removed. The composer still refuses to send, with its reason, when no agent can take the thread.
- **PDF pane shows real PDFs.** With builds disabled, the side pane lists the project's actual PDFs (found by signature) and opens one in place, instead of a warning.
- **"…" menus behave like menus.** `RightMore menu` left-aligns entries and closes on choice. Applied to the project row, context tray, revision board, drafts, canvas and resource menus. The PDF zoom/version panel stays a form.
- **Copy.** The dead "继续这篇论文" strings were deleted. "New revision thread" drops to a ghost button once the project's thread is live or drafted.
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
