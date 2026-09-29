/* global console,process,URL,setTimeout,document,performance */
import { execFile as execFileCallback } from 'node:child_process';
import { appendFileSync,existsSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { promisify,TextDecoder } from 'node:util';
import { chromium } from '@playwright/test';
import {
  captureAutomationPanelFailure,
  observeAutomationCatalogRequests,
} from './automation-catalog-browser-evidence.mjs';
import {
  SYSTEM_EXPERIMENT_RUNNER,
  assertNoActiveSystemRunner,
  clickAndWaitForPageResponse,
  completedExperimentStopEvidence,
  experimentOwnedProcesses,
  experimentSessions,
  getJSON,
  orchestrationRun,
  orchestrationRelations,
  resolveLocalSwarmCoreContainer,
  resolveManagedFixture,
  startExperimentThroughUI,
  stopExperimentThroughUI,
  waitFor,
} from './experiment-system-runner-e2e.mjs';

const execFile=promisify(execFileCallback);
const laneKey=required('XGC_PAPER_MISSION_LANE');
const lane=laneDefinition(laneKey);
if (process.env.XGC_PAPER_MISSION_FINISH_AT_HOVER==='1') {
  throw new Error('XGC_PAPER_MISSION_FINISH_AT_HOVER is unsupported: the current knot Stop action lands the vehicles.');
}
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
  coreContainer:await resolveLocalSwarmCoreContainer('XGC_PAPER_MISSION_CORE_CONTAINER'),
  renderVisualization:process.env.XGC_PAPER_MISSION_RENDER_VISUALIZATION==='1',
  readyStopOnly:process.env.XGC_PAPER_MISSION_READY_STOP_ONLY==='1',
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
  robotEventStreamHttpErrors:[],
  visualizationRendering:configuration.renderVisualization ? 'browser' : 'backend-contract-only',
};
const robotEventResponseReads=[];
let experiment;
let experimentRunId='';
let safetyCommandSent=false;
let scoutObserver;
page.on('pageerror',(error) => report.pageErrors.push(error.message));
page.on('console',(message) => {
  if (message.type()==='error') report.consoleErrors.push({ message:message.text(),location:message.location() });
});
page.on('response',(response) => {
  const url=response.url();
  if (!new URL(url).pathname.endsWith('/robots/events') || response.status()<400) return;
  const requestHeaders=response.request().headers();
  const entry={
    status:response.status(),url,observedAt:new Date().toISOString(),
    requestHeaders:{
      accept:requestHeaders.accept ?? null,
      lastEventId:requestHeaders['last-event-id'] ?? null,
      streamId:requestHeaders['x-xgc-robot-stream-id'] ?? null,
    },
    responseText:'',responseTextTruncated:false,
  };
  report.robotEventStreamHttpErrors.push(entry);
  const bodyRead=response.body().then((body) => {
    const limit=4*1024;
    entry.responseText=new TextDecoder().decode(body.subarray(0,limit));
    entry.responseTextTruncated=body.byteLength>limit;
  }).catch((cause) => {
    entry.responseTextReadError=String(cause);
  });
  robotEventResponseReads.push(bodyRead);
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
  {
    const { stdout }=await execFile('docker',['exec',configuration.coreContainer,'ps','-eo','args=']);
    const unexpected=stdout.split('\n').filter((line) => line.includes('/user-project-build/ros1_ws/devel/lib/formation_generator/drone_mpc_acados'));
    if (unexpected.length) throw new Error('Total Run started the algorithm before the Algorithm tile was clicked');
    report.algorithmBeforeClick={ plannerCount:0 };
  }
  const algorithm=await runServiceAction('run');
  report.algorithm=algorithm;
  report.algorithmRun=algorithm.rootRunId;
  report.algorithmReady=await waitForAlgorithmWorkflowReady(algorithm.rootRunId);
  report.algorithmReady.signals=await waitForPlannerReadiness();
  report.residency=[await assertAlgorithmResident(algorithm.rootRunId,'ready')];
  report.record=await runServiceAction('record');
  report.recordRun=report.record.rootRunId;
  report.recorder=await waitForRecordWorkflowReady(report.recordRun);
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
    const command=await invokeMissionAction(lane.safeAction);
    safetyCommandSent=true;
    report.safeCommand=command;
    report.residency.push(await assertAlgorithmResident(algorithm.rootRunId,`after-${lane.safeAction}`));
    const safe=await sampleSafeState();
    assertSafeState(safe);
    report.safeState=safe;
    report.physicalContact=await samplePhysicalContact();
    if (report.physicalContact.collision) {
      throw new Error(`${lane.label} Gazebo reported physical contact: ${report.physicalContact.detail}`);
    }
    if (lane.key==='ugv4') Object.assign(motion,await sampleVisualizationFacts());
    assertMotion(motion);
    report.visualization=assertVisualizationAllowlist(foundation);
    await page.screenshot({ path:`${configuration.evidencePath}.safe.png`,fullPage:true });
  }

  {
    const algorithmButton=page.locator(missionActionSelector('run'));
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
  console.log(`PASS: ${lane.label} paper mission through platform UI; evidence: ${configuration.evidencePath}`);
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
    report.cleanup={ runId:experimentRunId,errors:[] };
    if (!safetyCommandSent) {
      try {
        await publishEmergencySafetyCommand();
        report.cleanup.safetyCommandSent=true;
      } catch (cause) {
        report.cleanup.errors.push({ stage:'safety-command',error:cause instanceof Error ? cause.message : String(cause) });
      }
    }
    try {
      report.cleanup.stop=await stopVisibleExperiment();
    } catch (cause) {
      const stopped=completedExperimentStopEvidence(cause);
      if (stopped) {
        report.cleanup.stop=stopped;
        experimentRunId='';
      }
      report.cleanup.errors.push({ stage:'stop',error:cause instanceof Error ? cause.message : String(cause) });
    }
    report.cleanup.remainingRunId=experimentRunId || null;
    if (report.cleanup.errors.length) {
      report.outcome='FAIL';
      process.exitCode=1;
    }
  }
  scoutObserver?.close();
  report.finishedAt=new Date().toISOString();
  await Promise.allSettled(robotEventResponseReads);
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
  const requiredIds=new Set(['roscore','gazebo-server',...lane.foundation.map((item) => item.definitionId)]);
  const result=await waitFor(async () => {
    const owned=await experimentOwnedProcesses(context,configuration.webUrl,experimentRunId);
    const failed=owned.find((item) => {
      if (!requiredIds.has(item.definitionId)) return false;
      const hasLastError=typeof item.lastError==='string' && item.lastError.trim()!=='';
      const stoppedAfterError=item.desiredState==='stopped' && item.observedState==='stopped' && hasLastError;
      const failedWithoutRestart=item.observedState==='failed'
        && !(item.desiredState==='running' && item.nextRestartAt);
      return stoppedAfterError || failedWithoutRestart;
    });
    if (failed) {
      return { error:new Error(
        `${lane.label} required Process failed before readiness: `
        + `id=${failed.id} definitionId=${failed.definitionId} `
        + `lastError=${failed.lastError?.trim() || '(empty)'}`,
      ) };
    }
    for (const requirement of lane.foundation) {
      const matches=owned.filter((item) => item.definitionId===requirement.definitionId);
      if (matches.length!==requirement.count || !matches.every(processReady)) return undefined;
    }
    return { processes:owned };
  },360_000,`${lane.label} platform Process closure did not become ready`);
  if (result.error) throw result.error;
  return result.processes;
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

async function runServiceAction(action) {
  const selector=missionActionSelector(action);
  const response=await clickAndWaitForPageResponse(page,{
    timeoutMs:30_000,
    match:(candidate) => requestMatchesPanel(candidate,'invoke-panel-action',lane.algorithmPanel,action),
    click:() => page.locator(selector).click({ timeout:30_000 }),
  });
  const body=await responseJSON(response);
  if (response.status()!==202 || !body?.run) {
    throw new Error(`${action} Action HTTP ${response.status()}: ${JSON.stringify(body)}`);
  }
  return { request:response.request().postDataJSON(),rootRunId:body.run.id,status:body.run.status };
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
    if (await page.locator(missionActionSelector('run')).getAttribute('data-xgc-progress')!=='100') return undefined;
    const childRelations=await orchestrationRelations(context,configuration.webUrl,child.id);
    const jobs=await Promise.all((childRelations.waits ?? []).filter((wait) => wait.type==='job')
      .map((wait) => getJSON(context,configuration.webUrl,`/api/execution-targets/local/jobs/${wait.subjectId}`)));
    if (!jobs.length || jobs.some((job) => job.status!=='running')) return undefined;
    return { workflowRunId:child.id,workflowStatus:child.status,jobs };
  },210_000,`${lane.label} Algorithm did not start its live process jobs`);
}

