import {t as tr} from '../i18n'
import { Expand, LocateFixed, Pause, Play, RotateCcw, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ForceSim, GROUPS, type GraphData, type GNode, type GroupId } from '../lib/graph'
import { cn } from '../lib/cn'

/**
 * Obsidian 风格图谱着色：整图黑白灰，分组仅由灰度层级区分。
 */
function groupTone(g: GroupId): number {
  const order: GroupId[] = ['paper', 'concept', 'author', 'org', 'project', 'note', 'dataset', 'agent']
  const i = order.indexOf(g)
  return 0.25 + (i / (order.length - 1)) * 0.75 // 0.25 → 1 明度梯度
}

interface Cam {
  x: number
  y: number
  k: number
}

export function GraphView({data,onSelect}:{data:GraphData;onSelect:(id:number)=>void}) {
  const selectRef=useRef(onSelect);selectRef.current=onSelect
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const cam = useRef<Cam>({ x: 0, y: 0, k: 0.75 })
  const targetCam = useRef<Cam>({ x: 0, y: 0, k: 0.75 })
  const hoverRef = useRef<number>(-1)
  const searchRef = useRef('')
  const hiddenRef = useRef<Set<GroupId>>(new Set())
  const runningRef = useRef(true)

  const [paused, setPaused] = useState(false)
  const [query, setQuery] = useState('')
  const [hovered, setHovered] = useState<GNode | null>(null)
  const [selected, setSelected] = useState<GNode | null>(null)
  const [hidden, setHidden] = useState<Set<GroupId>>(new Set())

  const sim = useMemo(() => new ForceSim(data), [data])

  searchRef.current = query
  hiddenRef.current = hidden
  runningRef.current = !paused

  const fit = useCallback(() => {
    const el = wrapRef.current
    if (!el || !data.nodes.length) return
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const n of data.nodes) {
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x)
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y)
    }
    const w = el.clientWidth, h = el.clientHeight
    const k = Math.min(w / (maxX - minX + 120), h / (maxY - minY + 120), 1.4)
    targetCam.current = { x: -(minX + maxX) / 2, y: -(minY + maxY) / 2, k }
  }, [data])

  useEffect(() => {
    const canvas = canvasRef.current!
    const wrap = wrapRef.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let W = 0, H = 0, dpr = 1

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      W = wrap.clientWidth
      H = wrap.clientHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    // Settle the initial positions before fitting the whole knowledge graph.
    for (let step = 0; step < 8; step++) sim.tick()
    // 初始相机
    targetCam.current = { x: 0, y: 0, k: 0.75 }
    cam.current = { ...targetCam.current }
    fit()

    /* ----- interaction state ----- */
    let panning = false
    let panStart = { x: 0, y: 0 }
    let camStart = { x: 0, y: 0 }
    let dragNode: GNode | null = null
    let moved = false

    const toWorld = (sx: number, sy: number) => ({
      x: (sx - W / 2) / cam.current.k - cam.current.x,
      y: (sy - H / 2) / cam.current.k - cam.current.y,
    })

    const nodeAt = (sx: number, sy: number): GNode | null => {
      const p = toWorld(sx, sy)
      const hid = hiddenRef.current
      let best: GNode | null = null
      let bd = Infinity
      for (const n of data.nodes) {
        if (hid.has(n.group)) continue
        const dx = n.x - p.x, dy = n.y - p.y
        const d = dx * dx + dy * dy
        const rr = (n.r + 6) * (n.r + 6)
        if (d < rr && d < bd) { bd = d; best = n }
      }
      return best
    }

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId)
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top
      const n = nodeAt(sx, sy)
      moved = false
      if (n) {
        dragNode = n
        n.fx=n.x;n.fy=n.y
        panStart={x:sx,y:sy}
        sim.reheat(0.25)
      } else {
        panning = true
        panStart = { x: sx, y: sy }
        camStart = { x: targetCam.current.x, y: targetCam.current.y }
      }
    }
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top
      if (dragNode) {
        const p = toWorld(sx, sy)
        dragNode.fx = dragNode.x = p.x
        dragNode.fy = dragNode.y = p.y
        dragNode.vx = dragNode.vy = 0
        if(Math.hypot(sx-panStart.x,sy-panStart.y)>3)moved = true
        return
      }
      if (panning) {
        const dx = sx - panStart.x, dy = sy - panStart.y
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true
        targetCam.current.x = camStart.x + dx / cam.current.k
        targetCam.current.y = camStart.y + dy / cam.current.k
        return
      }
      const n = nodeAt(sx, sy)
      const id = n ? n.id : -1
      if (id !== hoverRef.current) {
        hoverRef.current = id
        setHovered(n)
      }
      canvas.style.cursor = n ? 'grab' : 'default'
    }
    const onUp = (e: PointerEvent) => {
      if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId)
      if (dragNode && !moved) {
        const n = dragNode
        setSelected(n); selectRef.current(n.id)
        // 点击聚焦
        targetCam.current = { ...targetCam.current, x: -n.x, y: -n.y, k: Math.max(targetCam.current.k, 1.5) }
      }
      if(dragNode){dragNode.fx=null;dragNode.fy=null;sim.reheat(.12)}
      dragNode = null
      panning = false
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top
      const w = toWorld(sx, sy)
      const k2 = Math.min(3.5, Math.max(0.12, targetCam.current.k * Math.exp(-e.deltaY * 0.0012)))
      targetCam.current.k = k2
      // 保持指针下点不动
      targetCam.current.x = (sx - W / 2) / k2 - w.x
      targetCam.current.y = (sy - H / 2) / k2 - w.y
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    /* ----- render loop ----- */
    let lastFrame=performance.now(),lastSignature=''
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const now=performance.now(),dt=Math.min(50,now-lastFrame);lastFrame=now
      if(!W||!H||document.hidden)return
      const signature=[query,searchRef.current,[...hiddenRef.current].join(),hoverRef.current,document.documentElement.className,W,H].join('|')
      const settled=Math.abs(cam.current.x-targetCam.current.x)+Math.abs(cam.current.y-targetCam.current.y)+Math.abs(cam.current.k-targetCam.current.k)<.001
      if(!(runningRef.current&&sim.running)&&settled&&signature===lastSignature&&!dragNode&&!panning)return
      lastSignature=signature
      if (runningRef.current) sim.tick()

      // 平滑相机
      const c = cam.current, tc = targetCam.current
      const blend=panning?1:1-Math.exp(-dt/65)
      c.x += (tc.x - c.x) * blend
      c.y += (tc.y - c.y) * blend
      c.k += (tc.k - c.k) * blend

      const dark = document.documentElement.classList.contains('dark')
      const bg = dark ? '#131316' : '#ffffff'
      const ink = dark ? 250 : 9
      const hid = hiddenRef.current
      const q = searchRef.current.trim().toLowerCase()
      const hov = hoverRef.current
      const neighbors = new Set<number>()
      if (hov >= 0) {
        neighbors.add(hov)
        for (const nb of data.adj.get(hov) ?? []) neighbors.add(nb)
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      // 点阵背景
      ctx.fillStyle = `rgba(${ink},${ink},${ink},0.05)`
      const gs = 26 * c.k
      if (gs > 9) {
        const ox = ((-c.x * c.k + W / 2) % gs + gs) % gs
        const oy = ((-c.y * c.k + H / 2) % gs + gs) % gs
        for (let x = ox; x < W; x += gs)
          for (let y = oy; y < H; y += gs) ctx.fillRect(x, y, 1, 1)
      }

      ctx.translate(W / 2, H / 2)
      ctx.scale(c.k, c.k)
      ctx.translate(c.x, c.y)

      const match = (n: GNode) => q && n.label.toLowerCase().includes(q)

      // edges
      ctx.lineWidth = 0.6 / c.k
      for (const e of data.edges) {
        const s = data.nodes[e.s], t = data.nodes[e.t]
        if (hid.has(s.group) || hid.has(t.group)) continue
        const focus = hov >= 0
        const hot = focus && neighbors.has(e.s) && neighbors.has(e.t)
        if (focus && !hot) ctx.strokeStyle = `rgba(${ink},${ink},${ink},0.035)`
        else if (hot) ctx.strokeStyle = `rgba(${ink},${ink},${ink},0.55)`
        else ctx.strokeStyle = `rgba(${ink},${ink},${ink},0.13)`
        ctx.beginPath()
        ctx.moveTo(s.x, s.y)
        ctx.lineTo(t.x, t.y)
        ctx.stroke()
      }

      const labelBoxes:{x:number;y:number;w:number}[]=[]
      // nodes
      for (const n of data.nodes) {
        if (hid.has(n.group)) continue
        const tone = groupTone(n.group)
        const focus = hov >= 0
        const dim = focus && !neighbors.has(n.id)
        const matched = match(n)
        let alpha = n.hub ? 0.95 : 0.35 + tone * 0.4
        if (dim) alpha = 0.07
        if (matched) alpha = 1
        ctx.fillStyle = `rgba(${ink},${ink},${ink},${alpha})`
        ctx.beginPath()
        ctx.arc(n.x, n.y, matched ? n.r + 1.6 : n.r, 0, Math.PI * 2)
        ctx.fill()

        // hover ring
        if (n.id === hov) {
          ctx.strokeStyle = `rgba(${ink},${ink},${ink},0.8)`
          ctx.lineWidth = 1 / c.k
          ctx.beginPath()
          ctx.arc(n.x, n.y, n.r + 4 / c.k, 0, Math.PI * 2)
          ctx.stroke()
        }

        // labels：缩放足够近或 hub 常显
        if (n.hub || c.k > 1.35 || n.id === hov || matched) {
          const size = n.hub ? 11 / c.k : 9.5 / c.k
          ctx.font = `${n.hub ? 600 : 400} ${size}px "Inter Variable", sans-serif`
          ctx.textAlign = 'center'
          const la = dim ? 0.12 : n.hub || matched ? 0.9 : 0.55
          ctx.fillStyle = `rgba(${ink},${ink},${ink},${la})`
          const label=n.label.length>44?n.label.slice(0,43)+'…':n.label
          const x=(n.x+c.x)*c.k+W/2,y=(n.y+c.y)*c.k+H/2-n.r*c.k-5
          const w=ctx.measureText(label).width*c.k
          const priority=n.id===hov||matched
          if(x+w/2<0||x-w/2>W||y<0||y>H)continue
          if(!priority&&(labelBoxes.length>120||labelBoxes.some(b=>Math.abs(b.y-y)<14&&Math.abs(b.x-x)<(b.w+w)/2+5)))continue
          labelBoxes.push({x,y,w});ctx.fillText(label,n.x,n.y-n.r-5/c.k)
        }
      }
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [data, sim, fit])

  const toggleGroup = (g: GroupId) =>
    setHidden((h) => {
      const n = new Set(h)
      if (n.has(g)) n.delete(g)
      else n.add(g)
      return n
    })

  const visibleCount = data.nodes.filter((n) => !hidden.has(n.group)).length

  return (
    <div className="relative h-full w-full overflow-hidden bg-panel">
      <div ref={wrapRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="block touch-none" aria-label={tr("知识图谱画布")} />
      </div>

      {/* 顶部工具条 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
        <div className="pointer-events-auto flex items-center gap-2 rounded-md border border-line bg-panel/90 px-3 py-1.5 shadow-soft backdrop-blur">
          <Search size={13} className="text-ink-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={tr("搜索图谱节点")} placeholder={tr("搜索知识节点…")}
            className="w-44 bg-transparent text-[12px] outline-none placeholder:text-ink-3"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-ink-3 hover:text-ink">
              <X size={12} />
            </button>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-line bg-panel/90 p-1 shadow-soft backdrop-blur">
          <button
            onClick={() => setPaused((p) => !p)}
            title={paused ? tr("Resume layout") : tr("Pause layout")}
            className="grid h-7 w-7 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-hover"
          >
            {paused ? <Play size={13} className="fill-current" /> : <Pause size={13} />}
          </button>
          <button
            onClick={() => sim.reheat(1)}
            title={tr("Reheat simulation")}
            className="grid h-7 w-7 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-hover"
          >
            <RotateCcw size={13} />
          </button>
          <button
            onClick={fit}
            title={tr("Fit to view")}
            className="grid h-7 w-7 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-hover"
          >
            <LocateFixed size={13} />
          </button>
          <button
            onClick={() => {
              targetCam.current.k = Math.min(4, targetCam.current.k * 1.25)
            }}
            title={tr("Zoom")}
            className="grid h-7 w-7 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-hover"
          >
            <Expand size={13} />
          </button>
        </div>
      </div>

      {/* 图例 */}
      <div className="pointer-events-auto absolute bottom-3 left-3 rounded-md border border-line bg-panel/90 p-2.5 shadow-soft backdrop-blur">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          {visibleCount} {tr('节点')} · {data.edges.length} {tr('链接')}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {GROUPS.filter(g => data.nodes.some(n => n.group === g.id)).map((g) => {
            const off = hidden.has(g.id)
            return (
              <button
                key={g.id}
                onClick={() => toggleGroup(g.id)}
                className={cn('flex items-center gap-1.5 text-left text-[11px] transition-opacity', off && 'opacity-30')}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: `rgba(var(--ink-rgb, 9,9,11), ${groupTone(g.id)})`, backgroundColor: `color-mix(in srgb, var(--ink) ${groupTone(g.id) * 100}%, transparent)` }}
                />
                <span className="text-ink-2">{tr(g.label)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 选中节点详情 */}
      {(hovered || selected) && (
        <div className="pointer-events-none absolute right-3 top-14 w-56 rounded-md border border-line bg-panel/95 p-3 shadow-pop backdrop-blur">
          {(() => {
            const n = selected ?? hovered!
            const group = GROUPS.find((g) => g.id === n.group)!
            const degree = n.degree
            return (
              <>
                <div className="flex items-center gap-2">
                  <span className={cn('h-2 w-2 rounded-full bg-ink', n.hub ? 'opacity-95' : 'opacity-50')} />
                  <span className="text-caption font-medium uppercase tracking-[0.06em] text-ink-3">{tr(group.label)}</span>
                  {selected && <span className="ml-auto text-[10px] text-ink-3">{tr("pinned")}</span>}
                </div>
                <div className="mt-1 text-[13px] font-semibold leading-snug">{n.label}</div>
                <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
                  <div className="rounded-lg bg-inset px-2 py-1.5">
                    <div className="text-ink-3">{tr("Links")}</div>
                    <div className="font-semibold">{degree}</div>
                  </div>
                  <div className="rounded-lg bg-inset px-2 py-1.5">
                    <div className="text-ink-3">{tr("Type")}</div>
                    <div className="font-semibold">{n.hub ? tr("Hub") : tr("Leaf")}</div>
                  </div>
                </div>
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
