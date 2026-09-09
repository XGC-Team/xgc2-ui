/* global AbortSignal,document,fetch,HTMLIFrameElement,process,URL */
import { existsSync,writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { chromium } from '@playwright/test';
import {
  B2_ASSET_ID,
  B2_ROBOT_ID,
  B2_TARGET_ID,
  assertB2BrowserEvidence,
  assertB2Ledger,
  assertG4B2Evidence,
  assertG6B2Evidence,
  digestEvidence,
  readJSONEvidence,
} from './browser-evidence-contract.mjs';
import {
  captureLichtblickFrameDiagnostics,
  installBrowserDiagnostics,
  observeDynamicCanvas,
  waitForLichtblickCanvas,
} from './lichtblick-browser-evidence-support.mjs';

const DASHBOARD_TARGET_ID = 'local';
const CAMERA_SOURCE_ID = 'odin1';
const PANEL_TIMEOUT_MS = 45_000;
const ASSET_PANEL_IDS = ['robot-assets'];
const GCS_PANEL_IDS = [
  'robot-instruments','lichtblick','camera-video','ros-control','b2-onboard-workflows',
];

const configuration = {
  webUrl:requiredURL('XGC_B2_ALL_PANELS_WEB_URL'),
  edgeUrl:requiredURL('XGC_B2_ALL_PANELS_EDGE_URL'),
  experimentId:requiredID('XGC_B2_ALL_PANELS_EXPERIMENT_ID'),
  sessionId:requiredID('XGC_B2_ALL_PANELS_SESSION_ID'),
  projectionRunId:requiredID('XGC_B2_ALL_PANELS_PROJECTION_RUN_ID'),
  roscoreRunId:requiredID('XGC_B2_ALL_PANELS_ROSCORE_RUN_ID'),
  adaptersRunId:requiredID('XGC_B2_ALL_PANELS_ADAPTERS_RUN_ID'),
  serviceResourceId:requiredID('XGC_B2_ALL_PANELS_SERVICE_RESOURCE_ID'),
  serviceRunId:requiredID('XGC_B2_ALL_PANELS_SERVICE_RUN_ID'),
  algorithmResourceId:requiredID('XGC_B2_ALL_PANELS_ALGORITHM_RESOURCE_ID'),
  algorithmRunId:requiredID('XGC_B2_ALL_PANELS_ALGORITHM_RUN_ID'),
  g6MediaRunId:requiredID('XGC_B2_ALL_PANELS_G6_MEDIA_RUN_ID'),
  cameraFixtureRunId:requiredID('XGC_B2_ALL_PANELS_CAMERA_FIXTURE_RUN_ID'),
  cameraMediaRunId:requiredID('XGC_B2_ALL_PANELS_CAMERA_MEDIA_RUN_ID'),
  ledgerPath:requiredAbsolutePath('XGC_B2_ALL_PANELS_LEDGER'),
  g4Path:requiredAbsolutePath('XGC_B2_ALL_PANELS_G4_EVIDENCE'),
  g6Path:requiredAbsolutePath('XGC_B2_ALL_PANELS_G6_EVIDENCE'),
  evidencePath:requiredAbsolutePath('XGC_B2_ALL_PANELS_BROWSER_EVIDENCE'),
};

assertDistinctPaths([
  configuration.ledgerPath,
  configuration.g4Path,
  configuration.g6Path,
  configuration.evidencePath,
]);
assertFreshOutput(configuration.evidencePath);

const expected = {
  ...configuration,
  dashboardTargetId:DASHBOARD_TARGET_ID,
};
const ledger = readJSONEvidence(configuration.ledgerPath,'B2 API ledger');
const g4Evidence = readJSONEvidence(configuration.g4Path,'G4 B2 browser evidence');
const g6Evidence = readJSONEvidence(configuration.g6Path,'G6 B2 browser evidence');
assertB2Ledger(ledger,expected);
assertG4B2Evidence(g4Evidence,expected);
assertG6B2Evidence(g6Evidence,expected);

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
page.on('pageerror',(error) => pageErrors.push(error.message));

try {
  await page.goto(`${configuration.webUrl}/#/experiments/${configuration.experimentId}`, {
    waitUntil:'domcontentloaded',timeout:30_000,
  });

  const assetTab = await exactLocator(page.getByRole('tab',{ name:'Asset',exact:true }),'Asset tab');
  await assetTab.waitFor({ state:'visible',timeout:30_000 });
  await assetTab.click();
  const assetCard = await exactLocator(page.locator(
    `[data-xgc-role="experiment-robot-assets-panel-robot"][data-xgc-id="${B2_ASSET_ID}"]`,
  ),'canonical B2 Asset card');
  await assetCard.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  const assetPanelIds = await configuredPanelIds(page,'asset',ASSET_PANEL_IDS,'B2 Asset');
  const asset = {
    resourceId:B2_ASSET_ID,
    count:await assetCard.count(),
    state:(await assetCard.getAttribute('data-xgc-state')) ?? '',
    text:(await assetCard.innerText()).trim(),
  };

  const gcsTab = await exactLocator(page.getByRole('tab',{ name:'GCS',exact:true }),'GCS tab');
  await gcsTab.click();
  const gcsPanelIds = await configuredPanelIds(page,'gcs',GCS_PANEL_IDS,'B2 GCS');

  const robotCard = await exactLocator(page.locator(
    `[data-xgc-role="run-robot-card"][data-xgc-id="${B2_ROBOT_ID}"]`,
  ),'B2 run Robot card');
  await robotCard.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  const instrumentElement = await exactLocator(robotCard.locator(
    `[data-xgc-role="robot-b2-instrument"][data-xgc-id="${B2_ROBOT_ID}"]`,
  ),'B2 instrument');
  await page.waitForFunction(({ robotId }) => {
    const card = document.querySelector(
      `[data-xgc-role="run-robot-card"][data-xgc-id="${robotId}"]`,
    );
    const instrument = card?.querySelector(
      `[data-xgc-role="robot-b2-instrument"][data-xgc-id="${robotId}"]`,
    );
    return card?.getAttribute('data-xgc-status') === 'online'
      && card?.getAttribute('data-xgc-health') === 'healthy'
      && instrument?.getAttribute('data-xgc-connection') === 'online'
      && instrument?.getAttribute('data-xgc-stream-state') === 'live'
      && Number.isFinite(Number(instrument?.getAttribute('data-heading')))
      && Number.isFinite(Number(instrument?.getAttribute('data-linear-speed')));
  }, { robotId:B2_ROBOT_ID }, { timeout:PANEL_TIMEOUT_MS });
  const instrument = {
    cardCount:await robotCard.count(),
    cardStatus:await robotCard.getAttribute('data-xgc-status'),
    cardHealth:await robotCard.getAttribute('data-xgc-health'),
    connection:await instrumentElement.getAttribute('data-xgc-connection'),
    streamState:await instrumentElement.getAttribute('data-xgc-stream-state'),
    heading:await instrumentElement.getAttribute('data-heading'),
    linearSpeed:await instrumentElement.getAttribute('data-linear-speed'),
  };

  const frame = await exactLocator(page.locator('[data-xgc-role="lichtblick-frame"]'),'B2 Lichtblick frame');
  await waitForHTMLFrame(page,frame,PANEL_TIMEOUT_MS);
  const canvas = await waitForLichtblickCanvas(page,frame,PANEL_TIMEOUT_MS);
  const projectionState = await exactLocator(page.locator(
    `[data-xgc-role="lichtblick-b2-projection-state"][data-xgc-id="${B2_ROBOT_ID}"]`,
  ),'B2 Lichtblick projection state');
  await page.waitForFunction(({ robotId }) => document.querySelector(
    `[data-xgc-role="lichtblick-b2-projection-state"][data-xgc-id="${robotId}"]`,
  )?.getAttribute('data-xgc-state') === 'live',{ robotId:B2_ROBOT_ID },{ timeout:PANEL_TIMEOUT_MS });
  canvasMotion = await observeDynamicCanvas(page,canvas.locator);
  if (canvasMotion.samples.some(({ bytes }) => bytes < 5_000)) {
    throw new Error('embedded B2 Lichtblick 3D canvas screenshot is unexpectedly empty');
  }
  const lichtblick = {
    frameCount:await frame.count(),
    canvasCount:canvas.count,
    canvases:canvas.canvases,
    projectionState:await projectionState.getAttribute('data-xgc-state'),
    ...canvasMotion,
  };

  const rosPanel = await exactLocator(page.locator(
    '[data-xgc-role="ros-basic-services-panel"][data-xgc-id="ros-control"]',
  ),'ROS Control panel');
  await rosPanel.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  await page.waitForFunction(() => {
    const panel = document.querySelector(
      '[data-xgc-role="ros-basic-services-panel"][data-xgc-id="ros-control"]',
    );
    const tiles = [...(panel?.querySelectorAll('[data-xgc-role="ros-basic-service-control"]') ?? [])];
    return tiles.length === 2 && tiles.every((tile) => ['ready','running'].includes(
      tile.getAttribute('data-xgc-status') || '',
    ) && tile.getAttribute('data-xgc-running') === 'true' && Boolean(tile.getAttribute('data-xgc-run-id')));
  },undefined,{ timeout:PANEL_TIMEOUT_MS });
  const rosTileElements = rosPanel.locator('[data-xgc-role="ros-basic-service-control"]');
  const rosTileIds = await rosTileElements.evaluateAll((elements) => elements.map(
    (element) => element.getAttribute('data-xgc-id') || '',
  ));
  const hiddenRosIds = ['gzserver','vrpn','rviz','gzclient'];
  const ros = {
    panelCount:await rosPanel.count(),
    tileIds:rosTileIds,
    hiddenIds:[],
    tiles:{},
  };
  for (const hiddenId of hiddenRosIds) {
    if (await rosPanel.locator(
      `[data-xgc-role="ros-basic-service-control"][data-xgc-id="${hiddenId}"]`,
    ).count() > 0) ros.hiddenIds.push(hiddenId);
  }
  for (const id of ['roscore','adapters']) {
    const tile = await exactLocator(rosPanel.locator(
      `[data-xgc-role="ros-basic-service-control"][data-xgc-id="${id}"]`,
    ),`${id} ROS Control tile`);
    ros.tiles[id] = {
      status:await tile.getAttribute('data-xgc-status'),
      running:await tile.getAttribute('data-xgc-running'),
      runId:await tile.getAttribute('data-xgc-run-id'),
    };
  }

  const automationPanel = await exactLocator(page.locator(
    '[data-xgc-role="automation-workflow-panel"][data-xgc-id="b2-onboard-workflows"]',
  ),'B2 onboard Automation panel');
  await automationPanel.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  const automationHeader = await exactLocator(page.locator(
    '[data-xgc-role="automation-workflow-header-actions"][data-xgc-id="b2-onboard-workflows"]',
  ),'B2 onboard Automation header');
  const views = [];
  for (const viewId of ['controls','whiteboard','history','logs']) {
    await exactLocator(automationHeader.locator(
      `[data-xgc-role="automation-workflow-view"][data-xgc-id="${viewId}"]`,
    ),`Automation ${viewId} view`);
    views.push(viewId);
  }
  const controlsView = await exactLocator(automationHeader.locator(
    '[data-xgc-role="automation-workflow-view"][data-xgc-id="controls"]',
  ),'Automation controls view');
  await controlsView.click();
  const serviceControl = await workflowControl(automationPanel,configuration.serviceResourceId,'service');
  const algorithmControl = await workflowControl(automationPanel,configuration.algorithmResourceId,'algorithm');

  const serviceHistory = await workflowHistory(page,automationPanel,automationHeader,{
    resourceId:configuration.serviceResourceId,
    runId:configuration.serviceRunId,
    nodeId:'typed-call',
    label:'service',
  });
  const algorithmHistory = await workflowHistory(page,automationPanel,automationHeader,{
    resourceId:configuration.algorithmResourceId,
    runId:configuration.algorithmRunId,
    nodeId:'algorithm',
    label:'algorithm',
  });
  const algorithmLogEvidence = await workflowLogs(page,automationPanel,automationHeader,{
    resourceId:configuration.algorithmResourceId,
    runId:configuration.algorithmRunId,
    nodeId:'algorithm',
  });
  const automation = {
    panelCount:await automationPanel.count(),
    views,
    service:{
      resourceId:configuration.serviceResourceId,
      controlAria:serviceControl,
      history:serviceHistory,
    },
    algorithm:{
      resourceId:configuration.algorithmResourceId,
      controlAria:algorithmControl,
      history:algorithmHistory,
      ...algorithmLogEvidence,
    },
  };

  const cameraTile = await exactLocator(page.locator(
    `[data-xgc-role="camera-video-tile"][data-xgc-id="${CAMERA_SOURCE_ID}"]`,
  ),'odin1 Camera tile');
  await cameraTile.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  const cameraVideo = await exactLocator(cameraTile.locator('[data-xgc-role="camera-video-stream"]'),'odin1 video');
  const cameraHeader = await exactLocator(page.locator('[data-xgc-role="camera-video-header-actions"]'),'Camera header');
  const cameraStatus = await exactLocator(cameraHeader.locator('[data-xgc-role="camera-video-header-status"]'),'Camera header status');
  await page.waitForFunction(() => {
    const status = document.querySelector('[data-xgc-role="camera-video-header-status"]');
    return ['attached','running','waiting'].includes(status?.getAttribute('data-media-state') || '')
      && status?.getAttribute('data-media-binding-id') === 'b2-camera-topic-media'
      && Boolean(status?.getAttribute('data-media-run-id'))
      && status?.getAttribute('data-viewer-state') === 'playing';
  },undefined,{ timeout:PANEL_TIMEOUT_MS });
  const videoEvidence = await waitForAdvancingVideo(page,cameraVideo,configuration,PANEL_TIMEOUT_MS);
  const camera = {
    tileCount:await cameraTile.count(),
    sourceId:CAMERA_SOURCE_ID,
    mediaBindingId:await cameraStatus.getAttribute('data-media-binding-id'),
    mediaRunId:await cameraStatus.getAttribute('data-media-run-id'),
    mediaState:await cameraStatus.getAttribute('data-media-state'),
    viewerState:await cameraStatus.getAttribute('data-viewer-state'),
    hasStart:await cameraHeader.locator('[data-xgc-role="camera-video-media-start"]').count() === 1,
    hasRestart:await cameraHeader.locator('[data-xgc-role="camera-video-media-restart"]').count() === 1,
    hasStop:await cameraHeader.locator('[data-xgc-role="camera-video-media-stop"]').count() === 1,
    hasHeaderViewerToggle:await cameraHeader.locator('[data-xgc-role="camera-video-viewer-toggle"]').count() === 1,
    hasTileViewerToggle:await cameraTile.locator(
      `[data-xgc-role="camera-video-tile-viewer-toggle"][data-xgc-id="${CAMERA_SOURCE_ID}"]`,
    ).count() === 1,
    video:videoEvidence,
  };

  const evidence = {
    experimentId:configuration.experimentId,
    sessionId:configuration.sessionId,
    targetId:B2_TARGET_ID,
    observedAt:new Date().toISOString(),
    panelRoster:{ asset:assetPanelIds,gcs:gcsPanelIds },
    asset,
    instrument,
    lichtblick,
    ros,
    automation,
    camera,
    inputs:{
      ledger:digestEvidence(ledger),
      g4:digestEvidence(g4Evidence),
      g6:digestEvidence(g6Evidence),
    },
    pageErrors,
  };
  assertB2BrowserEvidence(evidence,expected);
  await page.screenshot({ path:`${configuration.evidencePath}.png`,fullPage:true });
  assertB2BrowserEvidence(evidence,expected);
  writeFileSync(configuration.evidencePath,`${JSON.stringify(evidence,null,2)}\n`);
} catch (cause) {
  const failurePath = `${configuration.evidencePath}.failure`;
  const lichtblickFrame = await captureLichtblickFrameDiagnostics(page);
  await page.screenshot({ path:`${failurePath}.png`,fullPage:true }).catch(() => undefined);
  writeFileSync(`${failurePath}.json`,`${JSON.stringify({
    error:messageOf(cause),
    url:page.url(),
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

async function workflowControl(panel,resourceId,label) {
  const control = await exactLocator(panel.locator(
    `[data-xgc-role="automation-workflow-control"][data-xgc-id="${resourceId}"]`,
  ),`${label} Automation control`);
  await control.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  return (await control.getAttribute('aria-label')) || '';
}

async function workflowHistory(page,panel,header,{ resourceId,runId,nodeId,label }) {
  const historyView = await exactLocator(header.locator(
    '[data-xgc-role="automation-workflow-view"][data-xgc-id="history"]',
  ),'Automation history view');
  await historyView.click();
  await selectWorkflow(page,header,resourceId);
  const run = await exactLocator(panel.locator(
    `[data-xgc-role="automation-workflow-history-run"][data-xgc-id="${runId}"]`,
  ),`${label} Automation history run`);
  await run.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  if (await run.getAttribute('aria-current') !== 'true') await run.click();
  const node = await exactLocator(panel.locator(
    `[data-xgc-role="automation-workflow-node"][data-xgc-id="${nodeId}"][data-xgc-status="succeeded"]`,
  ),`${label} succeeded Automation node`);
  await node.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  const details = await exactLocator(node.locator('details'),`${label} Automation node output details`);
  const output = await exactLocator(details.locator('pre'),`${label} Automation node output`);
  await output.waitFor({ state:'attached',timeout:PANEL_TIMEOUT_MS });
  if (await details.getAttribute('open') === null) await details.locator('summary').click();
  await output.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  const outputText = await output.textContent();
  let nodeOutput;
  try {
    nodeOutput = JSON.parse(outputText || '');
  } catch (cause) {
    throw new Error(`${label} Automation node output is not JSON: ${messageOf(cause)}`,{ cause });
  }
  return {
    runId,
    source:((await run.locator('[data-xgc-role="automation-workflow-run-source"]').textContent()) || '').trim(),
    nodeId,
    nodeStatus:await node.getAttribute('data-xgc-status'),
    outputExpanded:await details.getAttribute('open') !== null,
    outputVisible:await output.isVisible(),
    nodeOutput,
  };
}

async function workflowLogs(page,panel,header,{ resourceId,runId,nodeId }) {
  const logsView = await exactLocator(header.locator(
    '[data-xgc-role="automation-workflow-view"][data-xgc-id="logs"]',
  ),'Automation logs view');
  await logsView.click();
  await selectWorkflow(page,header,resourceId);
  const logs = await exactLocator(panel.locator(
    `[data-xgc-role="automation-workflow-logs"][data-xgc-id="${runId}"]`,
  ),'algorithm Automation logs');
  await logs.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  const run = await exactLocator(logs.locator(
    `[data-xgc-role="automation-workflow-log-run"][data-xgc-id="${runId}"]`,
  ),'algorithm log run');
  if (await run.getAttribute('aria-current') !== 'true') await run.click();
  const jobLogs = await exactLocator(logs.locator(
    `[data-xgc-role="automation-workflow-job-logs"][data-xgc-id="${runId}:${nodeId}"]`
    + '[data-xgc-source="job-log-endpoint"]',
  ),'algorithm Job logs');
  await jobLogs.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  const jobId = (await jobLogs.getAttribute('data-xgc-job-id')) || '';
  const jobStdout = await logStream(page,jobLogs,'job',jobId,'stdout','attempt 1 succeeded');
  const jobStderr = await logStream(page,jobLogs,'job',jobId,'stderr','completed count=5');
  await exactLocator(jobLogs.getByRole('button',{ name:'Refresh',exact:true }),
    'algorithm Job logs loaded refresh control');
  if (await jobLogs.getByRole('alert').count() > 0) {
    throw new Error(`algorithm Job log endpoint failed: ${await jobLogs.getByRole('alert').innerText()}`);
  }
  const lifecycle = await exactLocator(logs.locator(
    `[data-xgc-role="automation-workflow-orchestration-lifecycle"][data-xgc-id="${runId}"]`
    + '[data-xgc-source="orchestration-run-log-endpoint"]',
  ),'algorithm orchestration lifecycle logs');
  await lifecycle.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  const lifecycleStdout = await logStream(
    page,lifecycle,'orchestration',runId,'stdout','node algorithm succeeded',
  );
  await exactLocator(lifecycle.getByRole('button',{ name:'Refresh',exact:true }),
    'algorithm lifecycle logs loaded refresh control');
  if (await lifecycle.getByRole('alert').count() > 0) {
    throw new Error(`algorithm lifecycle log endpoint failed: ${await lifecycle.getByRole('alert').innerText()}`);
  }
  const lifecycleStderr = await logStream(page,lifecycle,'orchestration',runId,'stderr');
  return {
    jobLogs:{
      source:await jobLogs.getAttribute('data-xgc-source'),
      runId,
      nodeId,
      jobId,
      stdout:jobStdout,
      stderr:jobStderr,
    },
    orchestrationLifecycleLogs:{
      source:await lifecycle.getAttribute('data-xgc-source'),
      runId,
      stdout:lifecycleStdout,
      stderr:lifecycleStderr,
    },
  };
}

async function logStream(page,logs,entityType,entityId,stream,needle) {
  const tab = await exactLocator(logs.locator(
    `[data-xgc-role="${entityType}-log-stream-tab"][data-xgc-id="${entityId}:${stream}"]`,
  ),`${stream} log tab`);
  await tab.click();
  const content = await exactLocator(logs.locator(
    `[data-xgc-role="${entityType}-log-stream"][data-xgc-id="${entityId}:${stream}"] pre`,
  ),`${stream} log content`);
  await content.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  const deadline = Date.now() + PANEL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const value = (await content.textContent()) || '';
    if (needle === undefined || value.includes(needle)) return value;
    await page.waitForTimeout(500);
  }
  throw new Error(`${stream} log did not contain ${needle}`);
}

async function selectWorkflow(page,header,resourceId) {
  const selector = await exactLocator(header.locator(
    '[data-xgc-role="automation-workflow-selector-listbox"]',
  ),'Automation workflow selector');
  await selector.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  if (await selector.getAttribute('data-value') === resourceId) return;
  await selector.locator('button[aria-haspopup="listbox"]').click();
  const option = await exactLocator(page.locator(
    `[data-xgc-role="select-option"][data-xgc-id="${resourceId}"]`,
  ),`Automation workflow option ${resourceId}`);
  await option.click();
  await page.waitForFunction(({ resourceId }) => document.querySelector(
    '[data-xgc-role="automation-workflow-selector-listbox"]',
  )?.getAttribute('data-value') === resourceId,{ resourceId },{ timeout:PANEL_TIMEOUT_MS });
}

async function waitForHTMLFrame(page,frame,timeoutMs) {
  await frame.waitFor({ state:'visible',timeout:timeoutMs });
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-xgc-role="lichtblick-frame"]');
    return element instanceof HTMLIFrameElement && element.contentDocument?.contentType === 'text/html';
  },undefined,{ timeout:timeoutMs });
}

async function waitForAdvancingVideo(page,video,config,timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let previous;
  while (Date.now() < deadline) {
    const currentVideo = await videoSnapshot(video);
    const health = await healthSnapshot(page,config).catch(() => undefined);
    if (previous && health && currentVideo.readyState >= 3
      && currentVideo.width > 0 && currentVideo.height > 0
      && currentVideo.currentTime > previous.video.currentTime + 0.2
      && isCounter(health.bytesReceived) && isCounter(previous.health.bytesReceived)
      && health.bytesReceived > previous.health.bytesReceived
      && health.active === true && health.consumers >= 1 && health.viewers >= 1) {
      return { before:previous,after:{ video:currentVideo,health },advancing:true };
    }
    if (health) previous = { video:currentVideo,health };
    await page.waitForTimeout(1_000);
  }
  throw new Error('odin1 did not provide advancing decoded video and inbound Edge bytes');
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

async function healthSnapshot(page,config) {
  return page.evaluate(async ({ edgeUrl }) => {
    const response = await fetch(`${edgeUrl}/healthz`, {
      cache:'no-store',signal:AbortSignal.timeout(3_000),
    });
    if (!response.ok) throw new Error(`healthz HTTP ${response.status}`);
    const payload = await response.json();
    const source = payload.sources?.find((entry) => entry.id === 'odin1');
    if (!source) throw new Error('healthz has no source odin1');
    return source;
  },{ edgeUrl:config.edgeUrl });
}

async function exactLocator(locator,label) {
  await locator.first().waitFor({ state:'attached',timeout:PANEL_TIMEOUT_MS });
  const count = await locator.count();
  if (count !== 1) throw new Error(`${label} count must equal 1; got ${count}`);
  return locator;
}

async function configuredPanelIds(page,dashboardId,expectedIds,label) {
  const canvas = await exactLocator(page.locator(
    `[data-xgc-role="experiment-dashboard-canvas"][data-xgc-id="${dashboardId}"]`,
  ),`${label} dashboard canvas`);
  await canvas.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  for (const panelId of expectedIds) {
    await exactLocator(canvas.locator(
      `[data-xgc-role="experiment-panel"][data-xgc-id="${panelId}"]`,
    ),`${label} configured panel ${panelId}`);
  }
  await page.waitForTimeout(250);
  return canvas.locator('[data-xgc-role="experiment-panel"]').evaluateAll((elements) => elements.map(
    (element) => element.getAttribute('data-xgc-id') || '',
  ));
}

function isCounter(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
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

function requiredAbsolutePath(name) {
  const value = required(name);
  if (!isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  return value;
}

function assertDistinctPaths(paths) {
  if (new Set(paths).size !== paths.length) throw new Error('input and output evidence paths must be distinct');
}

function assertFreshOutput(path) {
  if (existsSync(path) || existsSync(`${path}.png`)) {
    throw new Error('B2 browser evidence output must not already exist; use a fresh evidence path');
  }
}

function messageOf(cause) {
  return cause instanceof Error ? cause.message : String(cause);
}
