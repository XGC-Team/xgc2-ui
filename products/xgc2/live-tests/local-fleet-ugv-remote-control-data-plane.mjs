/* global console,process,setTimeout,URL */
import { execFile as execFileCallback } from 'node:child_process';
import { existsSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import {
  SYSTEM_EXPERIMENT_RUNNER,
  activeSystemRunnerForExperiment,
  assertNoActiveSystemRunner,
  experimentOwnedProcesses,
  getJSON,
  resolveManagedFixture,
  resolveLocalFleetCoreContainer,
  startExperimentThroughUI,
  stopExperimentThroughUI,
  systemRunnerHistory,
} from './experiment-system-runner-e2e.mjs';
import {
  MECANUM_LIST_METRIC_CONTRACT,
  assertConnectionTransition,
  assertControllerRobotIDs,
  assertFinalGlobalCleanup,
  assertMecanumRunningReadouts,
  assertMecanumStoppedReadoutSamples,
  assertMotionIsolation,
  assertPanelRunClick,
  assertPanelStopClick,
  assertRemoteActionResponse,
  assertStoppedMotion,
  assertStopOwnership,
  composeDisconnectedBaseline,
  panelRunInputOverridesMatch,
  panelWorkflowRunId,
  resolveRemoteControlSelection,
  robotSlotRun,
  runIsActive,
  selectForwardClearRobotID,
} from './local-fleet-ugv-remote-control-contract.mjs';

const execFile = promisify(execFileCallback);
const kind = requiredChoice('XGC_UGV_REMOTE_KIND',['scout','mecanum'],'scout');
const fixture = kind === 'scout'
  ? { key:'four-scout',name:'4 Scout Mini vehicles experiment' }
  : { key:'five-px4-two-mecanum',name:'5 PX4 multirotors + 2 Mecanum UGVs experiment' };
const configuration = {
  webUrl:requiredURL('XGC_UGV_REMOTE_WEB_URL','http://127.0.0.1:5174'),
  experimentId:optionalID('XGC_UGV_REMOTE_EXPERIMENT_ID'),
  selectedRobotIDs:optionalCSV('XGC_UGV_REMOTE_SELECTED_ROBOT_IDS'),
  evidencePath:required('XGC_UGV_REMOTE_EVIDENCE'),
  coreContainer:await resolveLocalFleetCoreContainer('XGC_UGV_REMOTE_CORE_CONTAINER'),
};
const processDefinition = kind === 'scout' ? 'scout-gazebo-robot' : 'mecanum-gazebo-robot';
const robotRuntimeWorkflowInstance = 'panel-robot-instruments';
const robotRuntimePanelId = 'robot-instruments';
const robotControlPanelId = 'robot-control';
const minimumDisplacementMeters = 0.05;
const expectedLinearX = kind === 'mecanum' ? 1 / 3 : 0.5;
const waitTimeoutMs = 180_000;
const browserTeardownSettleMs = 1_000;

mkdirSync(dirname(configuration.evidencePath),{ recursive:true });
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || [
  chromium.executablePath(),'/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
  '/usr/bin/chromium','/usr/bin/chromium-browser',
].find((candidate) => candidate && existsSync(candidate));
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const context = await browser.newContext({ viewport:{ width:1600,height:1000 } });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
const actionResponses = [];
let runId = '';
let startObservation = '';
let experiment;
let expectedUGVs = [];
let mecanumReadouts;
let forwardKeyDown=false;
let motionSamples;
let arcMotion;
let reconnectMotionSamples;
let primaryFailure;
let passMessage='';
let finalCleanup;
page.on('pageerror',(error) => pageErrors.push(error.message));
page.on('console',(message) => {
  if (message.type() === 'error') consoleErrors.push({ message:message.text(),location:message.location() });
});
page.on('response',async (response) => {
  const path = new URL(response.url()).pathname;
  if (response.request().method() !== 'POST'
    || path !== '/api/execution-targets/local/robot-motion-intent') return;
  let request;
  try { request=response.request().postDataJSON(); } catch { return; }
  const body=await response.json().catch(() => undefined);
  actionResponses.push({ status:response.status(),url:response.url(),request,intent:request,response:body });
});

try {
  experiment = await resolveManagedFixture(context,configuration.webUrl,{
    ...fixture,resourceId:configuration.experimentId,
  });
  configuration.experimentId=experiment.head.resourceId;
  expectedUGVs=experiment.spec.robots.filter((robot) => (
    kind === 'scout' ? Object.hasOwn(robot,'scout') : Object.hasOwn(robot,'mecanum')
  ));
  const selection=resolveRemoteControlSelection(
    expectedUGVs.map((robot) => robot.id),configuration.selectedRobotIDs,
    configuration.selectedRobotIDs.length===0 ? selectForwardClearRobotID(expectedUGVs) : '',
  );
  if (selection.selectedRobotIDs.length!==1) {
    throw new Error(`live remote-control evidence requires exactly one selected UGV, got ${selection.selectedRobotIDs.length}`);
  }
  if (kind==='scout' && (expectedUGVs.length!==4 || selection.siblingRobotIDs.length!==3)) {
    throw new Error('4-Scout slot isolation requires one selected Scout and exactly three siblings');
  }
  const faultRobotId=selection.selectedRobotIDs[0];
  await openExperiment(page);
  await assertNoActiveSystemRunner(context,configuration.webUrl);
  await selectSimulation(page);
  await selectGCS(page);

  const runButton = page.locator(
    `[data-xgc-role="experiment-run"][data-xgc-id="${configuration.experimentId}"]`,
  );
  await runButton.waitFor({ state:'visible',timeout:30_000 });
  if (await runButton.isDisabled()) {
    throw new Error(`Run is disabled: ${await runButton.getAttribute('title') || 'no reason'}`);
  }
  const started = await startExperimentThroughUI({
    page,context,webUrl:configuration.webUrl,experiment,runMode:'simulation',
  });
  runId=started.run.id;
  startObservation='system-runner-panel-dispatch';
  const robotPanelRoot=panelWorkflowRunId(
    started.dispatchMembers,robotRuntimeWorkflowInstance,runId,
  );
  const running = await waitFor(async () => {
    const owned = await experimentOwnedProcesses(context,configuration.webUrl,runId);
    const ugvs = owned.filter((item) => item.definitionId === processDefinition);
    if (ugvs.length !== expectedUGVs.length || !ugvs.every(processReady)) return undefined;
    return { owned,ugvs };
  },waitTimeoutMs,'authored UGV simulation providers did not become ready');
  const ugvProcesses = running.owned.filter((item) => item.definitionId === processDefinition);
  if (ugvProcesses.length !== expectedUGVs.length) {
    throw new Error(`expected ${expectedUGVs.length} authored ${processDefinition} Processes, got ${ugvProcesses.length}`);
  }
  const robots = ugvProcesses.map((item) => robotFromProcess(item,expectedUGVs));
  assertControllerRobotIDs(robots.map((robot) => robot.robotId),expectedUGVs.map((robot) => robot.id));
  const authoredRobotIds=expectedUGVs.map((robot) => robot.id);
  const initialConnections=await waitForRobotProjection(robotPanelRoot,authoredRobotIds,true);
  const originalSlots=await Promise.all(authoredRobotIds.map(async (robotId) => ({
    robotId,runRef:await resolveRobotSlot(robotPanelRoot,robotId),
  })));
  let beforeRefresh;
  if (kind==='mecanum') {
    await selectInstrumentListView(page);
    beforeRefresh=await waitForMecanumRunningReadouts(page,authoredRobotIds,'before refresh');
  }
  await page.reload({ waitUntil:'domcontentloaded',timeout:30_000 });
  await waitForExperimentPage(page);
  await selectGCS(page);
  const restoredRun=await activeSystemRunnerForExperiment(
    context,configuration.webUrl,configuration.experimentId,
  );
  if (restoredRun?.id!==runId) {
    throw new Error(`${kind} refresh lost System Runner ${runId}`);
  }
  const refreshedConnections=await waitForRobotProjection(robotPanelRoot,authoredRobotIds,true);
  const refreshedSlots=await waitForSlotIdentityRecovery(robotPanelRoot,originalSlots);
  const refreshRecovery={
    rootRunId:restoredRun.id,connections:refreshedConnections,
    slots:refreshedSlots,
  };
  if (kind==='mecanum') {
    await selectInstrumentListView(page);
    const afterRefresh=await waitForMecanumRunningReadouts(page,authoredRobotIds,'after refresh');
    mecanumReadouts={ beforeRefresh,afterRefresh,refreshRunId:restoredRun.id };
  }
  await selectRobotCards(page,selection.selectedRobotIDs);
  const preparationStops=await Promise.all(originalSlots
    .filter(({ robotId }) => selection.selectedRobotIDs.includes(robotId))
    .map(({ robotId,runRef }) => (
      stopOrchestrationRun(runRef,`Prepare ${robotId} for browser-owned Panel reconnect evidence`)
    )));
  const preparedDisconnected=await waitForRobotProjectionStates(robotPanelRoot,
    connectionStateExpectations(selection.selectedRobotIDs,selection.siblingRobotIDs));
  const independentSlotStop=await waitForIndependentSlotStop({
    panelRoot:robotPanelRoot,originalSlots,stoppedRobotId:faultRobotId,
    siblingRobotIds:selection.siblingRobotIDs,
  });
  await waitForRobotTelemetryMessageState(
    robots,selection.siblingRobotIDs,selection.selectedRobotIDs,
  );

  const firstPanelRun=await clickInstrumentPanelRun(page,selection.selectedRobotIDs);
  const firstPanelChild=await panelRunChild(
    firstPanelRun.run.id,'run-selected-panel',robotRuntimeWorkflowInstance,'supervised',
  );
  const firstPanelSlots=await Promise.all(selection.selectedRobotIDs.map(async (robotId) => ({
    robotId,runRef:await resolveRobotSlot(firstPanelChild,robotId),
  })));
  const firstConnected=await waitForRobotProjection(robotPanelRoot,authoredRobotIds,true);
  const firstConnectionTransitions=selection.selectedRobotIDs.map((robotId) => assertConnectionTransition({
    before:initialConnections,disconnected:preparedDisconnected,reconnected:firstConnected,
    faultRobotId:robotId,stableRobotIDs:selection.siblingRobotIDs,
    beforeOwnerRunId:requiredRunRef(originalSlots,robotId).runId,
    afterOwnerRunId:requiredRunRef(firstPanelSlots,robotId).runId,
  }));

  const panelSelector = '[data-xgc-role="experiment-panel"]'
    + '[data-xgc-id="robot-control"][data-panel-id="robot-control"]';
  const panel = page.locator(panelSelector);
  await panel.waitFor({ state:'visible',timeout:30_000 });
  await panel.scrollIntoViewIfNeeded();
  const open = panel.locator('[data-xgc-role="robot-remote-control-open"]');
  await open.waitFor({ state:'visible',timeout:30_000 });
  if (await open.isDisabled()) {
    throw new Error(`remote control is disabled: ${await open.getAttribute('title') || 'no reason'}`);
  }
  const initialActionIndex=actionResponses.length;
  await open.click();

  const controller = page.locator('[data-xgc-role="robot-remote-control"]');
  await controller.waitFor({ state:'visible',timeout:30_000 });
  const controllerId=requiredAttribute(await controller.getAttribute('data-xgc-id'),'controller data-xgc-id');
  const controllerRobotIDs = requiredCSV(await controller.getAttribute('data-xgc-robot-ids'));
  assertControllerRobotIDs(controllerRobotIDs,selection.selectedRobotIDs);
  await waitForActionCount(page,initialActionIndex+1);
  const initialAction=assertRemoteActionResponse(actionResponses[initialActionIndex],{
    label:'initial zero',experimentId:configuration.experimentId,controllerId,
    robotIds:selection.selectedRobotIDs,
    intent:{ gear:1,longitudinal:0,lateral:0,yaw:0 },
  });
  await waitForActionSucceeded(initialAction,'initial zero');
  await waitForControllerReady(controller);

  const before = await sampleRobotTopics(robots);
  const firstForwardIndex=actionResponses.length;
  await page.keyboard.down('ArrowUp');
  forwardKeyDown=true;
  await waitForActionCount(page,firstForwardIndex+1);
  const firstForwardAction=assertRemoteActionResponse(actionResponses[firstForwardIndex],{
    label:'forward',experimentId:configuration.experimentId,controllerId,
    robotIds:selection.selectedRobotIDs,
    intent:{ gear:1,longitudinal:1,lateral:0,yaw:0 },
  });
  await waitForActionSucceeded(firstForwardAction,'forward');
  await waitForControllerReady(controller);
  await page.waitForTimeout(2_000);
  const moving = await sampleRobotTopics(robots);
  await page.waitForTimeout(2_000);
  const after = await sampleRobotTopics(robots);
  motionSamples={ before,moving,after };
  const motion=assertMotionIsolation({
    before,moving,after,
    selectedRobotIDs:selection.selectedRobotIDs,siblingRobotIDs:selection.siblingRobotIDs,
    expectedLinearX,minimumDisplacementMeters,
  });

  const firstReleaseIndex=actionResponses.length;
  await page.keyboard.up('ArrowUp');
  forwardKeyDown=false;
  await waitForActionCount(page,firstReleaseIndex+1);
  const firstReleaseAction=assertRemoteActionResponse(actionResponses[firstReleaseIndex],{
    label:'release zero',experimentId:configuration.experimentId,controllerId,
    robotIds:selection.selectedRobotIDs,
    intent:{ gear:1,longitudinal:0,lateral:0,yaw:0 },
  });
  await waitForActionSucceeded(firstReleaseAction,'release zero');
  await waitForControllerReady(controller);
  const firstReleased=await sampleRobotTopics(robots);
  await page.waitForTimeout(1_500);
  const firstSettled=await sampleRobotTopics(robots);
  const firstStopTruth=assertStoppedMotion({
    released:firstReleased,settled:firstSettled,robotIDs:selection.selectedRobotIDs,
  });
  const firstForcedZero=await forceStop(controller,controllerId,selection.selectedRobotIDs);

  if (kind==='scout') {
    const selected=robots.find(robot=>robot.robotId===faultRobotId);
    try {
      await page.keyboard.down('ArrowUp');
      await page.keyboard.down('ArrowLeft');
      await waitForControllerReady(controller);
      arcMotion={turning:await observeScoutArc(selected.modelName,10)};
    } finally {
      await page.keyboard.up('ArrowLeft');
      await page.keyboard.up('ArrowUp');
    }
    await waitForControllerReady(controller);
    arcMotion.stopped=await observeScoutArc(selected.modelName,3);
    const turning=arcMotion.turning.at(-1),stopped=arcMotion.stopped.at(-1);
    if (!(turning.forward>.15 && Math.abs(turning.yawRate)>.05 && Math.abs(turning.lateral)<.2)) {
      throw new Error(`Scout combined forward/turn drifted or failed to turn: ${JSON.stringify(turning)}`);
    }
    if (!(stopped.speed<.04)) throw new Error(`Scout retained motion after releasing both keys: ${JSON.stringify(stopped)}`);
  }

  const firstDisconnect=await clickInstrumentPanelStop(page,firstPanelRun.run.id);
  const disconnectedConnections=await waitForRobotProjectionStates(
    robotPanelRoot,connectionStateExpectations(selection.selectedRobotIDs,selection.siblingRobotIDs),
  );
  await waitForRobotTelemetryMessageState(
    robots,selection.siblingRobotIDs,selection.selectedRobotIDs,
  );

  const disconnectedForwardIndex=actionResponses.length;
  await page.keyboard.down('ArrowUp');
  forwardKeyDown=true;
  await waitForActionCount(page,disconnectedForwardIndex+1);
  const disconnectedForward=assertRemoteActionResponse(actionResponses[disconnectedForwardIndex],{
    label:'disconnected forward',experimentId:configuration.experimentId,controllerId,
    robotIds:selection.selectedRobotIDs,
    intent:{ gear:1,longitudinal:1,lateral:0,yaw:0 },
    status:409,
  });
  await page.keyboard.up('ArrowUp');
  forwardKeyDown=false;
  const liveSiblingSamples=await sampleRobotTopics(robots.filter(
    (robot) => selection.siblingRobotIDs.includes(robot.robotId),
  ));
  const reconnectBefore=composeDisconnectedBaseline(
    firstSettled,liveSiblingSamples,selection.selectedRobotIDs,
  );

  const restartRoot=await clickInstrumentPanelRun(page,selection.selectedRobotIDs);
  const restartedPanelChild=await panelRunChild(
    restartRoot.run.id,'run-selected-panel','panel-robot-instruments','supervised',
  );
  const restartedSlots=await Promise.all(selection.selectedRobotIDs.map(async (robotId) => ({
    robotId,runRef:await resolveRobotSlot(restartedPanelChild,robotId),
  })));
  const reconnectedConnections=await waitForRobotProjection(robotPanelRoot,authoredRobotIds,true);
  await waitForRobotTelemetryMessageState(robots,authoredRobotIds,[]);
  const connectionTransition=selection.selectedRobotIDs.map((robotId) => assertConnectionTransition({
    before:firstConnected,disconnected:disconnectedConnections,reconnected:reconnectedConnections,
    faultRobotId:robotId,stableRobotIDs:selection.siblingRobotIDs,
    beforeOwnerRunId:requiredRunRef(firstPanelSlots,robotId).runId,
    afterOwnerRunId:requiredRunRef(restartedSlots,robotId).runId,
  }));
  const reconnectForwardIndex=actionResponses.length;
  await page.keyboard.down('ArrowUp');
  forwardKeyDown=true;
  await waitForActionCount(page,reconnectForwardIndex+1);
  const reconnectForwardAction=assertRemoteActionResponse(actionResponses[reconnectForwardIndex],{
    label:'reconnected forward',experimentId:configuration.experimentId,controllerId,
    robotIds:selection.selectedRobotIDs,
    intent:{ gear:1,longitudinal:1,lateral:0,yaw:0 },
  });
  await waitForActionSucceeded(reconnectForwardAction,'reconnected forward');
  await waitForControllerReady(controller);
  await page.waitForTimeout(2_000);
  const reconnectMoving=await sampleRobotTopics(robots);
  await page.waitForTimeout(2_000);
  const reconnectAfter=await sampleRobotTopics(robots);
  reconnectMotionSamples={ before:reconnectBefore,moving:reconnectMoving,after:reconnectAfter };
  const reconnectMotion=assertMotionIsolation({
    before:reconnectBefore,moving:reconnectMoving,after:reconnectAfter,
    selectedRobotIDs:selection.selectedRobotIDs,siblingRobotIDs:selection.siblingRobotIDs,
    expectedLinearX,minimumDisplacementMeters,
  });

  const closeZero=await closeRemoteController(controller,controllerId,selection.selectedRobotIDs);
  await page.keyboard.up('ArrowUp');
  forwardKeyDown=false;
  const reconnectReleased=await sampleRobotTopics(robots);
  await page.waitForTimeout(1_500);
  const reconnectSettled=await sampleRobotTopics(robots);
  const reconnectStopTruth=assertStoppedMotion({
    released:reconnectReleased,settled:reconnectSettled,robotIDs:selection.selectedRobotIDs,
  });

  const secondDisconnect=await clickInstrumentPanelStop(page,restartRoot.run.id);
  const disconnectedBeforeOwnershipProbe=await waitForRobotProjectionStates(
    robotPanelRoot,connectionStateExpectations(selection.selectedRobotIDs,selection.siblingRobotIDs),
  );
  const stopProbeRoot=await startPanelRunViaAPI(robotControlPanelId,{
    robotIds:selection.selectedRobotIDs,
  },'Create one Session-owned Robot control workflow for Stop ownership evidence');
  const stopProbeChild=await panelRunChild(
    stopProbeRoot.run.id,'run-selected-panel','panel-robot-control','supervised',
  );
  const stopProbe=await waitForRobotControlPanelChild(stopProbeRoot.run.id,stopProbeChild);

  const scenePaths = await sampleScenePaths(robots.filter((robot) => selection.selectedRobotIDs.includes(robot.robotId)));
  for (const path of scenePaths) {
    if (path.pointCount < 2 || path.span < minimumDisplacementMeters) {
      throw new Error(`${path.id} is not a historical trajectory: ${JSON.stringify(path)}`);
    }
  }
  await page.screenshot({ path:`${configuration.evidencePath}.running.png`,fullPage:true });
  if (pageErrors.length > 0 || consoleErrors.length > 0) {
    throw new Error(`browser errors: ${JSON.stringify({ pageErrors,consoleErrors })}`);
  }
  const actionRunStates=[];
  const actionRunRefs=[];
  if (actionResponses.some((item) => item.status===202 && item.response?.run)) {
    throw new Error(`remote motion intent created a Workflow Run: ${JSON.stringify(actionResponses)}`);
  }

  const stopResult=await stopExperimentThroughUI({
    page,context,webUrl:configuration.webUrl,experiment,runId,timeoutMs:waitTimeoutMs,
  });
  if (kind==='mecanum') {
    const stopCompletedAtMs=Date.now();
    mecanumReadouts={
      ...mecanumReadouts,stopCompletedAtMs,
      stoppedSamples:await captureMecanumStoppedReadoutSamples(
        page,authoredRobotIds,stopCompletedAtMs,
      ),
    };
  }
  const sessionRunRefs=dedupeRunRefs([
    { targetId:'local',runId },
    robotPanelRoot,...originalSlots.map(({ runRef }) => runRef),
    ...actionRunRefs,
    { targetId:'local',runId:firstPanelRun.run.id },
    firstPanelChild,...firstPanelSlots.map(({ runRef }) => runRef),
    { targetId:'local',runId:restartRoot.run.id },
    restartedPanelChild,...restartedSlots.map(({ runRef }) => runRef),
    { targetId:'local',runId:stopProbeRoot.run.id },stopProbeChild,
  ]);
  const sessionRuns=await Promise.all(sessionRunRefs.map((root) => orchestrationRun(root)));
  const restartOwnedProcesses=await experimentOwnedProcesses(
    context,configuration.webUrl,restartRoot.run.id,
  );
  const firstPanelOwnedProcesses=await experimentOwnedProcesses(
    context,configuration.webUrl,firstPanelRun.run.id,
  );
  const ownedProcesses=dedupeProcesses([
    ...stopResult.ownedProcesses,...firstPanelOwnedProcesses,...restartOwnedProcesses,
  ]);
  assertStopOwnership({
    sessions:stopResult.sessions,sessionRuns,ownedProcesses,
  });
  await assertBrowserErrorsAfterSettle(page,'after Experiment Stop');
  await page.screenshot({ path:`${configuration.evidencePath}.png`,fullPage:true });
  const evidence = {
    experimentId:configuration.experimentId,runId,runMode:'simulation',
    kind,panelSelector,startObservation,startupLatencyMs:started.latencyMs,
    selection:{ ...selection,faultRobotId,controllerId,controllerRobotIDs },refreshRecovery,
    actionResponses,processes:ugvProcesses.map(processEvidence),
    ros:{ before,moving,after,motion,firstReleased,firstSettled,firstStopTruth,arcMotion,
      reconnectBefore,reconnectMoving,reconnectAfter,reconnectMotion,
      reconnectReleased,reconnectSettled,reconnectStopTruth },
    connection:{ robotPanelRoot,initialConnections,originalSlots,preparationStops,preparedDisconnected,
      independentSlotStop,
      firstPanelRun:firstPanelRun.run,firstPanelChild,firstPanelSlots,firstConnected,
      firstConnectionTransitions,firstDisconnect,disconnectedConnections,disconnectedForward,
      restartRoot:restartRoot.run,restartedPanelChild,restartedSlots,
      connectionTransition,reconnectedConnections,secondDisconnect,
      disconnectedBeforeOwnershipProbe },
    zeroActions:{ firstForcedZero,closeZero },scenePaths,
    stop:{ result:stopResult,actionRunStates,sessionRuns,ownedProcesses,
      stopProbeRoot:stopProbeRoot.run,stopProbe },
    mecanumReadouts,pageErrors,consoleErrors,
  };
  writeFileSync(configuration.evidencePath,`${JSON.stringify(evidence,null,2)}\n`);
  runId = '';
  passMessage=`PASS: ${kind} browser remote control isolated ${faultRobotId}, preserved ${selection.siblingRobotIDs.length} live sibling slot Run(s), recovered across refresh, emitted zero on Stop/close, and reached total cleanup; evidence: ${configuration.evidencePath}`;
} catch (cause) {
  primaryFailure=cause;
  if (forwardKeyDown) {
    await page.keyboard.up('ArrowUp').catch(() => undefined);
    forwardKeyDown=false;
  }
  await page.screenshot({ path:`${configuration.evidencePath}.failure.png`,fullPage:true }).catch(() => undefined);
  writeFileSync(`${configuration.evidencePath}.failure.json`,`${JSON.stringify({
    experimentId:configuration.experimentId,runId,kind,startObservation,actionResponses,
    motionSamples,arcMotion,reconnectMotionSamples,pageErrors,consoleErrors,
    error:cause instanceof Error ? cause.message : String(cause),
  },null,2)}\n`);
} finally {
  if (forwardKeyDown) await page.keyboard.up('ArrowUp').catch(() => undefined);
  try {
    finalCleanup=await cleanupRemoteHarness(page);
    await assertBrowserErrorsAfterSettle(page,'after final teardown');
    writeFileSync(`${configuration.evidencePath}.cleanup.json`,`${JSON.stringify(finalCleanup,null,2)}\n`);
  } catch (cleanupCause) {
    primaryFailure=primaryFailure
      ? new AggregateError([primaryFailure,cleanupCause],'UGV remote E2E failed and final cleanup did not close globally')
      : cleanupCause;
    writeFileSync(`${configuration.evidencePath}.cleanup.failure.json`,`${JSON.stringify({
      experimentId:configuration.experimentId,runId,kind,pageErrors,consoleErrors,
      error:cleanupCause instanceof Error ? cleanupCause.message : String(cleanupCause),
    },null,2)}\n`);
  }
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}

if (primaryFailure) throw primaryFailure;
console.log(passMessage);

async function openExperiment(page) {
  await page.goto(`${configuration.webUrl}/#/experiments/${configuration.experimentId}`,{
    waitUntil:'domcontentloaded',timeout:30_000,
  });
  await waitForExperimentPage(page);
}

async function assertBrowserErrorsAfterSettle(page,phase) {
  await page.waitForTimeout(browserTeardownSettleMs);
  if (pageErrors.length > 0 || consoleErrors.length > 0) {
    throw new Error(`${phase} browser errors: ${JSON.stringify({ pageErrors,consoleErrors })}`);
  }
}

async function waitForExperimentPage(page) {
  await page.locator('[data-xgc-role="experiment-topbar-actions"]').waitFor({ state:'visible',timeout:30_000 });
  await page.locator('[data-xgc-role="experiment-state-loading"]')
    .waitFor({ state:'detached',timeout:30_000 }).catch(() => undefined);
}

async function selectSimulation(page) {
  const root = page.locator(
    `[data-xgc-role="experiment-run-mode-select"][data-xgc-id="${configuration.experimentId}"]`,
  );
  await root.waitFor({ state:'visible',timeout:30_000 });
  await root.getByRole('button').click();
  await page.getByRole('option',{ name:'simulation',exact:true }).click();
  await page.locator(
    `[data-xgc-role="experiment-run-mode"][data-xgc-id="${configuration.experimentId}"][data-xgc-value="simulation"]`,
  ).waitFor({ state:'visible',timeout:30_000 });
}

async function selectGCS(page) {
  const tab = page.getByRole('tab',{ name:'GCS',exact:true });
  await tab.waitFor({ state:'visible',timeout:30_000 });
  if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
}

async function selectInstrumentListView(page) {
  const button=page.locator(
    '[data-xgc-role="robot-instrument-view"][data-xgc-id="list"]',
  );
  await button.waitFor({ state:'visible',timeout:30_000 });
  if (await button.getAttribute('aria-pressed')!=='true') await button.click();
  await waitFor(async () => await button.getAttribute('aria-pressed')==='true' ? true : undefined,
    10_000,'Robot instruments did not switch to list view');
}

async function waitForMecanumRunningReadouts(page,robotIDs,label) {
  return waitFor(async () => {
    const snapshot=await mecanumReadoutSnapshot(page,robotIDs);
    try {
      return assertMecanumRunningReadouts(snapshot,robotIDs);
    } catch {
      return undefined;
    }
  },30_000,`Mecanum list readouts did not become live ${label}`,100);
}

async function captureMecanumStoppedReadoutSamples(page,robotIDs,stopCompletedAtMs) {
  const samples=[];
  for (const elapsedMs of [1_000,1_500,2_000]) {
    const remainingMs=stopCompletedAtMs+elapsedMs-Date.now();
    if (remainingMs>0) await page.waitForTimeout(remainingMs);
    samples.push(await mecanumReadoutSnapshot(page,robotIDs));
  }
  return assertMecanumStoppedReadoutSamples(samples,robotIDs,stopCompletedAtMs);
}

async function mecanumReadoutSnapshot(page,robotIDs) {
  return page.locator('[data-xgc-role="run-robot-card"]').evaluateAll((elements,input) => {
    const expectedIDs=new Set(input.robotIDs);
    return {
      capturedAtMs:Date.now(),
      cards:elements.filter((card) => expectedIDs.has(card.getAttribute('data-xgc-id')||''))
        .map((card) => ({
          id:card.getAttribute('data-xgc-id')||'',
          presentation:card.getAttribute('data-xgc-presentation')||'',
          platform:card.getAttribute('data-xgc-platform')||'',
          metrics:[...card.querySelectorAll(':scope > dl > [data-xgc-role]')]
            .filter((metric) => input.contract.some(({ role }) => role===metric.getAttribute('data-xgc-role')))
            .map((metric) => {
              const readout=metric.querySelector('[data-xgc-role="robot-list-metric-readout"]');
              return {
                role:metric.getAttribute('data-xgc-role')||'',
                title:(metric.querySelector('.robot-list-metric-title')?.textContent||'').trim(),
                rate:(metric.querySelector('[data-xgc-role="robot-list-metric-rate"]')?.textContent||'').trim(),
                values:[...(readout?.querySelectorAll('.robot-list-metric-digits')||[])].map((digits) => {
                  const sign=digits.previousElementSibling?.classList.contains('robot-list-metric-sign')
                    ? digits.previousElementSibling.textContent||'' : '';
                  return `${sign}${digits.textContent||''}`.trim();
                }),
              };
            }),
        })),
    };
  },{ robotIDs,contract:MECANUM_LIST_METRIC_CONTRACT });
}

async function selectRobotCards(page,selectedRobotIDs) {
  const cards=page.locator('[data-xgc-role="run-robot-card"]');
  await cards.first().waitFor({ state:'visible',timeout:30_000 });
  for (let index=0;index<await cards.count();index+=1) {
    const card=cards.nth(index);
    if (await card.getAttribute('aria-pressed')==='true') await card.click();
  }
  for (const robotId of selectedRobotIDs) {
    const card=page.locator(
      `[data-xgc-role="run-robot-card"][data-xgc-id="${robotId}"]`,
    );
    await card.waitFor({ state:'visible',timeout:30_000 });
    await card.click();
    await waitFor(async () => await card.getAttribute('aria-pressed')==='true' ? true : undefined,
      10_000,`${robotId} Robot card did not become selected`);
  }
  const pressed=await cards.evaluateAll((nodes) => nodes
    .filter((node) => node.getAttribute('aria-pressed')==='true')
    .map((node) => node.getAttribute('data-xgc-id'))
    .filter((value) => typeof value==='string' && value.length>0));
  assertControllerRobotIDs(pressed,selectedRobotIDs);
}

async function clickInstrumentPanelRun(page,selectedRobotIDs) {
  const control=page.locator(
    `[data-xgc-role="panel-workflow-run"][data-xgc-id="${robotRuntimePanelId}"]`,
  );
  await control.waitFor({ state:'visible',timeout:30_000 });
  await waitFor(async () => (
    await control.isDisabled()
      ? undefined
      : true
  ),30_000,`instrument Panel Run is disabled: ${await control.getAttribute('title') || 'no reason'}`);
  const responsePromise=page.waitForResponse((candidate) => {
    if (candidate.request().method()!=='POST'
      || new URL(candidate.url()).pathname!=='/api/execution-targets/local/orchestration-runs') return false;
    try {
      const request=candidate.request().postDataJSON();
      return request?.actionId===SYSTEM_EXPERIMENT_RUNNER.actions.runPanel
        && request?.parameters?.panelId===robotRuntimePanelId
        && request.parameters.runMode==='simulation'
        && panelRunInputOverridesMatch(
          request.parameters.inputOverridesJson,selectedRobotIDs,
        );
    } catch { return false; }
  },{ timeout:30_000 });
  await control.click();
  const response=await responsePromise;
  const request=response.request().postDataJSON();
  const body=await responseJSON(response);
  const run=assertPanelRunClick({ status:response.status(),request,response:body },{
    experimentId:configuration.experimentId,panelId:robotRuntimePanelId,robotIds:selectedRobotIDs,
  });
  return { request,response:body,status:response.status(),run };
}

async function clickInstrumentPanelStop(page,rootRunId) {
  const control=page.locator(
    `[data-xgc-role="panel-workflow-stop"][data-xgc-id="${robotRuntimePanelId}"]`,
  );
  await control.waitFor({ state:'visible',timeout:30_000 });
  if (await control.isDisabled()) {
    throw new Error(`instrument Panel Stop is disabled: ${await control.getAttribute('title') || 'no reason'}`);
  }
  const expectedPath=`/api/execution-targets/local/orchestration-runs/${encodeURIComponent(rootRunId)}/stop-set`;
  const responsePromise=page.waitForResponse((candidate) => (
    candidate.request().method()==='POST'
    && new URL(candidate.url()).pathname===expectedPath
    && candidate.status()>=200 && candidate.status()<300
  ),{ timeout:30_000 });
  await control.click();
  const response=await responsePromise;
  const request=response.request().postDataJSON();
  const body=await responseJSON(response);
  assertPanelStopClick({ status:response.status(),request,response:body },{
    rootRunId,panelId:robotRuntimePanelId,
  });
  const run=await waitFor(async () => {
    const current=await orchestrationRun({ targetId:'local',runId:rootRunId });
    return runIsActive(current) ? undefined : current;
  },30_000,`instrument Panel root ${rootRunId} did not stop after its header control click`);
  await page.locator(
    `[data-xgc-role="panel-workflow-run"][data-xgc-id="${robotRuntimePanelId}"]`,
  ).waitFor({ state:'visible',timeout:30_000 });
  return { request,response:body,status:response.status(),run };
}

async function stopVisibleRun(page) {
  const stop = page.locator('[data-xgc-role="experiment-stop"]');
  if (await stop.count() && !await stop.isDisabled()) {
    await stop.click();
    await page.locator('[data-xgc-role="experiment-run"]').waitFor({ state:'visible',timeout:waitTimeoutMs });
  }
}

async function cleanupRemoteHarness(page) {
  await stopVisibleRun(page).catch(() => undefined);
  const sessions=await globalExperimentSessions();
  if (sessions.length>0 && configuration.experimentId) {
    await stopAllThroughAPI('Final UGV remote E2E teardown after browser cleanup').catch(() => undefined);
    await waitFor(async () => {
      const current=await globalExperimentSessions();
      return current.length===0 ? current : undefined;
    },waitTimeoutMs,'global Experiment Sessions did not close during UGV remote teardown');
  }

  const actionRuns=await cleanupActionChildren();
  const history=await systemRunnerHistory(context,configuration.webUrl);
  const remainingRoots=(history.entries ?? [])
    .filter((entry) => entry.phase==='run' && runIsActive(entry.run))
    .map((entry) => entry.run);
  for (const root of remainingRoots) {
    await stopOrchestrationRun(
      { targetId:root.targetId || 'local',runId:root.id },
      'Final UGV remote E2E teardown of a remaining System root',
    ).catch(() => undefined);
  }

  return waitFor(async () => {
    const snapshot=await globalCleanupSnapshot(actionRuns.map((run) => ({
      targetId:run.targetId || 'local',runId:run.id,
    })));
    return assertFinalGlobalCleanup(snapshot);
  },waitTimeoutMs,'UGV remote E2E did not reach global cleanup closure');
}

async function cleanupActionChildren() {
  return [];
}

async function globalCleanupSnapshot(actionRunRefs) {
  const history=await systemRunnerHistory(context,configuration.webUrl);
  const activeSystemRoots=(history.entries ?? [])
    .filter((entry) => entry.phase==='run' && runIsActive(entry.run))
    .map((entry) => entry.run);
  const sessions=await globalExperimentSessions();
  const runOwnedProcesses=await getJSON(context,configuration.webUrl,
    '/api/execution-targets/local/process-instances?ownerType=orchestration-run&limit=1000');
  const actionRuns=await Promise.all(actionRunRefs.map((ref) => orchestrationRun(ref)));
  return { activeSystemRoots,sessions,runOwnedProcesses,actionRuns };
}

async function globalExperimentSessions() {
  return getJSON(context,configuration.webUrl,
    '/api/execution-targets/local/experiment-sessions');
}

async function stopAllThroughAPI(reason) {
  const requestId=`ugv-remote-stop-all:${Date.now()}:${process.pid}`;
  const request={
    experimentRef:{ domain:'experiment',resourceId:configuration.experimentId,branch:'main' },
    automationRef:{
      domain:SYSTEM_EXPERIMENT_RUNNER.domain,
      resourceId:SYSTEM_EXPERIMENT_RUNNER.resourceId,
      branch:SYSTEM_EXPERIMENT_RUNNER.branch,
    },
    actionId:SYSTEM_EXPERIMENT_RUNNER.actions.stopAll,parameters:{},
    requestId,idempotencyKey:requestId,reason,
  };
  const response=await context.request.post(
    `${configuration.webUrl}/api/execution-targets/local/orchestration-runs`,{ data:request },
  );
  const body=await responseJSON(response);
  if (response.status()!==202 || body?.run?.actionId!==SYSTEM_EXPERIMENT_RUNNER.actions.stopAll) {
    throw new Error(`final stop-all failed: HTTP ${response.status()} ${JSON.stringify(body)}`);
  }
  return body.run;
}

async function waitForActionCount(page,count) {
  await waitFor(async () => actionResponses.length >= count ? true : undefined,
    5_000,`browser did not observe motion-intent POST ${count}`);
  await page.waitForTimeout(50);
}

async function waitForControllerReady(controller) {
  await controller.waitFor({ state:'visible',timeout:30_000 });
}

async function forceStop(controller,controllerId,robotIds) {
  const actionIndex=actionResponses.length;
  const stop=controller.getByRole('button',{ name:'Stop',exact:true });
  await stop.waitFor({ state:'visible',timeout:30_000 });
  await stop.click();
  await waitForActionCount(page,actionIndex+1);
  const action=assertRemoteActionResponse(actionResponses[actionIndex],{
    label:'forced zero',experimentId:configuration.experimentId,controllerId,robotIds,
    intent:{ gear:1,longitudinal:0,lateral:0,yaw:0 },
  });
  const execution=await waitForActionSucceeded(action,'forced zero');
  await waitForControllerReady(controller);
  return { action,execution };
}

async function closeRemoteController(controller,controllerId,robotIds) {
  const actionIndex=actionResponses.length;
  const close=controller.getByRole('button',{ name:'Close remote controller',exact:true });
  await close.waitFor({ state:'visible',timeout:30_000 });
  await close.click();
  await waitForActionCount(page,actionIndex+1);
  const action=assertRemoteActionResponse(actionResponses[actionIndex],{
    label:'close zero',experimentId:configuration.experimentId,controllerId,robotIds,
    intent:{ gear:1,longitudinal:0,lateral:0,yaw:0 },
  });
  const execution=await waitForActionSucceeded(action,'close zero');
  await controller.waitFor({ state:'detached',timeout:30_000 });
  return { action,execution,released:true };
}

async function waitForActionSucceeded(item,label) {
  if (item?.status!==202) {
    throw new Error(`${label} motion intent was not accepted: ${JSON.stringify(item)}`);
  }
  return item;
}

async function resolveRemoteControlLeaf(start,label) {
  let ref=start;
  for (let depth=0;depth<4;depth+=1) {
    const run=await orchestrationRun(ref);
    if (run.actionId==='set-motion-intent') return { ref,run };
    const relations=await getJSON(context,configuration.webUrl,
      `/api/execution-targets/${encodeURIComponent(ref.targetId || 'local')}`
      + `/orchestration-runs/${encodeURIComponent(ref.runId)}/relations`);
    if ((relations.childRuns??[]).length!==1) {
      throw new Error(`${label} control aggregator did not expose one effect-owner child: ${JSON.stringify(relations.childRuns)}`);
    }
    const child=relations.childRuns[0];
    if (!['attached','supervised'].includes(child.relation) || child.cancelPolicy!=='cascade') {
      throw new Error(`${label} control aggregator child lost supervised ownership: ${JSON.stringify(child)}`);
    }
    ref={ targetId:child.targetId || ref.targetId || 'local',runId:child.childRunId };
  }
  throw new Error(`${label} control aggregator exceeded the bounded child depth`);
}

function robotFromProcess(process,authoredRobots) {
  const namespace = String(process.parameters?.namespace || '').replace(/^\/+|\/+$/g,'');
  const modelName = String(process.parameters?.modelName || '').trim();
  if (!namespace || !modelName) throw new Error(`${process.definitionId} has no frozen namespace/modelName`);
  const matches=authoredRobots.filter((robot) => normalizeNamespace(robot.namespace)===namespace);
  if (matches.length!==1) {
    throw new Error(`${process.definitionId} namespace /${namespace} did not map to one authored UGV`);
  }
  return {
    robotId:matches[0].id,namespace,modelName,
    commandTopic:`/${namespace}/cmd_vel`,
    positionTopic:`/${namespace}/simulation/ground_truth/pose`,
    velocityTopic:`/${namespace}/simulation/ground_truth/twist`,
  };
}

async function sampleRobotTopics(robots) {
  const { stdout } = await execFile('docker',[
    'exec','-e','ROS_MASTER_URI=http://127.0.0.1:11311',
    '-e','PYTHONPATH=/opt/ros/noetic/lib/python3/dist-packages',
    configuration.coreContainer,'python3','-c',robotSampleProgram(),JSON.stringify(robots),
  ],{ timeout:30_000,maxBuffer:1024*1024 });
  const samples = JSON.parse(stdout.trim());
  if (!Array.isArray(samples) || samples.length !== robots.length) {
    throw new Error(`invalid ROS robot samples: ${stdout}`);
  }
  return samples;
}

async function observeScoutArc(model,duration) {
  const program=readFileSync(new URL('./fleet-remote-arc-observer.py',import.meta.url),'utf8');
  const {stdout}=await execFile('docker',['exec','-e','ROS_MASTER_URI=http://127.0.0.1:11311',
    '-e','PYTHONPATH=/opt/ros/noetic/lib/python3/dist-packages',configuration.coreContainer,
    'python3','-c',program,model,String(duration)],{timeout:90000,maxBuffer:1024*1024});
  return JSON.parse(stdout);
}

async function waitForRobotTelemetryMessageState(robots,presentRobotIDs,absentRobotIDs) {
  const byID=new Map(robots.map((robot) => [robot.robotId,robot]));
  const streamsFor=(robotIDs,label) => {
    const streams=new Map();
    for (const robotId of robotIDs) {
      const robot=byID.get(robotId);
      if (!robot) throw new Error(`${label} includes unknown Robot ${robotId}`);
      const candidates=[
        { topic:robot.positionTopic,type:'pose-stamped' },
        { topic:robot.velocityTopic,type:'twist-stamped' },
      ];
      for (const stream of candidates) streams.set(`${stream.type}\u0000${stream.topic}`,stream);
    }
    return [...streams.values()];
  };
  const contract={
    present:streamsFor(presentRobotIDs,'present telemetry Robots'),
    absent:streamsFor(absentRobotIDs,'absent telemetry Robots'),
  };
  const { stdout }=await execFile('docker',[
    'exec','-e','ROS_MASTER_URI=http://127.0.0.1:11311',
    '-e','PYTHONPATH=/opt/ros/noetic/lib/python3/dist-packages',
    configuration.coreContainer,'python3','-c',robotTelemetryMessageProgram(),JSON.stringify(contract),
  ],{ timeout:30_000,maxBuffer:1024*1024 });
  const observed=JSON.parse(stdout.trim());
  if (!Array.isArray(observed.present) || !Array.isArray(observed.absent)) {
    throw new Error(`invalid ROS telemetry publisher evidence: ${stdout}`);
  }
  return observed;
}

async function sampleScenePaths(robots) {
  const expectedIDs = robots.map(({ namespace }) => `/${namespace}/path`);
  const { stdout } = await execFile('docker',[
    'exec','-e','ROS_MASTER_URI=http://127.0.0.1:11311',
    '-e','PYTHONPATH=/opt/ros/noetic/lib/python3/dist-packages',
    configuration.coreContainer,'python3','-c',sceneSampleProgram(),JSON.stringify(expectedIDs),
  ],{ timeout:30_000,maxBuffer:1024*1024 });
  const paths = JSON.parse(stdout.trim());
  if (!Array.isArray(paths) || paths.length !== expectedIDs.length) {
    throw new Error(`missing namespaced Path histories: ${stdout}`);
  }
  return paths;
}

async function waitForRobotProjection(runRef,expectedRobotIDs,live,faultRobotId='') {
  const expected=[...new Set(expectedRobotIDs)];
  if (expected.length===0 || expected.length!==expectedRobotIDs.length) {
    throw new Error('Robot projection expectation must be a non-empty unique list');
  }
  if (!live && !faultRobotId) throw new Error('disconnected Robot projection requires faultRobotId');
  return waitFor(async () => {
    const projection=await getJSON(context,configuration.webUrl,
      `/api/execution-targets/${encodeURIComponent(runRef.targetId || 'local')}`
      + `/orchestration-runs/${encodeURIComponent(runRef.runId)}/robots`);
    if (projection.pending) return undefined;
    const robots=projection.robots ?? [];
    const byID=new Map(robots.map((robot) => [robot.id,robot]));
    if (robots.length!==expected.length || byID.size!==expected.length
      || expected.some((robotId) => !byID.has(robotId))) return undefined;
    for (const robotId of expected) {
      const robot=byID.get(robotId);
      if (!Number.isSafeInteger(robot.connectionEpoch) || robot.connectionEpoch<1) return undefined;
      if (live && robot.connectionState!=='live') return undefined;
      if (!live && robotId===faultRobotId && robot.connectionState==='live') return undefined;
      if (!live && robotId!==faultRobotId && robot.connectionState!=='live') return undefined;
    }
    return projection;
  },waitTimeoutMs,live
    ? `Robot projection ${runRef.runId} did not become live for ${expected.join(', ')}`
    : `Robot projection ${runRef.runId} did not expose ${faultRobotId} disconnected truth`);
}

async function waitForRobotProjectionStates(runRef,expectedStates) {
  const entries=Object.entries(expectedStates ?? {});
  if (entries.length===0 || new Set(entries.map(([robotId]) => robotId)).size!==entries.length
    || entries.some(([,state]) => !['live','disconnected'].includes(state))) {
    throw new Error('Robot projection state expectations must be a non-empty exact map');
  }
  return waitFor(async () => {
    const projection=await getJSON(context,configuration.webUrl,
      `/api/execution-targets/${encodeURIComponent(runRef.targetId || 'local')}`
      + `/orchestration-runs/${encodeURIComponent(runRef.runId)}/robots`);
    if (projection.pending) return undefined;
    const robots=projection.robots ?? [];
    const byID=new Map(robots.map((robot) => [robot.id,robot]));
    if (robots.length!==entries.length || byID.size!==entries.length
      || entries.some(([robotId]) => !byID.has(robotId))) return undefined;
    for (const [robotId,state] of entries) {
      const robot=byID.get(robotId);
      if (!Number.isSafeInteger(robot.connectionEpoch) || robot.connectionEpoch<1) return undefined;
      if (state==='live' && robot.connectionState!=='live') return undefined;
      if (state==='disconnected' && robot.connectionState==='live') return undefined;
    }
    return projection;
  },waitTimeoutMs,`Robot projection ${runRef.runId} did not reach ${JSON.stringify(expectedStates)}`);
}

function connectionStateExpectations(disconnectedRobotIDs,liveRobotIDs) {
  const result={};
  for (const robotId of disconnectedRobotIDs) result[robotId]='disconnected';
  for (const robotId of liveRobotIDs) {
    if (Object.hasOwn(result,robotId)) throw new Error(`${robotId} cannot be both disconnected and live`);
    result[robotId]='live';
  }
  return result;
}

function requiredRunRef(items,robotId) {
  const matches=(items ?? []).filter((item) => item.robotId===robotId && item.runRef?.runId);
  if (matches.length!==1) throw new Error(`exact Robot slot Run is unavailable for ${robotId}`);
  return matches[0].runRef;
}

async function resolveRobotSlot(panelRunRef,robotId) {
  const relations=await getJSON(context,configuration.webUrl,
    `/api/execution-targets/${encodeURIComponent(panelRunRef.targetId || 'local')}`
    + `/orchestration-runs/${encodeURIComponent(panelRunRef.runId)}/relations`);
  return robotSlotRun(relations,robotId);
}

async function waitForSlotIdentityRecovery(panelRoot,originalSlots) {
  return waitFor(async () => {
    const evidence=[];
    for (const { robotId,runRef:before } of originalSlots) {
      const after=await resolveRobotSlot(panelRoot,robotId);
      if (after.targetId!==before.targetId || after.runId!==before.runId) {
        throw new Error(`${robotId} refresh replaced slot Run ${before.runId} with ${after.runId}`);
      }
      const run=await orchestrationRun(after);
      if (!runIsActive(run)) return undefined;
      evidence.push({ robotId,beforeRunId:before.runId,afterRunId:after.runId,status:run.status });
    }
    return evidence;
  },30_000,'refresh did not recover every live Robot slot with the same Run identity');
}

async function waitForIndependentSlotStop({ panelRoot,originalSlots,stoppedRobotId,siblingRobotIds }) {
  return waitFor(async () => {
    const stoppedBefore=requiredRunRef(originalSlots,stoppedRobotId);
    const stoppedAfter=await resolveRobotSlot(panelRoot,stoppedRobotId);
    if (stoppedAfter.targetId!==stoppedBefore.targetId || stoppedAfter.runId!==stoppedBefore.runId) {
      throw new Error(`${stoppedRobotId} Stop replaced its slot Run instead of stopping it`);
    }
    const stoppedRun=await orchestrationRun(stoppedAfter);
    if (runIsActive(stoppedRun)) return undefined;
    const siblingRunIds=[];
    for (const robotId of siblingRobotIds) {
      const before=requiredRunRef(originalSlots,robotId);
      const after=await resolveRobotSlot(panelRoot,robotId);
      if (after.targetId!==before.targetId || after.runId!==before.runId) {
        throw new Error(`${robotId} sibling slot Run changed from ${before.runId} to ${after.runId}`);
      }
      const run=await orchestrationRun(after);
      if (!runIsActive(run)) return undefined;
      siblingRunIds.push({ robotId,beforeRunId:before.runId,afterRunId:after.runId,status:run.status });
    }
    if (kind==='scout' && siblingRunIds.length!==3) {
      throw new Error(`stopping one Scout slot preserved ${siblingRunIds.length} siblings; expected 3`);
    }
    return {
      stopped:{ robotId:stoppedRobotId,runId:stoppedAfter.runId,status:stoppedRun.status },
      siblingRunIds,
    };
  },30_000,`${stoppedRobotId} Stop did not preserve every sibling slot Run unchanged and live`);
}

async function panelRunChild(rootRunId,producerNodeId,itemKey,expectedRelation) {
  return waitFor(async () => {
    const root=await orchestrationRun({ targetId:'local',runId:rootRunId });
    if (!runIsActive(root)) throw new Error(`run-panel root became ${root.status}`);
    const relations=await getJSON(context,configuration.webUrl,
      `/api/execution-targets/local/orchestration-runs/${encodeURIComponent(rootRunId)}/relations`);
    const groups=(relations.childRunGroups ?? []).filter((group) => group.producerNodeId===producerNodeId);
    if (groups.length!==1) return undefined;
    const members=(relations.childRunGroupMembers ?? []).filter((member) => member.groupId===groups[0].id);
    if (members.length===0) return undefined;
    if (members.length!==1 || members[0].itemKey!==itemKey || !members[0].childRunId) {
      throw new Error(`${producerNodeId} did not dispatch exact Panel Workflow ${itemKey}`);
    }
    const childLinks=(relations.childRuns ?? []).filter((child) => child.childRunId===members[0].childRunId);
    if (childLinks.length!==1 || childLinks[0].relation!==expectedRelation
      || childLinks[0].cancelPolicy!==(expectedRelation==='detached' ? 'retain' : 'cascade')) {
      throw new Error(`${itemKey} child lost ${expectedRelation} ownership: ${JSON.stringify(childLinks)}`);
    }
    return { targetId:childLinks[0].targetId || 'local',runId:childLinks[0].childRunId };
  },30_000,`run-panel did not dispatch exact Panel Workflow ${itemKey}`);
}

async function startPanelRunViaAPI(panelId,selection,reason) {
  const requestId=`ugv-remote-panel:${panelId}:${Date.now()}:${process.pid}`;
  const request={
    experimentRef:{ domain:'experiment',resourceId:configuration.experimentId,branch:'main' },
    automationRef:{
      domain:SYSTEM_EXPERIMENT_RUNNER.domain,
      resourceId:SYSTEM_EXPERIMENT_RUNNER.resourceId,
      branch:SYSTEM_EXPERIMENT_RUNNER.branch,
    },
    actionId:SYSTEM_EXPERIMENT_RUNNER.actions.runPanel,
    parameters:{ panelId,runMode:'simulation',inputOverridesJson:JSON.stringify({
      robotIds:selection.robotIds,
    }) },
    requestId,idempotencyKey:requestId,reason,
  };
  const response=await context.request.post(
    `${configuration.webUrl}/api/execution-targets/local/orchestration-runs`,{ data:request },
  );
  const responseText=await response.text();
  let body;
  try { body=JSON.parse(responseText); } catch { body={ error:responseText }; }
  if (response.status()!==202 || !body?.run
    || body.run.actionId!==SYSTEM_EXPERIMENT_RUNNER.actions.runPanel
    || body.run.sourceKind!=='experiment'
    || body.run.sourceRef?.resourceId!==configuration.experimentId
    || body.run.parameters?.panelId!==panelId
    || body.run.parameters?.runMode!=='simulation'
    || body.run.parameters?.inputOverridesJson!==request.parameters.inputOverridesJson) {
    throw new Error(`run-panel ${panelId} failed: HTTP ${response.status()} ${JSON.stringify(body)}`);
  }
  return { request,response:body,run:body.run };
}

async function waitForRobotControlPanelChild(rootRunId,child) {
  return waitFor(async () => {
    const root=await orchestrationRun({ targetId:'local',runId:rootRunId });
    if (!runIsActive(root)) {
      throw new Error(`Session-owned Robot control command root became ${root.status}`);
    }
    const leaf=await resolveRemoteControlLeaf(child,'Session-owned Robot control');
    const childRun=leaf.run;
    if (childRun.actionId!=='set-motion-intent'
      || childRun.parameters?.workflowInstanceId!==robotRuntimeWorkflowInstance) {
      throw new Error(`Session-owned Robot control child lost its authored action identity: ${JSON.stringify(childRun)}`);
    }
    if (!runIsActive(childRun)) {
      throw new Error(`Session-owned Robot control child became ${childRun.status} before Experiment Stop`);
    }
    return { root,child:leaf.ref,childRun };
  },30_000,'Session-owned Robot control workflow did not remain active before Experiment Stop');
}

async function orchestrationRun(runRef) {
  if (!runRef?.runId) throw new Error(`invalid orchestration Run reference: ${JSON.stringify(runRef)}`);
  return getJSON(context,configuration.webUrl,
    `/api/execution-targets/${encodeURIComponent(runRef.targetId || 'local')}`
    + `/orchestration-runs/${encodeURIComponent(runRef.runId)}`);
}

async function stopOrchestrationRun(runRef,reason) {
  const current=await orchestrationRun(runRef);
  if (!runIsActive(current)) return current;
  const requestId=`ugv-remote-stop:${current.id}:${Date.now()}:${process.pid}`;
  const response=await context.request.post(
    `${configuration.webUrl}/api/execution-targets/${encodeURIComponent(runRef.targetId || 'local')}`
    + `/orchestration-runs/${encodeURIComponent(runRef.runId)}/stop`,{
      data:{ expectedRevision:current.revision,requestId,idempotencyKey:requestId,reason },
    },
  );
  const responseText=await response.text();
  let body;
  try { body=JSON.parse(responseText); } catch { body={ error:responseText }; }
  if (![200,202].includes(response.status()) || body?.run?.id!==runRef.runId) {
    throw new Error(`stop Run ${runRef.runId} failed: HTTP ${response.status()} ${JSON.stringify(body)}`);
  }
  return waitFor(async () => {
    const run=await orchestrationRun(runRef);
    return runIsActive(run) ? undefined : run;
  },30_000,`Run ${runRef.runId} did not stop`);
}

function dedupeRunRefs(runRefs) {
  const unique=new Map();
  for (const runRef of runRefs) {
    if (!runRef?.runId) throw new Error(`Session command omitted its Run identity: ${JSON.stringify(runRef)}`);
    const targetId=runRef.targetId || 'local';
    unique.set(`${targetId}\u0000${runRef.runId}`,{ targetId,runId:runRef.runId });
  }
  return [...unique.values()];
}

function dedupeProcesses(processes) {
  const unique=new Map();
  for (const item of processes ?? []) {
    unique.set(`${item.targetId || 'local'}\u0000${item.id}`,item);
  }
  return [...unique.values()];
}

function robotSampleProgram() {
  return String.raw`
import json,sys,time
import rospy
from geometry_msgs.msg import PoseStamped,Twist,TwistStamped
robots=json.loads(sys.argv[1])
rospy.init_node('xgc2_ugv_remote_e2e_sample',anonymous=True,disable_signals=True)
commands={}
poses={}
velocities={}
subscriptions=[]

def command_callback(message,robot_id):
    commands[robot_id]=message

def pose_callback(message,robot_id):
    poses[robot_id]=message.pose

def velocity_callback(message,robot_id):
    velocities[robot_id]=message.twist

for robot in robots:
    robot_id=robot['robotId']
    subscriptions.append(rospy.Subscriber(
      robot['commandTopic'],Twist,command_callback,callback_args=robot_id,queue_size=1))
    subscriptions.append(rospy.Subscriber(
      robot['positionTopic'],PoseStamped,pose_callback,callback_args=robot_id,queue_size=1))
    subscriptions.append(rospy.Subscriber(
      robot['velocityTopic'],TwistStamped,velocity_callback,callback_args=robot_id,queue_size=1))

required={robot['robotId'] for robot in robots}
minimum_command_deadline=time.monotonic()+0.15
telemetry_deadline=time.monotonic()+10.0
while not rospy.is_shutdown() and time.monotonic()<telemetry_deadline:
    if required.issubset(poses) and required.issubset(velocities) \
      and time.monotonic()>=minimum_command_deadline:
        break
    rospy.sleep(0.02)
missing_pose=sorted(required-set(poses))
missing_velocity=sorted(required-set(velocities))
if missing_pose or missing_velocity:
    raise RuntimeError('missing Robot telemetry topics: '+json.dumps({
      'pose':missing_pose,'velocity':missing_velocity},separators=(',',':')))

out=[]
for robot in robots:
    robot_id=robot['robotId']
    command=commands.get(robot_id)
    pose=poses[robot_id]
    velocity=velocities[robot_id]
    out.append({
      'robotId':robot_id,
      'namespace':robot['namespace'],
      'command':None if command is None else {
        'linear':{'x':command.linear.x,'y':command.linear.y,'z':command.linear.z},
        'angular':{'x':command.angular.x,'y':command.angular.y,'z':command.angular.z}},
      'position':{'x':pose.position.x,'y':pose.position.y,'z':pose.position.z},
      'velocity':{
        'linear':{'x':velocity.linear.x,'y':velocity.linear.y,'z':velocity.linear.z},
        'angular':{'x':velocity.angular.x,'y':velocity.angular.y,'z':velocity.angular.z}}})
print(json.dumps(out,separators=(',',':')))
`;
}

function robotTelemetryMessageProgram() {
  return String.raw`
import json,sys,time
import rospy
from geometry_msgs.msg import PoseStamped,TwistStamped
contract=json.loads(sys.argv[1])
def key(item):
    return item['type']+'\u0000'+item['topic']
present={key(item) for item in contract['present']}
absent={key(item) for item in contract['absent']}
if present & absent:
    raise RuntimeError('telemetry publisher contract overlaps: '+json.dumps(sorted(present & absent)))
message_types={'pose-stamped':PoseStamped,'twist-stamped':TwistStamped}
rospy.init_node('xgc2_ugv_remote_e2e_message_state',anonymous=True,disable_signals=True)
seen=set()
subscriptions=[]
def callback(_message,stream_key):
    seen.add(stream_key)
for item in contract['present']+contract['absent']:
    stream_key=key(item)
    subscriptions.append(rospy.Subscriber(
      item['topic'],message_types[item['type']],callback,callback_args=stream_key,queue_size=1))
deadline=time.monotonic()+10.0
minimum_absence_window=time.monotonic()+1.0
while not rospy.is_shutdown() and time.monotonic()<deadline:
    unexpected=sorted(absent & seen)
    if unexpected:
        raise RuntimeError('disconnected Robot emitted telemetry: '+json.dumps(unexpected,separators=(',',':')))
    missing=sorted(present-seen)
    if not missing and time.monotonic()>=minimum_absence_window:
        print(json.dumps({'present':sorted(present),'absent':sorted(absent)},separators=(',',':')))
        raise SystemExit(0)
    rospy.sleep(0.02)
raise RuntimeError('Robot telemetry message state did not converge: '+json.dumps({
    'missingPresent':sorted(present-seen),'unexpectedAbsent':sorted(absent & seen)},separators=(',',':')))
`;
}

function sceneSampleProgram() {
  return String.raw`
import json,math,sys
import rospy
from nav_msgs.msg import Path
expected=json.loads(sys.argv[1])
rospy.init_node('xgc2_ugv_scene_path_e2e_sample',anonymous=True,disable_signals=True)
found={}
for topic in expected:
    path=rospy.wait_for_message(topic,Path,timeout=10.0)
    points=path.poses
    span=0.0
    for left in points:
        for right in points:
            span=max(span,math.hypot(
              right.pose.position.x-left.pose.position.x,
              right.pose.position.y-left.pose.position.y))
    found[topic]={'id':topic,'pointCount':len(points),'span':span}
print(json.dumps([found[key] for key in expected if key in found],separators=(',',':')))
`;
}

function processReady(process) {
  return process.desiredState === 'running' && process.observedState === 'running'
    && process.handle != null && process.readiness?.status === 'passing'
    && process.liveness?.status === 'passing';
}

function processEvidence(process) {
  return {
    id:process.id,definitionId:process.definitionId,desiredState:process.desiredState,
    observedState:process.observedState,readiness:process.readiness?.status,
    liveness:process.liveness?.status,namespace:process.parameters?.namespace,
    modelName:process.parameters?.modelName,
  };
}

async function waitFor(probe,timeoutMs,message) {
  const deadline = Date.now()+timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value !== undefined) return value;
    } catch (cause) {
      lastError=cause;
    }
    await new Promise((resolve) => setTimeout(resolve,100));
  }
  throw new Error(lastError ? `${message}: ${lastError.message || lastError}` : message);
}

