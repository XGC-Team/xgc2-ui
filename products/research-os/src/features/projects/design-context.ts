/** C-owned design/source identity and selected writing context.
 * A locates cards from locateRelatedCards; D projects WritingSelection from SelectedContext.
 * SyncTeX line numbers are never treated as a semantic match. */
import type { Anchor, Attempt, Operation } from '../review/review-model'
import { CANVAS_PATH, WRITING_FIELDS, addNodeBinding, quoteOccurrences, replaceNodeBinding,
  serializeWriting, type SourceBinding, type ThinkingCanvasV2, type WritingConstraints, type WritingField } from './canvas-model'

export type DesignCardId = string
export type SourceIdentity = { workspace: string; path: string; digest: string }
export type ObservedSource = SourceIdentity & { content: string }

export type BindingMatchStatus = 'exact' | 'candidates' | 'missing'
export type BindingCandidate = {
  bindingId: string
  cardId: string
  identity: SourceIdentity
  quote: string
  reason: 'moved' | 'changed' | 'duplicate-quote' | 'digest-mismatch' | 'quote-absent'
  observedRange?: { start: number; end: number }
  observedDigest?: string
}
export type BindingMatch =
  | { status: 'exact'; bindingId: string; cardId: string; identity: SourceIdentity; range: { start: number; end: number }; quote: string }
  | { status: 'candidates'; candidates: BindingCandidate[] }
  | { status: 'missing'; bindingId?: string; cardId?: string; reason: 'quote-absent' | 'file-missing' | 'card-missing' }

export type DesignCardSnapshot = {
  id: string
  title: string
  body?: string
  writing?: WritingConstraints
  bindings: SourceBinding[]
  evidence: { id: string; path?: string; workspace?: string; url?: string; digest?: string; excerpt?: string; note?: string }[]
}

export type SelectedContext = {
  project: string
  canvas: { path: typeof CANVAS_PATH; digest: string }
  cards: DesignCardSnapshot[]
  sources: { id: string; anchor: Anchor }[]
  evidence: Anchor[]
  context: string
  fingerprint: string
}

export type ContextRefusal = {
  ok: false
  reason: 'dirty' | 'conflict' | 'review-lock' | 'unsaved' | 'missing-canvas' | 'stale-digest' | 'foreign-project' | 'unresolved-binding' | 'empty-selection'
  detail: string
}
export type CapturedContext = { ok: true; context: SelectedContext }
export type CaptureResult = CapturedContext | ContextRefusal

export type LiveCanvasGate = {
  project: string
  digest?: string
  dirty: boolean
  status: string
  reviewLocked: boolean
  value: ThinkingCanvasV2 | null
}

export type MappingSavedReceipt = { attempt: Attempt; operations: Operation[] }
export type MappingUpdate = {
  status: 'updated' | 'failed'
  canvas: ThinkingCanvasV2
  unresolved: BindingCandidate[]
  detail?: string
}

export type FocusDesignAction = (project: string, cardIds: readonly string[]) => void

const WRITING_LABEL: Record<WritingField, string> = {
  purpose: '写作目的',
  argument: '论证安排',
  conditions: '适用条件',
  template: '模板要求',
  omission: '详略（不得写入正文）',
  aside: '正文外细节（不得写入正文）',
}

function fileKey(workspace: string, path: string): string {
  return JSON.stringify([workspace, path])
}

