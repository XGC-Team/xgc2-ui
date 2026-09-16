import assert from 'node:assert/strict'
import { chromium } from 'playwright'
// F4 capacity baseline: 3 projects x (40-card canvas + 30 drafts), 10 open tabs, one 12-page PDF.
// This records numbers; it is NOT a performance assertion. Rendered frontend, isolated fixtures.
const url = process.env.RESEARCH_UI_URL
const projects = [process.env.RESEARCH_TEST_PROJECT, process.env.RESEARCH_TEST_PROJECT_B || 'paper-e2e-f2', process.env.RESEARCH_TEST_PROJECT_C || 'paper-e2e-f3']
assert.ok(url, 'Set RESEARCH_UI_URL to an already running actual Research OS UI.')
for (const p of projects) assert.match(p || '', /^paper-e2e-[a-z0-9-]+$/, 'Use registered dedicated paper-e2e-* projects.')
const exe = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
// Fixture datasets
const relations = ['supports', 'contradicts', 'depends', 'exemplifies', 'continues', 'cites']
const canvasDoc = () => {
  const nodes = [{ id: 'chap', kind: 'chapter', title: 'Argument spine', x: 0, y: 0 }]
  for (let i = 0; i < 39; i++) nodes.push({
    id: `n${i}`, kind: 'idea', title: `Card ${i}: conditional claim fragment`,
    body: `Body of card ${i}. `.repeat(12).trim(),
    x: (i % 8) * 260, y: 190 + Math.floor(i / 8) * 190,
    ...(i < 5 ? { evidence: [{ id: `ev${i}`, path: `papers/ref-${i}.md`, digest: `rev-${i}`, excerpt: 'pinned excerpt' }] } : {}),
  })
  const edges = []
  for (let i = 0; i < 30; i++) edges.push({ from: `n${i}`, to: `n${(i + 7) % 39}`, relation: relations[i % relations.length] })
  return JSON.stringify({ version: 2, nodes, edges, outlines: [{ artifact: 'canvas', items: [{ node: 'chap', children: nodes.slice(1).map(n => ({ node: n.id })) }] }] }, null, 2) + '\n'
}
const DRAFT_FIELDS = {
  paper: ['purpose', 'argument', 'evidence', 'constraints'], slides: ['message', 'visual', 'speakerNotes'],
  storyboard: ['visual', 'narration', 'duration'], workflow: ['objective', 'inputs', 'outputs', 'acceptance'],
  rule: ['feed', 'filter', 'action'], experiment: ['question', 'parameters', 'measurement', 'acceptance'],
  note: ['question', 'observation'], material: ['description'],
}
const draftsDoc = project => JSON.stringify({
  version: 1, projectId: project, workspace: project,
  drafts: Array.from({ length: 30 }, (_, i) => {
    const kind = ['note', 'paper', 'slides', 'storyboard', 'experiment', 'rule'][i % 6]
    return {
      id: `d${i}`, kind, status: 'draft', title: `Baseline ${kind} ${i}`,
      createdAt: '2026-09-17T00:00:00.000Z', updatedAt: '2026-09-17T00:00:00.000Z',
      blocks: [{ id: `b${i}`, title: `Block ${i}`, fields: Object.fromEntries(DRAFT_FIELDS[kind].map(f => [f, `Content ${i} `.repeat(10).trim()])) }],
      sources: i === 0 ? [{ id: 's0', path: 'paper.md', digest: 'src-v1', excerpt: 'shared excerpt' }] : [],
    }
  }),
}, null, 2) + '\n'
const multiPagePdf = pages => {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  pages.forEach((text, i) => {
    const stream = `BT /F1 12 Tf 50 750 Td (${text}) Tj ET`
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  })
  let pdf = '%PDF-1.4\n'
  const offsets = objects.map(o => { const at = Buffer.byteLength(pdf); pdf += `${objects.indexOf(o) + 1} 0 obj\n${o}\nendobj\n`; return at })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return pdf
}
const pdf = multiPagePdf(Array.from({ length: 12 }, (_, i) => `Baseline PDF page ${i + 1}`))
const builds = [{ task: { workspaceRef: projects[0], entryPoint: 'main.tex', gitCommit: 'cap-commit', inputs: [{ path: 'main.tex', digest: 'tex-v1' }] }, manifest: { buildId: 'cap-build', completedAt: '2026-09-17T04:00:00Z', status: 'succeeded', diagnostics: [], outputs: [{ digest: 'pdf-v1', mediaType: 'application/pdf' }] } }]
const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}) })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
const page = await context.newPage(), errors = [], blocked = []
page.on('pageerror', error => errors.push(error.message))
page.on('dialog', dialog => dialog.accept())
await context.addInitScript(project => {
  localStorage.setItem('research-ui-project', project)
  localStorage.setItem('research-ui-locale', 'en')
  localStorage.setItem('research-ui-bottom', 'collapsed')
  localStorage.setItem('research.markPrompt.dockVisible', 'false')
}, projects[0])
const state = { files: new Map(), serial: 0 }
for (const p of projects) {
  state.files.set(`${p}/thinking.canvas.json`, { content: canvasDoc(), digest: 'canvas-v1' })
  state.files.set(`${p}/research-drafts.json`, { content: draftsDoc(p), digest: 'drafts-v1' })
}
state.files.set(`${projects[0]}/main.tex`, { content: 'Baseline source.', digest: 'tex-v1' })
await context.route('**/api/v1/**', async route => {
  const request = route.request(), u = new URL(request.url()), path = decodeURIComponent(u.pathname)
  const reply = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  if (path === '/api/v1/manuscripts/build-records' && u.searchParams.get('manuscriptId') === projects[0]) return reply(200, { data: builds })
  if (path === '/api/v1/manuscripts/build-records/cap-build/artifacts/pdf-v1') return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from(pdf) })
  const match = path.match(/^\/api\/v1\/workspaces\/([^/]+)\/files(?:\/(.+))?$/)
  if (match && projects.includes(match[1])) {
    const [, ws, name = ''] = match, key = `${ws}/${name}`, record = state.files.get(key)
    if (request.method() === 'GET') {
      if (!name) return reply(200, { data: [...state.files.keys()].filter(k => k.startsWith(`${ws}/`) && !k.endsWith('.json')).map(k => ({ kind: 'file', path: k.slice(ws.length + 1), sizeBytes: state.files.get(k).content.length })), meta: { directory: '', nextCursor: null } })
      return record ? reply(200, { data: record }) : reply(404, { error: { message: 'Missing fixture file' } })
    }
    if (request.method() === 'PUT') {
      const input = request.postDataJSON()
      if (input.createOnly ? Boolean(record) : input.expectedDigest !== record?.digest) return reply(409, { error: { message: 'Fixture CAS conflict' } })
      const saved = { content: input.content, digest: `fixture-${++state.serial}` }
      state.files.set(key, saved)
      return reply(200, { data: { digest: saved.digest } })
    }
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) { blocked.push(`${request.method()} ${path}`); return route.abort('blockedbyclient') }
  return route.continue()
})
const report = {}
const time = async (label, fn) => { const t0 = performance.now(); await fn(); report[label] = Math.round(performance.now() - t0) }
const heap = () => page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null)
try {
  await time('initialLoadMs', () => page.goto(url))
  await page.locator(`[data-project-objects="${projects[0]}"]`).waitFor()
  report.heapStartMB = await heap()
  const objectsOf = p => page.locator(`[data-project-objects="${p}"]`)
  // A project's object nav renders only once its sidebar section is expanded by selection.
  const selectProject = async p => {
    await page.locator(`[data-project-id="${p}"]`).getByRole('button', { name: p, exact: true }).click()
    await objectsOf(p).waitFor()
  }
  const canvasSaved = p => page.locator(`[data-canvas-project="${p}"] [data-canvas-save-state="saved"]`).waitFor()
  // Open the 40-card canvas in each project.
  for (const p of projects) await time(`openCanvasMs:${p}`, async () => {
    await selectProject(p)
    await objectsOf(p).locator('[data-project-object="canvas"]').click()
    await canvasSaved(p)
  })
  const canvasA = page.locator(`[data-canvas-project="${projects[0]}"]`)
  assert.equal(JSON.parse(state.files.get(`${projects[0]}/thinking.canvas.json`).content).nodes.length, 40)
  // Only the active canvas instance is visible; bring A back to the front.
  await selectProject(projects[0])
  await objectsOf(projects[0]).locator('[data-project-object="canvas"]').click()
  await canvasSaved(projects[0])
  await time('outlineRenderMs', async () => {
    await canvasA.getByRole('button', { name: 'Outline', exact: true }).click()
    await canvasA.locator('[data-outline-node="n38"]').waitFor()
  })
  await canvasA.getByRole('button', { name: 'Research canvas', exact: true }).click()
  // Drag one card in the dense canvas; wait for the autosave round trip.
  const grab = await page.evaluate(() => {
    const el = document.querySelector('[data-node="n20"]')
    const r = el.getBoundingClientRect()
    for (let y = r.top + 8; y < r.bottom - 4; y += 9) for (let x = r.left + 8; x < r.right - 4; x += 11)
      if (document.elementFromPoint(x, y)?.closest('[data-node]') === el) return { x, y }
    return null
  })
  assert.ok(grab)
  await time('dragCardSaveMs', async () => {
    await page.mouse.move(grab.x, grab.y)
    await page.mouse.down()
    await page.mouse.move(grab.x + 96, grab.y + 48, { steps: 5 })
    await page.mouse.up()
    await canvasSaved(projects[0])
  })
  // Typing into a draft field in the 30-draft book.
  await time('openDraftsMs', async () => {
    await objectsOf(projects[0]).locator('[data-project-object="drafts"]').click()
    await page.locator(`[data-draft-project="${projects[0]}"]`).locator(':scope[data-draft-state="saved"]').waitFor()
  })
  const drafts = page.locator(`[data-draft-project="${projects[0]}"]`)
  await drafts.locator('[data-draft-id="d1"]').click()
  await time('typeFieldSaveMs', async () => {
    await drafts.getByLabel('Argument and content', { exact: true }).fill('Typed during the capacity baseline.')
    await drafts.locator(':scope[data-draft-state="saved"]').waitFor()
  })
  // Ten content tabs across surfaces and projects.
  const tabTimes = {}
  const openTab = async (label, fn) => { const t0 = performance.now(); await fn(); tabTimes[label] = Math.round(performance.now() - t0) }
  await openTab('files:A', async () => { await objectsOf(projects[0]).locator('[data-project-object="files"]').click(); await page.locator(`[data-object-workspace="${projects[0]}"]`).waitFor() })
  await openTab('files:B', async () => { await selectProject(projects[1]); await objectsOf(projects[1]).locator('[data-project-object="files"]').click(); await page.locator(`[data-object-workspace="${projects[1]}"]`).waitFor() })
  await openTab('files:C', async () => { await selectProject(projects[2]); await objectsOf(projects[2]).locator('[data-project-object="files"]').click(); await page.locator(`[data-object-workspace="${projects[2]}"]`).waitFor() })
  await openTab('drafts:B', async () => { await selectProject(projects[1]); await objectsOf(projects[1]).locator('[data-project-object="drafts"]').click(); await page.locator(`[data-draft-project="${projects[1]}"]`).locator(':scope[data-draft-state="saved"]').waitFor() })
  await openTab('drafts:C', async () => { await selectProject(projects[2]); await objectsOf(projects[2]).locator('[data-project-object="drafts"]').click(); await page.locator(`[data-draft-project="${projects[2]}"]`).locator(':scope[data-draft-state="saved"]').waitFor() })
  await openTab('reviews:A', async () => { await objectsOf(projects[0]).locator('[data-project-object="reviews"]').click(); await page.locator(`[data-review-project="${projects[0]}"]`).getByText('Start feedback from a reading selection', { exact: false }).waitFor() })
  await openTab('reviews:B', async () => { await selectProject(projects[1]); await objectsOf(projects[1]).locator('[data-project-object="reviews"]').click(); await page.locator(`[data-review-project="${projects[1]}"]`).getByText('Start feedback from a reading selection', { exact: false }).waitFor() })
  await openTab('reviews:C', async () => { await selectProject(projects[2]); await objectsOf(projects[2]).locator('[data-project-object="reviews"]').click(); await page.locator(`[data-review-project="${projects[2]}"]`).getByText('Start feedback from a reading selection', { exact: false }).waitFor() })
  await openTab('pdf:A', async () => {
    await objectsOf(projects[0]).locator('[data-project-object="builds"]').click()
    await page.locator('.rtab-panel:visible').getByRole('button', { name: 'main.tex · PDF', exact: true }).click()
    await page.locator('[data-xgc-role="pdf-reader"] .research-pdf-text span').first().waitFor()
  })
  report.tabOpenMs = tabTimes
  const tabCount = await page.locator('[role="tab"]').count()
  report.openTabs = tabCount
  assert.ok(tabCount >= 10, `Expected at least 10 open tabs, saw ${tabCount}`)
  // Switch canvases after everything is mounted.
  for (const p of [...projects.slice(1), projects[0]]) await time(`canvasSwitchMs:${p}`, async () => {
    await selectProject(p)
    await objectsOf(p).locator('[data-project-object="canvas"]').click()
    await canvasSaved(p)
  })
  report.heapAfterTabsMB = await heap()
  report.domNodes = await page.evaluate(() => document.querySelectorAll('*').length)
  // Full reload recovery back into the dense canvas.
  await time('reloadRecoveryMs', async () => {
    await page.reload()
    await selectProject(projects[0])
    await objectsOf(projects[0]).locator('[data-project-object="canvas"]').click()
    await canvasSaved(projects[0])
  })
  report.heapAfterReloadMB = await heap()
  assert.equal(JSON.parse(state.files.get(`${projects[0]}/thinking.canvas.json`).content).nodes.length, 40)
  assert.deepEqual(errors, [])
  assert.deepEqual(blocked, [])
  console.log(JSON.stringify(report, null, 2))
  console.log('PASS F4 capacity baseline recorded (numbers only, no performance assertion).')
} finally { await context.close(); await browser.close() }
