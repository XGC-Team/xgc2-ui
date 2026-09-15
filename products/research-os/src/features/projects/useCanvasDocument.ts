import { useCallback, useEffect, useRef, useState } from 'react'
import { request } from '../../lib/api'
import { CANVAS_PATH, emptyCanvas, parseEditableCanvas, serializeCanvas, type ThinkingCanvas } from './canvas-model'
import { createFileSession, initialFileState, type FileState } from './file-session'

type CanvasSession = ReturnType<typeof createFileSession<ThinkingCanvas>>
export function useCanvasDocument(project: string) {
  const [state, setState] = useState<FileState<ThinkingCanvas>>(() => initialFileState<ThinkingCanvas>())
  const session = useRef<CanvasSession | null>(null)
  useEffect(() => {
    const path = `/workspaces/${encodeURIComponent(project)}/files/${CANVAS_PATH}`
    const current = createFileSession<ThinkingCanvas>({
      port: {
        read: signal => request<{ content: string; digest: string }>(path, { signal }),
        write: input => request<{ digest: string }>(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
      },
      decode: parseEditableCanvas, encode: serializeCanvas, empty: emptyCanvas, changed: setState,
    })
    session.current = current
    void current.load()
    const warn = (event: BeforeUnloadEvent) => {
      if (current.snapshot().dirty) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      current.dispose()
      if (session.current === current) session.current = null
      window.removeEventListener('beforeunload', warn)
    }
  }, [project])
  const mutate = useCallback((update: (canvas: ThinkingCanvas) => ThinkingCanvas) => { session.current?.edit(update) }, [])
  const retry = useCallback(() => { void session.current?.save() }, [])
  const reload = useCallback((discardLocal = false) => { void session.current?.load(discardLocal) }, [])
  return { ...state, mutate, retry, reload }
}
