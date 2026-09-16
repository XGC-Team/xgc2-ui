# Backend integration contract for the Research OS frontend

Derived from F4 acceptance (`F4_ACCEPTANCE.md`). This document describes the behavior the frontend already relies on or will need. It does not prescribe or invent server-side APIs; endpoint shapes mentioned as "existing" are the ones the frontend already calls.

## 1. Versioned workspace files (existing, load-bearing)

The frontend treats every project document as a content-addressed file:

- Read returns `{content, digest}`; a missing object is 404 and is never confused with an empty or damaged one.
- Write requires either `expectedDigest` (compare-and-swap) or `createOnly`. 409/412 means version conflict; other 4xx means refused (not written); 5xx or a lost reply means the outcome is **uncertain** and must not be retried blindly.
- `digest` is an opaque per-file revision string. The frontend never invents one: unavailable version information is displayed as unverifiable.
- Malformed content, unsupported format versions and cross-project data must be rejected on read without overwriting the original.

Required behaviors the frontend depends on: per-object serialized writes, honest error classification, and stable digests that can be pinned into sources, evidence, feedback anchors and build inputs.

## 2. Review journal (existing, file-based)

The review journal (`research-reviews.json`) is a normal workspace file and inherits §1 semantics. The frontend's write-ahead flow requires:

- Journal and target are separate writes; the backend must not assume or provide implicit atomicity between them.
- A persisted "pending" attempt plus an unreadable outcome must stay inspectable: the frontend reads the target's current content and digest, compares against recorded before/after hashes, and requires explicit human confirmation before any further application.
- Preflight (baseline) failures are recorded as NOT DISPATCHED alongside already-written independent files. Partial outcomes are the normal case; per-file receipts (path, before/after digest, outcome, detail) are the contract.

If a real cross-file transaction capability is ever offered, the frontend can adopt it behind the same review UI; until then the explicit per-file receipt model above is the required behavior.

## 3. Builds and preview provenance (existing)

- Build records expose task inputs (`path` + `digest`), the build commit when available, manifest status, diagnostics and outputs (`digest`, media type).
- PDF artifacts are fetched by build id and output digest. The frontend pins feedback anchors to `buildId + output digest + page + rectangles`; the backend must keep old build records and artifacts addressable after newer builds succeed or fail.
- A successful build is a rendering receipt only. Nothing in build status may be presented as verified citations, correctness or scientific validity.

## 4. Workflow plans (existing)

- Plans are versioned revisions; saving takes a `baseVersion`. Approval requires the revision digest and an explicit human consent flag; the backend must not execute unapproved revisions or treat UI project selection as approval.
- Execute accepts the head digest and an `Idempotency-Key`: repeated execution of the same revision identity must be safe (no duplicate runs).
- Runs expose stage receipts (stage, session, status, events, output) including `awaiting-input` and terminal states; cancel targets a specific run and leaves the cancelled receipt visible.
- Research completion requires human acceptance (`researchAcceptance`); the frontend needs the real state machine, not a simulated one.

## 5. Intake (existing)

- Text intake writes a workspace file with `createOnly` and returns a digest the frontend pins into the material reference.
- PDF intake accepts multipart with an `Idempotency-Key`; retried submissions must not duplicate archive entries.
- Receipts distinguish accepted / failed / unsupported. No intake receipt may imply indexing, tracking or scheduling has started.

## 6. Behaviors the frontend needs but no executor provides today

For each gap: what the frontend needs, without prescribing an interface.

| Capability | Needed behavior |
| --- | --- |
| Experiment runs and results | A domain object linking an experiment requirement (question, parameters, acceptance) to real run records with inputs, parameters, measurements and outcome states (planned / running / succeeded / failed / cancelled). Empty must stay empty; the frontend will render only real records. Cancellation and partial-failure receipts per run. |
| RSS / continuous tracking | Rule activation distinct from rule drafts: explicit start/pause states, last-run receipt, per-item provenance (source, fetched revision), and failure visibility. Saving a rule must never imply tracking. |
| Artifact rendering (slides, video) | A build-style record per artifact analogous to §3: inputs with digests, status, diagnostics, outputs. Old previews remain addressable; rendering success is not content validation. |
| Global knowledge promotion | An executor behind the existing scope review: it must require the recorded scope decision (scope, conditions, verification state, actor, base revisions) and write only what the scope covers, with provenance back to the source objects. Pending or rejected scopes are not writable. |
| Agent write-back to canvas/outline | A structured proposal channel: agent-authored operations enter the same review model (target, base digest, before/after, reason, evidence) instead of free text. Until then, agent output stays a suggestion in the Chat draft. |

Cross-cutting requirements for any new executor:

- **Permissions and approval**: state-changing calls bind a human decision to a digest/version of what was reviewed; drafts and local definitions never authorize execution.
- **Idempotency**: every retriable action carries an idempotency key; retried requests are safe by construction.
- **Version conflict**: optimistic concurrency everywhere content is written; conflicts preserve both sides and are surfaced, never last-write-wins.
- **Partial failure**: multi-object operations report per-object outcomes (written / refused / conflicted / not dispatched / uncertain). "Uncertain" blocks blind retry and stays inspectable.
- **Cancellation and recovery**: long-running actions are cancellable with the terminal receipt preserved; recovery compares observed content against recorded intent and requires human confirmation, never force-restore.
- **Migration**: persisted documents carry format versions; unknown fields survive round-trips; newer/unsupported versions are rejected rather than silently repaired; format upgrades write a create-only backup of the original bytes first.
