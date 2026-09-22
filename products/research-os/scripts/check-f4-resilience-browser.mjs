import assert from 'node:assert/strict'
import { chromium } from 'playwright'
// F4 resilience matrix: offline, denied, corrupt, conflict, storage failure, rapid switching,
// deleted references, interrupted/partial review writes, theme, locale, narrow, keyboard, reduced motion.
// Real rendered frontend with isolated fixtures. NOT real-backend evidence.
const url = process.env.RESEARCH_UI_URL
const project = process.env.RESEARCH_TEST_PROJECT
const projectB = process.env.RESEARCH_TEST_PROJECT_B || 'paper-e2e-f2'
assert.ok(url, 'Set RESEARCH_UI_URL to an already running actual Research OS UI.')
assert.match(project || '', /^paper-e2e-[a-z0-9-]+$/, 'Use a registered dedicated paper-e2e-* project.')
const exe = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
const launch = async (opts = {}) => {
  const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}) })
  const context = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 960 }, ...(opts.reducedMotion ? { reducedMotion: 'reduce' } : {}) })
  const page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  if (!opts.dismissDialogs) page.on('dialog', dialog => dialog.accept())
  await context.addInitScript(init => {
    localStorage.setItem('research-ui-project', init.project)
    localStorage.setItem('research-ui-locale', init.locale || 'en')
    localStorage.setItem('research-ui-bottom', 'collapsed')
    localStorage.setItem('research.markPrompt.dockVisible', 'false')
    if (init.theme) localStorage.setItem('research-ui-theme', init.theme)
    if (init.storageFails) {
      const fail = () => { throw new DOMException('storage full', 'QuotaExceededError') }
      Object.defineProperty(window.localStorage, 'setItem', { value: fail })
      Object.defineProperty(window.localStorage, 'removeItem', { value: fail })
    }
  }, { project: opts.project ?? project, locale: opts.locale, theme: opts.theme, storageFails: opts.storageFails })
  return { browser, context, page, errors }
}
const serve = async (context, { seeds = [], allowWrite = ['research-drafts.json', 'thinking.canvas.json', 'research-reviews.json', 'paper.md'], onGet, onPut } = {}) => {
  const state = { files: new Map(seeds), serial: 0, puts: [], blocked: [] }
  await context.route('**/api/v1/**', async route => {
    const request = route.request(), path = decodeURIComponent(new URL(request.url()).pathname)
    const reply = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    const match = path.match(/^\/api\/v1\/workspaces\/([^/]+)\/files(?:\/(.+))?$/)
    if (match) {
      const [, ws, name = ''] = match, key = `${ws}/${name}`, record = state.files.get(key)
      if (request.method() === 'GET') {
        if (!name) return reply(200, { data: [...state.files.keys()].filter(k => k.startsWith(`${ws}/`) && !k.endsWith('.json')).map(k => ({ kind: 'file', path: k.slice(ws.length + 1), sizeBytes: state.files.get(k).content.length })), meta: { directory: '', nextCursor: null } })
        const action = onGet?.(ws, name, state)
        if (action === 'abort') return route.abort('connectionfailed')
        if (typeof action === 'number') return reply(action, { error: { message: `Fixture read error ${action}` } })
        return record ? reply(200, { data: record }) : reply(404, { error: { message: 'Missing fixture file' } })
      }
      if (request.method() === 'PUT' && allowWrite.includes(name)) {
        const input = request.postDataJSON()
        const action = onPut?.(ws, name, input, state)
        if (typeof action === 'number') return reply(action, { error: { message: `Fixture write error ${action}` } })
        if (input.createOnly ? Boolean(record) : input.expectedDigest !== record?.digest) return reply(409, { error: { message: 'Fixture CAS conflict' } })
        const saved = { content: input.content, digest: `fixture-${++state.serial}` }
        state.files.set(key, saved); state.puts.push(key)
        return reply(200, { data: { digest: saved.digest } })
      }
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) { state.blocked.push(`${request.method()} ${path}`); return route.abort('blockedbyclient') }
    return route.continue()
  })
  return state
}
const tex = 'A strong conclusion.'
const canvasV2 = JSON.stringify({ version: 2, nodes: [{ id: 'card1', kind: 'idea', title: 'Claim card', body: 'Original body.', x: 40, y: 40 }], edges: [], outlines: [{ artifact: 'canvas', items: [{ node: 'card1' }] }] }, null, 2) + '\n'
const emptyBook = p => JSON.stringify({ version: 1, projectId: p, workspace: p, drafts: [] }, null, 2) + '\n'
let failed = 0
const scenario = async (name, fn) => {
  try { await fn(); console.log(`PASS ${name}`) }
  catch (error) { failed++; console.error(`FAIL ${name}\n${error.stack}`) }
}
// R1: network down during load — explicit load errors, no empty-content fabrication, retry recovers.
await scenario('R1 offline load shows load-error, never an empty document; retry recovers', async () => {
  const { browser, context, page, errors } = await launch()
  let offline = true
  const state = await serve(context, { onGet: (ws, name) => offline && ['thinking.canvas.json', 'research-drafts.json'].includes(name) ? 'abort' : undefined })
  try {
    await page.goto(url)
    await page.locator(`[data-project-objects="${project}"] [data-project-object="drafts"]`).click()
    await page.locator(`[data-draft-project="${project}"]`).getByText('Could not load drafts. Editing is blocked until a successful retry.', { exact: true }).waitFor()
    await page.locator(`[data-project-objects="${project}"] [data-project-object="canvas"]`).click()
    await page.locator(`[data-canvas-project="${project}"]`).getByText('Could not read the canvas. No empty file was created.', { exact: true }).waitFor()
    assert.deepEqual(state.puts, [])
    offline = false
    await page.locator(`[data-canvas-project="${project}"]`).getByRole('button', { name: 'Reload canvas', exact: true }).click()
    await page.locator(`[data-canvas-project="${project}"] [data-canvas-save-state="new"]`).waitFor()
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
// R2: permission denied on save — edits retained, honest error, retry succeeds.
await scenario('R2 403 on save keeps local edits and retries honestly', async () => {
  const { browser, context, page, errors } = await launch()
  let deny = true
  const state = await serve(context, { onPut: (ws, name) => deny && name === 'thinking.canvas.json' ? 403 : undefined })
  try {
    await page.goto(url)
    await page.locator(`[data-project-objects="${project}"] [data-project-object="canvas"]`).click()
    const canvas = page.locator(`[data-canvas-project="${project}"]`)
    await canvas.locator('[data-canvas-save-state="new"]').waitFor()
    await canvas.getByRole('button', { name: 'Idea', exact: true }).click()
    await canvas.locator('[data-canvas-save-state="save-error"]').waitFor()
    await canvas.getByText('Save failed. Local edits are retained.', { exact: true }).waitFor()
    const card = canvas.locator('[data-node] input[aria-label="Node title"]').first()
    await card.fill('Retained local edit')
    await canvas.locator('[data-canvas-save-state="save-error"]').waitFor()
    assert.equal(state.puts.length, 0)
    deny = false
    await canvas.getByRole('button', { name: 'Retry save', exact: true }).click()
    await canvas.locator('[data-canvas-save-state="saved"]').waitFor()
    assert.ok(JSON.parse(state.files.get(`${project}/thinking.canvas.json`).content).nodes.length > 0)
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
// R3: corrupt formats are refused without touching the original file.
await scenario('R3 corrupt canvas/drafts files are invalid, never overwritten', async () => {
  const { browser, context, page, errors } = await launch()
  const state = await serve(context, { seeds: [
    [`${project}/thinking.canvas.json`, { content: '{"version":2,"nodes":', digest: 'bad-1' }],
    [`${project}/research-drafts.json`, { content: emptyBook('someone-else'), digest: 'bad-2' }],
  ] })
  try {
    await page.goto(url)
    await page.locator(`[data-project-objects="${project}"] [data-project-object="canvas"]`).click()
    await page.locator(`[data-canvas-project="${project}"]`).getByText('This canvas cannot be safely edited. The original file is unchanged.', { exact: true }).waitFor()
    state.files.set(`${project}/thinking.canvas.json`, { content: JSON.stringify({ version: 99, nodes: [], edges: [], outlines: [] }), digest: 'bad-3' })
    await page.locator(`[data-canvas-project="${project}"]`).getByRole('button', { name: 'Reload canvas', exact: true }).click()
    await page.locator(`[data-canvas-project="${project}"]`).getByText('This canvas cannot be safely edited. The original file is unchanged.', { exact: true }).waitFor()
    await page.locator(`[data-project-objects="${project}"] [data-project-object="drafts"]`).click()
    await page.locator(`[data-draft-project="${project}"]`).getByText('Invalid format, unsupported version or mismatched project. The original file was not overwritten.', { exact: true }).waitFor()
    assert.deepEqual(state.puts, [])
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
// R4: CAS conflict keeps both sides; discard is explicit.
await scenario('R4 CAS conflict keeps remote, local edits explicit to discard', async () => {
  const { browser, context, page, errors } = await launch()
  const state = await serve(context, { seeds: [[`${project}/thinking.canvas.json`, { content: canvasV2, digest: 'c-v1' }]] })
  try {
    await page.goto(url)
    await page.locator(`[data-project-objects="${project}"] [data-project-object="canvas"]`).click()
    const canvas = page.locator(`[data-canvas-project="${project}"]`)
    await canvas.locator('[data-canvas-save-state="saved"]').waitFor()
    state.files.set(`${project}/thinking.canvas.json`, { content: canvasV2.replace('Claim card', 'Remote rewrite'), digest: 'c-v2' })
    await canvas.locator('[data-node="card1"] input[aria-label="Node title"]').fill('Local conflicting title')
    await canvas.locator('[data-canvas-save-state="conflict"]').waitFor()
    await canvas.getByText('The remote file changed. Local edits have not overwritten it.', { exact: true }).waitFor()
    assert.ok(state.files.get(`${project}/thinking.canvas.json`).content.includes('Remote rewrite'))
    await canvas.getByRole('button', { name: 'Discard local edits and reload', exact: true }).click()
    await canvas.locator('[data-canvas-save-state="saved"]').waitFor()
    assert.equal(await canvas.locator('[data-node="card1"] input[aria-label="Node title"]').inputValue(), 'Remote rewrite')
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
// R5: storage writes fail — the workbench still fully works in memory.
await scenario('R5 localStorage failure does not take the app down', async () => {
  const { browser, context, page, errors } = await launch({ storageFails: true })
  const state = await serve(context)
  try {
    await page.goto(url)
    await page.locator(`[data-project-objects="${project}"] [data-project-object="drafts"]`).click()
    const drafts = page.locator(`[data-draft-project="${project}"]`)
    await drafts.locator(':scope[data-draft-state]').waitFor()
    await drafts.getByRole('button', { name: 'Create draft', exact: true }).click()
    await drafts.getByLabel('Draft name').fill('R5 in-memory draft')
    await drafts.getByRole('button', { name: 'Create draft', exact: true }).click()
    await drafts.locator(':scope[data-draft-state="saved"]').waitFor()
    assert.ok(JSON.parse(state.files.get(`${project}/research-drafts.json`).content).drafts.length > 0)
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
// R6: rapid project switching — hidden canvases keep sessions and finish their own saves.
await scenario('R6 rapid switching keeps dirty editors mounted and saves to the right project', async () => {
  const { browser, context, page, errors } = await launch()
  const state = await serve(context)
  try {
    await page.goto(url)
    const objectsA = page.locator(`[data-project-objects="${project}"]`), objectsB = page.locator(`[data-project-objects="${projectB}"]`)
    const canvasA = page.locator(`[data-canvas-project="${project}"]`), canvasB = page.locator(`[data-canvas-project="${projectB}"]`)
    await objectsA.locator('[data-project-object="canvas"]').click()
    await canvasA.locator('[data-canvas-save-state="new"]').waitFor()
    await canvasA.getByRole('button', { name: 'Idea', exact: true }).click()
    await canvasA.locator('[data-canvas-save-state="saved"]').waitFor()
    const idA = JSON.parse(state.files.get(`${project}/thinking.canvas.json`).content).nodes.at(-1).id
    // Edit and switch away inside the save debounce: the hidden editor must not be unloaded.
    await canvasA.locator(`[data-node="${idA}"] input[aria-label="Node title"]`).fill('Alpha edited')
    await page.locator(`[data-project-id="${projectB}"]`).getByRole('button', { name: projectB, exact: true }).click()
    await objectsB.locator('[data-project-object="canvas"]').click()
    await canvasB.locator('[data-canvas-save-state="new"]').waitFor()
    await canvasB.getByRole('button', { name: 'Idea', exact: true }).click()
    await canvasB.locator('[data-canvas-save-state="saved"]').waitFor()
    const fileA = JSON.parse(state.files.get(`${project}/thinking.canvas.json`).content)
    const fileB = JSON.parse(state.files.get(`${projectB}/thinking.canvas.json`).content)
    assert.equal(fileA.nodes.find(n => n.id === idA).title, 'Alpha edited')
    assert.equal(fileB.nodes.length, 1)
    assert.ok(state.puts.includes(`${project}/thinking.canvas.json`) && state.puts.includes(`${projectB}/thinking.canvas.json`))
    await page.locator(`[data-project-id="${project}"]`).getByRole('button', { name: project, exact: true }).click()
    await objectsA.locator('[data-project-object="canvas"]').click()
    assert.equal(await canvasA.locator(`[data-node="${idA}"] input[aria-label="Node title"]`).inputValue(), 'Alpha edited')
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
// R7: referenced sources deleted or changed — missing excluded, updates adopted explicitly.
await scenario('R7 deleted source is excluded; changed source adopted only explicitly', async () => {
  const { browser, context, page, errors } = await launch()
  const state = await serve(context, { seeds: [[`${project}/paper.md`, { content: 'R7 source line.', digest: 'src-v1' }]] })
  try {
    await page.goto(url)
    await page.locator(`[data-project-objects="${project}"] [data-project-object="files"]`).click()
    await page.locator('[data-object-path=""]:visible').getByRole('button', { name: 'paper.md', exact: true }).click()
    const reader = page.locator(`[data-object-workspace="${project}"][data-object-path="paper.md"]`)
    await reader.locator('.research-document').waitFor()
    await reader.locator('.research-document').evaluate(el => { const range = document.createRange(); range.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(range); document.dispatchEvent(new Event('selectionchange')) })
    await reader.getByRole('button', { name: 'Create note from selection', exact: true }).click()
    const drafts = page.locator(`[data-draft-project="${project}"]`)
    await drafts.locator(':scope[data-draft-state="saved"]').waitFor()
    await drafts.getByRole('button', { name: 'Add source to Chat context', exact: true }).click()
    const panel = page.locator(`[data-context-panel="${project}"]`)
    await panel.locator('summary').click()
    await panel.locator('[data-context-item]').waitFor()
    state.files.delete(`${project}/paper.md`)
    await panel.getByRole('button', { name: 'Refresh', exact: true }).click()
    await panel.locator('[data-context-item][data-context-state="missing"]').waitFor()
    await panel.getByRole('button', { name: 'Pre-send check', exact: true }).click()
    await panel.locator('[data-context-issues]').getByText('Source file missing, excluded', { exact: false }).waitFor()
    state.files.set(`${project}/paper.md`, { content: 'R7 source line rewritten.', digest: 'src-v2' })
    await panel.getByRole('button', { name: 'Refresh', exact: true }).click()
    await panel.locator('[data-context-item][data-context-state="update-available"]').waitFor()
    await panel.getByRole('button', { name: 'Adopt new revision', exact: true }).click()
    await panel.locator('[data-context-item][data-context-state="current"]').waitFor()
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
// R8: interrupted apply — target written, journal unconfirmed: no blind retry; inspect and confirm.
await scenario('R8 lost journal acknowledgement blocks retry until human confirmation', async () => {
  const { browser, context, page, errors } = await launch()
  let texWritten = false, journalFailed = false
  const state = await serve(context, {
    seeds: [[`${project}/paper.md`, { content: tex, digest: 'src-v1' }]],
    onPut: (ws, name) => {
      if (name === 'paper.md') { texWritten = true; return undefined }
      if (name === 'research-reviews.json' && texWritten && !journalFailed) { journalFailed = true; return 500 }
      return undefined
    },
  })
  try {
    await page.goto(url)
    await page.locator(`[data-project-objects="${project}"] [data-project-object="files"]`).click()
    await page.locator('[data-object-path=""]:visible').getByRole('button', { name: 'paper.md', exact: true }).click()
    const reader = page.locator(`[data-object-workspace="${project}"][data-object-path="paper.md"]`)
    await reader.locator('.research-document').waitFor()
    await reader.locator('.research-document').evaluate(el => { const range = document.createRange(); range.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(range); document.dispatchEvent(new Event('selectionchange')) })
    await reader.getByRole('button', { name: 'Feedback and proposal', exact: true }).click()
    const review = page.locator(`[data-review-project="${project}"]`)
    await review.getByLabel('Original feedback', { exact: true }).fill('The claim is stronger than the evidence.')
    await review.getByLabel('Proposal title', { exact: true }).fill('R8 interrupted apply')
    await review.getByRole('button', { name: 'Load baseline', exact: true }).click()
    await review.getByLabel('After (complete value of this field)', { exact: true }).fill('A conditional conclusion.')
    await review.getByLabel('Rationale and evidence explanation', { exact: true }).fill('Narrow the claim.')
    await review.getByRole('button', { name: 'Add operation for review', exact: true }).click()
    await review.getByRole('button', { name: 'Save proposal for review (do not apply)', exact: true }).click()
    await review.locator('[data-review-operation]').waitFor()
    await review.locator('[data-review-operation] input[type=checkbox]').check()
    await review.getByRole('button', { name: 'Apply selected scope', exact: true }).click()
    await review.getByText(/Journal not confirmed\. Stop and reload/).waitFor()
    await review.getByText('Journal unconfirmed: stop writes, export the record, reload and inspect.', { exact: true }).waitFor()
    assert.equal(state.files.get(`${project}/paper.md`).content, 'A conditional conclusion.')
    assert.equal(state.puts.filter(k => k === `${project}/paper.md`).length, 1)
    await review.getByRole('button', { name: 'Reload journal', exact: true }).click()
    await review.getByText('Intent recorded / outcome unresolved', { exact: false }).waitFor()
    await review.getByRole('button', { name: 'Inspect actual content', exact: true }).click()
    await review.getByText(/after · fixture-/).waitFor()
    await review.getByRole('button', { name: 'Confirm observed state', exact: true }).click()
    await review.getByText('Confirmed matching after content', { exact: false }).waitFor()
    const journal = JSON.parse(state.files.get(`${project}/research-reviews.json`).content)
    assert.equal(journal.attempts.at(-1).outcome, 'observed-applied')
    assert.equal(state.puts.filter(k => k === `${project}/paper.md`).length, 1)
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
// R9: partial failure — one file applied, another not dispatched; receipts are per-file.
await scenario('R9 partial apply reports written and not-dispatched files separately', async () => {
  const { browser, context, page, errors } = await launch()
  const state = await serve(context, { seeds: [
    [`${project}/paper.md`, { content: tex, digest: 'src-v1' }],
    [`${project}/thinking.canvas.json`, { content: canvasV2, digest: 'canvas-v1' }],
  ] })
  try {
    await page.goto(url)
    await page.locator(`[data-project-objects="${project}"] [data-project-object="files"]`).click()
    await page.locator('[data-object-path=""]:visible').getByRole('button', { name: 'paper.md', exact: true }).click()
    const reader = page.locator(`[data-object-workspace="${project}"][data-object-path="paper.md"]`)
    await reader.locator('.research-document').waitFor()
    await reader.locator('.research-document').evaluate(el => { const range = document.createRange(); range.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(range); document.dispatchEvent(new Event('selectionchange')) })
    await reader.getByRole('button', { name: 'Feedback and proposal', exact: true }).click()
    const review = page.locator(`[data-review-project="${project}"]`)
    await review.getByLabel('Original feedback', { exact: true }).fill('The claim is stronger than the evidence.')
    await review.getByLabel('Proposal title', { exact: true }).fill('R9 partial apply')
    await review.getByRole('button', { name: 'Load baseline', exact: true }).click()
    await review.getByLabel('After (complete value of this field)', { exact: true }).fill('A conditional conclusion.')
    await review.getByLabel('Rationale and evidence explanation', { exact: true }).fill('Narrow the claim.')
    await review.getByRole('button', { name: 'Add operation for review', exact: true }).click()
    await review.getByLabel('Target type').selectOption('canvas')
    await review.getByRole('button', { name: 'Load baseline', exact: true }).click()
    await review.getByLabel('Target field', { exact: true }).selectOption({ label: 'Claim card / body' })
    await review.getByLabel('After (complete value of this field)', { exact: true }).fill('Updated card body.')
    await review.getByLabel('Rationale and evidence explanation', { exact: true }).fill('Align the card with the narrowed claim.')
    await review.getByRole('button', { name: 'Add operation for review', exact: true }).click()
    await review.getByRole('button', { name: 'Save proposal for review (do not apply)', exact: true }).click()
    await review.locator('[data-review-operation]').nth(1).waitFor()
    // Another writer moves the canvas baseline before the human approves.
    state.files.set(`${project}/thinking.canvas.json`, { content: canvasV2.replace('Original body.', 'Someone else rewrote this.'), digest: 'canvas-v2' })
    for (const box of await review.locator('[data-review-operation] input[type=checkbox]').all()) await box.check()
    await review.getByRole('button', { name: 'Apply selected scope', exact: true }).click()
    await review.getByRole('alert').filter({ hasText: 'NOT DISPATCHED' }).waitFor()
    assert.equal(state.files.get(`${project}/paper.md`).content, 'A conditional conclusion.')
    assert.ok(state.files.get(`${project}/thinking.canvas.json`).content.includes('Someone else rewrote this.'))
    assert.equal(state.puts.filter(k => k === `${project}/thinking.canvas.json`).length, 0)
    const journal = JSON.parse(state.files.get(`${project}/research-reviews.json`).content)
    assert.equal(journal.attempts.at(-1).outcome, 'applied')
    assert.equal(journal.notDispatched.at(-1).detail.includes('thinking.canvas.json'), true)
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
// R10: dark and light themes both render the real surfaces.
await scenario('R10 dark/light theme switching renders correctly', async () => {
  const { browser, page, errors } = await launch({ theme: 'dark' })
  try {
    await page.goto(url)
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'))
    await page.locator(`[data-project-objects="${project}"] [data-project-object="drafts"]`).click()
    await page.locator(`[data-draft-project="${project}"]`).waitFor()
    await page.getByRole('button', { name: 'Settings', exact: true }).first().click()
    await page.getByRole('tab', { name: 'Light', exact: true }).click()
    await page.waitForFunction(() => !document.documentElement.classList.contains('dark'))
    await page.getByRole('tab', { name: 'Dark', exact: true }).click()
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'))
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
// R11: zh and en locales render their own copy.
await scenario('R11 zh/en locales render translated surfaces', async () => {
  for (const [locale, nav, title] of [['zh', '聊天', '项目研究对象'], ['en', 'Chat', 'Project research objects']]) {
    const { browser, page, errors } = await launch({ locale })
    try {
      await page.goto(url)
      await page.getByText(nav, { exact: true }).first().waitFor()
      await page.locator(`[data-project-objects="${project}"] [data-project-object="drafts"]`).click()
      await page.locator(`[data-draft-project="${project}"]`).getByText(title, { exact: true }).first().waitFor()
      assert.deepEqual(errors, [])
    } finally { await browser.close() }
  }
})
// R12: the middle column switches surfaces by tab. A narrow viewport does not open a second column.
await scenario('R12 middle column uses tabs instead of a nested split', async () => {
  const { browser, page, errors } = await launch({ viewport: { width: 900, height: 800 } })
  try {
    await page.goto(url)
    await page.locator(`[data-project-objects="${project}"] [data-project-object="canvas"]`).click()
    const layout = page.locator('[data-xgc-role="research-middle-tabs"] [role="tablist"]')
    await layout.getByRole('tab', { name: 'Research canvas', exact: true }).waitFor()
    await page.locator(`[data-canvas-project="${project}"]`).waitFor()
    await layout.getByRole('tab', { name: 'Chat', exact: true }).click()
    await page.locator('.native-chat-host').waitFor()
    assert.equal(await page.locator('.research-workspace__toolbar').count(), 0)
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
// R13: keyboard focus order — header first, form autofocus, no trap.
await scenario('R13 keyboard focus order follows the layout and forms autofocus', async () => {
  const { browser, context, page, errors } = await launch()
  await serve(context)
  try {
    await page.goto(url)
    await page.locator(`[data-project-objects="${project}"]`).waitFor()
    await page.keyboard.press('Tab')
    const first = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent)
    assert.equal(first, 'Global search')
    const stops = []
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); stops.push(await page.evaluate(() => (document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent || '').trim().slice(0, 40))) }
    assert.ok(stops.every(Boolean), 'Focus must land on named controls, never lost.')
    await page.locator(`[data-project-objects="${project}"] [data-project-object="drafts"]`).click()
    const drafts = page.locator(`[data-draft-project="${project}"]`)
    await drafts.locator(':scope[data-draft-state]').waitFor()
    await drafts.getByRole('button', { name: 'Create draft', exact: true }).click()
    const focused = await page.evaluate(() => document.activeElement?.closest('label')?.textContent || '')
    assert.equal(focused, 'Draft name')
    // The submit button is disabled until the name is non-empty, so Tab reaches it only then.
    await page.keyboard.type('R13 keyboard draft')
    await page.keyboard.press('Tab')
    const next = await page.evaluate(() => document.activeElement?.textContent)
    assert.equal(next, 'Create draft')
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
// R14: reduced motion keeps the product functional.
await scenario('R14 prefers-reduced-motion keeps surfaces functional', async () => {
  const { browser, context, page, errors } = await launch({ reducedMotion: true })
  const state = await serve(context)
  try {
    await page.goto(url)
    await page.locator(`[data-project-objects="${project}"] [data-project-object="canvas"]`).click()
    const canvas = page.locator(`[data-canvas-project="${project}"]`)
    await canvas.getByRole('button', { name: 'Idea', exact: true }).click()
    await canvas.locator('[data-canvas-save-state="saved"]').waitFor()
    assert.ok(JSON.parse(state.files.get(`${project}/thinking.canvas.json`).content).nodes.length > 0)
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
if (failed) { console.error(`${failed} scenario(s) failed.`); process.exit(1) }
console.log('PASS F4 resilience matrix (14 scenarios, rendered, isolated fixtures). Real-backend acceptance remains separate.')
