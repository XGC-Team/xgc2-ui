/* global console,process,URL,setTimeout,document,performance */
import { execFile as execFileCallback } from 'node:child_process';
import { appendFileSync,existsSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import {
  captureAutomationPanelFailure,
  observeAutomationCatalogRequests,
} from './automation-catalog-browser-evidence.mjs';
import {
  SYSTEM_EXPERIMENT_RUNNER,
  assertNoActiveSystemRunner,
  clickAndWaitForPageResponse,
  experimentOwnedProcesses,
  experimentSessions,
  orchestrationRun,
  orchestrationRelations,
  resolveLocalFleetCoreContainer,
  resolveManagedFixture,
  startExperimentThroughUI,
  stopExperimentThroughUI,
  waitFor,
} from './experiment-system-runner-e2e.mjs';

const execFile=promisify(execFileCallback);
const laneKey=required('XGC_PAPER_MISSION_LANE');
const lane=laneDefinition(laneKey);
if (process.env.XGC_PAPER_MISSION_SAMPLE_SECONDS) {
  const seconds=Number(process.env.XGC_PAPER_MISSION_SAMPLE_SECONDS);
  if (!Number.isInteger(seconds) || seconds<lane.sampleSeconds || seconds>1800) {
    throw new Error('XGC_PAPER_MISSION_SAMPLE_SECONDS must be an integer between the lane minimum and 1800');
  }
  lane.sampleSeconds=seconds;
}
const configuration={
  webUrl:requiredURL('XGC_PAPER_MISSION_WEB_URL','http://127.0.0.1:5174'),
  evidencePath:required('XGC_PAPER_MISSION_EVIDENCE'),
  coreContainer:await resolveLocalFleetCoreContainer('XGC_PAPER_MISSION_CORE_CONTAINER'),
  renderVisualization:process.env.XGC_PAPER_MISSION_RENDER_VISUALIZATION==='1',
  readyStopOnly:process.env.XGC_PAPER_MISSION_READY_STOP_ONLY==='1',
  finishAtHover:process.env.XGC_PAPER_MISSION_FINISH_AT_HOVER==='1',
};
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || [
  chromium.executablePath(),'/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
  '/usr/bin/chromium','/usr/bin/chromium-browser',
].find((candidate) => candidate && existsSync(candidate));

mkdirSync(dirname(configuration.evidencePath),{ recursive:true });
const browser=await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless:true,
  ...(configuration.renderVisualization ? { args:['--enable-gpu','--use-angle=gl'] } : {}),
});
const context=await browser.newContext({
  viewport:{ width:1600,height:1000 },
  ...(configuration.renderVisualization ? {
    recordVideo:{ dir:`${configuration.evidencePath}.videos`,size:{ width:1600,height:1000 } },
  } : {}),
});
if (!configuration.renderVisualization) {
  await context.route(/\/api\/visualization\/targets\/[^/]+\/lichtblick\//,(route) => route.fulfill({
    status:200,contentType:'text/html',
    body:'<!doctype html><title>Lichtblick rendering omitted from control E2E</title>',
  }));
}
const page=await context.newPage();
const report={
  schemaVersion:1,lane:lane.key,startedAt:new Date().toISOString(),pageErrors:[],consoleErrors:[],
  visualizationRendering:configuration.renderVisualization ? 'browser' : 'backend-contract-only',
};
let experiment;
let experimentRunId='';
let safetyCommandSent=false;
let scoutObserver;
page.on('pageerror',(error) => report.pageErrors.push(error.message));
page.on('console',(message) => {
  if (message.type()==='error') report.consoleErrors.push({ message:message.text(),location:message.location() });
});
observeAutomationCatalogRequests(page,report);

