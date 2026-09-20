import { afterEach, describe, expect, it, vi } from 'vitest'
import { APIError } from '../src/lib/api'
import {
  artifactPaths, artifactView, definitionFromDraft, isNonLatexArtifact, markdownFromDraft, parseArtifactDefinition,
  parseSecondsPerSlide, rawDigest, type BuildRecord,
} from '../src/features/artifacts/artifact-model'
import { requestArtifactBuild } from '../src/features/artifacts/artifact-api'
import { experimentPhase, parseLatestDigests, parseResultBundle, parseVerificationPlan, scientificStatus } from '../src/features/experiments/experiment-model'
import { inspectResult } from '../src/features/experiments/experiment-api'
import { newDraft, type ResearchDraft } from '../src/features/projects/draft-model'

const digest = 'a'.repeat(64)
const other = 'b'.repeat(64)

function slides(): ResearchDraft {
  const draft = newDraft('slides', 'Summary', '2026-09-20T00:00:00.000Z', 'summary1')
  draft.blocks[0].title = 'Claim'
  draft.blocks[0].fields.message = 'A converted slide is still a draft.'
  draft.blocks[0].fields.visual = 'Diagram of the argument.'
  draft.sources = [{ id: 'src1', path: 'notes/claim.md', digest }]
  return draft
}

function storyboard(): ResearchDraft {
  const draft = newDraft('storyboard', 'Walkthrough', '2026-09-20T00:00:00.000Z', 'video1')
  draft.blocks[0].title = 'Shot'
  draft.blocks[0].fields.visual = 'Board.'
  draft.blocks[0].fields.narration = 'Voice.'
  draft.blocks[0].fields.duration = '3s'
  return draft
}

const latex: BuildRecord = {
  task: { workspaceRef: 'paper', entryPoint: 'main.tex', toolchain: { engine: 'latexmk' } },
  manifest: { buildId: 'tex', status: 'succeeded', completedAt: '2026-09-20T01:00:00Z', outputs: [{ digest, mediaType: 'application/pdf' }] },
}
const generated: BuildRecord = {
  task: { workspaceRef: 'paper', entryPoint: 'artifacts/summary1.artifact.json', manuscriptId: 'summary1', toolchain: { engine: 'research-artifact/pptx', pinKind: 'local-runtime-fingerprint' } },
  manifest: { buildId: 'ok', status: 'succeeded', completedAt: '2026-09-20T02:00:00Z', outputs: [{ digest, mediaType: 'image/png' }, { digest: other, mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }] },
}
const failed: BuildRecord = {
  task: generated.task,
  manifest: { buildId: 'bad', status: 'failed', completedAt: '2026-09-20T03:00:00Z', diagnostics: [{ message: 'preview failed' }] },
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('artifact definitions and lifecycle', () => {
  it('converts a saved slides draft into a strict artifact definition without Git identity', () => {
    const definition = definitionFromDraft(slides(), { rights: 'Author-owned; not approved for publication', attribution: 'Fixture' })
    expect(definition.kind).toBe('pptx')
    expect(definition.artifactId).toBe('summary1')
    expect(definition.source).toBe('artifacts/summary1.md')
    expect(definition.dependencies).toEqual([{ kind: 'evidence', objectId: 'src1', path: 'notes/claim.md', digest }])
    expect(parseArtifactDefinition(JSON.stringify(definition)).secondsPerSlide).toBeUndefined()
    expect(markdownFromDraft(slides())).toContain('A converted slide is still a draft.')
    expect(artifactPaths('summary1').definition).toBe('artifacts/summary1.artifact.json')
  })
  it('requires one explicit storyboard duration and rejects unknown definition fields', () => {
    expect(parseSecondsPerSlide('3s')).toBe(3)
    expect(definitionFromDraft(storyboard(), { rights: 'test rights', attribution: 'fixture' }).secondsPerSlide).toBe(3)
    const disagree = storyboard()
    disagree.blocks.push({ id: 'shot2', title: 'Two', fields: { visual: 'x', narration: 'y', duration: '8s' } })
    expect(() => definitionFromDraft(disagree, { rights: 'test rights', attribution: 'fixture' })).toThrow(/disagree/)
    expect(() => parseArtifactDefinition(JSON.stringify({ ...definitionFromDraft(slides(), { rights: 'r', attribution: 'a' }), filename: 'deck.pptx' }))).toThrow(/unknown field/)
  })
  it('keeps a later failed generate from replacing the last successful preview and never claims science', () => {
    expect(isNonLatexArtifact(latex)).toBe(false)
    expect(isNonLatexArtifact(generated)).toBe(true)
    const view = artifactView([latex, generated, failed], { projectId: 'paper', workspace: 'paper' }, 'artifacts/summary1.artifact.json')
    expect(view.phase).toBe('failed')
    expect(view.laterFailure).toBe(true)
    expect(view.successful?.manifest.buildId).toBe('ok')
    expect(view.preview?.kind).toBe('image')
    expect(view.scientific).toBe('not-claimed')
  })
})

describe('saved-source artifact requests', () => {
  it('posts B saved-source fields and never consults git status or gitCommit', async () => {
    const calls: { url: string; body: unknown }[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
      return { ok: false, status: 400, json: async () => ({ error: { message: 'old git task required', code: 'invalid_json' } }) } as Response
    })
    await expect(requestArtifactBuild({ workspaceRef: 'paper', entryPoint: 'artifacts/summary1.artifact.json', manuscriptId: 'summary1', expectedInputs: [{ path: 'artifacts/summary1.artifact.json', digest: `sha256:${digest}` }] })).rejects.toThrow(/saved-source/)
    expect(calls.some(call => /git\/status/.test(call.url))).toBe(false)
    expect(calls[0]?.body).toEqual({
      workspaceRef: 'paper', entryPoint: 'artifacts/summary1.artifact.json', manuscriptId: 'summary1',
      expectedInputs: [{ path: 'artifacts/summary1.artifact.json', digest }],
    })
    expect(calls[0]?.body).not.toHaveProperty('gitCommit')
  })
})

