import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const WEB = 'http://127.0.0.1:5174';
const SCOUT = 'e1b447c6-bd6a-4bc1-b097-94ba7e8b99fe';
const PX4 = '1cadd624-e0ba-4de2-ae09-9c16c90c4369';
const OUT = '/tmp/xgc-list-header-baseline';
mkdirSync(OUT, { recursive: true });

const ready = await fetch(WEB).then((response) => response.ok).catch(() => false);
if (!ready) {
  writeFileSync(`${OUT}/geometry.json`, `${JSON.stringify({ open: true, reason: '5174 not responding' }, null, 2)}\n`);
  console.log('5174 list header Open: station not responding');
  process.exit(0);
}

const context = await chromium.launchPersistentContext(`/tmp/xgc-list-header-chrome-${Date.now()}`, {
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
      const geometry = await page.evaluate(measureList);
      const card = page.locator('[data-xgc-role="run-robot-card"][data-xgc-presentation="list"]').first();
      await card.screenshot({ path: `${OUT}/${label}-${experimentId.slice(0, 8)}.png` });
      report.push({ label, width, experimentId, geometry });
      assertBaseline(geometry, `${label} ${experimentId}`);
    }
  }
  writeFileSync(`${OUT}/geometry.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.map((item) => ({
    label: item.label,
    experimentId: item.experimentId.slice(0, 8),
    height: item.geometry.height,
    identityLeft: item.geometry.identityLeft,
    axes: item.geometry.axes,
    glyphs: item.geometry.glyphs,
    posErr: item.geometry.posErr,
  })), null, 2));
} finally {
  await context.close();
}

function assertBaseline(sample, label) {
  if (sample.height < 110 || sample.height > 140) {
    throw new Error(`${label}: card height ${sample.height} not 128px baseline`);
  }
  if (!sample.identityLeft) throw new Error(`${label}: identity is not left of metrics`);
  if (sample.glyphs.length) throw new Error(`${label}: list header still has glyphs ${sample.glyphs}`);
  if (sample.axes.join(',') !== 'x,y,z') throw new Error(`${label}: vector axes ${sample.axes}`);
  if (sample.clipped.length) throw new Error(`${label}: clipped ${sample.clipped}`);
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

function measureList() {
  const card = document.querySelector('[data-xgc-role="run-robot-card"][data-xgc-presentation="list"]');
  if (!card) return { height: 0, identityLeft: false, axes: [], glyphs: ['missing-card'], clipped: [], posErr: null };
  const header = card.querySelector(':scope > header');
  const metrics = card.querySelector(':scope > dl');
  const headerBox = header?.getBoundingClientRect();
  const metricsBox = metrics?.getBoundingClientRect();
  const vector = card.querySelector('.robot-metric-vector-value');
  const axes = [...(vector?.querySelectorAll('[data-xgc-axis]') ?? [])].map((node) => node.getAttribute('data-xgc-axis'));
  const glyphs = ['robot-network-indicator','robot-position-indicator','robot-power-indicator','robot-control-indicator']
    .filter((role) => header?.querySelector(`[data-xgc-role="${role}"]`));
  const clipped = [...(vector?.querySelectorAll('[data-xgc-axis]') ?? [])]
    .filter((node) => node.scrollWidth > node.clientWidth + 1)
    .map((node) => node.getAttribute('data-xgc-axis'));
  return {
    height: Math.round(card.getBoundingClientRect().height),
    identityLeft: Boolean(headerBox && metricsBox && headerBox.right <= metricsBox.left + 1),
    axes,
    glyphs,
    clipped,
    status: [...(header?.querySelectorAll('[data-xgc-role^="robot-list-header-"]') ?? [])]
      .map((node) => `${node.getAttribute('data-xgc-role')}:${node.textContent}`),
    posErr: header?.querySelector('[data-xgc-role="robot-list-header-pos-err"]')?.textContent ?? null,
    rateInDt: Boolean(card.querySelector('dt [data-xgc-role="robot-list-metric-rate"]')),
    rateInDd: Boolean(card.querySelector('dd [data-xgc-role="robot-list-metric-rate"]')),
  };
}
