/* global URL */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
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
  selectForwardClearRobotID,
} from './local-fleet-ugv-remote-control-contract.mjs';

const zero={ linear:{ x:0,y:0,z:0 },angular:{ x:0,y:0,z:0 } };
const forward={ linear:{ x:0.5,y:0,z:0 },angular:{ x:0,y:0,z:0 } };

test('selects a proper authored subset and preserves controller identity',() => {
  assert.deepEqual(resolveRemoteControlSelection(['scout-01','scout-02','scout-03'],['scout-03','scout-01']),{
    selectedRobotIDs:['scout-01','scout-03'],siblingRobotIDs:['scout-02'],
  });
  assert.deepEqual(resolveRemoteControlSelection(['mecanum-01','mecanum-02']),{
    selectedRobotIDs:['mecanum-01'],siblingRobotIDs:['mecanum-02'],
  });
  assert.doesNotThrow(() => assertControllerRobotIDs(['scout-03','scout-01'],['scout-01','scout-03']));
  assert.throws(() => resolveRemoteControlSelection(['scout-01'],[]),/at least two/);
  assert.throws(() => resolveRemoteControlSelection(['scout-01','scout-02'],['scout-01','scout-02']),/unselected sibling/);
  assert.throws(() => resolveRemoteControlSelection(['scout-01','scout-02'],['gone']),/not authored/);
});

test('chooses a default remote-control Robot whose forward lane is clear',() => {
  const robots=[
    { id:'scout-01',initialPose:{ x:0,y:0,yaw:0 } },
    { id:'scout-02',initialPose:{ x:3,y:0,yaw:0 } },
    { id:'scout-03',initialPose:{ x:0,y:3,yaw:0 } },
    { id:'scout-04',initialPose:{ x:3,y:3,yaw:0 } },
  ];
  const defaultRobotID=selectForwardClearRobotID(robots);
  assert.equal(defaultRobotID,'scout-04');
  assert.deepEqual(resolveRemoteControlSelection(
    robots.map((robot) => robot.id),[],defaultRobotID,
  ),{
    selectedRobotIDs:['scout-04'],
    siblingRobotIDs:['scout-01','scout-02','scout-03'],
  });
  assert.throws(
    () => selectForwardClearRobotID([{ id:'broken',initialPose:{ x:0,y:0 } }]),
    /finite initial x, y, yaw/,
  );
});

test('freezes disconnected Robot truth while refreshing live sibling telemetry',() => {
  const previous=[
    { robotId:'scout-04',position:{ x:3,y:3,z:0.18 } },
    { robotId:'scout-01',position:{ x:0,y:0,z:0.18 } },
  ];
  const live=[{ robotId:'scout-01',position:{ x:0.01,y:0,z:0.18 } }];
  assert.deepEqual(composeDisconnectedBaseline(previous,live,['scout-04']),[
    previous[0],live[0],
  ]);
  assert.throws(
    () => composeDisconnectedBaseline(previous,[...live,previous[0]],['scout-04']),
    /unexpectedly retained live telemetry/,
  );
  assert.throws(
    () => composeDisconnectedBaseline(previous,[],['scout-04']),
    /live sibling.*scout-01/,
  );
});

test('requires the exact browser semantic Action envelope',() => {
  const intent={
    experimentId:'experiment-1',workflowInstanceId:'panel-robot-instruments',
    controllerId:'controller-1',robotIds:['scout-01'],gear:1,longitudinal:1,lateral:0,yaw:0,
  };
  const item={ status:202,intent,request:actionRequest(intent),response:{ applied:1 } };
  assert.equal(assertRemoteActionResponse(item,{
    label:'forward',experimentId:'experiment-1',controllerId:'controller-1',robotIds:['scout-01'],
    intent:{ gear:1,longitudinal:1,lateral:0,yaw:0 },
  }),item);
  assert.throws(() => assertRemoteActionResponse({ ...item,intent:{ ...item.intent,robotIds:['scout-02'] } },{
    label:'forward',experimentId:'experiment-1',controllerId:'controller-1',robotIds:['scout-01'],
    intent:{ gear:1,longitudinal:1,lateral:0,yaw:0 },
  }),/diverged|robotIds/);
  assert.throws(() => assertRemoteActionResponse({ ...item,intent:{ ...item.intent,debug:true } },{
    label:'forward',experimentId:'experiment-1',controllerId:'controller-1',robotIds:['scout-01'],
    intent:{ gear:1,longitudinal:1,lateral:0,yaw:0 },
  }),/diverged|shape drifted|request drifted/);
  assert.throws(() => assertRemoteActionResponse({ ...item,request:{ ...item.request,debug:true } },{
    label:'forward',experimentId:'experiment-1',controllerId:'controller-1',robotIds:['scout-01'],
    intent:{ gear:1,longitudinal:1,lateral:0,yaw:0 },
  }),/request drifted/);
});

