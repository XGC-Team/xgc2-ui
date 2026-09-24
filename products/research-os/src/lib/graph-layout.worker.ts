/// <reference lib="webworker" />
import { createSim, packPositions, stepWithin, type SimInit, type SimNode } from './graph-sim'
import type { Simulation } from 'd3-force'

/* Layout off the main thread: ticks run here in ~10ms batches; positions go back as transferable arrays. */
type In = { type: 'init'; init: SimInit; quiet: boolean } | { type: 'drag'; i: number; x: number; y: number } | { type: 'release'; i: number } | { type: 'reheat'; alpha: number } | { type: 'stop' }
let state: { sim: Simulation<SimNode, undefined>; nodes: SimNode[]; quiet: boolean } | null = null
let timer: ReturnType<typeof setTimeout> | undefined

const loop = () => {
  timer = undefined
  if (!state) return
  const moving = stepWithin(state.sim, state.quiet ? 40 : 10)
  if (!state.quiet || !moving) {
    const positions = packPositions(state.nodes)
    postMessage({ type: 'tick', positions, alpha: state.sim.alpha(), moving }, [positions.buffer])
  }
  if (moving) timer = setTimeout(loop, state.quiet ? 0 : 12)
}
const wake = () => { if (timer === undefined) timer = setTimeout(loop, 0) }

self.onmessage = (event: MessageEvent<In>) => {
  const m = event.data
  if (m.type === 'init') { if (timer) clearTimeout(timer); timer = undefined; state = { ...createSim(m.init), quiet: m.quiet }; wake(); return }
  if (!state) return
  if (m.type === 'drag') { const n = state.nodes[m.i]; if (n) { n.fx = m.x; n.fy = m.y; state.quiet = false; state.sim.alpha(Math.max(state.sim.alpha(), 0.25)); wake() } }
  else if (m.type === 'release') { const n = state.nodes[m.i]; if (n) { n.fx = null; n.fy = null } }
  else if (m.type === 'reheat') { state.sim.alpha(Math.max(state.sim.alpha(), m.alpha)); wake() }
  else if (m.type === 'stop') { if (timer) clearTimeout(timer); timer = undefined; state = null }
}
