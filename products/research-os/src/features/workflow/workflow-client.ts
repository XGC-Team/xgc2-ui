import {RUN_SCHEMA, SNAPSHOT_SCHEMA, unresolved, type Draft, type PlanNode, type Receipt, type Revision, type Run, type WorkflowSnapshot} from './workflow-model'

export function workflowBase(project: string): string {
  return `/api/v1/research/projects/${encodeURIComponent(project)}/plans`
}
export async function workflowRequest<T>(url: string, body?: unknown, key?: string): Promise<T> {
  const response = await fetch(url, body === undefined ? undefined : {
    method: 'POST', headers: {'Content-Type': 'application/json', ...(key ? {'Idempotency-Key': key} : {})}, body: JSON.stringify(body),
  })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error?.message || `Request failed (${response.status})`)
  return value.data as T
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('工作流快照不是有效对象。')
  return value as Record<string, unknown>
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('工作流快照缺少列表。')
  return value
}
function textList(value: unknown): string[] {
  // A current Go DTO may encode an empty optional list as null; no old schema
  // or stage aliases are upgraded here.
  if (value == null) return []
  const values = list(value)
  if (!values.every(item => typeof item === 'string')) throw new Error('工作流输入引用无效。')
  return values as string[]
}
export function parseWorkflowSnapshot(raw: string, project: string): WorkflowSnapshot {
  const snapshot = record(JSON.parse(raw))
  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA || snapshot.projectId !== project) throw new Error('工作流合同或项目不匹配；已停止订阅，不会启动任务。')
  const revisions = list(snapshot.revisions).map(value => {
    const revision = record(value), draft = record(revision.draft), workspace = record(draft.workspace)
    if (revision.projectId !== project || !Number.isInteger(revision.version) || (revision.version as number) < 1 || typeof revision.digest !== 'string' || !/^[a-f0-9]{64}$/.test(revision.digest) || typeof revision.approved !== 'boolean') throw new Error('工作流版本身份无效。')
    if (typeof draft.title !== 'string' || typeof draft.goal !== 'string' || typeof workspace.id !== 'string' || typeof workspace.revision !== 'string') throw new Error('工作流定义无效。')
    const identities = new Set<string>()
    const nodes = list(draft.nodes).map(value => {
      const node = record(value)
      if (typeof node.id !== 'string' || identities.has(node.id) || typeof node.kind !== 'string' || typeof node.title !== 'string' || typeof node.objective !== 'string') throw new Error('工作流节点身份无效。')
      identities.add(node.id)
      return {...node, acceptance: textList(node.acceptance), inputs: textList(node.inputs), dependsOn: textList(node.dependsOn), knowledge: textList(node.knowledge)} as PlanNode
    })
    const runs = list(revision.runs).map(value => {
      const run = record(value)
      if (run.schemaVersion !== RUN_SCHEMA || run.version !== revision.version || run.digest !== revision.digest || typeof run.id !== 'string' || typeof run.requestKey !== 'string' || typeof run.status !== 'string') throw new Error('运行合同不匹配；历史运行不会被兼容升级或重新派发。')
      const seen = new Set<string>()
      const receipts = list(run.receipts).map(value => {
        const receipt = record(value)
        if (typeof receipt.stage !== 'string' || !identities.has(receipt.stage) || seen.has(receipt.stage) || typeof receipt.kind !== 'string' || typeof receipt.profileId !== 'string' || typeof receipt.status !== 'string' || typeof receipt.output !== 'string') throw new Error('节点回执身份不匹配。')
        seen.add(receipt.stage)
        return {...receipt, events: list(receipt.events)} as Receipt
      })
      return {...run, receipts} as Run
    })
    return {...revision, draft: {...draft, nodes} as Draft, runs} as Revision
  })
  return {schemaVersion: SNAPSHOT_SCHEMA, projectId: project, revisions}
}
export type StreamState = 'connecting' | 'live' | 'reconnecting' | 'error'
type StreamCallbacks = {snapshot: (snapshot: WorkflowSnapshot) => void; state: (state: StreamState, message?: string) => void}

