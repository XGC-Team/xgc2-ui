/* global URL */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildLocalFleetMatrix,
  createMatrixReceipt,
  executeMatrixPlan,
  parseFailureMode,
  parseSingleCellFilter,
} from './local-fleet-experiment-e2e-matrix-support.mjs';
import {
  buildRepeatedModeMatrix,
  fixtureLanePlans,
  resolveLaneRunModes,
} from './six-experiments-mode-matrix.mjs';
import {
  assertNoRetiredWorkflowRouteRequests,
  isRetiredWorkflowRunPath,
  recordRetiredWorkflowRouteRequest,
} from './retired-workflow-route-ledger.mjs';

const fixtureRecipes=JSON.parse(readFileSync(
  new URL('../../local-fleet-lab/experiment-fixture-recipes.json',import.meta.url),'utf8',
)).recipes;

function resolvedLanes() {
  return fixtureLanePlans(fixtureRecipes).map((plan) => resolveLaneRunModes(plan,{
    head:{ resourceId:`experiment-${plan.key}` },
    spec:{
      runModes:plan.modePolicy==='hybrid-required'
        ? ['simulation','physical','hybrid']
        : ['simulation','physical'],
    },
  }));
}

function passingResult(run,{ outcome=run.mode==='simulation' ? 'passed' : 'blocked-hardware' }={}) {
  const timestamp='2026-08-24T00:00:00.000Z';
  return {
    key:run.key,lane:run.lane,mode:run.mode,round:run.round,experimentId:run.experimentId,
    outcome,startedAt:timestamp,finishedAt:timestamp,runId:`run-${run.key}-${run.round}`,
    checks:{
      panelWorkflowsStarted:true,experimentActive:true,stopOwnedWorkZero:true,noRuntimeErrors:true,
      noUserScriptExecution:run.mode==='simulation' ? null : true,
      noRetiredWorkflowRouteRequests:true,
    },
    browserEvidence:run.mode==='simulation' ? {
      contract:'browser-resource-diagnostics-v1',
      supportModule:'live-tests/browser-resource-diagnostics.mjs',
      status:'captured',screenshotPath:'/tmp/cell.png',sampleIds:['before','active','after-stop'],
    } : null,
    observation:{ waitingWorkflowCount:1 },
    stop:{ activeOwnedWorkCount:0 },
    errors:[],
  };
}

test('records and rejects both retired Workflow Run path segments exactly',() => {
  for (const path of [
    '/api/execution-targets/local/workflow-runs',
    '/api/execution-targets/local/workflow-runs/run-a',
    '/api/execution-targets/local/experiment-workflow-runs',
    '/api/execution-targets/local/experiment-workflow-runs/run-a/stop',
  ]) assert.equal(isRetiredWorkflowRunPath(path),true,path);
  for (const path of [
    '/api/execution-targets/local/orchestration-runs',
    '/api/execution-targets/local/workflow-runs-archive',
    '/api/execution-targets/local/myworkflow-runs',
  ]) assert.equal(isRetiredWorkflowRunPath(path),false,path);

  const ledger=[];
  const request={
    method:() => 'get',
    url:() => 'http://127.0.0.1:5174/api/execution-targets/local/workflow-runs/run-a?limit=1',
  };
  assert.deepEqual(recordRetiredWorkflowRouteRequest(ledger,request,'four-scout/physical/round-1'),{
    cell:'four-scout/physical/round-1',method:'GET',
    path:'/api/execution-targets/local/workflow-runs/run-a',
    url:'http://127.0.0.1:5174/api/execution-targets/local/workflow-runs/run-a?limit=1',
  });
  assert.throws(() => assertNoRetiredWorkflowRouteRequests(ledger,{
    scope:'four-scout/physical/round-1',
  }),/used retired Workflow Run endpoints/);
  assert.deepEqual(assertNoRetiredWorkflowRouteRequests(ledger,{
    startIndex:ledger.length,scope:'next cell',
  }),[]);
});

test('builds the canonical 14 cells and 42 repeat runs',() => {
  const plan=buildLocalFleetMatrix(resolvedLanes(),{ repeatRounds:3,buildRepeatedModeMatrix });
  assert.equal(plan.canonicalCellCount,14);
  assert.equal(plan.canonicalRunCount,42);
  assert.equal(plan.baseCells.length,14);
  assert.equal(plan.runs.length,42);
  assert.equal(plan.baseCells.filter(({ mode }) => mode==='simulation').length,5);
  assert.equal(plan.baseCells.filter(({ mode }) => mode==='physical').length,5);
  assert.equal(plan.baseCells.filter(({ mode }) => mode==='hybrid').length,4);
  assert.deepEqual(plan.baseCells.slice(0,2).map(({ key }) => key),[
    'camera-intrinsic/simulation','camera-intrinsic/physical',
  ]);
  assert.ok(plan.runs.slice(0,6).every(({ lane }) => lane==='camera-intrinsic'));
  for (const cell of plan.baseCells) {
    assert.deepEqual(plan.runs.filter(({ key }) => key===cell.key).map(({ round }) => round),[1,2,3]);
  }
});

