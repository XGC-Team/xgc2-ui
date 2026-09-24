import type { GraphData } from './graph'
import { createSim, packPositions, stepWithin, type SimInit } from './graph-sim'
import type { Point } from './graph-layout-seed'

/* Layout controller for GraphView: a Web Worker when available, the same simulation on the main thread otherwise
   (tests, old browsers). The renderer only reads node positions; it never waits on the physics. */
export type Layout = {
  drag: (index: number, x: number, y: number) => void
  release: (index: number) => void
  reheat: (alpha: number) => void
  dispose: () => void
  readonly moving: boolean
  readonly worker: boolean
}

export function startLayout(data: GraphData, centers: Point[], options: { warm: boolean; quiet: boolean; onTick: (moving: boolean) => void }): Layout {
  const init: SimInit = {
    nodes: data.nodes.map(n => ({ x: n.x, y: n.y, r: n.r, cluster: n.cluster ?? 0 })),
    links: data.edges.map(e => [e.s, e.t] as [number, number]),
    centers, alpha: options.warm ? 0.12 : 1,
  }
  const apply = (positions: Float32Array) => { for (let i = 0; i < data.nodes.length; i++) { const n = data.nodes[i]; if (n.fx == null) { n.x = positions[i * 2]; n.y = positions[i * 2 + 1] } } }
  let moving = true
  if (typeof Worker !== 'undefined') {
    try {
      const worker = new Worker(new URL('./graph-layout.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<{ type: 'tick'; positions: Float32Array; moving: boolean }>) => { apply(event.data.positions); moving = event.data.moving; options.onTick(moving) }
      worker.postMessage({ type: 'init', init, quiet: options.quiet })
      return {
        drag: (i, x, y) => { moving = true; worker.postMessage({ type: 'drag', i, x, y }) },
        release: i => worker.postMessage({ type: 'release', i }),
        reheat: alpha => { moving = true; worker.postMessage({ type: 'reheat', alpha }) },
        dispose: () => { worker.postMessage({ type: 'stop' }); worker.terminate() },
        get moving() { return moving }, worker: true,
      }
    } catch { /* Fall through to the main-thread simulation. */ }
  }
  const { sim, nodes } = createSim(init)
  let timer: ReturnType<typeof setTimeout> | undefined, disposed = false
  const loop = () => {
    timer = undefined
    if (disposed) return
    moving = stepWithin(sim, options.quiet ? 30 : 6)
    if (!options.quiet || !moving) { apply(packPositions(nodes)); options.onTick(moving) }
    if (moving) timer = setTimeout(loop, 16)
  }
  const wake = () => { if (timer === undefined && !disposed) timer = setTimeout(loop, 0) }
  wake()
  return {
    drag: (i, x, y) => { const n = nodes[i]; if (n) { n.fx = x; n.fy = y; sim.alpha(Math.max(sim.alpha(), 0.25)); moving = true; wake() } },
    release: i => { const n = nodes[i]; if (n) { n.fx = null; n.fy = null } },
    reheat: alpha => { sim.alpha(Math.max(sim.alpha(), alpha)); moving = true; wake() },
    dispose: () => { disposed = true; if (timer) clearTimeout(timer) },
    get moving() { return moving }, worker: false,
  }
}
