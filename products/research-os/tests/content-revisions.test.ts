import { beforeEach, describe, expect, it, vi } from 'vitest'
const request = vi.hoisted(() => vi.fn())
vi.mock('../src/lib/api', () => ({ request }))
import { contentPort, readContentRevision } from '../src/features/content/content-client'
import { emptyContent } from '../src/features/content/content-model'
const scope = { projectId: 'project', workspace: 'workspace' }
const snapshot = () => ({ document: emptyContent(scope), content: JSON.stringify(emptyContent(scope)), digest: 'sha256:old', migrationState: 'archived', legacySources: [] })
beforeEach(() => request.mockReset())
describe('immutable content revisions', () => {
  it('requests the specified digest independently of the live content writer', async () => {
    request.mockResolvedValue(snapshot())
    expect((await readContentRevision(scope, 'sha256:old')).digest).toBe('sha256:old')
    expect(request).toHaveBeenCalledWith('/workspaces/workspace/research-content?projectId=project&digest=sha256%3Aold', { signal: undefined })
  })
  it('refuses current content returned in place of a missing historical revision', async () => {
    request.mockResolvedValue({ ...snapshot(), digest: 'sha256:current', migrationState: 'migrated' })
    await expect(readContentRevision(scope, 'sha256:missing')).rejects.toThrow(/requested revision/)
  })
  it('validates raw canonical bytes before exposing a document for editing', async () => {
    const data = snapshot()
    data.content = data.content.replace('"objects":[]', '"externalId":9007199254740993,"objects":[]')
    // The transport has already rounded the parsed document; exact content still catches the loss.
    data.document = JSON.parse(data.content)
    request.mockResolvedValue(data)
    await expect(contentPort(scope).read(new AbortController().signal)).rejects.toThrow(/cannot preserve exactly/)
  })
})
