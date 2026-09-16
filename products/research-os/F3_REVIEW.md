# F3: reviewable changes and protected recovery

## Delivery / 2026-09-16

Implementation base: `66fcc71d932190bd8e7e236a8fb5fb56e26b6b15`, the unmerged F1 PR #18. This is a separate dependent review branch, not a declaration that F1 or F2 has passed acceptance. Review the F3 diff against the F1 branch; retarget onto current `main` only after integrating its dependency and rerunning the gates. No runtime, devops pin, shared package, font, vendor or dependency-lock changes.

Source of intent remains the knowledge repository's `now/research-os-agent-native-vision.md`; UI #17 tracks delivery. This document records implementation and evidence, not a competing product vision.

## Scope and implementation

| Package | Entry / implementation | Boundary |
| --- | --- | --- |
| F3.1 Feedback and anchors | `ReadingBridge` captures actual PDF text/region and source version; `FeedbackButton`, `CanvasReviewTools`, `DraftsPage`, `SourceStage` capture saved fields/ranges. `review-navigation` verifies before returning. | Old PDF coordinates do not map onto a new build. Source navigation requires a matching build input digest. External PDFs stay evidence; no source mapping is inferred. |
| F3.2 Review | `ReviewPanel`, `review-model`: immutable author/feedback/target/base/before/after/reason/evidence/impact; explicit operation selection and dependency groups. | The author label is user-supplied, not authenticated attribution. Suggestions are composed explicitly; no Agent generation is simulated. |
| F3.3 Apply and recover | `review-engine`, `review-targets`, `write-coordinator`: journal-before-write, target CAS, receipts, duplicate protection, partial outcomes and guarded inverse patches. | No cross-file transaction API. Cross-file dependent groups are preview-only; independent files have separate outcomes. Network/5xx/missing acknowledgement is uncertain, not success or safe-to-retry failure. |
| F3.4 Impact and build | Explicit impacted-object references; semantic canvas comparison; `BuildProvenance` reads real build records. | Layout-only movement is not a semantic edit. Last successful PDF is retained with its exact build/digest; later failed builds are shown without substituting previews. Compilation is not scientific validation. |
| F3.5 Other artifacts and knowledge | Paper/slides/storyboard use the shared review identity and native block fields. Storyboard duration is validated as seconds. Knowledge review includes destination, conditions and verification scope. | Scope approval writes only a review decision, never global knowledge. No timeline rendering or global promotion executor is added. |

## Persistence, failure and recovery

`research-reviews.json` stores immutable proposals, rejection/scope decisions and per-file attempts in the selected project workspace. It is separate from `research-drafts.json`, `thinking.canvas.json` and source files. Each write uses the existing workspace file API and `expectedDigest`; only initial journal creation uses `createOnly`. Project ID and workspace remain explicit, even where legacy values coincide.

Before target dispatch the journal records intended operation IDs, actor, baseline digest and content hashes. Only an acknowledged target write records `applied`/`reverted`. Journal and target are **not** one transaction. A lost target reply or failed final journal save leaves a persisted pending/uncertain attempt. Further application is blocked until inspection and explicit human confirmation of the observed content. Content matching an intended hash is not proof of who wrote it. Different/mixed content requires manual recovery; there is no force restore. Preflight/lease failures are separately recorded as not dispatched, alongside any already-written independent file.

Mounted autosave editors reject review writes while dirty, loading, failed or holding an unconsumed capture. A lease disables their controls and mutations, then refreshes them before unlocking. Server CAS still protects other clients. Closing during review commands is blocked; an uncertain journal requires resolution/export. Requests already dispatched are not claimed to be cancelled on unload.

Source-range undo is intentionally conservative: require the exact acknowledged post-write digest, and recover every range from that same source write together. JSON block/card undo compares only the affected fields, preserving unrelated later edits and unknown extension fields. If the affected field has changed, recovery refuses rather than restoring an old whole-file snapshot. A new proposal is needed for a different baseline; repeating an applied/reverted/rejected operation is not allowed.

Ordinary edits remain ordinary edits. A bounded **page-session** observation feed records actual acknowledged saves and indicates possible semantic impact. It is not a durable whole-project audit history, does not capture edits made by other clients, and does not fabricate a server event stream. The review journal is durable; this observation feed is not.

## Source and preview provenance

Feedback retains its observed file digest or exact PDF build/output digest, page and rectangles. Returning to stale text/card/block sources fails visibly instead of selecting similar content in a new version. Project PDF return requires the exact successful build/output record. Source-to-PDF and PDF-to-source mapping are separate from semantic claims: the current source must match a pinned build input digest. Missing input metadata means “needs confirmation”, not a best-effort positional match.