/** Read-only transport. Page disposal never cancels or resumes a native turn. */
export function subscribeWorkflow(project: string, callbacks: StreamCallbacks): () => void {
  let closed = false, source: EventSource | undefined, retry: ReturnType<typeof setTimeout> | undefined, failures = 0
  const connect = () => {
    if (closed) return
    callbacks.state(failures ? 'reconnecting' : 'connecting')
    try { source = new EventSource(`${workflowBase(project)}/events`) }
    catch (error) { callbacks.state('error', error instanceof Error ? error.message : String(error)); return }
    const current = source
    current.addEventListener('workflow-snapshot', event => {
      if (closed || source !== current) return
      try {
        const snapshot = parseWorkflowSnapshot((event as MessageEvent<string>).data, project)
        callbacks.snapshot(snapshot)
        failures = 0; callbacks.state('live')
      } catch (error) {
        current.close(); source = undefined
        callbacks.state('error', error instanceof Error ? error.message : String(error))
      }
    })
    const reconnect = () => {
      if (closed || source !== current) return
      current.close(); source = undefined
      callbacks.state('reconnecting', '连接已中断，正在重新订阅原运行；后台任务不会因此重新提交。')
      retry = setTimeout(connect, Math.min(30000, 2000 * 2 ** Math.min(failures++, 4)))
    }
    current.addEventListener('workflow-error', reconnect)
    current.onerror = reconnect
  }
  connect()
  return () => {closed = true; source?.close(); if (retry !== undefined) clearTimeout(retry)}
}

export type IntentStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type ExecutionIntent = {schemaVersion: 'xgc.research.workflow-intent/v1'; project: string; version: number; digest: string; key: string}
const intentSlot = (project: string, revision: Pick<Revision, 'version' | 'digest'>) => `xgc.research.workflow-intent/${encodeURIComponent(project)}/${revision.version}/${revision.digest}`
function readIntent(storage: IntentStorage, project: string, revision: Pick<Revision, 'version' | 'digest'>): ExecutionIntent | null {
  const raw = storage.getItem(intentSlot(project, revision))
  if (raw === null) return null
  const intent = record(JSON.parse(raw))
  if (intent.schemaVersion !== 'xgc.research.workflow-intent/v1' || intent.project !== project || intent.version !== revision.version || intent.digest !== revision.digest || typeof intent.key !== 'string' || !intent.key || intent.key.length > 128) throw new Error('本地待确认运行身份不匹配；拒绝生成新请求覆盖它。')
  return intent as ExecutionIntent
}
export function prepareExecutionIntent(storage: IntentStorage, project: string, revision: Revision): string {
  const existing = readIntent(storage, project, revision)
  if (existing) return existing.key
  if (!revision.approved || revision.runs.some(unresolved)) throw new Error('请先批准版本，或恢复现有未决运行。')
  // The same last CONFIRMED run produces the same key across tabs. A response
  // loss/reload cannot silently mint another operation. Reruns are explicit UI actions.
  const anchor = revision.runs[0]?.id || 'initial'
  const key = `workflow-v1:${revision.digest}:${anchor}`
  if (key.length > 128) throw new Error('运行身份超过合同长度。')
  const intent: ExecutionIntent = {schemaVersion: 'xgc.research.workflow-intent/v1', project, version: revision.version, digest: revision.digest, key}
  const raw = JSON.stringify(intent), slot = intentSlot(project, revision)
  storage.setItem(slot, raw)
  if (storage.getItem(slot) !== raw) throw new Error('另一页面修改了待确认运行，请重新读取状态。')
  return key
}
export function reconcileExecutionIntent(storage: IntentStorage, project: string, revision: Revision): void {
  const intent = readIntent(storage, project, revision)
  if (intent && revision.runs.some(run => run.requestKey === intent.key)) storage.removeItem(intentSlot(project, revision))
}
