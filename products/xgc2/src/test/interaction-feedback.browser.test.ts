// @vitest-environment node

import { readFileSync } from 'node:fs';
import { chromium,type Browser,type Locator,type Page } from '@playwright/test';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';

const uiReactCss = readFileSync(
  new URL('../../node_modules/@xgc2/ui-react/dist/styles.css', import.meta.url),
  'utf8',
);
const uiWorkflowCss = readFileSync(
  new URL('../../node_modules/@xgc2/ui-workflow/dist/styles.css', import.meta.url),
  'utf8',
);
const remoteCss = readFileSync(
  new URL('../styles/robot-remote-control.css', import.meta.url),
  'utf8',
);
const nativeChatCss = readFileSync(
  new URL('../../node_modules/@xgc2/agent-runtime/dist/agent-chat.css', import.meta.url),
  'utf8',
);
const pipelineCss = readFileSync(
  new URL('../styles/workflow-startup-pipeline.css', import.meta.url),
  'utf8',
);

const chromePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || chromium.executablePath();

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });
});

afterAll(async () => {
  await browser?.close();
});

describe('EXP-01/10/14 isolated Chromium assertions',() => {
  it('latches real remote inverse keys as white-on-black including Stop', async () => {
    const page = await browser.newPage();
    await page.setContent(remotePage('light'));
    await assertLatchedRemoteKeys(page);
    await page.setContent(remotePage('dark'));
    const darkSlow = page.locator('[data-xgc-role="robot-remote-speed-gear"][aria-pressed="true"]');
    const darkBg = rgb(await darkSlow.evaluate((el) => getComputedStyle(el).backgroundColor));
    const darkFg = rgb(await darkSlow.evaluate((el) => getComputedStyle(el).color));
    expect(luma(darkBg)).toBeGreaterThan(luma(darkFg));
    await page.close();
  });

  it('keeps docked Slow white under native chat preflight', async () => {
    const page = await browser.newPage();
    await page.setContent(remotePage('light', { docked: true }));
    await assertLatchedRemoteKeys(page);
    const medium = page.locator('[data-xgc-role="robot-remote-speed-gear"][data-xgc-id="probe-remote:medium"]');
    expect(alpha(await medium.evaluate((el) => getComputedStyle(el).backgroundColor))).toBe(0);
    await page.close();
  });

  it('shows completed pipeline marks before any content handover', async () => {
    const page = await browser.newPage();
    await page.setContent(pipelinePage());
    const marks = page.locator('.workflow-startup-pipeline-stage[data-xgc-status="ready"] .workflow-startup-pipeline-mark');
    await expect.poll(async () => marks.count()).toBe(3);
    const bg = rgb(await marks.nth(0).evaluate((el) => getComputedStyle(el).backgroundColor));
    const fg = rgb(await marks.nth(0).evaluate((el) => getComputedStyle(el).color));
    // Filled mark per the operator decision (2026-09-11): the completed stage
    // reads as a black disc with a white glyph before any content handover.
    expect(luma(bg)).toBeLessThan(luma(fg));
    const overlay = page.locator('[data-xgc-role="lichtblick-empty-state"]');
    const overlayBg = await overlay.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(alpha(overlayBg) === 1 || overlayBg.startsWith('rgb(')).toBe(true);
    await page.close();
  });

  it('advances the shared running border angle over time', async () => {
    const page = await browser.newPage();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setContent(runningNodePage());
    const node = page.locator('[data-xgc-role="automation-node-tile"][data-running="true"]');
    await expect.poll(async () => node.count()).toBe(1);
    const first = await runningAngle(node);
    await page.waitForTimeout(400);
    const second = await runningAngle(node);
    expect(first.trim()).not.toEqual('');
    expect(second.trim()).not.toEqual(first.trim());
    const failing = page.locator('[data-xgc-role="automation-node-tile"][data-status="failing"]');
    await expect.poll(async () => failing.getAttribute('data-running')).toBeNull();
    await page.close();
  });
});

async function assertLatchedRemoteKeys(page: Page) {
  const slow = page.locator('[data-xgc-role="robot-remote-speed-gear"][aria-pressed="true"]');
  const forward = page.locator('[data-xgc-role="robot-remote-motion-intent"][data-xgc-id="probe-remote:forward"]');
  const stop = page.locator('[data-xgc-id="probe-remote:stop"]');
  await expect.poll(async () => rgb(await slow.evaluate((el) => getComputedStyle(el).backgroundColor)))
    .toEqual([255, 255, 255]);
  expect(rgb(await slow.evaluate((el) => getComputedStyle(el).color))).toEqual([10, 10, 10]);
  expect(rgb(await forward.evaluate((el) => getComputedStyle(el).backgroundColor))).toEqual([255, 255, 255]);
  expect(rgb(await forward.evaluate((el) => getComputedStyle(el.querySelector('svg')!).color))).toEqual([10, 10, 10]);
  await slow.hover();
  expect(rgb(await slow.evaluate((el) => getComputedStyle(el).backgroundColor))).toEqual([255, 255, 255]);
  expect(rgb(await slow.evaluate((el) => getComputedStyle(el).color))).toEqual([10, 10, 10]);
  expect(rgb(await stop.evaluate((el) => getComputedStyle(el).backgroundColor))).toEqual([255, 255, 255]);
  const stopColor = rgb(await stop.evaluate((el) => getComputedStyle(el).color));
  expect(stopColor[0]).toBeGreaterThan(150);
  expect(rgb(await stop.evaluate((el) => getComputedStyle(el.querySelector('svg')!).color))).toEqual(stopColor);
  await stop.hover();
  expect(rgb(await stop.evaluate((el) => getComputedStyle(el).backgroundColor))).toEqual([255, 255, 255]);
  expect(rgb(await stop.evaluate((el) => getComputedStyle(el).color))[0]).toBeGreaterThan(150);
  await page.mouse.move(0, 0);
  await stop.evaluate((el) => el.setAttribute('aria-pressed', 'false'));
  expect(rgb(await stop.evaluate((el) => getComputedStyle(el).backgroundColor))).not.toEqual([255, 255, 255]);
  expect(alpha(await stop.evaluate((el) => getComputedStyle(el).backgroundColor))).toBe(0);
  expect(rgb(await stop.evaluate((el) => getComputedStyle(el).color))[0]).toBeGreaterThan(150);
}