const pin = { stationId: 'station', targetId: 'target', experimentResourceId: 'experiment', experimentCommitId: 'revision', experimentDigest: digest }
const session = {
  schemaVersion: 'xgc.research.experiment-ref/v1', contractSchemaVersion: 2, contractDigest: digest, sessionId: 'session',
  openingRunId: 'opening-run', experiment: pin, robotSelectionDigest: digest, runMode: 'simulation', sessionRevision: 1,
  capturedAt: '2026-09-20T00:00:00.000Z',
}
function artifact(id: string) {
  return {
    artifactId: id, sessionId: 'session', sessionMemberId: `member-${id}`, targetId: 'target', runId: 'record-run',
    attemptId: 'attempt', name: id, mediaType: 'application/octet-stream', uri: `cas://sha256/${digest}`, sizeBytes: 4, digest,
  }
}
function source(id: string, role = id) {
  return { roles: [role], artifact: artifact(id), member: { memberId: `member-${id}`, sessionId: 'session', bindingId: 'binding', ownerId: 'record-owner', artifactPath: `record/${id}`, memberRevision: 1 } }
}
function bundleJSON() {
  return JSON.stringify({
    schemaVersion: 'xgc.research.experiment-result/v1', projectId: 'project', workspaceRef: 'workspace',
    verification: { recordId: 'verification', planId: 'plan', planRevision: 1, planDigest: digest, session, createdAt: '2026-09-20T00:00:00.000Z' },
    runId: 'record-run', attemptId: 'attempt',
    recording: { recordingId: 'record', sessionId: 'session', manifestDigest: digest, artifact: artifact('raw') },
    sources: ['run-receipt', 'record-manifest', 'parameters', 'code', 'environment', 'raw', 'processing'].map(role => source(role)),
    uses: [{ kind: 'design', objectId: 'design-card', workspaceRef: 'workspace', digest, evidenceArtifactIds: ['raw'] }],
  })
}

describe('experiment result consumption', () => {
  it('rejects guessed filenames and keeps requirement/referenced/inspected distinct from science', () => {
    expect(() => parseResultBundle(JSON.stringify({ filename: 'run.bag', schemaVersion: 'xgc.research.experiment-result/v1' }), { projectId: 'project', workspace: 'workspace' })).toThrow(/unknown field/)
    const bundle = parseResultBundle(bundleJSON(), { projectId: 'project', workspace: 'workspace' })
    expect(experimentPhase(null, null)).toBe('requirement')
    expect(experimentPhase(bundle, null)).toBe('referenced')
    expect(scientificStatus(null)).toBe('not-claimed')
    expect(() => parseLatestDigests('{"raw":"not-a-digest"}', bundle)).toThrow(/invalid current digest/)
    expect(parseLatestDigests('', bundle).raw).toBe(digest)
  })
  it('does not post verification start when inspection is unavailable', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      calls.push(String(input))
      return { ok: false, status: 501, json: async () => ({ error: { message: 'not configured', code: 'experiment_result_inspector_unavailable' } }) } as Response
    })
    const plan = parseVerificationPlan(JSON.stringify({
      schemaVersion: 'xgc.research.experiment-ref/v1', planId: 'plan', revision: 1, digest, claimRefs: ['c'], baselineRefs: ['b'],
      factors: [{ name: 'controller', values: ['test'] }], seeds: [1], repeats: 1, metricRefs: ['error'], thresholdRefs: ['threshold'],
      experiment: pin, createdAt: '2026-09-20T00:00:00.000Z', createdBy: 'fixture',
    }))
    await expect(inspectResult(plan, parseResultBundle(bundleJSON(), { projectId: 'project', workspace: 'workspace' }))).rejects.toThrow(/did not start/)
    expect(calls.some(url => /verification\/runs/.test(url))).toBe(false)
    expect(calls[0]).toContain('/experiments/result-inspections')
  })
})

describe('APIError mapping remains available to callers', () => {
  it('exposes numeric status for 501', () => {
    expect(new APIError('unavailable', 501).status).toBe(501)
  })
})
