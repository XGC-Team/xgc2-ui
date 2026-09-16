/** Serialized compare-and-swap saves, independent of React and of the file's content schema. */
export type FileState<T> = {
  value: T | null
  status: 'loading' | 'new' | 'saved' | 'unsaved' | 'saving' | 'load-error' | 'invalid' | 'save-error' | 'conflict'
  dirty: boolean
  error: string
}
export type FileWrite = { content: string; expectedDigest?: string; createOnly?: true }
export type FilePort = {
  read: (signal: AbortSignal) => Promise<{ content: string; digest: string }>
  write: (input: FileWrite) => Promise<{ digest: string }>
}
export type FileSessionOptions<T> = {
  port: FilePort
  decode: (text: string) => T
  encode: (value: T) => string
  empty: () => T
  changed: (state: FileState<T>) => void
  schedule?: (run: () => void) => () => void
}
export function initialFileState<T>(): FileState<T> {
  return { value: null, status: 'loading', dirty: false, error: '' }
}
function statusOf(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : undefined
}
function messageOf(error: unknown): string { return error instanceof Error ? error.message : String(error) }

export function createFileSession<T>(options: FileSessionOptions<T>) {
  let state = initialFileState<T>()
  let digest: string | undefined
  let cancelScheduled: (() => void) | undefined
  let loading: AbortController | undefined
  let writing: Promise<void> | undefined
  let disposed = false
  const schedule = options.schedule ?? (run => { const timer = setTimeout(run, 600); return () => clearTimeout(timer) })
  const publish = (next: FileState<T>) => {
    if (disposed) return
    state = next
    options.changed(next)
  }
  const cancel = () => { cancelScheduled?.(); cancelScheduled = undefined }
  const queue = () => {
    cancel()
    if (disposed || writing || state.status !== 'unsaved') return
    cancelScheduled = schedule(() => { cancelScheduled = undefined; void save() })
  }

  async function load(discardLocal = false): Promise<boolean> {
    // Reload never silently discards edits and cannot race an in-flight save.
    if (disposed || writing || (state.dirty && !discardLocal)) return false
    cancel(); loading?.abort()
    const controller = new AbortController()
    loading = controller
    digest = undefined
    publish(initialFileState<T>())
    try {
      const record = await options.port.read(controller.signal)
      if (disposed || controller.signal.aborted) return false
      if (typeof record?.content !== 'string' || typeof record.digest !== 'string' || !record.digest) throw new Error('Invalid file response.')
      let value: T
      try { value = options.decode(record.content) }
      catch (error) { publish({ value: null, status: 'invalid', dirty: false, error: messageOf(error) }); return false }
      digest = record.digest
      publish({ value, status: 'saved', dirty: false, error: '' })
      return true
    } catch (error) {
      if (disposed || controller.signal.aborted) return false
      if (statusOf(error) === 404) {
        // Missing is editable but is not saved/created until the user makes a change.
        publish({ value: options.empty(), status: 'new', dirty: false, error: '' })
        return true
      }
      publish({ value: null, status: 'load-error', dirty: false, error: messageOf(error) })
      return false
    }
  }

  function edit(update: (value: T) => T): void {
    if (disposed || state.value === null) return
    const next = update(state.value)
    if (next === state.value) return
    const blocked = state.status === 'save-error' || state.status === 'conflict'
    publish({ ...state, value: next, dirty: true, status: blocked ? state.status : writing ? 'saving' : 'unsaved', error: blocked ? state.error : '' })
    queue()
  }

  function save(): Promise<void> {
    cancel()
    if (writing) return writing
    if (disposed || state.value === null || !state.dirty || state.status === 'conflict') return Promise.resolve()
    let content: string
    try { content = options.encode(state.value) }
    catch (error) { publish({ ...state, status: 'save-error', error: messageOf(error) }); return Promise.resolve() }
    const input: FileWrite = { content, ...(digest ? { expectedDigest: digest } : { createOnly: true as const }) }
    publish({ ...state, status: 'saving', error: '' })
    // Start after writing is assigned, including when a test port resolves immediately.
    writing = Promise.resolve().then(() => {
      // Cleanup may run before this microtask. Do not dispatch a new write after disposal.
      // A request already handed to the port is not cancelled or rolled back here.
      if (disposed) return
      return options.port.write(input)
    }).then(result => {
      if (disposed) return
      if (typeof result?.digest !== 'string' || !result.digest) throw new Error('Missing saved file revision.')
      digest = result.digest
      const dirty = state.value !== null && options.encode(state.value) !== content
      publish({ ...state, dirty, status: dirty ? 'unsaved' : 'saved', error: '' })
    }).catch(error => {
      if (disposed) return
      const status = statusOf(error)
      publish({ ...state, dirty: true, status: status === 409 || status === 412 ? 'conflict' : 'save-error', error: messageOf(error) })
    }).finally(() => { writing = undefined; queue() })
    return writing
  }

  return {
    load, edit, save,
    snapshot: () => state,
    dispose: () => { disposed = true; cancel(); loading?.abort() },
  }
}
