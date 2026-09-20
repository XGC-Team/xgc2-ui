import { check, date, fileKey, fingerprint, record, validateAnchor, type Operation, type Proposal, type Scope } from './review-model.ts'
import type { DesignProposalRequest, DesignProposalResult, NativeWritingCompletion, WritingRecord, WritingResult, WritingSelection } from './writing-contract.ts'

const nonempty = (v: unknown): v is string => typeof v === 'string' && !!v.trim()
const identity = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(v)
const digest = (v: unknown): v is string => typeof v === 'string' && /^sha256:[a-f0-9]{64}$/.test(v)
const exactKeys = (v: Record<string, unknown>, names: string[]) => check(Object.keys(v).every(k => names.includes(k)), 'Unexpected writing protocol field.')
const MAX_TEXT = 262144

export function validateWritingSelection(value: unknown, scope: Scope): asserts value is WritingSelection {
  check(record(value) && record(value.design), 'Writing requires a saved design selection.')
  const d = value.design
  check(d.path === 'thinking.canvas.json' && nonempty(d.digest) && Array.isArray(d.cardIds) && d.cardIds.length > 0 && d.cardIds.length <= 100 && d.cardIds.every(identity) && new Set(d.cardIds).size === d.cardIds.length, 'Invalid design revision/card selection.')
  check(typeof value.context === 'string' && value.context.trim() && value.context.length <= MAX_TEXT, 'Capture the selected design intent and necessary context first.')
  check(Array.isArray(value.sources) && value.sources.length > 0 && value.sources.length <= 100, 'Select explicit manuscript ranges; whole-document inference is forbidden.')
  const ids = new Set<string>(), files = new Map<string, { digest: string; ranges: [number, number][] }>()
  for (const source of value.sources) {
    check(record(source) && identity(source.id) && !ids.has(source.id), 'Duplicate/invalid source selection.'); ids.add(source.id)
    validateAnchor(source.anchor)
    const a = source.anchor, t = a.target
    check(a.kind === 'text' && t?.kind === 'text' && a.workspace === scope.workspace && a.quote.length === t.end - t.start && a.quote.length > 0, 'A source selection needs its exact saved text range.')
    const key = fileKey(a), file = files.get(key) || { digest: a.digest, ranges: [] }
    check(file.digest === a.digest, 'One source file cannot have several baselines.')
    check(file.ranges.every(([start, end]) => t.end <= start || t.start >= end), 'Overlapping source selections must be resolved by the design owner.')
    file.ranges.push([t.start, t.end]); files.set(key, file)
  }
  check(Array.isArray(value.evidence) && value.evidence.length <= 100, 'Invalid selected evidence.')
  value.evidence.forEach(validateAnchor)
}

export function validateWritingResult(value: unknown, proposalId: string, writing: WritingRecord): asserts value is WritingResult {
  check(record(value), 'The native result must be one structured object.')
  exactKeys(value, ['schema', 'proposalId', 'confirmationId', 'fingerprint', 'sources'])
  check(value.schema === 'research-writing/result-v1' && value.proposalId === proposalId && value.confirmationId === writing.confirmation?.id && value.fingerprint === writing.confirmation?.fingerprint, 'The native response belongs to another confirmation.')
  check(Array.isArray(value.sources) && value.sources.length === writing.selection.sources.length, 'Every confirmed source needs an explicit result, including refusals.')
  const seen = new Set<string>()
  for (const result of value.sources) {
    check(record(result) && identity(result.sourceId) && !seen.has(result.sourceId), 'Duplicate/invalid native source result.')
    exactKeys(result, ['sourceId', 'status', 'reason', 'after']); seen.add(result.sourceId)
    const source = writing.selection.sources.find(s => s.id === result.sourceId)
    check(source && ['replace', 'unchanged', 'refused'].includes(String(result.status)) && nonempty(result.reason), 'The native result exceeds the confirmed source scope.')
    if (result.status === 'replace') check(typeof result.after === 'string' && result.after.length <= MAX_TEXT && result.after !== source.anchor.quote, 'A replacement needs an actual local difference.')
    else check(result.after === undefined, 'Unchanged/refused results cannot carry an edit.')
  }
}

