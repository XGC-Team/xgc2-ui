/* global Buffer,console,document,HTMLIFrameElement,process,URL */
import { cameraCalibrationEvidence } from './fleet-camera-calibration-evidence.mjs';
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync,mkdirSync,writeFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import {
  activeSystemRunnerForExperiment,
  assertNoActiveSystemRunner,
  experimentOwnedProcesses,
  getJSON,
  orchestrationRelations,
  orchestrationRun,
  resolveLocalFleetCoreContainer,
  startExperimentThroughUI,
  stopExperimentThroughUI,
  waitFor,
} from './experiment-system-runner-e2e.mjs';
import {
  MANUAL_VIEWER_IDS,
  SEMANTIC_CANVAS_IDS,
  assertLichtblickLayoutOutput,
  assertManualViewerEvidence,
  assertRvizLayoutOutput,
  assertRvizProcessBinding,
  assertSemanticCanvasEvidence,
  assertStopClosure,
  assertTrajectoryProgress,
  assertViewerOptIn,
  assertViewerRunIdentity,
  discoverVisualizationMatrix,
  extractNodeOutput,
  filterVisualizationPlansByMode,
  frozenVisualizationRoster,
  mergeOwnedProcessClosures,
  parseVisualizationModeFilter,
  processInactive,
  processReady,
  rvizGeneratedConfigPath,
} from './local-fleet-visualization-e2e-contract.mjs';
import {
  captureLichtblickFrameDiagnostics,
  installBrowserDiagnostics,
  summarizePixelSamples,
} from './lichtblick-browser-evidence-support.mjs';

const execFile=promisify(execFileCallback);
const requestedModes=parseVisualizationModeFilter(process.env.XGC_VISUALIZATION_E2E_MODES || '');
const configuration={
  webUrl:requiredURL('XGC_VISUALIZATION_E2E_WEB_URL','http://127.0.0.1:5174'),
  evidencePath:required('XGC_VISUALIZATION_E2E_EVIDENCE'),
  coreContainer:await resolveLocalFleetCoreContainer('XGC_VISUALIZATION_E2E_CORE_CONTAINER'),
  waitTimeoutMs:requiredPositiveInteger('XGC_VISUALIZATION_E2E_WAIT_MS',360_000),
  canvasIntervalMs:requiredPositiveInteger('XGC_VISUALIZATION_E2E_CANVAS_INTERVAL_MS',2_000),
  requestedModes,
};

const screenshotDirectory=`${configuration.evidencePath}.screenshots`;
mkdirSync(dirname(configuration.evidencePath),{ recursive:true });
mkdirSync(screenshotDirectory,{ recursive:true });
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || [
  chromium.executablePath(),'/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
  '/usr/bin/chromium','/usr/bin/chromium-browser',
].find((candidate) => candidate && existsSync(candidate));
const browser=await chromium.launch(executablePath ? { executablePath } : {});
const context=await browser.newContext({ viewport:{ width:1600,height:1000 } });
const page=await context.newPage();
const diagnostics=installBrowserDiagnostics(page,{ limit:300 });
const pageErrors=[];
const consoleErrors=[];
let activeCell='preflight';
let phase='preflight';
let currentPlan;
let currentRunId='';
let currentViewerRunIds={};
page.on('pageerror',(error) => pageErrors.push({ cell:activeCell,message:error.message }));
page.on('console',(message) => {
  if (message.type()==='error') {
    consoleErrors.push({ cell:activeCell,phase,message:message.text(),location:message.location() });
  }
});

const report={
  webUrl:configuration.webUrl,coreContainer:configuration.coreContainer,
  acceptance:{
    discovery:'public Robot Experiments with ROS Control and Lichtblick panels; no embedded Experiment IDs',
    lichtblick:'semantic 3D and camera AR WebGL canvases with advancing, distinct pixels',
    rviz:'manual Panel Action plus frozen-roster generated config; process readiness is not display proof',
    trajectory:'per-Robot nav_msgs/Path fresh samples and bounded history rollover, world frame, world-linked TF, z-frame checks',
    recovery:'dashboard page switch and browser refresh restore the same active System Runner',
    stop:'no active Experiment Run, no Run-owned Process, no viewer tile/runtime remains',
  },
  requestedModes:configuration.requestedModes,
  cells:[],pageErrors,consoleErrors,diagnostics,
};