test('filters one exact cell without weakening repeat=3',() => {
  const plan=buildLocalFleetMatrix(resolvedLanes(),{
    repeatRounds:3,cellFilter:'four-scout/hybrid',buildRepeatedModeMatrix,
  });
  assert.equal(plan.canonicalCellCount,14);
  assert.equal(plan.canonicalRunCount,42);
  assert.deepEqual(plan.selectedCells.map(({ key }) => key),['four-scout/hybrid']);
  assert.deepEqual(plan.runs.map(({ key,round }) => ({ key,round })),[
    { key:'four-scout/hybrid',round:1 },
    { key:'four-scout/hybrid',round:2 },
    { key:'four-scout/hybrid',round:3 },
  ]);
  assert.equal(parseSingleCellFilter(' camera-intrinsic/simulation '),'camera-intrinsic/simulation');
  assert.throws(() => parseSingleCellFilter('four-scout'),/lane\/mode/);
  assert.throws(() => buildLocalFleetMatrix(resolvedLanes(),{
    repeatRounds:3,cellFilter:'camera-intrinsic/hybrid',buildRepeatedModeMatrix,
  }),/was not found/);
});

test('supports fail-fast and continue execution modes',async () => {
  const plan={ runs:[
    { key:'four-scout/simulation',lane:'four-scout',mode:'simulation',round:1,experimentId:'experiment-four-scout' },
    { key:'four-scout/simulation',lane:'four-scout',mode:'simulation',round:2,experimentId:'experiment-four-scout' },
    { key:'four-scout/simulation',lane:'four-scout',mode:'simulation',round:3,experimentId:'experiment-four-scout' },
  ] };
  const executeCell=async (run) => {
    if (run.round===2) throw new Error('round two failed');
    return passingResult(run);
  };
  const failFast=await executeMatrixPlan(plan,{ executeCell,failureMode:'fail-fast' });
  assert.equal(failFast.results.length,2);
  assert.equal(failFast.results[1].outcome,'failed');
  assert.equal(failFast.stoppedEarly,true);
  assert.equal(failFast.remainingRuns,1);

  const continued=await executeMatrixPlan(plan,{ executeCell,failureMode:'continue' });
  assert.equal(continued.results.length,3);
  assert.equal(continued.results[1].outcome,'failed');
  assert.equal(continued.stoppedEarly,false);
  assert.equal(continued.remainingRuns,0);
  assert.equal(parseFailureMode('continue'),'continue');
  assert.throws(() => parseFailureMode('best-effort'),/fail-fast or continue/);
});

test('emits a stable receipt and never calls hardware-blocked cells passed',() => {
  const plan=buildLocalFleetMatrix(resolvedLanes(),{
    repeatRounds:3,cellFilter:'camera-intrinsic/physical',buildRepeatedModeMatrix,
  });
  const results=plan.runs.map((run) => passingResult(run));
  const receipt=createMatrixReceipt({
    configuration:{
      webUrl:'http://127.0.0.1:5174',repeatRounds:3,
      cellFilter:'camera-intrinsic/physical',failureMode:'continue',hardware:'absent',
    },
    discovery:resolvedLanes().map((lane) => ({
      lane:lane.key,name:lane.name,experimentId:lane.experiment.head.resourceId,runModes:lane.modes,
    })),
    plan,results,startedAt:'2026-08-24T00:00:00.000Z',finishedAt:'2026-08-24T00:01:00.000Z',
  });
  assert.equal(receipt.contract,'local-fleet-experiment-e2e-matrix-v1');
  assert.equal(receipt.schemaVersion,1);
  assert.equal(receipt.status,'blocked');
  assert.deepEqual(receipt.summary,{
    plannedRuns:3,completedRuns:3,remainingRuns:0,
    passed:0,blockedHardware:3,lifecycleOnly:0,failed:0,
  });
  assert.ok(receipt.results.every(({ outcome }) => outcome==='blocked-hardware'));
  assert.throws(() => createMatrixReceipt({
    configuration:{
      webUrl:'http://127.0.0.1:5174',repeatRounds:3,
      cellFilter:'camera-intrinsic/physical',failureMode:'continue',hardware:'absent',
    },
    plan,results:plan.runs.map((run) => passingResult(run,{ outcome:'passed' })),
    startedAt:'2026-08-24T00:00:00.000Z',finishedAt:'2026-08-24T00:01:00.000Z',
  }),/cannot claim full pass/);
});

