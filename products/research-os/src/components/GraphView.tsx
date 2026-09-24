import { t as tr } from '../i18n'
import { useEffect, useRef } from 'react'
import type { GraphData, GNode, GroupId } from '../lib/graph'
import type { GraphCamera } from '../lib/graph-camera'
import { rememberPositions, seedLayout } from '../lib/graph-layout-seed'
import { startLayout, type Layout } from '../lib/graph-layout'
import { cameraAt, edgeAlpha, fitCamera, flight, labelBudget, placeLabels, PointGrid, worldRadius, type LabelCandidate } from '../lib/graph-render'

/* 知识图谱（学术地图，而非演示）：
   - 版式：墨色在纸上；边是纹理，节点按连接度有分量；远看时文件夹是地图上的地名（衬线斜体），近看才出现篇名。
   - 性能：布局在 Web Worker；绘制视口裁剪、按类批量描边/填充、网格命中测试、标签按重要度与碰撞放置、空闲即停帧。
   - 动效：相机缓动飞行、邻域高亮淡入淡出、整幅一次淡入；尊重 prefers-reduced-motion（瞬移、无弹簧、排布完成才显示）。 */

export type GraphMark = 'context' | 'canvas' | 'both'
type Props = {
  data: GraphData
  onSelect: (id: number) => void
  initialCamera?: GraphCamera
  onCameraChange?: (camera: GraphCamera) => void
  /** Resource id chosen outside the canvas (search result, inspector link): highlighted and flown to. */
  focus?: string
  /** Notes attached to this project's chat and/or cited by its canvas cards. */
  marks?: Map<string, GraphMark>
  onLayoutState?: (state: 'laying' | 'ready') => void
  /** 'fit' reframes onto a filtered subset (search, local graph); 'keep' preserves the reader's view. */
  frame?: 'keep' | 'fit'
}

const TONE: Partial<Record<GroupId, number>> = { paper: 0.95, concept: 0.8, project: 0.7, note: 0.55 }