async function responseJSON(response) {
  const text=await response.text();
  try { return JSON.parse(text); } catch { return { error:text }; }
}

function required(name,fallback) {
  const value = process.env[name]?.trim() || fallback;
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredChoice(name,choices,fallback) {
  const value = required(name,fallback);
  if (!choices.includes(value)) throw new Error(`${name} must be one of ${choices.join(', ')}`);
  return value;
}

function requiredURL(name,fallback) {
  const parsed = new URL(required(name,fallback));
  if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password
    || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${name} must be an HTTP origin`);
  }
  return parsed.origin;
}

function requiredAttribute(value,label) {
  const normalized=String(value || '').trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function normalizeNamespace(value) {
  return String(value || '').replace(/^\/+|\/+$/g,'');
}

function optionalID(name) {
  const value = process.env[name]?.trim() || '';
  if (value && !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)) throw new Error(`${name} is invalid`);
  return value;
}

function optionalCSV(name) {
  const raw=process.env[name]?.trim() || '';
  if (!raw) return [];
  const items=raw.split(',').map((item) => item.trim()).filter(Boolean);
  if (items.length===0 || new Set(items).size!==items.length
    || items.some((item) => !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(item))) {
    throw new Error(`${name} must be a unique comma-separated Robot ID list`);
  }
  return items;
}

function requiredCSV(value) {
  const items = String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (items.length === 0 || new Set(items).size !== items.length) {
    throw new Error(`controller data-xgc-robot-ids is invalid: ${value}`);
  }
  return items;
}
