/* 思维白板数据模型：存进项目 git 仓库的 thinking.canvas.json，随仓库版本化。
   节点 = 章节 / 想法；边 = 关联；ref = 知识库笔记引用；anchor = 源稿文件锚点。 */
export type CanvasNodeKind = 'chapter' | 'idea'
export type CanvasNode = {
  id: string
  kind: CanvasNodeKind
  title: string
  body?: string
  x: number
  y: number
  ref?: { path: string; title: string }
  anchor?: string
}
export type CanvasEdge = { from: string; to: string }
export type ThinkingCanvas = { version: 1; nodes: CanvasNode[]; edges: CanvasEdge[] }

export const CANVAS_PATH = 'thinking.canvas.json'

export function emptyCanvas(): ThinkingCanvas {
  return { version: 1, nodes: [], edges: [] }
}

export function parseCanvas(text: string): ThinkingCanvas {
  try {
    const raw = JSON.parse(text) as Partial<ThinkingCanvas>
    const nodes = Array.isArray(raw.nodes) ? raw.nodes.filter(n => n && typeof n.id === 'string' && typeof n.title === 'string') : []
    const ids = new Set(nodes.map(n => n.id))
    const edges = Array.isArray(raw.edges) ? raw.edges.filter(e => e && ids.has(e.from) && ids.has(e.to)) : []
    return { version: 1, nodes, edges }
  } catch {
    return emptyCanvas()
  }
}

export function serializeCanvas(canvas: ThinkingCanvas): string {
  return JSON.stringify(canvas, null, 2) + '\n'
}

/* 白板拓扑 → 写作系统提示词：章节按版面顺序（先 y 后 x），想法挂在有边相连的章节下，
   知识引用写 [[path]]，源稿锚点写 @path。这份文本就是给大模型的结构化约束。 */
export function canvasToPrompt(canvas: ThinkingCanvas, projectTitle: string): string {
  const chapters = canvas.nodes.filter(n => n.kind === 'chapter').sort((a, b) => a.y - b.y || a.x - b.x)
  const ideas = canvas.nodes.filter(n => n.kind === 'idea')
  const attached = new Set<string>()
  const lines: string[] = [`# ${projectTitle} · 写作蓝图`, '']
  const nodeLine = (n: CanvasNode, prefix: string) => {
    const extras = [n.ref ? `[[${n.ref.path}]]` : '', n.anchor ? `@${n.anchor}` : ''].filter(Boolean).join(' ')
    lines.push(`${prefix}${n.title}${extras ? ` ${extras}` : ''}`)
    if (n.body?.trim()) lines.push(`${prefix}  ${n.body.trim().replace(/\n+/g, ' ')}`)
  }
  chapters.forEach((chapter, index) => {
    nodeLine(chapter, `${index + 1}. `)
    const children = canvas.edges.filter(e => e.from === chapter.id).map(e => ideas.find(n => n.id === e.to)).filter((n): n is CanvasNode => Boolean(n))
    children.sort((a, b) => a.y - b.y || a.x - b.x).forEach(idea => { attached.add(idea.id); nodeLine(idea, `   - `) })
  })
  const loose = ideas.filter(n => !attached.has(n.id)).sort((a, b) => a.y - b.y || a.x - b.x)
  if (loose.length) {
    lines.push('', '## 待归档想法')
    loose.forEach(idea => nodeLine(idea, '- '))
  }
  return lines.join('\n') + '\n'
}