try {
  if (configuration.renderVisualization) {
    report.graphics=await page.evaluate(() => {
      const gl=document.createElement('canvas').getContext('webgl');
      const info=gl?.getExtension('WEBGL_debug_renderer_info');
      return { renderer:gl && info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '' };
    });
    if (!report.graphics.renderer || /swiftshader|llvmpipe|softpipe/i.test(report.graphics.renderer)) {
      throw new Error(`Rendered mission E2E requires hardware WebGL: ${report.graphics.renderer || 'unavailable'}`);
    }
  }
  experiment=await resolveManagedFixture(context,configuration.webUrl,{
    key:lane.fixtureKey,name:lane.experimentName,
  });
  await assertNoActiveSystemRunner(context,configuration.webUrl);
  await openExperiment();
  await selectSimulation();
  await selectDashboard('GCS');
  const started=await startExperimentThroughUI({
    page,context,webUrl:configuration.webUrl,experiment,runMode:'simulation',timeoutMs:30_000,
    onAccepted:(accepted) => {
      experimentRunId=accepted.id;
      report.experiment={ resourceId:experiment.head.resourceId,runId:experimentRunId };
    },
  });
  report.experiment.startupLatencyMs=started.latencyMs;
  const foundation=await waitForFoundation();
  report.foundation=foundation.map(processEvidence);
  await assertGCS();
  await assertGCSAlgorithmPanels();
  await selectDashboard('Algorithm');
  await assertBuildPanel();
  report.build=await runBuildPanel();
  await selectDashboard('GCS');
  {
    const { stdout }=await execFile('docker',['exec',configuration.coreContainer,'ps','-eo','args=']);
    const unexpected=stdout.split('\n').filter((line) => line.includes('/user-project-build/ros1_ws/devel/lib/formation_generator/drone_mpc_acados'));
    if (unexpected.length) throw new Error('Total Run started the algorithm before the Algorithm tile was clicked');
    report.algorithmBeforeClick={ plannerCount:0 };
  }
  const algorithm=await runAlgorithmPanel();
  report.algorithm=algorithm;
  report.algorithmReady=await waitForAlgorithmWorkflowReady(algorithm.rootRunId);
  report.residency=[await assertAlgorithmResident(algorithm.rootRunId,'ready')];
  if (configuration.renderVisualization) report.tabRoundTrips=await assertDashboardTabRoundTrips();
  if (!configuration.readyStopOnly) {
    report.activation=[];
    if (lane.key==='ugv4') {
      report.reset={ status:'NOT_TESTED',reason:'User deferred Reset; vehicles start at the frozen experiment initialPose.' };
      scoutObserver=startScoutMissionObserver();
      report.scoutObserver=await scoutObserver.wait('observer-ready',30_000);
      report.initialPlacement=report.scoutObserver.initialPlacement;
    }
    for (const action of lane.activationActions) {
      report.activation.push(await invokeMissionAction(action));
      report.residency.push(await assertAlgorithmResident(algorithm.rootRunId,`after-${action}`));
      if (action==='takeoff') report.hover=await waitForUAVHover();
    }
    if (lane.key==='ugv4') report.trackingStart=await scoutObserver.wait('tracking-started',30_000);
    const motion=lane.key==='ugv4'
      ? await scoutObserver.wait('lap-complete',Math.max(300_000,report.scoutObserver.lapDurationSeconds*5_000))
      : await sampleMotion();
    report.motion=motion;
    // Stop from the UI as soon as the ROS-time lap completes. Metadata reads
    // and screenshots must not silently extend the moving part of the trial.
    if (lane.key==='uav6') {
      report.hoverStop=await invokeMissionAction('stop');
      report.stoppedHover=await waitForUAVHover(false);
      report.residency.push(await assertAlgorithmResident(algorithm.rootRunId,'after-stop'));
    }
    if (lane.key==='uav6' && configuration.finishAtHover) {
      safetyCommandSent=true;
      report.safeState={status:'NOT_TESTED',reason:'Algorithm trial ends at confirmed Hover; landing excluded.'};
    } else {
    const command=await invokeMissionAction(lane.safeAction);
    safetyCommandSent=true;
    report.safeCommand=command;
    report.residency.push(await assertAlgorithmResident(algorithm.rootRunId,`after-${lane.safeAction}`));
    const safe=await sampleSafeState();
    assertSafeState(safe);
    report.safeState=safe;
    }
    if (lane.key==='ugv4') Object.assign(motion,await sampleVisualizationFacts());
    assertMotion(motion);
    report.visualization=assertVisualizationAllowlist(foundation);
    await page.screenshot({ path:`${configuration.evidencePath}.safe.png`,fullPage:true });
  }

  {
    const algorithmButton=page.locator(missionActionSelector('custom1'));
    if (await algorithmButton.isDisabled()) throw new Error('Running Algorithm tile is disabled');
    await algorithmButton.click();
    await waitFor(async () => await algorithmButton.getAttribute('data-xgc-status')==='stopped'
      && await algorithmButton.getAttribute('data-xgc-progress')==='0'
      && !await algorithmButton.isDisabled() ? true : undefined,60_000,'Algorithm tile did not stop its service');
    report.algorithmToggleStop={ status:await algorithmButton.getAttribute('data-xgc-status'),progress:await algorithmButton.getAttribute('data-xgc-progress'),enabled:!await algorithmButton.isDisabled() };
    await algorithmButton.screenshot({ path:`${configuration.evidencePath}.algorithm-toggle-stop.png` });
    report.algorithmToggleProcessesAfterStop=await waitForUserProjectProcessesToExit();
  }
  report.stop=await stopExperimentThroughUI({
    page,context,webUrl:configuration.webUrl,experiment,runId:experimentRunId,timeoutMs:240_000,
  });
  experimentRunId='';
  report.userProjectProcessesAfterStop=await waitForUserProjectProcessesToExit();
  report.outcome='PASS';
  console.log(`PASS: ${lane.label} ${configuration.finishAtHover ? 'algorithm trial to Hover (landing excluded)' : 'paper mission'} through platform UI; evidence: ${configuration.evidencePath}`);
} catch (cause) {
  report.outcome='FAIL';
  report.failure=cause instanceof Error ? cause.message : String(cause);
  // Persist the first cause before screenshots or cleanup can encounter a
  // secondary browser-state failure.
  writeFileSync(configuration.evidencePath,`${JSON.stringify(report,null,2)}\n`);
  report.automationPanelFailure=await Promise.race([
    captureAutomationPanelFailure(page).catch((error) => ({ error:String(error) })),
    new Promise((resolve) => setTimeout(() => resolve({ error:'Browser diagnostic snapshot timed out' }),1000)),
  ]);
  writeFileSync(configuration.evidencePath,`${JSON.stringify(report,null,2)}\n`);
  await page.screenshot({ path:`${configuration.evidencePath}.failure.png`,fullPage:true }).catch(() => undefined);
  throw cause;
} finally {
  if (experimentRunId) {
    if (!safetyCommandSent) await publishEmergencySafetyCommand().catch(() => undefined);
    await stopVisibleExperiment().catch(() => undefined);
  }
  scoutObserver?.close();
  report.finishedAt=new Date().toISOString();
  writeFileSync(configuration.evidencePath,`${JSON.stringify(report,null,2)}\n`);
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}

async function openExperiment() {
  await page.goto(`${configuration.webUrl}/#/experiments/${experiment.head.resourceId}`,{
    waitUntil:'domcontentloaded',timeout:30_000,
  });
  await page.locator('[data-xgc-role="experiment-topbar-actions"]').waitFor({ state:'visible',timeout:30_000 });
}

async function selectSimulation() {
  const id=experiment.head.resourceId;
  const root=page.locator(`[data-xgc-role="experiment-run-mode-select"][data-xgc-id="${id}"]`);
  await root.waitFor({ state:'visible',timeout:30_000 });
  await root.getByRole('button').click();
  await page.getByRole('option',{ name:'simulation',exact:true }).click();
  await page.locator(`[data-xgc-role="experiment-run-mode"][data-xgc-id="${id}"][data-xgc-value="simulation"]`)
    .waitFor({ state:'visible',timeout:30_000 });
}

async function selectDashboard(name) {
  const tab=page.getByRole('tab',{ name,exact:true });
  await tab.waitFor({ state:'visible',timeout:30_000 });
  if (await tab.getAttribute('aria-selected')!=='true') await tab.click();
}

async function waitForFoundation() {
  return waitFor(async () => {
    const owned=await experimentOwnedProcesses(context,configuration.webUrl,experimentRunId);
    for (const requirement of lane.foundation) {
      const matches=owned.filter((item) => item.definitionId===requirement.definitionId);
      if (matches.length!==requirement.count || !matches.every(processReady)) return undefined;
    }
    return owned;
  },360_000,`${lane.label} platform Process closure did not become ready`);
}

