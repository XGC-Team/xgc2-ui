/* global AbortSignal,document,fetch,process,setTimeout,URL */
import { execFileSync } from 'node:child_process';
import { existsSync,writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const configuration = {
  webUrl: requiredURL('XGC_G6_WEB_URL'),
  edgeUrl: requiredURL('XGC_G6_EDGE_URL'),
  experimentId: requiredID('XGC_G6_EXPERIMENT_ID'),
  sourceId: requiredID('XGC_G6_SOURCE_ID'),
  container: requiredID('XGC_G6_AGENT_CONTAINER'),
  sourceProcess: requiredProcessIdentity('XGC_G6_SOURCE'),
  edgeProcess: requiredProcessIdentity('XGC_G6_EDGE'),
  sessionId: requiredID('XGC_G6_SESSION_ID'),
  mediaRunId: requiredID('XGC_G6_MEDIA_RUN_ID'),
  targetId: requiredID('XGC_G6_TARGET_ID'),
  evidencePath: required('XGC_G6_BROWSER_EVIDENCE'),
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
page.on('pageerror', (error) => pageErrors.push(error.message));
const evidence = {
  experimentId:configuration.experimentId,
  sessionId:configuration.sessionId,
  mediaRunId:configuration.mediaRunId,
  targetId:configuration.targetId,
  sourceId:configuration.sourceId,
  viewer:{},
  pageErrors,
};
let sourceStopped = false;
let edgeStopped = false;

try {
  await page.goto(`${configuration.webUrl}/#/experiments/${configuration.experimentId}`, {
    waitUntil:'domcontentloaded',timeout:30_000,
  });
  const gcsTab = page.getByRole('tab', { name:'GCS' });
  await gcsTab.waitFor({ state:'visible',timeout:30_000 });
  await gcsTab.click();
  const tile = page.locator(
    `[data-xgc-role="camera-video-tile"][data-xgc-id="${configuration.sourceId}"]`,
  );
  await tile.waitFor({ state:'visible',timeout:30_000 });
  const video = tile.locator('[data-xgc-role="camera-video-stream"]');
  const viewerButton = tile.locator(
    `[data-xgc-role="camera-video-tile-viewer-toggle"][data-xgc-id="${configuration.sourceId}"]`,
  );

  evidence.initial = await waitForAdvancing(page, video, configuration, 45_000);
  await viewerButton.click();
  await page.waitForFunction(
    ({ sourceId }) => document.querySelector(
      `[data-xgc-role="camera-video-tile"][data-xgc-id="${sourceId}"] [data-xgc-role="camera-video-panel"]`,
    )?.getAttribute('data-state') === 'disconnected',
    { sourceId:configuration.sourceId },
    { timeout:10_000 },
  );
  evidence.viewer.disconnect = await videoSnapshot(video);
  evidence.viewer.disconnect.state = 'disconnected';
  await viewerButton.click();
  evidence.viewer.reconnect = await waitForAdvancing(page, video, configuration, 45_000);

  assertProcessIdentity(configuration.container,configuration.sourceProcess);
  signalGroup(configuration.container, configuration.sourceProcess.pgid, 'STOP');
  sourceStopped = true;
  evidence.sourceFault = await waitForBytesStopped(page, video, configuration, 15_000);
  signalGroup(configuration.container, configuration.sourceProcess.pgid, 'CONT');
  sourceStopped = false;
  evidence.sourceRecovery = await waitForAdvancing(page, video, configuration, 45_000);

  assertProcessIdentity(configuration.container,configuration.edgeProcess);
  signalGroup(configuration.container, configuration.edgeProcess.pgid, 'STOP');
  edgeStopped = true;
  evidence.edgeFault = await waitForHealthUnavailable(page, video, configuration, 15_000);
  signalGroup(configuration.container, configuration.edgeProcess.pgid, 'CONT');
  edgeStopped = false;
  evidence.edgeRecovery = await waitForAdvancing(page, video, configuration, 60_000);
  await page.screenshot({ path:`${configuration.evidencePath}.png`,fullPage:true });

  await viewerButton.click();
  await page.waitForFunction(
    ({ sourceId }) => document.querySelector(
      `[data-xgc-role="camera-video-tile"][data-xgc-id="${sourceId}"] [data-xgc-role="camera-video-panel"]`,
    )?.getAttribute('data-state') === 'disconnected',
    { sourceId:configuration.sourceId },
    { timeout:10_000 },
  );
  evidence.viewer.finalDisconnect = await videoSnapshot(video);
  evidence.viewer.finalDisconnect.state = 'disconnected';
  evidence.finalViewerObservations = [];
  evidence.viewerClosed = await waitForViewerCount(
    configuration,0,20_000,evidence.finalViewerObservations,
  );
  await context.close();
  if (pageErrors.length > 0) throw new Error(`page errors: ${pageErrors.join(' | ')}`);
  writeFileSync(configuration.evidencePath, `${JSON.stringify(evidence,null,2)}\n`);
} catch (error) {
  evidence.error = error instanceof Error ? error.message : String(error);
  writeFileSync(`${configuration.evidencePath}.failure.json`, `${JSON.stringify(evidence,null,2)}\n`);
  throw error;
} finally {
  if (sourceStopped) resumeGroup(configuration.container, configuration.sourceProcess.pgid);
  if (edgeStopped) resumeGroup(configuration.container, configuration.edgeProcess.pgid);
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

function requiredPID(name) {
  const value = required(name);
  if (!/^[1-9][0-9]{0,9}$/.test(value)) throw new Error(`${name} is invalid`);
  return value;
}

function requiredCounter(name) {
  const value = required(name);
  if (!/^[1-9][0-9]{0,19}$/.test(value)) throw new Error(`${name} is invalid`);
  return value;
}

function requiredProcessIdentity(prefix) {
  return {
    pid:requiredPID(`${prefix}_PID`),
    pgid:requiredPID(`${prefix}_PGID`),
    startTicks:requiredCounter(`${prefix}_START_TICKS`),
  };
}

function requiredURL(name) {
  const parsed = new URL(required(name));
  if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password
    || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${name} must be an HTTP origin`);
  }
  return parsed.origin;
}

function assertProcessIdentity(container,process) {
  const script = [
    'import os,sys',
    'pid=int(sys.argv[1])',
    'raw=open(f"/proc/{pid}/stat",encoding="utf-8").read()',
    'fields=raw[raw.rfind(")")+2:].split()',
    'print(f"{os.getpgid(pid)} {fields[19]}")',
  ].join(';');
  const observed = execFileSync(
    'docker',['exec',container,'python3','-c',script,process.pid],
    { encoding:'utf8' },
  ).trim();
  if (observed !== `${process.pgid} ${process.startTicks}`) {
    throw new Error(`process identity drifted before fault injection: expected ${process.pgid} ${process.startTicks}, got ${observed}`);
  }
}

function signalGroup(container, pgid, name) {
  execFileSync('docker', ['exec',container,'kill',`-${name}`,'--',`-${pgid}`], { stdio:'inherit' });
}

function resumeGroup(container, pgid) {
  try { signalGroup(container,pgid,'CONT'); } catch { /* best-effort cleanup */ }
}

async function videoSnapshot(video) {
  return video.evaluate((element) => ({
    currentTime:element.currentTime,
    readyState:element.readyState,
    width:element.videoWidth,
    height:element.videoHeight,
    paused:element.paused,
    hasStream:Boolean(element.srcObject),
  }));
}

async function healthSnapshot(page, configuration, timeoutMs = 3_000) {
  return page.evaluate(async ({ edgeUrl,sourceId,timeoutMs }) => {
    const response = await fetch(`${edgeUrl}/healthz`, {
      cache:'no-store',signal:AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`healthz HTTP ${response.status}`);
    const payload = await response.json();
    const source = payload.sources?.find((entry) => entry.id === sourceId);
    if (!source) throw new Error(`healthz has no source ${sourceId}`);
    return source;
  }, { edgeUrl:configuration.edgeUrl,sourceId:configuration.sourceId,timeoutMs });
}

function isByteCounter(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

async function waitForAdvancing(page, video, configuration, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let previous;
  while (Date.now() < deadline) {
    const currentVideo = await videoSnapshot(video);
    const health = await healthSnapshot(page,configuration).catch(() => undefined);
    if (previous && health && currentVideo.readyState >= 3 && currentVideo.width > 0 && currentVideo.height > 0
      && currentVideo.currentTime > previous.video.currentTime + 0.2
      && isByteCounter(health.bytesReceived) && isByteCounter(previous.health.bytesReceived)
      && health.bytesReceived > previous.health.bytesReceived
      && health.active === true && health.consumers >= 1 && health.viewers >= 1) {
      return { before:previous,after:{ video:currentVideo,health },advancing:true };
    }
    if (health) previous = { video:currentVideo,health };
    await page.waitForTimeout(1_000);
  }
  throw new Error(`video and ${configuration.sourceId} inbound bytes did not advance within ${timeoutMs}ms`);
}

async function waitForBytesStopped(page, video, configuration, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const before = { video:await videoSnapshot(video),health:await healthSnapshot(page,configuration) };
    await page.waitForTimeout(2_000);
    const after = { video:await videoSnapshot(video),health:await healthSnapshot(page,configuration) };
    if (isByteCounter(after.health.bytesReceived) && isByteCounter(before.health.bytesReceived)
      && after.health.bytesReceived === before.health.bytesReceived
      && after.video.currentTime <= before.video.currentTime + 0.1) {
      return { before,after,bytesStopped:true };
    }
  }
  throw new Error('source fault did not stop inbound byte count and decoded video time');
}

async function waitForHealthUnavailable(page, video, configuration, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const before = await videoSnapshot(video);
  while (Date.now() < deadline) {
    try {
      await healthSnapshot(page,configuration,1_000);
    } catch (error) {
      await page.waitForTimeout(1_500);
      return {
        before,after:await videoSnapshot(video),healthUnavailable:true,
        error:error instanceof Error ? error.message : String(error),
      };
    }
    await page.waitForTimeout(500);
  }
  throw new Error('Edge fault did not make health unavailable');
}

async function waitForViewerCount(configuration, expected, timeoutMs, observations = []) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${configuration.edgeUrl}/healthz`, { signal:AbortSignal.timeout(2_000) });
      const payload = await response.json();
      const source = payload.sources?.find((entry) => entry.id === configuration.sourceId);
      observations.push({ at:new Date().toISOString(),viewers:source?.viewers,consumers:source?.consumers });
      if (source?.viewers === expected) return { viewers:source.viewers,consumers:source.consumers };
    } catch (error) {
      observations.push({
        at:new Date().toISOString(),
        error:error instanceof Error ? error.message : String(error),
      });
    }
    await new Promise((resolve) => setTimeout(resolve,500));
  }
  throw new Error(`viewer count did not reach ${expected}`);
}
