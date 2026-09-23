import type { FileState } from '../projects/file-session'
import { initialFileState } from '../projects/file-session'
import type { DraftScope } from '../projects/draft-model'
import type { ContentPort } from './content-client'
import { parseContentDocument, serializeContent, type ContentDocument, type ContentSnapshot } from './content-model'
export type ContentState = FileState<ContentDocument> & { digest?: string; migrationState?: ContentSnapshot['migrationState']; legacySources: ContentSnapshot['legacySources']; recovered?: boolean; externalDigest?: string; recoveryError?: string }
export type ContentRecovery = { version: 1; projectId: string; workspace: string; baseDigest: string; document: ContentDocument; updatedAt: string }
export type RecoveryStore = { read: () => ContentRecovery | null; write: (draft: ContentRecovery) => void; clear: () => void }
type Options = { recovery?: RecoveryStore; scope: DraftScope; port: ContentPort; schedule?: (run: () => void) => () => void; saved?: (before: ContentSnapshot | null, after: ContentSnapshot) => void }
export function createContentSession({ scope, port, recovery, schedule = run => { const id = setTimeout(run, 600); return () => clearTimeout(id) }, saved }: Options) {
  let state: ContentState = { ...initialFileState<ContentDocument>(), legacySources: [] }
  let observed: ContentSnapshot | null = null; let request: AbortController | undefined; let cancel: (() => void) | undefined; let writing: Promise<void> | undefined; let loading: Promise<boolean> | undefined; let disposed = false
  const listeners = new Set<() => void>()
  const persist = (next: ContentState) => {
    if (!recovery) return
    try {
      if (next.dirty && next.value && next.digest) recovery.write({ version: 1, projectId: scope.projectId, workspace: scope.workspace, baseDigest: next.digest, document: next.value, updatedAt: new Date().toISOString() })
      else if (!next.dirty && next.status === 'saved') recovery.clear()
    } catch { next.recoveryError = 'Local draft recovery is unavailable. Keep this page open until the changes are saved.' }
  }
  const publish = (next: ContentState) => { if (!disposed) { persist(next); state = next; listeners.forEach(fn => fn()) } }
  const validate = (snapshot: ContentSnapshot) => {
    parseContentDocument(serializeContent(snapshot.document), scope)
    if (!['empty', 'legacy', 'migrated', 'legacy-changed'].includes(snapshot.migrationState) || !Array.isArray(snapshot.legacySources) || (!snapshot.digest && snapshot.migrationState !== 'legacy' && snapshot.migrationState !== 'empty')) throw new Error('Invalid research content snapshot.')
  }
  const loaded = (s: ContentSnapshot) => { validate(s); observed = s; publish({ value: s.document, digest: s.digest || undefined, migrationState: s.migrationState, legacySources: s.legacySources, status: s.digest ? 'saved' : 'new', dirty: false, error: '' }) }
  const queue = () => { cancel?.(); cancel = undefined; if (!writing && state.status === 'unsaved') cancel = schedule(() => { cancel = undefined; void save() }) }
  function load(discardLocal = false): Promise<boolean> {
    if (disposed || writing || state.dirty && !discardLocal) return Promise.resolve(false)
    if (loading) return loading
    if (discardLocal) { try { recovery?.clear() } catch { return Promise.resolve(false) } }
    cancel?.(); request?.abort(); const controller = new AbortController(); request = controller
    publish({ ...state, ...(discardLocal ? { value: null, dirty: false } : {}), status: 'loading', error: '' })
    loading = port.read(controller.signal).then(snapshot => {
      if (disposed || controller.signal.aborted) return false
      validate(snapshot)
      const draft = recovery?.read()
      if (draft) {
        if (draft.version !== 1 || draft.projectId !== scope.projectId || draft.workspace !== scope.workspace || !draft.baseDigest) throw new Error('Invalid local research draft. Export or inspect the local recovery record before discarding it.')
        parseContentDocument(serializeContent(draft.document), scope)
        observed = snapshot
        const conflict = snapshot.digest !== draft.baseDigest
        publish({ value: draft.document, digest: draft.baseDigest, externalDigest: snapshot.digest, migrationState: snapshot.migrationState, legacySources: snapshot.legacySources, recovered: true, dirty: true, status: conflict ? 'conflict' : 'unsaved', error: conflict ? 'Recovered local changes belong to an older saved revision. The external version was kept; inspect the local draft before discarding or reconciling it.' : '' })
        if (!conflict) queue()
      } else loaded(snapshot)
      return true
    }).catch(error => { if (!disposed && !controller.signal.aborted) publish({ ...state, status: 'load-error', error: String(error.message || error) }); return false }).finally(() => { loading = undefined })
    return loading
  }
  function edit(update: (document: ContentDocument) => ContentDocument): boolean {
    if (disposed || !state.value || !state.digest || writing && state.status === 'loading') return false
    const next = update(state.value); if (next === state.value) return true
    parseContentDocument(serializeContent(next), scope)
    const blocked = state.status === 'conflict' || state.status === 'save-error'
    publish({ ...state, value: next, dirty: true, status: blocked ? state.status : writing ? 'saving' : 'unsaved', error: blocked ? state.error : '' }); queue(); return true
  }
  function save(): Promise<void> {
    cancel?.(); cancel = undefined
    if (writing) return writing
    if (disposed || !state.value || !state.digest || !state.dirty || state.status === 'conflict') return Promise.resolve()
    const value = state.value, submitted = serializeContent(value), expectedDigest = state.digest
    publish({ ...state, status: 'saving', error: '' })
    writing = Promise.resolve().then(async () => {
      if (disposed) return
      const result = await port.write(value, expectedDigest); validate(result)
      if (disposed) return
      const dirty = state.value !== null && serializeContent(state.value) !== submitted
      saved?.(observed, result); observed = result
      publish({ ...state, value: dirty ? state.value : result.document, digest: result.digest, migrationState: result.migrationState, legacySources: result.legacySources, dirty, status: dirty ? 'unsaved' : 'saved', error: '' })
    }).catch(error => { publish({ ...state, dirty: true, status: error.status === 409 || error.status === 412 ? 'conflict' : 'save-error', error: String(error.message || error) }) }).finally(() => { writing = undefined; queue() })
    return writing
  }
  async function migrate(): Promise<void> {
    if (disposed || writing || loading || state.dirty || !state.value || state.digest) return
    publish({ ...state, status: 'saving', error: '' })
    writing = port.migrate(state.legacySources).then(snapshot => { if (!disposed) loaded(snapshot) }).catch(error => { publish({ ...state, status: 'load-error', error: String(error.message || error) }) }).finally(() => { writing = undefined })
    await writing
  }
  return { snapshot: () => state, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }, load, edit, save, migrate,
    async flush() { for (let i = 0; i < 100 && (writing || state.dirty); i++) { await save(); if (state.status === 'conflict' || state.status === 'save-error') break } if (state.dirty) throw new Error(state.error || 'Research content still has unsaved changes.') },
    dispose() { disposed = true; cancel?.(); request?.abort(); listeners.clear() },
  }
}
export type ContentSession = ReturnType<typeof createContentSession>
