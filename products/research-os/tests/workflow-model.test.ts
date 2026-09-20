import {describe, expect, it, afterEach, vi} from 'vitest'
import {currentNodeId, defaultRole, liveLine, nodeAgent, nodeStatus, RUN_SCHEMA, SNAPSHOT_SCHEMA, type PlanNode, type Receipt, type Revision, type Run} from '../src/features/workflow/workflow-model'
import {parseWorkflowSnapshot, prepareExecutionIntent, reconcileExecutionIntent, subscribeWorkflow, type IntentStorage} from '../src/features/workflow/workflow-client'

const nodes: PlanNode[] = [
  {id: 'read', kind: 'EvidenceRead', title: '读证据', objective: 'read', acceptance: ['source'], inputs: [], dependsOn: []},
  {id: 'check', kind: 'EvidenceRead', title: '核对证据', objective: 'check', acceptance: ['source'], inputs: [], dependsOn: ['read'], agent: 'challenger'},
]
const digest = 'a'.repeat(64)
function receipt(id: string, status = 'running'): Receipt {
  return {stage: id, kind: 'EvidenceRead', profileId: 'codex', sessionId: `s-${id}`, turnId: `t-${id}`, status, output: '检查证据', dispatchIntent: true, lastSeq: 3, events: [], toolResultEvents: []}
}
function run(partial: Partial<Run> = {}): Run {
  return {schemaVersion: RUN_SCHEMA, id: 'plan_1', requestKey: 'request', version: 1, digest, status: 'running', startedAt: '2026-09-20T00:00:00Z', researchAcceptance: 'not-reviewed', receipts: [receipt('read')], ...partial}
}
function revision(runs: Run[] = []): Revision {
  return {projectId: 'project', version: 1, digest, createdAt: '2026-09-20T00:00:00Z', approved: true, runs, draft: {title: 'test', goal: 'verify', workspace: {id: 'workspace', revision: 'b'.repeat(40)}, researcher: 'codex', reviewer: 'reviewer', writer: 'writer', nodes}}
}
function storage(): IntentStorage {
  const data = new Map<string, string>()
  return {getItem: key => data.get(key) ?? null, setItem: (key, value) => {data.set(key, value)}, removeItem: key => {data.delete(key)}}
}
const snapshot = (r = revision()) => JSON.stringify({schemaVersion: SNAPSHOT_SCHEMA, projectId: 'project', revisions: [r]})
afterEach(() => {vi.useRealTimers(); vi.unstubAllGlobals()})

describe('actual workflow node receipts', () => {
  it('same-kind nodes do not share progress', () => {
    expect(nodeStatus('read', run())).toBe('running')
    expect(nodeStatus('check', run())).toBe('queued')
  })
  it('later failure never rewrites an earlier completed receipt', () => {
    const r = run({status: 'failed', receipts: [receipt('read', 'completed'), receipt('check', 'failed')]})
    expect(nodeStatus('read', r)).toBe('done')
    expect(nodeStatus('check', r)).toBe('failed')
  })
  it('current identity does not depend on model prose', () => {
    const r = run(); r.receipts[0].output = '读证据完成。正在核对证据 check。'
    expect(currentNodeId(nodes, r)).toBe('read')
  })
  it('shows pending approval, interrupted outcomes and exact tool event text', () => {
    const r = run({receipts: [receipt('read', 'awaiting-input')]})
    expect(nodeStatus('read', r)).toBe('awaiting')
    r.receipts[0].events = [{kind: 'notice', text: 'tool: rg lemma'}]
    expect(liveLine(r)).toEqual({stage: 'read', text: 'tool: rg lemma', sessionId: 's-read'})
    r.status = 'interrupted'; expect(nodeStatus('read', r)).toBe('interrupted'); expect(liveLine(r)).toBeNull()
  })
  it('default roles select profiles, not hidden execution stages', () => {
    expect(defaultRole('Review')).toBe('reviewer')
    expect(nodeAgent(nodes[0], revision().draft)).toBe('codex')
    expect(nodeAgent(nodes[1], revision().draft)).toBe('challenger')
    expect(nodeStatus('read')).toBe('idle')
  })
})

