import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileTarget, fileTargetKey, fileTargetLocation, sameFileTarget } from '../src/features/projects/project-object-model.ts'
import { projectObjectCopy } from '../src/features/projects/project-object-copy.ts'
import { listProjectMaterials } from '../src/features/resources/project-files.ts'
import { request, APIError } from '../src/lib/api.ts'

const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
test('same-named files in different projects have separate identities', () => {
  assert.equal(sameFileTarget(fileTarget('a', 'repo-a', 'files', 'main.tex'), fileTarget('b', 'repo-b', 'files', 'main.tex')), false)
})
test('project and workspace are independently part of identity', () => {
  const target = fileTarget('research-goal', 'repository', 'files', 'draft.tex')
  assert.equal(sameFileTarget(target, fileTarget('other-goal', 'repository', 'files', 'draft.tex')), false)
  assert.equal(sameFileTarget(target, fileTarget('research-goal', 'other-repository', 'files', 'draft.tex')), false)
  assert.equal(fileTargetLocation(target), 'repository/draft.tex')
})
test('concrete file deduplicates across Materials and Notes routes', () => {
  assert.equal(sameFileTarget(fileTarget('a', 'repo', 'notes', 'notes/one.md'), fileTarget('a', 'repo', 'files', 'notes/one.md')), true)
})
test('directory, notes and build explorers remain distinct', () => {
  assert.equal(new Set(['files', 'notes', 'builds'].map(view => fileTargetKey(fileTarget('a', 'repo', view as 'files' | 'notes' | 'builds')))).size, 3)
})
test('paths with spaces, Unicode and percent signs stay literal', () => {
  assert.equal(fileTarget('a', 'repo', 'files', '资料/100% result.md').path, '资料/100% result.md')
})
for (const path of ['/etc/passwd', '../main.tex', 'draft/../main.tex', 'draft/./main.tex', 'C:\\main.tex']) {
  test(`reject unsafe file target: ${path}`, () => assert.throws(() => fileTarget('a', 'repo', 'files', path)))
}
test('structured keys do not collide on delimiters', () => {
  assert.notEqual(fileTargetKey(fileTarget('a:b', 'c')), fileTargetKey(fileTarget('a', 'b:c')))
})
test('new copy has complete locale parity', () => {
  assert.deepEqual(Object.keys(projectObjectCopy.zh).sort(), Object.keys(projectObjectCopy.en).sort())
  for (const value of Object.values(projectObjectCopy.en)) assert.ok(value.trim())
})

// Source-level integration guards, not rendered React/browser acceptance.
test('tab host passes the frozen target and does not remount on current project', () => {
  const host = source('components/BrowserPanel.tsx')
  assert.match(host, /FilesPage target=\{tab.target\}/)
  assert.doesNotMatch(host, /FilesPage key=\{projectId\}/)
  assert.match(source('store.ts'), /sameFileTarget\(t.target,input.target\)/)
})
test('file quotations target the owning project; tab scope is not read from global selection', () => {
  const page = source('features/resources/FilesPage.tsx')
  assert.match(page, /const \{ projectId, workspace, path, view \} = target/)
  assert.match(page, /document.content\}`, projectId\)/)
  assert.doesNotMatch(page, /projectId:workspace/)
})
test('project objects reuse work surfaces without creating a session or running a workflow', () => {
  const objects = source('features/projects/ProjectObjects.tsx')
  for (const id of ['files', 'notes', 'canvas', 'workflow', 'builds']) assert.ok(objects.includes(`id: '${id}'`))
  assert.doesNotMatch(objects, /newThread\(|startAndSend\(|\/execute|\/runs|post\(/)
  assert.match(source('features/projects/ThinkingCanvas.tsx'), /fileTarget\(project,project,'files',n.anchor!\)/)
})

function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }) }
const file = (path: string) => ({ path, kind: 'file', sizeBytes: 12 })
test('directory paging preserves scope, folders, filters and deduplication', async t => {
  const urls: string[] = []
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    urls.push(url)
    return urls.length === 1
      ? json({ data: [file('draft/a.md'), { path: 'draft/notes', kind: 'directory' }, file('draft/AGENTS.md')], meta: { directory: 'draft', nextCursor: 'next' } })
      : json({ data: [file('draft/a.md'), file('draft/b.tex'), file('draft/src/code.ts')], meta: { directory: 'draft' } })
  })
  assert.deepEqual((await listProjectMaterials('repo #a', 'draft')).map(e => e.path), ['draft/notes', 'draft/a.md', 'draft/b.tex'])
  assert.ok(urls.every(url => url.startsWith('/api/v1/workspaces/repo%20%23a/files?')))
  assert.ok(urls[1].includes('cursor=next'))
})
test('repeated cursor fails instead of hanging', async t => {
  t.mock.method(globalThis, 'fetch', async () => json({ data: [], meta: { directory: '', nextCursor: 'same' } }))
  await assert.rejects(listProjectMaterials('repo', ''), /Repeated directory cursor/)
})
for (const body of [{ data: [], meta: { directory: 'wrong' } }, { data: [null], meta: { directory: '' } }, { data: [], meta: { directory: '', nextCursor: 42 } }]) {
  test(`invalid directory envelope is not an empty result: ${JSON.stringify(body)}`, async t => {
    t.mock.method(globalThis, 'fetch', async () => json(body))
    await assert.rejects(listProjectMaterials('repo', ''))
  })
}
test('directory HTTP failure remains visible', async t => {
  t.mock.method(globalThis, 'fetch', async () => json({ error: { message: 'denied' } }, 403))
  await assert.rejects(listProjectMaterials('repo', ''), /denied/)
})
test('aborted directory request performs no fetch', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not fetch') })
  await assert.rejects(listProjectMaterials('repo', '', AbortSignal.abort()))
  assert.equal(fetch.mock.callCount(), 0)
})
for (const status of [404, 403, 409, 412, 500]) {
  test(`request preserves HTTP ${status} for recovery decisions`, async t => {
    t.mock.method(globalThis, 'fetch', async () => json({ error: { message: 'failure' } }, status))
    await assert.rejects(request('/file'), error => error instanceof APIError && error.status === status)
  })
}
test('invalid successful API envelope is not returned as data', async t => {
  t.mock.method(globalThis, 'fetch', async () => json({ message: 'not an envelope' }))
  await assert.rejects(request('/file'))
})
