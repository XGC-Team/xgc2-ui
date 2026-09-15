import {describe,expect,it} from 'vitest'
import {currentNodeId,kindStage,liveLine,nodeStatus,type PlanNode,type Run} from '../src/features/workflow/workflow-model'

const nodes: PlanNode[] = [
  {id: 'read', kind: 'EvidenceRead', title: '读证据', objective: '', acceptance: [], inputs: [], dependsOn: []},
  {id: 'check', kind: 'DerivationCheck', title: '核对推导', objective: '', acceptance: [], inputs: [], dependsOn: ['read']},
  {id: 'review', kind: 'Review', title: '独立审查', objective: '', acceptance: [], inputs: [], dependsOn: ['check']},
  {id: 'write', kind: 'Synthesis', title: '写作', objective: '', acceptance: [], inputs: [], dependsOn: ['review']},
]

function run(partial: Partial<Run> & {receipts: Run['receipts']}): Run {
  return {id: 'r', status: 'running', researchAcceptance: 'not-reviewed', ...partial}
}

describe('workflow-model', () => {
  it('kind 映射到三阶段', () => {
    expect(kindStage('EvidenceRead')).toBe('research')
    expect(kindStage('Review')).toBe('review')
    expect(kindStage('Synthesis')).toBe('write')
  })
  it('研究进行中：研究节点 running，后续 queued/idle', () => {
    const r = run({receipts: [{stage: 'research', sessionId: 's', turnId: 't', status: 'running', output: '正在读证据'}]})
    expect(nodeStatus('EvidenceRead', r)).toBe('running')
    expect(nodeStatus('DerivationCheck', r)).toBe('running')
    expect(nodeStatus('Review', r)).toBe('queued')
    expect(nodeStatus('Synthesis', r)).toBe('idle')
  })
  it('当前步骤优先命中回执里最后出现的节点标题', () => {
    const r = run({receipts: [{stage: 'research', sessionId: 's', turnId: 't', status: 'running', output: '读证据完成。开始核对推导。'}]})
    expect(currentNodeId(nodes, r)).toBe('check')
  })
  it('活体一行取事件或输出末行', () => {
    const r = run({receipts: [{stage: 'research', sessionId: 's1', turnId: 't', status: 'running', output: 'old\nnew line', events: [{kind: 'notice', text: 'tool: rg lemma'}]}]})
    expect(liveLine(r)).toEqual({stage: 'research', text: 'tool: rg lemma', sessionId: 's1'})
  })
  it('无运行则全 idle', () => {
    expect(nodeStatus('EvidenceRead')).toBe('idle')
    expect(currentNodeId(nodes)).toBe('')
    expect(liveLine()).toBeNull()
  })
})