try {
  const experiments=await getJSON(context,configuration.webUrl,'/api/experiments');
  const discoveredPlans=filterVisualizationPlansByMode(
    discoverVisualizationMatrix(experiments),configuration.requestedModes,
  );
  const selectedIds=(process.env.XGC_VISUALIZATION_E2E_EXPERIMENTS || '').split(',').filter(Boolean);
  if(selectedIds.some(id=>!discoveredPlans.some(p=>p.experimentId===id))) throw new Error('Selected visualization experiment is absent');
  const plans=discoveredPlans.filter(p=>!selectedIds.length || selectedIds.includes(p.experimentId));
  report.matrix=plans.map((plan) => ({
    experimentId:plan.experimentId,name:plan.name,runModes:plan.runModes,
    roster:plan.roster.map((robot) => ({
      id:robot.id,kind:robot.kind,namespace:robot.namespace,hybridSource:robot.hybridSource,
    })),
  }));
  await assertNoActiveSystemRunner(context,configuration.webUrl);
  for (const plan of plans) {
    for (const runMode of plan.runModes) {
      activeCell=`${plan.name}/${runMode}`;
      currentPlan=plan;
      try {
        const cell=await runCell(plan,runMode);
        const errors=consoleErrors.filter(entry=>entry.cell===activeCell
          && !(entry.phase==='stopping' && entry.message.startsWith('Player alert ws:connection-failed')));
        if(pageErrors.some(entry=>entry.cell===activeCell) || errors.length) {
          cell.error='Browser errors during visualization: '+JSON.stringify(errors);
        }
        report.cells.push({...cell,status:cell.error?'FAIL':'PASS'});
        console.log(`${cell.error?'FAIL':'PASS'}: ${activeCell} semantic visualization, recovery, trajectory, Stop closure`);
      } catch(error) {
        const failure={experimentId:plan.experimentId,name:plan.name,runMode,status:'FAIL',error:String(error)};
        await page.screenshot({path:join(screenshotDirectory,`${safeName(plan.name)}-${runMode}-failure.png`)}).catch(()=>undefined);
        failure.cleanup=await cleanupCurrentRun();
        report.cells.push(failure);console.error('FAIL',activeCell,error);
        await assertNoActiveSystemRunner(context,configuration.webUrl);
      }
      currentPlan=undefined;
      writeFileSync(configuration.evidencePath,`${JSON.stringify(report,null,2)}\n`);
    }
  }
  writeFileSync(configuration.evidencePath,`${JSON.stringify(report,null,2)}\n`);
  if(report.cells.some(cell=>cell.status!=='PASS')) throw new Error('Visualization matrix contains failed cells');
} catch (cause) {
  const failurePath=`${configuration.evidencePath}.failure`;
  await page.screenshot({ path:`${failurePath}.png`,fullPage:true }).catch(() => undefined);
  const lichtblick=await captureLichtblickFrameDiagnostics(page);
  const cleanup=await cleanupCurrentRun().catch((error) => ({ cleanupError:error.message }));
  writeFileSync(`${failurePath}.json`,`${JSON.stringify({
    ...report,activeCell,currentRunId,error:cause instanceof Error ? cause.message : String(cause),
    url:page.url(),lichtblick,cleanup,
  },null,2)}\n`);
  throw cause;
} finally {
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}