async function assertGCS() {
  for (const id of ['robot-instruments','robot-control','lichtblick']) {
    await page.locator(`[data-xgc-role="experiment-panel"][data-xgc-id="${id}"]`)
      .waitFor({ state:'visible',timeout:30_000 });
  }
  await page.locator('[data-xgc-role="robot-control-panel-view"]').first()
    .waitFor({ state:'visible',timeout:30_000 });
}

async function assertGCSAlgorithmPanels() {
  await page.locator(`[data-xgc-role="automation-workflow-action-grid"][data-xgc-id="${lane.algorithmPanel}"]`)
    .waitFor({ state:'visible',timeout:30_000 });
  for (const action of lane.missionActions) {
    await page.locator(missionActionSelector(action)).waitFor({ state:'visible',timeout:30_000 });
  }
}

async function assertBuildPanel() {
  await page.locator('[data-xgc-role="automation-workflow-action-grid"][data-xgc-id="paper-leader-build"]')
    .waitFor({ state:'visible',timeout:30_000 });
}

async function runAlgorithmPanel() {
  const selector=missionActionSelector('custom1');
  const response=await clickAndWaitForPageResponse(page,{
    timeoutMs:30_000,
    match:(candidate) => requestMatchesPanel(candidate,'run-panel',lane.algorithmPanel,''),
    click:() => page.locator(selector).click({ timeout:30_000 }),
  });
  const body=await responseJSON(response);
  if (response.status()!==202 || !body?.run) {
    throw new Error(`Algorithm Panel HTTP ${response.status()}: ${JSON.stringify(body)}`);
  }
  return { request:response.request().postDataJSON(),rootRunId:body.run.id,status:body.run.status };
}

async function runBuildPanel() {
  const panelId='paper-leader-build';
  const response=await clickAndWaitForPageResponse(page,{
    timeoutMs:30_000,
    match:(candidate) => requestMatchesPanel(candidate,'run-panel',panelId,''),
    click:() => page.locator(`[data-xgc-role="panel-workflow-run"][data-xgc-id="${panelId}"]`)
      .click({ timeout:30_000 }),
  });
  const body=await responseJSON(response);
  if (response.status()!==202 || !body?.run) {
    throw new Error(`Build Panel HTTP ${response.status()}: ${JSON.stringify(body)}`);
  }
  const child=await waitFor(async () => {
    const relations=await orchestrationRelations(context,configuration.webUrl,body.run.id);
    const children=relations.childRuns ?? [];
    if (children.length>1) throw new Error(`Build Panel dispatched ${children.length} children`);
    if (children.length!==1) return undefined;
    const run=await orchestrationRun(context,configuration.webUrl,children[0].childRunId);
    return activeStatus(run.status) ? undefined : run;
  },3_600_000,'paper-leader Build child did not become terminal',500);
  if (child.status!=='succeeded') {
    throw new Error(`paper-leader Build ended ${child.status}: ${child.primaryError || child.reason || 'unknown error'}`);
  }
  return {
    request:response.request().postDataJSON(),rootRunId:body.run.id,
    childRunId:child.id,childStatus:child.status,
  };
}

async function waitForAlgorithmWorkflowReady(rootRunId) {
  return waitFor(async () => {
    const relations=await orchestrationRelations(context,configuration.webUrl,rootRunId);
    const children=relations.childRuns ?? [];
    if (children.length>1) throw new Error(`${lane.label} Algorithm Panel dispatched ${children.length} children`);
    if (children.length!==1) return undefined;
    const child=await orchestrationRun(context,configuration.webUrl,children[0].childRunId);
    if (!activeStatus(child.status)) {
      throw new Error(
        `${lane.label} Algorithm Workflow ended ${child.status}: `
        + `${child.primaryError || child.reason || 'unknown error'}`,
      );
    }
    const recorders=(await experimentOwnedProcesses(context,configuration.webUrl,rootRunId))
      .filter((item) => item.definitionId==='rosbag-record-selected');
    if (recorders.length>1) throw new Error(`${lane.label} Algorithm Workflow owns ${recorders.length} recorders`);
    if (recorders.length!==1 || !processReady(recorders[0])) return undefined;
    let manifest;
    try { manifest=JSON.parse(recorders[0].parameters?.sessionManifestJson ?? ''); } catch { return undefined; }
    if (manifest.topicPreset!==lane.fixtureKey) {
      throw new Error(
        `${lane.label} recorder topic preset is ${JSON.stringify(manifest.topicPreset)}, expected ${lane.fixtureKey}`,
      );
    }
    return { workflowRunId:child.id,workflowStatus:child.status,recorder:processEvidence(recorders[0]) };
  },210_000,`${lane.label} Workflow did not pass its algorithm READY gate and start the scientific recorder`);
}

async function assertDashboardTabRoundTrips() {
  const selector='[data-xgc-role="lichtblick-frame"][data-xgc-id="lichtblick"]';
  const iframe=page.locator(selector);
  await iframe.waitFor({ state:'visible',timeout:30_000 });
  const original=await iframe.elementHandle();
  const frame=await original.contentFrame();
  await frame.waitForLoadState('domcontentloaded');
  const before={ url:frame.url(),timeOrigin:await frame.evaluate(() => performance.timeOrigin) };
  await page.screenshot({ path:`${configuration.evidencePath}.before-tab-switch.png`,fullPage:true });
  for (let index=0;index<3;index++) {
    await page.locator('[data-xgc-role="experiment-dashboard-tab-control"][data-xgc-id="algorithm"]').click();
    if (!await original.evaluate((element) => element.isConnected)) throw new Error('Switching tabs destroyed Lichtblick iframe');
    await page.waitForTimeout(800);
    await page.locator('[data-xgc-role="experiment-dashboard-tab-control"][data-xgc-id="gcs"]').click();
    await iframe.waitFor({ state:'visible' });
    if (!await iframe.evaluate((element,previous) => element===previous,original)) throw new Error('Returning to GCS replaced Lichtblick iframe');
    await page.waitForTimeout(800);
  }
  const after={ url:frame.url(),timeOrigin:await frame.evaluate(() => performance.timeOrigin),
    waitingForCalibration:await frame.getByText(/Waiting for calibration messages/i).count() };
  if (before.timeOrigin!==after.timeOrigin) throw new Error('Tab round trip reloaded Lichtblick document');
  if (after.waitingForCalibration>0) throw new Error('Tab round trip lost camera calibration');
  await page.screenshot({ path:`${configuration.evidencePath}.after-tab-switch.png`,fullPage:true });
  return { cycles:3,sameIframe:true,before,after };
}

