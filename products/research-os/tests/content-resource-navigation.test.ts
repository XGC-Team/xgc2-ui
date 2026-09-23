import { beforeEach, describe, expect, it, vi } from 'vitest'
const store = vi.hoisted(() => ({ openResource: vi.fn(), openDocument: vi.fn(), setReadingAnchor: vi.fn(), selectResearchDraft: vi.fn(), openPDF: vi.fn(), flashPDF: vi.fn(), setProjectId: vi.fn(), setActiveNav: vi.fn() }))
vi.mock('../src/store', () => ({ useWorkbench: { getState: () => store } }))
vi.mock('../src/features/resources/manuscript', () => ({ listBuildRecords: vi.fn(async () => []), buildArtifactURL: vi.fn(), pdfFromRecord: vi.fn() }))
import { openContentResource, runArtifactURL, runSourceLocation } from '../src/features/content/resource-navigation'
const scope = { projectId: 'paper', workspace: 'paper' }
beforeEach(() => vi.clearAllMocks())
describe('content source navigation', () => {
  it('opens an original PDF at its pinned digest and page without inventing a build', async () => {
    await openContentResource({ kind: 'file', workspace: 'academic', path: 'review/original.pdf', digest: 'sha256:abc', selector: { page: 3, quote: 'A disputed claim' } }, scope)
    expect(store.openResource).toHaveBeenCalledWith({ kind: 'original', workspace: 'academic', path: 'review/original.pdf', digest: 'sha256:abc', page: 3, quote: 'A disputed claim' })
    expect(store.openPDF).not.toHaveBeenCalled()
  })
  it('opens a review text as its read-only original with the source quote', async () => {
    await openContentResource({ kind: 'file', workspace: 'academic', path: 'review/reviewer.txt', digest: 'sha256:review', selector: { quote: 'Reviewer opinion' } }, scope)
    expect(store.openResource.mock.calls[0][0]).toMatchObject({ kind: 'original', quote: 'Reviewer opinion', digest: 'sha256:review' })
  })
  it('keeps content objects and artifact identities distinct across projects', async () => {
    await openContentResource({ kind: 'content', workspace: 'other', id: 'same-id' }, scope)
    expect(store.openResource).toHaveBeenCalledWith({ kind: 'research', workspace: 'other', ownerProjectId: 'other', view: 'table', objectId: 'same-id' })
    await openContentResource({ kind: 'artifact', workspace: 'other', id: 'same-id' }, scope)
    expect(store.selectResearchDraft).toHaveBeenCalledWith({ projectId: 'other', workspace: 'other' }, 'same-id')
  })
  it('opens a knowledge source in its actual workspace and keeps its observed version', async () => {
    await openContentResource({ kind: 'knowledge', workspace: 'academic', path: 'memory/method.md', digest: 'pinned', selector: { quote: 'Method' } }, scope)
    expect(store.openDocument).toHaveBeenCalledWith({ workspace: 'academic', path: 'memory/method.md', title: 'method.md' })
    expect(store.setReadingAnchor).toHaveBeenCalledWith(expect.objectContaining({ digest: 'pinned', excerpt: 'Method' }))
  })
  it('preserves the actual owner when project and workspace identities differ', async () => {
    const distinct = { projectId: 'research-project', workspace: 'source-workspace' }
    await openContentResource({ kind: 'content', id: 'method' }, distinct)
    expect(store.openResource).toHaveBeenCalledWith(expect.objectContaining({ workspace: 'source-workspace', ownerProjectId: 'research-project', objectId: 'method' }))
    await openContentResource({ kind: 'artifact', id: 'paper' }, distinct)
    expect(store.selectResearchDraft).toHaveBeenCalledWith(distinct, 'paper')
  })
  it('opens pinned object and artifact references in distinct read-only selections', async () => {
    const source = { workspace: 'other-workspace', projectId: 'other-project', id: 'same-id', digest: 'sha256:frozen' }
    await openContentResource({ ...source, kind: 'content' }, scope)
    expect(store.openResource).toHaveBeenLastCalledWith({ kind: 'research', workspace: 'other-workspace', ownerProjectId: 'other-project', view: 'table', objectId: 'same-id', digest: 'sha256:frozen' })
    await openContentResource({ ...source, kind: 'artifact' }, scope)
    expect(store.openResource).toHaveBeenLastCalledWith({ kind: 'research', workspace: 'other-workspace', ownerProjectId: 'other-project', view: 'table', artifactId: 'same-id', digest: 'sha256:frozen' })
    expect(store.selectResearchDraft).not.toHaveBeenCalled()
  })
  it('constructs a run artifact URL from its producing run/step instead of treating the output as a workspace file', () => {
    const source = { kind: 'run' as const, workspace: 'academic', projectId: 'paper', version: 2, id: 'run-123', path: 'results/summary.json', digest: 'output-sha', selector: { objectId: 'check' } }
    expect(runSourceLocation(source)).toEqual({ project: 'paper', version: 2, runId: 'run-123', nodeId: 'check' })
    expect(runArtifactURL(source)).toBe('/api/v1/research/projects/paper/plans/2/runs/run-123/steps/check/artifacts/output-sha')
    expect(() => runArtifactURL({ ...source, selector: undefined })).toThrow(/step/)
    expect(() => runArtifactURL({ ...source, version: undefined })).toThrow(/plan version/)
  })
})