async function runCell(plan,runMode) {
  phase='running';
  currentViewerRunIds={};
  await assertNoActiveSystemRunner(context,configuration.webUrl);
  await openExperimentGCS(plan);
  await selectRunMode(plan.experimentId,runMode);
  await switchDashboard(plan.rosControl.dashboardName);
  const beforeTiles=await waitFor(async () => {
    const tiles=await rosTileSnapshot(plan.rosControl.panelId);
    return tiles.some((tile) => tile.id==='rviz') && tiles.some((tile) => tile.id==='gzclient')
      ? tiles : undefined;
  },30_000,`${activeCell} ROS viewer Panel Actions are absent`);
  const started=await startExperimentThroughUI({
    page,context,webUrl:configuration.webUrl,experiment:plan.experiment,runMode,
  });
  currentRunId=started.run.id;
  const rosPanelRunId=panelWorkflowRunId(
    started.dispatchMembers,plan.rosControl.workflowInstanceId,started.run.id,
  );
  const providers=await waitForVisualizationProviders(currentRunId);
  console.log('Providers ready',activeCell,currentRunId);
  const rosRelations=await orchestrationRelations(context,configuration.webUrl,rosPanelRunId);
  const idleTiles=await waitFor(async () => {
    const tiles=await rosTileSnapshot(plan.rosControl.panelId);
    try {
      assertViewerOptIn({ tiles,relations:rosRelations,runMode });
      return tiles;
    } catch {
      return undefined;
    }
  },configuration.waitTimeoutMs,`${activeCell} viewer Actions were not opt-in`);

  const rvizTile=await startManualViewer(plan.rosControl.panelId,'rviz',{ requireReady:true });
  currentViewerRunIds={ ...currentViewerRunIds,rviz:rvizTile.runId };
  const gzclientTile=await startManualViewer(
    plan.rosControl.panelId,'gzclient',{ requireReady:runMode!=='physical' },
  );
  currentViewerRunIds={ ...currentViewerRunIds,gzclient:gzclientTile.runId };
  const afterViewerTiles=await rosTileSnapshot(plan.rosControl.panelId);
  const viewerRunIds=assertManualViewerEvidence({ before:idleTiles,after:afterViewerTiles,runMode });
  if (viewerRunIds.rviz!==currentViewerRunIds.rviz
    || viewerRunIds.gzclient!==currentViewerRunIds.gzclient) {
    throw new Error(`${activeCell} viewer tile identity changed after its exact start boundary`);
  }
  console.log('Viewers ready',activeCell);
  const rvizArtifacts=await waitForRvizArtifacts(viewerRunIds.rviz,plan.experiment,runMode);
  const ownedWithViewers=await waitFor(async () => {
    const closures=await exactOwnedProcessClosures([
      currentRunId,viewerRunIds.rviz,viewerRunIds.gzclient,
    ]);
    const owned=mergeOwnedProcessClosures(closures);
    const rvizClosure=exactProcessClosure(closures,viewerRunIds.rviz).processes;
    const gazeboClosure=exactProcessClosure(closures,viewerRunIds.gzclient).processes;
    const rviz=rvizClosure.filter((process) => process.definitionId==='rviz' && processReady(process));
    const gazebo=gazeboClosure.filter((process) => process.definitionId==='gazebo-client' && processReady(process));
    if (rviz.length!==1 || (runMode!=='physical' && gazebo.length!==1)) return undefined;
    return { closures,owned,rviz:rviz[0],gazebo:runMode==='physical' ? undefined : gazebo[0] };
  },configuration.waitTimeoutMs,`${activeCell} manual viewer Processes did not become ready`);
  assertRvizProcessBinding(ownedWithViewers.rviz,rvizArtifacts.layout);
  const rvizGeneratedConfigFile=await verifyRvizGeneratedConfigFile(
    ownedWithViewers.rviz,rvizArtifacts.layout,
  );

  console.log('Viewer artifacts ready',activeCell);
  const calibration=await cameraCalibrationEvidence({page,context,webUrl:configuration.webUrl,plan,processes:providers.owned,coreContainer:configuration.coreContainer,screenshotPath:join(screenshotDirectory,`${safeName(plan.name)}-calibration.png`)});
  console.log('Calibration passed',activeCell);
  const lichtblickLayout=await getJSON(
    context,configuration.webUrl,
    `/api/visualization/targets/local/lichtblick/${encodeURIComponent(providers.web.id)}/layout.json`,
  );
  assertLichtblickLayoutOutput(lichtblickLayout,rvizArtifacts.roster,plan.lichtblick.layoutMode);
  await waitForVisualizationPage(plan);
  await page.locator('[data-xgc-role="lichtblick-frame"]').contentFrame().getByText(/Waiting for calibration messages/).waitFor({state:'hidden',timeout:90000});
  console.log('AR calibration ready',activeCell);
  const initialCanvas=await captureSemanticCanvases(3);
  assertSemanticCanvasEvidence(initialCanvas);
  const pathBefore=await sampleRobotPaths(rvizArtifacts.roster);
  console.log('Initial rendered data passed',activeCell);

  await switchDashboard(plan.configDashboard.name);
  const switchedRun=await activeSystemRunnerForExperiment(
    context,configuration.webUrl,plan.experimentId,
  );
  if (switchedRun?.id!==currentRunId) {
    throw new Error(`${activeCell} dashboard switch lost System Runner ${currentRunId}`);
  }
  await switchDashboard(plan.gcsDashboard.name);
  await waitForVisualizationPage(plan);
  await switchDashboard(plan.rosControl.dashboardName);
  const pageSwitchViewerTiles=await waitForViewerRunIdentity(
    plan.rosControl.panelId,viewerRunIds,'dashboard switch',
  );
  await waitForVisualizationPage(plan);
  const pageSwitchCanvas=await captureSemanticCanvases(1);
  assertSemanticCanvasEvidence(pageSwitchCanvas,{ requireMotion:false });

  await page.reload({ waitUntil:'domcontentloaded',timeout:30_000 });
  await waitForExperimentLoaded();
  const refreshedRun=await activeSystemRunnerForExperiment(
    context,configuration.webUrl,plan.experimentId,
  );
  if (refreshedRun?.id!==currentRunId) {
    throw new Error(`${activeCell} refresh lost System Runner ${currentRunId}`);
  }
  await waitForVisualizationPage(plan);
  await switchDashboard(plan.rosControl.dashboardName);
  const refreshViewerTiles=await waitForViewerRunIdentity(
    plan.rosControl.panelId,viewerRunIds,'page refresh',
  );
  await waitForVisualizationPage(plan);
  const refreshCanvas=await captureSemanticCanvases(1);
  assertSemanticCanvasEvidence(refreshCanvas,{ requireMotion:false });
  console.log('Refresh canvases passed',activeCell);
  const pathAfter=await sampleRobotPaths(rvizArtifacts.roster);
  assertTrajectoryProgress(pathBefore,pathAfter,rvizArtifacts.roster);
  console.log('Fresh bounded trajectories passed',activeCell);

  const screenshotPath=join(screenshotDirectory,`${safeName(plan.name)}-${runMode}.png`);
  await page.screenshot({ path:screenshotPath,fullPage:true });
  phase='stopping';
  const stopped=await stopExperimentThroughUI({
    page,context,webUrl:configuration.webUrl,experiment:plan.experiment,
    runId:currentRunId,timeoutMs:configuration.waitTimeoutMs,
  });
  const stoppedProcesses=await waitFor(async () => {
    const closures=await exactOwnedProcessClosures([
      currentRunId,...Object.values(viewerRunIds),
    ]);
    const owned=mergeOwnedProcessClosures(closures);
    return owned.every(processInactive) ? { closures,owned } : undefined;
  },configuration.waitTimeoutMs,`${activeCell} retained Run-owned Processes after Stop`);
  await switchDashboard(plan.rosControl.dashboardName);
  const stoppedTiles=await waitFor(async () => {
    const tiles=await rosTileSnapshot(plan.rosControl.panelId);
    return viewerTilesStopped(tiles) ? tiles : undefined;
  },configuration.waitTimeoutMs,`${activeCell} retained manual viewer tile runtime after Stop`);
  const viewerRuns=await Promise.all(Object.values(viewerRunIds).map((runId) => (
    orchestrationRun(context,configuration.webUrl,runId)
  )));
  const activeRun=await activeSystemRunnerForExperiment(context,configuration.webUrl,plan.experimentId);
  assertStopClosure({ activeRun,processes:stoppedProcesses.owned,tiles:stoppedTiles,viewerRuns });
  const completedRunId=currentRunId;
  currentRunId='';
  currentViewerRunIds={};
  return {
    experimentId:plan.experimentId,name:plan.name,runMode,runId:completedRunId,
    startupLatencyMs:started.latencyMs,
    providerReadinessOnly:providers.owned.map(processEvidence),
    viewerOptIn:{ before:beforeTiles,afterStart:idleTiles,relations:rosRelations },
    manualViewers:{ runIds:viewerRunIds,tiles:afterViewerTiles,
      closures:ownedWithViewers.closures.map(processClosureEvidence),processes:[
      processEvidence(ownedWithViewers.rviz),
      ...(ownedWithViewers.gazebo ? [processEvidence(ownedWithViewers.gazebo)] : []),
    ] },
    calibration,
    rviz:{ ...rvizArtifacts,generatedConfigFile:rvizGeneratedConfigFile },
    lichtblick:{ layout:lichtblickLayout,initialCanvas,pageSwitchCanvas,refreshCanvas },
    trajectory:{ before:pathBefore,after:pathAfter },
    recovery:{
      dashboardSwitchRunId:switchedRun.id,pageSwitchViewerTiles,
      refreshRunId:refreshedRun.id,refreshViewerTiles,
    },
    stop:{ status:stopped.run.status,closures:stoppedProcesses.closures.map(processClosureEvidence),
      processes:stoppedProcesses.owned.map(processEvidence),tiles:stoppedTiles,viewerRuns },
    screenshotPath,
  };
}