async function assertAlgorithmResident(rootRunId,phase) {
  const stop=page.locator(`[data-xgc-role="panel-workflow-stop"][data-xgc-id="${lane.algorithmPanel}"]`);
  await stop.waitFor({ state:'visible',timeout:30_000 });
  const run=page.locator(`[data-xgc-role="panel-workflow-run"][data-xgc-id="${lane.algorithmPanel}"]`);
  if (await run.isVisible().catch(() => false)) {
    throw new Error(`${lane.label} Algorithm Panel returned to Run during ${phase}`);
  }
  const relations=await orchestrationRelations(context,configuration.webUrl,rootRunId);
  const children=relations.childRuns ?? [];
  if (children.length!==1) throw new Error(`${lane.label} Algorithm Panel has ${children.length} resident children`);
  const child=await orchestrationRun(context,configuration.webUrl,children[0].childRunId);
  if (!activeStatus(child.status)) throw new Error(`${lane.label} Algorithm Workflow ended ${child.status} during ${phase}`);
  const { stdout }=await execFile('docker',['exec',configuration.coreContainer,'ps','-eo','pid=,ppid=,args='],{
    timeout:10_000,maxBuffer:512*1024,
  });
  const planners=stdout.split('\n').map((line) => line.trim()).filter((line) => (
    line.includes('/user-project-build/ros1_ws/devel/lib/formation_generator/drone_mpc_acados')
  ));
  if (planners.length!==lane.robotCount) {
    throw new Error(`${lane.label} has ${planners.length} resident DMPC planners during ${phase}`);
  }
  let tile;
  {
    const button=page.locator(missionActionSelector('custom1'));
    await waitFor(async () => await button.getAttribute('data-xgc-status')==='running' && await button.getAttribute('data-xgc-progress')==='100' ? true : undefined,30_000,'Algorithm tile did not stay running');
    if (await button.isDisabled()) throw new Error('Running Algorithm tile is disabled');
    tile=await button.evaluate((element) => ({ status:element.getAttribute('data-xgc-status'),progress:element.querySelector('.xgc-progress-fill')?.getAttribute('style') }));
    await button.screenshot({ path:`${configuration.evidencePath}.algorithm-${phase}.png` });
  }
  return { phase,workflowRunId:child.id,workflowStatus:child.status,plannerCount:planners.length,tile };
}

async function waitForUAVHover(takeoff=true) {
  const { stdout }=await execFile('docker',[
    'exec','-e','ROS_MASTER_URI=http://127.0.0.1:11311',
    '-e','PYTHONPATH=/opt/ros/noetic/lib/python3/dist-packages',
    configuration.coreContainer,'python3','-c',uavHoverProgram(),String(lane.robotCount),takeoff ? 'takeoff' : 'stop',
  ],{ timeout:210_000,maxBuffer:256*1024 });
  return JSON.parse(stdout.trim());
}

async function invokeMissionAction(action) {
  const selector=missionActionSelector(action);
  await waitFor(async () => {
    const button=page.locator(selector);
    if (!await button.isVisible()) return undefined;
    if (await button.isDisabled()) {
      throw new Error(await button.getAttribute('title') || 'Action disabled without an explanation');
    }
    return true;
  },30_000,`${lane.label} mission Action ${action} did not become invokable`);
  const response=await clickAndWaitForPageResponse(page,{
    timeoutMs:30_000,
    match:(candidate) => requestMatchesPanel(candidate,'invoke-panel-action',lane.algorithmPanel,action),
    click:() => page.locator(selector).click({ timeout:30_000 }),
  });
  const body=await responseJSON(response);
  if (response.status()!==202 || !body?.run) {
    throw new Error(`Mission Action ${action} HTTP ${response.status()}: ${JSON.stringify(body)}`);
  }
  const terminal=await waitFor(async () => {
    const run=await orchestrationRun(context,configuration.webUrl,body.run.id);
    return activeStatus(run.status) ? undefined : run;
  },60_000,`${lane.label} mission Action ${action} did not become terminal`);
  if (terminal.status!=='succeeded') throw new Error(`${lane.label} mission Action ${action} ended ${terminal.status}`);
  const child=await waitFor(async () => {
    const relations=await orchestrationRelations(context,configuration.webUrl,body.run.id);
    const children=relations.childRuns ?? [];
    if (children.length>1) throw new Error(`${lane.label} mission Action ${action} dispatched ${children.length} children`);
    if (children.length!==1) return undefined;
    const run=await orchestrationRun(context,configuration.webUrl,children[0].childRunId);
    return activeStatus(run.status) ? undefined : { relation:children[0],run };
  },60_000,`${lane.label} mission Action ${action} child did not become terminal`);
  if (child.run.status!=='succeeded') {
    throw new Error(
      `${lane.label} mission Action ${action} child ended ${child.run.status}: `
      + `${child.run.primaryError || child.run.reason || 'unknown error'}`,
    );
  }
  await waitFor(async () => {
    const button=page.locator(selector);
    return await button.isVisible()
      && !await button.isDisabled()
      && await button.getAttribute('data-xgc-status')==='stopped'
      && !await button.getAttribute('data-xgc-run-id')
      ? true : undefined;
  },30_000,`${lane.label} mission Action ${action} did not return to its finite command state`);
  const buttonEvidence=await page.locator(selector).evaluate((button) => ({
    selectorRole:button.getAttribute('data-xgc-role'),selectorId:button.getAttribute('data-xgc-id'),
    status:button.getAttribute('data-xgc-status'),runId:button.getAttribute('data-xgc-run-id'),
    progress:button.querySelector('.xgc-progress-fill')?.getAttribute('style'),
  }));
  await page.locator(selector).screenshot({ path:`${configuration.evidencePath}.${action}.png` });
  return {
    buttonEvidence,action,request:response.request().postDataJSON(),runId:body.run.id,status:terminal.status,
    childRunId:child.run.id,childStatus:child.run.status,
  };
}