test('accepts only exact instrument Panel Run and Stop clicks for the selected Robot',() => {
  const parameters={
    panelId:'robot-instruments',runMode:'simulation',
    inputOverridesJson:JSON.stringify({
      robotId:'scout-01',robotIds:['scout-01'],selectionKey:'selected:["scout-01"]',
    }),
  };
  const request={
    experimentRef:{ domain:'experiment',resourceId:'experiment-1',branch:'main' },
    automationRef:{ domain:'automation',resourceId:'069f036b-9638-4827-9524-73ff03fe99c9',branch:'main' },
    actionId:'run-panel',parameters,requestId:'request-panel',idempotencyKey:'request-panel',
    reason:'Run Panel robot-instruments in Experiment fixture',
  };
  const run={
    id:'panel-root',targetId:'local',automationResourceId:'069f036b-9638-4827-9524-73ff03fe99c9',
    actionId:'run-panel',sourceKind:'experiment',
    sourceRef:{ domain:'experiment',resourceId:'experiment-1',branch:'main' },
    rootRunId:'panel-root',revision:1,parameters,
  };
  assert.equal(assertPanelRunClick({ status:202,request,response:{ run } },{
    experimentId:'experiment-1',panelId:'robot-instruments',robotIds:['scout-01'],
  }),run);
  assert.throws(() => assertPanelRunClick({ status:202,request:{
    ...request,parameters:{ ...parameters,inputOverridesJson:JSON.stringify({
      robotId:'scout-02',robotIds:['scout-02'],selectionKey:'selected:["scout-02"]',
    }) },
  },response:{ run } },{
    experimentId:'experiment-1',panelId:'robot-instruments',robotIds:['scout-01'],
  }),/input overrides drifted/);

  const stopRequest={
    expectedRevision:3,includeAnchor:true,includeDetached:true,reason:'Stop Panel robot-instruments',
    requestId:'request-stop',idempotencyKey:'request-stop',
  };
  const stopResponse={
    anchorRunId:'panel-root',outcomes:[{
      runId:'panel-root',priorStatus:'waiting',accepted:true,alreadyTerminal:false,error:'',
    }],
    receipt:{ result:{ anchorRunId:'panel-root' } },
  };
  assert.equal(assertPanelStopClick({ status:200,request:stopRequest,response:stopResponse },{
    rootRunId:'panel-root',panelId:'robot-instruments',
  }),stopResponse);
  assert.throws(() => assertPanelStopClick({
    status:200,request:{ ...stopRequest,includeDetached:false },response:stopResponse,
  },{ rootRunId:'panel-root',panelId:'robot-instruments' }),/did not stop exact root/);
});

test('matches Panel Run input overrides by exact JSON value instead of property order',() => {
  const selected=['scout-01'];
  assert.equal(panelRunInputOverridesMatch(JSON.stringify({
    robotIds:selected,selectionKey:'selected:["scout-01"]',robotId:'scout-01',
  }),selected),true);
  assert.equal(panelRunInputOverridesMatch(JSON.stringify({
    robotIds:selected,selectionKey:'selected:["scout-01"]',robotId:'scout-01',extra:true,
  }),selected),false);
  assert.equal(panelRunInputOverridesMatch(JSON.stringify({
    robotIds:selected,selectionKey:'all',robotId:'scout-01',
  }),selected),false);
  assert.equal(panelRunInputOverridesMatch('{',selected),false);
});

