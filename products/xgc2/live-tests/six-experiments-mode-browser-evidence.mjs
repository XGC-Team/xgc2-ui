/* global console,document,DOMException,Headers,HTMLElement,MutationObserver,process,ReadableStream,Request,Response,setTimeout,TextDecoder,URL,window */
import { existsSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { chromium } from '@playwright/test';
import {
  installBrowserResourceProbe,
  openBrowserResourceDiagnostics,
} from './browser-resource-diagnostics.mjs';
import {
  EXPERIMENT_START_BOUNDARY_TIMEOUT_MS,
  SYSTEM_EXPERIMENT_RUNNER,
  assertNoActiveSystemRunner,
  experimentRunClosure,
  experimentSessions,
  getJSON,
  orchestrationRun,
  resolveManagedFixture,
  startExperimentThroughUI,
  stopExperimentThroughUI,
  waitFor,
} from './experiment-system-runner-e2e.mjs';
import {
  activeRootObservationAtRequest,
  classifyFrontendRuntimeRead,
  duplicateRelationRevisionKeys,
  duplicateRuntimeReadRevisionKeys,
  lifecycleRuntimeReadViolations,
  observedRuntimeIdentitySnapshot,
  relationIntroducedRunReads,
  runObservationAtRequest,
  runtimeReadLedger,
} from './strict-sse-runtime-read-gate.mjs';
import {
  buildRepeatedModeMatrix,
  filterLanePlansByKeys,
  fixtureLanePlans,
  parseRequestedLaneKeys,
  resolveLaneRunModes,
  validateRepeatRounds,
} from './six-experiments-mode-matrix.mjs';
import {
  assertNoRetiredWorkflowRouteRequests,
  recordRetiredWorkflowRouteRequest,
} from './retired-workflow-route-ledger.mjs';

const webUrl = requiredURL('XGC_SIX_EXPERIMENTS_WEB_URL','http://127.0.0.1:5174');
const evidencePath = required('XGC_SIX_EXPERIMENTS_BROWSER_EVIDENCE');
const waitTimeoutMs = requiredPositiveInteger('XGC_SIX_EXPERIMENTS_BROWSER_WAIT_MS',240_000);
const repeatRounds = validateRepeatRounds(requiredPositiveInteger('XGC_SIX_EXPERIMENTS_REPEAT_ROUNDS',3));
const runStabilityMs = requiredMinimumInteger(
  'XGC_SIX_EXPERIMENTS_RUN_STABILITY_MS',3_000,1_000,
);
const idleControlStabilityMs = requiredMinimumInteger(
  'XGC_SIX_EXPERIMENTS_IDLE_CONTROL_STABILITY_MS',500,250,
);
const stableSSEWindowMs = requiredMinimumInteger(
  'XGC_SIX_EXPERIMENTS_SSE_STABLE_MS',30_000,30_000,
);
const preferredStableSSEGateCell = 'camera-intrinsic/physical';
const requestedLanes=parseRequestedLaneKeys(process.env.XGC_SIX_EXPERIMENTS_LANES??'');
const fixtureRecipes=JSON.parse(readFileSync(
  new URL('../../local-fleet-lab/experiment-fixture-recipes.json',import.meta.url),'utf8',
)).recipes;
const lanePlans = filterLanePlansByKeys(fixtureLanePlans(fixtureRecipes),requestedLanes);

mkdirSync(dirname(evidencePath),{ recursive:true });
const screenshotDirectory = `${evidencePath}.screenshots`;
mkdirSync(screenshotDirectory,{ recursive:true });
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || [
  chromium.executablePath(),'/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
  '/usr/bin/chromium','/usr/bin/chromium-browser',
].find((candidate) => candidate && existsSync(candidate));
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const context = await browser.newContext({ viewport:{ width:1600,height:1000 } });
await context.addInitScript(installExecutionSSEProbe);
await context.addInitScript(installBrowserResourceProbe);
const page = await context.newPage();
const browserResources=await openBrowserResourceDiagnostics({
  browser,context,page,executablePath,
});
const pageErrors = [];
const consoleErrors = [];
const executionStreams = [];
const frontendHistoryRequests = [];
const frontendCursorRequests = [];
const frontendRuntimeReads = [];
const forbiddenRequests = [];
let activeCell = 'preflight';
let pageEpoch=0;
let pageCrashCapture=Promise.resolve();
let pageCrashCaptured=false;
page.on('pageerror',(error) => pageErrors.push({ cell:activeCell,message:error.message }));
const capturePageCrash=() => {
  if (pageCrashCaptured) return pageCrashCapture;
  pageCrashCaptured=true;
  const crashedCell=activeCell;
  pageCrashCapture=browserResources.recordCrash(crashedCell).catch((cause) => {
    browserResources.diagnostics.crash={
      cell:crashedCell,observedAt:new Date().toISOString(),error:cause instanceof Error ? cause.message : String(cause),
      lastCompleteSample:browserResources.diagnostics.samples.findLast((sample) => sample.phase!=='crash') ?? null,
      growth:browserResources.diagnostics.growth,
    };
  });
  return pageCrashCapture;
};
page.on('crash',capturePageCrash);
page.on('console',(message) => {
  if (message.type() === 'error') consoleErrors.push({ cell:activeCell,message:message.text(),location:message.location() });
});
page.on('request',(request) => {
  if (request.isNavigationRequest() && request.resourceType()==='document'
    && request.frame()===page.mainFrame()) pageEpoch+=1;
  const path = new URL(request.url()).pathname;
  if (path === '/api/execution-targets/local/events') executionStreams.push(request.url());
  if (path === '/api/execution-targets/local/automation-execution-history') {
    frontendHistoryRequests.push({ at:Date.now(),url:request.url() });
  }
  if (request.method()==='GET' && path==='/api/execution-targets/local/events/cursor') {
    frontendCursorRequests.push({ at:Date.now(),url:request.url() });
  }
  const runtimeRead = classifyFrontendRuntimeRead(request);
  if (runtimeRead) {
    frontendRuntimeReads.push({ at:Date.now(),pageEpoch,...runtimeRead,url:request.url() });
  }
  recordRetiredWorkflowRouteRequest(forbiddenRequests,request,activeCell);
});

const evidence = {
  webUrl,
  contract:'system-experiment-runner-v2',
  systemRunner:SYSTEM_EXPERIMENT_RUNNER,
  requestedLanes,
  repeatRounds,runStabilityMs,idleControlStabilityMs,
  startupBoundaryMs:EXPERIMENT_START_BOUNDARY_TIMEOUT_MS,
  acceptance:'browser lifecycle plus exact Run/history/Session/Panel-dispatch truth; provider readiness is a separate data-plane gate',
  cells:[],pageErrors,consoleErrors,executionStreams,frontendHistoryRequests,frontendCursorRequests,
  frontendRuntimeReads,forbiddenRequests,sseReplayGate:null,
  browserDiagnostics:browserResources.diagnostics,
};

try {
  await browserResources.capture(activeCell,'ready');
  const lanes = [];
  for (const plan of lanePlans) {
    const experiment = await resolveManagedFixture(context,webUrl,plan);
    lanes.push(resolveLaneRunModes(plan,experiment));
  }
  const matrix=buildRepeatedModeMatrix(lanes,{ repeatRounds });
  const stableSSEGateCell=matrix.some(({ lane,mode }) => (
    `${lane.key}/${mode}`===preferredStableSSEGateCell
  )) ? preferredStableSSEGateCell : `${matrix[0].lane.key}/${matrix[0].mode}`;
  evidence.matrix=matrix.map(({ lane,mode,round }) => ({ lane:lane.key,mode,round }));
  evidence.sseReplayGateCell=stableSSEGateCell;
  await assertNoActiveSystemRunner(context,webUrl);
  let previousLaneMode='';
  for (const { lane,mode,round } of matrix) {
    const laneMode=`${lane.key}/${mode}`;
    activeCell = `${laneMode}/round-${round}`;
    const cell = await runCell(page,context,lane,mode,round,{
      navigate:laneMode!==previousLaneMode,
      runStrictSSEGate:laneMode===stableSSEGateCell && round===1,
      captureBrowserResources:browserResources.capture,
      readPageEpoch:() => pageEpoch,
      retiredWorkflowRouteRequests:forbiddenRequests,
    });
    previousLaneMode=laneMode;
    if (cell.sseReplayGate) evidence.sseReplayGate=cell.sseReplayGate;
    evidence.cells.push(cell);
    writeFileSync(evidencePath,`${JSON.stringify(evidence,null,2)}\n`);
    console.log(`PASS: ${activeCell} browser Run -> stable waiting -> Stop -> idle`);
  }
  assertNoRetiredWorkflowRouteRequests(forbiddenRequests,{
    scope:'local-fleet browser matrix',
  });
  if (executionStreams.length === 0) throw new Error('browser never opened the target execution SSE stream');
  if (frontendHistoryRequests.length > evidence.cells.length*5+5) {
    throw new Error(`frontend repeatedly polled Automation history: ${frontendHistoryRequests.length} requests`);
  }
  if (!evidence.sseReplayGate) throw new Error(`strict SSE replay gate did not run in ${stableSSEGateCell}`);
  if (browserResources.diagnostics.crash) {
    throw new Error(`browser renderer crashed: ${JSON.stringify(browserResources.diagnostics.crash)}`);
  }
  if (pageErrors.length > 0) throw new Error(`browser page errors: ${JSON.stringify(pageErrors)}`);
  if (consoleErrors.length > 0) throw new Error(`browser console errors: ${JSON.stringify(consoleErrors)}`);
  if (evidence.cells.length !== matrix.length) {
    throw new Error(`expected ${matrix.length} browser repeat cells, got ${evidence.cells.length}`);
  }
  writeFileSync(evidencePath,`${JSON.stringify(evidence,null,2)}\n`);
  console.log(`Local-fleet System Runner browser matrix passed; evidence: ${evidencePath}`);
} catch (cause) {
  if (/target crashed/i.test(cause instanceof Error ? cause.message : String(cause))) capturePageCrash();
  await pageCrashCapture;
  evidence.failure={ cell:activeCell,error:cause instanceof Error ? cause.message : String(cause) };
  await page.screenshot({ path:`${evidencePath}.failure.png`,fullPage:true }).catch(() => undefined);
  writeFileSync(`${evidencePath}.failure.json`,`${JSON.stringify(evidence,null,2)}\n`);
  await page.evaluate(() => window.__xgcExecutionSSEProbe?.releaseReplayGap()).catch(() => undefined);
  await stopVisibleRun(page).catch(() => undefined);
  throw cause;
} finally {
  await browserResources.close().catch(() => undefined);
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}

async function runCell(page,context,lane,mode,round,{
  navigate,runStrictSSEGate,captureBrowserResources,readPageEpoch,
  retiredWorkflowRouteRequests,
}) {
  const experimentId = lane.experiment.head.resourceId;
  const runtimeReadStartIndex=frontendRuntimeReads.length;
  const retiredRouteRequestStartIndex=retiredWorkflowRouteRequests.length;
  console.log(`BEGIN: ${lane.key}/${mode} round ${round}${navigate ? ' browser navigation' : ' same-page rerun'}`);
  if (navigate) {
    await page.goto(`${webUrl}/#/experiments/${experimentId}`,{ waitUntil:'domcontentloaded',timeout:30_000 });
    await page.locator('[data-xgc-role="experiment-topbar-actions"]').waitFor({ state:'visible',timeout:30_000 });
    await page.locator('[data-xgc-role="experiment-state-loading"]').waitFor({ state:'detached',timeout:30_000 }).catch(() => undefined);
    await selectMode(page,experimentId,mode);
  } else {
    await page.locator(`[data-xgc-role="experiment-run-mode"][data-xgc-id="${experimentId}"][data-xgc-value="${mode}"]`)
      .waitFor({ state:'visible',timeout:30_000 });
  }
  const beforeStartResources=await captureBrowserResources(activeCell,'before-start');
  const started = await startExperimentThroughUI({
    page,context,webUrl,experiment:lane.experiment,runMode:mode,
  });
  const runId = started.run.id;
  await page.locator(`[data-xgc-role="experiment-stop"][data-xgc-id="${experimentId}"]`)
    .waitFor({ state:'visible',timeout:30_000 });
  await installControlPhaseGuard(page,experimentId,'active');
  const stability = await observeWaitingTruth(context,lane,mode,runId,runStabilityMs);
  const sseReplayGate = runStrictSSEGate
    ? await runStrictExecutionSSEGate({
      page,context,lane,mode,frontendRuntimeReads,frontendCursorRequests,
      activeSystemRoot:started.run,
      stableWindowMs:stableSSEWindowMs,
      pageEpoch:readPageEpoch(),
    })
    : undefined;
  const activeControls=await finishControlPhaseGuard(page);
  const activeResources=await captureBrowserResources(activeCell,'active');
  await page.screenshot({
    path:join(screenshotDirectory,`${lane.key}-${mode}-round-${String(round).padStart(2,'0')}.png`),
    fullPage:true,
  });
  const afterScreenshotResources=await captureBrowserResources(activeCell,'after-screenshot');
  const stopped = await stopExperimentThroughUI({
    page,context,webUrl,experiment:lane.experiment,runId,timeoutMs:waitTimeoutMs,
  });
  const afterStopResources=await captureBrowserResources(activeCell,'after-stop');
  await installControlPhaseGuard(page,experimentId,'idle');
  await page.waitForTimeout(idleControlStabilityMs);
  const idleControls=await finishControlPhaseGuard(page);
  const afterIdleResources=await captureBrowserResources(activeCell,'after-idle');
  const cellRetiredWorkflowRouteRequests=assertNoRetiredWorkflowRouteRequests(
    retiredWorkflowRouteRequests,{
      startIndex:retiredRouteRequestStartIndex,
      scope:activeCell,
    },
  );
  const cellRuntimeReads=frontendRuntimeReads.slice(runtimeReadStartIndex);
  const ordinaryLifecycleReads=sseReplayGate ? cellRuntimeReads.filter(({ at }) => (
    at<sseReplayGate.replayGapStartedAt || at>sseReplayGate.finishedAt
  )) : cellRuntimeReads;
  const lifecycleReadViolations=lifecycleRuntimeReadViolations(ordinaryLifecycleReads,{
    targetId:'local',systemRootId:runId,
  });
  if (lifecycleReadViolations.invalidReads.length>0
    || lifecycleReadViolations.forbiddenRunReads.length>0
    || lifecycleReadViolations.foreignReads.length>0) {
    throw new Error(`${activeCell} ordinary lifecycle hydrated child Run details without a mounted runtime demand: ${JSON.stringify({
      ordinaryLifecycleReads,lifecycleReadViolations,
    })}`);
  }
  return {
    lane:lane.key,experimentId,mode,round,runId,
    start:{
      status:started.responseStatus,latencyMs:started.latencyMs,
      phaseLatencyMs:started.phaseLatencyMs,request:started.request,
    },
    root:{ status:started.run.status,revision:started.run.revision,sourceRef:started.run.sourceRef },
    history:{ phase:started.historyEntry.phase,status:started.historyEntry.run.status,sourceRef:started.historyEntry.run.sourceRef },
    session:started.session.session,
    dispatch:{
      managedBindingIds:started.managedBindingIds,
      groupId:started.dispatchGroup.id,state:started.dispatchGroup.state,
      expectedMembers:started.dispatchGroup.expectedMembers,memberCount:started.dispatchGroup.memberCount,
    },
    stability,
    controls:{ active:activeControls,idle:idleControls },
    retiredWorkflowRouteRequests:cellRetiredWorkflowRouteRequests,
    lifecycleRuntimeReads:{ reads:ordinaryLifecycleReads,violations:lifecycleReadViolations },
    browserResourceSampleIds:{
      beforeStart:beforeStartResources.id,
      active:activeResources.id,
      afterScreenshot:afterScreenshotResources.id,
      afterStop:afterStopResources.id,
      afterIdle:afterIdleResources.id,
    },
    ...(sseReplayGate ? { sseReplayGate } : {}),
    stop:{
      status:stopped.responseStatus,request:stopped.request,receipt:stopped.response.receipt,
      ownedProcesses:stopped.ownedProcesses.map((process) => ({
        id:process.id,targetId:process.targetId,definitionId:process.definitionId,
        desiredState:process.desiredState,observedState:process.observedState,
      })),
    },
    terminal:{ status:stopped.run.status,terminationKind:stopped.run.terminationKind },
  };
}

async function observeWaitingTruth(context,lane,mode,runId,stabilityWindowMs) {
  const experimentId=lane.experiment.head.resourceId;
  const startedAt=Date.now();
  const rootSamples=[];
  while (Date.now()-startedAt<stabilityWindowMs) {
    const run=await orchestrationRun(context,webUrl,runId);
    if (run.status!=='waiting') {
      throw new Error(`${activeCell} root left waiting before Stop: ${JSON.stringify({ status:run.status,reason:run.reason,primaryError:run.primaryError })}`);
    }
    const sessions=await experimentSessions(context,webUrl,experimentId);
    if (sessions.length!==1
      || sessions[0]?.session?.state!=='active'
      || sessions[0].session.runMode!==mode
      || sessions[0].session.experimentResourceId!==experimentId) {
      throw new Error(`${activeCell} Session truth oscillated during waiting stability: ${JSON.stringify(sessions)}`);
    }
    rootSamples.push({ at:Date.now(),status:run.status,revision:run.revision });
    await new Promise((resolve) => setTimeout(resolve,Math.min(250,Math.max(1,stabilityWindowMs-(Date.now()-startedAt)))));
  }
  const closure=await experimentRunClosure(context,webUrl,runId);
  const runs=[];
  for (let index=0;index<closure.length;index+=8) {
    const batch=closure.slice(index,index+8);
    runs.push(...await Promise.all(batch.map(({ targetId,runId:childRunId }) => getJSON(
      context,webUrl,
      `/api/execution-targets/${encodeURIComponent(targetId)}/orchestration-runs/${encodeURIComponent(childRunId)}`,
    ))));
  }
  const prohibited=runs.filter((run) => ['failed','rejected','canceled','stopped','stopping'].includes(run.status));
  if (prohibited.length>0) {
    throw new Error(`${activeCell} produced failed/rejected or prematurely terminal child Runs: ${JSON.stringify(prohibited.map((run) => ({
      id:run.id,targetId:run.targetId,status:run.status,reason:run.reason,primaryError:run.primaryError,
    })))}`);
  }
  return {
    stabilityWindowMs,
    rootSampleCount:rootSamples.length,
    firstRootSample:rootSamples[0],
    lastRootSample:rootSamples.at(-1),
    runCount:runs.length,
    statuses:Object.fromEntries([...new Set(runs.map((run) => run.status))].sort().map((status) => [
      status,runs.filter((run) => run.status===status).length,
    ])),
  };
}

async function installControlPhaseGuard(page,experimentId,phase) {
  await page.evaluate(({ experimentId,phase }) => {
    window.__xgcExperimentControlGuard?.stop?.();
    const visible=(element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style=window.getComputedStyle(element);
      return style.display!=='none' && style.visibility!=='hidden' && element.getClientRects().length>0;
    };
    const controls=(role) => [...document.querySelectorAll(`[data-xgc-role="${role}"]`)]
      .filter((element) => element.getAttribute('data-xgc-id')===experimentId);
    const snapshot=() => {
      const run=controls('experiment-run').filter(visible);
      const stop=controls('experiment-stop').filter(visible);
      const modeRoot=controls('experiment-run-mode-select')[0];
      return {
        runVisible:run.length,runDisabled:run.some((element) => element.disabled),
        stopVisible:stop.length,stopDisabled:stop.some((element) => element.disabled),
        modeDisabled:modeRoot?.getAttribute('data-disabled')==='true',
      };
    };
    const valid=(state) => phase==='active'
      ? state.runVisible===0 && state.stopVisible===1 && !state.stopDisabled
      : state.runVisible===1 && !state.runDisabled && state.stopVisible===0;
    const guard={ phase,startedAt:Date.now(),checks:0,violation:undefined,observer:undefined,interval:undefined };
    const inspect=() => {
      guard.checks+=1;
      const state=snapshot();
      if (!valid(state) && !guard.violation) guard.violation={ at:Date.now(),state };
    };
    guard.stop=() => {
      guard.observer?.disconnect();
      window.clearInterval(guard.interval);
    };
    guard.observer=new MutationObserver(inspect);
    guard.observer.observe(document.documentElement,{ attributes:true,childList:true,subtree:true });
    guard.interval=window.setInterval(inspect,25);
    window.__xgcExperimentControlGuard=guard;
    inspect();
  },{ experimentId,phase });
}

async function finishControlPhaseGuard(page) {
  const result=await page.evaluate(() => {
    const guard=window.__xgcExperimentControlGuard;
    if (!guard) throw new Error('Experiment control phase guard is unavailable');
    guard.stop();
    delete window.__xgcExperimentControlGuard;
    return {
      phase:guard.phase,durationMs:Date.now()-guard.startedAt,
      checks:guard.checks,violation:guard.violation,
    };
  });
  if (result.violation) {
    throw new Error(`${activeCell} Run/Stop controls oscillated during ${result.phase}: ${JSON.stringify(result.violation)}`);
  }
  return result;
}

async function runStrictExecutionSSEGate({
  page,context,lane,mode,activeSystemRoot,frontendRuntimeReads,frontendCursorRequests,stableWindowMs,pageEpoch,
}) {
  if (activeSystemRoot?.automationResourceId!==SYSTEM_EXPERIMENT_RUNNER.resourceId
    || activeSystemRoot.actionId!==SYSTEM_EXPERIMENT_RUNNER.actions.run
    || activeSystemRoot.sourceKind!=='experiment'
    || activeSystemRoot.sourceRef?.resourceId!==lane.experiment.head.resourceId
    || activeSystemRoot.sourceRef?.branch!==lane.experiment.branch.name
    || (activeSystemRoot.parameters?.runMode??activeSystemRoot.experimentSelector?.runMode)!==mode
    || activeSystemRoot.parentRunId
    || activeSystemRoot.rootRunId!==activeSystemRoot.id
    || !['accepted','queued','running','waiting','stopping'].includes(activeSystemRoot.status)
    || !Number.isSafeInteger(activeSystemRoot.revision) || activeSystemRoot.revision<1) {
    throw new Error(`strict SSE gate did not receive one exact active System root: ${JSON.stringify(activeSystemRoot)}`);
  }
  const stable = await observeStableRuntimeReadWindow(
    page,context,frontendRuntimeReads,frontendCursorRequests,stableWindowMs,
  );
  const before = await waitFor(async () => {
    const cursor=await browserExecutionCursor(page);
    const probe=await executionSSEProbeSnapshot(page);
    const active=probe.connections.findLast((connection) => connection.openedAt && !connection.finishedAt);
    return cursor.streamId && cursor.offset>0 && active
      ? { cursor,connection:active } : undefined;
  },30_000,'execution SSE did not establish one persisted browser cursor');

  const observedBeforeReplay=observedRuntimeIdentitySnapshot(frontendRuntimeReads,{
    beforeAt:Date.now(),pageEpoch,targetId:'local',
  });
  const observedAutomationResources=await resolveObservedAutomationResources(
    context,observedBeforeReplay,
  );

  const replayGapStartedAt=Date.now();
  const cursorRequestStartIndex=frontendCursorRequests.length;
  const disconnectedConnectionId = await page.evaluate(() => {
    const probe=window.__xgcExecutionSSEProbe;
    if (!probe) throw new Error('execution SSE probe is unavailable');
    return probe.beginReplayGap();
  });
  const held = await waitFor(async () => {
    const probe=await executionSSEProbeSnapshot(page);
    return probe.connections.find((connection) => (
      connection.id!==disconnectedConnectionId && connection.heldAt
    ));
  },30_000,'execution SSE did not attempt cursor reconnect after forced disconnect');
  const heldCursor=await browserExecutionCursor(page);
  if (!Number.isSafeInteger(held.afterOffset) || held.afterOffset<1
    || held.lastEventId!==String(held.afterOffset)
    || held.requestStreamId!==before.cursor.streamId
    || heldCursor.streamId!==before.cursor.streamId
    || heldCursor.offset!==held.afterOffset) {
    throw new Error(`execution SSE reconnect did not preserve its exact cursor: ${JSON.stringify({ before:before.cursor,held,heldCursor })}`);
  }

  const panelId=firstExperimentPanelId(lane.experiment);
  const injected=await startReplayProbePanelRoot(context,lane.experiment,mode,panelId);
  const oracle=await waitFor(async () => replayGapOracle(
    context,held.afterOffset,injected.run.id,
  ),30_000,'run-panel did not commit a bounded execution-event replay gap');

  const releasedAt=Date.now();
  await page.evaluate(() => {
    const probe=window.__xgcExecutionSSEProbe;
    if (!probe) throw new Error('execution SSE probe is unavailable');
    probe.releaseReplayGap();
  });
  const replayed=await waitFor(async () => {
    const probe=await executionSSEProbeSnapshot(page);
    const connection=probe.connections.find((candidate) => candidate.id===held.id);
    if (!connection?.openedAt) return undefined;
    const observed=(connection.frames??[]).filter(({ offset }) => (
      offset>held.afterOffset && offset<=oracle.cursor.latestOffset
    ));
    if (observed.length<oracle.events.length) return undefined;
    if (connection.afterOffset!==held.afterOffset
      || connection.lastEventId!==String(held.afterOffset)
      || connection.requestStreamId!==before.cursor.streamId
      || connection.responseStreamId!==before.cursor.streamId
      || connection.responseLatestOffset<oracle.cursor.latestOffset
      || connection.droppedFrames!==0) {
      throw new Error(`execution SSE reconnect headers or probe capacity drifted: ${JSON.stringify(connection)}`);
    }
    assertExactReplaySequence(oracle.events,observed);
    const browserCursor=await browserExecutionCursor(page);
    if (browserCursor.streamId!==before.cursor.streamId
      || browserCursor.offset<oracle.cursor.latestOffset) return undefined;
    return { connection,observed,browserCursor };
  },30_000,'browser did not consume the complete ordered cursor replay');

  // Reconciliation coalescers use 40/100 ms delays. Two seconds proves every
  // current identity is reconciled at most once without periodic fallback.
  // Histories are bounded by the exact Automation identities already observed
  // from current-page Run details. A new independent Panel root is allowed one
  // exact detail bundle and one Session snapshot so it can join the Experiment
  // and expose its nested whiteboard truth.
  await page.waitForTimeout(2_000);
  const replayProbe=await executionSSEProbeSnapshot(page);
  const replayReconciliationReads=frontendRuntimeReads.filter(({ at }) => at>=replayGapStartedAt);
  const replayLedger=runtimeReadLedger(replayReconciliationReads);
  const historyResources=[...replayLedger.historyReads]
    .map(({ automationResourceId }) => automationResourceId).sort();
  const expectedHistoryResources=[...observedAutomationResources.resourceIds].sort();
  const injectedClosure=await experimentRunClosure(context,webUrl,injected.run.id);
  const authoritativeInjectedClosure=await resolveAuthoritativeRunClosure(
    context,injectedClosure,
  );
  const allowedDetailRunRefs=new Set(injectedClosure.map(({ targetId,runId }) => (
    `${targetId}\0${runId}`
  )));
  const replayEventRunIds=new Set(oracle.events.flatMap((event) => (
    event.entityType==='orchestration' ? [event.entityId] : []
  )));
  observedBeforeReplay.runRefs.forEach(({ targetId,runId }) => {
    if (replayEventRunIds.has(runId)) allowedDetailRunRefs.add(`${targetId}\0${runId}`);
  });
  const exactRelationsPath=`/api/execution-targets/local/orchestration-runs/${encodeURIComponent(activeSystemRoot.id)}/relations`;
  const activeRootRelationReads=replayLedger.runReads.filter((read) => (
    read.targetId==='local' && read.runId===activeSystemRoot.id && read.endpoint==='relations'
  ));
  const relationReadObservations=activeRootRelationReads.map((read) => {
    const parsed=new URL(read.url);
    const root=activeRootObservationAtRequest(
      activeSystemRoot,read.at,replayProbe.connections,
    );
    return {
      ...read,root,
      exact:read.targetId==='local'
        && parsed.pathname===exactRelationsPath && !parsed.search && !parsed.hash,
    };
  });
  const detailRunReads=replayLedger.runReads.filter((read) => !activeRootRelationReads.includes(read));
  const invalidDetailRunReads=detailRunReads.filter(({ targetId,runId }) => (
    !allowedDetailRunRefs.has(`${targetId}\0${runId}`)
  ));
  const injectedClosureKeys=new Set(injectedClosure.map(({ targetId,runId }) => (
    `${targetId}\0${runId}`
  )));
  const injectedClosureDetailReads=detailRunReads.filter(({ targetId,runId }) => (
    injectedClosureKeys.has(`${targetId}\0${runId}`)
  ));
  const relationIntroductions=relationIntroducedRunReads({
    reads:injectedClosureDetailReads,
    rootRef:{ targetId:'local',runId:injected.run.id },
    links:authoritativeInjectedClosure.links,
  });
  const introducedChildKeys=new Set(relationIntroductions.introduced.map(({ childKey }) => childKey));
  const authoritativeRunByKey=new Map(authoritativeInjectedClosure.runs.map((run) => [
    `${run.targetId}\0${run.id}`,run,
  ]));
  const detailReadObservations=detailRunReads.map((read) => ({
    ...read,
    observation:detailReadObservation(
      read,replayProbe.connections,injected.run,introducedChildKeys,authoritativeRunByKey,
    ),
  }));
  const duplicateDetailRevisionKeys=duplicateRuntimeReadRevisionKeys(
    detailReadObservations.map(({ targetId,runId,endpoint,observation }) => ({
      targetId,runId,endpoint,revision:observation.revision,
    })),
  );
  const injectedRootEndpoints=[...new Set(detailRunReads.filter(({ targetId,runId }) => (
    targetId==='local' && runId===injected.run.id
  )).map(({ endpoint }) => endpoint))].sort();
  const expectedInjectedRootEndpoints=['invocations','node-summaries','relations','run','snapshot'];
  const sessionTargets=replayLedger.sessionReads.map(({ targetId }) => targetId).sort();
  const sessionObservations=replayLedger.sessionReads.map((read) => ({
    ...read,observation:runObservationAtRequest(
      injected.run.id,read.at,replayProbe.connections,injected.run,
    ),
  }));
  const duplicateSessionRevisions=duplicateRuntimeReadRevisionKeys(
    sessionObservations.map(({ targetId,observation }) => ({
      targetId,runId:injected.run.id,endpoint:'sessions',revision:observation.revision,
    })),
  );
  const historyMatches=JSON.stringify(historyResources)===JSON.stringify(expectedHistoryResources);
  const injectedRootMatches=injectedRootEndpoints.length===0
    || JSON.stringify(injectedRootEndpoints)===JSON.stringify(expectedInjectedRootEndpoints);
  if (replayLedger.invalidReads.length>0
    || replayLedger.duplicateHistoryKeys.length>0
    || duplicateSessionRevisions.length>0
    || duplicateDetailRevisionKeys.length>0
    || !historyMatches
    || sessionTargets.length<1 || sessionTargets.some((targetId) => targetId!=='local')
    || invalidDetailRunReads.length>0
    || relationIntroductions.invalid.length>0
    || detailReadObservations.some(({ observation }) => !observation.observed)
    || sessionObservations.some(({ observation }) => !observation.observed)
    || !injectedRootMatches
    || relationReadObservations.some(({ exact,root }) => !exact || !root.active)) {
    throw new Error(`SSE replay used unbounded or duplicate identity reconciliation: ${JSON.stringify({
      replayReconciliationReads,replayLedger,observedBeforeReplay,observedAutomationResources,
      expectedHistoryResources,historyResources,injectedClosure,allowedDetailRunRefs:[...allowedDetailRunRefs].sort(),
      authoritativeInjectedClosure,invalidDetailRunReads,relationIntroductions,
      detailReadObservations,duplicateDetailRevisionKeys,
      expectedInjectedRootEndpoints,injectedRootEndpoints,sessionTargets,sessionObservations,
      duplicateSessionRevisions,exactRelationsPath,
    })}`);
  }
  const duplicateRelationRevisions=duplicateRelationRevisionKeys(
    relationReadObservations.map(({ root }) => root),
  );
  if (duplicateRelationRevisions.length>0) {
    throw new Error(`SSE replay duplicated active System-root relations read for one revision: ${JSON.stringify({ relationReadObservations,duplicateRelationRevisions })}`);
  }
  const reconnectCursorRequests=frontendCursorRequests.slice(cursorRequestStartIndex);
  if (reconnectCursorRequests.length!==1) {
    throw new Error(`execution SSE reconnect used ${reconnectCursorRequests.length} cursor preflights instead of one: ${JSON.stringify(reconnectCursorRequests)}`);
  }
  const finishedAt=Date.now();
  return {
    stable,
    beforeCursor:before.cursor,
    replayGapStartedAt,
    releasedAt,
    finishedAt,
    replayAfterOffset:held.afterOffset,
    disconnectedConnectionId,
    heldReconnect:{
      id:held.id,afterOffset:held.afterOffset,lastEventId:held.lastEventId,
      requestStreamId:held.requestStreamId,
    },
    injectedRoot:{
      id:injected.run.id,actionId:injected.run.actionId,status:oracle.run.status,
      panelId,request:injected.request,
    },
    replayBoundary:oracle.cursor,
    expectedEvents:oracle.events.map(replayEventIdentity),
    observedEvents:replayed.observed.map(replayEventIdentity),
    reconnected:{
      id:replayed.connection.id,responseStreamId:replayed.connection.responseStreamId,
      responseLatestOffset:replayed.connection.responseLatestOffset,
      browserCursor:replayed.browserCursor,
    },
    replayReconciliationReads,
    observedBeforeReplay,
    observedAutomationResources,
    injectedClosure,
    authoritativeInjectedClosure,
    relationIntroductions,
    boundedReplayLedger:replayLedger,
    detailReadObservations,
    sessionObservations,
    activeSystemRootRelationReads:relationReadObservations,
    reconnectCursorRequests,
  };
}

async function observeStableRuntimeReadWindow(
  page,context,frontendRuntimeReads,frontendCursorRequests,stableWindowMs,
) {
  const catchupStartedAt=Date.now();
  const catchup=await waitFor(async () => {
    const serverCursor=await getJSON(context,webUrl,'/api/execution-targets/local/events/cursor');
    const browserCursor=await browserExecutionCursor(page);
    return browserCursor.streamId===serverCursor.streamId
      && browserCursor.offset>=serverCursor.latestOffset
      ? { serverCursor,browserCursor } : undefined;
  },120_000,'Experiment page execution SSE cursor never caught the durable live tail');
  const settleStartedAt=Date.now();
  await waitFor(async () => {
    const latestAt=Math.max(
      frontendRuntimeReads.at(-1)?.at??0,
      frontendCursorRequests.at(-1)?.at??0,
    );
    return latestAt===0 || Date.now()-latestAt>=3_000 ? true : undefined;
  },120_000,'Experiment page never reached a three-second runtime-read quiet boundary');
  const startedAt=Date.now();
  const startIndex=frontendRuntimeReads.length;
  const cursorStartIndex=frontendCursorRequests.length;
  await page.waitForTimeout(stableWindowMs);
  const reads=frontendRuntimeReads.slice(startIndex);
  const cursorReads=frontendCursorRequests.slice(cursorStartIndex);
  if (reads.length>0 || cursorReads.length>0) {
    throw new Error(`stable Experiment page issued periodic state GETs: ${JSON.stringify({ reads,cursorReads })}`);
  }
  return {
    catchupMs:settleStartedAt-catchupStartedAt,catchup,
    settleMs:startedAt-settleStartedAt,windowMs:stableWindowMs,
    startedAt,finishedAt:Date.now(),reads,cursorReads,
  };
}

async function startReplayProbePanelRoot(context,experiment,runMode,panelId) {
  const requestId=`browser-sse-replay:${experiment.head.resourceId}:${Date.now()}:${process.pid}`;
  const request={
    experimentRef:{ domain:'experiment',resourceId:experiment.head.resourceId,branch:'main' },
    automationRef:{
      domain:SYSTEM_EXPERIMENT_RUNNER.domain,
      resourceId:SYSTEM_EXPERIMENT_RUNNER.resourceId,
      branch:SYSTEM_EXPERIMENT_RUNNER.branch,
    },
    actionId:SYSTEM_EXPERIMENT_RUNNER.actions.runPanel,
    parameters:{ panelId,runMode,inputOverridesJson:'{}' },
    requestId,idempotencyKey:requestId,
    reason:`Create deterministic SSE replay gap for Panel ${panelId}`,
  };
  const response=await context.request.post(
    `${webUrl}/api/execution-targets/local/orchestration-runs`,{ data:request },
  );
  const responseText=await response.text();
  let body;
  try { body=JSON.parse(responseText); } catch { body={ error:responseText }; }
  if (response.status()!==202 || !body?.run
    || body.run.actionId!==SYSTEM_EXPERIMENT_RUNNER.actions.runPanel
    || body.run.sourceKind!=='experiment'
    || body.run.sourceRef?.resourceId!==experiment.head.resourceId
    || body.run.parameters?.panelId!==panelId
    || body.run.parameters?.runMode!==runMode
    || body.run.parameters?.inputOverridesJson!=='{}') {
    throw new Error(`SSE replay run-panel probe failed: HTTP ${response.status()} ${JSON.stringify(body)}`);
  }
  return { request,response:body,run:body.run };
}

async function replayGapOracle(context,afterOffset,runId) {
  const run=await getJSON(context,webUrl,
    `/api/execution-targets/local/orchestration-runs/${encodeURIComponent(runId)}`);
  if (['accepted','queued'].includes(run.status)) return undefined;
  if (['failed','canceled','stopped','rejected'].includes(run.status)) {
    throw new Error(`SSE replay probe root became ${run.status}: ${run.primaryError||run.reason||''}`);
  }
  const cursor=await getJSON(context,webUrl,'/api/execution-targets/local/events/cursor');
  if (cursor.latestOffset<=afterOffset) return undefined;
  const listed=await getJSON(context,webUrl,
    `/api/execution-targets/local/events?afterOffset=${afterOffset}&limit=1000`);
  const events=listed.filter(({ offset }) => offset<=cursor.latestOffset);
  const rootEvents=events.filter(({ entityType,entityId }) => (
    entityType==='orchestration' && entityId===runId
  ));
  if (rootEvents.length<2) return undefined;
  if (events.length===0 || events.at(-1).offset!==cursor.latestOffset) {
    throw new Error('execution replay gap exceeded the bounded 1000-event oracle');
  }
  assertStrictAscendingEvents(events);
  return { run,cursor,events };
}

function assertExactReplaySequence(expected,observed) {
  if (observed.some((event) => event.parseError
    || event.id!==String(event.offset) || event.event!==event.type)) {
    throw new Error(`cursor replay contained invalid SSE framing: ${JSON.stringify(observed)}`);
  }
  const expectedIdentities=expected.map(replayEventIdentity);
  const observedIdentities=observed.map(replayEventIdentity);
  if (JSON.stringify(observedIdentities)!==JSON.stringify(expectedIdentities)) {
    throw new Error(`cursor replay was missing, duplicated, or reordered: ${JSON.stringify({ expected:expectedIdentities,observed:observedIdentities })}`);
  }
  assertStrictAscendingEvents(observed);
}

function assertStrictAscendingEvents(events) {
  for (let index=0;index<events.length;index+=1) {
    const event=events[index];
    if (!Number.isSafeInteger(event.offset) || event.offset<1
      || (index>0 && event.offset<=events[index-1].offset)) {
      throw new Error(`execution events are not strictly offset ordered: ${JSON.stringify(events.map(replayEventIdentity))}`);
    }
  }
}

function replayEventIdentity(event) {
  return {
    offset:event.offset,entityType:event.entityType,entityId:event.entityId,
    seq:event.seq,type:event.type,
  };
}

function firstExperimentPanelId(experiment) {
  const ids=(experiment.spec.dashboards??[]).flatMap((dashboard) => (
    (dashboard.panels??[]).map((panel) => String(panel.id||'').trim()).filter(Boolean)
  ));
  if (ids.length===0) throw new Error('strict SSE gate requires one authored Panel');
  if (new Set(ids).size!==ids.length) throw new Error('strict SSE gate requires unique authored Panel IDs');
  return ids[0];
}

async function resolveObservedAutomationResources(context,identitySnapshot) {
  if (identitySnapshot.runRefs.length>1000) {
    throw new Error('current page observed more than 1000 exact Run identities');
  }
  const runs=[];
  for (let index=0;index<identitySnapshot.runRefs.length;index+=8) {
    const batch=identitySnapshot.runRefs.slice(index,index+8);
    runs.push(...await Promise.all(batch.map(async ({ targetId,runId }) => {
      const run=await getJSON(context,webUrl,
        `/api/execution-targets/${encodeURIComponent(targetId)}/orchestration-runs/${encodeURIComponent(runId)}`);
      if (run.id!==runId || run.targetId!==targetId
        || typeof run.automationResourceId!=='string' || !run.automationResourceId.trim()) {
        throw new Error(`current page Run identity did not resolve exactly: ${JSON.stringify({ targetId,runId,run })}`);
      }
      return { targetId,runId,automationResourceId:run.automationResourceId };
    })));
  }
  const resourceIds=[...new Set([
    ...identitySnapshot.historyResourceIds,
    ...runs.map(({ automationResourceId }) => automationResourceId),
  ])].sort();
  if (resourceIds.length===0) {
    throw new Error('strict SSE replay has no current-page observed Automation identities');
  }
  return { resourceIds,runs };
}

async function resolveAuthoritativeRunClosure(context,closure) {
  if (closure.length>1000) throw new Error('authoritative replay closure exceeds 1000 Runs');
  const closureKeys=new Set(closure.map(({ targetId,runId }) => `${targetId}\0${runId}`));
  const runs=[];
  const links=[];
  for (let index=0;index<closure.length;index+=8) {
    const batch=closure.slice(index,index+8);
    const facts=await Promise.all(batch.map(async ({ targetId,runId }) => {
      const [run,relations]=await Promise.all([
        getJSON(context,webUrl,
          `/api/execution-targets/${encodeURIComponent(targetId)}/orchestration-runs/${encodeURIComponent(runId)}`),
        getJSON(context,webUrl,
          `/api/execution-targets/${encodeURIComponent(targetId)}/orchestration-runs/${encodeURIComponent(runId)}/relations`),
      ]);
      if (run.id!==runId || run.targetId!==targetId
        || !Number.isSafeInteger(run.revision) || run.revision<1
        || typeof run.status!=='string' || !run.status) {
        throw new Error(`replay closure Run fact drifted: ${JSON.stringify({ targetId,runId,run })}`);
      }
      if (relations.runId!==runId) {
        throw new Error(`replay closure relations drifted: ${JSON.stringify({ targetId,runId,relationsRunId:relations.runId })}`);
      }
      return { run,relations };
    }));
    for (const { run,relations } of facts) {
      runs.push({ id:run.id,targetId:run.targetId,revision:run.revision,status:run.status });
      for (const child of relations.childRuns??[]) {
        const childTargetId=child.targetId||run.targetId;
        const childKey=`${childTargetId}\0${child.childRunId}`;
        if (!closureKeys.has(childKey)) {
          throw new Error(`replay relation child is outside its exact closure: ${JSON.stringify({ parentRunId:run.id,childTargetId,childRunId:child.childRunId })}`);
        }
        links.push({
          parentTargetId:run.targetId,parentRunId:run.id,
          childTargetId,childRunId:child.childRunId,
        });
      }
    }
  }
  return { runs,links };
}

function detailReadObservation(
  read,connections,injectedRun,introducedChildKeys,authoritativeRunByKey,
) {
  const streamed=runObservationAtRequest(
    read.runId,read.at,connections,
    read.runId===injectedRun.id ? injectedRun : undefined,
  );
  if (streamed.observed) return { ...streamed,source:'execution-sse' };
  const key=`${read.targetId}\0${read.runId}`;
  const authoritative=introducedChildKeys.has(key) ? authoritativeRunByKey.get(key) : undefined;
  return authoritative ? {
    id:read.runId,revision:authoritative.revision,status:authoritative.status,
    observed:true,source:'parent-relations-plus-public-run',
  } : streamed;
}

async function browserExecutionCursor(page) {
  return page.evaluate(() => {
    const keys=[];
    for (let index=0;index<window.sessionStorage.length;index+=1) {
      const key=window.sessionStorage.key(index);
      if (key?.startsWith('xgc.execution.lastOffset.') && key.endsWith('.local')) keys.push(key);
    }
    if (keys.length!==1) return { key:keys.join(','),streamId:'',offset:0 };
    try {
      const value=JSON.parse(window.sessionStorage.getItem(keys[0])||'{}');
      return {
        key:keys[0],streamId:typeof value.streamId==='string' ? value.streamId : '',
        offset:Number.isSafeInteger(value.offset) ? value.offset : 0,
      };
    } catch {
      return { key:keys[0],streamId:'',offset:0 };
    }
  });
}

async function executionSSEProbeSnapshot(page) {
  return page.evaluate(() => {
    const probe=window.__xgcExecutionSSEProbe;
    if (!probe) throw new Error('execution SSE probe is unavailable');
    return probe.snapshot();
  });
}

function installExecutionSSEProbe() {
  const nativeFetch=window.fetch.bind(window);
  const state={ holdReconnect:false,nextConnectionId:1,connections:[] };
  const heldReleases=[];
  let activeControl;

  const snapshot=() => JSON.parse(JSON.stringify(state));
  const releaseReplayGap=() => {
    state.holdReconnect=false;
    while (heldReleases.length>0) heldReleases.shift()();
  };
  const beginReplayGap=() => {
    if (state.holdReconnect) throw new Error('execution SSE replay gap is already active');
    if (!activeControl) throw new Error('execution SSE has no active response body to disconnect');
    state.holdReconnect=true;
    const connectionId=activeControl.connection.id;
    activeControl.disconnect();
    return connectionId;
  };
  window.__xgcExecutionSSEProbe={ snapshot,beginReplayGap,releaseReplayGap };

  window.fetch=async (...args) => {
    const request=new Request(args[0],args[1]);
    const url=new URL(request.url,window.location.href);
    if (request.method!=='GET' || url.pathname!=='/api/execution-targets/local/events'
      || !String(request.headers.get('Accept')||'').toLowerCase().includes('text/event-stream')) {
      return nativeFetch(...args);
    }
    const connection={
      id:state.nextConnectionId++,requestedAt:Date.now(),url:url.href,
      afterOffset:Number(url.searchParams.get('afterOffset')||0),
      lastEventId:request.headers.get('Last-Event-ID')||'',
      requestStreamId:request.headers.get('X-XGC-Execution-Stream-ID')||'',
      frames:[],droppedFrames:0,
    };
    state.connections.push(connection);
    if (state.holdReconnect) {
      connection.heldAt=Date.now();
      await new Promise((resolve) => heldReleases.push(resolve));
      connection.releasedAt=Date.now();
    }
    let response;
    try {
      response=await nativeFetch(...args);
    } catch (cause) {
      connection.fetchError=cause instanceof Error ? cause.message : String(cause);
      connection.finishedAt=Date.now();
      throw cause;
    }
    connection.openedAt=Date.now();
    connection.status=response.status;
    connection.responseStreamId=response.headers.get('X-XGC-Execution-Stream-ID')||'';
    connection.responseLatestOffset=Number(response.headers.get('X-XGC-Execution-Latest-Offset')||0);
    if (!response.body) return response;

    const reader=response.body.getReader();
    const decoder=new TextDecoder();
    let buffer='';
    let terminated=false;
    let streamController;
    const parseFrames=(chunk) => {
      buffer+=decoder.decode(chunk,{ stream:true }).replaceAll('\r\n','\n');
      const frames=buffer.split('\n\n');
      buffer=frames.pop();
      for (const frame of frames) {
        const parsed=parseExecutionSSEFrame(frame);
        if (!parsed) continue;
        if (connection.frames.length>=2_000) connection.droppedFrames+=1;
        else connection.frames.push({ ...parsed,receivedAt:Date.now() });
      }
    };
    const finish=() => {
      if (!connection.finishedAt) connection.finishedAt=Date.now();
      if (activeControl?.connection.id===connection.id) activeControl=undefined;
    };
    const controlledBody=new ReadableStream({
      start(controller) {
        streamController=controller;
        activeControl={
          connection,
          disconnect:() => {
            if (terminated) return;
            terminated=true;
            connection.testDisconnectedAt=Date.now();
            controller.error(new DOMException('forced execution SSE replay gap','NetworkError'));
            void reader.cancel('forced execution SSE replay gap').catch(() => undefined);
            finish();
          },
        };
        void (async () => {
          try {
            while (!terminated) {
              const { value,done }=await reader.read();
              if (done) break;
              parseFrames(value);
              controller.enqueue(value);
            }
            if (!terminated) controller.close();
          } catch (cause) {
            if (!terminated) {
              terminated=true;
              connection.streamError=cause instanceof Error ? cause.message : String(cause);
              controller.error(cause);
            }
          } finally {
            finish();
          }
        })();
      },
      cancel(reason) {
        if (terminated) return;
        terminated=true;
        connection.consumerCanceledAt=Date.now();
        void reader.cancel(reason).catch(() => undefined);
        finish();
      },
    });
    if (!streamController) throw new Error('execution SSE probe stream did not initialize');
    return new Response(controlledBody,{
      status:response.status,statusText:response.statusText,headers:new Headers(response.headers),
    });
  };

  function parseExecutionSSEFrame(frame) {
    let id='';
    let event='message';
    const data=[];
    for (const line of frame.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      const delimiter=line.indexOf(':');
      const field=delimiter>=0 ? line.slice(0,delimiter) : line;
      const raw=delimiter>=0 ? line.slice(delimiter+1) : '';
      const value=raw.startsWith(' ') ? raw.slice(1) : raw;
      if (field==='id') id=value;
      if (field==='event') event=value;
      if (field==='data') data.push(value);
    }
    if (data.length===0) return undefined;
    try {
      const payload=JSON.parse(data.join('\n'));
      const run=payload.run && typeof payload.run==='object' && !Array.isArray(payload.run)
        ? payload.run : undefined;
      return {
        id,event,offset:payload.offset,entityType:payload.entityType,
        entityId:payload.entityId,seq:payload.seq,type:payload.type,
        ...(Number.isSafeInteger(run?.revision) ? { runRevision:run.revision } : {}),
        ...(typeof run?.status==='string' ? { runStatus:run.status } : {}),
      };
    } catch (cause) {
      return { id,event,parseError:cause instanceof Error ? cause.message : String(cause) };
    }
  }
}

async function selectMode(page,experimentId,mode) {
  const root = page.locator(`[data-xgc-role="experiment-run-mode-select"][data-xgc-id="${experimentId}"]`);
  await root.waitFor({ state:'visible',timeout:30_000 });
  if (await root.getAttribute('data-disabled') === 'true') throw new Error(`${activeCell} mode selector disabled`);
  const trigger=root.getByRole('button');
  try {
    await trigger.click({ timeout:30_000 });
  } catch (cause) {
    throw new Error(`${activeCell} mode selector was not actionable: ${JSON.stringify({
      disabled:await trigger.isDisabled().catch(() => undefined),
      title:await trigger.getAttribute('title').catch(() => undefined),
      rootDisabled:await root.getAttribute('data-disabled').catch(() => undefined),
    })}`,{ cause });
  }
  await page.getByRole('option',{ name:mode,exact:true }).click({ timeout:30_000 });
  await page.locator(`[data-xgc-role="experiment-run-mode"][data-xgc-id="${experimentId}"][data-xgc-value="${mode}"]`)
    .waitFor({ state:'visible',timeout:30_000 });
}

async function stopVisibleRun(page) {
  const stop = page.locator('[data-xgc-role="experiment-stop"]');
  if (await stop.count() && !await stop.isDisabled()) {
    await stop.click({ timeout:30_000 });
    await page.locator('[data-xgc-role="experiment-run"]').waitFor({ state:'visible',timeout:waitTimeoutMs });
  }
}

function required(name,fallback) {
  const value=process.env[name]?.trim() || fallback;
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredURL(name,fallback) {
  const parsed=new URL(required(name,fallback));
  if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password
    || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error(`${name} must be an HTTP origin`);
  return parsed.origin;
}

function requiredPositiveInteger(name,fallback) {
  const value=Number.parseInt(required(name,String(fallback)),10);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function requiredMinimumInteger(name,fallback,minimum) {
  const value=requiredPositiveInteger(name,fallback);
  if (value<minimum) throw new Error(`${name} must be at least ${minimum}`);
  return value;
}