async function waitForPlannerReadiness() {
  const program=String.raw`
import json,sys,time
import rospy
from periodic_sync.msg import SyncReady
rospy.init_node('xgc_paper_planner_readiness',anonymous=True,disable_signals=True)
expected=set(range(1,int(sys.argv[1])+1));seen=set()
subscriber=rospy.Subscriber('/formation/ready',SyncReady,lambda message:seen.add(message.participant_id))
deadline=time.monotonic()+180
while not expected.issubset(seen) and time.monotonic()<deadline and not rospy.is_shutdown():
    time.sleep(.1)
if not expected.issubset(seen):
    raise RuntimeError('Planner readiness missing participants '+str(sorted(expected-seen)))
print(json.dumps({'topic':'/formation/ready','participants':sorted(seen)}))
`;
  const { stdout }=await execFile('docker',[
    'exec',configuration.coreContainer,'bash','-lc',
    'source /opt/ros/noetic/setup.bash && source /var/lib/xgc2-local-swarm/user-project-build/ros1_ws/devel/setup.bash && python3 -c "$1" "$2"',
    'xgc-paper-readiness',program,String(lane.robotCount),
  ],{ timeout:210_000,maxBuffer:256*1024 });
  return JSON.parse(stdout.trim());
}

async function waitForRecordWorkflowReady(rootRunId) {
  return waitFor(async () => {
    const relations=await orchestrationRelations(context,configuration.webUrl,rootRunId);
    const children=relations.childRuns ?? [];
    if (children.length>1) throw new Error(`${lane.label} Record Action dispatched ${children.length} children`);
    if (children.length!==1) return undefined;
    const child=await orchestrationRun(context,configuration.webUrl,children[0].childRunId);
    if (!activeStatus(child.status)) throw new Error(`${lane.label} Record Workflow ended ${child.status}`);
    const recorders=(await experimentOwnedProcesses(context,configuration.webUrl,rootRunId))
      .filter((item) => item.definitionId==='rosbag-record-selected');
    if (recorders.length>1) throw new Error(`${lane.label} Record Workflow owns ${recorders.length} recorders`);
    if (recorders.length!==1 || !processReady(recorders[0])) return undefined;
    let manifest;
    try { manifest=JSON.parse(recorders[0].parameters?.sessionManifestJson ?? ''); } catch { return undefined; }
    if (manifest.recordingProfile!=='camera_scientific' || manifest.includeMotionCapture!==true
      || !manifest.sessionId || !manifest.localizationOffset) {
      throw new Error(`${lane.label} recorder is not the scientific Session recorder: ${JSON.stringify({
        recordingProfile:manifest.recordingProfile,includeMotionCapture:manifest.includeMotionCapture,
        sessionId:manifest.sessionId,localizationOffset:manifest.localizationOffset,
      })}`);
    }
    return { workflowRunId:child.id,workflowStatus:child.status,recorder:processEvidence(recorders[0]) };
  },210_000,`${lane.label} Record Workflow did not start the scientific recorder`);
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
  const run=page.locator(missionActionSelector('run'));
  await run.waitFor({ state:'visible',timeout:30_000 });
  if (await run.getAttribute('data-xgc-status')==='stopped') {
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
    const button=page.locator(missionActionSelector('run'));
    await waitFor(async () => await button.getAttribute('data-xgc-status')==='running' && await button.getAttribute('data-xgc-progress')==='100' ? true : undefined,30_000,'Algorithm tile did not stay running');
    if (await button.isDisabled()) throw new Error('Running Algorithm tile is disabled');
    tile=await button.evaluate((element) => ({ status:element.getAttribute('data-xgc-status'),progress:element.querySelector('.xgc-progress-fill')?.getAttribute('style') }));
    await button.screenshot({ path:`${configuration.evidencePath}.algorithm-${phase}.png` });
  }
  return { phase,workflowRunId:child.id,workflowStatus:child.status,plannerCount:planners.length,tile };
}

