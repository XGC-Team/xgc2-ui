import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const WEB = 'http://127.0.0.1:5174';
const SCOUT = 'e1b447c6-bd6a-4bc1-b097-94ba7e8b99fe';
const PX4 = '1cadd624-e0ba-4de2-ae09-9c16c90c4369';
const OUT = '/tmp/xgc-list-metric-tracks';
mkdirSync(OUT, { recursive: true });

const ready = await fetch(WEB).then((response) => response.ok).catch(() => false);
if (!ready) {
  writeFileSync(`${OUT}/geometry.json`, `${JSON.stringify({ open: true, reason: '5174 not responding' }, null, 2)}\n`);
  console.log('5174 metric tracks Open: station not responding');
  process.exit(0);
}

const context = await chromium.launchPersistentContext(`/tmp/xgc-list-metric-tracks-chrome-${Date.now()}`, {
  channel: 'chrome',
  viewport: { width: 1440, height: 960 },
  locale: 'en-US',
});
const page = context.pages()[0] || await context.newPage();
const report = [];

try {
  for (const [label, width] of [['wide', 1440], ['narrow', 480]]) {
    await page.setViewportSize({ width, height: 960 });
    for (const experimentId of [SCOUT, PX4]) {
      await openList(page, experimentId);
      const rest = await page.evaluate(measureTracks);
      await page.evaluate(stressTracks);
      const stressed = await page.evaluate(measureTracks);
      await page.locator('[data-xgc-role="run-robot-card"][data-xgc-presentation="list"]').first()
        .screenshot({ path: `${OUT}/${label}-${experimentId.slice(0, 8)}.png` });
      report.push({ label, width, experimentId, rest, stressed });
      assertTracks(rest, `${label} rest ${experimentId}`);
      assertTracks(stressed, `${label} stressed ${experimentId}`);
    }
  }
  writeFileSync(`${OUT}/geometry.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.map((item) => ({
    label: item.label,
    experimentId: item.experimentId.slice(0, 8),
    tiles: item.stressed.tiles.length,
    overlaps: item.stressed.tiles.flatMap((tile) => tile.overlap ? [tile.role] : []),
    clipped: item.stressed.tiles.flatMap((tile) => tile.clipped),
  })), null, 2));
} finally {
  await context.close();
}

function assertTracks(sample, label) {
  if (sample.tiles.length < 1) throw new Error(`${label}: no metric tiles`);
  for (const tile of sample.tiles) {
    if (!tile.rate) throw new Error(`${label} ${tile.role} missing rate`);
    if (tile.overlap) throw new Error(`${label} ${tile.role} value/rate overlap`);
    if (tile.clipped.length) throw new Error(`${label} ${tile.role} clipped ${tile.clipped}`);
  }
}

async function openList(page, experimentId) {
  await page.goto(`${WEB}/#/experiments/${experimentId}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.locator('[data-xgc-role="experiment-topbar-actions"]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('[data-xgc-role="experiment-state-loading"]')
    .waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
  const tab = page.locator('[data-xgc-role="experiment-dashboard-tabs"] [role="tab"]').filter({ hasText: /^(GCS|地面站)$/ }).first();
  if (await tab.count() && await tab.getAttribute('aria-selected') !== 'true') {
    await tab.click({ force: true });
  }
  const list = page.locator('[data-xgc-role="robot-instrument-view"][data-xgc-id="list"]');
  await list.waitFor({ state: 'visible', timeout: 20_000 });
  await list.click({ force: true });
  await page.locator('[data-xgc-role="run-robot-instruments"][data-xgc-mode="list"]').waitFor({ timeout: 15_000 });
  await page.locator('[data-xgc-role="run-robot-card"][data-xgc-presentation="list"]').first().waitFor({ timeout: 10_000 });
}

function measureTracks() {
  const tiles = [...document.querySelectorAll(
    '[data-xgc-role="run-robot-card"][data-xgc-presentation="list"] dl > div:has(> dt > [data-xgc-role="robot-list-metric-rate"])',
  )].map((tile) => {
    const title = tile.querySelector('dt [data-xgc-role="robot-list-metric-title"]');
    const rate = tile.querySelector('dt [data-xgc-role="robot-list-metric-rate"]');
    const readout = tile.querySelector('dd [data-xgc-role="robot-list-metric-readout"]');
    const box = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return {
        left: r.left, top: r.top, right: r.right, bottom: r.bottom,
        scrollWidth: node.scrollWidth, clientWidth: node.clientWidth,
      };
    };
    const titleBox = box(title);
    const valueBox = box(readout);
    const rateBox = box(rate);
    const boxesOverlap = (a, b) => Boolean(a && b
      && a.left < b.right - 0.5 && b.left < a.right - 0.5
      && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5);
    const overlap = boxesOverlap(titleBox, rateBox) || boxesOverlap(valueBox, rateBox);
    const clipped = [];
    if (valueBox && valueBox.scrollWidth > valueBox.clientWidth + 1) clipped.push('readout');
    if (rateBox && rateBox.scrollWidth > rateBox.clientWidth + 1) clipped.push('rate');
    return {
      role: tile.getAttribute('data-xgc-role') || tile.className,
      rate: rate?.textContent,
      overlap,
      clipped,
      titleBox,
      valueBox,
      rateBox,
    };
  });
  return { tiles };
}

function stressTracks() {
  for (const tile of document.querySelectorAll(
    '[data-xgc-role="run-robot-card"][data-xgc-presentation="list"] dl > div:has(> dt > [data-xgc-role="robot-list-metric-rate"])',
  )) {
    const rate = tile.querySelector('dt [data-xgc-role="robot-list-metric-rate"]');
    const digits = tile.querySelector('dd .robot-list-metric-digits');
    if (rate) rate.textContent = '119.0 Hz';
    if (digits && !digits.closest('[data-xgc-axis]')) digits.textContent = '359.99';
  }
}
