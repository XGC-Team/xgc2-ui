/** Review records are product data, not Agent execution claims. Never infer semantic links from layout. */
export const REVIEW_PATH = 'research-reviews.json'
export type Scope = { projectId: string; workspace: string }
export type Target = { workspace: string; path: string } & (
  | { kind: 'text'; start: number; end: number }
  | { kind: 'canvas'; objectId: string; field: 'title' | 'body' }
  | { kind: 'block'; objectId: string; blockId: string; field: string; artifact: string }
)
export type Rect = { x: number; y: number; width: number; height: number }
export type Anchor = {
  kind: 'pdf' | 'text' | 'canvas' | 'block'; workspace: string; path: string; digest: string; quote: string
  target?: Target; buildId?: string; page?: number; rects?: Rect[]; origin?: 'external' | 'project-build'
}
export type Feedback = { id: string; author: string; at: string; body: string; anchor: Anchor }
export type Operation = {
  id: string; target: Target; baseDigest: string; before: string; after: string; reason: string
  evidence: Anchor[]; dependsOn: string[]; impacts: string[]
}
export type Proposal = {
  id: string; author: string; at: string; title: string; feedback: Feedback; operations: Operation[]
  promotion?: { destination: 'global-knowledge'; scope: string; conditions: string; verification: string; decision: 'pending' | 'approved-scope' | 'rejected'; decidedBy?: string; decidedAt?: string }
}
export type Outcome = 'pending' | 'applied' | 'reverted' | 'conflict' | 'not-written' | 'uncertain' | 'observed-applied' | 'observed-not-written'
export type Attempt = {
  id: string; proposalId: string; operationIds: string[]; mode: 'apply' | 'revert'; at: string; actor: string
  workspace: string; path: string; beforeDigest: string; beforeHash: string; afterHash: string
  outcome: Outcome; afterDigest?: string; detail?: string; finishedAt?: string
}
export type Decision = { id: string; proposalId: string; operationIds: string[]; at: string; actor: string; reason: string; kind: 'reject' }
export type ReviewBook = Scope & { version: 1; proposals: Proposal[]; attempts: Attempt[]; decisions: Decision[]; notDispatched?: { id: string; proposalId: string; operationIds: string[]; at: string; actor: string; mode: 'apply' | 'revert'; detail: string }[] }
export type FileRecord = { content: string; digest: string }
export const fileKey = (target: { workspace: string; path: string }) => JSON.stringify([target.workspace, target.path])
export const scopeKey = (scope: Scope) => JSON.stringify([scope.projectId, scope.workspace])
export function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message) }
export const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string'
const nonempty = (v: unknown): v is string => text(v) && !!v.trim()
const id = (v: unknown): v is string => text(v) && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(v)
export const validPath = (v: unknown): v is string => nonempty(v) && !/[\\\u0000-\u001f\u007f]/.test(v) && v.split('/').every(p => p && p !== '.' && p !== '..')
export const date = (v: unknown): boolean => text(v) && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v))
export const now = () => new Date().toISOString()
export const uid = () => crypto.randomUUID()
export function validateTarget(t: unknown): asserts t is Target {
  check(record(t) && nonempty(t.workspace) && validPath(t.path), 'Invalid target location.')
  if (t.kind === 'text') {
    check(/\.(tex|md|txt|bib)$/i.test(t.path) && !t.path.split('/').some(p => p.startsWith('.')), 'Only explicit research text files are editable.')
    check(Number.isSafeInteger(t.start) && Number.isSafeInteger(t.end) && Number(t.start) >= 0 && Number(t.end) > Number(t.start), 'Select a nonempty source range.')
  } else if (t.kind === 'canvas') {
    check(t.path === 'thinking.canvas.json' && id(t.objectId) && ['title', 'body'].includes(String(t.field)), 'Invalid canvas field.')
  } else {
    check(t.kind === 'block' && t.path === 'research-drafts.json' && id(t.objectId) && id(t.blockId) && nonempty(t.field) && nonempty(t.artifact), 'Invalid artifact block.')
  }
}
export function validateAnchor(a: unknown): asserts a is Anchor {
  check(record(a) && ['pdf', 'text', 'canvas', 'block'].includes(String(a.kind)) && nonempty(a.workspace) && validPath(a.path) && nonempty(a.digest) && text(a.quote), 'A feedback anchor needs its observed version.')
  if (a.target !== undefined) { validateTarget(a.target); check(a.target.kind === a.kind && a.target.workspace === a.workspace && a.target.path === a.path, 'Anchor/target mismatch.') }
  if (a.kind === 'pdf') {
    check(a.origin === 'external' || a.origin === 'project-build', 'PDF origin must be explicit.')
    check(Number.isSafeInteger(a.page) && Number(a.page) > 0 && (a.origin !== 'project-build' || nonempty(a.buildId)), 'Invalid PDF build/page.')
    check(a.rects === undefined || (Array.isArray(a.rects) && a.rects.every(r => record(r) && ['x', 'y', 'width', 'height'].every(k => typeof r[k] === 'number' && Number.isFinite(r[k]) && r[k] >= 0 && r[k] <= 1) && Number(r.x) + Number(r.width) <= 1.001 && Number(r.y) + Number(r.height) <= 1.001)), 'Invalid PDF rectangles.')
  }
}
export function validateProposal(p: unknown, scope: Scope): asserts p is Proposal {
  check(record(p) && id(p.id) && nonempty(p.author) && date(p.at) && nonempty(p.title) && record(p.feedback), 'Invalid proposal metadata.')
  const f = p.feedback
  check(id(f.id) && nonempty(f.author) && date(f.at) && nonempty(f.body), 'Invalid feedback.')
  validateAnchor(f.anchor)
  check(Array.isArray(p.operations) && p.operations.length <= 100, 'Invalid operation list.')
  const ids = new Set<string>()
  for (const o of p.operations) {
    check(record(o) && id(o.id) && !ids.has(o.id), 'Duplicate operation identity.'); ids.add(o.id)
    validateTarget(o.target)
    check(o.target.workspace === scope.workspace, 'Cross-workspace writes are not supported; create a scoped proposal.')
    check(nonempty(o.baseDigest) && text(o.before) && text(o.after) && o.before !== o.after && nonempty(o.reason), 'A change needs a baseline, difference and reason.')
    check(Array.isArray(o.evidence) && o.evidence.length > 0, 'Evidence/source is required.'); o.evidence.forEach(validateAnchor)
    check(Array.isArray(o.dependsOn) && new Set(o.dependsOn).size === o.dependsOn.length && Array.isArray(o.impacts) && o.impacts.every(text), 'Invalid dependencies/impact scope.')
  }
  const visiting = new Set<string>(), done = new Set<string>()
  const visit = (key: string) => {
    check(!visiting.has(key), 'Cyclic operation dependencies.'); if (done.has(key)) return
    const o = (p.operations as Operation[]).find(o => o.id === key); check(o, 'Missing dependency.')
    visiting.add(key); for (const d of o.dependsOn) { check(d !== key && ids.has(d), 'Missing/self dependency.'); visit(d) }
    visiting.delete(key); done.add(key)
  }
  ids.forEach(visit)
  if (p.promotion !== undefined) {
    const k = p.promotion
    check(record(k) && k.destination === 'global-knowledge' && nonempty(k.scope) && nonempty(k.conditions) && nonempty(k.verification) && ['pending', 'approved-scope', 'rejected'].includes(String(k.decision)), 'Knowledge review requires destination, conditions and verification scope.')
  }
  check(p.operations.length > 0 || p.promotion !== undefined, 'Add an operation or an explicit knowledge review.')
}
export function emptyReviewBook(scope: Scope): ReviewBook {
  check(nonempty(scope.projectId) && nonempty(scope.workspace), 'A project and workspace are required.')
  return { ...scope, version: 1, proposals: [], attempts: [], decisions: [] }
}
export function parseReviewBook(content: string, scope: Scope): ReviewBook {
  const b: unknown = JSON.parse(content)
  check(record(b) && b.version === 1 && b.projectId === scope.projectId && b.workspace === scope.workspace && Array.isArray(b.proposals) && Array.isArray(b.attempts) && Array.isArray(b.decisions), 'Unsupported, damaged or foreign review journal.')
  const ids = new Set<string>()
  for (const p of b.proposals) { validateProposal(p, scope); check(!ids.has(p.id), 'Duplicate proposal.'); ids.add(p.id) }
  const attemptIds = new Set<string>()
  for (const a of b.attempts) {
    check(record(a) && id(a.id) && !attemptIds.has(a.id) && ids.has(String(a.proposalId)) && ['apply', 'revert'].includes(String(a.mode)) && date(a.at) && nonempty(a.actor), 'Invalid attempt.')
    attemptIds.add(a.id)
    check(['pending', 'applied', 'reverted', 'conflict', 'not-written', 'uncertain', 'observed-applied', 'observed-not-written'].includes(String(a.outcome)), 'Unknown outcome.')
    check(a.workspace === scope.workspace && validPath(a.path) && nonempty(a.beforeDigest) && nonempty(a.beforeHash) && nonempty(a.afterHash), 'Attempt lacks its write-ahead baseline.')
    const p = b.proposals.find(p => p.id === a.proposalId) as Proposal
    check(Array.isArray(a.operationIds) && a.operationIds.length > 0 && new Set(a.operationIds).size === a.operationIds.length && a.operationIds.every(i => p.operations.some(o => o.id === i && fileKey(o.target) === fileKey(a as unknown as Attempt))), 'Attempt has unknown operations or multiple files.')
    if (['applied', 'reverted', 'observed-applied'].includes(a.outcome as string)) check(nonempty(a.afterDigest), 'Successful result lacks a saved revision.')
  }
  for (const d of b.decisions) {
    check(record(d) && id(d.id) && ids.has(String(d.proposalId)) && d.kind === 'reject' && date(d.at) && nonempty(d.actor) && nonempty(d.reason) && Array.isArray(d.operationIds), 'Invalid decision.')
    const p = b.proposals.find(p => p.id === d.proposalId) as Proposal
    check(d.operationIds.length > 0 && new Set(d.operationIds).size === d.operationIds.length && d.operationIds.every(i => p.operations.some(o => o.id === i)), 'Decision references missing operations.')
  }
  if (b.notDispatched !== undefined) check(Array.isArray(b.notDispatched) && b.notDispatched.every(e => record(e) && id(e.id) && ids.has(String(e.proposalId)) && Array.isArray(e.operationIds) && date(e.at) && nonempty(e.actor) && nonempty(e.detail) && ['apply', 'revert'].includes(String(e.mode))), 'Invalid preflight record.')
  return b as ReviewBook
}
export function serializeReviewBook(b: ReviewBook) { const s = JSON.stringify(b, null, 2) + '\n'; parseReviewBook(s, b); return s }
export function operationState(book: ReviewBook, proposalId: string, operationId: string): string {
  if (book.decisions.some(d => d.proposalId === proposalId && d.operationIds.includes(operationId))) return 'rejected'
  let state = 'review'
  for (const a of book.attempts.filter(a => a.proposalId === proposalId && a.operationIds.includes(operationId))) {
    if (['pending', 'uncertain'].includes(a.outcome)) return 'uncertain'
    if (a.outcome === 'applied' || a.outcome === 'observed-applied') state = a.mode === 'apply' ? 'applied' : 'reverted'
    if (a.outcome === 'reverted') state = 'reverted'
    if (a.mode === 'apply' && ['conflict', 'not-written', 'observed-not-written'].includes(a.outcome)) state = a.outcome
  }
  return state
}
/** Dependencies are review groups: do not allow a selection to split either side of a dependency. */
export function dependencyClosure(p: Proposal, selected: readonly string[]): string[] {
  const result = new Set(selected)
  check(selected.every(i => p.operations.some(o => o.id === i)), 'Unknown selection.')
  let changed = true
  while (changed) { changed = false; for (const o of p.operations) for (const d of o.dependsOn) if (result.has(o.id) || result.has(d)) for (const i of [o.id, d]) if (!result.has(i)) { result.add(i); changed = true } }
  return [...result]
}
export function selectedGroups(p: Proposal, ids: string[]): Operation[][] {
  check(ids.length > 0 && new Set(ids).size === ids.length, 'Select distinct operations.')
  check(dependencyClosure(p, ids).length === ids.length, 'Select the whole dependency group.')
  const selected = p.operations.filter(o => ids.includes(o.id))
  for (const o of selected) for (const d of o.dependsOn) check(fileKey(o.target) === fileKey(p.operations.find(x => x.id === d)!.target), 'Cross-file dependencies are preview-only: there is no transaction API.')
  const groups = new Map<string, Operation[]>()
  for (const o of selected) groups.set(fileKey(o.target), [...(groups.get(fileKey(o.target)) || []), o])
  return [...groups.values()]
}
export async function fingerprint(content: string): Promise<string> {
  return 'sha256:' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content)))].map(b => b.toString(16).padStart(2, '0')).join('')
}
export function semanticCanvas(content: string): string {
  const value = JSON.parse(content)
  return JSON.stringify({ nodes: value.nodes.map((n: Record<string, unknown>) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, ref: n.ref, anchor: n.anchor })).sort((a: {id: string}, b: {id: string}) => a.id.localeCompare(b.id)), edges: value.edges })
}
