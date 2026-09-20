const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
function requireThat(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message) }
const SHA256 = /^[a-f0-9]{64}$/
function rejectUnknown(value: Record<string, unknown>, allowed: Set<string>, label: string) {
  for (const key of Object.keys(value)) requireThat(allowed.has(key), `${label} has unknown field ${key}`)
}

export const RESULT_SCHEMA = 'xgc.research.experiment-result/v1'
export const PLAN_SCHEMA = 'xgc.research.experiment-ref/v1'
export const RESULT_ROLES = ['run-receipt', 'record-manifest', 'parameters', 'code', 'environment', 'raw', 'processing'] as const

export type ExperimentPin = {
  stationId: string; targetId: string; experimentResourceId: string; experimentCommitId: string; experimentDigest: string
}
export type SessionRef = {
  schemaVersion: string; contractSchemaVersion: number; contractDigest: string; sessionId: string; openingRunId: string
  experiment: ExperimentPin; robotSelectionDigest: string; runMode: string; sessionRevision: number; capturedAt: string
}
export type SessionArtifactRef = {
  memberId: string; sessionId: string; bindingId: string; ownerId: string; artifactPath: string; memberRevision: number
}
export type ArtifactRef = {
  artifactId: string; sessionId?: string; sessionMemberId?: string; targetId?: string; runId: string; attemptId: string
  name: string; mediaType: string; uri: string; sizeBytes: number; digest: string
}
export type RecordingRef = { recordingId: string; sessionId: string; manifestDigest: string; artifact: ArtifactRef }
export type VerificationPlan = {
  schemaVersion: string; planId: string; revision: number; digest: string; claimRefs: string[]; baselineRefs: string[]
  factors: { name: string; values: string[] }[]; seeds: number[]; repeats: number; metricRefs: string[]; thresholdRefs: string[]
  experiment: ExperimentPin; createdAt: string; createdBy: string
}
export type VerificationRecord = {
  recordId: string; planId: string; planRevision: number; planDigest: string; session: SessionRef; createdAt: string
}
export type ResultSource = { roles: string[]; artifact: ArtifactRef; member: SessionArtifactRef }
export type ResultUse = { kind: 'claim' | 'design' | 'body' | 'artifact'; objectId: string; workspaceRef: string; digest: string; evidenceArtifactIds: string[] }
export type ResultBundle = {
  schemaVersion: typeof RESULT_SCHEMA; projectId: string; workspaceRef: string; verification: VerificationRecord
  runId: string; attemptId: string; recording?: RecordingRef; sources: ResultSource[]; uses: ResultUse[]
}
export type ResultItem = { source: ResultSource; status: 'verified' | 'unavailable' | 'mismatch'; reason?: string }
export type ResultInspection = {
  schemaVersion: string; bundleDigest: string; session: SessionRef; items: ResultItem[]; missingRoles: string[]
  recordingProblem?: string; referencesVerified: boolean; checkedAt: string
}

const PIN_KEYS = new Set(['stationId', 'targetId', 'experimentResourceId', 'experimentCommitId', 'experimentDigest'])
const SESSION_KEYS = new Set(['schemaVersion', 'contractSchemaVersion', 'contractDigest', 'sessionId', 'openingRunId', 'experiment', 'robotSelectionDigest', 'runMode', 'sessionRevision', 'capturedAt'])
const MEMBER_KEYS = new Set(['memberId', 'sessionId', 'bindingId', 'ownerId', 'artifactPath', 'memberRevision'])
const ARTIFACT_KEYS = new Set(['artifactId', 'sessionId', 'sessionMemberId', 'targetId', 'runId', 'attemptId', 'name', 'mediaType', 'uri', 'sizeBytes', 'digest'])
const RECORDING_KEYS = new Set(['recordingId', 'sessionId', 'manifestDigest', 'artifact'])
const PLAN_KEYS = new Set(['schemaVersion', 'planId', 'revision', 'digest', 'claimRefs', 'baselineRefs', 'factors', 'seeds', 'repeats', 'metricRefs', 'thresholdRefs', 'experiment', 'createdAt', 'createdBy'])
const VERIFICATION_KEYS = new Set(['recordId', 'planId', 'planRevision', 'planDigest', 'session', 'createdAt'])
const SOURCE_KEYS = new Set(['roles', 'artifact', 'member'])
const USE_KEYS = new Set(['kind', 'objectId', 'workspaceRef', 'digest', 'evidenceArtifactIds'])
const BUNDLE_KEYS = new Set(['schemaVersion', 'projectId', 'workspaceRef', 'verification', 'runId', 'attemptId', 'recording', 'sources', 'uses'])

function parsePin(value: unknown): ExperimentPin {
  requireThat(object(value), 'Experiment pin is not an object.')
  rejectUnknown(value, PIN_KEYS, 'Experiment pin')
  requireThat(typeof value.stationId === 'string' && value.stationId && typeof value.targetId === 'string' && value.targetId && typeof value.experimentResourceId === 'string' && value.experimentResourceId && typeof value.experimentCommitId === 'string' && value.experimentCommitId && typeof value.experimentDigest === 'string' && SHA256.test(value.experimentDigest), 'XGC2 experiment pin requires station, target, resource, commit and digest.')
  return value as ExperimentPin
}