describe('current snapshot and durable execution intent', () => {
  it('accepts current identities and rejects cross-project or old stage contracts', () => {
    expect(parseWorkflowSnapshot(snapshot(revision([run()])), 'project').revisions[0].runs[0].receipts[0].stage).toBe('read')
    expect(() => parseWorkflowSnapshot(snapshot(), 'other')).toThrow()
    const old = run(); delete (old as Partial<Run>).schemaVersion
    expect(() => parseWorkflowSnapshot(snapshot(revision([old])), 'project')).toThrow()
    const guessed = run({receipts: [receipt('research')]})
    expect(() => parseWorkflowSnapshot(snapshot(revision([guessed])), 'project')).toThrow()
  })
  it('preserves the same key through response loss and page reload', () => {
    const s = storage(), r = revision(), key = prepareExecutionIntent(s, 'project', r)
    expect(prepareExecutionIntent(s, 'project', structuredClone(r))).toBe(key)
    const received = revision([run({status: 'completed', requestKey: key})])
    expect(prepareExecutionIntent(s, 'project', received)).toBe(key)
    reconcileExecutionIntent(s, 'project', received)
    expect(prepareExecutionIntent(s, 'project', received)).not.toBe(key)
  })
  it('tabs seeing the same confirmed run converge on one request key', () => {
    expect(prepareExecutionIntent(storage(), 'project', revision())).toBe(prepareExecutionIntent(storage(), 'project', revision()))
  })
  it('will not dispatch without durable storage or over an unresolved run', () => {
    const s = storage(); s.setItem = () => {throw new Error('storage denied')}
    expect(() => prepareExecutionIntent(s, 'project', revision())).toThrow('storage denied')
    expect(() => prepareExecutionIntent(storage(), 'project', revision([run({status: 'interrupted'})]))).toThrow()
  })
})

class SourceFixture {
  static instances: SourceFixture[] = []
  onerror: (() => void) | null = null
  closed = false
  handlers = new Map<string, (event: {data: string}) => void>()
  constructor(readonly url: string) {SourceFixture.instances.push(this)}
  addEventListener(name: string, callback: (event: {data: string}) => void) {this.handlers.set(name, callback)}
  close() {this.closed = true}
  emit(data: string) {this.handlers.get('workflow-snapshot')?.({data})}
}
describe('read-only reconnect transport', () => {
  it('reconnects with backoff and never POSTs or cancels on disposal', () => {
    vi.useFakeTimers(); SourceFixture.instances = []
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); vi.stubGlobal('EventSource', SourceFixture)
    const accept = vi.fn(), state = vi.fn(), stop = subscribeWorkflow('project', {snapshot: accept, state})
    const first = SourceFixture.instances[0]
    expect(first.url).toBe('/api/v1/research/projects/project/plans/events')
    first.emit(snapshot()); expect(accept).toHaveBeenCalledTimes(1)
    first.onerror?.(); expect(first.closed).toBe(true)
    vi.advanceTimersByTime(2000); expect(SourceFixture.instances).toHaveLength(2)
    first.emit(snapshot()); expect(accept).toHaveBeenCalledTimes(1)
    SourceFixture.instances[1].emit(snapshot()); expect(accept).toHaveBeenCalledTimes(2)
    stop(); expect(SourceFixture.instances[1].closed).toBe(true)
    vi.runAllTimers(); expect(SourceFixture.instances).toHaveLength(2); expect(fetch).not.toHaveBeenCalled()
  })
  it('fails closed on a mismatched schema rather than retrying old compatibility paths', () => {
    vi.useFakeTimers(); SourceFixture.instances = []; vi.stubGlobal('EventSource', SourceFixture)
    const state = vi.fn(), stop = subscribeWorkflow('project', {snapshot: vi.fn(), state})
    SourceFixture.instances[0].emit('{"schemaVersion":"old"}')
    expect(SourceFixture.instances[0].closed).toBe(true); expect(state).toHaveBeenLastCalledWith('error', expect.any(String))
    vi.runAllTimers(); expect(SourceFixture.instances).toHaveLength(1); stop()
  })
})