async function waitForUAVHover() {
  const { stdout }=await execFile('docker',[
    'exec','-e','ROS_MASTER_URI=http://127.0.0.1:11311',
    '-e','PYTHONPATH=/opt/ros/noetic/lib/python3/dist-packages',
    configuration.coreContainer,'python3','-c',uavHoverProgram(),
    JSON.stringify(experiment.spec.robots.filter(isUAV).map((robot) => robot.namespace)),
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
    JSON.stringify(missionRobots()),
    JSON.stringify(experiment.spec.worldBoundary?.controlBounds ?? null),
    report.recorder.recorder.parameters.outputPrefix,
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
    JSON.stringify(experiment.spec.worldBoundary ?? null),
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
 'scene':published.get('/xgc/scene',''),'formationMarkers':published.get('/xgc/user/formation_markers','')}}))
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
    configuration.coreContainer,'python3','-c',safeStateProgram(),
    JSON.stringify(missionRobots()),
  ],{ timeout:240_000,maxBuffer:1024*1024 });
  return JSON.parse(stdout.trim());
}

async function samplePhysicalContact() {
  // The scene plugin latches the first forbidden contact until world reset.
  // Reaching the end of a trajectory does not establish collision-free motion.
  const program=String.raw`
import json,rospy
from std_msgs.msg import Bool,String
rospy.init_node('xgc_paper_contact_result',anonymous=True,disable_signals=True)
topic='/xgc2/simulation/physical_collision'
collision=rospy.wait_for_message(topic,Bool,timeout=10).data
detail=rospy.wait_for_message(topic+'_detail',String,timeout=10).data
print(json.dumps({'topic':topic,'collision':collision,'detail':detail}))
`;
  const { stdout }=await execFile('docker',[
    'exec','-e','ROS_MASTER_URI=http://127.0.0.1:11311',
    '-e','PYTHONPATH=/opt/ros/noetic/lib/python3/dist-packages',
    configuration.coreContainer,'python3','-c',program,
  ],{ timeout:30_000,maxBuffer:256*1024 });
  return JSON.parse(stdout.trim());
}