The build panel shows the currently selected artifact, its build commit when available, and a later actual failed build without replacing that artifact. It refreshes from real records on request and after acknowledged local source saves. No render/build is triggered by saving a proposal or approving knowledge scope.

## Actual checks in this authoring environment

- Node 22.16.0: **60/60 F3 tests passed**, no failures or skips, across `check-f3-review.mts` and `check-f3-anchors.mts`.
- Node 22.16.0: **75/75 F1 regression checks passed** across `check-f1-loop.mts` and `check-draft-authoring.mts`.
- Seven dependency-free F3 production modules passed strict standalone TypeScript 5.8.3 checking. This is not the product's locked TypeScript build.
- TS/TSX syntax/transpilation diagnostics and browser-script syntax checks were run; they do not type-check/render the complete React application.

The engine tests use an in-memory file port and failure injection; anchor tests replace `fetch` while exercising the actual API adapter. They cover stale baselines, group validation, partial writes, write-ahead failures, lost replies, duplicate actions, guarded recovery, artifact fields, provenance and editor coordination. These are not real backend or DOM acceptance results.

**Added but not executed here:** five actual Zustand/Vitest tests (`tests/review-store.test.ts`) and `scripts/check-f3-browser.mjs`. The latter uses a real running product frontend with isolated test HTTP fixtures, a generated one-page PDF fixture and all unrelated writes blocked. It is not production-persistence evidence.

**Not run:** installation of the complete locked/vendor dependencies, full product typecheck/build, all Vitest tests, Playwright/real React rendering, visual/keyboard acceptance and the user's 3201 runtime. The authoring container cannot resolve GitHub/npm hosts and has no installed product runtime dependencies. No substitute React shim, fake screenshot or claim of an updated running deployment is used. Keep the PR Draft until these gates are met.

## Reproduction and merge gates

In a complete checkout, without taking over the runtime owner's occupied ports:

```sh
cd products/research-os
npm ci
npm run build
npm test
node --experimental-strip-types --test scripts/check-workspace-layout.mts scripts/check-project-objects.mts scripts/check-canvas-persistence.mts scripts/check-file-session-lifecycle.mts scripts/check-draft-authoring.mts scripts/check-f1-loop.mts scripts/check-f3-review.mts scripts/check-f3-anchors.mts
```

For the isolated browser script, use an already running actual product and an existing registered dedicated project `paper-e2e-*`:

```sh
RESEARCH_UI_URL=http://127.0.0.1:3201 RESEARCH_TEST_PROJECT=paper-e2e-review node scripts/check-f3-browser.mjs
```

That script is a fixture-backed frontend check, not a real-service gate. Separately exercise the following with dedicated test files on the real service:

1. Select text and draw a region on an actual test PDF, preserve the original comment, enter review, return to its exact build/page. Change page/build and confirm no stale selection survives. External PDFs must not gain source-edit authority.
2. Create two independent operations (source wording and card condition), inspect their before/after/reason/evidence, select one only. Add a dependency and confirm indivisible review; cross-file dependency application must remain unavailable.
3. Preview and verify no target write. Change the source externally, then apply: it must show baseline conflict and no source overwrite. Compose against the new baseline before retrying.
4. Exercise one independent file success and another refused/conflicted file. Check exact written and untouched paths/digests. Lose a reply or the final journal write, reload, inspect and confirm observed content; no automatic repeated write.
5. Undo a source change on the exact post-write version. Then edit it manually and verify old recovery refuses. For a card/artifact, preserve unrelated subsequent fields but refuse recovery if the reviewed field changed.
6. Trigger a real failed manuscript build after a success: keep the old preview with its exact provenance and display the failed receipt. Neither success nor failure implies correctness of citations or conclusions.
7. Repeat native-field feedback for paper, slide notes and storyboard duration. Review knowledge conditions/verification/target scope and reject or approve that scope without any global write.
8. Verify drafts, Chat stream/unsent input and existing PDF/canvas states across tab/project/focus changes, wide/narrow layout, keyboard, zh/en and light/dark. Resolve/export any pending journal before closure.

F3 completion requires these observed results and product review, not just the presence of a PR or passing pure-model tests. F1/F2 acceptance is not implied.

## Rollback

After integration, use a normal revert commit for code. Do not reset published main or delete research files. Export the journal and unresolved attempts before moving to an older UI. A code rollback does not reverse research-content edits; those require the recorded protected recovery path or a new reviewed proposal.