function requestMatchesPanel(candidate,actionId,panelId,presetId) {
  if (candidate.request().method()!=='POST'
    || new URL(candidate.url()).pathname!=='/api/execution-targets/local/orchestration-runs') return false;
  try {
    const body=candidate.request().postDataJSON();
    return body?.automationRef?.domain===SYSTEM_EXPERIMENT_RUNNER.domain
      && body.automationRef.resourceId===SYSTEM_EXPERIMENT_RUNNER.resourceId
      && body?.experimentRef?.resourceId===experiment.head.resourceId
      && body.actionId===actionId
      && body.parameters?.panelId===panelId
      && body.parameters?.runMode==='simulation'
      && (presetId ? body.parameters?.presetId===presetId : true);
  } catch { return false; }
}

function missionActionSelector(action) {
  return `[data-xgc-role="automation-workflow-action-grid"][data-xgc-id="${lane.algorithmPanel}"] `
    + `[data-xgc-role="panel-action-invoke"][data-xgc-id="${action}"]`;
}

async function sampleMotion() {
  const { stdout }=await execFile('docker',[
    'exec','-e','ROS_MASTER_URI=http://127.0.0.1:11311',
    '-e','PYTHONPATH=/opt/ros/noetic/lib/python3/dist-packages',
    configuration.coreContainer,'python3','-c',motionSampleProgram(),lane.key,String(lane.sampleSeconds),
    report.algorithmReady.recorder.parameters.outputPrefix,
  ],{ timeout:(lane.sampleSeconds+330)*1000,maxBuffer:2*1024*1024 });
  return JSON.parse(stdout.trim());
}

