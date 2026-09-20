import {bytesDigest, demand, hashOK, object, textOK} from '../artifacts/artifact-model.ts'

export const RESULT_SCHEMA = 'xgc.research.experiment-result/v1'
const requiredRoles = ['run-receipt','record-manifest','parameters','code','environment','raw','processing']
export type ResultScope = {projectId: string; workspace: string}
export type ResultEvidenceView = {
  id: string; name: string; digest: string; sizeBytes: number; roles: string[]
  status: 'verified' | 'unavailable' | 'mismatch'; reason: string
  memberId: string; bindingId: string; ownerId: string; artifactPath: string
  /** Original owner-produced reference, never a filename-derived replacement. */
  reference: Readonly<Record<string, unknown>>
}
export type ResultUseView = {kind: string; objectId: string; workspaceRef: string; digest: string; evidenceArtifactIds: string[]}
export type ResultView = {
  bundleDigest: string; sessionId: string; runId: string; attemptId: string
  stationId: string; targetId: string; experimentCommitId: string
  planId: string; planDigest: string; recordId: string; recordManifestDigest: string
  checkedAt: string; referencesVerified: boolean; missingRoles: string[]; recordingProblem: string
  evidence: ResultEvidenceView[]; uses: ResultUseView[]
}
function sameJSON(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => sameJSON(value, b[index]))
  if (!object(a) || !object(b)) return false
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(key => key in b && sameJSON(a[key], b[key]))
}
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(textOK) && new Set(value).size === value.length }
const timestamp = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))

/** canonicalBundle is the original json.Marshal(bundle) byte string from the owning
 * import/CAS path. Its byte digest is ResultInspection.BundleDigest. Do not pretty-
 * print, repair or repin it in this consumer; a mismatch requires the original.
 * This verifies the binding of the displayed receipt, not the scientific claim.
 */
