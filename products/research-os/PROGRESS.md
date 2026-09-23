# Research OS: agent-native workbench progress (2026-09-24)

Branch: `feat/research-os-agent-native-workbench` · Refs XGC-Team/xgc2-research-os#12

This round advances the existing `products/research-os` app. There is no parallel IA, no vault-style Today/Topics/Library, and no new agent loop. Slices A–C of the task are done. D and E were not started.

## What changed

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

## How to review

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

## Still blocked or open

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
