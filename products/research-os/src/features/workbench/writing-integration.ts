import { captureSelectedContext, writingSelectionFromContext, type LiveCanvasGate, type ObservedSource, type SelectedContext } from '../projects/design-context'
import { applyLiveMapping, awaitSaveLiveCanvas, inspectLiveCanvas } from '../projects/useCanvasDocument'
import { readReviewFile } from '../review/review-api'
import { assertEditorClean } from '../review/write-coordinator'
import { check, fileKey, operationState, type Feedback, type FileRecord, type Scope } from '../review/review-model'
import type { createReviewEngine } from '../review/review-engine'
import type { DesignProposalRequest, ReviewBatchReceipt, WritingSelection } from '../review/writing-contract'

type CapturePort = { inspect: (project: string) => LiveCanvasGate | null; read: (workspace: string, path: string) => Promise<FileRecord>; clean: (workspace: string, path: string) => void }
const capturePort: CapturePort = { inspect: inspectLiveCanvas, read: readReviewFile, clean: assertEditorClean }

/** Capture the mounted C owner and verify saved files without mounting another writer. */
export async function captureWritingContext(scope: Scope, cardIds: string[], port: CapturePort = capturePort): Promise<SelectedContext> {
  check(scope.projectId === scope.workspace, 'The selected design belongs to a different manuscript workspace.')
  const gate = port.inspect(scope.projectId)
  check(gate, 'Open the design and select its relevant cards in the discussion context first.')
  const first = captureSelectedContext(gate, cardIds)
  check(first.ok, first.ok ? '' : first.detail)
  port.clean(scope.workspace, first.context.canvas.path)
  const canvas = await port.read(scope.workspace, first.context.canvas.path)
  check(canvas.digest === first.context.canvas.digest, 'The saved design changed; reload it before discussing or confirming.')
  const files = new Map<string, ObservedSource>()
  for (const { anchor } of first.context.sources) {
    if (files.has(fileKey(anchor))) continue
    port.clean(anchor.workspace, anchor.path)
    files.set(fileKey(anchor), { workspace: anchor.workspace, path: anchor.path, ...await port.read(anchor.workspace, anchor.path) })
  }
  const current = port.inspect(scope.projectId)
  check(current && current.digest === first.context.canvas.digest, 'The design changed while its source context was being captured.')
  const captured = captureSelectedContext(current, cardIds, files)
  check(captured.ok, captured.ok ? '' : captured.detail)
  return captured.context
}

export function designRequestFromContext(id: string, scope: Scope, feedback: Feedback, selected: SelectedContext): DesignProposalRequest {
  check(selected.project === scope.projectId, 'Design context belongs to another project.')
  return {
    id, scope, feedback, context: selected.context,
    targets: selected.cards.map((card, index) => ({ id: `design-${index}`, anchor: {
      kind: 'canvas', workspace: scope.workspace, path: selected.canvas.path, digest: selected.canvas.digest,
      quote: card.body || '', target: { kind: 'canvas', workspace: scope.workspace, path: selected.canvas.path, objectId: card.id, field: 'body' },
    } })),
  }
}

/** A reviewed design is saved through D before C captures any manuscript authorization. */
export async function prepareWritingFromDesign(engine: ReturnType<typeof createReviewEngine>, scope: Scope,
  proposalId: string, operationIds: string[], actor: string, current = () => true, port: CapturePort = capturePort) {
  check(current(), 'The design project changed.')
  const book = engine.snapshot().book
  check(book, 'Load the saved review before confirming its design.')
  const proposal = book.proposals.find(item => item.id === proposalId)
  check(proposal && !proposal.writing && operationIds.length > 0, 'Choose a saved design proposal.')
  const selected = proposal.operations.filter(op => operationIds.includes(op.id))
  check(selected.length === operationIds.length && selected.every(op => op.target.kind === 'canvas'), 'Only selected design fields can be confirmed here.')
  const states = selected.map(op => operationState(book, proposal.id, op.id))
  if (!states.every(state => state === 'applied')) {
    check(states.every(state => state === 'review'), 'Inspect the existing design write receipts before preparing manuscript changes.')
    await engine.run(proposalId, operationIds, actor, 'apply')
  }
  check(current(), 'The design project changed.')
  check(selected.every(op => operationState(engine.snapshot().book!, proposal.id, op.id) === 'applied'), 'The design save has not been acknowledged.')
  const cardIds = [...new Set(selected.map(op => op.target.kind === 'canvas' ? op.target.objectId : ''))]
  const context = await captureWritingContext(scope, cardIds, port)
  check(current(), 'The design project changed.')
  return engine.offerWriting({ id: `writing-${proposalId}`, author: actor, title: proposal.title, feedback: proposal.feedback, selection: writingSelectionFromContext(context) })
}

type MappingPort = { read: typeof readReviewFile; apply: typeof applyLiveMapping; save: typeof awaitSaveLiveCanvas }
const mappingPort: MappingPort = { read: readReviewFile, apply: applyLiveMapping, save: awaitSaveLiveCanvas }
export async function mapSavedWriting(scope: Scope, receipt: ReviewBatchReceipt, selection: WritingSelection, port: MappingPort = mappingPort): Promise<void> {
  check(receipt.scope.projectId === scope.projectId && receipt.scope.workspace === scope.workspace && selection.design.path === 'thinking.canvas.json', 'Writing receipts belong to another design.')
  check(receipt.saved.length > 0 && receipt.saved.every(item => item.attempt.workspace === scope.workspace && item.attempt.outcome === 'applied' && item.attempt.afterDigest), 'Mapping requires acknowledged manuscript saves.')
  const files = new Map<string, ObservedSource>()
  for (const { attempt } of receipt.saved) {
    const record = await port.read(attempt.workspace, attempt.path)
    check(record.digest === attempt.afterDigest, 'The manuscript changed after writing; its design mapping needs inspection.')
    files.set(fileKey(attempt), { workspace: attempt.workspace, path: attempt.path, ...record })
  }
  const update = port.apply(scope.projectId, receipt.saved, files)
  check(update.status === 'updated', update.detail || 'The design mapping needs explicit correction.')
  await port.save(scope.projectId, update.canvas)
}