test('accepts selected ground-truth advancement and rejects sibling motion',() => {
  const before=[sample('scout-01',0,0,zero,0),sample('scout-02',2,0,null,0)];
  const moving=[sample('scout-01',0.04,0,forward,0.45),sample('scout-02',2,0,null,0.01)];
  const after=[sample('scout-01',0.12,0,forward,0.45),sample('scout-02',2.005,0,null,0.01)];
  const evidence=assertMotionIsolation({
    before,moving,after,selectedRobotIDs:['scout-01'],siblingRobotIDs:['scout-02'],
  });
  assert.equal(evidence[0].selected,true);
  assert.throws(() => assertMotionIsolation({
    before,moving:[moving[0],sample('scout-02',2,0,forward,0.5)],
    after:[after[0],sample('scout-02',2.2,0,forward,0.5)],
    selectedRobotIDs:['scout-01'],siblingRobotIDs:['scout-02'],
  }),/unselected sibling moved|sibling cmd_vel/);
  assert.throws(() => assertMotionIsolation({
    before,moving,after,selectedRobotIDs:['scout-01'],siblingRobotIDs:['scout-01'],
  }),/must be disjoint/);
  assert.throws(() => assertMotionIsolation({
    before,moving:[{ ...moving[0],velocity:{} },moving[1]],after,
    selectedRobotIDs:['scout-01'],siblingRobotIDs:['scout-02'],
  }),/velocity truth is malformed/);
});

test('requires release zero plus a stopped ground-truth window',() => {
  const released=[sample('mecanum-01',1,1,zero,0.01)];
  const settled=[sample('mecanum-01',1.005,1,zero,0.01)];
  assert.doesNotThrow(() => assertStoppedMotion({ released,settled,robotIDs:['mecanum-01'] }));
  assert.throws(() => assertStoppedMotion({
    released,settled:[sample('mecanum-01',1.2,1,zero,0.2)],robotIDs:['mecanum-01'],
  }),/did not stop/);
  assert.throws(() => assertStoppedMotion({
    released:[sample('mecanum-01',1,1,forward,0.5)],settled,robotIDs:['mecanum-01'],
  }),/exact zero/);
});

test('extracts exact managed Panel and Robot slot roots',() => {
  assert.deepEqual(panelWorkflowRunId([
    { itemKey:'panel-robot-instruments',targetId:'local',childRunId:'panel-run' },
  ],'panel-robot-instruments','root-run'),{ targetId:'local',runId:'panel-run' });
  const relations={
    childRunGroups:[{ id:'slots',parentRunId:'panel-run',producerNodeId:'robot-slots' }],
    childRunGroupMembers:[{ groupId:'slots',itemKey:'scout-01',childRunId:'slot-run' }],
    childRuns:[{
      childRunId:'slot-run',targetId:'agent-scout',parentRunId:'panel-run',ownerRunId:'panel-run',
      relation:'supervised',waitPolicy:'join-later',cancelPolicy:'cascade',resultPolicy:'reference',
    }],
  };
  assert.deepEqual(robotSlotRun(relations,'scout-01'),{ targetId:'agent-scout',runId:'slot-run' });
  for (const drift of [
    { relation:'attached' },
    { waitPolicy:'join' },
    { cancelPolicy:'retain' },
    { resultPolicy:'propagate' },
    { parentRunId:'other-parent' },
    { ownerRunId:'other-parent' },
  ]) {
    assert.throws(() => robotSlotRun({
      ...relations,childRuns:[{ ...relations.childRuns[0],...drift }],
    },'scout-01'),/lost supervised join-later cascade reference ownership/);
  }
});

test('requires a newer reconnect epoch or replacement owner while siblings stay untouched',() => {
  const before=projection(robot('scout-01','live',4),robot('scout-02','live',7));
  const disconnected=projection(robot('scout-01','revoked',4),robot('scout-02','live',7));
  const reconnected=projection(robot('scout-01','live',5),robot('scout-02','live',7));
  assert.deepEqual(assertConnectionTransition({
    before,disconnected,reconnected,faultRobotId:'scout-01',stableRobotIDs:['scout-02'],
  }),{
    robotId:'scout-01',beforeEpoch:4,disconnectedState:'revoked',reconnectedEpoch:5,
    beforeOwnerRunId:'',afterOwnerRunId:'',ownerChanged:false,
  });
  assert.deepEqual(assertConnectionTransition({
    before,disconnected,reconnected:projection(robot('scout-01','live',1),robot('scout-02','live',7)),
    faultRobotId:'scout-01',stableRobotIDs:['scout-02'],
    beforeOwnerRunId:'slot-old',afterOwnerRunId:'slot-new',
  }),{
    robotId:'scout-01',beforeEpoch:4,disconnectedState:'revoked',reconnectedEpoch:1,
    beforeOwnerRunId:'slot-old',afterOwnerRunId:'slot-new',ownerChanged:true,
  });
  assert.throws(() => assertConnectionTransition({
    before,disconnected,reconnected:projection(robot('scout-01','live',4),robot('scout-02','live',7)),
    faultRobotId:'scout-01',stableRobotIDs:['scout-02'],
  }),/newer epoch or replacement owner/);
  assert.throws(() => assertConnectionTransition({
    before,disconnected,reconnected,faultRobotId:'scout-01',stableRobotIDs:['scout-02'],
    beforeOwnerRunId:'slot-old',
  }),/owner evidence is incomplete/);
  assert.throws(() => assertConnectionTransition({
    before,disconnected,reconnected:projection(robot('scout-01','live',5),robot('scout-02','live',8)),
    faultRobotId:'scout-01',stableRobotIDs:['scout-02'],
  }),/sibling connection changed/);
});