function parseSession(value: unknown): SessionRef {
  requireThat(object(value), 'Session reference is not an object.')
  rejectUnknown(value, SESSION_KEYS, 'Session reference')
  requireThat(value.schemaVersion === PLAN_SCHEMA && typeof value.contractSchemaVersion === 'number' && value.contractSchemaVersion >= 2 && typeof value.contractDigest === 'string' && SHA256.test(value.contractDigest) && typeof value.sessionId === 'string' && value.sessionId && typeof value.openingRunId === 'string' && value.openingRunId && typeof value.robotSelectionDigest === 'string' && SHA256.test(value.robotSelectionDigest) && typeof value.runMode === 'string' && value.runMode && typeof value.sessionRevision === 'number' && value.sessionRevision > 0 && typeof value.capturedAt === 'string' && Number.isFinite(Date.parse(value.capturedAt)), 'XGC2 session ref is incomplete.')
  return { ...value, experiment: parsePin(value.experiment) } as SessionRef
}

function parseArtifact(value: unknown): ArtifactRef {
  requireThat(object(value), 'Artifact reference is not an object.')
  rejectUnknown(value, ARTIFACT_KEYS, 'Artifact reference')
  requireThat(typeof value.artifactId === 'string' && value.artifactId && typeof value.runId === 'string' && value.runId && typeof value.attemptId === 'string' && value.attemptId && typeof value.name === 'string' && value.name && typeof value.mediaType === 'string' && value.mediaType && typeof value.uri === 'string' && value.uri && typeof value.sizeBytes === 'number' && value.sizeBytes >= 0 && typeof value.digest === 'string' && SHA256.test(value.digest), 'XGC2 artifact ref is incomplete.')
  if (value.sessionId !== undefined || value.sessionMemberId !== undefined || value.targetId !== undefined) {
    requireThat(typeof value.sessionId === 'string' && value.sessionId && typeof value.sessionMemberId === 'string' && value.sessionMemberId && typeof value.targetId === 'string' && value.targetId, 'artifact Session lineage must provide sessionId, sessionMemberId, and targetId together.')
  }
  return value as ArtifactRef
}

function parseMember(value: unknown, session: SessionRef): SessionArtifactRef {
  requireThat(object(value), 'Session member is not an object.')
  rejectUnknown(value, MEMBER_KEYS, 'Session member')
  requireThat(typeof value.memberId === 'string' && value.memberId && value.sessionId === session.sessionId && typeof value.bindingId === 'string' && value.bindingId && typeof value.ownerId === 'string' && value.ownerId && typeof value.artifactPath === 'string' && value.artifactPath && typeof value.memberRevision === 'number' && value.memberRevision > 0, 'Session artifact member must exactly identify its Session, binding, owner, path and revision.')
  return value as SessionArtifactRef
}

export function parseVerificationPlan(text: string): VerificationPlan {
  const raw: unknown = JSON.parse(text)
  requireThat(object(raw), 'Verification plan is not an object.')
  rejectUnknown(raw, PLAN_KEYS, 'Verification plan')
  requireThat(raw.schemaVersion === PLAN_SCHEMA && typeof raw.planId === 'string' && raw.planId && typeof raw.revision === 'number' && raw.revision > 0 && typeof raw.digest === 'string' && SHA256.test(raw.digest) && Array.isArray(raw.claimRefs) && raw.claimRefs.length > 0 && Array.isArray(raw.baselineRefs) && raw.baselineRefs.length > 0 && Array.isArray(raw.factors) && raw.factors.length > 0 && Array.isArray(raw.seeds) && raw.seeds.length > 0 && typeof raw.repeats === 'number' && raw.repeats > 0 && Array.isArray(raw.metricRefs) && raw.metricRefs.length > 0 && Array.isArray(raw.thresholdRefs) && raw.thresholdRefs.length > 0 && typeof raw.createdAt === 'string' && typeof raw.createdBy === 'string' && raw.createdBy, 'verification plan lacks a frozen design, provenance, or acceptance threshold.')
  return { ...raw, experiment: parsePin(raw.experiment) } as VerificationPlan
}