async function waitForVisualizationProviders(runId) {
  return waitFor(async () => {
    const owned=await experimentOwnedProcesses(context,configuration.webUrl,runId);
    const web=owned.filter((process) => process.definitionId==='lichtblick-web');
    const scene=owned.filter((process) => process.definitionId==='lichtblick-robot-scene');
    if (web.length!==1 || scene.length!==1 || !processReady(web[0]) || !processReady(scene[0])) {
      return undefined;
    }
    return { owned,web:web[0],scene:scene[0] };
  },configuration.waitTimeoutMs,`${activeCell} visualization providers did not become ready`);
}

async function waitForRvizArtifacts(rvizRunId,experiment,runMode) {
  return waitFor(async () => {
    const invocations=await getJSON(
      context,configuration.webUrl,
      `/api/execution-targets/local/orchestration-runs/${encodeURIComponent(rvizRunId)}/invocations`,
    );
    const robotOutput=extractNodeOutput(invocations,['experiment-robots','experiment-robots-called']);
    const roster=frozenVisualizationRoster(experiment,robotOutput);
    const layout=extractNodeOutput(invocations,'rviz-layout');
    assertRvizLayoutOutput(layout,{ roster,runMode });
    return { runId:rvizRunId,robotOutput,roster,layout };
  },configuration.waitTimeoutMs,`${activeCell} RViz frozen-roster layout output did not pass`);
}