export function GraphView({ data, onSelect, initialCamera, onCameraChange, focus, marks, onLayoutState, frame = 'keep' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null), wrapRef = useRef<HTMLDivElement>(null)
  const props = useRef({ onSelect, onCameraChange, onLayoutState, marks, initialCamera, frame }); props.current = { onSelect, onCameraChange, onLayoutState, marks, initialCamera, frame }
  const api = useRef<{ focus: (resourceId: string | undefined) => void; wake: () => void; bump?: () => void } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current!, wrap = wrapRef.current!, ctx = canvas.getContext('2d')!
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    const { warm, clusters } = seedLayout(data)
    const nodes = data.nodes
    const quiet = reduced && !warm
    let W = 0, H = 0, dpr = 1, raf = 0, disposed = false
    let ready = !quiet
    props.current.onLayoutState?.(ready ? 'ready' : 'laying')

    /* ---------- camera ---------- */
    const restored = props.current.initialCamera
    const validCam = (c?: GraphCamera) => !!c && [c.x, c.y, c.k].every(Number.isFinite) && c.k >= 0.05 && c.k <= 4
    let cam: GraphCamera = { x: 0, y: 0, k: 1 }, target: GraphCamera = { ...cam }
    let fly: { from: GraphCamera; to: GraphCamera; start: number; dur: number } | null = null
    let userMoved = validCam(restored) && warm, fitted = false
    const flyTo = (to: GraphCamera) => {
      if (reduced) { cam = { ...to }; target = { ...to }; fly = null; saveSoon(); wake(); return }
      fly = { from: { ...cam }, to, start: performance.now(), dur: flight(cam, to, { w: W || 800, h: H || 600 }) }; wake()
    }
    let saveTimer: ReturnType<typeof setTimeout> | undefined
    const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => props.current.onCameraChange?.({ ...target }), 220) }
    const fitNow = () => fitCamera(nodes.filter(n => Number.isFinite(n.x)), { w: W, h: H })

    /* ---------- layout ---------- */
    const grid = new PointGrid(48)
    let gridDirty = true
    const layout: Layout = startLayout(data, seedLayoutCenters(), {
      warm, quiet,
      onTick: moving => {
        gridDirty = true; positionsVersion++
        if (!ready) { ready = true; props.current.onLayoutState?.('ready'); sceneStart = performance.now() }
        // A cold layout the reader hasn't taken over settles into a framed view once, as a single calm flight.
        if (!moving) { rememberPositions(nodes); if (!userMoved && !fitted) { fitted = true; flyTo(fitNow()) } }
        wake()
      },
    })
    function seedLayoutCenters() {
      // Cluster centres as seeded (the mean of each cluster's seeded members) keep the gentle regional pull consistent.
      const sum = clusters.map(() => ({ x: 0, y: 0, n: 0 }))
      for (const n of nodes) { const s = sum[n.cluster ?? 0]; s.x += n.x; s.y += n.y; s.n++ }
      return sum.map(s => ({ x: s.n ? s.x / s.n : 0, y: s.n ? s.y / s.n : 0 }))
    }

    /* ---------- focus / hover ---------- */
    let hover = -1, focused = -1, shown = -1, mix = 0
    let neighborhood = new Set<number>()
    const springs = new Map<number, number>()
    const setShown = (id: number) => {
      if (id === shown) return
      if (id >= 0) { shown = id; neighborhood = new Set([id, ...(data.adj.get(id) ?? [])]) }
      wake()
    }
    api.current = {
      focus: resourceId => {
        const n = resourceId ? nodes.find(x => x.resourceId === resourceId) : undefined
        focused = n ? n.id : -1
        if (hover < 0) setShown(focused)
        if (n) { userMoved = true; flyTo({ x: -n.x, y: -n.y, k: Math.max(target.k, 1.3) }) }
        wake()
      },
      wake: () => wake(),
    }

    /* ---------- geometry helpers ---------- */
    const toWorld = (sx: number, sy: number) => ({ x: (sx - W / 2) / cam.k - cam.x, y: (sy - H / 2) / cam.k - cam.y })
    const nodeAt = (sx: number, sy: number): GNode | null => {
      if (gridDirty) { grid.build(nodes); gridDirty = false }
      const p = toWorld(sx, sy)
      const id = grid.nearest(p.x, p.y, nodes, i => worldRadius(nodes[i].r, cam.k) + 6 / cam.k)
      return id >= 0 ? nodes[id] : null
    }
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1); W = wrap.clientWidth; H = wrap.clientHeight
      canvas.width = Math.max(1, W * dpr); canvas.height = Math.max(1, H * dpr); canvas.style.width = `${W}px`; canvas.style.height = `${H}px`
      if (!fitted && !userMoved) { const f = fitNow(); cam = { ...f }; target = { ...f } }
      if (validCam(restored) && !fitted && warm) { cam = { ...restored! }; target = { ...restored! }; fitted = true }
      wake()
    }
    const ro = new ResizeObserver(resize); ro.observe(wrap); resize()
    if (warm && props.current.frame === 'fit') { fitted = true; userMoved = true; flyTo(fitNow()) }

    /* ---------- interaction ---------- */
    let drag: GNode | null = null, panning = false, moved = false
    let down = { x: 0, y: 0 }, camDown = { x: 0, y: 0 }
    const local = (e: { clientX: number; clientY: number }) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      canvas.setPointerCapture(e.pointerId)
      const p = local(e), n = nodeAt(p.x, p.y)
      moved = false; down = p; fly = null
      if (n) { drag = n } else { panning = true; camDown = { x: target.x, y: target.y } }
    }
    const onMove = (e: PointerEvent) => {
      const p = local(e)
      if (drag) {
        if (!moved && Math.hypot(p.x - down.x, p.y - down.y) < 4) return
        moved = true
        const w = toWorld(p.x, p.y)
        drag.x = w.x; drag.y = w.y; drag.fx = w.x; drag.fy = w.y
        layout.drag(drag.id, w.x, w.y); gridDirty = true; positionsVersion++; wake(); return
      }
      if (panning) {
        const dx = p.x - down.x, dy = p.y - down.y
        if (Math.abs(dx) + Math.abs(dy) > 2) { moved = true; userMoved = true }
        target = { ...target, x: camDown.x + dx / cam.k, y: camDown.y + dy / cam.k }; cam = { ...cam, x: target.x, y: target.y }
        wake(); return
      }
      const n = nodeAt(p.x, p.y), id = n ? n.id : -1
      if (id !== hover) { hover = id; setShown(id >= 0 ? id : focused); canvas.style.cursor = n ? 'pointer' : 'default'; wake() }
    }
    const onUp = (e: PointerEvent) => {
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
      if (drag) {
        if (!moved) {
          const n = drag
          focused = n.id; setShown(n.id); userMoved = true
          props.current.onSelect(n.id)
          flyTo({ x: -n.x, y: -n.y, k: Math.max(target.k, 1.3) })
        } else { layout.release(drag.id); drag.fx = drag.fy = null; layout.reheat(0.12); rememberPositions([drag]) }
        wake()
      }
      if (panning && moved) saveSoon()
      drag = null; panning = false; wake()
    }
    const onLeave = () => { if (hover >= 0 && !drag) { hover = -1; setShown(focused); wake() } }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); userMoved = true; fly = null
      const p = local(e), w = toWorld(p.x, p.y)
      const k = Math.min(4, Math.max(0.05, target.k * Math.exp(-e.deltaY * 0.0013)))
      target = { k, x: (p.x - W / 2) / k - w.x, y: (p.y - H / 2) / k - w.y }
      if (reduced) cam = { ...target }
      saveSoon(); wake()
    }
    const onDbl = (e: MouseEvent) => { const p = local(e); if (!nodeAt(p.x, p.y)) { userMoved = false; flyTo(fitNow()); saveSoon() } }
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp); canvas.addEventListener('pointerleave', onLeave); canvas.addEventListener('dblclick', onDbl)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    const readTheme = () => { const dark = document.documentElement.classList.contains('dark'); return { dark, ink: dark ? '245,244,242' : '28,25,23', paper: getComputedStyle(document.documentElement).getPropertyValue('--bg-app').trim() || (dark ? '#100f0e' : '#f4f3f1') } }
    let theme = readTheme()
    const themeWatch = new MutationObserver(() => { theme = readTheme(); baseCam = null; wake() }); themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    /* ---------- render ----------
       A cached scene layer (edges + nodes + marks) is rendered into an offscreen bitmap padded beyond the viewport.
       Pan and zoom transform that bitmap; it is re-rendered only when the view leaves the padding, the zoom settles,
       the layout moves, or theme/marks change. Hover/focus draw just the small neighbourhood live over a faded base,
       and labels are always live and crisp. This keeps ten-thousand-link vaults smooth. */
    const widths = new Map<string, number>()
    const labelWidth = (text: string) => { let w = widths.get(text); if (w === undefined) { ctx.font = '400 11px "Inter Variable", sans-serif'; w = ctx.measureText(text).width; widths.set(text, w) } return w }
    const display = getComputedStyle(document.documentElement).getPropertyValue('--font-display') || 'Georgia, serif'
    let sceneStart = performance.now(), last = performance.now()
    const sceneDur = reduced ? 0 : warm ? 220 : 520
    const PAD = 0.35
    const base = document.createElement('canvas'), bctx = base.getContext('2d')!
    let baseCam: GraphCamera | null = null, baseKey = '', baseAt = 0, positionsVersion = 0, marksVersion = 0
    api.current!.bump = () => { marksVersion++; wake() }
    const nodeAlpha = (n: GNode) => Math.min(1, 0.3 + (TONE[n.group] ?? 0.5) * 0.35 + (n.hub ? 0.25 : 0))

    /** Draw edges/nodes/marks for camera `c` into `g` (sized w×h CSS px). Culled to that view. */
    function paintScene(g: CanvasRenderingContext2D, c: GraphCamera, w: number, h: number, only?: Set<number>) {
      const { ink, dark } = theme, k = c.k
      g.save(); g.translate(w / 2, h / 2); g.scale(k, k); g.translate(c.x, c.y)
      const pad = 20 / k, x0 = -w / 2 / k - c.x - pad, x1 = w / 2 / k - c.x + pad, y0 = -h / 2 / k - c.y - pad, y1 = h / 2 / k - c.y + pad
      const texture = new Path2D(), arrows = new Path2D(), arrowsOn = k > 1.1
      for (const e of data.edges) {
        if (e.s === e.t || (only && !(only.has(e.s) && only.has(e.t) && (e.s === shown || e.t === shown)))) continue
        const a = nodes[e.s], b = nodes[e.t]
        if ((a.x < x0 && b.x < x0) || (a.x > x1 && b.x > x1) || (a.y < y0 && b.y < y0) || (a.y > y1 && b.y > y1)) continue
        // level of detail: an edge shorter than a pixel on screen is invisible texture; skip the stroke work
        if (!only && ((b.x - a.x) ** 2 + (b.y - a.y) ** 2) * k * k < 1) continue
        texture.moveTo(a.x, a.y); texture.lineTo(b.x, b.y)
        if (arrowsOn || only) {
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy)
          if (d * k > 36) {
            const ux = dx / d, uy = dy / d, br = worldRadius(b.r, k) + 2 / k, ex = b.x - ux * br, ey = b.y - uy * br, ah = 6 / k, path = only ? texture : arrows
            path.moveTo(ex, ey); path.lineTo(ex - ux * ah - uy * ah * 0.42, ey - uy * ah + ux * ah * 0.42)
            path.moveTo(ex, ey); path.lineTo(ex - ux * ah + uy * ah * 0.42, ey - uy * ah - ux * ah * 0.42)
          }
        }
      }
      g.lineCap = 'round'
      if (only) { g.lineWidth = 1 / k; g.strokeStyle = `rgba(${ink},${0.55 * mix})`; g.stroke(texture) }
      else { g.lineWidth = 0.7 / k; g.strokeStyle = `rgba(${ink},${edgeAlpha(data.edges.length)})`; g.stroke(texture); if (arrowsOn) g.stroke(arrows) }
      const buckets = new Map<number, Path2D>(), hollow = new Path2D()
      for (const id of only ?? nodes.keys()) {
        const n = nodes[id]
        if (n.x < x0 || n.x > x1 || n.y < y0 || n.y > y1) continue
        const r = Math.max(worldRadius(n.r, k) * (only ? springs.get(n.id) ?? 1 : 1), 1.1 / k)
        if (n.unresolved) { hollow.moveTo(n.x + r, n.y); hollow.arc(n.x, n.y, r, 0, Math.PI * 2); continue }
        const q = Math.round((n.id === shown && only ? Math.max(nodeAlpha(n), 0.95) : nodeAlpha(n)) * 20)
        let path = buckets.get(q); if (!path) { path = new Path2D(); buckets.set(q, path) }
        if (r * k < 1.6) path.rect(n.x - r, n.y - r, r * 2, r * 2)
        else { path.moveTo(n.x + r, n.y); path.arc(n.x, n.y, r, 0, Math.PI * 2) }
      }
      for (const [q, path] of buckets) { g.fillStyle = `rgba(${ink},${q / 20})`; g.fill(path) }
      g.lineWidth = 0.9 / k; g.strokeStyle = `rgba(${ink},0.4)`; g.stroke(hollow)
      // interlock marks: ring = attached to this project's chat; hollow centre = cited by its canvas cards
      const markMap = props.current.marks
      if (markMap?.size) for (const id of only ?? nodes.keys()) {
        const n = nodes[id], m = n.resourceId ? markMap.get(n.resourceId) : undefined
        if (!m || n.x < x0 || n.x > x1 || n.y < y0 || n.y > y1) continue
        const r = worldRadius(n.r, k) * (only ? springs.get(n.id) ?? 1 : 1)
        if (m !== 'canvas') { g.lineWidth = 1.2 / k; g.strokeStyle = `rgba(${ink},0.85)`; g.beginPath(); g.arc(n.x, n.y, r + 3.5 / k, 0, Math.PI * 2); g.stroke() }
        if (m !== 'context') { g.fillStyle = dark ? 'rgba(16,15,14,0.92)' : 'rgba(250,249,247,0.95)'; g.beginPath(); g.arc(n.x, n.y, Math.max(r * 0.42, 1.2 / k), 0, Math.PI * 2); g.fill() }
      }
      g.restore()
    }

    function ensureBase(now: number, cameraMoving: boolean) {
      const key = `${positionsVersion}:${marksVersion}:${theme.ink}:${W}x${H}:${dpr}`
      const bw = W * (1 + 2 * PAD), bh = H * (1 + 2 * PAD)
      let stale = !baseCam || key !== baseKey
      if (baseCam && !stale) {
        const s = cam.k / baseCam.k, ox = (cam.x - baseCam.x) * cam.k, oy = (cam.y - baseCam.y) * cam.k
        const edge = Math.abs(ox) > W * PAD * 0.8 || Math.abs(oy) > H * PAD * 0.8
        // moving: let the bitmap stretch (a brief softness) and re-render sharp once the camera settles
        stale = cameraMoving ? edge || s < 0.66 || s > 1.5 : edge || Math.abs(s - 1) > 0.002
      }
      // While things move, refresh at most every ~60ms (the bitmap transform covers the gap); at rest, refresh at once.
      if (!stale || (cameraMoving || layout.moving) && now - baseAt < 90 && baseCam) return
      if (base.width !== Math.round(bw * dpr) || base.height !== Math.round(bh * dpr)) { base.width = Math.round(bw * dpr); base.height = Math.round(bh * dpr) }
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0); bctx.clearRect(0, 0, bw, bh)
      paintScene(bctx, cam, bw, bh)
      baseCam = { ...cam }; baseKey = key; baseAt = now
    }

    function frame(now: number) {
      raf = 0
      if (disposed || !W || !H) return
      const dt = Math.min(64, now - last); last = now
      let busy = layout.moving && !quiet, cameraMoving = false

      // camera: a flight wins; otherwise the view eases toward the wheel/pan target
      if (fly) {
        const t = (now - fly.start) / fly.dur
        cam = cameraAt(fly.from, fly.to, t); target = { ...cam }
        if (t >= 1) { cam = { ...fly.to }; target = { ...fly.to }; fly = null; saveSoon() } else busy = cameraMoving = true
      } else {
        const b = 1 - Math.exp(-dt / 70)
        cam = { x: cam.x + (target.x - cam.x) * b, y: cam.y + (target.y - cam.y) * b, k: cam.k + (target.k - cam.k) * b }
        if (Math.abs(target.k - cam.k) / cam.k > 0.001 || Math.abs(target.x - cam.x) * cam.k > 0.3 || Math.abs(target.y - cam.y) * cam.k > 0.3) busy = cameraMoving = true
        else cam = { ...target }
      }
      if (panning) cameraMoving = true
      // neighbourhood highlight fades in and out instead of switching
      const active = hover >= 0 || focused >= 0
      const mixTarget = active ? 1 : 0
      mix = reduced ? mixTarget : mix + (mixTarget - mix) * (1 - Math.exp(-dt / 110))
      if (Math.abs(mix - mixTarget) > 0.01) busy = true; else mix = mixTarget
      if (!active && mix === 0) shown = -1
      const scene = sceneDur ? Math.min(1, (now - sceneStart) / sceneDur) : 1
      if (scene < 1) busy = true
      const sceneAlpha = 1 - (1 - scene) ** 3
      const { ink, paper } = theme, { k } = cam

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      if (!ready) return // quiet (reduced-motion) cold layout: the first worker message reveals the settled atlas

      // 1) cached scene, transformed to the current camera and faded under an active neighbourhood
      ensureBase(now, cameraMoving || panning)
      if (baseCam) {
        const s = k / baseCam.k, bw = W * (1 + 2 * PAD), bh = H * (1 + 2 * PAD)
        ctx.globalAlpha = sceneAlpha * (shown >= 0 ? 1 - 0.78 * mix : 1)
        ctx.drawImage(base, 0, 0, base.width, base.height, W / 2 - bw / 2 * s + (cam.x - baseCam.x) * k, H / 2 - bh / 2 * s + (cam.y - baseCam.y) * k, bw * s, bh * s)
      }
      // 2) live neighbourhood (hot edges, neighbours with their spring, focus rings)
      const hotSet = mix > 0 && shown >= 0 ? neighborhood : null
      let springHot = false
      for (const id of hotSet ?? []) {
        const want = reduced ? 1 : id === shown ? 1.3 : 1.1
        let scale = springs.get(id) ?? 1
        scale += (want - scale) * (1 - Math.exp(-dt / 90))
        if (Math.abs(want - scale) < 0.005) scale = want; else springHot = true
        springs.set(id, scale)
      }
      if (!hotSet) springs.clear()
      if (springHot) busy = true
      ctx.globalAlpha = sceneAlpha
      if (hotSet) {
        paintScene(ctx, cam, W, H, hotSet)
        const n = nodes[shown], r = worldRadius(n.r, k) * (springs.get(n.id) ?? 1)
        ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(k, k); ctx.translate(cam.x, cam.y)
        ctx.lineWidth = 1 / k; ctx.strokeStyle = `rgba(${ink},${0.75 * mix})`
        ctx.beginPath(); ctx.arc(n.x, n.y, r + 4 / k, 0, Math.PI * 2); ctx.stroke()
        ctx.strokeStyle = `rgba(${ink},${0.14 * mix})`; ctx.beginPath(); ctx.arc(n.x, n.y, r + 9 / k, 0, Math.PI * 2); ctx.stroke()
        ctx.restore()
      }

      // 3) labels in screen space: folder names as atlas regions when far, note titles by importance when near
      const sx = (n: GNode) => (n.x + cam.x) * k + W / 2, sy = (n: GNode) => (n.y + cam.y) * k + H / 2
      const regions = k < 0.75 ? Math.min(1, (0.75 - k) / 0.3) : 0
      if (regions > 0) {
        const acc = clusters.map(() => ({ x: 0, y: 0, n: 0 }))
        for (const n of nodes) if (!n.unresolved) { const a = acc[n.cluster ?? 0]; a.x += n.x; a.y += n.y; a.n++ }
        ctx.font = `italic 400 13px ${display}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        const cand: LabelCandidate[] = []
        acc.forEach((a, i) => { if (a.n >= 5) { const x = (a.x / a.n + cam.x) * k + W / 2, y = (a.y / a.n + cam.y) * k + H / 2; if (x > -80 && x < W + 80 && y > -20 && y < H + 20) cand.push({ id: i, x, y: y + 7, w: ctx.measureText(clusters[i]).width, h: 16, priority: a.n }) } })
        ctx.fillStyle = `rgba(${ink},${0.62 * regions * (1 - 0.6 * mix)})`
        const byId = new Map(cand.map(c => [c.id, c]))
        ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = paper
        for (const id of placeLabels(cand, 60)) { const c = byId.get(id)!; ctx.strokeText(clusters[id], c.x, c.y - 7); ctx.fillText(clusters[id], c.x, c.y - 7) }
      }
      const budget = labelBudget(k)
      if (budget > 0 || hotSet) {
        const cand: LabelCandidate[] = []
        const consider = (n: GNode) => {
          const x = sx(n), y = sy(n)
          if (x < -60 || x > W + 60 || y < -20 || y > H + 20) return
          const inHood = hotSet?.has(n.id) && mix > 0.3
          const fontPx = n.id === shown ? 12 : n.hub ? 11.5 : 10.5
          const text = n.label.length > 48 ? `${n.label.slice(0, 47)}…` : n.label
          const r = worldRadius(n.r, k) * (springs.get(n.id) ?? 1) * k
          cand.push({ id: n.id, x, y: y - r - 4, w: labelWidth(text) * fontPx / 11, h: fontPx + 2, priority: n.id === shown ? 3e6 : inHood ? 2e6 + n.degree : (props.current.marks?.has(n.resourceId ?? '') ? 1e3 : 0) + n.degree * 10 + (n.hub ? 100 : 0) })
        }
        if (budget > 0) for (const n of nodes) consider(n); else for (const id of hotSet!) consider(nodes[id])
        const placed = placeLabels(cand, budget + (hotSet ? 40 : 0)), byId = new Map(cand.map(c => [c.id, c]))
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = paper
        for (const id of placed) {
          const n = nodes[id], c = byId.get(id)!
          const inHood = hotSet?.has(id) ?? false
          const emphasis = id === shown ? 1 : inHood ? 0.8 : n.hub ? 0.72 : 0.5
          const alpha = hotSet && !inHood ? emphasis * (1 - 0.85 * mix) : emphasis
          if (alpha < 0.04) continue
          ctx.font = `${id === shown || n.hub ? 500 : 400} ${id === shown ? 12 : n.hub ? 11.5 : 10.5}px "Inter Variable", sans-serif`
          ctx.fillStyle = `rgba(${ink},${alpha})`
          const text = n.label.length > 48 ? `${n.label.slice(0, 47)}…` : n.label
          // a paper-coloured halo keeps titles legible over dense ink without a box
          ctx.strokeText(text, c.x, c.y); ctx.fillText(text, c.x, c.y)
        }
      }
      ctx.globalAlpha = 1
      if (busy || (baseCam && Math.abs(cam.k / baseCam.k - 1) > 0.002)) schedule()
    }
    function schedule() { if (!raf && !disposed) raf = requestAnimationFrame(frame) }
    function wake() { schedule() }

    return () => {
      disposed = true
      if (raf) cancelAnimationFrame(raf)
      clearTimeout(saveTimer)
      props.current.onCameraChange?.({ ...target })
      rememberPositions(nodes)
      layout.dispose(); ro.disconnect(); themeWatch.disconnect()
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp); canvas.removeEventListener('pointerleave', onLeave); canvas.removeEventListener('dblclick', onDbl)
      canvas.removeEventListener('wheel', onWheel)
      api.current = null
    }
  }, [data])

  useEffect(() => { api.current?.focus(focus) }, [focus, data])
  useEffect(() => { api.current?.bump?.() }, [marks])

  return <div className="relative h-full w-full overflow-hidden">
    <div ref={wrapRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="block touch-none" aria-label={tr('知识图谱画布')} data-xgc-role="knowledge-graph-canvas" data-nodes={data.nodes.length} data-edges={data.edges.length}/>
    </div>
  </div>
}
