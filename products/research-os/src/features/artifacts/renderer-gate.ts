import { useSyncExternalStore } from 'react'
import { APIError } from '../../lib/api'

/**
 * The research service does not advertise artifact-renderer availability in `/capabilities`
 * (only LaTeX is reported). The UI therefore never assumes the renderer is present or absent:
 * it learns it from a definitive refusal of an explicit build request and says so, with the time
 * it was observed. Anything else (network loss, 5xx without the refusal marker, timeouts) stays
 * "uncertain" — the request may or may not have been recorded, and the ledger must be re-read.
 */
export type BuildRefusal =
  | { kind: 'renderer-unavailable'; detail: string }
  | { kind: 'uncertain'; detail: string }

const UNAVAILABLE = /artifact renderer unavailable|latex_builder_unavailable|isolated artifact worker|requires Bubblewrap/i

export function classifyBuildRefusal(error: unknown): BuildRefusal {
  const detail = error instanceof Error ? error.message : String(error)
  // A 503, or a refusal naming the missing renderer, is the backend saying no build was started.
  if (error instanceof APIError && (error.status === 503 || UNAVAILABLE.test(detail))) return { kind: 'renderer-unavailable', detail }
  return { kind: 'uncertain', detail }
}

export type RendererObservation = { state: 'unknown' } | { state: 'unavailable'; detail: string; at: string } | { state: 'rendered'; at: string }

let observation: RendererObservation = { state: 'unknown' }
const listeners = new Set<() => void>()
const publish = (next: RendererObservation) => { observation = next; for (const listener of listeners) listener() }

/** Record what an explicit build request actually showed. Session-scoped: a reload goes back to unknown. */
export function observeRenderer(next: { unavailable: string } | { rendered: true }, at = new Date()) {
  publish('unavailable' in next ? { state: 'unavailable', detail: next.unavailable, at: at.toISOString() } : { state: 'rendered', at: at.toISOString() })
}
export function rendererObservation(): RendererObservation { return observation }
export function resetRendererObservation() { publish({ state: 'unknown' }) }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export function useRendererObservation(): RendererObservation { return useSyncExternalStore(subscribe, rendererObservation, rendererObservation) }