export function matchBinding(binding: SourceBinding, file: ObservedSource | null): BindingMatch {
  if (!file) return { status: 'missing', bindingId: binding.id, reason: 'file-missing' }
  const identity = { workspace: binding.workspace, path: binding.path, digest: binding.digest }
  if (file.workspace !== binding.workspace || file.path !== binding.path) {
    return { status: 'missing', bindingId: binding.id, reason: 'file-missing' }
  }
  if (file.digest === binding.digest && file.content.slice(binding.start, binding.end) === binding.quote) {
    return { status: 'exact', bindingId: binding.id, cardId: '', identity, range: { start: binding.start, end: binding.end }, quote: binding.quote }
  }
  const starts = quoteOccurrences(file.content, binding.quote)
  if (starts.length === 0) {
    return {
      status: 'candidates',
      candidates: [{ bindingId: binding.id, cardId: '', identity, quote: binding.quote, reason: file.digest === binding.digest ? 'quote-absent' : 'changed', observedDigest: file.digest }],
    }
  }
  if (starts.length === 1) {
    const start = starts[0]
    return {
      status: 'candidates',
      candidates: [{
        bindingId: binding.id, cardId: '', identity, quote: binding.quote,
        reason: file.digest === binding.digest ? 'moved' : 'digest-mismatch',
        observedDigest: file.digest, observedRange: { start, end: start + binding.quote.length },
      }],
    }
  }
  return {
    status: 'candidates',
    candidates: starts.map(start => ({
      bindingId: binding.id, cardId: '', identity, quote: binding.quote, reason: 'duplicate-quote' as const,
      observedDigest: file.digest, observedRange: { start, end: start + binding.quote.length },
    })),
  }
}

export type RelatedExact = { cardId: string; bindingId: string; identity: SourceIdentity; range: { start: number; end: number }; quote: string }
export type RelatedDesign = { exact: RelatedExact[]; candidates: BindingCandidate[] }

/** Locate design cards from a captured source identity. Never uses a line number as the match key.
 * Many-to-many exact matches all stay related; only displaced/changed/duplicate quotes become candidates. */
export function locateRelatedCards(canvas: ThinkingCanvasV2, source: ObservedSource): RelatedDesign {
  const exact: RelatedExact[] = []
  const candidates: BindingCandidate[] = []
  for (const node of canvas.nodes) {
    for (const binding of node.bindings ?? []) {
      if (binding.workspace !== source.workspace || binding.path !== source.path) continue
      const match = matchBinding(binding, source)
      if (match.status === 'exact') {
        exact.push({ cardId: node.id, bindingId: binding.id, identity: match.identity, range: match.range, quote: match.quote })
      } else if (match.status === 'candidates') {
        candidates.push(...match.candidates.map(candidate => ({ ...candidate, cardId: node.id })))
      }
    }
  }
  return { exact, candidates }
}

export function snapshotCards(canvas: ThinkingCanvasV2, cardIds: readonly string[]): DesignCardSnapshot[] {
  const wanted = new Set(cardIds)
  return canvas.nodes.filter(node => wanted.has(node.id)).map(node => ({
    id: node.id,
    title: node.title,
    ...(node.body ? { body: node.body } : {}),
    ...(serializeWriting(node.writing) ? { writing: serializeWriting(node.writing) } : {}),
    bindings: [...(node.bindings ?? [])],
    evidence: [...(node.evidence ?? [])],
  }))
}

export function writingContextFromCards(project: string, canvasDigest: string, cards: DesignCardSnapshot[]): string {
  const lines = [
    `[设计上下文 · 仅本次相关卡片]`,
    `项目： ${project}`,
    `画布： ${CANVAS_PATH}@${canvasDigest}`,
    `规则： 按写作意图安排正文；详略与正文外细节不得抄进论文；证据不足处如实写限制，不要防卫性套话。`,
  ]
  for (const card of cards) {
    lines.push('', `## ${card.title} (${card.id})`)
    if (card.body?.trim()) lines.push(card.body.trim())
    for (const field of WRITING_FIELDS) {
      const value = card.writing?.[field]?.trim()
      if (value) lines.push(`${WRITING_LABEL[field]}： ${value.replace(/\n+/g, ' ')}`)
    }
    for (const binding of card.bindings) {
      lines.push(`对应正文 ${binding.path}@${binding.digest} [${binding.start},${binding.end}]： ${binding.quote.replace(/\s+/g, ' ').slice(0, 240)}`)
    }
    for (const item of card.evidence) {
      const at = item.path ? `${item.path}${item.digest ? `@${item.digest}` : '（版本无法自动校验）'}` : (item.url ?? '')
      lines.push(`证据： ${at}${item.excerpt ? ` — ${item.excerpt.trim().slice(0, 160)}` : ''}`)
    }
  }
  return lines.join('\n') + '\n'
}