test('Stop closes every local Experiment Session Run and owned Process',() => {
  assert.doesNotThrow(() => assertStopOwnership({
    sessions:[],sessionRuns:[{ id:'root',status:'stopped' },{ id:'command',status:'canceled' }],
    ownedProcesses:[{ id:'process',desiredState:'stopped',observedState:'stopped',handle:null }],
  }));
  assert.throws(() => assertStopOwnership({
    sessions:[],sessionRuns:[{ id:'root',status:'running' }],ownedProcesses:[],
  }),/remained active/);
});

test('final cleanup requires global empty System roots and Sessions plus terminal Action children',() => {
  const closed={
    activeSystemRoots:[],sessions:[],
    runOwnedProcesses:[{ id:'process',desiredState:'stopped',observedState:'stopped',handle:null }],
    actionRuns:[{ id:'action',status:'stopped' }],
  };
  assert.deepEqual(assertFinalGlobalCleanup(closed),closed);
  assert.throws(() => assertFinalGlobalCleanup({
    ...closed,activeSystemRoots:[{ id:'root',status:'waiting' }],
  }),/active System roots/);
  assert.throws(() => assertFinalGlobalCleanup({
    ...closed,sessions:[{ session:{ state:'active' } }],
  }),/Sessions remained/);
  assert.throws(() => assertFinalGlobalCleanup({
    ...closed,runOwnedProcesses:[{ id:'process',desiredState:'stopped',observedState:'stopped',handle:'pid:1' }],
  }),/Run-owned Processes remained active/);
  assert.throws(() => assertFinalGlobalCleanup({
    ...closed,actionRuns:[{ id:'action',status:'waiting' }],
  }),/Action children are not terminal/);
});

test('Mecanum simulation list readouts keep the canonical order and live acceleration truth',() => {
  assert.deepEqual(MECANUM_LIST_METRIC_CONTRACT.map(({ title }) => title),[
    'VRPN pos','VRPN vel','VRPN spd','VRPN acc','CMD vel','CMD twist','Battery vol','Yaw',
  ]);
  const snapshot=mecanumSnapshot(1_000);
  assert.equal(assertMecanumRunningReadouts(snapshot,['mecanum-01','mecanum-02']),snapshot);

  const swapped=mecanumSnapshot(1_000);
  [swapped.cards[0].metrics[2],swapped.cards[0].metrics[3]]
    =[swapped.cards[0].metrics[3],swapped.cards[0].metrics[2]];
  assert.throws(
    () => assertMecanumRunningReadouts(swapped,['mecanum-01','mecanum-02']),
    /metric order drifted/,
  );

  const stoppedAcceleration=mecanumSnapshot(1_000,{},'120.0 Hz',{
    'robot-ground-vrpn-acceleration':'-- Hz',
  });
  assert.throws(
    () => assertMecanumRunningReadouts(stoppedAcceleration,['mecanum-01','mecanum-02']),
    /VRPN acc rate -- Hz is not live/,
  );

  const incompleteAcceleration=mecanumSnapshot(1_000,{
    'robot-ground-vrpn-acceleration':['0.01','0.02','--'],
  });
  assert.throws(
    () => assertMecanumRunningReadouts(incompleteAcceleration,['mecanum-01','mecanum-02']),
    /VRPN acc readout is incomplete/,
  );
});

