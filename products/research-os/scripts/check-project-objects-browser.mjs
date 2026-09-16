// Read-only checks against the actual product. Never starts Vite, creates repositories, or invokes an Agent.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const { RESEARCH_UI_URL: url, RESEARCH_TEST_PROJECT_A: a, RESEARCH_TEST_PROJECT_B: b, RESEARCH_TEST_FILE: path } = process.env
if (!url || !a || !b || a === b || !path || !/\.(tex|md|txt)$/i.test(path)) {
  throw new Error('Set RESEARCH_UI_URL, two distinct dedicated RESEARCH_TEST_PROJECT_A/B workspace IDs, and RESEARCH_TEST_FILE (the same existing text-file path in both).')
}
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('research-ui-locale', 'zh'))
  await page.goto(url)
  const attr = value => JSON.stringify(value)
  const panel = (workspace, file = '') => page.locator(`.rtab-panel:not([hidden]) [data-object-workspace=${attr(workspace)}][data-object-path=${attr(file)}]`)
  const ready = async region => {
    await region.waitFor({ state: 'visible' })
    await region.getByRole('status').waitFor({ state: 'hidden' })
    assert.equal(await region.getByRole('alert').count(), 0)
  }
  const openFile = async project => {
    const section = page.locator(`[data-project-id=${attr(project)}]`)
    await section.waitFor()
    const expand = section.locator('button[aria-expanded]').first()
    if (await expand.getAttribute('aria-expanded') === 'false') await expand.click()
    await section.locator('[data-project-object="files"]').click()
    let region = panel(project); await ready(region)
    // Start at root even if this explorer previously visited another directory.
    while (await region.getByRole('button', { name: '上级目录', exact: true }).count()) {
      await region.getByRole('button', { name: '上级目录', exact: true }).click(); await ready(region)
    }
    for (const name of path.split('/')) {
      await region.getByRole('button', { name, exact: true }).click()
      region = name === path.split('/').at(-1) ? panel(project, path) : panel(project)
      await ready(region)
    }
    await region.getByText(/只读/).waitFor()
    return region
  }
  const first = await openFile(a)
  const original = await first.innerText()
  await openFile(b)
  const basename = path.split('/').at(-1)
  const tabA = page.locator(`[role="tab"][title=${attr(`${basename} · ${a} · ${a}/${path}`)}]`)
  await tabA.click(); await ready(panel(a, path))
  assert.equal(await panel(a, path).innerText(), original)
  // Activating A's tab must not select project A. Its explicit return action must.
  await panel(a, path).getByRole('button', { name: `返回项目 · ${a}`, exact: true }).click()
  await tabA.getByRole('button', { name: '关闭标签页', exact: true }).click()
  await openFile(a)
  assert.equal(await panel(a, path).innerText(), original)
  // Full browser reload loses ephemeral tabs, not the ability to reopen the saved object.
  await page.reload(); await openFile(a)
  assert.equal(await panel(a, path).innerText(), original)
  assert.deepEqual(errors, [])
  console.log('PASS: project entries, same-path tab isolation, explicit return, close/reopen and browser reload (read-only; no Agent/build/save calls).')
} finally { await browser.close() }