async function verifyRvizGeneratedConfigFile(process,layout) {
  const path=rvizGeneratedConfigPath(layout.config);
  if (process?.parameters?.configPath!==path) {
    throw new Error(`${activeCell} RViz Process path changed before file verification`);
  }
  const [{ stdout:shaOutput },{ stdout:content }]=await Promise.all([
    execFile('docker',['exec',configuration.coreContainer,'sha256sum',path],{
      timeout:30_000,maxBuffer:256*1024,
    }),
    execFile('docker',['exec',configuration.coreContainer,'cat',path],{
      timeout:30_000,maxBuffer:2*1024*1024,
    }),
  ]);
  const digest=String(shaOutput).trim().split(/\s+/,1)[0]||'';
  const expectedDigest=createHash('sha256').update(layout.config).digest('hex');
  if (digest!==expectedDigest || String(content)!==layout.config) {
    throw new Error(`${activeCell} generated RViz config file does not match its immutable layout content`);
  }
  return { path,digest,bytes:Buffer.byteLength(layout.config) };
}

async function openExperimentGCS(plan) {
  await page.goto(
    `${configuration.webUrl}/#/experiments/${encodeURIComponent(plan.experimentId)}/${encodeURIComponent(plan.gcsDashboard.id)}`,
    { waitUntil:'domcontentloaded',timeout:30_000 },
  );
  await waitForExperimentLoaded();
  await page.locator('[data-xgc-role="experiment-topbar-actions"]')
    .waitFor({ state:'visible',timeout:30_000 });
}

async function waitForExperimentLoaded() {
  await page.locator('[data-xgc-role="experiment-state-loading"]')
    .waitFor({ state:'detached',timeout:30_000 }).catch(() => undefined);
}

async function selectRunMode(experimentId,runMode) {
  const root=page.locator(
    `[data-xgc-role="experiment-run-mode-select"][data-xgc-id="${experimentId}"]`,
  );
  await root.waitFor({ state:'visible',timeout:30_000 });
  if (await root.getAttribute('data-disabled')==='true') {
    throw new Error(`${activeCell} run mode selector is disabled`);
  }
  await root.getByRole('button').click({ timeout:30_000 });
  await page.getByRole('option',{ name:runMode,exact:true }).click({ timeout:30_000 });
  await page.locator(
    `[data-xgc-role="experiment-run-mode"][data-xgc-id="${experimentId}"][data-xgc-value="${runMode}"]`,
  ).waitFor({ state:'visible',timeout:30_000 });
}