function rgb(value: string) {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) throw new Error(`not an rgb color: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function alpha(value: string) {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?/);
  if (!match) return 1;
  return match[4] === undefined ? 1 : Number(match[4]);
}

function luma([r, g, b]: number[]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function runningAngle(node: Locator) {
  return node.evaluate((el) => {
    const before = getComputedStyle(el, '::before');
    return [
      before.getPropertyValue('--xgc-node-running-angle').trim(),
      before.backgroundImage,
    ].join('|');
  });
}

function remotePage(skin: 'light' | 'dark', options: { docked?: boolean } = {}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>`;
  const stop = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>`;
  const key = (attrs: string, label: string, inner: string) =>
    `<button type="button" class="xgc-button xgc-control xgc-control-button robot-remote-control-key" data-appearance="inverse" data-size="compact" data-xgc-appearance="inverse" ${attrs} aria-label="${label}">${inner}</button>`;
  const remote = `
    <section class="robot-remote-window robot-remote-window-message${options.docked ? ' robot-remote-window-docked' : ''}" data-xgc-role="robot-remote-control" data-xgc-id="probe-remote">
      <div class="robot-remote-gears">
        ${key('data-tone="default" data-xgc-role="robot-remote-speed-gear" data-xgc-id="probe-remote:slow" aria-pressed="true"', 'Slow', 'Slow')}
        ${key('data-tone="default" data-xgc-role="robot-remote-speed-gear" data-xgc-id="probe-remote:medium" aria-pressed="false"', 'Medium', 'Medium')}
      </div>
      <div class="robot-remote-directions">
        ${key('data-tone="default" data-xgc-role="robot-remote-motion-intent" data-xgc-id="probe-remote:forward" aria-pressed="true" class="xgc-button xgc-control xgc-control-button robot-remote-control-key robot-remote-forward"', 'Forward', svg)}
        ${key('data-tone="danger" data-icon-only="true" data-xgc-tone="danger" data-xgc-icon-only="true" data-xgc-role="robot-remote-motion-intent" data-xgc-id="probe-remote:stop" aria-pressed="true"', 'Stop', stop)}
      </div>
    </section>`;
  const body = options.docked
    ? `<div class="xgc-agent-chat" data-xgc-role="agent-conversation" data-xgc-id="probe-chat">${remote}</div>`
    : remote;
  return `<!doctype html><html data-skin="${skin}"><head>
    <style>@layer vendor, tokens, base, shell, shared;</style>
    <style>@layer vendor { ${uiReactCss} }</style>
    ${options.docked ? `<style>${nativeChatCss}</style>` : ''}
    <style>${remoteCss}</style>
  </head><body>
    ${body}
  </body></html>`;
}

function pipelinePage() {
  const mark = (id: string) =>
    `<li class="workflow-startup-pipeline-stage" data-xgc-role="lichtblick-empty-state-stage" data-xgc-id="lichtblick:${id}" data-xgc-status="ready" data-current="${id === 'bridge' ? 'true' : 'false'}">
      <span class="workflow-startup-pipeline-mark"></span>
      ${id === 'bridge' ? '' : `<span class="workflow-startup-pipeline-rail" data-sending="false" data-passed="true"><span class="workflow-startup-pipeline-send"></span></span>`}
    </li>`;
  return `<!doctype html><html data-skin="light"><head>
    <style>@layer vendor { ${uiReactCss} }</style>
    <style>${pipelineCss}</style>
    <style>
      .lichtblick-workspace { position:relative; width:320px; height:240px; }
      .lichtblick-workspace > [data-xgc-role="lichtblick-empty-state"] {
        position:absolute; inset:0; z-index:2; background: var(--background-surface, var(--color-bg-surface));
      }
    </style>
  </head><body>
    <div class="lichtblick-workspace">
      <iframe title="Lichtblick"></iframe>
      <div class="workflow-startup-pipeline" data-xgc-role="lichtblick-empty-state" data-xgc-visual-complete="true">
        <ol class="workflow-startup-pipeline-stages">
          ${mark('run')}${mark('viewer')}${mark('bridge')}
        </ol>
      </div>
    </div>
  </body></html>`;
}

function runningNodePage() {
  return `<!doctype html><html data-skin="light"><head>
    <style>@layer vendor { ${uiReactCss} ${uiWorkflowCss} }</style>
    <style>
      :root {
        --duration-deliberate: 400ms;
        --stroke-strong: 2px;
        --color-border-accent: #38689a;
        --color-border: #c8c8c8;
        --radius-surface: 8px;
      }
      .xgc-workflow-node-surface { width: 220px; height: 88px; margin: 24px; }
    </style>
  </head><body>
    <div class="xgc-workflow-node-surface" data-running="true" data-xgc-role="automation-node-tile"></div>
    <div class="xgc-workflow-node-surface" data-xgc-role="automation-node-tile" data-status="failing"></div>
  </body></html>`;
}
