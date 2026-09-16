import assert from 'node:assert/strict'
import { chromium } from 'playwright'
// F4 path acceptance, part 1: intake & reading, topic exploration, paper iteration.
// Runs the real rendered frontend with isolated file/build fixtures. NOT real-backend evidence.
const url = process.env.RESEARCH_UI_URL, project = process.env.RESEARCH_TEST_PROJECT
assert.ok(url, 'Set RESEARCH_UI_URL to an already running actual Research OS UI.')
assert.match(project || '', /^paper-e2e-[a-z0-9-]+$/, 'Use a registered dedicated paper-e2e-* project.')
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
const page = await context.newPage(), errors = [], blocked = [], writes = []
page.on('pageerror', error => errors.push(error.message))
page.on('dialog', dialog => dialog.accept())
await context.addInitScript(project => {
  localStorage.setItem('research-ui-project', project)
  localStorage.setItem('research-ui-locale', 'en')
  localStorage.setItem('research-ui-bottom', 'collapsed')
  localStorage.setItem('research.markPrompt.dockVisible', 'false')
}, project)
const evidence = 'F4 evidence line about conditional stability.'
const tex = 'A strong conclusion.'
const files = new Map([
  ['paper.md', { content: evidence, digest: 'src-v1' }],
  ['main.tex', { content: tex, digest: 'tex-v1' }],
])
let serial = 0, failMaterial = false
const pdfText = 'BT /F1 12 Tf 50 750 Td (A strong conclusion.) Tj ET'
const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${pdfText.length} >>\nstream\n${pdfText}\nendstream`]
let pdf = '%PDF-1.4\n', offsets = [0]
objects.forEach((o, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${o}\nendobj\n` })
const xref = Buffer.byteLength(pdf); pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
const builds = [{ task: { workspaceRef: project, entryPoint: 'main.tex', gitCommit: 'f4-commit', inputs: [{ path: 'main.tex', digest: 'tex-v1' }] }, manifest: { buildId: 'f4-build', completedAt: '2026-09-17T04:00:00Z', status: 'succeeded', diagnostics: [], outputs: [{ digest: 'pdf-v1', mediaType: 'application/pdf' }] } }]
await context.route('**/api/v1/**', async route => {
  const request = route.request(), u = new URL(request.url()), path = decodeURIComponent(u.pathname), base = `/api/v1/workspaces/${project}/files`
  const reply = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  if (path === '/api/v1/manuscripts/build-records' && u.searchParams.get('manuscriptId') === project) return reply(200, { data: builds })
  if (path === '/api/v1/manuscripts/build-records/f4-build/artifacts/pdf-v1') return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from(pdf) })
  if (path === base && request.method() === 'GET') return reply(200, { data: [...files.keys()].filter(name => !name.endsWith('.json')).map(name => ({ kind: 'file', path: name, sizeBytes: files.get(name).content.length })), meta: { directory: '', nextCursor: null } })
  if (path.startsWith(`${base}/`)) {
    const name = path.slice(base.length + 1), record = files.get(name)
    if (request.method() === 'GET') return record ? reply(200, { data: record }) : reply(404, { error: { message: 'Missing fixture file' } })
    if (request.method() === 'PUT' && (/^material-/.test(name) || ['main.tex', 'research-drafts.json', 'thinking.canvas.json', 'research-reviews.json'].includes(name))) {
      const input = request.postDataJSON()
      if (failMaterial && /^material-/.test(name)) { failMaterial = false; return reply(500, { error: { message: 'Intake backend unavailable (fixture)' } }) }
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
const flatOutline = artifact => canvasFile().outlines.find(o => o.artifact === artifact).items.flatMap(function flat(item) { return [item.node, ...(item.children || []).flatMap(flat)] })
try {
  await page.goto(url)

  // ── Path 1: intake and close reading ────────────────────────────────
  await objectsNav.locator('[data-project-object="drafts"]').click()
  await drafts.locator(':scope[data-draft-state]').waitFor()
  const upload = drafts.locator('input[type=file]')
  await upload.setInputFiles({ name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('Imported material body.') })
  await drafts.locator('[data-intake-state="accepted"]').waitFor()
  const materialWrites = writes.filter(name => /^material-/.test(name))
  assert.equal(materialWrites.length, 1)
  await drafts.getByRole('button', { name: 'Register project material', exact: true }).click()
  await draftSaved()
  const material = book().drafts.find(item => item.kind === 'material')
  assert.ok(material.sources[0].path.startsWith('material-'))
  assert.ok(material.sources[0].digest)
  // Failure 1: an unsupported format is refused before any upload.
  await drafts.getByRole('button', { name: 'Back to drafts', exact: true }).click()
  await upload.setInputFiles({ name: 'report.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('nope') })
  await drafts.locator('[data-intake-state="unsupported"]').waitFor()
  assert.equal(writes.filter(name => /docx/.test(name)).length, 0)
  // Failure 2: the intake API fails; the receipt says so honestly and retry works.
  failMaterial = true
  await upload.setInputFiles({ name: 'second.md', mimeType: 'text/markdown', buffer: Buffer.from('Second import.') })
  await drafts.locator('[data-intake-state="failed"]').waitFor()
  await drafts.locator('[data-intake-state="failed"]').getByText('Failed, not confirmed', { exact: false }).waitFor()
  await drafts.locator('[data-intake-state="failed"]').getByRole('button', { name: 'Retry', exact: true }).click()
  await drafts.locator('[data-intake-state="accepted"]:has-text("second.md")').waitFor()
  // Reading: open the source, capture a selection as a note with its observed revision.
  await objectsNav.locator('[data-project-object="files"]').click()
  await page.locator('[data-object-path=""]:visible').getByRole('button', { name: 'paper.md', exact: true }).click()
  const reader = page.locator(`[data-object-workspace="${project}"][data-object-path="paper.md"]`)
  await reader.locator('.research-document').waitFor()
  await reader.locator('.research-document').evaluate(el => { const range = document.createRange(); range.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(range); document.dispatchEvent(new Event('selectionchange')) })
  await reader.getByRole('button', { name: 'Create note from selection', exact: true }).click()
  await draftSaved()
  const note = book().drafts.find(item => item.kind === 'note')
  assert.equal(note.sources[0].digest, 'src-v1')
  assert.equal(note.sources[0].excerpt, evidence)
  await drafts.getByLabel('Notes and interpretation (not verified knowledge)', { exact: true }).fill('Interpretation pending verification')
  await draftSaved()
  // Return to the source: the recorded revision still matches, so the excerpt is located.
  await drafts.getByRole('button', { name: 'paper.md', exact: true }).click()
  await reader.getByText('Located the excerpt in the recorded revision.', { exact: true }).waitFor()
  // Link the note into the research canvas as a navigable reference.
  await objectsNav.locator('[data-project-object="notes"]').click()
  await drafts.locator(`[data-draft-id="${note.id}"]`).click()
  await drafts.getByRole('button', { name: 'Reference in research canvas', exact: true }).click()
  await canvasSaved()
  assert.equal(canvasFile().nodes[0].anchor, `research-drafts.json#${note.id}`)
  console.log('PASS path 1: intake (accepted + unsupported + failed/retry), sourced note, source locate, canvas reference')

  // ── Path 2: topic exploration ───────────────────────────────────────
  await objectsNav.locator('[data-project-object="canvas"]').click()
  await canvasSaved()
  const addNode = async (kind, title, body) => {
    const before = canvasFile().nodes.length
    await canvas.getByRole('button', { name: kind, exact: true }).click()
    await canvasSaved()
    const id = canvasFile().nodes.at(-1).id
    assert.ok(canvasFile().nodes.length > before)
    await canvas.locator(`[data-node="${id}"] input[aria-label="Node title"]`).fill(title)
    if (body) await canvas.locator(`[data-node="${id}"] textarea[aria-label="Node body"]`).fill(body)
    await canvasSaved()
    return id
  }
  const chapter = await addNode('Chapter', 'Stability hypotheses')
  const hypoA = await addNode('Idea', 'Hypothesis A: local stability', 'Holds only inside the measured region.')
  const hypoB = await addNode('Idea', 'Hypothesis B: global stability', 'Competing explanation; counterexample unknown.')
  // Outline: arrange the argument structure explicitly; the draft reference stays unarranged.
  await canvas.getByRole('button', { name: 'Outline', exact: true }).click()
  const outline = canvas.locator('[data-outline-view="canvas"]')
  for (const id of [chapter, hypoA, hypoB]) {
    await outline.locator(`[data-outline-node="${id}"]`).getByRole('button', { name: 'Add to outline', exact: true }).click()
    await canvasSaved()
  }
  await outline.locator(`[data-outline-node="${hypoA}"]`).getByRole('button', { name: 'Indent', exact: true }).click()
  await outline.locator(`[data-outline-node="${hypoB}"]`).getByRole('button', { name: 'Indent', exact: true }).click()
  await canvasSaved()
  assert.deepEqual(flatOutline('canvas'), [chapter, hypoA, hypoB])
  // Node cards spawn near the center and overlap. Switch to the wide canvas-only layout,
  // then drag each card to a fixed spread-out position so grabs and edge drops are exact.
  const visiblePoint = async id => {
    const point = await page.evaluate(id => {
      const el = document.querySelector(`[data-node="${id}"]`)
      if (!el) return null
      const r = el.getBoundingClientRect()
      for (let y = r.top + 8; y < r.bottom - 4; y += 9)
        for (let x = r.left + 8; x < r.right - 4; x += 11)
          if (document.elementFromPoint(x, y)?.closest('[data-node]') === el) return { x, y }
      return null
    }, id)
    assert.ok(point, `Card ${id} must have a visible grab point.`)
    return point
  }
  await canvas.getByRole('button', { name: 'Research canvas', exact: true }).click()
  const layout = page.locator('.research-workspace__toolbar [role="group"]')
  await layout.getByRole('button', { name: 'Canvas', exact: true }).click()
  const deselect = async () => {
    const r = await canvas.locator('[role="region"][aria-label="Research canvas"]').boundingBox()
    await page.mouse.click(r.x + 6, r.y + 6)
  }
  await deselect()
  const moveNode = async (id, tx, ty) => {
    const start = canvasFile().nodes.find(n => n.id === id)
    const grab = await visiblePoint(id)
    await page.mouse.move(grab.x, grab.y)
    await page.mouse.down()
    await page.mouse.move(grab.x + (tx - start.x), grab.y + (ty - start.y), { steps: 8 })
    await page.mouse.up()
    await canvasSaved()
  }
  const beforeMove = canvasFile().nodes.find(n => n.id === hypoA)
  // Top-most cards first: the chapter is at the bottom of the overlap stack until the others move.
  await moveNode(hypoB, 520, 460)
  await moveNode(hypoA, 30, 460)
  await moveNode(chapter, 260, 120)
  // Rearranging the visual layout never reorders the argument.
  assert.notEqual(canvasFile().nodes.find(n => n.id === hypoA).x, beforeMove.x)
  assert.deepEqual(flatOutline('canvas'), [chapter, hypoA, hypoB])
  // Two competing hypotheses with explicit relations: supports and contradicts.
  const dragEdge = async (from, to) => {
    const handle = await canvas.locator(`[data-node="${from}"] [data-handle]`).boundingBox()
    const hx = handle.x + handle.width / 2, hy = handle.y + handle.height / 2
    const handleHit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-node]')?.getAttribute('data-node') || '', [hx, hy])
    assert.equal(handleHit, from, 'Edge handle must be grabbable on the source card.')
    const drop = await visiblePoint(to)
    await page.mouse.move(hx, hy)
    await page.mouse.down()
    await page.mouse.move(drop.x, drop.y, { steps: 6 })
    await page.mouse.up()
    await canvasSaved()
  }
  await dragEdge(hypoA, hypoB)
  await dragEdge(chapter, hypoA)
  assert.equal(canvasFile().edges.length, 2)
  // A 1.5px dashed stroke misses most exact hit-test points even for real users;
  // dispatch the click on the path element itself, then drive the inspector normally.
  const clickEdge = async index => {
    const paths = canvas.locator('svg path.pointer-events-auto')
    assert.equal(await paths.count(), 2)
    await paths.nth(index).dispatchEvent('click')
  }
  await clickEdge(0)
  const inspector = canvas.locator('[data-canvas-inspector]')
  await inspector.getByLabel('Semantic relation').selectOption('supports')
  await canvasSaved()
  assert.equal(canvasFile().edges[0].relation, 'supports')
  // Evidence: one pinned to an observed revision, one explicitly unverifiable.
  await canvas.getByRole('button', { name: 'Outline', exact: true }).click()
  await outline.locator(`[data-outline-node="${hypoA}"]`).getByRole('button', { name: 'Hypothesis A: local stability', exact: true }).click()
  await canvas.getByRole('button', { name: 'Research canvas', exact: true }).click()
  await inspector.getByLabel('Evidence file path').fill('paper.md')
  await inspector.getByLabel('Observed revision (optional)').fill('src-v1')
  await inspector.getByLabel('Excerpt (optional)').fill(evidence)
  await inspector.getByRole('button', { name: 'Add evidence', exact: true }).click()
  await inspector.getByLabel('Evidence file path').fill('unverified-ref.md')
  await inspector.getByRole('button', { name: 'Add evidence', exact: true }).click()
  await inspector.getByText('Version cannot be auto-verified', { exact: true }).waitFor()
  await inspector.getByLabel('Writing purpose').fill('Compare both hypotheses against the measured region.')
  await canvasSaved()
  const nodeA = canvasFile().nodes.find(n => n.id === hypoA)
  assert.equal(nodeA.evidence.length, 2)
  assert.equal(nodeA.evidence[0].digest, 'src-v1')
  assert.equal(nodeA.evidence[1].digest, undefined)
  // Context: add the card to the visible Chat context; check and insert — never send.
  await layout.getByRole('button', { name: 'Split', exact: true }).click()
  await inspector.getByRole('button', { name: 'Add to Chat context', exact: true }).click()
  const contextPanel = page.locator(`[data-context-panel="${project}"]`)
  await contextPanel.locator('summary').click()
  await contextPanel.locator('[data-context-item]').waitFor()
  await contextPanel.getByRole('button', { name: 'Pre-send check', exact: true }).click()
  await contextPanel.locator('[data-context-issues]').waitFor()
  assert.equal((await contextPanel.locator('[data-context-issues] li').allTextContents()).join(''), '✓')
  await contextPanel.getByRole('button', { name: 'Insert context manifest into draft', exact: true }).click()
  await contextPanel.getByText('Inserted into the draft; still not sent.', { exact: true }).waitFor()
  const draftText = await page.locator('.native-chat-host [contenteditable="true"]').first().textContent() ?? ''
  assert.match(draftText, new RegExp(`thinking\\.canvas\\.json#${hypoA}`))
  assert.match(draftText, /不等于已发送|not sent/i)
  assert.deepEqual(blocked, [], 'No Chat send or other unexpected write may happen during context insert.')
  console.log('PASS path 2: hypothesis structure, layout/order separation, relations, evidence, visible context')

  // ── Path 3: paper iteration ─────────────────────────────────────────
  await objectsNav.locator('[data-project-object="drafts"]').click()
  await draftSaved()
  await drafts.getByRole('button', { name: 'Create draft', exact: true }).click()
  await drafts.getByLabel('Draft type').selectOption('paper')
  await drafts.getByLabel('Draft name').fill('F4 paper structure')
  await drafts.getByRole('button', { name: 'Create draft', exact: true }).click()
  await draftSaved()
  await drafts.getByLabel('Research goal', { exact: true }).fill('Decide between the two stability hypotheses.')
  await drafts.getByLabel('Writing goal', { exact: true }).fill('State the conditional claim precisely.')
  await drafts.getByLabel('Argument and content', { exact: true }).fill('Compare hypotheses; keep the measured scope.')
  await drafts.getByText('Choose shared research source', { exact: true }).click()
  await drafts.getByRole('button', { name: /F4 evidence line/ }).click()
  await draftSaved()
  const paperDraft = book().drafts.find(item => item.kind === 'paper')
  assert.equal(paperDraft.sources[0].digest, 'src-v1')
  // Read the built PDF of the same project and annotate the strong claim.
  await objectsNav.locator('[data-project-object="builds"]').click()
  await page.locator('.rtab-panel:visible').getByRole('button', { name: 'main.tex · PDF', exact: true }).click()
  const pdfReader = page.locator('[data-xgc-role="pdf-reader"]')
  await pdfReader.locator('.research-pdf-text span').first().waitFor()
  await pdfReader.locator('.research-pdf-text').evaluate(el => { const range = document.createRange(); range.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(range); document.dispatchEvent(new Event('selectionchange')) })
  await pdfReader.locator('[data-xgc-role="pdf-page"]').dispatchEvent('mouseup')
  await pdfReader.locator('[data-xgc-role="pdf-annotation-editor"] textarea').fill('The evidence supports only specific conditions.')
  await page.locator('.rtab-panel:visible').getByRole('button', { name: 'Feedback and proposal', exact: true }).click()
  // Compose the proposal; preview proves nothing was written.
  await review.getByLabel('Proposal title', { exact: true }).fill('F4 narrow the claim')
  await review.getByLabel('Target relative path (explicit confirmation required)', { exact: true }).fill('main.tex')
  await review.getByRole('button', { name: 'Load baseline', exact: true }).click()
  await review.getByLabel('Select the exact range in raw text', { exact: true }).evaluate((el, length) => { el.focus(); el.setSelectionRange(0, length); el.dispatchEvent(new Event('select', { bubbles: true })); document.dispatchEvent(new Event('selectionchange')) }, tex.length)
  await review.getByLabel('After (complete value of this field)', { exact: true }).fill('A conditional conclusion.')
  await review.getByLabel('Rationale and evidence explanation', { exact: true }).fill('Narrow the claim to the measured region.')
  await review.getByRole('button', { name: 'Add operation for review', exact: true }).click()
  await review.getByRole('button', { name: 'Save proposal for review (do not apply)', exact: true }).click()
  await review.locator('[data-review-operation]').waitFor()
  assert.equal(writes.filter(name => name === 'main.tex').length, 0)
  await review.locator('[data-review-operation] input[type=checkbox]').check()
  await review.getByRole('button', { name: 'Validate preview (no writes)', exact: true }).click()
  await review.getByText('Preview only; no target file was written', { exact: false }).waitFor()
  assert.equal(writes.filter(name => name === 'main.tex').length, 0)
  // Apply the selected scope: the source file changes with a version-checked write.
  await review.getByRole('button', { name: 'Apply selected scope', exact: true }).click()
  await review.locator('[data-review-operation]').getByText('Applied', { exact: true }).waitFor()
  assert.equal(files.get('main.tex').content, 'A conditional conclusion.')
  // Version feedback: the retained PDF preview is now known to be older than the source.
  await objectsNav.locator('[data-project-object="builds"]').click()
  await page.locator('.rtab-panel:visible').getByRole('button', { name: 'main.tex · PDF', exact: true }).click()
  const provenance = page.locator('[data-review-build="f4-build"]')
  await provenance.locator('summary').click()
  await provenance.getByRole('button', { name: 'Refresh receipts', exact: true }).click()
  await provenance.getByText('Changed; preview is not current source', { exact: false }).waitFor()
  // Return to the exact annotated build; then protected recovery restores the baseline.
  await objectsNav.locator('[data-project-object="reviews"]').click()
  await review.getByRole('button', { name: 'F4 narrow the claim', exact: true }).click()
  await review.getByRole('button', { name: 'Return to annotated version', exact: true }).click()
  await pdfReader.locator('.research-pdf-text span').first().waitFor()
  await objectsNav.locator('[data-project-object="reviews"]').click()
  await review.getByRole('button', { name: 'F4 narrow the claim', exact: true }).click()
  await review.locator('[data-review-operation] input[type=checkbox]').check()
  await review.getByRole('button', { name: 'Guarded recovery', exact: true }).click()
  await review.locator('[data-review-operation]').getByText('Reverted', { exact: true }).waitFor()
  assert.equal(files.get('main.tex').content, tex)
  const journal = JSON.parse(files.get('research-reviews.json').content)
  assert.deepEqual(journal.attempts.map(a => a.outcome), ['applied', 'reverted'])
  // Everything above survives a full reload from the same files.
  await page.reload()
  await objectsNav.locator('[data-project-object="reviews"]').click()
  await review.getByRole('button', { name: 'F4 narrow the claim', exact: true }).click()
  await review.locator('[data-review-operation]').getByText('Reverted', { exact: true }).waitFor()
  console.log('PASS path 3: canvas/outline -> draft -> PDF -> annotation -> proposal -> preview/apply -> version feedback -> guarded recovery -> reload')

  assert.deepEqual(errors, [])
  assert.deepEqual(blocked, [], 'Unexpected writes were blocked. Use a fully registered dedicated test project.')
  console.log('PASS F4 paths 1-3 (rendered, isolated fixtures). Real-backend acceptance remains separate.')
} finally { await context.close(); await browser.close() }
