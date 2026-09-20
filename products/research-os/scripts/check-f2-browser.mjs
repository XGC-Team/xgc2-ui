import assert from 'node:assert/strict'
import { chromium } from 'playwright'
// Runs the actual Research OS frontend against the F2 canvas/outline/context paths.
// Only the dedicated workspace file API is simulated; every other write is blocked.
// This is NOT evidence of real-backend persistence.
const url = process.env.RESEARCH_UI_URL, project = process.env.RESEARCH_TEST_PROJECT
assert.ok(url, 'Set RESEARCH_UI_URL to the already running product.')
assert.match(project || '', /^paper-e2e-[a-z0-9-]+$/, 'Use an existing registered paper-e2e-* test project.')
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
const page = await context.newPage(), errors = [], blocked = []
const v2Canvas = JSON.stringify({
  version: 2,
  nodes: [
    { id: 'c1', kind: 'chapter', title: 'Intro', x: 0, y: 0 },
    { id: 'i1', kind: 'idea', title: 'Claim A', x: 40, y: 220 },
    { id: 'i2', kind: 'idea', title: 'Claim B', x: 300, y: 200 },
  ],
  edges: [{ from: 'c1', to: 'i1' }, { from: 'c1', to: 'i2' }],
  outlines: [{ artifact: 'canvas', items: [{ node: 'c1', children: [{ node: 'i2' }, { node: 'i1' }] }] }],
}, null, 2) + '\n'
const files = new Map([['thinking.canvas.json', { content: v2Canvas, digest: 'canvas-v2' }]])
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
    if (request.method() === 'PUT' && ['research-drafts.json', 'thinking.canvas.json'].includes(name)) {
      const input = request.postDataJSON()
      if (forceConflict || (input.createOnly ? Boolean(record) : input.expectedDigest !== record?.digest)) return reply(409, { error: { message: 'Test CAS conflict' } })
      const saved = { content: input.content, digest: `test-${++revision}` }; files.set(name, saved)
      return reply(200, { data: { digest: saved.digest } })
    }
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) { blocked.push(`${request.method()} ${path}`); return route.abort('blockedbyclient') }
  return route.continue()
})
const saved = () => page.locator(`[data-canvas-project="${project}"] [data-canvas-save-state="saved"]`).waitFor()
const canvasFile = () => JSON.parse(files.get('thinking.canvas.json').content)
const outlineOrder = () => canvasFile().outlines.find(o => o.artifact === 'canvas').items.flatMap(function flat(item) { return [item.node, ...(item.children || []).flatMap(flat)] })
try {
  await page.goto(url)
  await page.locator(`[data-project-objects="${project}"] [data-project-object="canvas"]`).click()
  await saved()
  assert.equal(canvasFile().version, 2)
  assert.equal(files.has('thinking.canvas.v1.backup.json'), false)

  // Outline view is sourced from the same v2 document, not reconstructed from x/y.
  await page.locator(`[data-canvas-project="${project}"]`).getByRole('button', { name: 'Outline', exact: true }).click()
  const outline = page.locator('[data-outline-view="canvas"]')
  await outline.locator('[data-outline-node="c1"]').waitFor()
  assert.deepEqual(await outline.locator('[data-outline-node]').evaluateAll(rows => rows.map(row => row.getAttribute('data-outline-node'))), ['c1', 'i2', 'i1'])
  await outline.locator('[data-outline-node="i2"]').getByRole('button', { name: 'Move down', exact: true }).click()
  await saved()
  assert.deepEqual(outlineOrder(), ['c1', 'i1', 'i2'])
  assert.equal(canvasFile().version, 2)

  // Moving a card on the canvas changes only x/y: outline order is untouched.
  await page.locator(`[data-canvas-project="${project}"]`).getByRole('button', { name: 'Research canvas', exact: true }).click()
  const before = canvasFile().nodes.find(n => n.id === 'i1')
  const card = page.locator('[data-node="i1"]')
  const box = await card.boundingBox()
  await page.mouse.move(box.x + 10, box.y + box.height - 6)
  await page.mouse.down()
  await page.mouse.move(box.x + 210, box.y + box.height + 94, { steps: 8 })
  await page.mouse.up()
  await saved()
  const after = canvasFile().nodes.find(n => n.id === 'i1')
  assert.notEqual(after.x, before.x)
  assert.deepEqual(outlineOrder(), ['c1', 'i1', 'i2'])

  // Label an edge with an explicit semantic relation through the inspector.
  await page.locator(`[data-canvas-project="${project}"] svg path.pointer-events-auto`).first().click()
  const inspector = page.locator('[data-canvas-inspector]')
  // Wrapped-label select: accessible name includes the current value, so no exact match.
  await inspector.getByLabel('Semantic relation').selectOption('supports')
  await saved()
  assert.equal(canvasFile().edges[0].relation, 'supports')

  // Evidence with a pinned digest, and one without (explicitly unverifiable).
  // Select the card through the outline so the click is not intercepted by the inspector.
  await page.locator(`[data-canvas-project="${project}"]`).getByRole('button', { name: 'Outline', exact: true }).click()
  await page.locator('[data-outline-node="i1"]').getByRole('button', { name: 'Claim A', exact: true }).click()
  await page.locator(`[data-canvas-project="${project}"]`).getByRole('button', { name: 'Research canvas', exact: true }).click()
  await inspector.getByLabel('Evidence file path').fill('papers/a.md')
  await inspector.getByLabel('Observed revision (optional)').fill('rev-1')
  await inspector.getByLabel('Excerpt (optional)').fill('quoted line')
  await inspector.getByRole('button', { name: 'Add evidence', exact: true }).click()
  await inspector.getByLabel('Evidence file path').fill('papers/b.md')
  await inspector.getByRole('button', { name: 'Add evidence', exact: true }).click()
  await inspector.getByText('Version cannot be auto-verified', { exact: true }).waitFor()
  await saved()
  const evidence = canvasFile().nodes.find(n => n.id === 'i1').evidence
  assert.equal(evidence.length, 2)
  assert.equal(evidence[0].digest, 'rev-1')
  assert.equal(evidence[1].digest, undefined)

  // Local undo reverts the last edit inside the session.
  await page.locator(`[data-canvas-project="${project}"]`).getByRole('button', { name: 'Undo', exact: true }).click()
  await saved()
  assert.equal(canvasFile().nodes.find(n => n.id === 'i1').evidence.length, 1)
  await page.locator(`[data-canvas-project="${project}"]`).getByRole('button', { name: 'Redo', exact: true }).click()
  await saved()
  assert.equal(canvasFile().nodes.find(n => n.id === 'i1').evidence.length, 2)

  await inspector.getByLabel('Writing purpose').fill('Limit the claim')
  await inspector.getByLabel('Scope (do not copy into the manuscript)').fill('Skip derivation')
  await saved()
  assert.deepEqual(canvasFile().nodes.find(n => n.id === 'i1').writing, { purpose: 'Limit the claim', omission: 'Skip derivation' })

  // Context bundle: add the card, check scope, insert the manifest into the draft only.
  await inspector.getByRole('button', { name: 'Add to Chat context', exact: true }).click()
  const panel = page.locator(`[data-context-panel="${project}"]`)
  await panel.locator('summary').click()
  await panel.locator('[data-context-item]').waitFor()
  await panel.getByRole('button', { name: 'Pre-send check', exact: true }).click()
  await panel.locator('[data-context-issues]').waitFor()
  assert.equal(await panel.locator('[data-context-issues] li').count(), 1)
  await panel.getByRole('button', { name: 'Insert context manifest into draft', exact: true }).click()
  await panel.getByText('Inserted into the draft; still not sent.', { exact: true }).waitFor()
  await panel.getByRole('button', { name: 'Insert this writing context', exact: true }).click()
  const draftText = await page.locator('.native-chat-host [contenteditable="true"]').first().textContent() ?? ''
  assert.match(draftText, /thinking\.canvas\.json#i1/)
  assert.match(draftText, /不等于已发送|not sent/i)
  assert.match(draftText, /详略（不得写入正文）|Skip derivation/)

  // Refresh after an external change: user keeps an explicitly labeled old snapshot.
  files.get('thinking.canvas.json').digest = 'external-9'
  await panel.getByRole('button', { name: 'Refresh', exact: true }).click()
  await panel.locator('[data-context-item][data-context-state="update-available"]').waitFor()
  await panel.getByRole('button', { name: 'Keep old snapshot (labeled)', exact: true }).click()
  await panel.locator('[data-context-item][data-context-state="stale-snapshot"]').waitFor()
  files.get('thinking.canvas.json').digest = `test-${revision}`

  // Conflict keeps both sides; discard reloads the remote.
  forceConflict = true
  await page.locator('[data-node="i1"] [aria-label]').first().fill('Conflicting title')
  await page.locator(`[data-canvas-project="${project}"] [data-canvas-save-state="conflict"]`).waitFor()
  assert.equal(canvasFile().nodes.find(n => n.id === 'i1').title, 'Claim A')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Discard local edits and reload', exact: true }).click()
  await saved()
  forceConflict = false

  assert.deepEqual(errors, [])
  assert.deepEqual(blocked, [], 'Unexpected writes were blocked. Use a fully registered dedicated test project.')
  console.log('PASS F2 rendered path: v2 canvas/outline homology, writing intent, semantic edge, evidence, undo/redo, writing context insert, stale snapshot and conflict recovery. Real-backend acceptance remains separate.')
} finally { await context.close(); await browser.close() }
