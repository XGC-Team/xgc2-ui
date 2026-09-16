import assert from 'node:assert/strict'
import { chromium } from 'playwright'
// Runs the actual Research OS frontend. Only the dedicated workspace file API is simulated.
// All other API writes are blocked. This is NOT evidence of real-backend persistence.
const url = process.env.RESEARCH_UI_URL, project = process.env.RESEARCH_TEST_PROJECT
assert.ok(url, 'Set RESEARCH_UI_URL to the already running product.')
assert.match(project || '', /^paper-e2e-[a-z0-9-]+$/, 'Use an existing registered paper-e2e-* test project.')
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
const page = await context.newPage(), errors = [], blocked = []
const files = new Map([['paper.md', { content: 'F1 evidence line', digest: 'source-v1' }]])
let revision = 0
page.on('pageerror', error => errors.push(error.message))
await context.addInitScript(project => {
  localStorage.setItem('research-ui-project', project)
  localStorage.setItem('research-ui-locale', 'en')
  localStorage.setItem('research-ui-bottom', 'collapsed')
}, project)
await context.route('**/api/v1/**', async route => {
  const request = route.request(), path = decodeURIComponent(new URL(request.url()).pathname), base = `/api/v1/workspaces/${project}/files`
  const reply = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  if (path === base && request.method() === 'GET') return reply(200, { data: [{ kind: 'file', path: 'paper.md', sizeBytes: 16 }], meta: { directory: '', nextCursor: null } })
  if (path.startsWith(`${base}/`)) {
    const name = path.slice(base.length + 1), record = files.get(name)
    if (request.method() === 'GET') return record ? reply(200, { data: record }) : reply(404, { error: { message: 'Missing test file' } })
    if (request.method() === 'PUT' && ['research-drafts.json', 'thinking.canvas.json'].includes(name)) {
      const input = request.postDataJSON()
      if (input.createOnly ? Boolean(record) : input.expectedDigest !== record?.digest) return reply(409, { error: { message: 'Test CAS conflict' } })
      const saved = { content: input.content, digest: `test-${++revision}` }; files.set(name, saved)
      return reply(200, { data: { digest: saved.digest } })
    }
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) { blocked.push(`${request.method()} ${path}`); return route.abort('blockedbyclient') }
  return route.continue()
})
const objects = page.locator(`[data-project-objects="${project}"]`), panel = page.locator(`[data-draft-project="${project}"]`)
const saved = () => panel.locator(':scope[data-draft-state="saved"]').waitFor()
const book = () => JSON.parse(files.get('research-drafts.json').content)
try {
  await page.goto(url)
  await objects.locator('[data-project-object="files"]').click()
  const reader = page.locator(`[data-object-workspace="${project}"][data-object-path="paper.md"]`)
  await page.locator('[data-object-path=""]:visible').getByRole('button', { name: 'paper.md', exact: true }).click()
  await reader.locator('.research-document').waitFor()
  await reader.locator('.research-document').evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange')) })
  await reader.getByRole('button', { name: 'Create note from selection', exact: true }).click()
  await saved()
  const note = book().drafts.find(item => item.kind === 'note')
  assert.equal(note.sources[0].digest, 'source-v1'); assert.equal(note.sources[0].excerpt, 'F1 evidence line')
  await panel.getByLabel('Notes and interpretation (not verified knowledge)', { exact: true }).fill('Interpretation requiring review')
  await saved()
  await panel.getByRole('button', { name: 'paper.md', exact: true }).click()
  await reader.getByText('Located the excerpt in the recorded revision.', { exact: true }).waitFor()
  await objects.locator('[data-project-object="notes"]').click()
  await panel.locator(`[data-draft-id="${note.id}"]`).click()
  page.once('dialog', dialog => dialog.accept())
  await panel.getByRole('button', { name: 'Reference in research canvas', exact: true }).click()
  await page.locator('[data-canvas-save-state="saved"]').waitFor()
  const canvas = JSON.parse(files.get('thinking.canvas.json').content)
  assert.equal(canvas.nodes[0].anchor, `research-drafts.json#${note.id}`)
  await panel.getByRole('button', { name: 'Archive object', exact: true }).click(); await saved()
  await panel.getByRole('button', { name: 'Back to drafts', exact: true }).click()
  await panel.getByRole('button', { name: 'Archive and restore', exact: true }).click()
  await panel.locator(`[data-draft-id="${note.id}"]`).click()
  await panel.getByRole('button', { name: 'Restore object', exact: true }).click(); await saved()
  assert.equal(book().drafts.find(item => item.id === note.id).archivedAt, undefined)
  await panel.getByRole('button', { name: 'Back to drafts', exact: true }).click()
  await panel.getByRole('button', { name: 'Active objects', exact: true }).click()
  for (const kind of ['paper', 'slides', 'storyboard', 'workflow', 'rule', 'experiment']) {
    await panel.getByRole('button', { name: 'Create draft', exact: true }).click()
    await panel.getByLabel('Draft type').selectOption(kind)
    await panel.getByLabel('Draft name').fill(`F1 ${kind}`)
    await panel.getByRole('button', { name: 'Create draft', exact: true }).click()
    await saved()
    await panel.getByText('Choose shared research source', { exact: true }).click()
    await panel.getByRole('button', { name: 'F1 evidence line', exact: true }).click(); await saved()
    assert.equal(book().drafts.find(item => item.kind === kind).sources[0].digest, 'source-v1')
    await panel.getByRole('button', { name: 'Research cards', exact: true }).click()
    await panel.locator('[data-research-view="cards"]').waitFor()
    await panel.getByRole('button', { name: 'Back to drafts', exact: true }).click()
  }
  await panel.getByRole('button', { name: 'Link existing workflow', exact: true }).click(); await saved()
  const ids = book().drafts.map(item => item.id)
  await page.reload(); await objects.locator('[data-project-object="drafts"]').click(); await saved()
  for (const id of ids) await panel.locator(`[data-draft-id="${id}"]`).waitFor()
  assert.deepEqual(errors, []); assert.deepEqual(blocked, [], 'Unexpected writes were blocked. Use a fully registered dedicated test project.')
  console.log('PASS F1 rendered path with isolated file fixtures: source selection, note, canvas reference, archive/restore, six drafts, shared sources and reopen. Real-backend acceptance remains separate.')
} finally { await context.close(); await browser.close() }
