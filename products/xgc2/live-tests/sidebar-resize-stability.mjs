import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const WEB = 'http://127.0.0.1:5174';
const EXPERIMENT = 'e1b447c6-bd6a-4bc1-b097-94ba7e8b99fe';
const OUT = process.env.XGC_SIDEBAR_PROBE_OUT || '/tmp/xgc-sidebar-resize-after';
mkdirSync(OUT, { recursive: true });

const ready = await fetch(WEB).then((r) => r.ok).catch(() => false);
if (!ready) {
  writeFileSync(`${OUT}/probe.json`, `${JSON.stringify({ open: true, reason: '5174 not responding' }, null, 2)}\n`);
  console.log('5174 sidebar probe Open: station not responding');
  process.exit(0);
}

const context = await chromium.launchPersistentContext(`${OUT}-chrome-${Date.now()}`, {
  channel: 'chrome',
  viewport: { width: 1440, height: 960 },
  locale: 'en-US',
});
const page = context.pages()[0] || await context.newPage();

try {
  await page.goto(`${WEB}/#/experiments/${EXPERIMENT}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.locator('[data-xgc-role="app-shell"]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('[data-xgc-role="experiment-state-loading"]')
    .waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
  const toggle = page.locator('[data-xgc-role="sidebar-toggle"]');
  await toggle.waitFor({ state: 'visible', timeout: 15_000 });
  const dashboardTab = page.locator('[data-xgc-role="experiment-dashboard-tabs"] [role="tab"]').filter({ hasText: /^(GCS|地面站|Config|配置)$/ }).first();
  if (await dashboardTab.count()) {
    if (await dashboardTab.getAttribute('aria-selected') !== 'true') {
      await dashboardTab.click({ force: true });
    }
  }
  await page.locator('.dashboard-layout, [data-xgc-role="experiment-dashboard-canvas"]').first()
    .waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);

  const cycles = [];
  for (let index = 0; index < 6; index += 1) {
    const collapsed = await page.locator('[data-xgc-role="app-sidebar"]').getAttribute('data-xgc-collapsed');
    const action = collapsed === 'true' ? 'expand' : 'collapse';
    await page.evaluate(startSampling);
    await toggle.click({ force: true });
    await page.waitForFunction(() => window.__xgcSidebarSample?.done === true, null, { timeout: 5_000 });
    const sample = await page.evaluate(() => window.__xgcSidebarSample.result);
    cycles.push({ action, ...sample });
  }
  writeFileSync(`${OUT}/probe.json`, `${JSON.stringify({ experimentId: EXPERIMENT, viewport: { width: 1440, height: 960 }, cycles }, null, 2)}\n`);
  console.log(JSON.stringify({
    cycles: cycles.length,
    mainReversals: cycles.map((cycle) => cycle.mainWidth?.reversals),
    mainMonotonic: cycles.every((cycle) => cycle.mainWidth?.monotonic),
    layoutReversals: cycles.map((cycle) => cycle.layoutWidth?.reversals),
    itemReversals: cycles.map((cycle) => cycle.itemWidth?.reversals),
    iframeSrcChanges: cycles.map((cycle) => cycle.iframeSrcChanges),
    layoutCommits: cycles.map((cycle) => cycle.layoutCommits),
    settleMs: cycles.map((cycle) => cycle.mainWidth?.settleMs),
    resizingSeen: cycles.map((cycle) => cycle.resizingSeen),
  }, null, 2));
} finally {
  await context.close();
}

function startSampling() {
  const sidebar = document.querySelector('[data-xgc-role="app-sidebar"]');
  const main = document.querySelector('main.xgc-app-content');
  const layout = document.querySelector('.dashboard-layout');
  const item = document.querySelector('.dashboard-layout-item, .react-grid-item');
  const frames = [];
  let layoutCommits = 0;
  let iframeSrcChanges = 0;
  let resizingSeen = false;
  const iframeObserver = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes' && record.attributeName === 'src') iframeSrcChanges += 1;
      if (record.type === 'childList') {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLIFrameElement) iframeSrcChanges += 1;
        }
      }
    }
  });
  document.querySelectorAll('iframe').forEach((frame) => {
    iframeObserver.observe(frame, { attributes: true, attributeFilter: ['src'] });
  });
  iframeObserver.observe(document.body, { childList: true, subtree: true });
  const layoutObserver = new MutationObserver(() => { layoutCommits += 1; });
  if (layout) layoutObserver.observe(layout, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });

  const round = (value) => Math.round(value * 10) / 10;
  const sample = () => {
    const sidebarBox = sidebar?.getBoundingClientRect();
    const mainBox = main?.getBoundingClientRect();
    const layoutBox = layout?.getBoundingClientRect();
    const itemBox = item?.getBoundingClientRect();
    const resizing = document.querySelector('[data-xgc-role="app-shell"]')?.getAttribute('data-xgc-sidebar-resizing');
    if (resizing === 'true') resizingSeen = true;
    frames.push({
      t: performance.now(),
      sidebarWidth: sidebarBox ? round(sidebarBox.width) : null,
      mainX: mainBox ? round(mainBox.x) : null,
      mainWidth: mainBox ? round(mainBox.width) : null,
      layoutWidth: layoutBox ? round(layoutBox.width) : null,
      itemWidth: itemBox ? round(itemBox.width) : null,
      resizing,
    });
  };
  const stats = (values) => {
    if (values.length < 2) return { reversals: 0, monotonic: true, settleMs: 0, start: values[0] ?? null, end: values.at(-1) ?? null };
    const startValue = values[0];
    const endValue = values[values.length - 1];
    let reversals = 0;
    let lastDir = 0;
    for (let index = 1; index < values.length; index += 1) {
      const delta = values[index] - values[index - 1];
      if (Math.abs(delta) < 0.5) continue;
      const dir = Math.sign(delta);
      if (lastDir && dir !== lastDir) reversals += 1;
      lastDir = dir;
    }
    let settleIndex = values.length - 1;
    for (let index = values.length - 1; index >= 0; index -= 1) {
      if (Math.abs(values[index] - endValue) > 1) {
        settleIndex = Math.min(values.length - 1, index + 1);
        break;
      }
    }
    return {
      start: startValue,
      end: endValue,
      reversals,
      monotonic: reversals === 0,
      settleMs: Math.round(frames[settleIndex].t - frames[0].t),
    };
  };
  const series = (key) => frames.map((frame) => frame[key]).filter((value) => typeof value === 'number');

  window.__xgcSidebarSample = { done: false, result: null };
  sample();
  const started = performance.now();
  const tick = () => {
    sample();
    if (performance.now() - started < 800) {
      requestAnimationFrame(tick);
      return;
    }
    iframeObserver.disconnect();
    layoutObserver.disconnect();
    window.__xgcSidebarSample = {
      done: true,
      result: {
        frames: frames.length,
        sidebar: stats(series('sidebarWidth')),
        mainWidth: stats(series('mainWidth')),
        layoutWidth: stats(series('layoutWidth')),
        itemWidth: stats(series('itemWidth')),
        layoutCommits,
        iframeSrcChanges,
        resizingSeen,
        first: frames[0],
        last: frames[frames.length - 1],
      },
    };
  };
  requestAnimationFrame(tick);
}