export function fingerprintSelectedContext(input: Omit<SelectedContext, 'fingerprint' | 'context'> & { context: string }): string {
  return JSON.stringify({
    project: input.project,
    canvas: input.canvas,
    cardIds: input.cards.map(card => card.id),
    sources: input.sources.map(source => source.anchor),
    evidence: input.evidence,
    context: input.context,
  })
}

function bindingToAnchor(binding: SourceBinding): Anchor {
  return {
    kind: 'text',
    workspace: binding.workspace,
    path: binding.path,
    digest: binding.digest,
    quote: binding.quote,
    target: { kind: 'text', workspace: binding.workspace, path: binding.path, start: binding.start, end: binding.end },
  }
}

function evidenceToAnchor(project: string, item: DesignCardSnapshot['evidence'][number]): Anchor | null {
  if (!item.path || !item.digest) return null
  return {
    kind: 'text',
    workspace: item.workspace || project,
    path: item.path,
    digest: item.digest,
    quote: item.excerpt ?? '',
  }
}

export function buildSelectedContext(project: string, canvasDigest: string, canvas: ThinkingCanvasV2, cardIds: readonly string[]): SelectedContext {
  const cards = snapshotCards(canvas, cardIds)
  const sources = cards.flatMap(card => card.bindings.map(binding => ({ id: binding.id, anchor: bindingToAnchor(binding) })))
  const evidence = cards.flatMap(card => card.evidence.map(item => evidenceToAnchor(project, item)).filter((item): item is Anchor => Boolean(item)))
  const context = writingContextFromCards(project, canvasDigest, cards)
  const selected: Omit<SelectedContext, 'fingerprint'> = {
    project, canvas: { path: CANVAS_PATH, digest: canvasDigest }, cards, sources, evidence, context,
  }
  return { ...selected, fingerprint: fingerprintSelectedContext(selected) }
}

export function assertCurrentContext(gate: LiveCanvasGate, expected: { project: string; digest: string; cardIds: readonly string[] }, files?: ReadonlyMap<string, ObservedSource>): CaptureResult {
  if (gate.project !== expected.project) return { ok: false, reason: 'foreign-project', detail: 'Selected context belongs to another project.' }
  if (!gate.value) return { ok: false, reason: 'missing-canvas', detail: 'No saved canvas is loaded.' }
  if (gate.reviewLocked) return { ok: false, reason: 'review-lock', detail: 'A review write currently holds the canvas.' }
  if (gate.dirty || gate.status === 'unsaved' || gate.status === 'saving' || gate.status === 'new') {
    return { ok: false, reason: 'dirty', detail: 'Unsaved canvas edits cannot be an apply baseline.' }
  }
  if (gate.status === 'conflict') return { ok: false, reason: 'conflict', detail: 'Canvas conflict must be resolved before capture.' }
  if (gate.status !== 'saved') return { ok: false, reason: 'unsaved', detail: `Canvas status ${gate.status} is not a saved baseline.` }
  if (!gate.digest) return { ok: false, reason: 'stale-digest', detail: 'Canvas digest is unavailable.' }
  if (gate.digest !== expected.digest) return { ok: false, reason: 'stale-digest', detail: 'Canvas revision changed after capture.' }
  if (!expected.cardIds.length) return { ok: false, reason: 'empty-selection', detail: 'Select at least one design card.' }
  const missing = expected.cardIds.filter(id => !gate.value!.nodes.some(node => node.id === id))
  if (missing.length) return { ok: false, reason: 'unresolved-binding', detail: `Missing design cards: ${missing.join(', ')}.` }
  if (files) {
    for (const node of gate.value.nodes.filter(item => expected.cardIds.includes(item.id))) {
      for (const binding of node.bindings ?? []) {
        const match = matchBinding(binding, files.get(fileKey(binding.workspace, binding.path)) ?? null)
        if (match.status !== 'exact') return { ok: false, reason: 'unresolved-binding', detail: `Source ${binding.path} is not an exact match for ${node.id}.` }
      }
    }
  }
  return { ok: true, context: buildSelectedContext(expected.project, gate.digest, gate.value, expected.cardIds) }
}

