import { buildSourceMatch, previewProvenance, type BuildRecord } from '../review/build-provenance'
import type { ThinkingCanvasV2 } from './canvas-model'
import { sourceDesignMatches, type CanvasSourceBinding, type DesignSourceSnapshot } from './design-source'

export type BuildDesignLocation = {
  workspace: string; path: string; line: number
  pdf: Parameters<typeof previewProvenance>[1]
}
/** SyncTeX supplies a location, not semantic ownership. Only the original build/output and exact
 * current source permit positional lookup; otherwise expose file-level candidates for a human. */
export function locateDesignFromBuild(canvas: ThinkingCanvasV2, source: DesignSourceSnapshot, record: BuildRecord | undefined, location: BuildDesignLocation): {
  state: 'verified-source' | 'needs-confirmation'
  exact: CanvasSourceBinding[]
  candidates: CanvasSourceBinding[]
} {
  const candidates = (canvas.sourceBindings ?? []).filter(binding => binding.workspace === location.workspace && binding.path === location.path)
  const lines = source.content.split('\n')
  const valid = source.workspace === location.workspace && source.path === location.path && location.pdf.workspace === location.workspace
    && record && previewProvenance([record], location.pdf).valid
    && buildSourceMatch(record, source.workspace, source.path, source.digest) === 'match'
    && Number.isSafeInteger(location.line) && location.line > 0 && location.line <= lines.length
  if (!valid) return { state: 'needs-confirmation', exact: [], candidates }
  const start = lines.slice(0, location.line - 1).reduce((sum, line) => sum + line.length + 1, 0)
  const end = Math.min(source.content.length, start + Math.max(1, lines[location.line - 1].length))
  const matches = sourceDesignMatches(canvas, source, { start, end })
  return {
    state: 'verified-source',
    exact: matches.filter(match => match.resolution.state === 'exact').map(match => match.binding),
    candidates: matches.filter(match => match.resolution.state !== 'exact').map(match => match.binding),
  }
}
