import { semanticCanvas, type Scope } from './review-model.ts'
import { CONTENT_PATH } from '../content/content-model.ts'
export type FileObservation = Scope & { id: string; at: string; path: string; beforeDigest?: string; afterDigest: string; semantic: boolean; origin: 'editor' | 'review' }
let observations: readonly FileObservation[] = []
const listeners = new Set<() => void>()
export const subscribeObservations = (fn: () => void) => { listeners.add(fn); return () => {listeners.delete(fn)} }
export const observedFiles = () => observations
export function observeSavedFile(scope: Scope, path: string, before: {content: string; digest: string} | null, after: {content: string; digest: string}, origin: FileObservation['origin']): void {
  if (typeof after.digest !== 'string' || !after.digest || before?.digest === after.digest) return
  let semantic = true
  if (path === CONTENT_PATH && before) {
    try { semantic = semanticCanvas(before.content) !== semanticCanvas(after.content) } catch { /* Unknown comparison is never marked safe. */ }
  }
  observations = [...observations.slice(-99), {...scope,id:crypto.randomUUID(),at:new Date().toISOString(),path,beforeDigest:before?.digest,afterDigest:after.digest,semantic,origin}]
  listeners.forEach(fn=>fn())
}
