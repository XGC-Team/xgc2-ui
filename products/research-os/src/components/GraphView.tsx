import {t as tr} from '../i18n'
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

  const [hovered, setHovered] = useState<GNode | null>(null)
  const [selected, setSelected] = useState<GNode | null>(null)

  const sim = useMemo(() => new ForceSim(data), [data])

  /* 自适应居中：视野包住全图并留呼吸边距。immediate 时相机直接落位，入场不飞镜 */
  const fit = useCallback((immediate = false) => {
    const el = wrapRef.current
    if (!el || !data.nodes.length) return
    /* 视野：缩放包住全图（留 80px 屏边），但居中锚点是度数加权质心——
       密集核占据视野中心，离群叶节点不把画面拖偏（此前按包围盒居中导致「小而下沉」） */
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    let cx = 0, cy = 0, wsum = 0
    for (const n of data.nodes) {
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x)
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y)
      const w = 1 + n.degree; cx += n.x * w; cy += n.y * w; wsum += w
    }
    cx /= wsum; cy /= wsum
    const w = el.clientWidth, h = el.clientHeight
    const k = Math.min((w - 160) / Math.max(1, maxX - minX), (h - 160) / Math.max(1, maxY - minY), 1.6)
    targetCam.current = { x: -cx, y: -cy, k: Math.max(k, 0.08) }
    if (immediate) cam.current = { ...targetCam.current }
  }, [data])

  useEffect(() => {
    const canvas = canvasRef.current!
    const wrap = wrapRef.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let W = 0, H = 0, dpr = 1

    const resize = (repaint = false) => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      W = wrap.clientWidth
      H = wrap.clientHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      // 重置尺寸会清空画布：立即同步补绘一帧，不等下一个 rAF，消除空白帧
      if (repaint) { lastSignature = ''; paint(performance.now()) }
    }
    resize()
    // 用户未接管相机前，容器尺寸变化时保持自适应居中
    let userMoved = false
    const ro = new ResizeObserver(() => { resize(true); if (!userMoved) fit() })
    ro.observe(wrap)

    /* 入场编排（Obsidian 式绽放）：不同步预收敛——首帧即绘，力导在视野内实时收敛。
       节点按度数降序依次亮起（骨架先显、叶子后绽），相机在模拟冷却前持续贴合扩张中的布局，
       既不阻塞首绘，也不会「边展开边飘出视野」。 */
    const bornAt = performance.now()
    const ENTER_SPAN = 700, ENTER_DUR = 450
    const enterDelay = new Map<number, number>()
    ;[...data.nodes].sort((a, b) => b.degree - a.degree)
      .forEach((n, i, arr) => enterDelay.set(n.id, arr.length > 1 ? (i / (arr.length - 1)) * ENTER_SPAN : 0))
    const enterEnd = bornAt + ENTER_SPAN + ENTER_DUR
    const easeOut = (p: number) => 1 - Math.pow(1 - p, 3)
    const easeBack = (p: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2) }
    const enterOf = (id: number, now: number) => Math.min(1, Math.max(0, (now - bornAt - (enterDelay.get(id) ?? 0)) / ENTER_DUR))
    const scales = new Map<number, number>() // 节点视觉倍率弹簧：hover/邻点/拖拽各自有目标值
    fit(true) // 相机直接落在初始簇上，从绽放点开始呼吸

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
      let best: GNode | null = null
      let bd = Infinity
      for (const n of data.nodes) {
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
        // 牵引手感：位移增量按 0.55 注入直接邻点速度——拖拽像扯动一张网，不是拖一个死点
        const dx = p.x - dragNode.x, dy = p.y - dragNode.y
        for (const id of data.adj.get(dragNode.id) ?? []) { const nb = data.nodes[id]; nb.vx += dx * 0.55; nb.vy += dy * 0.55 }
        dragNode.fx = dragNode.x = p.x
        dragNode.fy = dragNode.y = p.y
        dragNode.vx = dragNode.vy = 0
        sim.reheat(0.4)
        if(Math.hypot(sx-panStart.x,sy-panStart.y)>3)moved = true
        return
      }
      if (panning) {
        const dx = sx - panStart.x, dy = sy - panStart.y
        if (Math.abs(dx) + Math.abs(dy) > 2) { moved = true; userMoved = true }
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
        userMoved = true
        targetCam.current = { ...targetCam.current, x: -n.x, y: -n.y, k: Math.max(targetCam.current.k, 1.5) }
      }
      if(dragNode){dragNode.fx=null;dragNode.fy=null;sim.reheat(.35)}
      dragNode = null
      panning = false
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      userMoved = true
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top
      const w = toWorld(sx, sy)
      const k2 = Math.min(3.5, Math.max(0.12, targetCam.current.k * Math.exp(-e.deltaY * 0.0012)))
      targetCam.current.k = k2
      // 保持指针下点不动
      targetCam.current.x = (sx - W / 2) / k2 - w.x
      targetCam.current.y = (sy - H / 2) / k2 - w.y
    }

    // 双击空白：复位视野并恢复自适应居中
    const onDblClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      if (nodeAt(e.clientX - rect.left, e.clientY - rect.top)) return
      userMoved = false
      fit()
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('dblclick', onDblClick)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    /* ----- render loop ----- */
    let lastFrame=performance.now(),lastSignature='',springsHot=false
    let dotTile: CanvasPattern | null = null, dotTileKey = ''
    const paint = (now:number) => {
      const dt=Math.min(50,now-lastFrame);lastFrame=now
      if(!W||!H||document.hidden)return
      const entering=now<enterEnd
      const signature=[hoverRef.current,document.documentElement.className,W,H].join('|')
      const settled=Math.abs(cam.current.x-targetCam.current.x)+Math.abs(cam.current.y-targetCam.current.y)+Math.abs(cam.current.k-targetCam.current.k)<.001
      if(!sim.running&&settled&&signature===lastSignature&&!dragNode&&!panning&&!entering&&!springsHot)return
      springsHot=false
      lastSignature=signature
      if (dragNode) sim.reheat(0.15) // 指针停住但拖拽未结束时维持牵引
      // 热阶段每帧两 tick：收敛墙钟时间减半，仍不阻塞主线程
      sim.tick();if(sim.running)sim.tick()
      // 冷却前且用户未接管相机：每帧重贴合，布局扩张时始终居中、视野合理
      if(sim.running&&!userMoved)fit()

      // 平滑相机
      const c = cam.current, tc = targetCam.current
      const blend=panning?1:1-Math.exp(-dt/65)
      c.x += (tc.x - c.x) * blend
      c.y += (tc.y - c.y) * blend
      c.k += (tc.k - c.k) * blend

      const dark = document.documentElement.classList.contains('dark')
      const ink = dark ? 250 : 9
      const hov = hoverRef.current
      const neighbors = new Set<number>()
      if (hov >= 0) {
        neighbors.add(hov)
        for (const nb of data.adj.get(hov) ?? []) neighbors.add(nb)
      }

      // 画布透明，透出 --bg-app：resize 清屏与重绘之间无色差，杜绝白色频闪
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)

      // 点阵背景：pattern 瓦片一次填充，代替逐点数千次 fillRect
      const gs = 26 * c.k
      if (gs > 9) {
        const tileKey = `${Math.round(gs)}:${dark}`
        if (tileKey !== dotTileKey) {
          const s = Math.ceil(gs)
          const tile = document.createElement('canvas')
          tile.width = tile.height = s
          const tctx = tile.getContext('2d')!
          tctx.fillStyle = `rgba(${ink},${ink},${ink},0.05)`
          tctx.fillRect(0, 0, 1, 1)
          dotTile = ctx.createPattern(tile, 'repeat')
          dotTileKey = tileKey
        }
        if (dotTile) {
          const ox = ((-c.x * c.k + W / 2) % gs + gs) % gs
          const oy = ((-c.y * c.k + H / 2) % gs + gs) % gs
          ctx.save()
          ctx.translate(ox, oy)
          ctx.fillStyle = dotTile
          ctx.fillRect(-ox, -oy, W + gs, H + gs)
          ctx.restore()
        }
      }

      ctx.translate(W / 2, H / 2)
      ctx.scale(c.k, c.k)
      ctx.translate(c.x, c.y)

      // edges：入场时从先亮的一端向另一端「生长」；拖拽中的边加粗提亮
      for (const e of data.edges) {
        const s = data.nodes[e.s], t = data.nodes[e.t]
        const eIn = entering ? Math.min(enterOf(e.s, now), enterOf(e.t, now)) : 1
        if (eIn <= 0) continue
        const dragEdge = dragNode != null && (e.s === dragNode.id || e.t === dragNode.id)
        const focus = hov >= 0
        const hot = focus && neighbors.has(e.s) && neighbors.has(e.t)
        const base = dragEdge ? 0.7 : focus && !hot ? 0.035 : hot ? 0.55 : 0.13
        ctx.strokeStyle = `rgba(${ink},${ink},${ink},${base * eIn})`
        ctx.lineWidth = (dragEdge ? 1.1 : 0.6) / c.k
        const a = entering && enterOf(e.s, now) < enterOf(e.t, now) ? t : s
        const b = a === s ? t : s
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(a.x + (b.x - a.x) * eIn, a.y + (b.y - a.y) * eIn)
        ctx.stroke()
      }

      const labelBoxes:{x:number;y:number;w:number}[]=[]
      // nodes：入场按度数降序绽放（easeOutBack 过冲回弹）；hover/邻点/拖拽有弹簧倍率
      for (const n of data.nodes) {
        const pIn = entering ? enterOf(n.id, now) : 1
        const eIn = entering ? easeOut(pIn) : 1
        if (eIn <= 0) continue
        const tone = groupTone(n.group)
        const focus = hov >= 0
        const dim = focus && !neighbors.has(n.id)
        const alpha = (dim ? 0.07 : n.hub ? 0.95 : 0.35 + tone * 0.4) * eIn
        // 视觉倍率弹簧：拖拽 1.35 / 悬停 1.28 / 邻点 1.12，90ms 时常吸附
        const target = dragNode === n ? 1.35 : n.id === hov ? 1.28 : focus && neighbors.has(n.id) ? 1.12 : 1
        const next = (scales.get(n.id) ?? 1) + (target - (scales.get(n.id) ?? 1)) * (1 - Math.exp(-dt / 90))
        scales.set(n.id, next)
        if (Math.abs(target - next) > 0.01) springsHot = true
        const pop = entering ? 0.25 + 0.75 * easeBack(pIn) : 1
        const rr = n.r * pop * next
        ctx.fillStyle = `rgba(${ink},${ink},${ink},${alpha})`
        ctx.beginPath()
        ctx.arc(n.x, n.y, rr, 0, Math.PI * 2)
        ctx.fill()

        // hover：实心环 + 一圈更淡的外晕
        if (n.id === hov) {
          ctx.strokeStyle = `rgba(${ink},${ink},${ink},${0.8 * eIn})`
          ctx.lineWidth = 1 / c.k
          ctx.beginPath()
          ctx.arc(n.x, n.y, rr + 4 / c.k, 0, Math.PI * 2)
          ctx.stroke()
          ctx.strokeStyle = `rgba(${ink},${ink},${ink},${0.16 * eIn})`
          ctx.beginPath()
          ctx.arc(n.x, n.y, rr + 9 / c.k, 0, Math.PI * 2)
          ctx.stroke()
        }

        // labels：缩放足够近或 hub 常显；入场尾段才淡入
        if ((n.hub || c.k > 1.35 || n.id === hov) && eIn > 0.7) {
          const size = n.hub ? 11 / c.k : 9.5 / c.k
          ctx.font = `${n.hub ? 600 : 400} ${size}px "Inter Variable", sans-serif`
          ctx.textAlign = 'center'
          const la = (dim ? 0.12 : n.hub ? 0.9 : 0.55) * ((eIn - 0.7) / 0.3)
          ctx.fillStyle = `rgba(${ink},${ink},${ink},${la})`
          const label=n.label.length>44?n.label.slice(0,43)+'…':n.label
          const x=(n.x+c.x)*c.k+W/2,y=(n.y+c.y)*c.k+H/2-rr*c.k-5
          const w=ctx.measureText(label).width*c.k
          const priority=n.id===hov
          if(x+w/2<0||x-w/2>W||y<0||y>H)continue
          if(!priority&&(labelBoxes.length>120||labelBoxes.some(b=>Math.abs(b.y-y)<14&&Math.abs(b.x-x)<(b.w+w)/2+5)))continue
          labelBoxes.push({x,y,w});ctx.fillText(label,n.x,n.y-rr-5/c.k)
        }
      }
    }
    const draw = () => { raf = requestAnimationFrame(draw); paint(performance.now()) }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('dblclick', onDblClick)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [data, sim, fit])

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={wrapRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="block touch-none" aria-label={tr("知识图谱画布")} />
      </div>

      {/* 选中节点详情 */}
      {(hovered || selected) && (
        <div className="ui-pop-in pointer-events-none absolute right-3 top-3 w-56 rounded-lg border border-line bg-panel/95 p-3.5 shadow-pop">
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