function startScoutMissionObserver() {
  const events=[];
  report.scoutObserverEvents=events;
  const eventPath=`${configuration.evidencePath}.observer.jsonl`;
  const stderrPath=`${configuration.evidencePath}.observer.stderr.log`;
  report.scoutObserverLogs={ events:eventPath,stderr:stderrPath };
  writeFileSync(eventPath,'');
  writeFileSync(stderrPath,'');
  let lines='';
  let error='';
  let terminal=false;
  const program=readFileSync(new URL('./scout-mission-observer.py',import.meta.url),'utf8');
  const child=execFileCallback('docker',[
    'exec','-i','-e','ROS_MASTER_URI=http://127.0.0.1:11311',
    '-e','PYTHONPATH=/opt/ros/noetic/lib/python3/dist-packages',
    configuration.coreContainer,'python3','-u','-c',program,
    JSON.stringify(experiment.spec.robots.map((robot) => ({
      name:robot.namespace.replace(/^\//,''),initialPose:robot.initialPose,
    }))),
  ],{ timeout:920_000,maxBuffer:2*1024*1024 },(cause,_stdout,stderr) => {
    terminal=true;
    if (cause) error=`Scout observer exited: ${cause.message}\n${stderr.slice(-4000)}`;
  });
  child.stdin.on('error',() => { /* The observer may have exited after a guard failure. */ });
  child.stderr.on('data',(chunk) => appendFileSync(stderrPath,chunk));
  child.stdout.on('data',(chunk) => {
    lines+=chunk.toString();
    while (lines.includes('\n')) {
      const end=lines.indexOf('\n');
      const line=lines.slice(0,end);
      lines=lines.slice(end+1);
      try {
        const event=JSON.parse(line);
        if (event.kind) {
          events.push(event);
          appendFileSync(eventPath,`${JSON.stringify(event)}\n`);
        }
      } catch { /* ROS output */ }
    }
  });
  return {
    wait:async (kind,timeoutMs) => {
      const deadline=Date.now()+timeoutMs;
      while (Date.now()<deadline) {
      const failed=events.find((event) => event.kind==='failed');
      if (failed) throw new Error(failed.reason);
      if (error) throw new Error(error);
      const event=events.find((event) => event.kind===kind);
      if (!event && terminal) throw new Error(`Scout observer ended before ${kind}`);
      if (event) return event;
      await new Promise((resolve) => setTimeout(resolve,50));
      }
      throw new Error(`Scout ${kind} was not physically verified`);
    },
    close:() => { if (!child.stdin.destroyed && !child.stdin.writableEnded) child.stdin.end('exit\n'); },
  };
}

async function sampleVisualizationFacts() {
  const program=String.raw`
import json,time
import rospy,rosgraph
from nav_msgs.msg import Path
from tf2_msgs.msg import TFMessage
rospy.init_node('xgc_scout_visualization_facts',anonymous=True,disable_signals=True)
leader=rospy.wait_for_message('/xgc/user/leader_reference_path',Path,timeout=10)
published=dict(rosgraph.Master(rospy.get_name()).getPublishedTopics('/'))
static_seen=False
deadline=time.monotonic()+10
while time.monotonic()<deadline and not static_seen:
    for t in rospy.wait_for_message('/tf_static',TFMessage,timeout=10).transforms:
        if t.header.frame_id.lstrip('/')=='world' and t.child_frame_id.lstrip('/')=='map': static_seen=True
print(json.dumps({'leaderReferencePoints':len(leader.poses),'leaderReferenceFrame':leader.header.frame_id,
 'worldToMap':static_seen,'userTopics':{'leaderMarker':published.get('/xgc/user/leader_marker',''),
 'obstacles':published.get('/xgc/user/obstacles',''),'formationMarkers':published.get('/xgc/user/formation_markers','')}}))
`;
  const { stdout }=await execFile('docker',[
    'exec','-e','ROS_MASTER_URI=http://127.0.0.1:11311',
    '-e','PYTHONPATH=/opt/ros/noetic/lib/python3/dist-packages',
    configuration.coreContainer,'python3','-c',program,
  ],{ timeout:30_000,maxBuffer:256*1024 });
  return JSON.parse(stdout.trim());
}

async function sampleSafeState() {
  const { stdout }=await execFile('docker',[
    'exec','-e','ROS_MASTER_URI=http://127.0.0.1:11311',
    '-e','PYTHONPATH=/opt/ros/noetic/lib/python3/dist-packages',
    configuration.coreContainer,'python3','-c',safeStateProgram(),lane.key,
  ],{ timeout:240_000,maxBuffer:1024*1024 });
  return JSON.parse(stdout.trim());
}

function assertMotion(value) {
  if (value.robots.length!==lane.robotCount
    || value.robots.some((robot) => robot.controller!==lane.activeController
      || robot.predictedPoints<10 || robot.travelM<lane.minimumTravelM)) {
    throw new Error(`${lane.label} did not enter moving DMPC formation: ${JSON.stringify(value)}`);
  }
  if (value.leaderReferencePoints<100 || value.worldToMap!==true
    || value.userTopics.leaderMarker!=='visualization_msgs/Marker'
    || value.userTopics.obstacles!=='visualization_msgs/MarkerArray') {
    throw new Error(`${lane.label} generic visualization evidence is incomplete: ${JSON.stringify(value)}`);
  }
  if (lane.key==='uav6' && (value.centroidSpan.z<0.5 || value.robots.some((robot) => robot.airborne!==true))) {
    throw new Error(`five-FS150 trefoil/airborne evidence is incomplete: ${JSON.stringify(value)}`);
  }
  if (lane.key==='ugv4' && (!(value.lapDurationSeconds>0)
    || value.elapsedSimSeconds<value.lapDurationSeconds
    || value.elapsedSimSeconds>value.lapDurationSeconds+0.5)) {
    throw new Error(`four-Scout ROS-time lap coverage is incomplete: ${JSON.stringify(value)}`);
  }
  if (lane.key==='ugv4') {
    const geometry=value.stadium[0];
    const requiredSpans=[0.7*(geometry.straightLengthM+2*geometry.curveRadiusM),1.4*geometry.curveRadiusM];
    if (value.robots.some((robot) => robot.leaderClosureErrorM>0.2
      || robot.spanXY.some((span,index) => span<requiredSpans[index]))) {
      throw new Error(`four-Scout physical lap coverage/closure is incomplete: ${JSON.stringify(value)}`);
    }
  }
}

function assertSafeState(value) {
  if (value.robots.length!==lane.robotCount || value.robots.some((robot) => robot.safe!==true)) {
    throw new Error(`${lane.label} did not reach its physical safe state: ${JSON.stringify(value)}`);
  }
}

function assertVisualizationAllowlist(processes) {
  const bridge=processes.find((item) => item.definitionId==='foxglove-bridge');
  const topics=String(bridge?.parameters?.allowedTopics||'').split('\n');
  const requiredTopics=[
    '/xgc/user/leader_reference_path','/xgc/user/leader_marker','/xgc/user/obstacles','/xgc/user/formation_markers','/tf_static',
    ...Array.from({ length:lane.robotCount },(_,index) => `/${lane.robotPrefix}${index+1}/alg/predicted_trajectory`),
  ];
  const missing=requiredTopics.filter((topic) => !topics.includes(topic));
  if (missing.length) throw new Error(`Lichtblick generic algorithm allowlist is missing ${missing.join(', ')}`);
  return { bridgeProcessId:bridge.id,requiredTopics };
}

async function publishEmergencySafetyCommand() {
  for (let index=0;index<3;index+=1) {
    await execFile('docker',['exec','-e','ROS_MASTER_URI=http://127.0.0.1:11311',
      configuration.coreContainer,'rostopic','pub','-1','/command','std_msgs/String',`data: ${lane.safeAction}`],
    { timeout:15_000,maxBuffer:64*1024 });
  }
}

async function stopVisibleExperiment() {
  if (!experiment || !experimentRunId) return;
  const sessions=await experimentSessions(context,configuration.webUrl,experiment.head.resourceId);
  if (sessions.length===0) {
    experimentRunId='';
    return;
  }
  await stopExperimentThroughUI({
    page,context,webUrl:configuration.webUrl,experiment,runId:experimentRunId,timeoutMs:240_000,
  });
  experimentRunId='';
}

async function waitForUserProjectProcessesToExit() {
  const executableRoot='/var/lib/xgc2-local-fleet/user-project-build/ros1_ws/devel/lib/';
  const deadline=Date.now()+10_000;
  let remaining=[];
  while (Date.now()<deadline) {
    const { stdout }=await execFile('docker',[
      'exec',configuration.coreContainer,'ps','-eo','pid=,ppid=,args=',
    ],{ timeout:10_000,maxBuffer:512*1024 });
    remaining=stdout.split('\n').map((line) => line.trim()).filter((line) => line.includes(executableRoot));
    if (remaining.length===0) return [];
    await new Promise((resolve) => setTimeout(resolve,200));
  }
  throw new Error(`${lane.label} left user-project processes after Stop: ${JSON.stringify(remaining)}`);
}

function processReady(item) {
  return item.desiredState==='running' && item.observedState==='running' && item.handle!=null
    && item.readiness?.status==='passing' && item.liveness?.status==='passing';
}

function processEvidence(item) {
  return {
    id:item.id,definitionId:item.definitionId,desiredState:item.desiredState,observedState:item.observedState,
    readiness:item.readiness?.status,liveness:item.liveness?.status,parameters:item.parameters,
  };
}

function activeStatus(status) {
  return ['accepted','queued','running','waiting','stopping'].includes(status);
}

async function responseJSON(response) {
  const text=await response.text();
  try { return JSON.parse(text); } catch { return text; }
}

function laneDefinition(key) {
  const lanes={
    uav6:{
      key:'uav6',label:'five FS150',fixtureKey:'six-px4',experimentName:'5 PX4 multirotors experiment',
      algorithmPanel:'paper-leader-uav6',
      missionActions:['custom1','takeoff','track','stop','land'],activationActions:['takeoff','track'],safeAction:'land',robotCount:5,robotPrefix:'uav',
      activeController:'Custom1',minimumTravelM:0.5,sampleSeconds:30,
      foundation:[
        { definitionId:'px4-sitl-fs150',count:5 },{ definitionId:'mavros-px4-sitl',count:5 },
        { definitionId:'lichtblick-robot-scene',count:1 },{ definitionId:'foxglove-bridge',count:1 },
      ],
    },
    ugv4:{
      key:'ugv4',label:'four Scout',fixtureKey:'four-scout',experimentName:'4 Scout Mini vehicles experiment',
      algorithmPanel:'paper-leader-ugv4',
      missionActions:['custom1','track','stop'],activationActions:['track'],safeAction:'stop',robotCount:4,robotPrefix:'ugv',
      activeController:3,minimumTravelM:0.1,sampleSeconds:40,
      foundation:[
        { definitionId:'scout-gazebo-robot',count:4 },
        { definitionId:'lichtblick-robot-scene',count:1 },{ definitionId:'foxglove-bridge',count:1 },
      ],
    },
  };
  if (!lanes[key]) throw new Error(`XGC_PAPER_MISSION_LANE must be uav6 or ugv4, got ${JSON.stringify(key)}`);
  return lanes[key];
}

function uavHoverProgram() {
  return String.raw`
import json,sys,time
import rospy
from geometry_msgs.msg import PoseStamped, TwistStamped
from std_msgs.msg import String

count=int(sys.argv[1])
takeoff=sys.argv[2]=='takeoff'
rospy.init_node('xgc_paper_mission_hover_gate',anonymous=True,disable_signals=True)
deadline=time.time()+180.0
last={'stages':[],'heights':[]}
while time.time()<deadline and not rospy.is_shutdown():
    stages=[]
    heights=[]
    speeds=[]
    try:
        for index in range(1,count+1):
            stages.append(rospy.wait_for_message('/uav%d/custom/statustext'%index,String,timeout=2.0).data)
            heights.append(rospy.wait_for_message('/uav%d/mavros/local_position/pose'%index,PoseStamped,timeout=2.0).pose.position.z)
            velocity=rospy.wait_for_message('/uav%d/mavros/local_position/velocity_local'%index,TwistStamped,timeout=2.0).twist.linear
            speeds.append((velocity.x**2+velocity.y**2+velocity.z**2)**0.5)
    except (rospy.ROSException,rospy.ROSInterruptException):
        time.sleep(0.25)
        continue
    last={'stages':stages,'heights':heights,'speeds':speeds}
    if all(stage=='Hover' for stage in stages) and all(speed<0.15 for speed in speeds) and all((2.7<height<3.3) if takeoff else (0.5<height<3.5) for height in heights):
        print(json.dumps({'controllers':stages,'heights':heights,'speeds':speeds},separators=(',',':')))
        break
    time.sleep(0.25)
else:
    raise RuntimeError('not every FS150 reached Hover at the configured 3 m takeoff height or inside the flight envelope within 180 seconds: '
                       +json.dumps(last,separators=(',',':')))
`;
}

function required(name,fallback='') {
  const value=process.env[name]?.trim() || fallback;
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredURL(name,fallback='') {
  const parsed=new URL(required(name,fallback));
  if (!['http:','https:'].includes(parsed.protocol)) throw new Error(`${name} must be HTTP(S)`);
  return parsed.toString().replace(/\/$/,'');
}

function motionSampleProgram() {
  return String.raw`
import json,math,sys,time,yaml
from pathlib import Path as FilePath
import rospy,rosgraph
from geometry_msgs.msg import PoseStamped,TwistStamped
from mavros_msgs.msg import State
from nav_msgs.msg import Path
from std_msgs.msg import String,UInt32
from tf2_msgs.msg import TFMessage

lane=sys.argv[1]
duration=int(sys.argv[2])
frozen=yaml.safe_load((FilePath(sys.argv[3]).parent/'algorithm/dmpc-scenario.yaml').read_text())
period=2*math.pi/abs(frozen['reference']['harmonic0']['omega'][0]) if lane=='uav6' else duration
count=5 if lane=='uav6' else 4
prefix='uav' if lane=='uav6' else 'ugv'
active='Custom1' if lane=='uav6' else 3
rospy.init_node('xgc_paper_mission_motion_sample',anonymous=True,disable_signals=True)

def wait(topic,kind,timeout=5.0):
    return rospy.wait_for_message(topic,kind,timeout=timeout)

def controller_state(name):
    if lane=='uav6': return wait('/%s/custom/statustext'%name,String).data
    return wait('/%s/alg/unicycle_ugv_controller/status/control_state'%name,UInt32).data

def stage_snapshot():
    return [controller_state('%s%d'%(prefix,i)) for i in range(1,count+1)]

deadline=time.time()+300.0
last={'controllers':[]}
while time.time()<deadline and not rospy.is_shutdown():
    try:
        stages=stage_snapshot()
    except (rospy.ROSException,rospy.ROSInterruptException):
        time.sleep(0.5)
        continue
    last={'controllers':stages}
    if all(value==active for value in stages): break
    time.sleep(0.5)
else:
    raise RuntimeError('mission did not enter active formation state: '
                       +json.dumps(last,separators=(',',':')))

def position(name):
    if lane=='uav6':
        message=wait('/%s/mavros/local_position/pose'%name,PoseStamped)
        return [message.pose.position.x,message.pose.position.y,message.pose.position.z]
    message=wait('/%s/simulation/ground_truth/pose'%name,PoseStamped)
    return [message.pose.position.x,message.pose.position.y,message.pose.position.z]

names=['%s%d'%(prefix,i) for i in range(1,count+1)]
# Stop before the physical boundary; the remaining distance is braking room.
# This is an experimental guard, not a proof of controller safety.
field_stop=rospy.Publisher('/command',String,queue_size=1)
field_fault=[]
def check_field(message,name):
    p=message.pose.position
    scale=frozen['uav_geometry']['geometry']['scale']
    radius=math.hypot(scale[0],scale[2]/2)
    limit_x,limit_y=7.5-radius,5.0-radius
    if abs(p.x)>limit_x or abs(p.y)>limit_y or (lane=='uav6' and not 0.5<p.z<3.5):
        if not field_fault:
            field_fault.append({'robot':name,'position':[p.x,p.y,p.z]})
        field_stop.publish(String(data='stop' if lane=='ugv4' else 'hover'))
field_subscribers=[rospy.Subscriber('/%s/pose'%name,PoseStamped,check_field,callback_args=name) for name in names]
if lane=='ugv4':
    movement_origins={name:position(name) for name in names}
    movement_deadline=time.time()+120.0
    while time.time()<movement_deadline and not rospy.is_shutdown():
        movement_now={name:position(name) for name in names}
        if all(math.sqrt(sum((movement_now[name][axis]-movement_origins[name][axis])**2
                             for axis in range(3)))>=0.1 for name in names):
            break
        time.sleep(0.5)
    else:
        evidence={name:{'start':movement_origins[name],'last':movement_now[name],
          'distance':math.sqrt(sum((movement_now[name][axis]-movement_origins[name][axis])**2 for axis in range(3)))}
          for name in names}
        raise RuntimeError('not every Scout started physical motion within 120 seconds: '
                           +json.dumps(evidence,separators=(',',':')))
samples=[]
sample_start=rospy.Time.now().to_sec()
while not rospy.is_shutdown():
    if field_fault: raise RuntimeError('Field braking guard triggered: '+json.dumps(field_fault))
    samples.append({name:position(name) for name in names})
    if rospy.Time.now().to_sec()-sample_start>=period: break
    rospy.sleep(1.0)

robots=[]
for name in names:
    points=[sample[name] for sample in samples]
    travel=sum(math.sqrt(sum((right[j]-left[j])**2 for j in range(3))) for left,right in zip(points,points[1:]))
    predicted=wait('/%s/alg/predicted_trajectory'%name,Path)
    state=wait('/%s/mavros/state'%name,State) if lane=='uav6' else None
    robots.append({'name':name,'controller':controller_state(name),
      'travelM':travel,'start':points[0],'end':points[-1],
      'predictedPoints':len(predicted.poses),'predictedFrame':predicted.header.frame_id,
      'airborne':all(0.5<point[2]<3.5 for point in points) if lane=='uav6' else None,
      'armed':state.armed if state else None,'mode':state.mode if state else None})

centroids=[[sum(sample[name][axis] for name in names)/count for axis in range(3)] for sample in samples]
spans={axis:max(point[index] for point in centroids)-min(point[index] for point in centroids)
       for index,axis in enumerate(('x','y','z'))}
max_position={'x':max(sample[name][0] for sample in samples for name in names),
              'y':max(sample[name][1] for sample in samples for name in names)}
leader=wait('/xgc/user/leader_reference_path',Path)
published=dict(rosgraph.Master(rospy.get_name()).getPublishedTopics('/'))
static_seen=False
static_deadline=time.time()+10.0
while time.time()<static_deadline and not static_seen:
    for transform in wait('/tf_static',TFMessage).transforms:
        parent=transform.header.frame_id.lstrip('/')
        child=transform.child_frame_id.lstrip('/')
        if parent=='world' and child=='map': static_seen=True
print(json.dumps({'robots':robots,'centroidSpan':spans,'maxPosition':max_position,
  'referencePeriodSeconds':period,'elapsedSimSeconds':rospy.Time.now().to_sec()-sample_start,
  'leaderReferencePoints':len(leader.poses),'leaderReferenceFrame':leader.header.frame_id,
  'worldToMap':static_seen,'userTopics':{
    'leaderMarker':published.get('/xgc/user/leader_marker',''),
    'obstacles':published.get('/xgc/user/obstacles',''),
    'formationMarkers':published.get('/xgc/user/formation_markers','')
  }},separators=(',',':')))
`;
}

function safeStateProgram() {
  return String.raw`
import json,math,sys,time
import rospy
from geometry_msgs.msg import PoseStamped,TwistStamped
from mavros_msgs.msg import State
from std_msgs.msg import String,UInt32

lane=sys.argv[1]
count=5 if lane=='uav6' else 4
prefix='uav' if lane=='uav6' else 'ugv'
rospy.init_node('xgc_paper_mission_safe_sample',anonymous=True,disable_signals=True)
def wait(topic,kind,timeout=5.0): return rospy.wait_for_message(topic,kind,timeout=timeout)
def controller_state(name):
    if lane=='uav6': return wait('/%s/custom/statustext'%name,String).data
    return wait('/%s/alg/unicycle_ugv_controller/status/control_state'%name,UInt32).data
def snapshot():
    robots=[]
    for i in range(1,count+1):
        name='%s%d'%(prefix,i)
        controller=controller_state(name)
        if lane=='uav6':
            pose=wait('/%s/pose'%name,PoseStamped)
            velocity=wait('/%s/mavros/local_position/velocity_local'%name,TwistStamped)
            state=wait('/%s/mavros/state'%name,State)
            speed=math.sqrt(velocity.twist.linear.x**2+velocity.twist.linear.y**2+velocity.twist.linear.z**2)
            safe=controller=='Ready' and -0.05<pose.pose.position.z<0.35 and speed<0.25 and not state.armed
            robots.append({'name':name,'controller':controller,'z':pose.pose.position.z,'speed':speed,
              'armed':state.armed,'mode':state.mode,'safe':safe})
        else:
            twist=wait('/%s/simulation/ground_truth/twist'%name,TwistStamped)
            linear=math.sqrt(twist.twist.linear.x**2+twist.twist.linear.y**2)
            angular=abs(twist.twist.angular.z)
            safe=controller==2 and linear<0.05 and angular<0.1
            robots.append({'name':name,'controller':controller,'linearSpeed':linear,'angularSpeed':angular,'safe':safe})
    return robots
deadline=time.time()+180.0
stable=None
robots=[]
while time.time()<deadline and not rospy.is_shutdown():
    try: robots=snapshot()
    except (rospy.ROSException,rospy.ROSInterruptException):
        time.sleep(0.25)
        continue
    if all(item['safe'] for item in robots):
        if stable is None: stable=time.time()
        if time.time()-stable>=1.0: break
    else: stable=None
    time.sleep(0.25)
else: raise RuntimeError('mission safe state timed out: '+json.dumps(robots,separators=(',',':')))
print(json.dumps({'robots':robots},separators=(',',':')))
`;
}