test('Mecanum Stop keeps every metric cleared throughout the 1-2 second window',() => {
  const stopCompletedAtMs=1_000;
  const samples=[2_000,2_500,2_900].map((capturedAtMs) => mecanumStoppedSnapshot(capturedAtMs));
  assert.equal(
    assertMecanumStoppedReadoutSamples(samples,['mecanum-01','mecanum-02'],stopCompletedAtMs),
    samples,
  );

  const retained=mecanumStoppedSnapshot(2_500);
  retained.cards[1].metrics[6].values=['24.8'];
  assert.throws(
    () => assertMecanumStoppedReadoutSamples(
      [mecanumStoppedSnapshot(2_000),retained,mecanumStoppedSnapshot(2_900)],
      ['mecanum-01','mecanum-02'],stopCompletedAtMs,
    ),
    /retained Battery vol/,
  );

  assert.throws(
    () => assertMecanumStoppedReadoutSamples(
      [mecanumStoppedSnapshot(2_000),mecanumStoppedSnapshot(2_200),mecanumStoppedSnapshot(2_400)],
      ['mecanum-01','mecanum-02'],stopCompletedAtMs,
    ),
    /did not span/,
  );
});

test('live runner uses instrument-header controls for selected connect, stop, and reconnect',() => {
  const source=readFileSync(new URL('./local-fleet-ugv-remote-control-data-plane.mjs',import.meta.url),'utf8');
  assert.match(source,/live remote-control evidence requires exactly one selected UGV/);
  assert.match(source,/4-Scout slot isolation requires one selected Scout and exactly three siblings/);
  assert.match(source,/selectForwardClearRobotID\(expectedUGVs\)/);
  assert.match(source,/minimum_command_deadline=time\.monotonic\(\)\+0\.15/);
  assert.match(source,/missing Robot telemetry topics:/);
  assert.match(source,/\[data-xgc-role="panel-workflow-run"\]\[data-xgc-id="\$\{robotRuntimePanelId\}"\]/);
  assert.match(source,/\[data-xgc-role="panel-workflow-stop"\]\[data-xgc-id="\$\{robotRuntimePanelId\}"\]/);
  assert.match(source,/const open = panel\.locator\('\[data-xgc-role="robot-remote-control-open"\]'\)/);
  assert.doesNotMatch(source,/robot-control-panel-view"\]\[data-xgc-id="remote"\]/);
  assert.equal((source.match(/clickInstrumentPanelRun\(page,selection\.selectedRobotIDs\)/g) ?? []).length,2);
  assert.equal((source.match(/clickInstrumentPanelStop\(page,(?:firstPanelRun|restartRoot)\.run\.id\)/g) ?? []).length,2);
  assert.doesNotMatch(source,/startPanelRunViaAPI\(robotRuntimePanelId/);
  assert.match(source,/panelRunChild\(\s*firstPanelRun\.run\.id,'run-selected-panel',robotRuntimeWorkflowInstance,'supervised'/);
  assert.match(source,/panelRunChild\(\s*restartRoot\.run\.id,'run-selected-panel','panel-robot-instruments','supervised'/);
  assert.doesNotMatch(source,/waitForRobotProjection(?:States)?\(\s*(?:firstPanelChild|restartedPanelChild)/);
  assert.doesNotMatch(source,/mergeRobotProjections/);
  assert.equal((source.match(/waitForRobotProjection(?:States)?\(\s*robotPanelRoot/g) ?? []).length,7);
  assert.match(source,/originalSlots=await Promise\.all\(authoredRobotIds\.map/);
  assert.match(source,/waitForSlotIdentityRecovery\(robotPanelRoot,originalSlots\)/);
  assert.match(source,/waitForIndependentSlotStop\(\{[\s\S]*stoppedRobotId:faultRobotId/);
  assert.match(source,/sibling slot Run changed from \$\{before\.runId\} to \$\{after\.runId\}/);
  assert.match(source,/kind==='scout' && siblingRunIds\.length!==3/);
  assert.match(source,/await page\.reload\(\{ waitUntil:'domcontentloaded',timeout:30_000 \}\)/);
  assert.match(source,/activeSystemRunnerForExperiment\([\s\S]*configuration\.experimentId/);
  assert.match(source,/refresh did not recover every live Robot slot with the same Run identity/);
  assert.match(source,/waitForMecanumRunningReadouts\(page,authoredRobotIds,'before refresh'\)/);
  assert.match(source,/waitForMecanumRunningReadouts\(page,authoredRobotIds,'after refresh'\)/);
  assert.match(source,/closeRemoteController\(controller,controllerId,selection\.selectedRobotIDs\)/);
  assert.match(source,/label:'close zero'[\s\S]*longitudinal:0/);
  assert.match(source,/controller\.waitFor\(\{ state:'detached',timeout:30_000 \}\)/);
  assert.match(source,/forceStop\(controller,controllerId,selection\.selectedRobotIDs\)/);
  assert.match(source,/inputOverridesJson:JSON\.stringify\(\{\s*robotIds:selection\.robotIds,\s*\}\)/);
  assert.match(source,/path !== '\/api\/execution-targets\/local\/robot-motion-intent'/);
  assert.doesNotMatch(source,/invoke-panel-action/);
  assert.match(source,/for \(const elapsedMs of \[1_000,1_500,2_000\]\)/);
  assert.match(source,/assertMecanumStoppedReadoutSamples\(samples,robotIDs,stopCompletedAtMs\)/);
  assert.match(source,/assertFinalGlobalCleanup\(snapshot\)/);
  const experimentStop=source.indexOf('const stopResult=await stopExperimentThroughUI');
  const postStopErrors=source.indexOf("await assertBrowserErrorsAfterSettle(page,'after Experiment Stop')");
  assert.ok(experimentStop>=0 && postStopErrors>experimentStop,
    'browser errors must be asserted after Experiment Stop');
  const finalTeardown=source.indexOf('finalCleanup=await cleanupRemoteHarness(page)');
  const postTeardownErrors=source.indexOf("await assertBrowserErrorsAfterSettle(page,'after final teardown')");
  assert.ok(finalTeardown>=0 && postTeardownErrors>finalTeardown,
    'browser errors must be asserted after final teardown');
  assert.match(source,/async function assertBrowserErrorsAfterSettle[\s\S]*pageErrors\.length > 0 \|\| consoleErrors\.length > 0/);
});

function sample(robotId,x,y,command,speed) {
  return {
    robotId,namespace:robotId,command,position:{ x,y,z:0 },
    velocity:{ linear:{ x:speed,y:0,z:0 },angular:{ x:0,y:0,z:0 } },
  };
}

function robot(id,connectionState,connectionEpoch) {
  return { id,connectionState,connectionEpoch };
}

function projection(...robots) {
  return { robots };
}

function mecanumSnapshot(capturedAtMs,overrides={},rate='120.0 Hz',rateOverrides={}) {
  return {
    capturedAtMs,
    cards:['mecanum-01','mecanum-02'].map((id) => ({
      id,presentation:'list',platform:'ground',
      metrics:MECANUM_LIST_METRIC_CONTRACT.map((metric) => ({
        role:metric.role,title:metric.title,
        rate:rateOverrides[metric.role] ?? (metric.truth==='remote-command' ? '-- Hz' : rate),
        values:overrides[metric.role] ?? defaultMecanumMetricValues(metric.role,metric.valueCount),
      })),
    })),
  };
}

function mecanumStoppedSnapshot(capturedAtMs) {
  const snapshot=mecanumSnapshot(capturedAtMs,{},'-- Hz');
  for (const card of snapshot.cards) {
    for (const metric of card.metrics) metric.values=metric.values.map(() => '--');
  }
  return snapshot;
}

function defaultMecanumMetricValues(role,valueCount) {
  if (role==='robot-ground-command-velocity' || role==='robot-ground-command-twist') return ['--'];
  if (role==='robot-ground-battery-voltage') return ['24.8'];
  if (role==='robot-ground-vrpn-speed') return ['0.00'];
  if (role==='robot-ground-yaw') return ['0.00'];
  return Array.from({ length:valueCount },(_,index) => index===2 ? '0.18' : '0.00');
}

function actionRequest(intent) {
  return {
    experimentId:intent.experimentId,
    workflowInstanceId:'panel-robot-instruments',
    controllerId:intent.controllerId,
    robotIds:[...intent.robotIds],
    gear:intent.gear,
    longitudinal:intent.longitudinal,
    lateral:intent.lateral,
    yaw:intent.yaw,
  };
}
