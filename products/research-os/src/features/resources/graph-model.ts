export type GraphNode = {id:string;kind:string;label:string;revision:string;summary?:string}
export type GraphEdge = {id:string;source:string;target:string;label:string;state:string;evidenceRefs:string[]}
export type GraphSnapshot = {id:string;scope:string;complete:boolean;nodes:GraphNode[];edges:GraphEdge[]}
import type { ResearchThread } from './thread-contracts'

export type ResearchGraphSelection = { kind: string; id: string }
/** Project recorded relations only. Missing targets stay outside this partial view. */
export function researchGraph(thread: ResearchThread): GraphSnapshot {
  const nodes = new Map<string, GraphNode>()
  const edges = new Map<string, GraphEdge>()
  const key = (kind: string, id: string) => `${kind}:${id}`
  const add = (kind: string, id: string, label: string, revision: string, summary?: string) => {
    const nodeId = key(kind, id)
    nodes.set(nodeId, { id: nodeId, kind, label, revision, summary })
    return nodeId
  }
  const link = (id: string, source: string, target: string, label: string, evidenceRefs: string[] = []) => {
    if (nodes.has(source) && nodes.has(target)) edges.set(id, { id, source, target, label, state: 'confirmed', evidenceRefs })
  }
  const project = add('project', thread.project.projectId, thread.project.title, thread.updatedAt, thread.project.summary)
  for (const q of thread.questions) {
    const id = add('question', `${q.questionId}@${q.revision}`, q.title, q.digest, q.question)
    link(`project-${id}`, project, id, '研究问题')
  }
  for (const group of thread.campaigns) {
    const c = group.campaign
    const id = add('campaign', c.campaignId, `讨论 · ${c.status}`, c.questionRevisionDigest)
    link(`campaign-${id}`, key('question', c.questionRevisionRef), id, '讨论')
    for (const contribution of group.contributions) {
      const cid = add('contribution', contribution.contributionId, `${contribution.role} · ${contribution.kind}`, contribution.contentDigest, contribution.documentRef)
      link(`contribution-${cid}`, id, cid, contribution.kind, contribution.evidenceRefs)
    }
    for (const decision of group.decisions) {
      const did = add('decision', decision.decisionId, '研究裁决', decision.rationaleDigest, decision.rationaleDocumentRef)
      link(`decision-${did}`, id, did, '裁决')
      for (const [relation, ids] of [['采纳', decision.acceptedContributionIds], ['拒绝', decision.rejectedContributionIds], ['保留异议', decision.dissentContributionIds]] as const)
        for (const cid of ids) link(`${did}-${relation}-${cid}`, did, key('contribution', cid), relation)
    }
  }
  for (const { sourceItem, sourceRevision } of thread.knowledge)
    add('knowledge', sourceItem.id, sourceItem.title, sourceRevision.contentSha256, sourceRevision.bodySummary)
  for (const { link: relation, sourceItem } of thread.knowledge) {
    const targetKind = relation.toKind === 'knowledge-item' ? 'knowledge' : relation.toKind === 'research-project' ? 'project' : relation.toKind
    link(relation.id, key('knowledge', sourceItem.id), key(targetKind, relation.toId), relation.relation)
  }
  return { id: `${thread.project.projectId}:${thread.updatedAt}`, scope: thread.project.projectId, complete: false, nodes: [...nodes.values()], edges: [...edges.values()] }
}
export function graphSelection(id: string): ResearchGraphSelection {
  const delimiter = id.indexOf(':')
  return { kind: id.slice(0, delimiter), id: id.slice(delimiter + 1) }
}
