# Ground-station workbench review prototype — harness #76

**Design candidate; no production integration.** All providers, conversations, tools, approvals, evidence and receipts are synthetic fixtures. This standalone HTML has no network client, upload, microphone or robot dispatch path. Its Content Security Policy disables connections, media, external images, objects and form submission. It is not imported by the product application.

The design record is `XGC-Team/xgc2-dev-memory:now/ground-station-workbench-76.md`. Coordination and review receipts belong to [harness #76](https://github.com/XGC-Team/xgc2-harness/issues/76). #67 owns native/access/approval/evidence implementation; #66 owns shared primitives; #70 owns robot command UX. No existing source files, dependencies, locks, workflows, parent pins or shared services are changed here.

## Run and inspect

Open `index.html` in a browser that permits local pages, or serve **only this directory** with a loopback static server on an unused port. Do not start/restart the shared station or run the product dev launcher for this fixture. For example, from this directory:

```sh
python3 -m http.server --bind 127.0.0.1 8769
```

The fixture stores its own synthetic history in the browser key `xgc2.issue76.fixture.v1`. Storage failures are visible and leave only in-memory state. “Reset fixtures” removes this prototype's data, not product or provider journals. No production credentials should be entered. Use “Scenario controls and failure injection” for synthetic states; those controls are outside the proposed product panel.

## Guided walkthrough

| Step | Interaction | Check |
| --- | --- | --- |
| Prepare without a Run | Select Scout tracking; create/rename a conversation; type a message | Preparation context; no execution created; exact original message available |
| Attach supported context | Context → Current experiment definition → Attach original as text context; repeat with Session A frozen configuration | Explicit fixture text, cfg-7 versus frozen cfg-6; no upload or silent run creation |
| Select live scope and propose | Context → Existing Session A / Run A1; scenario Propose service action | Target/action/parameters/scope/consequences inspectable; fictional diagnostic.snapshot only |
| Human review | Toggle Actor to proposer, then operator; approve or reject | Proposer cannot answer; submitted remains visible before authority fixture resolves; approval is not successful execution |
| Expiry and Session race | Details / receipt → Expire or Revoke. For another proposal, approve then End Session A before resolution | Expired/revoked requests do not dispatch; delayed Session mismatch rejects admission |
| Stream and inspect originals | Send Markdown/code text; inspect Original; inject tool fixtures and task progress | Stable original text, tool/user/Agent/decision distinctions, one revisioned progress row |
| Leave and return | Type an unsent draft → System → publish actionable notice → Notices → Open source | Draft/history/pending state retained; read/hide does not decide a request |
| Post-run analysis | Context → Post-run scope; open Historical tracking log and attach it | Historical Session/Run/revision and omitted prefix visible; no new execution |
| Reconnect / failure | Fail next send; retry same request. Disconnect during streaming; reconnect and explicitly retry | Draft retained, original request key reused, same native context, no duplicate receipt |
| Long history | Stream 1,000 tool fixtures; Earlier; inject another batch; Latest | Full synthetic history retained, at most 40 rendered rows, history reading does not follow new events |
| Configuration and menus | Settings: change a default; simulate concurrent update before Save. Test model/reasoning/permission menus | Conflict preserves draft; effective options captured per request; no robot authority from composer |
| Narrow / theme | 307 px panel; Light/Dark; keyboard menu navigation | Four controls stay on one row, non-shrinking 32px send, actual clickable menus and focus return |

Conversation actions distinguish rename/archive/reopen, reversible display clearing and a new native conversation. None implicitly clears old native context. Different experiments have separate selectable references; attempting to attach another experiment's source is rejected. The global center can show an intentionally unavailable original without marking the notice read. Provider diagnostic injection stays out of conversation text.

The post-restart “Reconcile submitted fixtures” action simulates an authority replay that returns rejected/no-admission. It deliberately does not automatically resubmit or dispatch an uncertain decision. In a real product, the service—not browser JSON or timers—owns durable decisions and execution.

## Reuse, not a replacement implementation

This HTML is a disposable vanilla-DOM interaction fixture. Its small Markdown renderer and dialog controls are not copied T3 code and are not proposed replacements for maintained common components. It supports basic emphasis/code/headings plus one `$$e = x - r$$` MathML sample, **not** general Markdown/LaTeX fidelity. The prototype's sample catalog is not a provider capability claim.

Production integration should reuse `NativeConversation`, `NativeInput`, `NativeComposerControls`, `NativeProviderSettings`, the shared T3 timeline/Markdown/editor, GCS domain slots, existing notification/visibility owners and xgc2-ui controls. Current source baseline: product `e85ed750de8420a96a3c4bdce9db769f1c37a0b5`; common/devops `aebd32ec12b61cf9ea63bbdfe69016769b21bfe4`; memory `9a7fdce80dd964a2c855633a6d287f3b7733eaaf`; harness `706bdf80243fa5e7c9e11339aa09e850dc68937d`.

The maintained T3 migration is pinned to `6349a0e68a958cc51b7b5198683c1d1db88b8d28`, MIT / T3 Tools Inc. Its existing provenance and license remain in `common/native-agent/web`. The design record cites inspected sources and distinguishes their accepted features, missing contracts and #67-owned defects. This directory copies no upstream implementations or font assets and changes no licenses/dependencies.

Files/images/voice remain proposals. The inspected shared send callback is text-only; no end-to-end media support is claimed for Codex, Claude, Cursor, Grok or OpenCode. “Attach original as text context” uses only the labelled synthetic strings in this page. No speculative media controls or secret/settings forms are added.

## Browser regression checks

Use an already installed Python Playwright package and Chromium; the script installs nothing and changes no browser policy.

```sh
CHROMIUM_EXECUTABLE=/usr/bin/chromium python3 test_browser.py
# Optional screenshot evidence outside the source tree:
CHROMIUM_EXECUTABLE=/usr/bin/chromium python3 test_browser.py --evidence-dir /tmp/harness-76-evidence
# Additional gate in an environment permitting normal local navigation:
CHROMIUM_EXECUTABLE=/usr/bin/chromium python3 test_browser.py --served
```

Default mode renders the exact HTML with `page.set_content` and an explicit test-only storage-boundary object. This mode does not prove real-origin localStorage, navigation, provider access or durable dispatch. `--served` starts and cleans up an ephemeral loopback HTTP server and uses the real browser origin/storage instead. It must not be made to pass by weakening managed browser policy.

Observed pre-publication: **17/17 tests passed**, Chromium `144.0.7559.96`, Python `3.13`, Node `22.16.0`. Tests cover original text and safe rendering, failed sends/intervening drafts, IME and cancellation, replay/context identity, conversation lifecycle/concurrent callbacks, explicit and wrong-project references, authority/state/expiry/revocation/failure paths, delayed Session admission, parked notices, unavailable evidence, diagnostics/progress, serialized restoration, 2,000 retained synthetic events with bounded rows, 307px/320px viewport menus in light/dark, in-flight context snapshots and configuration CAS/effective metadata. All tests assert no page errors or unexpected network requests.

Managed Chromium in the authoring environment rejected file and loopback navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`. Consequently `--served` and real-origin persistence are **Open**. No security policy was changed. A direct in-memory smoke without the storage fixture showed the expected storage-unavailable warning. Initial Playwright page-side polling conflicted with the prototype CSP; the test now polls read-only snapshots without relaxing CSP.

The 40-row page and 25-item batch are fixture parameters, not measured product budgets. Reported generation/render scheduling time is synthetic workload evidence, not a before/after optimization result. This delivery does not run the shared T3/React stack, full Web build/lint/typecheck, broker CAS, authenticated HTTP, a real provider, delegated evidence retrieval, simulation, physical robots or remote CI. Visual screenshots are review samples, not approved design-system baselines.