function assertMotion(value) {
  const mixed=value.robots.length===lane.robotCount && lane.key==='mixed_circle';
  if (value.robots.length!==lane.robotCount
    || value.robots.some((robot) => robot.controller!==lane.activeController
      || robot.predictedPoints<10
      || (mixed ? !(robot.travelM>0) : robot.travelM<lane.minimumTravelM))) {
    throw new Error(`${lane.label} did not enter moving DMPC formation: ${JSON.stringify(value)}`);
  }
  if (value.leaderReferencePoints<100 || value.worldToMap!==true
    || value.userTopics.leaderMarker!=='visualization_msgs/Marker'
    || value.userTopics.scene!=='foxglove_msgs/SceneUpdate') {
    throw new Error(`${lane.label} generic visualization evidence is incomplete: ${JSON.stringify(value)}`);
  }
  if (lane.key==='knot_fs150' && (value.centroidSpan.z<0.5 || value.robots.some((robot) => robot.airborne!==true))) {
    throw new Error(`five-FS150 trefoil/airborne evidence is incomplete: ${JSON.stringify(value)}`);
  }
  if (lane.key==='mixed_circle' && (value.elapsedSimSeconds<value.referencePeriodSeconds
    || value.robots.filter((robot) => robot.kind==='px4_multirotor').length!==5
    || value.robots.filter((robot) => robot.kind==='scout_mini').length!==4
    || value.robots.some((robot) => robot.kind==='px4_multirotor'
      && (robot.airborne!==true || robot.fcuConnected!==true)))) {
    throw new Error(`mixed mission full-period, UAV airborne, or FCU evidence is incomplete: ${JSON.stringify(value)}`);
  }
  if (lane.key==='ugv4' && (!(value.lapDurationSeconds>0)
    || value.elapsedSimSeconds<value.lapDurationSeconds
    || value.elapsedSimSeconds>value.lapDurationSeconds+0.5)) {
    throw new Error(`four-Scout ROS-time lap coverage is incomplete: ${JSON.stringify(value)}`);
  }
  if (lane.key==='ugv4') {
    const geometry=value.stadium[0];
    const requiredSpans=[0.7*(geometry.straightLengthM+2*geometry.curveRadiusM),1.4*geometry.curveRadiusM];
    if (value.robots.some((robot) => robot.leaderEndpointErrorM>0.2
      || robot.spanXY.some((span,index) => span<requiredSpans[index]))) {
      throw new Error(`four-Scout mission coverage or configured endpoint is incomplete: ${JSON.stringify(value)}`);
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
    '/xgc/user/leader_reference_path','/xgc/user/leader_marker','/xgc/scene','/xgc/scene/snapshot','/xgc/user/formation_markers','/tf_static',
    ...experiment.spec.robots.map((robot) => `${robot.namespace.replace(/\/$/,'')}/alg/predicted_trajectory`),
  ];
  const missing=requiredTopics.filter((topic) => !topics.includes(topic));
  if (missing.length) throw new Error(`Lichtblick generic algorithm allowlist is missing ${missing.join(', ')}`);
  return { bridgeProcessId:bridge.id,requiredTopics };
}

async function publishEmergencySafetyCommand() {
  const errors=[];
  for (const command of lane.emergencyCommands) {
    try {
      for (let index=0;index<3;index+=1) {
        await execFile('docker',['exec','-e','ROS_MASTER_URI=http://127.0.0.1:11311',
          configuration.coreContainer,'rostopic','pub','-1','/command','std_msgs/String',`data: ${command}`],
        { timeout:15_000,maxBuffer:64*1024 });
      }
    } catch (cause) {
      errors.push(new Error(`Emergency ${command} failed`,{ cause }));
    }
  }
  if (errors.length) throw new AggregateError(errors,'Emergency safety commands failed');
}

async function stopVisibleExperiment() {
  if (!experiment || !experimentRunId) return;
  const runId=experimentRunId;
  const [run,sessions,ownedProcesses]=await Promise.all([
    orchestrationRun(context,configuration.webUrl,runId),
    experimentSessions(context,configuration.webUrl,experiment.head.resourceId),
    experimentOwnedProcesses(context,configuration.webUrl,runId),
  ]);
  if (!activeStatus(run.status) && sessions.length===0
    && ownedProcesses.every((item) => item.desiredState==='stopped' && item.observedState==='stopped')) {
    experimentRunId='';
    return { alreadyStopped:true,backendFinal:{ status:'confirmed',run,sessions,ownedProcesses } };
  }
  const stopped=await stopExperimentThroughUI({
    page,context,webUrl:configuration.webUrl,experiment,runId,timeoutMs:240_000,
  });
  experimentRunId='';
  return stopped;
}

async function waitForUserProjectProcessesToExit() {
  const executableRoot='/var/lib/xgc2-local-swarm/user-project-build/ros1_ws/devel/lib/';
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
    knot_fs150:{
      key:'knot_fs150',label:'FS150 knot',fixtureKey:'px4-swarm',experimentName:'TASE-5UAVs',
      algorithmPanel:'paper-leader-knot-fs150',
      missionActions:['run','record','takeoff','start','stop'],activationActions:['takeoff','start'],safeAction:'stop',emergencyCommands:['land'],robotCount:5,
      activeController:'Custom1',minimumTravelM:0.5,sampleSeconds:30,
      foundation:[
        { definitionId:'px4-sitl-fs150',count:5 },{ definitionId:'mavros-px4-sitl',count:5 },
        { definitionId:'lichtblick-robot-scene',count:1 },{ definitionId:'foxglove-bridge',count:1 },
      ],
    },
    ugv4:{
      key:'ugv4',label:'four Scout',fixtureKey:'four-scout',experimentName:'TASE-4UGVs',
      algorithmPanel:'paper-leader-ugv4',
      missionActions:['run','record','start','stop'],activationActions:['start'],safeAction:'stop',emergencyCommands:['stop'],robotCount:4,
      activeController:'Custom1',minimumTravelM:0.1,sampleSeconds:40,
      foundation:[
        { definitionId:'scout-gazebo-robot',count:4 },
        { definitionId:'lichtblick-robot-scene',count:1 },{ definitionId:'foxglove-bridge',count:1 },
      ],
    },
    mixed_circle:{
      key:'mixed_circle',label:'mixed circle',fixtureKey:'mixed-circle',experimentName:'RAL-5UAVs4UGVs',
      algorithmPanel:'paper-leader-mixed-circle',
      missionActions:['run','record','takeoff','start','stop'],activationActions:['takeoff','start'],safeAction:'stop',emergencyCommands:['land','stop'],robotCount:9,
      activeController:'Custom1',sampleSeconds:30,
      foundation:[
        { definitionId:'px4-sitl-fs150',count:5 },{ definitionId:'mavros-px4-sitl',count:5 },
        { definitionId:'scout-gazebo-robot',count:4 },
        { definitionId:'lichtblick-robot-scene',count:1 },{ definitionId:'foxglove-bridge',count:1 },
      ],
    },
  };
  if (!lanes[key]) throw new Error(`XGC_PAPER_MISSION_LANE must be knot_fs150, ugv4, or mixed_circle, got ${JSON.stringify(key)}`);
  return lanes[key];
}

