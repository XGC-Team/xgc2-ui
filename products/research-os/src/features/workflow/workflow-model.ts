/* 研究计划的前端合同：节点 DAG + 三阶段原生执行回执。
   执行仍是 research → review → write；节点按 kind 映射到阶段，活体进度从回执推导。 */
export type PlanNode = {
  id: string
  kind: string
  title: string
  objective: string
  acceptance: string[]
  inputs: string[]
  dependsOn: string[]
  agent?: string
  knowledge?: string[]
}
export type Draft = {
  title: string
  goal: string
  nodes: PlanNode[]
  workspace: {id: string; revision: string}
  researcher: string
  reviewer: string
  writer: string
}
export type ReceiptEvent = {kind?: string; text?: string; status?: string; role?: string}
export type Receipt = {
  stage: string
  sessionId: string
  turnId: string
  status: string
  output: string
  events?: ReceiptEvent[]
}
export type Run = {
  id: string
  status: string
  failure?: string
  researchAcceptance: string
  receipts: Receipt[]
}
export type NodeStatus = 'idle' | 'queued' | 'running' | 'awaiting' | 'done' | 'failed'
export const STAGES = ['research', 'review', 'write'] as const
export type Stage = (typeof STAGES)[number]

export function kindStage(kind: string): Stage {
  if (kind === 'Review') return 'review'
  if (kind === 'Synthesis') return 'write'
  return 'research'
}

export function crewRole(stage: Stage): 'researcher' | 'reviewer' | 'writer' {
  return stage === 'research' ? 'researcher' : stage === 'review' ? 'reviewer' : 'writer'
}

function receiptOf(run: Run | undefined, stage: Stage): Receipt | undefined {
  return run?.receipts.find(r => r.stage === stage)
}

function finished(status: string): boolean {
  return status === 'completed' || status === 'success'
}

function failed(status: string): boolean {
  return status === 'failed' || status === 'cancelled' || status === 'needs_changes'
}

export function nodeStatus(kind: string, run?: Run): NodeStatus {
  if (!run) return 'idle'
  const stage = kindStage(kind)
  const receipt = receiptOf(run, stage)
  if (receipt) {
    if (failed(receipt.status) || failed(run.status)) return 'failed'
    if (finished(receipt.status)) return 'done'
    if (receipt.status === 'awaiting-input') return 'awaiting'
    if (run.status === 'running' || receipt.status === 'running' || receipt.status === 'starting' || receipt.status === 'ready') return 'running'
  }
  if (run.status === 'running') {
    const current = run.receipts[run.receipts.length - 1]?.stage
    const currentIdx = STAGES.indexOf(current as Stage)
    const idx = STAGES.indexOf(stage)
    if (idx === currentIdx + 1) return 'queued'
    return 'idle'
  }
  if (run.status === 'needs_changes' && stage === 'review') return 'failed'
  return 'idle'
}

/* 当前步骤：同阶段节点里，回执正文最后提到的标题/id；否则该阶段的第一个节点。 */
export function currentNodeId(nodes: PlanNode[], run?: Run): string {
  if (!run || run.status !== 'running') return ''
  const receipt = run.receipts[run.receipts.length - 1]
  if (!receipt || finished(receipt.status) || failed(receipt.status)) return ''
  const candidates = nodes.filter(n => kindStage(n.kind) === receipt.stage)
  const haystack = `${receipt.output}\n${(receipt.events || []).map(e => e.text || '').join('\n')}`
  for (let i = candidates.length - 1; i >= 0; i--) {
    const n = candidates[i]
    if (n.title && haystack.includes(n.title)) return n.id
    if (haystack.includes(n.id)) return n.id
  }
  return candidates[0]?.id || ''
}

export function liveLine(run?: Run): {stage: string; text: string; sessionId: string} | null {
  if (!run) return null
  const receipt = [...(run.receipts || [])].reverse().find(r => r.status === 'running' || r.status === 'starting' || r.status === 'awaiting-input' || r.status === 'ready')
  if (!receipt) return null
  const eventText = [...(receipt.events || [])].reverse().find(e => (e.text || '').trim())?.text?.trim() || ''
  const outputLine = receipt.output.trim().split('\n').filter(Boolean).at(-1) || ''
  const text = (eventText || outputLine).replace(/\s+/g, ' ').slice(0, 140)
  return {stage: receipt.stage, text, sessionId: receipt.sessionId}
}

export function nodeAgent(node: PlanNode, draft?: Draft): string {
  if (node.agent) return node.agent
  if (!draft) return ''
  return draft[crewRole(kindStage(node.kind))]
}