async function switchDashboard(name) {
  const tab=page.getByRole('tab',{ name,exact:true });
  await tab.waitFor({ state:'visible',timeout:30_000 });
  await tab.click({ timeout:30_000 });
  await waitFor(async () => await tab.getAttribute('aria-selected')==='true' ? true : undefined,
    30_000,`${activeCell} dashboard ${name} was not selected`);
}

async function waitForVisualizationPage(plan) {
  const tab=page.getByRole('tab',{ name:plan.gcsDashboard.name,exact:true });
  await tab.waitFor({ state:'visible',timeout:30_000 });
  if (await tab.getAttribute('aria-selected')!=='true') await tab.click({ timeout:30_000 });
  const frame=page.locator('[data-xgc-role="lichtblick-frame"]');
  await frame.waitFor({ state:'visible',timeout:90_000 });
  await page.waitForFunction(({ threeD,cameraAR }) => {
    const element=document.querySelector('[data-xgc-role="lichtblick-frame"]');
    if (!(element instanceof HTMLIFrameElement) || !element.contentDocument) return false;
    return [threeD,cameraAR].every((panelId) => {
      const roots=[...element.contentDocument.querySelectorAll('[data-testid]')]
        .filter((candidate) => candidate.getAttribute('data-testid')?.includes(panelId));
      return roots.some((root) => [...root.querySelectorAll('canvas')].some((canvas) => {
        const bounds=canvas.getBoundingClientRect();
        return bounds.width>=200 && bounds.height>=120;
      }));
    });
  },SEMANTIC_CANVAS_IDS,{ timeout:90_000 });
}

async function captureSemanticCanvases(sampleCount) {
  const frame=page.locator('[data-xgc-role="lichtblick-frame"]');
  const result={};
  for (const [role,panelId] of Object.entries(SEMANTIC_CANVAS_IDS)) {
    const canvas=frame.contentFrame().locator(`[data-testid*="${panelId}"] canvas`).first();
    await canvas.waitFor({ state:'visible',timeout:30_000 });
    const bounds=await waitFor(async()=>canvas.boundingBox().then(bounds=>bounds ?? undefined),10000,`${activeCell} ${role} canvas has no layout bounds`);
    const metadata=await canvas.evaluate((element) => ({
      pixelWidth:element.width,pixelHeight:element.height,
      webgl:Boolean(element.getContext('webgl2') || element.getContext('webgl')),
    }));
    const samples=[];
    for (let index=0;index<sampleCount;index+=1) {
      const screenshot=await canvas.screenshot();
      samples.push({ elapsedMs:index*configuration.canvasIntervalMs,bytes:screenshot.length,hash:sha256(screenshot) });
      if (index+1<sampleCount) await page.waitForTimeout(configuration.canvasIntervalMs);
    }
    result[role]={
      panelId,width:Math.round(bounds.width),height:Math.round(bounds.height),...metadata,
      ...summarizePixelSamples(samples,{ minimumTransitions:1,minimumUniqueHashes:2 }),
    };
  }
  return result;
}

async function startManualViewer(panelId,serviceId,{ requireReady }) {
  const control=page.locator(
    `[data-xgc-role="ros-basic-services-controls-view"][data-xgc-id="${panelId}"] `
    + `[data-xgc-role="ros-basic-service-control"][data-xgc-id="${panelId}:${serviceId}"]`,
  );
  await control.waitFor({ state:'visible',timeout:30_000 });
  const [response]=await Promise.all([
    page.waitForResponse(r=>r.request().method()==='POST' && new URL(r.url()).pathname==='/api/execution-targets/local/orchestration-runs'),
    control.click({ timeout:30_000 }),
  ]);
  if(response.status()!==202) throw new Error(`${serviceId} Action rejected: ${await response.text()}`);
  console.log('Viewer Action accepted',activeCell,serviceId);
  return waitFor(async () => {
    const tile=(await rosTileSnapshot(panelId)).find((candidate) => candidate.id===serviceId);
    if (!tile?.runId) return undefined;
    if (requireReady) {
      return tile.status==='ready' && tile.percent===100 && tile.running==='true' ? tile : undefined;
    }
    return ['accepted','queued','waiting','starting','running','ready'].includes(tile.status)
      ? tile : undefined;
  },configuration.waitTimeoutMs,`${activeCell} manual ${serviceId} Panel Action did not start`);
}

