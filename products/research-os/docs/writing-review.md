# Confirmed native writing integration

Review owns authorization, target writes and receipts in `research-reviews.json`.
The canvas owns the live design and source mappings. The native session owns
provider selection, permissions, requests, event identity and execution. The
manuscript domain owns compilation. No new approval database or scheduler exists.

## Composition

Use **one** `useReview(scope, tabId, formDirty)` instance for the mounted review.
Pass that instance to `useWritingReview(scope, review, { mapSaved })` inside the
existing `NativeAgentSessionProvider`. Do not mount a second review writer to run
writing. `mapSaved(receipt, selection)` is the canvas owner's update operation;
its rejection is a mapping failure, not a source retry or a claim of rollback.

1. Persist the PDF annotation using its existing owner. Its immutable feedback
   anchor retains build ID, PDF digest, page/regions, quote and user feedback.
2. Supply the saved feedback and canvas-captured fields/context to
   `requestDesign(DesignProposalRequest)`. The stable request ID is the native
   idempotency key. Retry discussion with the same ID and payload; do not save the
   annotation again. The action returns the actual `{sessionId, turnId, observing}`
   acknowledgement. No silent session creation or permission broadening occurs.
3. Only the matching native turn's terminal structured result becomes a design
   proposal in the existing review. Review/apply its canvas differences there.
   This is not manuscript permission. `dismissDesign()` stops observing a pending
   design discussion; it does not claim to cancel the remote native worker.
4. Capture the **now-saved** design and explicit source ranges with the canvas
   owner. `WritingSelection` is an authorization/audit projection, not another
   live canvas model. Give it to `offerWriting` with a new proposal ID.
5. Display the exact design revision, selected cards, intended changes and source
   ranges. One user action calls `confirmAndWrite(proposalId, actor)`. Confirmation
   is persisted before dispatch. The returned native result is admitted and applied
   automatically within that same scope, without another source/build approval.
6. The hook calls `mapSaved` using actual acknowledged operations/attempts. A
   failed map can be retried with `retryMapping`; it never replays manuscript writes.

`offerWriting`, `confirmWriting`, `dispatchWriting`, `acceptWritingResult`,
`applyWriting`, `cancelWriting`, `failWritingResult` and `recordWritingMapping`
are also commands on the **same** review engine. `useReview.action` now rejects
stale scope callbacks and preserves command return types. Imported generic
proposals cannot supply a `writing` authorization or bypass its guard via `run`.

The UI owner must provide captured targets/context and the canvas mapping owner.
An unconnected mapping action is an error, not a placeholder success. The current
canvas target representation remains `title`/`body`; additional intent fields
must use the canvas owner's published serializer/validator, not guessed JSON paths.

## Source and native boundaries

Source anchors use the existing UTF-16 exact ranges and opaque file digests.
The model returns only selected `sourceId`s with `replace`, `unchanged` or
`refused`; it cannot select paths, ranges, base digests, dependencies or evidence.
A replacement is patched through the existing journal + lease + file CAS path.
Everything outside the selected ranges is preserved, including same-file text.

Every source dispatch rechecks the saved design digest after the write-ahead
journal acknowledgement and holds the local design editor lease. The target has
its own CAS. These are **not** a cross-file or cross-client transaction; a remote
canvas writer may race after the read. No stronger atomicity is advertised.

`completedWritingTurn` uses the native reducer's per-item `turnStatus`, not the
latest message or global `lastTurnStatus`. Failed, unknown, truncated, malformed,
foreign or multiple-final outputs cannot write. The prompt asks the native agent
for output-only replacements; this is **not a filesystem sandbox**. Existing
native permissions and user permission requests remain authoritative. Unmanaged
native file changes are not promoted to review save receipts.

Cancellation synchronously blocks future review writes and late result admission.
An already-dispatched CAS can finish and its actual receipt remains visible. The
existing Session interrupt owns remote cancellation. No naked session cancel is
sent by this hook, since it could cancel a later unrelated turn. Project render
scope changes invalidate the writer before passive-effect cleanup.

## Batch/save facts and recovery

`subscribeReviewBatches` / `subscribeWritingBatches` receives `ReviewBatchReceipt` after the batch finishes.
The manuscript owner filters its project/workspace and source paths, deduplicates
`batchId`, and coalesces builds from `saved[]` via `writingBatchSaved`. Do not also compile each individual
`file-observations` event with origin `review`; those observations remain for other
file consumers. No polling, Git commit or build acknowledgement is invented here.

- `files` retains actual outcomes plus explicit refused/unchanged/not-dispatched
  ranges. Multiple ranges in one file can have different generation outcomes.
- `saved[]` includes **only acknowledged applied/reverted** attempts with the
  actual returned digest and operations. It never includes `observed-applied`.
- `partial`, `uncertain` and `cancelled` are not whole-batch success. A real source
  acknowledgement can survive a failed final journal write as a transient receipt;
  `auditConfirmed` stays false and further writes are blocked until inspection.
- Subscriber or editor-refresh errors never turn an acknowledged source save into
  a failed source write. They remain follow-up errors.

Reload restores the journal but does not repost native prompts, replay pending
writes, replay build events or automatically consume old terminal chat history.
`writingHistoryReceipt` is an inspection projection only. Inspect unresolved
attempts with the existing review actions. Matching content is not proof of who
wrote it, so an observation does not become a build-triggering save receipt.

## Knowledge confirmation

This change keeps the existing journal-only promotion record. It does not import
F's knowledge-promotion types, candidate hasher, or knowledge file writer. Scope
approval still never writes a knowledge file. F can later replace the inline
promotion shape without D copying that module.

## Validation

Run from `products/research-os` on Node 22.16+:

```sh
node --experimental-strip-types --test tests/writing-review.node.mjs tests/native-writing.node.mjs
```

These are explicit Node tests, not `.test.mjs` files that Vitest would collect as
empty suites. Tests exercise the actual core engine, text patcher, protocol
validators and lock/batch observers with in-memory CAS/native fixtures. They do
not establish browser integration, provider availability, remote tool sandboxing,
real manuscript compilation or final PDF correctness. Run the locked product
TypeScript/lint/build and the real native/UI/manuscript path at integration.
