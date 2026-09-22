export const READING_SELECTION_SCHEMA = 'xgc.research.reading-selection/v1' as const
export const READING_PAGE_SCHEMA = 'xgc.research.reading-page/v1' as const

export type ArchiveIdentity = {
  manifestId: string
  workId: string
  manifestationId: string
  documentVersionId: string
  acquisitionId: string
  sourceSha256: string
  extractionJobId: string
  extractionState: string
  extractionAvailability: string
  replayed: boolean
}

export type QuoteVerification = {
  status: string
  matchMode: string
  requestedPage: number
  resolvedPage?: number
  quote: string
  quoteSha256: string
  verified: boolean
  moved: boolean
}

export type ReadingSelection = {
  schema: typeof READING_SELECTION_SCHEMA
  projectId: string
  workspace: string
  workId: string
  manifestationId: string
  documentVersionId: string
  acquisitionId: string
  sourceSha256: string
  snapshotSha256?: string
  evidenceArtifactId?: string
  evidenceArtifactSha256?: string
  readingSessionId?: string
  page: number
  excerpt: string
  verification: QuoteVerification | { status: 'unverified'; verified: false }
}

export type PageBlock = { kind: string; text: string; textSha256: string }
export type SnapshotUnit = { locator: number; text: string; textSha256: string; charCount: number }

export type PageProjection = {
  schemaVersion: typeof READING_PAGE_SCHEMA
  sessionId: string
  workId: string
  acquisitionId: string
  documentVersionId: string
  sourceSha256: string
  snapshotSha256: string
  evidenceArtifactId: string
  evidenceArtifactSha256: string
  page: number
  unitCount: number
  unit: SnapshotUnit
  blocks: PageBlock[]
}

export type ReadingSession = {
  id: string
  state: string
  revision: number
  acquisitionId: string
  documentVersionId: string
  workId: string
  sourceSha256: string
  title: string
  snapshot: { sha256: string; sizeBytes: number }
  evidenceArtifact: { id: string; sha256: string; role: string }
  replayed?: boolean
}

export type ReadingCitation = {
  ordinal: number
  requestedPage: number
  resolvedPage: number
  moved: boolean
  matchMode: string
  verificationSha256: string
  anchor: {
    id: string
    documentVersionId: string
    derivativeArtifactId?: string
    artifactSha256?: string
    pageStart?: number
    pageEnd?: number
    quote?: string
    quoteSha256?: string
  }
}

export type ReadingTurn = {
  id: string
  sessionId: string
  sequence: number
  role: string
  body: string
  bodySha256: string
  groundingState: string
  citations: ReadingCitation[]
  knowledge?: KnowledgeProjection
  replayed?: boolean
}

export type KnowledgeProjection = {
  item: { id: string; kind: string; title: string }
  revision: { id: string; knowledgeItemId: string; contentSha256?: string }
  links: { id: string; toKind: string; toId: string; relation: string }[]
  promotion: { id: string; sessionId: string; turnId: string; kind: string; title: string; note: string }
  replayed?: boolean
}

export type ExtractionResult = {
  attemptId: string
  manifestId: string
  acquisitionId: string
  documentVersionId: string
  sourceSha256: string
  state: string
  contract?: { adapterAvailability?: string; blockedReason?: string }
  artifacts: { id: string; role: string; sha256: string; sizeBytes: number }[]
  failure?: { code: string; message: string }
  replayed?: boolean
}

export type StudyReceipt =
  | { outcome: 'sent'; providerSessionId: string; requestKey: string }
  | { outcome: 'refused'; reason: string }
  | { outcome: 'uncertain'; reason: string }
