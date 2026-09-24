import { useCallback, useEffect, useState } from 'react'
import { APIError, request } from '../../lib/api'
import { readPreference, writePreference } from '../../lib/storage'
import { DEFAULT_WRITING_MAP_DIR, parseWritingMap, unitsPathFor, type WritingMap } from './writing-map'

/* Where the canvas reads from, per project: the paper's writing-map folder (project-relative, read through the
   existing workspace file API) or the bundled sample, which is labelled as sample everywhere it shows. */
export type MapSource = { kind: 'project'; dir: string } | { kind: 'sample' }
export type MapState =
  | { status: 'loading' }
  | { status: 'missing'; expected: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; map: WritingMap; unitsPath: string; unitsDigest?: string; sample: boolean }

const PREF = (project: string) => `research-ui-writing-map:${project}`
export const SAMPLE_DIR = '/fixtures/argument-canvas-sample'

export function readSource(project: string): MapSource {
  try { const raw = JSON.parse(readPreference(PREF(project)) || 'null'); if (raw?.kind === 'sample') return { kind: 'sample' }; if (raw?.kind === 'project' && typeof raw.dir === 'string' && raw.dir.trim()) return { kind: 'project', dir: raw.dir.trim().replace(/^\/+|\/+$/g, '') } } catch { /* default */ }
  return { kind: 'project', dir: DEFAULT_WRITING_MAP_DIR }
}

const filePath = (workspace: string, path: string) => `/workspaces/${encodeURIComponent(workspace)}/files/${path.split('/').map(encodeURIComponent).join('/')}`

export function useWritingMap(project: string) {
  const [source, setSourceState] = useState<MapSource>(() => readSource(project))
  const [state, setState] = useState<MapState>({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  useEffect(() => setSourceState(readSource(project)), [project])
  const setSource = useCallback((next: MapSource) => { writePreference(PREF(project), JSON.stringify(next)); setSourceState(next) }, [project])
  useEffect(() => {
    const c = new AbortController(), signal = c.signal
    setState({ status: 'loading' })
    void (async () => {
      if (source.kind === 'sample') {
        const [index, units] = await Promise.all(['index.json', 'units.jsonl'].map(async name => { const r = await fetch(`${SAMPLE_DIR}/${name}`, { signal }); if (!r.ok) throw new Error(`Sample ${name} is unavailable (${r.status}).`); return r.text() }))
        return { status: 'ready', map: parseWritingMap(index, units), unitsPath: `${SAMPLE_DIR}/units.jsonl`, sample: true } as MapState
      }
      if (!project) return { status: 'missing', expected: `<project>/${source.dir}/index.json` } as MapState
      const read = async (path: string) => {
        try { return await request<{ content: string; digest: string }>(filePath(project, path), { signal }) }
        catch (error) { if (error instanceof APIError && error.status === 404) return null; throw error }
      }
      const indexPath = `${source.dir}/index.json`
      const index = await read(indexPath)
      if (!index) return { status: 'missing', expected: `${project}/${indexPath}` } as MapState
      const indexMap = parseWritingMap(index.content, '')
      const unitsPath = unitsPathFor(source.dir, indexMap.index)
      const units = await read(unitsPath)
      if (!units) return { status: 'missing', expected: `${project}/${unitsPath}` } as MapState
      return { status: 'ready', map: parseWritingMap(index.content, units.content), unitsPath, unitsDigest: units.digest, sample: false } as MapState
    })().then(next => { if (!signal.aborted) setState(next) })
      .catch(error => { if (!signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) }) })
    return () => c.abort()
  }, [project, source, revision])
  return { source, setSource, state, reload: () => setRevision(n => n + 1) }
}
