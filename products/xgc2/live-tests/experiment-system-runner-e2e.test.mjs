/* global process,setImmediate,URL */

import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  ExperimentStopUIRecoveryError,
  LiveHarnessError,
  classifyLiveOutcome,
  clickAndWaitForPageResponse,
  completedExperimentStopEvidence,
  emptyLiveLayers,
  isLiveHarnessError,
  managedWorkflowBindingIds,
  managedWorkflowPolicies,
  reconcileForeignActiveExperimentSessions,
  runWithLiveReport,
  startExperimentThroughUI,
  stopExperimentThroughUI,
  waitForStartBoundary,
} from './experiment-system-runner-e2e.mjs';

const closedMessage='Target page, context or browser has been closed';

test('registers the response wait on the same open page before click',async () => {
  const order=[];
  const owned={ id:'page-1' };
  const page={
    isClosed:() => false,
    waitForResponse:() => {
      order.push('wait');
      return Promise.resolve({ status:() => 202 });
    },
  };
  Object.assign(page,owned);
  const response=await clickAndWaitForPageResponse(page,{
    timeoutMs:1_000,
    match:() => true,
    click:async () => {
      order.push('click');
      assert.equal(page.id,'page-1');
    },
  });
  assert.deepEqual(order,['wait','click']);
  assert.equal(response.status(),202);
});