export function writingOperations(writing: WritingRecord): Operation[] {
  if (!writing.result) return []
  return writing.result.sources.flatMap(result => {
    if (result.status !== 'replace') return []
    const source = writing.selection.sources.find(s => s.id === result.sourceId)!
    return [{ id: source.id, target: structuredClone(source.anchor.target!), baseDigest: source.anchor.digest,
      before: source.anchor.quote, after: result.after!, reason: result.reason,
      evidence: structuredClone([source.anchor, ...writing.selection.evidence]), dependsOn: [], impacts: [...writing.selection.design.cardIds] }]
  })
}

export function validateWritingRecord(value: unknown, scope: Scope, proposalId: string, operations: Operation[]): asserts value is WritingRecord {
  check(record(value) && value.version === 1 && ['proposed', 'confirmed', 'running', 'ready', 'applying', 'settled', 'cancelled', 'failed', 'uncertain'].includes(String(value.status)), 'Unsupported writing journal record.')
  validateWritingSelection(value.selection, scope)
  if (value.confirmation !== undefined) {
    const c = value.confirmation
    check(record(c) && identity(c.id) && nonempty(c.actor) && date(c.at) && digest(c.fingerprint), 'Invalid writing confirmation.')
  }
  check(value.status === 'proposed' ? value.confirmation === undefined : ['cancelled', 'failed'].includes(String(value.status)) || value.confirmation !== undefined, 'Writing has no explicit confirmation.')
  if (value.execution !== undefined) {
    const e = value.execution
    check(record(e) && identity(e.sessionId) && e.requestKey === (value.confirmation as WritingRecord['confirmation'])?.id && (e.turnId === undefined || /^t_[a-f0-9]{32}$/.test(String(e.turnId))), 'Invalid native writing identity.')
  }
  if (['running', 'ready', 'applying', 'settled', 'uncertain'].includes(String(value.status))) check(value.execution !== undefined, 'Missing native dispatch record.')
  if (value.result !== undefined) {
    check(value.execution !== undefined && (value.execution as Record<string, unknown>).turnId !== undefined && digest(value.resultDigest), 'A result needs its actual native turn and content fingerprint.')
    validateWritingResult(value.result, proposalId, value as unknown as WritingRecord)
  }
  if (['ready', 'applying', 'settled'].includes(String(value.status))) check(value.result !== undefined, 'Missing structured native result.')
  if (value.cancelled !== undefined) check(record(value.cancelled) && nonempty(value.cancelled.actor) && date(value.cancelled.at) && nonempty(value.cancelled.reason), 'Invalid cancellation record.')
  if (value.status === 'cancelled') check(value.cancelled !== undefined, 'Missing cancellation identity.')
  if (value.mapping !== undefined) check(record(value.mapping) && ['pending', 'updated', 'failed'].includes(String(value.mapping.status)) && date(value.mapping.at), 'Invalid mapping update record.')
  check(JSON.stringify(operations) === JSON.stringify(writingOperations(value as unknown as WritingRecord)), 'Source operations must be derived only from the confirmed native result.')
}