export function parseResultBundle(text: string, scope: { projectId: string; workspace: string }): ResultBundle {
  const raw: unknown = JSON.parse(text)
  requireThat(object(raw), 'Result bundle is not an object.')
  rejectUnknown(raw, BUNDLE_KEYS, 'Result bundle')
  requireThat(raw.schemaVersion === RESULT_SCHEMA && raw.projectId === scope.projectId && raw.workspaceRef === scope.workspace && typeof raw.runId === 'string' && raw.runId && typeof raw.attemptId === 'string' && raw.attemptId && object(raw.verification) && Array.isArray(raw.sources) && Array.isArray(raw.uses), 'result bundle lacks its current schema or exact project/run scope.')
  rejectUnknown(raw.verification, VERIFICATION_KEYS, 'Verification record')
  const session = parseSession(raw.verification.session)
  const verification = { ...raw.verification, session } as VerificationRecord
  requireThat(typeof verification.recordId === 'string' && verification.recordId && typeof verification.planId === 'string' && verification.planId && typeof verification.planRevision === 'number' && verification.planRevision > 0 && typeof verification.planDigest === 'string' && SHA256.test(verification.planDigest) && typeof verification.createdAt === 'string', 'verification record must pin plan identity, revision, digest and creation time.')
  const ids = new Set<string>()
  const sources: ResultSource[] = []
  for (const item of raw.sources) {
    requireThat(object(item), 'Result source is not an object.')
    rejectUnknown(item, SOURCE_KEYS, 'Result source')
    const artifact = parseArtifact(item.artifact)
    const member = parseMember(item.member, session)
    requireThat(member.memberId === artifact.sessionMemberId && !ids.has(artifact.artifactId) && Array.isArray(item.roles) && item.roles.length > 0, 'source has duplicate identity or mismatched Session membership.')
    requireThat(artifact.sessionId === session.sessionId && artifact.targetId === session.experiment.targetId && artifact.runId === raw.runId && artifact.attemptId === raw.attemptId, 'result artifact does not match its exact Session/target/run/attempt.')
    const roles = new Set<string>()
    for (const role of item.roles) {
      requireThat(typeof role === 'string' && (RESULT_ROLES.includes(role as typeof RESULT_ROLES[number]) || role === 'verification' || role === 'figure') && !roles.has(role), 'unsupported or duplicate evidence role.')
      roles.add(role)
    }
    ids.add(artifact.artifactId)
    sources.push({ roles: item.roles as string[], artifact, member })
  }
  let recording: RecordingRef | undefined
  if (raw.recording !== undefined) {
    requireThat(object(raw.recording), 'Recording reference is not an object.')
    rejectUnknown(raw.recording, RECORDING_KEYS, 'Recording reference')
    const artifact = parseArtifact(raw.recording.artifact)
    requireThat(typeof raw.recording.recordingId === 'string' && raw.recording.recordingId && raw.recording.sessionId === session.sessionId && typeof raw.recording.manifestDigest === 'string' && SHA256.test(raw.recording.manifestDigest), 'recording must pin the owning session and manifest digest.')
    recording = { recordingId: raw.recording.recordingId, sessionId: raw.recording.sessionId, manifestDigest: raw.recording.manifestDigest, artifact }
  }
  const uses: ResultUse[] = []
  const useKeys = new Set<string>()
  for (const item of raw.uses) {
    requireThat(object(item), 'Result use is not an object.')
    rejectUnknown(item, USE_KEYS, 'Result use')
    requireThat(item.workspaceRef === scope.workspace && typeof item.objectId === 'string' && item.objectId && typeof item.digest === 'string' && SHA256.test(item.digest) && Array.isArray(item.evidenceArtifactIds) && item.evidenceArtifactIds.length > 0 && typeof item.kind === 'string' && ['claim', 'design', 'body', 'artifact'].includes(item.kind), 'result use lacks exact workspace, object, revision or evidence.')
    const key = `${item.kind}\0${item.objectId}\0${item.digest}`
    requireThat(!useKeys.has(key), 'duplicate result use.')
    useKeys.add(key)
    for (const id of item.evidenceArtifactIds) requireThat(typeof id === 'string' && ids.has(id), 'result use refers to absent or duplicate evidence.')
    uses.push(item as ResultUse)
  }
  return { schemaVersion: RESULT_SCHEMA, projectId: scope.projectId, workspaceRef: scope.workspace, verification, runId: raw.runId, attemptId: raw.attemptId, recording, sources, uses }
}

export type ExperimentPhase = 'requirement' | 'referenced' | 'inspected'
export function experimentPhase(bundle: ResultBundle | null, inspection: ResultInspection | null): ExperimentPhase {
  if (inspection) return 'inspected'
  if (bundle?.verification.session.sessionId) return 'referenced'
  return 'requirement'
}

export function scientificStatus(_inspection: ResultInspection | null): 'not-claimed' {
  return 'not-claimed'
}

export type SessionObservation = { Reference: SessionRef; State: string; Mode: string; Members: unknown[] }

export function parseLatestDigests(text: string, bundle: ResultBundle): Record<string, string> {
  if (!text.trim()) {
    return Object.fromEntries(bundle.sources.map(source => [source.artifact.artifactId, source.artifact.digest]))
  }
  const raw: unknown = JSON.parse(text)
  requireThat(object(raw), 'Latest digest map is not an object.')
  const latest: Record<string, string> = {}
  for (const [id, digest] of Object.entries(raw)) {
    requireThat(typeof digest === 'string' && SHA256.test(digest), `invalid current digest for ${id}`)
    latest[id] = digest
  }
  return latest
}

export function resultPaths(draftId: string) {
  return { plan: `experiments/${draftId}.plan.json`, bundle: `experiments/${draftId}.result.json` }
}