function isUAV(robot) {
  return /^\/uav\d+$/.test(robot.namespace || '');
}

function missionRobots() {
  // These three paper fixtures use UAV/Scout namespaces; Experiment slots
  // reference Robot assets and do not contain the assets' kind field.
  return experiment.spec.robots.map((robot) => ({
    namespace:robot.namespace,kind:isUAV(robot) ? 'px4_multirotor' : 'scout_mini',
  }));
}

function uavHoverProgram() {
  return String.raw`
import json,math,sys,time
import rospy
from geometry_msgs.msg import PoseStamped, TwistStamped
from std_msgs.msg import String

namespaces=json.loads(sys.argv[1])
rospy.init_node('xgc_paper_mission_hover_gate',anonymous=True,disable_signals=True)
robots=[]
for namespace in namespaces:
    root='/'+namespace.strip('/')
    controller=root+'/px4_multirotor_controller/'
    altitude=float(rospy.get_param(controller+'takeoff_altitude'))
    override=rospy.get_param(controller+'takeoff_altitudes/'+root.strip('/'),None)
    if type(override) in (int,float) and math.isfinite(override) and override>0:
        altitude=float(override)
    robots.append({'name':root.strip('/'),'altitude':altitude})
deadline=time.time()+180.0
last={'robots':[]}
while time.time()<deadline and not rospy.is_shutdown():
    snapshot=[]
    try:
        for robot in robots:
            root='/'+robot['name']
            stage=rospy.wait_for_message(root+'/custom/statustext',String,timeout=2.0).data
            height=rospy.wait_for_message(root+'/mavros/local_position/pose',PoseStamped,timeout=2.0).pose.position.z
            velocity=rospy.wait_for_message(root+'/mavros/local_position/velocity_local',TwistStamped,timeout=2.0).twist.linear
            speed=(velocity.x**2+velocity.y**2+velocity.z**2)**0.5
            snapshot.append({'name':robot['name'],'takeoffAltitude':robot['altitude'],
              'controller':stage,'height':height,'speed':speed})
    except (rospy.ROSException,rospy.ROSInterruptException):
        time.sleep(0.25)
        continue
    last={'robots':snapshot}
    if all(robot['controller']=='Hover' and robot['speed']<0.15
      and abs(robot['height']-robot['takeoffAltitude'])<0.1
      for robot in snapshot):
        print(json.dumps({'robots':snapshot},separators=(',',':')))
        break
    time.sleep(0.25)
else:
    raise RuntimeError('not every UAV reached Hover at its controller takeoff_altitude within 180 seconds: '
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
from mavros_msgs.msg import State, ExtendedState
from nav_msgs.msg import Path
from std_msgs.msg import String
from tf2_msgs.msg import TFMessage

lane=sys.argv[1]
duration=int(sys.argv[2])
robot_specs=json.loads(sys.argv[3])
control_bounds=json.loads(sys.argv[4])
recording_dir=FilePath(sys.argv[5]).parent
manifest=json.loads((recording_dir/'session-manifest.json').read_text())
scenario_events=[event for event in manifest['recordFacts']['events']
                 if event.get('kind')=='algorithm-file' and event.get('source')=='dmpc-scenario']
if len(scenario_events)!=1:
    raise RuntimeError('Expected one recorded DMPC scenario snapshot for this trial')
frozen=yaml.safe_load((recording_dir/scenario_events[0]['content']['relativePath']).read_text())
period=2*math.pi/abs(frozen['reference']['harmonic0']['omega'][0]) if lane in ('knot_fs150','mixed_circle') else duration
robot_defs=[{'name':item['namespace'].strip('/'),'kind':item['kind']} for item in robot_specs]
count=len(robot_defs)
active='Custom1'
rospy.init_node('xgc_paper_mission_motion_sample',anonymous=True,disable_signals=True)

def wait(topic,kind,timeout=5.0):
    return rospy.wait_for_message(topic,kind,timeout=timeout)

def controller_state(name):
    return wait('/%s/custom/statustext'%name,String).data

def stage_snapshot():
    return [controller_state(robot['name']) for robot in robot_defs]

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
    robot=next(item for item in robot_defs if item['name']==name)
    if robot['kind']=='px4_multirotor':
        message=wait('/%s/mavros/local_position/pose'%name,PoseStamped)
        return [message.pose.position.x,message.pose.position.y,message.pose.position.z]
    message=wait('/%s/simulation/ground_truth/pose'%name,PoseStamped)
    return [message.pose.position.x,message.pose.position.y,message.pose.position.z]

names=[robot['name'] for robot in robot_defs]
# Guard against leaving the Experiment control bounds; these bounds apply to
# robot centers and are passed through without a body-radius adjustment.
field_stop=rospy.Publisher('/command',String,queue_size=1)
field_fault=[]
def check_field(message,name):
    p=message.pose.position
    outside=(p.x<control_bounds['xMin'] or p.x>control_bounds['xMax']
      or p.y<control_bounds['yMin'] or p.y>control_bounds['yMax'])
    if 'zMin' in control_bounds and p.z<control_bounds['zMin']:
        outside=True
    if 'zMax' in control_bounds and p.z>control_bounds['zMax']:
        outside=True
    if outside:
        if not field_fault:
            field_fault.append({'robot':name,'position':[p.x,p.y,p.z]})
        for command in (('land','stop') if lane=='mixed_circle' else (('hover',) if lane=='knot_fs150' else ('stop',))):
            field_stop.publish(String(data=command))
field_subscribers=([rospy.Subscriber('/%s/pose'%name,PoseStamped,check_field,callback_args=name) for name in names]
                   if control_bounds is not None else [])
samples=[]
flight={robot['name']:[] for robot in robot_defs if robot['kind']=='px4_multirotor'}
sample_start=rospy.Time.now().to_sec()
while not rospy.is_shutdown():
    if field_fault: raise RuntimeError('Field braking guard triggered: '+json.dumps(field_fault))
    samples.append({name:position(name) for name in names})
    for name in flight:
        fcu=wait('/%s/mavros/state'%name,State)
        extended=wait('/%s/mavros/extended_state'%name,ExtendedState)
        flight[name].append({'connected':fcu.connected,'armed':fcu.armed,
                            'airborne':extended.landed_state==ExtendedState.LANDED_STATE_IN_AIR})
    if rospy.Time.now().to_sec()-sample_start>=period: break
    rospy.sleep(1.0)

robots=[]
for name in names:
    points=[sample[name] for sample in samples]
    travel=sum(math.sqrt(sum((right[j]-left[j])**2 for j in range(3))) for left,right in zip(points,points[1:]))
    predicted=wait('/%s/alg/predicted_trajectory'%name,Path)
    robot_spec=next(item for item in robot_defs if item['name']==name)
    state=wait('/%s/mavros/state'%name,State) if robot_spec['kind']=='px4_multirotor' else None
    airborne=(all(item['airborne'] and item['armed'] for item in flight[name]) if name in flight else None)
    robots.append({'name':name,'controller':controller_state(name),
      'travelM':travel,'start':points[0],'end':points[-1],
      'predictedPoints':len(predicted.poses),'predictedFrame':predicted.header.frame_id,
      'kind':robot_spec['kind'],'airborne':airborne,
      'fcuConnected':all(item['connected'] for item in flight[name]) if name in flight else None,
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
    'scene':published.get('/xgc/scene',''),
    'formationMarkers':published.get('/xgc/user/formation_markers','')
  }},separators=(',',':')))
`;
}