export async function projectResultInspection(canonicalBundle: string, rawReport: unknown, scope: ResultScope): Promise<ResultView> {
  demand(canonicalBundle.length <= 8 * 1024 * 1024, '结果引用包过大。')
  const bundle: unknown = JSON.parse(canonicalBundle), report = rawReport
  demand(object(bundle) && bundle.schemaVersion === RESULT_SCHEMA && bundle.projectId === scope.projectId && bundle.workspaceRef === scope.workspace && textOK(scope.projectId) && textOK(scope.workspace), '结果属于其他项目或未知版本。')
  demand(object(report) && report.schemaVersion === RESULT_SCHEMA && hashOK(report.bundleDigest), '缺少当前结果检查回执。')
  demand(await bytesDigest(new TextEncoder().encode(canonicalBundle)) === report.bundleDigest, '检查回执与结果引用包的原始字节不匹配。')
  demand(textOK(bundle.runId) && textOK(bundle.attemptId) && object(bundle.verification), '结果没有固定 Run/Attempt/验证计划。')
  const verification = bundle.verification, session = verification.session, observed = report.session
  demand(object(session) && object(observed) && session.schemaVersion === 'xgc.research.experiment-ref/v1' && session.schemaVersion === observed.schemaVersion && textOK(session.sessionId), '缺少现行 Session 身份。')
  for (const key of ['sessionId','openingRunId','experiment','contractSchemaVersion','contractDigest','robotSelectionDigest','runMode']) demand(sameJSON(session[key], observed[key]), `Session 固定字段已改变：${key}`)
  demand(Number.isSafeInteger(session.sessionRevision) && Number.isSafeInteger(observed.sessionRevision) && Number(session.sessionRevision) > 0 && Number(observed.sessionRevision) >= Number(session.sessionRevision) && timestamp(session.capturedAt) && timestamp(observed.capturedAt) && Date.parse(observed.capturedAt) >= Date.parse(session.capturedAt), 'Session 观察版本回退。')
  demand(object(session.experiment) && textOK(session.experiment.stationId) && textOK(session.experiment.targetId) && textOK(session.experiment.experimentCommitId) && hashOK(session.experiment.experimentDigest), '实验来源缺失。')
  demand(textOK(verification.planId) && hashOK(verification.planDigest) && timestamp(report.checkedAt) && typeof report.referencesVerified === 'boolean', '检查来源无效。')
  demand(Array.isArray(bundle.sources) && Array.isArray(bundle.uses) && Array.isArray(report.items) && strings(report.missingRoles), '证据或用途不是现行列表。')
  demand(bundle.sources.length <= 4096 && bundle.uses.length <= 4096, '结果引用数量超限。')
  const sourceByID = new Map<string, Record<string, unknown>>()
  for (const source of bundle.sources) {
    demand(object(source) && object(source.artifact) && object(source.member) && textOK(source.artifact.artifactId) && !sourceByID.has(source.artifact.artifactId), '证据身份缺失或重复。')
    const artifact = source.artifact, member = source.member
    demand(strings(source.roles) && source.roles.length > 0 && source.roles.every(role => [...requiredRoles,'verification','figure'].includes(role)), '证据用途无效。')
    demand(hashOK(artifact.digest) && textOK(artifact.name) && Number.isSafeInteger(artifact.sizeBytes) && Number(artifact.sizeBytes) >= 0 && artifact.runId === bundle.runId && artifact.attemptId === bundle.attemptId && artifact.sessionId === session.sessionId && artifact.targetId === session.experiment.targetId, '证据跨 Session/Run/Attempt 或没有原件版本。')
    demand(textOK(member.memberId) && member.memberId === artifact.sessionMemberId && member.sessionId === session.sessionId && textOK(member.bindingId) && textOK(member.ownerId) && textOK(member.artifactPath) && Number.isSafeInteger(member.memberRevision) && Number(member.memberRevision) > 0, '证据没有现行成员归属。')
    sourceByID.set(source.artifact.artifactId, source)
  }
  const evidence: ResultEvidenceView[] = [], inspected = new Set<string>(), goodRoles = new Set<string>()
  for (const item of report.items) {
    demand(object(item) && object(item.source) && object(item.source.artifact) && textOK(item.source.artifact.artifactId), '检查条目无效。')
    const id = item.source.artifact.artifactId, source = sourceByID.get(id)
    demand(source && !inspected.has(id) && sameJSON(source, item.source), '检查条目被替换、重复或属于另一版结果。')
    demand(['verified','unavailable','mismatch'].includes(String(item.status)) && (item.reason === undefined || typeof item.reason === 'string'), '检查状态无效。')
    inspected.add(id)
    const artifact = source.artifact as Record<string, unknown>, member = source.member as Record<string, unknown>, roles = source.roles as string[]
    if (item.status === 'verified') roles.forEach(role => goodRoles.add(role))
    evidence.push({id, name: artifact.name as string, digest: artifact.digest as string, sizeBytes: Number(artifact.sizeBytes), roles, status: item.status as ResultEvidenceView['status'], reason: String(item.reason || ''), memberId: String(member.memberId), bindingId: String(member.bindingId), ownerId: String(member.ownerId), artifactPath: String(member.artifactPath), reference: artifact})
  }
  // Cancellation may leave a partial report; preserve unchecked originals as unavailable.
  for (const [id, source] of sourceByID) if (!inspected.has(id)) {
    const artifact = source.artifact as Record<string, unknown>, member = source.member as Record<string, unknown>
    evidence.push({id, name: String(artifact.name), digest: String(artifact.digest), sizeBytes: Number(artifact.sizeBytes), roles: source.roles as string[], status: 'unavailable', reason: '本次检查未完成此原件；没有将其当作通过。', memberId: String(member.memberId), bindingId: String(member.bindingId), ownerId: String(member.ownerId), artifactPath: String(member.artifactPath), reference: artifact})
  }
  const missingRoles = requiredRoles.filter(role => !goodRoles.has(role))
  demand(report.missingRoles.every(role => requiredRoles.includes(role)), '回执含未知缺失类别。')
  let recordId = '', recordManifestDigest = '', recordingProblem = typeof report.recordingProblem === 'string' ? report.recordingProblem : ''
  if (bundle.recording !== undefined) {
    const record = bundle.recording
    demand(object(record) && textOK(record.recordingId) && record.sessionId === session.sessionId && hashOK(record.manifestDigest) && object(record.artifact), 'Record 引用缺失或跨 Session。')
    recordId = record.recordingId; recordManifestDigest = record.manifestDigest
    const raw = evidence.find(item => item.roles.includes('raw') && item.status === 'verified' && sameJSON(item.reference, record.artifact))
    const manifest = evidence.find(item => item.roles.includes('record-manifest') && item.status === 'verified' && item.digest === record.manifestDigest)
    if (!raw || !manifest) recordingProblem ||= 'Record 原件与 manifest 尚未同时核对。'
  } else recordingProblem ||= '没有所属 Record 引用。'
  demand(!report.referencesVerified || (evidence.every(item => item.status === 'verified') && missingRoles.length === 0 && report.missingRoles.length === 0 && !recordingProblem), '回执宣称完整，但原件或 Record 引用不完整。')
  const uses: ResultUseView[] = [], useIDs = new Set<string>()
  for (const use of bundle.uses) {
    demand(object(use) && ['claim','design','body','artifact'].includes(String(use.kind)) && textOK(use.objectId) && use.workspaceRef === scope.workspace && hashOK(use.digest) && strings(use.evidenceArtifactIds) && use.evidenceArtifactIds.length > 0 && use.evidenceArtifactIds.every(id => sourceByID.has(id)), '受影响对象没有精确的同项目证据边。')
    const key = JSON.stringify([use.kind,use.objectId,use.digest]); demand(!useIDs.has(key), '重复用途。'); useIDs.add(key)
    uses.push({kind: String(use.kind), objectId: use.objectId, workspaceRef: scope.workspace, digest: use.digest, evidenceArtifactIds: use.evidenceArtifactIds})
  }
  return {bundleDigest: report.bundleDigest, sessionId: session.sessionId, runId: bundle.runId, attemptId: bundle.attemptId, stationId: session.experiment.stationId, targetId: session.experiment.targetId, experimentCommitId: session.experiment.experimentCommitId, planId: verification.planId, planDigest: verification.planDigest, recordId, recordManifestDigest, checkedAt: report.checkedAt, referencesVerified: report.referencesVerified, missingRoles, recordingProblem, evidence, uses}
}