export function captureSelectedContext(gate: LiveCanvasGate, cardIds: readonly string[], files?: ReadonlyMap<string, ObservedSource>): CaptureResult {
  if (!gate.digest || !gate.value) return { ok: false, reason: 'missing-canvas', detail: 'No saved canvas is loaded.' }
  return assertCurrentContext(gate, { project: gate.project, digest: gate.digest, cardIds }, files)
}

/** Projector for D. Shape matches WritingSelection without importing D-owned files. */
export function writingSelectionFromContext(selected: SelectedContext): {
  design: { path: typeof CANVAS_PATH; digest: string; cardIds: string[] }
  sources: { id: string; anchor: Anchor }[]
  evidence: Anchor[]
  context: string
} {
  return {
    design: { path: CANVAS_PATH, digest: selected.canvas.digest, cardIds: selected.cards.map(card => card.id) },
    sources: selected.sources,
    evidence: selected.evidence,
    context: selected.context,
  }
}

function confirmBinding(binding: SourceBinding, file: ObservedSource, quote: string): SourceBinding | null {
  const starts = quoteOccurrences(file.content, quote)
  if (starts.length !== 1) return null
  const start = starts[0]
  return { ...binding, digest: file.digest, quote, start, end: start + quote.length }
}

export function updateBindingsFromReceipts(
  canvas: ThinkingCanvasV2,
  saved: MappingSavedReceipt[],
  files: ReadonlyMap<string, ObservedSource>,
): MappingUpdate {
  let next = canvas
  const unresolved: BindingCandidate[] = []
  for (const item of saved) {
    const outcome = item.attempt.outcome
    if (outcome !== 'applied' && outcome !== 'reverted') {
      return { status: 'failed', canvas, unresolved, detail: 'Mapping only accepts genuine applied/reverted saves.' }
    }
    if (!item.attempt.afterDigest) {
      return { status: 'failed', canvas, unresolved, detail: `Save ${item.attempt.id} has no after digest.` }
    }
    const file = files.get(fileKey(item.attempt.workspace, item.attempt.path))
    if (!file || file.digest !== item.attempt.afterDigest) {
      return { status: 'failed', canvas, unresolved, detail: `Observed file does not match save ${item.attempt.path}@${item.attempt.afterDigest}.` }
    }
    const replacements = item.operations.filter(operation => operation.target.kind === 'text' && operation.target.path === item.attempt.path)
    for (const node of next.nodes) {
      for (const binding of node.bindings ?? []) {
        if (binding.workspace !== item.attempt.workspace || binding.path !== item.attempt.path) continue
        const replaced = replacements.find(operation => operation.before === binding.quote)
        const quote = replaced ? replaced.after : binding.quote
        const confirmed = confirmBinding(binding, file, quote)
        if (confirmed) next = replaceNodeBinding(next, node.id, confirmed)
        else {
          unresolved.push({
            bindingId: binding.id, cardId: node.id,
            identity: { workspace: binding.workspace, path: binding.path, digest: binding.digest },
            quote, reason: quoteOccurrences(file.content, quote).length > 1 ? 'duplicate-quote' : 'changed',
            observedDigest: file.digest,
          })
        }
      }
    }
  }
  if (unresolved.length) return { status: 'failed', canvas: next, unresolved, detail: 'Some bindings need explicit correction.' }
  return { status: 'updated', canvas: next, unresolved }
}

export function bindSourceSelection(canvas: ThinkingCanvasV2, cardId: string, source: ObservedSource, start: number, end: number): ThinkingCanvasV2 {
  const quote = source.content.slice(start, end)
  return addNodeBinding(canvas, cardId, {
    id: crypto.randomUUID(),
    workspace: source.workspace,
    path: source.path,
    digest: source.digest,
    quote,
    start,
    end,
  })
}

export function confirmCandidate(canvas: ThinkingCanvasV2, candidate: BindingCandidate, observed: ObservedSource): ThinkingCanvasV2 {
  if (!candidate.observedRange) return canvas
  const quote = observed.content.slice(candidate.observedRange.start, candidate.observedRange.end)
  return replaceNodeBinding(canvas, candidate.cardId, {
    id: candidate.bindingId,
    workspace: observed.workspace,
    path: observed.path,
    digest: observed.digest,
    quote,
    start: candidate.observedRange.start,
    end: candidate.observedRange.end,
  })
}
