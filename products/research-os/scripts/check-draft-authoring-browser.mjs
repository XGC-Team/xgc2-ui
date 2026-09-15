import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// Actual product UI with an isolated draft-file test port. NEVER writes to the real backend.
const url = process.env.RESEARCH_UI_URL
const project = process.env.RESEARCH_TEST_PROJECT
assert.ok(url, 'Set RESEARCH_UI_URL to an already running product checkout.')
assert.match(project || '', /^paper-e2e-[a-z0-9-]+$/, 'Use an existing dedicated paper-e2e-* project.')
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
const page = await context.newPage()
let stored, revision = 0, failSave = false, forceConflict = false
const errors = [], blockedWrites = []
page.on('pageerror', error => errors.push(error.message))
await context.addInitScript(project => {
  localStorage.setItem('research-ui-project', project)
  localStorage.setItem('research-ui-locale', 'en')
  localStorage.setItem('research-ui-bottom', 'collapsed')
}, project)
await context.route('**/api/v1/**', async route => {
  const request = route.request(), path = new URL(request.url()).pathname
  const reply = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  if (path === `/api/v1/workspaces/${project}/files/research-drafts.json`) {
    if (request.method() === 'GET') return stored === undefined ? reply(404, { error: { message: 'missing test draft file' } }) : reply(200, { data: { content: stored, digest: `v${revision}` } })
    if (request.method() === 'PUT') {
      const input = request.postDataJSON()
      if (failSave) return reply(503, { error: { message: 'test save unavailable' } })
      if (forceConflict || (input.createOnly ? stored !== undefined : input.expectedDigest !== `v${revision}`)) return reply(409, { error: { message: 'test revision conflict' } })
      stored = input.content; revision++
      return reply(200, { data: { digest: `v${revision}` } })
    }
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
    blockedWrites.push(`${request.method()} ${path}`)
    return route.abort('blockedbyclient')
  }
  return route.continue()
})
const panel = page.locator(`[data-draft-project="${project}"]`)
const open = () => page.locator(`[data-project-objects="${project}"] [data-project-object="drafts"]`).click()
const waitState = state => page.waitForFunction(({ project, state }) => document.querySelector(`[data-draft-project="${project}"]`)?.getAttribute('data-draft-state') === state, { project, state })
try {
  await page.goto(url)
  await open(); await waitState('new')
  assert.equal(stored, undefined)
  const labels = { paper: 'Writing goal', slides: 'Key message', storyboard: 'Narration', workflow: 'Step objective', rule: 'Feed source', experiment: 'Question and hypothesis' }
  for (const [kind, field] of Object.entries(labels)) {
    await panel.getByRole('button', { name: 'Create draft', exact: true }).click()
    await panel.getByLabel('Draft type', { exact: true }).selectOption(kind)
    await panel.getByLabel('Draft name', { exact: true }).fill(`E2E ${kind}`)
    await panel.getByRole('button', { name: 'Create draft', exact: true }).click()
    await panel.getByLabel(field, { exact: true }).fill(`Editable ${kind}`)
    await waitState('saved')
    const draft = JSON.parse(stored).drafts.find(item => item.kind === kind)
    assert.equal(draft.status, 'draft')
    assert.ok(Object.values(draft.blocks[0].fields).includes(`Editable ${kind}`))
    await panel.getByRole('button', { name: 'Back to drafts', exact: true }).click()
  }
  const snapshots = JSON.parse(stored).drafts
  assert.equal(snapshots.length, 6)
  // Close using the keyboard; parent tab key handlers must not swallow the close button event.
  await page.locator('[role="tab"][aria-selected="true"] button').focus()
  await page.keyboard.press('Enter')
  await panel.waitFor({ state: 'detached' })
  await open(); await waitState('saved')
  await page.reload(); await open(); await waitState('saved')
  for (const draft of snapshots) await panel.locator(`[data-draft-id="${draft.id}"]`).waitFor()
  const original = snapshots[0]
  await panel.locator(`[data-draft-id="${original.id}"]`).click()
  forceConflict = true
  await panel.getByLabel('Draft name', { exact: true }).fill('Conflicting local draft')
  await waitState('conflict')
  assert.equal(await panel.getByRole('button', { name: 'Save', exact: true }).isDisabled(), true)
  assert.equal(JSON.parse(stored).drafts[0].title, original.title)
  page.once('dialog', dialog => dialog.accept())
  await panel.getByRole('button', { name: 'Discard and reload', exact: true }).click()
  await waitState('saved'); forceConflict = false
  assert.equal(await panel.getByLabel('Draft name', { exact: true }).inputValue(), original.title)
  failSave = true
  await panel.getByLabel('Draft name', { exact: true }).fill('Retained unsaved draft')
  await waitState('save-error')
  page.once('dialog', dialog => dialog.dismiss())
  await page.locator('[role="tab"][aria-selected="true"] button').click()
  assert.equal(await panel.isVisible(), true)
  assert.equal(await panel.getByLabel('Draft name', { exact: true }).inputValue(), 'Retained unsaved draft')
  page.once('dialog', dialog => dialog.accept())
  await page.locator('[role="tab"][aria-selected="true"] button').click()
  await panel.waitFor({ state: 'detached' })
  assert.deepEqual(errors, [])
  assert.deepEqual(blockedWrites, [], 'Unexpected non-draft writes were blocked; use an existing, fully registered test project.')
  console.log('PASS six draft editors, mocked CAS reopen, keyboard close, conflict and dirty-close protection. Not a real-backend persistence test.')
} finally { await context.close(); await browser.close() }