test('closed page during click/response is Harness, not Lifecycle, and does not leak rejection',async () => {
  const leaks=[];
  const onLeak=(reason) => { leaks.push(reason); };
  process.on('unhandledRejection',onLeak);
  let closed=false;
  let rejectWait;
  const wait=new Promise((_,reject) => { rejectWait=reject; });
  const page={
    isClosed:() => closed,
    waitForResponse:() => wait,
  };
  try {
    await assert.rejects(
      () => clickAndWaitForPageResponse(page,{
        timeoutMs:1_000,
        match:() => true,
        click:async () => {
          closed=true;
          rejectWait(new Error(closedMessage));
          throw new Error(closedMessage);
        },
      }),
      (error) => {
        assert.equal(error instanceof LiveHarnessError,true);
        assert.equal(error.layer,'Harness');
        assert.match(error.message,/closed before System Runner POST was accepted/);
        return true;
      },
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(leaks.length,0);
    const classified=classifyLiveOutcome({
      authoring:'PASS',acceptedRunId:'',cause:new LiveHarnessError(closedMessage),
    });
    assert.equal(classified.outcome,'FAIL');
    assert.equal(classified.layers.Harness,'FAIL');
    assert.equal(classified.layers.Authoring,'PASS');
    assert.equal(classified.layers.Lifecycle,'not-run');
    assert.equal(classified.layers.DataPlane,'not-run');
  } finally {
    process.off('unhandledRejection',onLeak);
  }
});

test('Stop observes the exact response regardless of status and reports a non-2xx body immediately',async () => {
  const response=runnerResponse(404,{ error:'no active Experiment Session' });
  let waits=0;
  const page={
    isClosed:() => false,
    locator:() => ({
      waitFor:async () => undefined,
      isDisabled:async () => false,
      click:async () => undefined,
    }),
    waitForResponse:async (match) => {
      waits+=1;
      assert.equal(match(response),true);
      return response;
    },
  };

  await assert.rejects(() => stopExperimentThroughUI({
    page,context:{},webUrl:'http://127.0.0.1:5174',experiment:experimentFixture(),runId:'run-1',timeoutMs:50,
  }),/System Runner Stop HTTP 404: \{"error":"no active Experiment Session"\}/);
  assert.equal(waits,1);
});

test('Stop exposes backend-final evidence when only the same-page Run control recovery fails',async () => {
  const response=runnerResponse(202,{ run:{ actionId:'stop-all' } });
  const stopControl={
    waitFor:async () => undefined,isDisabled:async () => false,click:async () => undefined,
    count:async () => 1,isVisible:async () => true,
    getAttribute:async (name) => name==='data-xgc-mode' ? 'stop' : null,
  };
  const runControl={
    waitFor:async () => { throw new Error('Run control remained absent'); },
    count:async () => 0,
  };
  const loadingControl={ count:async () => 0 };
  const page={
    isClosed:() => false,
    locator:(selector) => selector.includes('experiment-stop')
      ? stopControl
      : selector.includes('experiment-state-loading') ? loadingControl : runControl,
    waitForResponse:async (match) => {
      assert.equal(match(response),true);
      return response;
    },
  };
  const context={ request:{ get:async (url) => jsonResponse(backendStopPayload(url)) } };

  await assert.rejects(() => stopExperimentThroughUI({
    page,context,webUrl:'http://127.0.0.1:5174',experiment:experimentFixture(),runId:'run-1',timeoutMs:50,
  }),(error) => {
    assert.equal(error instanceof ExperimentStopUIRecoveryError,true);
    const evidence=completedExperimentStopEvidence(error);
    assert.equal(evidence?.backendFinal.status,'confirmed');
    assert.equal(evidence?.backendFinal.run.status,'stopped');
    assert.deepEqual(evidence?.backendFinal.sessions,[]);
    assert.deepEqual(evidence?.backendFinal.ownedProcesses,[]);
    assert.equal(evidence?.uiRunControlRecovery.status,'failed');
    assert.deepEqual(evidence?.uiRunControlRecovery.controls,[{
      role:'experiment-stop',visible:true,disabled:false,title:null,mode:'stop',
    }]);
    return true;
  });
});

test('Start reports the accepted exact root before a later dispatch-boundary failure',async () => {
  const accepted=acceptedRunnerRoot();
  const response=startRunnerResponse(202,{ run:accepted });
  const page={
    isClosed:() => false,
    locator:() => ({
      waitFor:async () => undefined,
      isDisabled:async () => false,
      click:async () => undefined,
      getAttribute:async () => null,
    }),
    waitForResponse:async (match) => {
      assert.equal(match(response),true);
      return response;
    },
  };
  const terminal={ ...accepted,status:'failed',primaryError:'dispatch failed' };
  const context={ request:{ get:async () => jsonResponse(terminal) } };
  const observed=[];

  await assert.rejects(() => startExperimentThroughUI({
    page,context,webUrl:'http://127.0.0.1:5174',experiment:experimentFixture(),runMode:'simulation',
    timeoutMs:5,onAccepted:(run) => observed.push(run.id),
  }),/System Runner did not open its Session and seal the managed Panel dispatch set/);
  assert.deepEqual(observed,['run-accepted']);
});

test('Start observes a placement-bearing 404 immediately instead of timing out',async () => {
  const response=startRunnerResponse(404,{ error:'deployment placement rejected' });
  let waits=0;
  const page={
    isClosed:() => false,
    locator:() => ({
      waitFor:async () => undefined,
      isDisabled:async () => false,
      click:async () => undefined,
    }),
    waitForResponse:async (match) => {
      waits+=1;
      assert.equal(match(response),true);
      return response;
    },
  };

  await assert.rejects(() => startExperimentThroughUI({
    page,context:{},webUrl:'http://127.0.0.1:5174',experiment:experimentFixture(),runMode:'simulation',timeoutMs:50,
  }),/System Runner Start HTTP 404: \{"error":"deployment placement rejected"\}/);
  assert.equal(waits,1);
});

test('Start matches deployment placement and passes a durable boundary inside ten seconds despite slower observation',async () => {
  const clockStart=Date.parse('2026-08-30T05:00:00.000Z');
  await withMockClock(clockStart,async (advance) => {
    const accepted=acceptedRunnerRoot();
    const response=startRunnerResponse(202,{ run:accepted });
    const page=startPage(response,advance,{ responseMs:3_000 });
    const context=startBoundaryContext({
      clockStart,advance,groupSealedMs:5_000,childBoundMs:4_500,readMs:2_500,
    });
    const observed=[];

    const started=await startExperimentThroughUI({
      page,context,webUrl:'http://127.0.0.1:5174',experiment:experimentFixture(),
      runMode:'simulation',timeoutMs:10_000,onAccepted:(run) => observed.push(run.id),
    });

    assert.deepEqual(observed,['run-accepted']);
    assert.equal(started.durableBoundaryAt,'2026-08-30T05:00:05.000Z');
    assert.equal(started.dispatchLatencyMs,5_000);
    assert.equal(started.latencyMs,5_000);
    assert.equal(started.observationLatencyMs,10_525);
    assert.deepEqual(started.phaseLatencyMs,{ click:25,response:3_000,boundary:7_500 });
  });
});

test('Start fails when a matched child crosses the durable ten-second boundary',async () => {
  const clockStart=Date.parse('2026-08-30T05:00:00.000Z');
  await withMockClock(clockStart,async (advance) => {
    const accepted=acceptedRunnerRoot();
    const response=startRunnerResponse(202,{ run:accepted });
    const page=startPage(response,advance,{ responseMs:3_000 });
    const context=startBoundaryContext({
      clockStart,advance,groupSealedMs:4_500,childBoundMs:10_001,readMs:2_500,
    });
    const observed=[];

    await assert.rejects(() => startExperimentThroughUI({
      page,context,webUrl:'http://127.0.0.1:5174',experiment:experimentFixture(),
      // A larger observation allowance must not relax the product's 10s gate.
      runMode:'simulation',timeoutMs:12_000,onAccepted:(run) => observed.push(run.id),
    }),/durable dispatch boundary took 10001 ms; limit is 10000 ms/);
    assert.deepEqual(observed,['run-accepted']);
  });
});

test('Start boundary rejects a non-exact managed member set',async () => {
  const context=startBoundaryContext({
    clockStart:Date.now(),advance:() => undefined,groupSealedMs:1,childBoundMs:2,readMs:0,
    memberItemKey:'foreign-panel',
  });
  await assert.rejects(() => waitForStartBoundary(
    context,'http://127.0.0.1:5174',experimentFixture(),'run-accepted','simulation',5,
  ),/did not open its Session and seal the managed Panel dispatch set/);
});

test('managed dispatch expectations without ROS Control include only managed Panel bindings',() => {
  const experiment=experimentFixture();
  assert.deepEqual(managedWorkflowBindingIds(experiment),['panel-a']);
  assert.deepEqual([...managedWorkflowPolicies(experiment)],[[
    'panel-a',{ relation:'supervised',cancelPolicy:'cascade' },
  ]]);
});

test('managed dispatch expectations add xgc-world-services for a ROS Control workflow',async () => {
  const experiment=experimentFixture({ rosControl:true });
  assert.deepEqual(managedWorkflowBindingIds(experiment),['panel-a','xgc-world-services']);
  assert.deepEqual([...managedWorkflowPolicies(experiment)],[
    ['panel-a',{ relation:'supervised',cancelPolicy:'cascade' }],
    ['xgc-world-services',{ relation:'supervised',cancelPolicy:'cascade' }],
  ]);
  const detachedPanelExperiment=experimentFixture({ rosControl:true });
  detachedPanelExperiment.spec.dashboards[0].panels[0].portBindings[0].relation='detached-observed';
  assert.deepEqual(managedWorkflowPolicies(detachedPanelExperiment).get('panel-a'),{
    relation:'detached-observed',cancelPolicy:'retain',
  });

  const context=startBoundaryContext({
    clockStart:Date.now(),advance:() => undefined,groupSealedMs:1,childBoundMs:2,readMs:0,
    extraMemberItemKeys:['xgc-world-services'],
  });
  const boundary=await waitForStartBoundary(
    context,'http://127.0.0.1:5174',experiment,'run-accepted','simulation',5,
  );
  assert.deepEqual(boundary.managedBindingIds,['panel-a','xgc-world-services']);
});

test('Start boundary still rejects an unlisted extra member with ROS Control world services',async () => {
  const experiment=experimentFixture({ rosControl:true });
  const context=startBoundaryContext({
    clockStart:Date.now(),advance:() => undefined,groupSealedMs:1,childBoundMs:2,readMs:0,
    extraMemberItemKeys:['xgc-world-services','unexpected-extra'],
  });
  await assert.rejects(() => waitForStartBoundary(
    context,'http://127.0.0.1:5174',experiment,'run-accepted','simulation',5,
  ),/did not open its Session and seal the managed Panel dispatch set/);
});

test('Start boundary requires every exact child relation to expose boundAt',async () => {
  const context=startBoundaryContext({
    clockStart:Date.now(),advance:() => undefined,groupSealedMs:1,childBoundMs:2,readMs:0,
    omitChildBoundAt:true,
  });
  await assert.rejects(() => waitForStartBoundary(
    context,'http://127.0.0.1:5174',experimentFixture(),'run-accepted','simulation',5,
  ),/did not open its Session and seal the managed Panel dispatch set/);
});

test('Start boundary rejects a non-finite exact child boundAt',async () => {
  const context=startBoundaryContext({
    clockStart:Date.now(),advance:() => undefined,groupSealedMs:1,childBoundMs:2,readMs:0,
    childBoundAt:'not-a-timestamp',
  });
  await assert.rejects(() => waitForStartBoundary(
    context,'http://127.0.0.1:5174',experimentFixture(),'run-accepted','simulation',5,
  ),/dispatchMembers\[0\]\.childRun\.boundAt is not a finite durable dispatch timestamp/);
});

test('Lifecycle is evaluable only after an accepted System Runner root',() => {
  assert.equal(isLiveHarnessError(new Error(closedMessage)),true);
  const before=classifyLiveOutcome({
    authoring:'PASS',acceptedRunId:'',cause:new Error('tiles idle'),
  });
  assert.equal(before.layers.Lifecycle,'not-run');
  assert.equal(before.layers.Harness,'FAIL');
  const after=classifyLiveOutcome({
    authoring:'PASS',acceptedRunId:'root-run',cause:new Error('tiles idle'),
  });
  assert.equal(after.layers.Harness,'PASS');
  assert.equal(after.layers.Lifecycle,'FAIL');
  const pass=classifyLiveOutcome({ authoring:'PASS',acceptedRunId:'root-run' });
  assert.equal(pass.outcome,'PASS');
  assert.equal(pass.layers.Lifecycle,'PASS');
});

test('foreign stop-all failure with empty sessionsAfter is a warning, not a product FAIL',async () => {
  let stopAttempted=false;
  const result=await reconcileForeignActiveExperimentSessions({
    listExperiments:async () => [{ head:{ resourceId:'foreign-exp' } }],
    listSessions:async (experimentId) => {
      if (experimentId!=='foreign-exp') return [];
      if (!stopAttempted) return [{ session:{ state:'active',runMode:'simulation' } }];
      return [];
    },
    stopAll:async () => {
      stopAttempted=true;
      return { ok:false,status:500,body:{ error:'stop-all failed' } };
    },
    reason:'test cleanup',
  });
  assert.equal(result.blocked,false);
  assert.equal(result.remainingActive.length,0);
  assert.equal(result.warnings.length,1);
  assert.equal(result.warnings[0].warning,'stop-all failed but sessionsAfter is empty');
  assert.equal(result.warnings[0].http,500);
});

test('foreign stop-all that leaves an active session is occupancy blocked, not Lifecycle',async () => {
  const result=await reconcileForeignActiveExperimentSessions({
    listExperiments:async () => [{ head:{ resourceId:'foreign-exp' } }],
    listSessions:async () => [{ session:{ state:'active',runMode:'simulation' } }],
    stopAll:async () => ({ ok:false,status:409,body:{ error:'conflict' } }),
  });
  assert.equal(result.blocked,true);
  assert.equal(result.remainingActive.length,1);
  assert.equal(result.warnings.length,0);
});

test('runWithLiveReport always writes JSON and Stops only an accepted root',async () => {
  const dir=mkdtempSync(join(tmpdir(),'xgc-live-harness-'));
  const closedPath=join(dir,'closed.json');
  const closed={ layers:emptyLiveLayers(),errors:[],run:{} };
  closed.layers.Authoring='PASS';
  const stopped=[];
  await runWithLiveReport({
    outPath:closedPath,
    result:closed,
    execute:async () => {
      throw new LiveHarnessError(closedMessage);
    },
    stopAcceptedRun:async (id) => { stopped.push(id); },
  });
  const closedReport=JSON.parse(readFileSync(closedPath,'utf8'));
  assert.equal(closedReport.outcome,'FAIL');
  assert.equal(closedReport.layers.Harness,'FAIL');
  assert.equal(closedReport.layers.Lifecycle,'not-run');
  assert.equal(closedReport.lock,'released');
  assert.equal(stopped.length,0);

  const acceptedPath=join(dir,'accepted.json');
  const accepted={ layers:emptyLiveLayers(),errors:[],run:{} };
  await runWithLiveReport({
    outPath:acceptedPath,
    result:accepted,
    execute:async (report) => {
      report.layers.Authoring='PASS';
      report.run={ id:'root-run',status:'waiting' };
      throw new Error('ROS Control tiles did not project grandchild runtime');
    },
    stopAcceptedRun:async (id) => {
      stopped.push(id);
      return { completed:true,runStatus:'stopped' };
    },
  });
  const acceptedReport=JSON.parse(readFileSync(acceptedPath,'utf8'));
  assert.equal(acceptedReport.layers.Harness,'PASS');
  assert.equal(acceptedReport.layers.Lifecycle,'FAIL');
  assert.deepEqual(stopped,['root-run']);
  assert.equal(acceptedReport.stop.completed,true);
  assert.equal(acceptedReport.lock,'released');
});

function experimentFixture({ rosControl=false }={}) {
  return {
    head:{ resourceId:'experiment-a' },
    spec:{
      deployment:{ placement:'centralized' },
      workflowInstances:rosControl ? [{
        id:'ros-control',
        ref:{ domain:'automation',resourceId:'8933a70a-ddc6-5e43-914b-25e19341fcb1',branch:'main' },
        actionPresets:[],
      }] : [],
      dashboards:[{ panels:[{ portBindings:[{
      kind:'workflow',managed:true,workflowInstanceId:'panel-a',relation:'supervised',
      }] }] }] },
  };
}

async function withMockClock(startedAt,execute) {
  const originalNow=Date.now;
  let now=startedAt;
  Date.now=() => now;
  try {
    return await execute((durationMs) => { now+=durationMs; });
  } finally {
    Date.now=originalNow;
  }
}

function startPage(response,advance,{ responseMs }) {
  let resolveResponse;
  const responsePromise=new Promise((resolve) => { resolveResponse=resolve; });
  return {
    isClosed:() => false,
    locator:() => ({
      waitFor:async () => undefined,
      isDisabled:async () => false,
      getAttribute:async () => null,
      click:async () => {
        advance(25);
        setImmediate(() => {
          advance(responseMs);
          resolveResponse(response);
        });
      },
    }),
    waitForResponse:async (match) => {
      assert.equal(match(response),true);
      return responsePromise;
    },
  };
}

function startBoundaryContext({
  clockStart,advance,groupSealedMs,childBoundMs,readMs,
  memberItemKey='panel-a',extraMemberItemKeys=[],omitChildBoundAt=false,childBoundAt,
}) {
  const waiting={ ...acceptedRunnerRoot(),status:'waiting',revision:2 };
  const memberItemKeys=[memberItemKey,...extraMemberItemKeys];
  const session={ session:{
    state:'active',runMode:'simulation',experimentResourceId:'experiment-a',
  } };
  const relations={
    childRunGroups:[{
      id:'group-a',producerNodeId:'run-panels',state:'sealed',
      expectedMembers:memberItemKeys.length,memberCount:memberItemKeys.length,
      sealedAt:new Date(clockStart+groupSealedMs).toISOString(),
    }],
    childRunGroupMembers:memberItemKeys.map((itemKey,index) => ({
      groupId:'group-a',itemKey,childRunId:`child-${index+1}`,
    })),
    childRuns:memberItemKeys.map((_,index) => ({
      childRunId:`child-${index+1}`,relation:'supervised',cancelPolicy:'cascade',
      ...(!omitChildBoundAt ? {
        boundAt:childBoundAt ?? new Date(clockStart+childBoundMs).toISOString(),
      } : {}),
    })),
  };
  return { request:{ get:async (url) => {
    const parsed=new URL(url);
    if (parsed.pathname.endsWith('/orchestration-runs/run-accepted')) {
      advance(readMs);
      return jsonResponse(waiting);
    }
    if (parsed.pathname.endsWith('/experiment-sessions')) {
      advance(readMs);
      return jsonResponse([session]);
    }
    if (parsed.pathname.endsWith('/orchestration-runs/run-accepted/relations')) {
      advance(readMs);
      return jsonResponse(relations);
    }
    if (parsed.pathname.endsWith('/automation-execution-history')) {
      return jsonResponse({ entries:[{ phase:'run',run:waiting }] });
    }
    throw new Error(`unexpected Start boundary URL ${url}`);
  } } };
}

function runnerResponse(status,body) {
  const request={
    method:() => 'POST',
    postDataJSON:() => ({
      actionId:'stop-all',
      automationRef:{
        domain:'automation',resourceId:'069f036b-9638-4827-9524-73ff03fe99c9',branch:'main',
      },
      experimentRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main' },
      idempotencyKey:'request-a',parameters:{},reason:'Stop Experiment experiment-a',requestId:'request-a',
    }),
  };
  return {
    request:() => request,
    status:() => status,
    url:() => 'http://127.0.0.1:5174/api/execution-targets/local/orchestration-runs',
    text:async () => JSON.stringify(body),
  };
}

function startRunnerResponse(status,body) {
  const request={
    method:() => 'POST',
    postDataJSON:() => ({
      actionId:'run',
      automationRef:{
        domain:'automation',resourceId:'069f036b-9638-4827-9524-73ff03fe99c9',branch:'main',
      },
      experimentRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main' },
      idempotencyKey:'request-start',parameters:{ runMode:'simulation',placement:'centralized' },
      reason:'Run Experiment experiment-a',requestId:'request-start',
    }),
  };
  return {
    request:() => request,
    status:() => status,
    url:() => 'http://127.0.0.1:5174/api/execution-targets/local/orchestration-runs',
    text:async () => JSON.stringify(body),
  };
}

function acceptedRunnerRoot() {
  return {
    id:'run-accepted',targetId:'local',automationResourceId:'069f036b-9638-4827-9524-73ff03fe99c9',
    actionId:'run',sourceKind:'experiment',
    sourceRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main' },
    automationRef:{
      domain:'automation',resourceId:'069f036b-9638-4827-9524-73ff03fe99c9',branch:'main',
    },
    rootRunId:'run-accepted',revision:1,parameters:{ runMode:'simulation' },status:'accepted',
  };
}

function jsonResponse(body) {
  return {
    ok:() => true,status:() => 200,text:async () => JSON.stringify(body),json:async () => body,
  };
}

function backendStopPayload(url) {
  const path=new URL(url).pathname;
  if (path.endsWith('/orchestration-runs/run-1')) return { id:'run-1',status:'stopped' };
  if (path.endsWith('/orchestration-runs/run-1/relations')) return { childRuns:[] };
  if (path.endsWith('/experiment-sessions')) return [];
  if (path.endsWith('/process-instances')) return [];
  throw new Error(`unexpected backend Stop evidence URL ${url}`);
}