function safeStateProgram() {
  return String.raw`
import json,math,sys,time
import rospy
from geometry_msgs.msg import PoseStamped,TwistStamped
from mavros_msgs.msg import State, ExtendedState
from std_msgs.msg import String

robot_specs=json.loads(sys.argv[1])
rospy.init_node('xgc_paper_mission_safe_sample',anonymous=True,disable_signals=True)
def wait(topic,kind,timeout=5.0): return rospy.wait_for_message(topic,kind,timeout=timeout)
def controller_state(name):
    return wait('/%s/custom/statustext'%name,String).data
def snapshot():
    robots=[]
    for item in robot_specs:
        name=item['namespace'].strip('/')
        controller=controller_state(name)
        if item['kind']=='px4_multirotor':
            pose=wait('/%s/pose'%name,PoseStamped)
            velocity=wait('/%s/mavros/local_position/velocity_local'%name,TwistStamped)
            state=wait('/%s/mavros/state'%name,State)
            extended=wait('/%s/mavros/extended_state'%name,ExtendedState)
            speed=math.sqrt(velocity.twist.linear.x**2+velocity.twist.linear.y**2+velocity.twist.linear.z**2)
            safe=(controller=='Ready' and extended.landed_state==ExtendedState.LANDED_STATE_ON_GROUND
              and speed<0.25 and not state.armed)
            robots.append({'name':name,'controller':controller,'z':pose.pose.position.z,'speed':speed,
              'kind':item['kind'],'armed':state.armed,'connected':state.connected,'mode':state.mode,
              'landedState':extended.landed_state,'safe':safe})
        else:
            twist=wait('/%s/simulation/ground_truth/twist'%name,TwistStamped)
            linear=math.sqrt(twist.twist.linear.x**2+twist.twist.linear.y**2)
            angular=abs(twist.twist.angular.z)
            safe=controller=='Ready' and linear<0.05 and angular<0.1
            robots.append({'name':name,'controller':controller,'kind':item['kind'],
              'linearSpeed':linear,'angularSpeed':angular,'safe':safe})
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