/** Fingerprint is an equality binding, not a security token or server permission. */
export async function writingFingerprint(scope: Scope, proposalId: string, selection: WritingSelection): Promise<string> {
  validateWritingSelection(selection, scope)
  // Normalize object key order; array order remains part of the selected intent.
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : record(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
  return fingerprint(JSON.stringify(canonical({ scope, proposalId, selection })))
}

export function writingPrompt(proposalId: string, writing: WritingRecord): string {
  check(writing.confirmation, 'Confirm this saved design before starting native writing.')
  return [
    'Produce scoped manuscript replacements for the explicitly confirmed design below.',
    'Use only the supplied selected source text and design/evidence. Do not write files, edit the canvas, commit Git, or compile. The existing review/CAS owner applies accepted replacements.',
    'Return exactly ONE JSON object, with no markdown fences or commentary:',
    JSON.stringify({ schema: 'research-writing/result-v1', proposalId, confirmationId: writing.confirmation.id, fingerprint: writing.confirmation.fingerprint,
      sources: writing.selection.sources.map(s => ({ sourceId: s.id, status: 'replace | unchanged | refused', reason: 'Explain the choice; use after only for replace', after: 'Replacement of this exact range only' })) }),
    'Include each sourceId exactly once. Refuse unsupported claims explicitly. Never choose another path/range. Body-external details stay outside the manuscript unless this design requests them.',
    JSON.stringify(writing.selection),
  ].join('\n\n')
}

export async function decodeWritingCompletion(proposalId: string, writing: WritingRecord, completion: NativeWritingCompletion) {
  check(completion.sessionId === writing.execution?.sessionId && completion.turnId === writing.execution?.turnId, 'Stale/foreign native writing completion.')
  check(completion.status === 'completed' && !completion.truncated, `Native writing did not produce a complete result (${completion.status}).`)
  check(completion.text.length > 0 && completion.text.length <= MAX_TEXT, 'Native writing result is empty or too large.')
  const result: unknown = JSON.parse(completion.text)
  validateWritingResult(result, proposalId, writing)
  return { result: structuredClone(result), resultDigest: await fingerprint(JSON.stringify(result)) }
}

export function validateDesignRequest(request: DesignProposalRequest) {
  check(identity(request.id) && request.scope.projectId.trim() && request.scope.workspace.trim() && request.context.trim() && request.context.length <= MAX_TEXT, 'Invalid design proposal request.')
  validateAnchor(request.feedback.anchor)
  check(request.targets.length > 0 && request.targets.length <= 100 && new Set(request.targets.map(t => t.id)).size === request.targets.length, 'Capture explicit design targets.')
  const fields = new Set<string>()
  for (const target of request.targets) {
    check(identity(target.id), 'Invalid design target identity.'); validateAnchor(target.anchor)
    const a = target.anchor
    check(a.kind === 'canvas' && a.target?.kind === 'canvas' && a.workspace === request.scope.workspace, 'Design discussion cannot target manuscript text.')
    const key = JSON.stringify(a.target)
    check(!fields.has(key), 'Duplicate design field.'); fields.add(key)
  }
}
export function designProposalPrompt(request: DesignProposalRequest): string {
  validateDesignRequest(request)
  return [
    'Discuss the feedback and propose design-field changes only. Do not write source, files, Git, or builds. This is NOT manuscript authorization.',
    'Return one JSON object without fences: {"schema":"research-writing/design-v1","requestId":"' + request.id + '","title":"Design change","changes":[{"targetId":"captured target id","after":"new design field","reason":"why"}]}',
    'Use only captured targetIds. Design can retain intent, evidence and details intentionally excluded from the body. The user may reject or revise every proposal.',
    JSON.stringify(request),
  ].join('\n\n')
}
export function decodeDesignProposal(request: DesignProposalRequest, completion: NativeWritingCompletion): Proposal {
  validateDesignRequest(request)
  check(completion.status === 'completed' && !completion.truncated && completion.text.length <= MAX_TEXT, 'Design proposal is incomplete or truncated.')
  const value: unknown = JSON.parse(completion.text)
  check(record(value), 'Missing structured design proposal.'); exactKeys(value, ['schema', 'requestId', 'title', 'changes'])
  check(value.schema === 'research-writing/design-v1' && value.requestId === request.id && nonempty(value.title) && Array.isArray(value.changes) && value.changes.length > 0 && value.changes.length <= request.targets.length, 'Invalid design proposal identity.')
  const used = new Set<string>()
  const operations: Operation[] = value.changes.map(change => {
    check(record(change), 'Invalid design change.'); exactKeys(change, ['targetId', 'after', 'reason'])
    check(identity(change.targetId) && !used.has(change.targetId), 'Repeated design target.'); used.add(change.targetId)
    const target = request.targets.find(t => t.id === change.targetId)
    check(target && typeof change.after === 'string' && change.after !== target.anchor.quote && nonempty(change.reason), 'Design proposal is outside the captured scope.')
    return { id: target.id, target: structuredClone(target.anchor.target!), baseDigest: target.anchor.digest, before: target.anchor.quote, after: change.after, reason: change.reason,
      evidence: [structuredClone(request.feedback.anchor)], dependsOn: [], impacts: [] }
  })
  return { id: request.id, author: `native:${completion.sessionId}/${completion.turnId}`, at: new Date().toISOString(), title: (value as unknown as DesignProposalResult).title,
    feedback: structuredClone(request.feedback), operations }
}
