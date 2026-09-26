import { useCallback, useEffect, useState } from 'react'
import { APIError, request } from '../../lib/api'
import { readPreference, writePreference } from '../../lib/storage'
import { newContextItem, type ContextItem } from '../projects/context-model'
import { DEFAULT_SEED_PATHS, extractPolicySection, FIGURE_STYLE_PACK, FIGURE_STYLE_REF, figureStyleBrief, parseFigstyle, parseTexColors, type Figstyle, type PolicySection, type SeedPaths, type TexColor } from './figure-style'

/* Reads the paper's own policy / figstyle / preamble through the existing workspace file API (no backend change).
   A file that is not there is reported as missing with its expected path — nothing is invented in its place. */
export type SeedFile<T> = { status: 'missing'; path: string } | { status: 'error'; path: string; message: string } | { status: 'ready'; path: string; digest?: string; value: T }
export type FigureStyleSeed = { policy: SeedFile<PolicySection | null>; figstyle: SeedFile<Figstyle>; colors: SeedFile<TexColor[]> }

const PREF = (project: string) => `research-ui-figure-style-seed:${project}`
export function readSeedPaths(project: string): SeedPaths {
  try {
    const raw = JSON.parse(readPreference(PREF(project)) || 'null')
    if (raw && typeof raw === 'object') return Object.fromEntries(Object.entries(DEFAULT_SEED_PATHS).map(([k, v]) => [k, typeof raw[k] === 'string' && raw[k].trim() ? raw[k].trim().replace(/^\/+/, '') : v])) as SeedPaths
  } catch { /* default */ }
  return { ...DEFAULT_SEED_PATHS }
}

const filePath = (workspace: string, path: string) => `/workspaces/${encodeURIComponent(workspace)}/files/${path.split('/').map(encodeURIComponent).join('/')}`
async function readSeedFile<T>(project: string, path: string, parse: (text: string) => T, signal?: AbortSignal): Promise<SeedFile<T>> {
  try {
    const file = await request<{ content: string; digest?: string }>(filePath(project, path), { signal })
    return { status: 'ready', path, digest: file.digest || undefined, value: parse(file.content) }
  } catch (error) {
    if (error instanceof APIError && error.status === 404) return { status: 'missing', path }
    if (signal?.aborted) throw error
    return { status: 'error', path, message: error instanceof Error ? error.message : String(error) }
  }
}

export async function loadFigureStyleSeed(project: string, paths: SeedPaths = readSeedPaths(project), signal?: AbortSignal): Promise<FigureStyleSeed> {
  const [policy, figstyle, colors] = await Promise.all([
    readSeedFile(project, paths.policy, text => extractPolicySection(text), signal),
    readSeedFile(project, paths.figstyle, parseFigstyle, signal),
    readSeedFile(project, paths.preamble, parseTexColors, signal),
  ])
  return { policy, figstyle, colors }
}

/** The pack as a versioned Chat reference. With a readable policy seed, the reference tracks that file's digest
 *  (so "Manage references" can tell when the paper's policy changed); without one it is pinned to the pack version. */
export function figureStyleContextItem(project: string, seed?: FigureStyleSeed | null): ContextItem {
  const policy = seed?.policy.status === 'ready' && seed.policy.value ? seed.policy : null
  const body = figureStyleBrief(FIGURE_STYLE_PACK, policy ? { path: policy.path, digest: policy.digest, heading: policy.value!.heading } : null)
  return newContextItem({
    project, kind: 'source', label: `Figure style v${FIGURE_STYLE_PACK.version}`, ref: FIGURE_STYLE_REF, body,
    excerpt: 'TikZ + matplotlib/figstyle only; DrawIO and MATLAB retired. 3.5 / 7.16 in, 8 pt, fonts embedded, no Type 3.',
    ...(policy ? { digest: policy.digest, source: { id: FIGURE_STYLE_REF, path: policy.path, workspace: project, digest: policy.digest } } : { digest: FIGURE_STYLE_REF }),
  })
}

export function useFigureStyleSeed(project: string) {
  const [paths, setPathsState] = useState<SeedPaths>(() => readSeedPaths(project))
  const [seed, setSeed] = useState<FigureStyleSeed | 'loading' | { error: string }>('loading')
  const [revision, setRevision] = useState(0)
  useEffect(() => setPathsState(readSeedPaths(project)), [project])
  const setPaths = useCallback((next: SeedPaths) => { writePreference(PREF(project), JSON.stringify(next)); setPathsState(next) }, [project])
  useEffect(() => {
    if (!project) return
    const c = new AbortController()
    setSeed('loading')
    loadFigureStyleSeed(project, paths, c.signal).then(s => { if (!c.signal.aborted) setSeed(s) }, error => { if (!c.signal.aborted) setSeed({ error: error instanceof Error ? error.message : String(error) }) })
    return () => c.abort()
  }, [project, paths, revision])
  return { paths, setPaths, seed: project ? seed : null, reload: () => setRevision(n => n + 1) }
}
