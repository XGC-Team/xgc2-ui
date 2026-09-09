import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const WEB = 'http://127.0.0.1:5174';
const SCOUT = 'e1b447c6-bd6a-4bc1-b097-94ba7e8b99fe';
const PX4 = '1cadd624-e0ba-4de2-ae09-9c16c90c4369';
const OUT = '/tmp/xgc-list-vector-geometry';
mkdirSync(OUT, { recursive: true });

const ready = await fetch(WEB).then((response) => response.ok).catch(() => false);
if (!ready) {
  writeFileSync(`${OUT}/geometry.json`, `${JSON.stringify({ open: true, reason: '5174 not responding' }, null, 2)}\n`);
  console.log('5174 vector geometry Open: station not responding');
  process.exit(0);
}

const context = await chromium.launchPersistentContext(`/tmp/xgc-list-vector-chrome-${Date.now()}`, {
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
      const rest = await page.evaluate(measureVectors);
      await page.evaluate(stressLargeDigits);
      const stressed = await page.evaluate(measureVectors);
      const card = page.locator('[data-xgc-role="run-robot-card"][data-xgc-presentation="list"]').first();
      await card.screenshot({ path: `${OUT}/${label}-${experimentId.slice(0, 8)}.png` });
      report.push({ label, width, experimentId, rest, stressed });
      assertGeometry(rest, `${label} rest ${experimentId}`);
      assertGeometry(stressed, `${label} stressed ${experimentId}`);
    }
  }
  writeFileSync(`${OUT}/geometry.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.map((item) => ({
    label: item.label,
    experimentId: item.experimentId.slice(0, 8),
    restVectors: item.rest.vectors.length,
    restOverlaps: item.rest.vectors.flatMap((vector) => vector.overlaps),
    stressedOverlaps: item.stressed.vectors.flatMap((vector) => vector.overlaps),
    clipped: item.stressed.vectors.flatMap((vector) => vector.axes.filter((axis) => axis.scrollWidth > axis.clientWidth + 1).map((axis) => axis.id)),
  })), null, 2));
} finally {
  await context.close();
}

function assertGeometry(sample, label) {
  if (sample.vectors.length < 1) throw new Error(`${label}: no vector tiles`);
  for (const vector of sample.vectors) {
    const ids = vector.axes.map((axis) => axis.id);
    if (ids.join(',') !== 'x,y,z') throw new Error(`${label} ${vector.role} axis order ${ids}`);
    if (vector.overlaps.length) throw new Error(`${label} ${vector.role} overlaps ${JSON.stringify(vector.overlaps)}`);
    for (const axis of vector.axes) {
      if (axis.scrollWidth > axis.clientWidth + 1) {
        throw new Error(`${label} ${vector.role} ${axis.id} clipped ${axis.scrollWidth}>${axis.clientWidth}`);
      }
    }
  }
}

async function openList(page, experimentId) {
  await page.goto(`${WEB}/#/experiments/${experimentId}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.locator('[data-xgc-role="experiment-topbar-actions"]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('[data-xgc-role="experiment-state-loading"]')
    .waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
  const tab = page.locator('[data-xgc-role="experiment-dashboard-tabs"] [role="tab"]').filter({ hasText: /^(GCS|地面站)$/ }).first();
  if (await tab.count()) {
    if (await tab.getAttribute('aria-selected') !== 'true') await tab.click({ force: true });
  }
  const list = page.locator('[data-xgc-role="robot-instrument-view"][data-xgc-id="list"]');
  await list.waitFor({ state: 'visible', timeout: 20_000 });
  await list.click({ force: true });
  await page.locator('[data-xgc-role="run-robot-instruments"][data-xgc-mode="list"]').waitFor({ timeout: 15_000 });
  await page.locator('[data-xgc-role="run-robot-card"][data-xgc-presentation="list"]').first().waitFor({ timeout: 10_000 });
}

function measureVectors() {
  const vectors = [...document.querySelectorAll(
    '[data-xgc-role="run-robot-card"][data-xgc-presentation="list"] .robot-metric-vector-value',
  )].map((root, index) => {
    const tile = root.closest('div');
    const axes = [...root.querySelectorAll('[data-xgc-axis]')].map((node) => {
      const box = node.getBoundingClientRect();
      return {
        id: node.getAttribute('data-xgc-axis'),
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
      };
    });
    const overlaps = [];
    for (let i = 0; i < axes.length; i += 1) {
      for (let j = i + 1; j < axes.length; j += 1) {
        const a = axes[i];
        const b = axes[j];
        const hit = a.left < b.right - 0.5 && b.left < a.right - 0.5
          && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
        if (hit) overlaps.push([a.id, b.id]);
      }
    }
    return {
      role: tile?.getAttribute('data-xgc-role') || tile?.className || String(index),
      axes,
      overlaps,
    };
  });
  return { vectors };
}

function stressLargeDigits() {
  const values = ['123.45', '0.00', '1000.50'];
  for (const root of document.querySelectorAll(
    '[data-xgc-role="run-robot-card"][data-xgc-presentation="list"] .robot-metric-vector-value',
  )) {
    [...root.querySelectorAll('[data-xgc-axis]')].forEach((node, index) => {
      const digits = node.querySelector('.robot-list-metric-digits');
      const sign = node.querySelector('.robot-list-metric-sign');
      if (digits) digits.textContent = values[index] ?? '0.00';
      if (sign && index === 0) {
        sign.textContent = '-';
        sign.setAttribute('data-xgc-sign', 'minus');
      }
    });
  }
}
