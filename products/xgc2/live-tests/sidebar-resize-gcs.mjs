import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const WEB = 'http://127.0.0.1:5174';
const EXPERIMENT = '3751aaaf-369e-428f-bbc0-f6946c609c15';
const OUT = process.env.XGC_SIDEBAR_PROBE_OUT || '/tmp/xgc-sidebar-resize-gcs';
mkdirSync(OUT, { recursive: true });

const ready = await fetch(WEB).then((r) => r.ok).catch(() => false);
if (!ready) {
  writeFileSync(`${OUT}/probe.json`, `${JSON.stringify({ open: true, reason: '5174 not responding' }, null, 2)}\n`);
  console.log('5174 GCS sidebar probe Open: station not responding');
  process.exit(0);
}

const context = await chromium.launchPersistentContext(`${OUT}-chrome-${Date.now()}`, {
  channel: 'chrome',
  viewport: { width: 1440, height: 960 },
  locale: 'en-US',
});
const page = context.pages()[0] || await context.newPage();

try {
  await page.goto(`${WEB}/#/experiments/${EXPERIMENT}/gcs`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.locator('[data-xgc-role="app-shell"]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('[data-xgc-role="experiment-state-loading"]')
    .waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
  const gcsTab = page.locator('[data-xgc-role="experiment-dashboard-tabs"] [role="tab"]').filter({ hasText: /^(GCS|地面站)$/ }).first();
  if (await gcsTab.count() && await gcsTab.getAttribute('aria-selected') !== 'true') {
    await gcsTab.click({ force: true });
  }
  await page.locator('[data-xgc-role="experiment-dashboard-canvas"], .dashboard-layout-shell, .dashboard-layout')
    .first().waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('.dashboard-layout-item, .react-grid-item').first()
    .waitFor({ state: 'visible', timeout: 15_000 });
  const pageMeta = await page.evaluate(() => {
    const sidebar = document.querySelector('[data-xgc-role="app-sidebar"]');
    const toggle = document.querySelector('[data-xgc-role="sidebar-toggle"]');
    const shell = document.querySelector('[data-xgc-role="app-shell"]');
    const style = sidebar ? getComputedStyle(sidebar) : null;
    return {
      shellMode: shell?.getAttribute('data-xgc-mode') ?? null,
      sidebarDisplay: style?.display ?? null,
      sidebarWidth: sidebar?.getBoundingClientRect().width ?? null,
      toggleHidden: toggle ? getComputedStyle(toggle).display === 'none' || toggle.getBoundingClientRect().height === 0 : true,
      itemCount: document.querySelectorAll('.dashboard-layout-item, .react-grid-item').length,
      canvas: Boolean(document.querySelector('[data-xgc-role="experiment-dashboard-canvas"]')),
    };
  });
  writeFileSync(`${OUT}/page-meta.json`, `${JSON.stringify(pageMeta, null, 2)}\n`);
  await page.locator('[data-xgc-role="experiment-dashboard-canvas"], .dashboard-layout-shell').first()
    .screenshot({ path: `${OUT}/gcs-open.png` });
  const toggle = page.locator('[data-xgc-role="sidebar-toggle"]');
  await toggle.waitFor({ state: 'attached', timeout: 10_000 });

  const cycles = [];
  for (let index = 0; index < 6; index += 1) {
    const collapsed = await page.locator('[data-xgc-role="app-sidebar"]').getAttribute('data-xgc-collapsed');
    const action = collapsed === 'true' ? 'expand' : 'collapse';
    await page.evaluate(startSampling);
    await page.evaluate(() => {
      document.querySelector('[data-xgc-role="sidebar-toggle"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await page.waitForFunction(() => window.__xgcGcsSidebarSample?.done === true, null, { timeout: 6_000 });
    const sample = await page.evaluate(() => window.__xgcGcsSidebarSample.result);
    cycles.push({ action, ...sample });
    if (index === 0 || index === 1) {
      await page.locator('[data-xgc-role="experiment-dashboard-canvas"], .dashboard-layout-shell').first()
        .screenshot({ path: `${OUT}/${action}-${index}.png` });
    }
  }
  const summary = summarize(cycles);
  writeFileSync(`${OUT}/probe.json`, `${JSON.stringify({ experimentId: EXPERIMENT, viewport: { width: 1440, height: 960 }, summary, cycles }, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await context.close();
}

function summarize(cycles) {
  return {
    cycles: cycles.length,
    actions: cycles.map((cycle) => cycle.action),
    sidebarPresent: cycles.every((cycle) => cycle.sidebar?.end != null),
    surfacePresent: cycles.every((cycle) => cycle.surfaceWidth?.end != null),
    itemPresent: cycles.every((cycle) => cycle.itemWidth?.end != null),
    sidebarReversals: cycles.map((cycle) => cycle.sidebar?.reversals),
    surfaceReversals: cycles.map((cycle) => cycle.surfaceWidth?.reversals),
    itemReversals: cycles.map((cycle) => cycle.itemWidth?.reversals),
    itemLeftReversals: cycles.map((cycle) => cycle.itemLeft?.reversals),
    surfaceMonotonic: cycles.every((cycle) => cycle.surfaceWidth?.monotonic),
    itemMonotonic: cycles.every((cycle) => cycle.itemWidth?.monotonic),
    itemSettles: cycles.map((cycle) => cycle.itemWidth?.settles),
    layoutCommits: cycles.map((cycle) => cycle.layoutCommits),
    iframeSrcChanges: cycles.map((cycle) => cycle.iframeSrcChanges),
    settleMs: cycles.map((cycle) => cycle.surfaceWidth?.settleMs),
    pass: cycles.length >= 5
      && cycles.every((cycle) => cycle.surfaceWidth?.monotonic)
      && cycles.every((cycle) => (cycle.itemWidth?.reversals ?? 0) === 0)
      && cycles.every((cycle) => (cycle.itemWidth?.settles ?? 1) <= 1)
      && cycles.every((cycle) => cycle.iframeSrcChanges === 0)
      && cycles.every((cycle) => cycle.itemWidth?.end != null),
  };
}

function startSampling() {
  const sidebar = document.querySelector('[data-xgc-role="app-sidebar"]');
  const surface = document.querySelector('[data-xgc-role="experiment-dashboard-canvas"]')
    || document.querySelector('.dashboard-layout-shell')
    || document.querySelector('.dashboard-layout');
  const item = document.querySelector('.dashboard-layout-item, .react-grid-item');
  const frames = [];
  let layoutCommits = 0;
  let iframeSrcChanges = 0;
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
  if (item) layoutObserver.observe(item, { attributes: true, attributeFilter: ['style'] });

  const round = (value) => Math.round(value * 10) / 10;
  const sample = () => {
    const sidebarBox = sidebar?.getBoundingClientRect();
    const surfaceBox = surface?.getBoundingClientRect();
    const itemBox = item?.getBoundingClientRect();
    frames.push({
      t: performance.now(),
      sidebarWidth: sidebarBox && sidebarBox.width > 0 ? round(sidebarBox.width) : null,
      surfaceWidth: surfaceBox && surfaceBox.width > 0 ? round(surfaceBox.width) : null,
      itemLeft: itemBox ? round(itemBox.left) : null,
      itemWidth: itemBox && itemBox.width > 0 ? round(itemBox.width) : null,
    });
  };
  const stats = (values) => {
    if (values.length < 2) {
      return { reversals: 0, monotonic: true, settleMs: 0, settles: 0, start: values[0] ?? null, end: values.at(-1) ?? null };
    }
    const startValue = values[0];
    const endValue = values[values.length - 1];
    let reversals = 0;
    let lastDir = 0;
    let settles = 0;
    let stable = 0;
    let leftStable = false;
    for (let index = 1; index < values.length; index += 1) {
      const delta = values[index] - values[index - 1];
      if (Math.abs(delta) < 0.6) {
        stable += 1;
        if (stable >= 4) leftStable = true;
        continue;
      }
      if (leftStable) settles += 1;
      leftStable = false;
      stable = 0;
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
      settles,
      settleMs: Math.round(frames[settleIndex].t - frames[0].t),
    };
  };
  const series = (key) => frames.map((frame) => frame[key]).filter((value) => typeof value === 'number');

  window.__xgcGcsSidebarSample = { done: false, result: null };
  sample();
  const started = performance.now();
  const tick = () => {
    sample();
    if (performance.now() - started < 900) {
      requestAnimationFrame(tick);
      return;
    }
    iframeObserver.disconnect();
    layoutObserver.disconnect();
    window.__xgcGcsSidebarSample = {
      done: true,
      result: {
        frames: frames.length,
        sidebar: stats(series('sidebarWidth')),
        surfaceWidth: stats(series('surfaceWidth')),
        itemLeft: stats(series('itemLeft')),
        itemWidth: stats(series('itemWidth')),
        layoutCommits,
        iframeSrcChanges,
        first: frames[0],
        last: frames[frames.length - 1],
      },
    };
  };
  requestAnimationFrame(tick);
}
