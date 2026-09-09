export const RESEARCH_KNOWLEDGE_KINDS = [
  'reading-note',
  'concept',
  'equation',
  'assumption',
  'idea',
  'hypothesis',
  'claim',
  'counterexample',
  'method',
  'decision',
  'failure-pattern',
  'open-question',
] as const

export const RESEARCH_KNOWLEDGE_AUTHOR_KINDS = ['human', 'agent', 'tool', 'import'] as const

export type ResearchKnowledgeKind = (typeof RESEARCH_KNOWLEDGE_KINDS)[number]
export type ResearchKnowledgeAuthorKind = (typeof RESEARCH_KNOWLEDGE_AUTHOR_KINDS)[number]

export type ResearchThreadProject = {
  schemaVersion: string
  projectId: string
  slug: string
  title: string
  summary?: string
  createdAt: string
  createdBy: string
}

export type ResearchThreadQuestion = {
  schemaVersion: string
  questionId: string
  projectId: string
  revision: number
  supersedes?: string
  digest: string
  title: string
  question: string
  scope: string
  successCriteria: string[]
  createdAt: string
  createdBy: string
}

export type ResearchThreadProtocolPin = {
  protocolId: string
  revision: number
  digest: string
}

export type ResearchThreadCampaignRecord = {
  schemaVersion: string
  campaignId: string
  projectId: string
  questionRevisionRef: string
  questionRevisionDigest: string
  protocol: ResearchThreadProtocolPin
  status: 'open' | 'decided' | 'closed'
  createdAt: string
  createdBy: string
}

export type ResearchThreadContribution = {
  schemaVersion: string
  contributionId: string
  campaignId: string
  stageId: string
  routeId: string
  kind: 'proposal' | 'critique' | 'failure' | 'synthesis'
  role: string
  authorRef: string
  documentRef: string
  contentDigest: string
  evidenceRefs: string[]
  agentRun?: Record<string, unknown>
  orchestration?: Record<string, unknown>
  createdAt: string
}

export type ResearchThreadDecision = {
  schemaVersion: string
  decisionId: string
  campaignId: string
  acceptedContributionIds: string[]
  rejectedContributionIds: string[]
  dissentContributionIds: string[]
  rationaleDocumentRef: string
  rationaleDigest: string
  decidedBy: string
  decidedAt: string
}

export type ResearchThreadCampaign = {
  campaign: ResearchThreadCampaignRecord
  contributions: ResearchThreadContribution[]
  decisions: ResearchThreadDecision[]
}

export type ResearchThreadTypedLink = {
  id: string
  fromRevisionId: string
  toKind: string
  toId: string
  relation: string
  createdAt: string
}

export type ResearchThreadKnowledgeItem = {
  id: string
  kind: string
  title: string
  currentRevisionId?: string
  createdAt: string
  updatedAt: string
}

export type ResearchThreadKnowledgeRevision = {
  id: string
  knowledgeItemId: string
  parentRevisionId?: string
  bodySummary: string
  contentSha256: string
  authorKind: string
  createdAt: string
}

export type ResearchThreadKnowledgeBacklink = {
  link: ResearchThreadTypedLink
  sourceItem: ResearchThreadKnowledgeItem
  sourceRevision: ResearchThreadKnowledgeRevision
}

export type ResearchThreadSummary = {
  questionCount: number
  campaignCount: number
  openCampaignCount: number
  contributionCount: number
  failureCount: number
  decisionCount: number
  retainedDissentCount: number
  knowledgeCount: number
}

export type ResearchThread = {
  schemaVersion: 'xgc.research.thread/v1'
  project: ResearchThreadProject
  questions: ResearchThreadQuestion[]
  campaigns: ResearchThreadCampaign[]
  knowledge: ResearchThreadKnowledgeBacklink[]
  summary: ResearchThreadSummary
  updatedAt: string
}

export type AttachResearchThreadKnowledgeInput = {
  fromRevisionId: string
  linkId?: string
}

export type ResearchThreadKnowledgeAttachment = {
  link: ResearchThreadTypedLink
  replayed: boolean
}

export type CreateResearchThreadKnowledgeInput = {
  kind: ResearchKnowledgeKind
  title: string
  body: string
  authorKind: ResearchKnowledgeAuthorKind
  authorRef?: string
}

export type ResearchThreadCreatedKnowledgeRevision = {
  id: string
  knowledgeItemId: string
  parentRevisionId?: string
  body: string
  contentSha256: string
  authorKind: ResearchKnowledgeAuthorKind
  authorRef?: string
  createdAt: string
}

export type ResearchThreadProjectKnowledge = {
  item: ResearchThreadKnowledgeItem
  revision: ResearchThreadCreatedKnowledgeRevision
  link: ResearchThreadTypedLink
}

export type ResearchThreadKnowledgeCreation = {
  knowledge: ResearchThreadProjectKnowledge
  replayed: boolean
}
