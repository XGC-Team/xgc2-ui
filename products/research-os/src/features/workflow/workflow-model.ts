/** Approved nodes and their actual native receipts. No inferred execution phases. */
import type {ResourceReference} from '../content/content-model'
export type ResourceRef = ResourceReference
export type StepExecution = {type: 'agent' | 'human' | 'tool' | 'build' | 'xgc2-result'; toolRef?: ResourceRef; input?: unknown; buildTask?: unknown; runtime?: {executable: string; digest: string; environment: string[]}}
export type FrozenAsset = {ref: ResourceRef; definition?: unknown; content?: string; object?: Record<string, unknown>}
export type WorkflowDefinition = {goal: string; nodes: PlanNode[]; methodRefs?: ResourceRef[]}
export type ToolDefinition = {executor: 'script' | 'build' | 'xgc2-result'; implementation?: ResourceRef; files?: ResourceRef[]; interpreter?: 'python3' | 'node' | 'bash'; argv?: string[]; outputs?: string[]; timeoutSeconds?: number; input?: unknown}
export const RUN_SCHEMA = 'xgc.research.workflow-run/v1' as const
export const SNAPSHOT_SCHEMA = 'xgc.research.workflow-snapshot/v1' as const
export type InvokeKind = 'research' | 'continuous' | 'verification' | 'archive' | 'writing'
export type PlanNode = {
  id: string; kind: string; title: string; objective: string
  acceptance: string[]; inputs: string[]; dependsOn: string[]
  agent?: string; knowledge?: string[]; hypothesis?: string; position?: '' | 'support' | 'challenge'
  execution?: StepExecution
}
export type Draft = {
  title: string; goal: string; nodes: PlanNode[]; workspace: {id: string; revision: string}
  researcher: string; reviewer: string; writer: string
  source?: ResourceRef; frozenAssets?: FrozenAsset[]; bindings?: unknown
}
export type ReceiptEvent = {seq?: number; kind?: string; text?: string; status?: string; role?: string}
export type Receipt = {
  stage: string; kind: string; profileId: string; sessionId: string; turnId: string
  status: string; output: string; outputDigest?: string; promptDigest?: string
  dispatchIntent: boolean; lastSeq: number; toolResultEvents: number[] | null
  events: ReceiptEvent[]; stopError?: string; cleanup?: string
  executor?: StepExecution['type']; inputDigest?: string; receiptDigest?: string; operationId?: string
  artifacts?: ResourceRef[]; sourceRefs?: ResourceRef[]
}
export type Hypothesis = {claim: string; grounds: string[]}
export type Branch = {stance: string; status: string; nodeId?: string; tool?: string; output?: string; outputDigest?: string; error?: string}
export type Adjudication = {outcome: string; rationale: string; actorRef: string; branchDigests: string[]; judgedAt?: string}
export type Run = {
  schemaVersion: typeof RUN_SCHEMA; id: string; requestKey: string; version: number; digest: string
  status: 'running' | 'paused' | 'interrupted' | 'completed' | 'failed' | 'cancelled' | 'needs_changes' | 'awaiting-adjudication' | 'awaiting-input'
  kind?: InvokeKind; subscriptionId?: string; hypothesis?: Hypothesis; branches?: Branch[]; adjudication?: Adjudication
  control?: 'pause' | 'cancel'; failure?: string; startedAt: string; finishedAt?: string
  researchAcceptance: string; receipts: Receipt[]
}
export type Revision = {projectId: string; version: number; digest: string; createdAt: string; draft: Draft; approved: boolean; runs: Run[]}
export type WorkflowSnapshot = {schemaVersion: typeof SNAPSHOT_SCHEMA; projectId: string; revisions: Revision[]}
export type NodeStatus = 'idle' | 'queued' | 'running' | 'awaiting' | 'done' | 'failed' | 'interrupted' | 'paused' | 'cancelled' | 'needs-review'
export const NODE_STATUS_LABEL: Record<NodeStatus, string> = {
  idle: '未运行', queued: '待执行', running: '执行中', awaiting: '等待审批', done: '执行完成',
  failed: '执行失败', interrupted: '结果待恢复核对', paused: '已暂停', cancelled: '已确认取消', 'needs-review': '证据需补充',
}
export type DefaultRole = 'researcher' | 'reviewer' | 'writer'
export function defaultRole(kind: string): DefaultRole {
  return kind === 'Review' ? 'reviewer' : kind === 'Synthesis' ? 'writer' : 'researcher'
}
export function unresolved(run: Run): boolean {
  return run.status === 'running' || run.status === 'paused' || run.status === 'interrupted' || run.status === 'awaiting-adjudication' || run.status === 'awaiting-input'
}
export function recoverable(run: Run): boolean {
  return run.status === 'paused' || run.status === 'interrupted'
}
export function nodeStatus(id: string, run?: Run): NodeStatus {
  if (!run) return 'idle'
  const receipt = run.receipts.find(r => r.stage === id)
  if (!receipt) return run.status === 'running' ? 'queued' : run.status === 'paused' ? 'paused' : 'idle'
  if (receipt.status === 'completed') {
    return run.status === 'needs_changes' && run.receipts.at(-1)?.stage === id ? 'needs-review' : 'done'
  }
  if (receipt.status === 'failed') return 'failed'
  if (receipt.status === 'cancelled') return 'cancelled'
  if (run.status === 'interrupted') return 'interrupted'
  if (run.status === 'paused') return 'paused'
  if (receipt.status === 'awaiting-input') return 'awaiting'
  if (run.status === 'running') return 'running'
  return 'idle'
}
export function currentNodeId(nodes: PlanNode[], run?: Run): string {
  if (!run || run.status !== 'running') return ''
  const receipt = run.receipts.at(-1)
  if (!receipt || ['completed', 'failed', 'cancelled'].includes(receipt.status)) return ''
  return nodes.some(node => node.id === receipt.stage) ? receipt.stage : ''
}
export function liveLine(run?: Run): {stage: string; text: string; sessionId: string} | null {
  if (!run || run.status !== 'running') return null
  const receipt = run.receipts.at(-1)
  if (!receipt || ['completed', 'failed', 'cancelled'].includes(receipt.status)) return null
  const event = [...receipt.events].reverse().find(e => (e.text || '').trim())
  const line = event?.text || receipt.output.trim().split('\n').filter(Boolean).at(-1) || ''
  return {stage: receipt.stage, text: line.replace(/\s+/g, ' ').slice(0, 140), sessionId: receipt.sessionId}
}
export function nodeAgent(node: PlanNode, draft?: Draft): string {
  if (node.execution && node.execution.type !== 'agent') return ''
  return node.agent || (draft ? draft[defaultRole(node.kind)] : '')
}
