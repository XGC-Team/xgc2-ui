import { useMemo, useSyncExternalStore } from 'react'
import { manuscriptBuildController, type ManuscriptBuildState } from './manuscript-build.ts'
import type { ManuscriptScope } from './manuscript.ts'
import { defaultManuscriptSourceRoot, manuscriptSourceRoot, subscribeManuscriptBuildSettings } from './manuscript-build-config.ts'
export { notifyManuscriptSourcesSaved } from './manuscript-build.ts'
export type { ManuscriptSourcesSaved, ManuscriptBuildState } from './manuscript-build.ts'
const inactive: ManuscriptBuildState = { phase: 'idle', pdf: null, record: null, capability: null, freshness: 'unknown', error: '' }
const inactiveSnapshot = () => inactive
const noSubscription = () => () => {}
const noAction = async () => {}
const noCancel = () => {}
/** entryPoint must come from the project/selected build, never from an include file.
 * pdf is the last successful candidate, not an instruction to replace a pinned viewer.
 * A owns whether to follow this candidate or preserve a historical/annotated preview.
 */
export function useManuscriptBuild(scope: ManuscriptScope | null, options: { enabled?: boolean } = {}) {
  const workspace = scope?.workspace || '', entryPoint = scope?.entryPoint || ''
  const sourceRoot = useSyncExternalStore(subscribeManuscriptBuildSettings, () => scope?.sourceRoot ?? manuscriptSourceRoot(workspace, entryPoint), () => scope?.sourceRoot ?? defaultManuscriptSourceRoot(entryPoint))
  const controller = useMemo(() => workspace && entryPoint ? manuscriptBuildController({ workspace, entryPoint, sourceRoot }) : null, [workspace, entryPoint, sourceRoot])
  const enabled = !!controller && options.enabled !== false
  const state = useSyncExternalStore(enabled ? controller.subscribe : noSubscription, enabled ? controller.getSnapshot : inactiveSnapshot, inactiveSnapshot)
  return { ...state, sourceRoot, build: enabled ? controller.build : noAction, retry: enabled ? controller.retry : noAction,
    refresh: enabled ? controller.refresh : noAction, cancel: enabled ? controller.cancel : noCancel }
}