async function rosTileSnapshot(panelId) {
  return page.locator(
    `[data-xgc-role="ros-basic-services-controls-view"][data-xgc-id="${panelId}"] `
    + '[data-xgc-role="ros-basic-service-control"]',
  ).evaluateAll((elements) => elements.map((element) => ({
    id:(element.getAttribute('data-xgc-id') || '').split(':').at(-1),
    status:element.getAttribute('data-xgc-status') || '',
    percent:Number(element.getAttribute('data-xgc-progress') || 0),
    runId:element.getAttribute('data-xgc-run-id') || '',
    running:element.getAttribute('data-xgc-running') || '',
  })));
}

async function waitForViewerRunIdentity(panelId,expectedRunIds,recoveryStep) {
  return waitFor(async () => {
    const tiles=await rosTileSnapshot(panelId);
    assertViewerRunIdentity(tiles,expectedRunIds);
    return tiles;
  },configuration.waitTimeoutMs,`${activeCell} ${recoveryStep} replaced a manual viewer Run`);
}

function viewerTilesStopped(tiles) {
  return MANUAL_VIEWER_IDS.every((serviceId) => {
    const tile=tiles.find((candidate) => candidate.id===serviceId);
    return tile && !tile.runId && tile.percent===0 && tile.running!=='true'
      && (!tile.status || tile.status==='idle');
  });
}

async function sampleRobotPaths(roster) {
  const sampleInput=roster.map((robot) => ({
    slotId:robot.slotId,topic:robot.pathTopic,sceneModel:robot.sceneModel,
  }));
  const { stdout }=await execFile('docker',[
    'exec','-e','ROS_MASTER_URI=http://127.0.0.1:11311',
    '-e','PYTHONPATH=/opt/ros/noetic/lib/python3/dist-packages',
    configuration.coreContainer,'python3','-c',robotPathSampleProgram(),JSON.stringify(sampleInput),
  ],{ timeout:180_000,maxBuffer:2*1024*1024 });
  const samples=JSON.parse(stdout.trim());
  if (!Array.isArray(samples) || samples.length!==roster.length) {
    throw new Error(`${activeCell} ROS Path sample is incomplete: ${stdout}`);
  }
  return samples;
}

function robotPathSampleProgram() {
  return String.raw`
import json,sys,time
import rospy
from nav_msgs.msg import Path
from tf2_msgs.msg import TFMessage

robots=json.loads(sys.argv[1])
rospy.init_node('xgc2_visualization_e2e_sample',anonymous=True,disable_signals=True)
transforms=[]

def normalize(value):
    return str(value or '').strip().strip('/')

def collect(message):
    for transform in message.transforms:
        transforms.append({
          'parent':normalize(transform.header.frame_id),
          'child':normalize(transform.child_frame_id),
          'stamp':transform.header.stamp.to_sec(),
        })
        if len(transforms) > 10000:
            del transforms[:1000]

subscribers=[
  rospy.Subscriber('/xgc/tf',TFMessage,collect,queue_size=100),
  rospy.Subscriber('/tf',TFMessage,collect,queue_size=100),
  rospy.Subscriber('/tf_static',TFMessage,collect,queue_size=100),
]
published=dict(rospy.get_published_topics())
messages=[]
for robot in robots:
    message=rospy.wait_for_message(robot['topic'],Path,timeout=30.0)
    frames=[normalize(pose.header.frame_id) for pose in message.poses]
    points=[pose.pose.position for pose in message.poses]
    stamps=[pose.header.stamp.to_sec() for pose in message.poses if pose.header.stamp.to_sec() > 0]
    if message.header.stamp.to_sec() > 0:
        stamps.append(message.header.stamp.to_sec())
    messages.append({
      'slotId':robot['slotId'],'topic':robot['topic'],
      'messageType':published.get(robot['topic'],''),
      'frameId':normalize(message.header.frame_id),
      'poseFramesWorld':all(not frame or frame=='world' for frame in frames),
      'pointCount':len(points),'latestStamp':max(stamps) if stamps else 0.0,
      'oldestStamp':min(stamps) if stamps else 0.0,
      'minZ':min([point.z for point in points]) if points else float('nan'),
      'maxZ':max([point.z for point in points]) if points else float('nan'),
      'sceneModel':robot['sceneModel'],
    })

def reachable_frames():
    children={}
    for item in transforms:
        children.setdefault(item['parent'],set()).add(item['child'])
    reachable={'world'}
    pending=['world']
    while pending:
        parent=pending.pop()
        for child in children.get(parent,set()):
            if child not in reachable:
                reachable.add(child)
                pending.append(child)
    return reachable

def model_frames(reachable,model):
    return [frame for frame in reachable if frame==model or frame.startswith(model+'/')]

deadline=time.time()+15.0
while time.time() < deadline and not rospy.is_shutdown():
    reachable=reachable_frames()
    if all(model_frames(reachable,normalize(robot['sceneModel'])) for robot in robots):
        break
    rospy.sleep(0.1)

reachable=reachable_frames()
for message in messages:
    model=normalize(message.pop('sceneModel'))
    linked=model_frames(reachable,model)
    linked_stamps=[item['stamp'] for item in transforms if item['child'] in linked]
    message['tfWorldLinked']=len(linked)>0
    message['tfTransformCount']=len(linked)
    message['tfLatestStamp']=max(linked_stamps) if linked_stamps else 0.0

print(json.dumps(messages,separators=(',',':'),allow_nan=False))
`;
}

