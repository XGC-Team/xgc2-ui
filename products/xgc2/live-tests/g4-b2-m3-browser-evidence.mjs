/* global document,HTMLIFrameElement,process,URL */
import { existsSync,writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import {
  captureLichtblickFrameDiagnostics,
  installBrowserDiagnostics,
  observeDynamicCanvas,
  waitForLichtblickCanvas,
} from './lichtblick-browser-evidence-support.mjs';

const configuration = {
  webUrl:requiredURL('XGC_G4_WEB_URL'),
  experimentId:requiredID('XGC_G4_EXPERIMENT_ID'),
  robotId:requiredID('XGC_G4_ROBOT_ID'),
  sessionId:requiredID('XGC_G4_SESSION_ID'),
  runId:requiredID('XGC_G4_RUN_ID'),
  expectedState:requiredState('XGC_G4_EXPECTED_STATE'),
  requireDynamic:requiredBoolean('XGC_G4_REQUIRE_DYNAMIC'),
  evidencePath:required('XGC_G4_BROWSER_EVIDENCE'),
};

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || [
  chromium.executablePath(),
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find((candidate) => candidate && existsSync(candidate));

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const context = await browser.newContext({ viewport:{ width:1440,height:960 } });
const page = await context.newPage();
const pageErrors = [];
const browserDiagnostics = installBrowserDiagnostics(page);
let canvasMotion;
page.on('pageerror', (error) => pageErrors.push(error.message));

try {
  await page.goto(`${configuration.webUrl}/#/experiments/${configuration.experimentId}`, {
    waitUntil:'domcontentloaded',timeout:30_000,
  });
  const gcsTab = page.getByRole('tab', { name:'GCS' });
  await gcsTab.waitFor({ state:'visible',timeout:30_000 });
  await gcsTab.click();

  const instrument = page.locator(
    `[data-xgc-role="robot-b2-instrument"][data-xgc-id="${configuration.robotId}"]`,
  );
  await instrument.waitFor({ state:'visible',timeout:45_000 });
  await page.waitForFunction(({ robotId,expectedState }) => {
    const element = document.querySelector(
      `[data-xgc-role="robot-b2-instrument"][data-xgc-id="${robotId}"]`,
    );
    if (!element) return false;
    const expectedConnection = expectedState === 'live' ? 'online' : 'offline';
    const expectedStream = expectedState === 'live' ? 'live' : 'offline';
    return element.getAttribute('data-xgc-connection') === expectedConnection
      && element.getAttribute('data-xgc-stream-state') === expectedStream;
  }, { robotId:configuration.robotId,expectedState:configuration.expectedState }, { timeout:45_000 });

  const overlay = page.locator(
    `[data-xgc-role="lichtblick-b2-projection-state"][data-xgc-id="${configuration.robotId}"]`,
  );
  await overlay.waitFor({ state:'visible',timeout:45_000 });
  await page.waitForFunction(({ robotId,expectedState }) => document.querySelector(
    `[data-xgc-role="lichtblick-b2-projection-state"][data-xgc-id="${robotId}"]`,
  )?.getAttribute('data-xgc-state') === expectedState,
  { robotId:configuration.robotId,expectedState:configuration.expectedState },
  { timeout:45_000 });

  const frame = page.locator('[data-xgc-role="lichtblick-frame"]');
  if (await frame.count() !== 1) throw new Error('expected exactly one embedded Lichtblick frame');
  await frame.waitFor({ state:'visible',timeout:45_000 });
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-xgc-role="lichtblick-frame"]');
    return element instanceof HTMLIFrameElement && element.contentDocument?.contentType === 'text/html';
  }, undefined, { timeout:45_000 });

  const canvas = await waitForLichtblickCanvas(page,frame,45_000);
  canvasMotion = await observeDynamicCanvas(page,canvas.locator,{
    timeoutMs:configuration.requireDynamic ? 45_000 : 0,
  });
  if (canvasMotion.samples.some(({ bytes }) => bytes < 5_000)) {
    throw new Error('embedded Lichtblick screenshot is unexpectedly empty');
  }
  if (configuration.requireDynamic && !canvasMotion.dynamic) {
    throw new Error('embedded Lichtblick 3D canvas did not repeatedly change while live B2 ROS data was advancing');
  }

  const evidence = {
    experimentId:configuration.experimentId,
    sessionId:configuration.sessionId,
    runId:configuration.runId,
    robotId:configuration.robotId,
    projectionState:await overlay.getAttribute('data-xgc-state'),
    instrument:{
      connection:await instrument.getAttribute('data-xgc-connection'),
      streamState:await instrument.getAttribute('data-xgc-stream-state'),
      heading:await instrument.getAttribute('data-heading'),
      linearSpeed:await instrument.getAttribute('data-linear-speed'),
    },
    lichtblick:{
      html:true,
      canvasCount:canvas.count,
      canvases:canvas.canvases,
      ...canvasMotion,
    },
    pageErrors,
  };
  await page.screenshot({ path:`${configuration.evidencePath}.png`,fullPage:true });
  if (pageErrors.length > 0) throw new Error(`page errors: ${pageErrors.join(' | ')}`);
  writeFileSync(configuration.evidencePath,`${JSON.stringify(evidence,null,2)}\n`);
} catch (cause) {
  const failurePath = `${configuration.evidencePath}.failure`;
  const lichtblickFrame = await captureLichtblickFrameDiagnostics(page);
  const selectors = await page.evaluate(() => {
    const snapshot = (selector) => [...document.querySelectorAll(selector)].map((element) => ({
      role:element.getAttribute('data-xgc-role'),
      id:element.getAttribute('data-xgc-id'),
      state:element.getAttribute('data-state') || element.getAttribute('data-xgc-state'),
      hidden:element.hidden,
      text:(element.textContent || '').trim().slice(0,500),
      bounds:(() => {
        const box = element.getBoundingClientRect();
        return { x:box.x,y:box.y,width:box.width,height:box.height };
      })(),
    }));
    return {
      workspace:snapshot('[data-xgc-role="lichtblick-workspace"]'),
      panel:snapshot('[data-xgc-role="lichtblick-panel"]'),
      panelState:snapshot('[data-xgc-role="lichtblick-panel-state"]'),
      frame:snapshot('[data-xgc-role="lichtblick-frame"]'),
      projection:snapshot('[data-xgc-role="lichtblick-b2-projection-state"]'),
    };
  }).catch((error) => ({ diagnosticError:error.message }));
  await page.screenshot({ path:`${failurePath}.png`,fullPage:true }).catch(() => undefined);
  writeFileSync(`${failurePath}.json`,`${JSON.stringify({
    error:cause instanceof Error ? cause.message : String(cause),
    url:page.url(),
    selectors,
    pageErrors,
    canvasMotion,
    browserDiagnostics,
    lichtblickFrame,
  },null,2)}\n`);
  throw cause;
} finally {
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredID(name) {
  const value = required(name);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)) throw new Error(`${name} is invalid`);
  return value;
}

function requiredURL(name) {
  const parsed = new URL(required(name));
  if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password
    || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${name} must be an HTTP origin`);
  }
  return parsed.origin;
}

function requiredState(name) {
  const value = required(name);
  if (!['live','offline'].includes(value)) throw new Error(`${name} must be live or offline`);
  return value;
}

function requiredBoolean(name) {
  const value = required(name);
  if (!['true','false'].includes(value)) throw new Error(`${name} must be true or false`);
  return value === 'true';
}
