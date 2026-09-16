import assert from 'node:assert/strict'
import { chromium } from 'playwright'
// F4 path acceptance, part 2: multi-artifact expression, methods & continuous research, experiment & knowledge return.
// Runs the real rendered frontend with isolated file/plan fixtures. NOT real-backend evidence.
const url = process.env.RESEARCH_UI_URL, project = process.env.RESEARCH_TEST_PROJECT
assert.ok(url, 'Set RESEARCH_UI_URL to an already running actual Research OS UI.')
assert.match(project || '', /^paper-e2e-[a-z0-9-]+$/, 'Use a registered dedicated paper-e2e-* project.')
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
const page = await context.newPage(), errors = [], blocked = [], writes = [], planCalls = []
page.on('pageerror', error => errors.push(error.message))
page.on('dialog', dialog => dialog.accept())
await context.addInitScript(project => {
  localStorage.setItem('research-ui-project', project)
  localStorage.setItem('research-ui-locale', 'en')
  localStorage.setItem('research-ui-bottom', 'collapsed')
  localStorage.setItem('research.markPrompt.dockVisible', 'false')
}, project)
const evidence = 'F4 shared source line about conditional stability.'
const files = new Map([['paper.md', { content: evidence, digest: 'src-v1' }]])
let serial = 0, planState = 'unapproved'
const planDraft = {
  title: 'F4 real workflow', goal: 'Compare the two stability hypotheses.',
  workspace: { id: project, revision: 'abc123def456' }, researcher: 'agent-a', reviewer: 'agent-b', writer: 'agent-c',
  nodes: [{ id: 'evidence', kind: 'EvidenceRead', title: 'Evidence research', objective: 'Gather the measured evidence.', acceptance: ['Every claim links a verifiable source'], inputs: [], dependsOn: [], knowledge: [] }],
}
const revision = () => [{
  version: 1, digest: 'plan-v1', draft: planDraft, approved: planState !== 'unapproved',
  runs: planState === 'running' ? [{ id: 'run-1', status: 'running', researchAcceptance: '', receipts: [{ stage: 'research', sessionId: 'sess-1', turnId: 'turn-1', status: 'running', output: '', events: [] }] }]
    : planState === 'cancelled' ? [{ id: 'run-1', status: 'cancelled', researchAcceptance: '', receipts: [{ stage: 'research', sessionId: 'sess-1', turnId: 'turn-1', status: 'cancelled', output: '', events: [] }] }] : [],
}]
await context.route('**/api/v1/**', async route => {
  const request = route.request(), u = new URL(request.url()), path = decodeURIComponent(u.pathname), base = `/api/v1/workspaces/${project}/files`
  const reply = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  const plans = `/api/v1/research/projects/${project}/plans`
  if (path === plans && request.method() === 'GET') return reply(200, { data: revision() })
  if (path === `${plans}/1/approve` && request.method() === 'POST') { planCalls.push('approve'); planState = 'approved'; return reply(200, { data: {} }) }
  if (path === `${plans}/1/execute` && request.method() === 'POST') { planCalls.push(`execute key:${request.headers()['idempotency-key'] ? 'present' : 'missing'}`); planState = 'running'; return reply(200, { data: {} }) }
  if (path === `${plans}/1/runs/run-1/cancel` && request.method() === 'POST') { planCalls.push('cancel'); planState = 'cancelled'; return reply(200, { data: {} }) }
  if (path === base && request.method() === 'GET') return reply(200, { data: [{ kind: 'file', path: 'paper.md', sizeBytes: evidence.length }], meta: { directory: '', nextCursor: null } })
  if (path.startsWith(`${base}/`)) {
    const name = path.slice(base.length + 1), record = files.get(name)
    if (request.method() === 'GET') return record ? reply(200, { data: record }) : reply(404, { error: { message: 'Missing fixture file' } })
    if (request.method() === 'PUT' && ['research-drafts.json', 'thinking.canvas.json', 'research-reviews.json'].includes(name)) {
      const input = request.postDataJSON()
      if (input.createOnly ? Boolean(record) : input.expectedDigest !== record?.digest) return reply(409, { error: { message: 'Fixture CAS conflict' } })
      const saved = { content: input.content, digest: `fixture-${++serial}` }; files.set(name, saved); writes.push(name)
      return reply(200, { data: { digest: saved.digest } })
    }
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) { blocked.push(`${request.method()} ${path}`); return route.abort('blockedbyclient') }
  return route.continue()
})
const objectsNav = page.locator(`[data-project-objects="${project}"]`)
const drafts = page.locator(`[data-draft-project="${project}"]`)
const canvas = page.locator(`[data-canvas-project="${project}"]`)
const review = page.locator(`[data-review-project="${project}"]`)
const draftSaved = () => drafts.locator(':scope[data-draft-state="saved"]').waitFor()
const canvasSaved = () => canvas.locator('[data-canvas-save-state="saved"]').waitFor()
const book = () => JSON.parse(files.get('research-drafts.json').content)
const canvasFile = () => JSON.parse(files.get('thinking.canvas.json').content)
const backToDrafts = async () => {
  await drafts.getByRole('button', { name: 'Back to drafts', exact: true }).click()
  // Creating a draft narrows the list filter to its kind; reset it or other rows stay hidden.
  await drafts.getByLabel('Object type').selectOption('')
}
const createDraft = async (kind, name) => {
  await drafts.getByRole('button', { name: 'Create draft', exact: true }).click()
  await drafts.getByLabel('Draft type').selectOption(kind)
  await drafts.getByLabel('Draft name').fill(name)
  await drafts.getByRole('button', { name: 'Create draft', exact: true }).click()
  await draftSaved()
  return book().drafts.find(item => item.title === name).id
}
const shareSource = async () => {
  await drafts.getByText('Choose shared research source', { exact: true }).click()
  await drafts.getByRole('button', { name: /F4 shared source line/ }).click()
  await draftSaved()
}
try {
  await page.goto(url)

  // ── Path 4: multi-artifact expression ───────────────────────────────
  // One shared, pinned research source captured from reading.
  await objectsNav.locator('[data-project-object="files"]').click()
  await page.locator('[data-object-path=""]:visible').getByRole('button', { name: 'paper.md', exact: true }).click()
  const reader = page.locator(`[data-object-workspace="${project}"][data-object-path="paper.md"]`)
  await reader.locator('.research-document').waitFor()
  await reader.locator('.research-document').evaluate(el => { const range = document.createRange(); range.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(range); document.dispatchEvent(new Event('selectionchange')) })
  await reader.getByRole('button', { name: 'Create note from selection', exact: true }).click()
  await draftSaved()
  const noteId = book().drafts.find(item => item.kind === 'note').id
  await backToDrafts()
  // Paper, slides and storyboard all draw on the same pinned source.
  const fields = { paper: 'Writing goal', slides: 'Key message', storyboard: 'Narration' }
  const ids = {}
  for (const kind of ['paper', 'slides', 'storyboard']) {
    ids[kind] = await createDraft(kind, `F4 multi ${kind}`)
    await shareSource()
    assert.equal(book().drafts.find(item => item.id === ids[kind]).sources[0].digest, 'src-v1')
    await drafts.getByLabel(fields[kind], { exact: true }).fill(`${kind} expresses the conditional claim.`)
    await draftSaved()
    await backToDrafts()
  }
  // Each artifact keeps its own block set and its own order.
  await drafts.locator(`[data-draft-id="${ids.slides}"]`).click()
  await drafts.getByRole('button', { name: 'Add page', exact: true }).click()
  await drafts.getByLabel('Key message', { exact: true }).nth(1).fill('Second page: counterexample scope.')
  await draftSaved()
  await drafts.getByRole('button', { name: 'Move up 2', exact: true }).click()
  await draftSaved()
  const slidesBlocks = book().drafts.find(item => item.id === ids.slides).blocks
  assert.equal(slidesBlocks[0].fields.message, 'Second page: counterexample scope.')
  assert.equal(book().drafts.find(item => item.id === ids.storyboard).blocks.length, 1)
  await backToDrafts()
  // The conclusion changes in the source note; artifacts are not silently rewritten or repinned.
  await drafts.locator(`[data-draft-id="${noteId}"]`).click()
  await drafts.getByLabel('Notes and interpretation (not verified knowledge)', { exact: true }).fill('Conclusion narrowed: local stability only.')
  await draftSaved()
  assert.equal(book().drafts.find(item => item.id === ids.paper).blocks[0].fields.purpose, 'paper expresses the conditional claim.')
  assert.equal(book().drafts.find(item => item.id === ids.storyboard).blocks[0].fields.narration, 'storyboard expresses the conditional claim.')
  assert.equal(book().drafts.find(item => item.id === ids.paper).sources[0].digest, 'src-v1')
  await backToDrafts()
  // Both artifacts reference the shared canvas; each keeps its own arrangement order.
  for (const kind of ['slides', 'storyboard']) {
    await drafts.locator(`[data-draft-id="${ids[kind]}"]`).click()
    await drafts.getByRole('button', { name: 'Reference in research canvas', exact: true }).click()
    await canvasSaved()
    await backToDrafts()
  }
  const anchorOf = draftId => canvasFile().nodes.find(n => n.anchor === `research-drafts.json#${draftId}`).id
  await objectsNav.locator('[data-project-object="canvas"]').click()
  await canvasSaved()
  await canvas.getByRole('button', { name: 'Outline', exact: true }).click()
  for (const kind of ['slides', 'storyboard']) {
    await canvas.getByRole('button', { name: `Create artifact arrangement · F4 multi ${kind}`, exact: true }).click()
    const outline = canvas.locator(`[data-outline-view="${ids[kind]}"]`)
    await outline.locator(`[data-outline-node="${anchorOf(ids[kind])}"]`).getByRole('button', { name: 'Add to outline', exact: true }).click()
    await canvasSaved()
  }
  const slidesOutline = canvasFile().outlines.find(o => o.artifact === ids.slides)
  const storyboardOutline = canvasFile().outlines.find(o => o.artifact === ids.storyboard)
  assert.deepEqual(slidesOutline.items.map(i => i.node), [anchorOf(ids.slides)])
  assert.deepEqual(storyboardOutline.items.map(i => i.node), [anchorOf(ids.storyboard)])
  assert.equal(canvasFile().outlines.find(o => o.artifact === 'canvas').items.length, 0)
  console.log('PASS path 4: shared pinned source, independent blocks/order, conclusion change isolation, per-artifact arrangements')

  // ── Path 5: methods and continuous research ─────────────────────────
  await objectsNav.locator('[data-project-object="drafts"]').click()
  await draftSaved()
  ids.workflow = await createDraft('workflow', 'F4 workflow definition')
  await drafts.getByText('Draft editing only: no paper/video generation, workflow execution, subscription, scheduling or simulation.', { exact: true }).waitFor()
  await drafts.getByText('Draft · not executed', { exact: false }).waitFor()
  await drafts.getByLabel('Step objective', { exact: true }).fill('Compare hypothesis A against the measured region.')
  await draftSaved()
  await backToDrafts()
  ids.rule = await createDraft('rule', 'F4 RSS rule')
  await drafts.getByLabel('Feed source', { exact: true }).fill('https://example.org/feed.xml')
  await drafts.getByLabel('Filter conditions', { exact: true }).fill('stability OR contraction')
  await draftSaved()
  // Saving the rule does not claim any tracking has started: no subscription/scheduler call exists.
  assert.deepEqual(blocked, [])
  await backToDrafts()
  // The linked real workflow is separate from the local definition draft.
  await drafts.getByRole('button', { name: 'Link existing workflow', exact: true }).click()
  await draftSaved()
  await drafts.getByRole('button', { name: 'Existing project workflow', exact: true }).click()
  const workflow = page.locator('.workflow-page')
  await workflow.getByText('F4 real workflow', { exact: true }).waitFor()
  // Real approval: the button stays disabled until the explicit consent checkbox.
  const approve = page.getByRole('button', { name: 'Approve revision 1', exact: true })
  assert.equal(await approve.isDisabled(), true)
  await workflow.getByRole('checkbox').check()
  await approve.click()
  // Real execution with an idempotency key, then a real cancel.
  const run = page.getByRole('button', { name: 'Run research, review and writing', exact: true })
  await run.waitFor()
  await run.click()
  const stop = page.getByRole('button', { name: 'Stop run', exact: true })
  await stop.waitFor()
  await workflow.getByText('running', { exact: true }).first().waitFor()
  await stop.click()
  await run.waitFor()
  await workflow.getByText('cancelled', { exact: true }).first().waitFor()
  assert.deepEqual(planCalls, ['approve', 'execute key:present', 'cancel'])
  assert.equal(book().drafts.find(item => item.id === ids.workflow).status, 'draft')
  console.log('PASS path 5: definition/rule drafts stay drafts, real approve/execute/cancel wiring with idempotency key')

  // ── Path 6: experiment requirements and knowledge return ────────────
  await objectsNav.locator('[data-project-object="drafts"]').click()
  await draftSaved()
  ids.experiment = await createDraft('experiment', 'F4 experiment')
  await drafts.getByLabel('Question and hypothesis', { exact: true }).fill('Does the region boundary move with gain?')
  await drafts.getByLabel('Parameters and values', { exact: true }).fill('gain: 0.5, 1.0, 2.0')
  await drafts.getByLabel('Checks and acceptance criteria', { exact: true }).fill('Boundary shift within measurement noise.')
  await draftSaved()
  // No run results exist; the requirement is a draft and nothing is fabricated as a result.
  assert.equal(book().drafts.find(item => item.id === ids.experiment).status, 'draft')
  await backToDrafts()
  // Knowledge promotion from a note is a labeled suggestion, never a global write.
  await drafts.locator(`[data-draft-id="${noteId}"]`).click()
  await drafts.getByLabel('Promotion rationale and checks', { exact: true }).fill('Local-stability boundary; verify against experiment F4 experiment.')
  await drafts.getByRole('button', { name: 'Propose knowledge promotion', exact: true }).click()
  await drafts.getByText('Pending human review; check this page’s save state.', { exact: true }).waitFor()
  await draftSaved()
  assert.equal(book().drafts.find(item => item.id === noteId).knowledgeSuggestion.status, 'suggested')
  // Review-scoped promotion: approving the scope records a decision only.
  await drafts.getByLabel('Notes and interpretation (not verified knowledge)', { exact: true }).locator('xpath=..').getByRole('button', { name: 'Feedback and proposal', exact: true }).click()
  await review.getByLabel('Original feedback', { exact: true }).fill('Promote the narrowed stability conclusion with its conditions.')
  await review.getByLabel('Proposal title', { exact: true }).fill('F4 knowledge scope')
  await review.getByRole('checkbox', { name: 'Include knowledge-promotion scope review' }).check()
  await review.getByLabel('Target knowledge scope', { exact: true }).fill('Conditional stability results for this project family.')
  await review.getByLabel('Conditions and limitations', { exact: true }).fill('Measured region only; gain sweep incomplete.')
  await review.getByLabel('Verification state and remaining checks', { exact: true }).fill('Unverified; needs experiment F4 experiment.')
  await review.getByRole('button', { name: 'Save proposal for review (do not apply)', exact: true }).click()
  await review.getByText('Knowledge scope review; no global write', { exact: true }).waitFor()
  await review.getByRole('button', { name: 'Approve this scope only', exact: true }).click()
  await review.getByText(/approved-scope/).waitFor()
  const journal = JSON.parse(files.get('research-reviews.json').content)
  assert.equal(journal.proposals[0].promotion.decision, 'approved-scope')
  assert.deepEqual(blocked, [], 'Knowledge approval must not write any global knowledge endpoint.')
  // Everything persists across a reload.
  await page.reload()
  await objectsNav.locator('[data-project-object="drafts"]').click()
  await draftSaved()
  for (const id of Object.values(ids)) await drafts.locator(`[data-draft-id="${id}"]`).waitFor()
  console.log('PASS path 6: experiment draft with empty results, promotion suggestion, scoped approval without global write, reload')

  assert.deepEqual(errors, [])
  assert.deepEqual(blocked, [])
  console.log('PASS F4 paths 4-6 (rendered, isolated fixtures). Real-backend acceptance remains separate.')
} finally { await context.close(); await browser.close() }