function panelWorkflowRunId(dispatchMembers,workflowInstanceId,rootRunId) {
  const member=(dispatchMembers || []).find((item) => item.itemKey===workflowInstanceId);
  if (!member?.childRunId || member.childRunId===rootRunId) {
    throw new Error(`${activeCell} did not dispatch ${workflowInstanceId} as a child Run`);
  }
  return member.childRunId;
}

async function cleanupCurrentRun() {
  if (!currentRunId || !currentPlan) return { attempted:false };
  const result={ attempted:true,runId:currentRunId };
  try {
    phase='stopping';
  const stopped=await stopExperimentThroughUI({
      page,context,webUrl:configuration.webUrl,experiment:currentPlan.experiment,
      runId:currentRunId,timeoutMs:configuration.waitTimeoutMs,
    });
    result.status=stopped.run.status;
  } finally {
    const processes=await waitFor(async () => {
      const closures=await exactOwnedProcessClosures([
        currentRunId,...Object.values(currentViewerRunIds),
      ]);
      const owned=mergeOwnedProcessClosures(closures);
      return owned.every(processInactive) ? { closures,owned } : undefined;
    },configuration.waitTimeoutMs,`${activeCell} cleanup retained Run-owned Processes`);
    result.closures=processes.closures.map(processClosureEvidence);
    result.processes=processes.owned.map(processEvidence);
    currentRunId='';
    currentViewerRunIds={};
  }
  return result;
}

async function exactOwnedProcessClosures(rootRunIds) {
  const roots=[...new Set(rootRunIds.map((runId) => String(runId||'').trim()).filter(Boolean))];
  if (roots.length===0) throw new Error(`${activeCell} has no exact Process ownership roots`);
  return Promise.all(roots.map(async (rootRunId) => ({
    rootRunId,targetId:'local',
    processes:await experimentOwnedProcesses(context,configuration.webUrl,rootRunId),
  })));
}

function exactProcessClosure(closures,rootRunId) {
  const matches=closures.filter((closure) => closure.rootRunId===rootRunId);
  if (matches.length!==1) throw new Error(`${activeCell} has no exact Process closure for Run ${rootRunId}`);
  return matches[0];
}

function processClosureEvidence(closure) {
  return {
    rootRunId:closure.rootRunId,targetId:closure.targetId,
    processes:closure.processes.map(processEvidence),
  };
}

function processEvidence(process) {
  return {
    id:process?.id,targetId:process?.targetId,ownerId:process?.ownerId,
    definitionId:process?.definitionId,desiredState:process?.desiredState,
    observedState:process?.observedState,readiness:process?.readiness?.status,
    liveness:process?.liveness?.status,handle:process?.handle??null,parameters:process?.parameters,
  };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function safeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

function required(name,fallback) {
  const value=process.env[name]?.trim() || fallback;
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredURL(name,fallback) {
  const parsed=new URL(required(name,fallback));
  if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password
    || parsed.pathname!=='/' || parsed.search || parsed.hash) {
    throw new Error(`${name} must be an HTTP origin`);
  }
  return parsed.origin;
}

function requiredPositiveInteger(name,fallback) {
  const value=Number.parseInt(required(name,String(fallback)),10);
  if (!Number.isSafeInteger(value) || value<1) throw new Error(`${name} must be a positive integer`);
  return value;
}
