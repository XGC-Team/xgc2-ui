# Research workbench

The harness runtime starts this frontend at `http://127.0.0.1:3201`. For an isolated frontend-only session, run `npm run dev -- --host 127.0.0.1 --port 3201 --strictPort` after stopping the runtime-owned frontend. API requests proxy to the local Research service at `127.0.0.1:3200`, preserving Host and Origin. That service must include `3201` in `RESEARCH_OS_BROWSER_ALLOWED_PORTS`; native access remains loopback-only. A LAN address is not a substitute for the native loopback origin.

- Projects: existing `paper-*` personal repositories, with durable thread titles, archive/restore and history per repository.
- Chat: a direct composer; the first send creates the native thread and streams the reply. Repository threads use the actual working tree. Model, thinking effort and permissions come from the native provider.
- Settings: shared T3/xgc2 provider settings for Codex, Grok, Claude, OpenCode and Cursor, including enablement, CLI path, defaults and capability refresh.
- Workflow: canvas nodes and dependencies, property editor, immutable plan versions, digest approval, real execution/cancellation, receipts, PlanWeave/Archify exports.
- Graph: academic repository core knowledge (memory root, now, ontology), with real Markdown/wiki links and source text.
- Knowledge: persisted notes and their revisions, creation linked to a selected project, quotation into Chat.
- Files: paginated workspace directories, file content and revision, quotation into Chat.
- Bottom panel: real PTY shells in the selected personal repository, multiple terminal tabs, resize, reconnect with recent output, and explicit close. Output/Runs/Requests remain separate views of real native events. The whole panel follows the selected theme. Shells survive panel collapse and browser reconnection while Research is running; closing a terminal or stopping Research ends them.
- Browser: embeds entered addresses, with a shortcut to the local ground station on port 5174 and an expanded-width control. Sites that disallow embedding can open in another tab.

Graph covers core curated knowledge, not the raw/OCR corpus. Repository discussion sessions and workflow executions have different working directories: conversations use the personal repository; approved workflows retain their independent Git copy.

Build: `npm run build`. Component documentation: `/?ui-kit` and `DESIGN_SYSTEM.md`.

Integration check: `node scripts/check-research.mjs`. It runs a built Research API and Git in a temporary data directory, with test ports 3215/5175. Set `RESEARCH_TEST_BINARY` if the runtime-owned binary is elsewhere. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed compatible browser when needed. `RESEARCH_TEST_NATIVE=1` additionally calls the configured native model and exercises workflow approval/stop using synthetic evidence; it does not write to daily research projects.
