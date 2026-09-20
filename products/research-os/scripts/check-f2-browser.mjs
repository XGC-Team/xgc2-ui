import assert from 'node:assert/strict'
import { chromium } from 'playwright'
// Rendered current-format canvas/outline/context path on an existing dedicated test project.
// Only that project's file transport is simulated. All other writes are blocked.
// This is NOT evidence of real-backend persistence, provider execution or production readiness.
const url = process.env.RESEARCH_UI_URL, project = process.env.RESEARCH_TEST_PROJECT
assert.ok(url, 'Set RESEARCH_UI_URL to the already running test product.')
assert.match(project || '', /^paper-e2e-[a-z0-9-]+$/, 'Use an existing registered paper-e2e-* test project.')
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
const page = await context.newPage(), errors = [], blocked = []
const sourcePath = 'sections/method.tex'
const sourceText = 'A scoped manuscript paragraph.\nA separate paragraph must not enter this context.\n'
const files = new Map([
  ['thinking.canvas.json', { content: JSON.stringify({ version: 2,
    nodes: [{ id: 'c1', kind: 'chapter', title: 'Intro', x: 0, y: 0 },
      { id: 'i1', kind: 'idea', title: 'Claim A', x: 40, y: 220 },
      { id: 'i2', kind: 'idea', title: 'Claim B', x: 300, y: 200 }],
    edges: [{ from: 'c1', to: 'i1' }, { from: 'c1', to: 'i2' }],
    outlines: [{ artifact: 'canvas', items: [{ node: 'c1', children: [{ node: 'i2' }, { node: 'i1' }] }] }],
  }), digest: 'canvas-current' }],
  [sourcePath, { content: sourceText, digest: 'source-current' }],
])
let revision = 0, forceConflict = false
page.on('pageerror', error => errors.push(error.message))
await context.addInitScript(project => {
  localStorage.setItem('research-ui-project', project)
  localStorage.setItem('research-ui-locale', 'en')
  localStorage.setItem('research-ui-bottom', 'collapsed')
}, project)
await context.route('**/api/v1/**', async route => {
  const request = route.request(), path = decodeURIComponent(new URL(request.url()).pathname), base = `/api/v1/workspaces/${project}/files`
  const reply = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  if (path === base && request.method() === 'GET') return reply(200, { data: [], meta: { directory: '', nextCursor: null } })
  if (path.startsWith(`${base}/`)) {
    const name = path.slice(base.length + 1), record = files.get(name)
    if (request.method() === 'GET') return record ? reply(200, { data: record }) : reply(404, { error: { message: 'Missing test file' } })
    if (request.method() === 'PUT' && name === 'thinking.canvas.json') {
      const input = request.postDataJSON()
      if (forceConflict || (input.createOnly ? Boolean(record) : input.expectedDigest !== record?.digest)) return reply(409, { error: { message: 'Test CAS conflict' } })
      const saved = { content: input.content, digest: `canvas-${++revision}` }; files.set(name, saved)
      return reply(200, { data: { digest: saved.digest } })
    }
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) { blocked.push(`${request.method()} ${path}`); return route.abort('blockedbyclient') }
  return route.continue()
})
const root = page.locator(`[data-canvas-project="${project}"]`)
const saved = () => root.locator('[data-canvas-save-state="saved"]').waitFor()
const canvasFile = () => JSON.parse(files.get('thinking.canvas.json').content)
const order = () => canvasFile().outlines[0].items.flatMap(function flat(item) { return [item.node, ...(item.children || []).flatMap(flat)] })
try {
  await page.goto(url)
  await page.locator(`[data-project-objects="${project}"] [data-project-object="canvas"]`).click()
  await saved()
  assert.equal(revision, 0, 'Loading a current canvas must not write it.')
  await root.getByRole('button', { name: 'Outline', exact: true }).click()
  const outline = page.locator('[data-outline-view="canvas"]')
  await outline.locator('[data-outline-node="i2"]').getByRole('button', { name: 'Move down', exact: true }).click()
  await saved(); assert.deepEqual(order(), ['c1', 'i1', 'i2'])
  await outline.locator('[data-outline-node="i1"]').getByRole('button', { name: 'Claim A', exact: true }).click()
  const inspector = page.locator('[data-canvas-inspector]')
  await inspector.getByLabel('Free-form intent (not manuscript prose)', { exact: true }).fill('Explain the claim without copying the design verbatim.')
  await inspector.getByLabel('Argument and expression strategy', { exact: true }).fill('State the limit before the result.')
  await inspector.getByLabel('Details outside the manuscript', { exact: true }).fill('Keep discarded alternatives in design only.')
  await saved()
  await root.getByRole('button', { name: 'Research canvas', exact: true }).click()
  assert.equal(await inspector.getByLabel('Details outside the manuscript', { exact: true }).inputValue(), 'Keep discarded alternatives in design only.')
  const before = canvasFile().nodes.find(n => n.id === 'i1'), box = await page.locator('[data-node="i1"]').boundingBox()
  assert.ok(box)
  await page.mouse.move(box.x + 10, box.y + box.height - 6); await page.mouse.down()
  await page.mouse.move(box.x + 90, box.y + box.height + 34, { steps: 8 }); await page.mouse.up()
  await saved(); assert.notEqual(canvasFile().nodes.find(n => n.id === 'i1').x, before.x)
  assert.deepEqual(order(), ['c1', 'i1', 'i2'])
  const editor = page.locator('[data-design-source-editor="i1"]')
  await editor.getByLabel('Project source path', { exact: true }).fill(sourcePath)
  await editor.getByRole('button', { name: 'Read current source / new link', exact: true }).click()
  await editor.getByRole('button', { name: 'Select range', exact: true }).click()
  await editor.getByRole('button', { name: 'Link the selected range to this card', exact: true }).click()
  await saved()
  const originalBinding = canvasFile().sourceBindings[0]
  assert.equal(originalBinding.quote, sourceText.split('\n')[0])
  assert.deepEqual(originalBinding.nodeIds, ['i1'])
  files.set(sourcePath, { content: `New introduction.\n${sourceText}`, digest: 'source-changed' })
  await editor.getByRole('button', { name: 'Locate / correct', exact: true }).click()
  await editor.getByText(/Mapping needs confirmation/).waitFor()
  assert.equal(canvasFile().sourceBindings[0].digest, 'source-current', 'A candidate must not silently rebind.')
  await editor.getByRole('button', { name: /Inspect candidate/ }).first().click()
  await editor.getByRole('button', { name: 'Confirm this correction', exact: true }).click()
  await saved()
  assert.equal(canvasFile().sourceBindings[0].id, originalBinding.id)
  assert.equal(canvasFile().sourceBindings[0].digest, 'source-changed')
  assert.ok(canvasFile().sourceBindings[0].start > originalBinding.start)
  await inspector.getByRole('button', { name: 'Add to Chat context', exact: true }).click()
  const panel = page.locator(`[data-context-panel="${project}"]`)
  await panel.locator('summary').click()
  await panel.getByRole('button', { name: 'Insert context manifest into draft', exact: true }).click()
  await panel.getByText('Inserted into the draft; still not sent.', { exact: true }).waitFor()
  const draft = await page.locator('.native-chat-host [contenteditable="true"]').first().textContent() ?? ''
  assert.match(draft, /Scoped writing context, not approval/)
  assert.match(draft, /Keep discarded alternatives in design only/)
  assert.match(draft, /A scoped manuscript paragraph/)
  assert.doesNotMatch(draft, /A separate paragraph must not enter this context/)
  files.get('thinking.canvas.json').digest = 'external-revision'
  await panel.getByRole('button', { name: 'Refresh', exact: true }).click()
  await panel.locator('[data-context-state="update-available"]').waitFor()
  await panel.getByRole('button', { name: 'Keep old snapshot (labeled)', exact: true }).click()
  await panel.locator('[data-context-state="stale-snapshot"]').waitFor()
  files.get('thinking.canvas.json').digest = `canvas-${revision}`
  forceConflict = true
  await page.locator('[data-node="i1"] input').fill('Conflicting title')
  await root.locator('[data-canvas-save-state="conflict"]').waitFor()
  assert.equal(canvasFile().nodes.find(n => n.id === 'i1').title, 'Claim A')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Discard local edits and reload', exact: true }).click()
  await saved(); forceConflict = false
  assert.deepEqual(errors, [])
  assert.deepEqual(blocked, [], 'Unexpected writes were blocked. Use a fully registered dedicated test project.')
  console.log('PASS current canvas/outline intent, explicit mapping correction, minimal context, stale references and conflict recovery. No real-backend or provider acceptance is implied.')
} finally { await context.close(); await browser.close() }