test('requires attached browser diagnostics and screenshot for simulation pass',() => {
  const plan=buildLocalFleetMatrix(resolvedLanes(),{
    repeatRounds:3,cellFilter:'six-px4/simulation',buildRepeatedModeMatrix,
  });
  const invalid=passingResult(plan.runs[0]);
  invalid.browserEvidence={ status:'captured',screenshotPath:'/tmp/cell.png',sampleIds:['only-one'] };
  assert.throws(() => createMatrixReceipt({
    configuration:{
      webUrl:'http://127.0.0.1:5174',repeatRounds:3,
      cellFilter:'six-px4/simulation',failureMode:'fail-fast',hardware:'absent',
    },
    plan,results:[invalid],startedAt:'2026-08-24T00:00:00.000Z',finishedAt:'2026-08-24T00:01:00.000Z',
  }),/browser evidence attachment/);
});

test('records backend-final Stop evidence and suppresses cleanup POST after UI-only recovery failure',() => {
  const source=readFileSync(new URL('./local-fleet-experiment-e2e-matrix.mjs',import.meta.url),'utf8');
  const recoveryEvidence=source.indexOf('const stoppedEvidence=completedExperimentStopEvidence(stopCause)');
  const backendStopped=source.indexOf('stopped=true',recoveryEvidence);
  const recordStop=source.indexOf('result.stop=await assertOwnedWorkZero',backendStopped);
  const rethrow=source.indexOf('throw stopCause',recordStop);
  const cleanupGuard=source.indexOf('if (acceptedRunId && !stopped)',rethrow);
  assert.ok(recoveryEvidence>=0,'matrix must recognize backend-final UI recovery evidence');
  assert.ok(backendStopped>recoveryEvidence,'matrix must mark backend stopped before rethrowing the UI failure');
  assert.ok(recordStop>backendStopped,'matrix must record backend-final evidence before rethrowing');
  assert.ok(rethrow>recordStop,'UI recovery failure must still fail the cell');
  assert.ok(cleanupGuard>rethrow,'cleanup must remain fenced by the backend stopped marker');
  assert.match(source,/uiRunControlRecovery:stoppedEvidence\.uiRunControlRecovery/);
});

test('captures an accepted Start root before awaiting its boundary and cleans it on failure',() => {
  const source=readFileSync(new URL('./local-fleet-experiment-e2e-matrix.mjs',import.meta.url),'utf8');
  const awaitedStart=source.indexOf('const started=await startExperimentThroughUI({');
  const acceptedCallback=source.indexOf('onAccepted:(accepted) => {',awaitedStart);
  const acceptedIdentity=source.indexOf('acceptedRunId=accepted.id',acceptedCallback);
  const receiptIdentity=source.indexOf('result.runId=acceptedRunId',acceptedIdentity);
  const boundaryObservation=source.indexOf('const observation=await observeActiveCell',receiptIdentity);
  const cleanupGuard=source.indexOf('if (acceptedRunId && !stopped)',boundaryObservation);
  const cleanupStop=source.indexOf('runId:acceptedRunId,timeoutMs:configuration.waitMs',cleanupGuard);
  assert.ok(awaitedStart>=0,'matrix must start through the shared browser helper');
  assert.ok(acceptedCallback>awaitedStart,'matrix must receive the root at the 202 acceptance boundary');
  assert.ok(acceptedIdentity>acceptedCallback && receiptIdentity>acceptedIdentity,
    'accepted identity must be recorded by onAccepted');
  assert.ok(boundaryObservation>receiptIdentity,'boundary observation must happen after accepted identity capture');
  assert.ok(cleanupGuard>boundaryObservation,'a rejected boundary must enter accepted-root cleanup');
  assert.ok(cleanupStop>cleanupGuard,'cleanup must Stop the exact accepted root');
});

test('records durable dispatch and browser observation timing separately',() => {
  const source=readFileSync(new URL('./local-fleet-experiment-e2e-matrix.mjs',import.meta.url),'utf8');
  assert.match(source,/durableBoundaryAt:started\.durableBoundaryAt/);
  assert.match(source,/dispatchLatencyMs:started\.dispatchLatencyMs/);
  assert.match(source,/observationLatencyMs:started\.observationLatencyMs/);
  assert.match(source,/phaseLatencyMs:started\.phaseLatencyMs/);
});
