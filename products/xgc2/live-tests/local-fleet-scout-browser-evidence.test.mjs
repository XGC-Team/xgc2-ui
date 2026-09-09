import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';
import {
  ROS_AUTOSTART_SERVICE_IDS,
  ROS_MANUAL_VIEWER_SERVICE_IDS,
  ROS_PROJECTED_SERVICE_IDS,
  ROS_SERVICE_CALL_NODE_ID,
  ROS_WORKFLOW_UNAVAILABLE,
  RECONNECT_PANEL_BINDING_ID,
  RECONNECT_PANEL_ID,
  SCOUT_LIST_METRIC_CONTRACT,
  SCOUT_LIST_STATUS_ROLES,
  STANDALONE_PANEL_BINDING_ID,
  STANDALONE_PANEL_ID,
  STANDALONE_PROCESS_DEFINITION_IDS,
  assertFullDispatchExcludesOwnedBinding,
  assertFullPanelSession,
  assertManualViewersNotAutoStarted,
  assertPanelReconnectPreservesBindingOwner,
  assertRosStartupSamples,
  assertRosTilesAfterStop,
  assertRosTilesDuringRun,
  assertRosWhiteboardAvailable,
  assertRvizConfigDisplays,
  assertRvizTopicsAdvancing,
  assertScoutRunningReadoutSamples,
  assertScoutRunningReadoutSnapshot,
  assertScoutStoppedReadoutSamples,
  assertScoutStoppedReadouts,
  assertStandalonePanelControls,
  assertStandalonePanelSession,
  assertStandaloneProcessDefinitions,
  isRosStopPhaseStatus,
  manualViewerRunIds,
  rosConnectedTiles,
  rosControlPanelRunId,
  rosGrandchildRunIds,
  rosTilesAreReady,
  rosTilesAreStopped,
} from './local-fleet-scout-browser-evidence.mjs';

const grandchildRunIds = Object.freeze({
  roscore:'ros-child',
  gzserver:'gzs-child',
  vrpn:'vrpn-child',
});
const viewerRunIds = Object.freeze({ rviz:'rviz-manual',gzclient:'gzc-manual' });

test('maps only autostart ROS services onto call-node grandchildren',() => {
  assert.deepEqual(ROS_AUTOSTART_SERVICE_IDS,['roscore','gzserver','vrpn']);
  assert.deepEqual(ROS_MANUAL_VIEWER_SERVICE_IDS,['rviz','gzclient']);
  assert.deepEqual(ROS_PROJECTED_SERVICE_IDS,['roscore','gzserver','vrpn','rviz','gzclient']);
  assert.equal(ROS_SERVICE_CALL_NODE_ID.roscore,'call-ros');
  const relations={ childRuns:ROS_AUTOSTART_SERVICE_IDS.map((id) => ({
    callNodeId:ROS_SERVICE_CALL_NODE_ID[id],childRunId:grandchildRunIds[id],
  })) };
  assert.deepEqual(
    rosGrandchildRunIds(relations,['root-run','panel-run']),
    grandchildRunIds,
  );
  assert.equal(rosControlPanelRunId([
    { itemKey:'panel-lichtblick',childRunId:'other-run' },
    { itemKey:'panel-ros-control',childRunId:'panel-run' },
  ],'root-run'),'panel-run');
  assert.throws(() => rosGrandchildRunIds(relations,['ros-child']),/parent or System root/);
  assert.throws(() => rosControlPanelRunId([{ itemKey:'panel-ros-control',childRunId:'root-run' }],'root-run'),/System Runner root/);
});

test('Run UI pass requires grandchild attributes, not process presence',() => {
  const ready=ROS_AUTOSTART_SERVICE_IDS.map((id) => tile(id,{
    status:'ready',percent:100,running:'true',runId:grandchildRunIds[id],
  }));
  assert.equal(rosTilesAreReady(ready,grandchildRunIds),true);
  assert.doesNotThrow(() => assertRosTilesDuringRun(ready,grandchildRunIds));
  const idle=ROS_AUTOSTART_SERVICE_IDS.map((id) => tile(id,{ status:'idle',percent:0,running:'',runId:'' }));
  assert.equal(rosTilesAreReady(idle,grandchildRunIds),false);
  assert.throws(() => assertRosTilesDuringRun(idle,grandchildRunIds),/stayed idle/);
  const rootIds=ROS_AUTOSTART_SERVICE_IDS.map((id) => tile(id,{
    status:'ready',percent:100,running:'true',runId:'root-run',
  }));
  assert.throws(() => assertRosTilesDuringRun(rootIds,grandchildRunIds),/not grandchild/);
});

test('startup samples require monotonic data-xgc-status/progress without text regex',() => {
  const samples=[
    { tiles:ROS_AUTOSTART_SERVICE_IDS.map((id) => tile(id,{ status:'idle',percent:0,running:'',runId:'' })) },
    { tiles:ROS_AUTOSTART_SERVICE_IDS.map((id) => tile(id,{
      status:'running',percent:0,running:'true',runId:grandchildRunIds[id],
    })) },
    { tiles:ROS_AUTOSTART_SERVICE_IDS.map((id) => tile(id,{
      status:'ready',percent:100,running:'true',runId:grandchildRunIds[id],
    })) },
  ];
  assert.doesNotThrow(() => assertRosStartupSamples(samples,grandchildRunIds));
  const receded=[samples[0],samples[2],samples[1]];
  assert.throws(() => assertRosStartupSamples(receded,grandchildRunIds),/receded|idle/);
  const withStopTail=[
    ...samples,
    { tiles:ROS_AUTOSTART_SERVICE_IDS.map((id) => tile(id,{
      status:'stopping',percent:100,running:'true',runId:grandchildRunIds[id],
    })) },
  ];
  assert.equal(isRosStopPhaseStatus('stopping'),true);
  assert.doesNotThrow(() => assertRosStartupSamples(withStopTail,grandchildRunIds));
  const readyThenRunning=[samples[0],samples[2],samples[1]];
  assert.throws(() => assertRosStartupSamples(readyThenRunning,grandchildRunIds),/receded/);
});

test('viewer tiles stay idle after Experiment autostart and expose distinct manual Runs',() => {
  const autoTiles=ROS_AUTOSTART_SERVICE_IDS.map((id) => tile(id,{
    status:'ready',percent:100,running:'true',runId:grandchildRunIds[id],
  }));
  const idleViewers=ROS_MANUAL_VIEWER_SERVICE_IDS.map((id) => tile(id,{
    status:'idle',percent:0,running:'false',runId:'',
  }));
  const relations={ childRuns:ROS_AUTOSTART_SERVICE_IDS.map((id) => ({
    callNodeId:ROS_SERVICE_CALL_NODE_ID[id],childRunId:grandchildRunIds[id],
  })) };
  assert.doesNotThrow(() => assertManualViewersNotAutoStarted([...autoTiles,...idleViewers],relations));
  assert.throws(() => assertManualViewersNotAutoStarted([...autoTiles,...idleViewers],{
    childRuns:[...relations.childRuns,{ callNodeId:'call-rviz',childRunId:'unexpected-auto-rviz' }],
  }),/unexpectedly auto-started/);
  const readyViewers=ROS_MANUAL_VIEWER_SERVICE_IDS.map((id) => tile(id,{
    status:'ready',percent:100,running:'true',runId:viewerRunIds[id],
  }));
  assert.deepEqual(manualViewerRunIds([...autoTiles,...readyViewers],Object.values(grandchildRunIds)),viewerRunIds);
  assert.throws(() => manualViewerRunIds([...autoTiles,...readyViewers],['rviz-manual']),/reused/);
});

test('Stop clears tile runtime attributes and Whiteboard forbids unavailable copy',() => {
  const stopped=ROS_PROJECTED_SERVICE_IDS.map((id) => tile(id,{ status:'idle',percent:0,running:'false',runId:'' }));
  assert.equal(rosTilesAreStopped(stopped),true);
  assert.equal(rosTilesAreStopped(ROS_PROJECTED_SERVICE_IDS.map((id) => tile(id,{
    status:'stopping',percent:50,running:'true',runId:grandchildRunIds[id] || viewerRunIds[id],
  }))),false);
  assert.doesNotThrow(() => assertRosTilesAfterStop(stopped));
  assert.doesNotThrow(() => assertRosTilesAfterStop(
    ROS_PROJECTED_SERVICE_IDS.map((id) => tile(id,{ status:'',percent:0,running:'',runId:'' })),
  ));
  assert.throws(() => assertRosTilesAfterStop(ROS_PROJECTED_SERVICE_IDS.map((id) => tile(id,{
    status:'ready',percent:100,running:'true',runId:grandchildRunIds[id] || viewerRunIds[id],
  }))),/after Stop/);
  assert.throws(
    () => assertRosWhiteboardAvailable({ graphState:'empty',text:ROS_WORKFLOW_UNAVAILABLE }),
    /unavailable/,
  );
  const available={
    graphState:'ready',text:'',
    tree:{ rootCount:1,runIds:['ros-panel','roscore-child'],maxDepth:1 },
  };
  assert.doesNotThrow(() => assertRosWhiteboardAvailable(available,{
    requiredRunIds:['ros-panel','roscore-child'],forbiddenRunIds:['system-root'],minimumDepth:1,
  }));
  assert.throws(() => assertRosWhiteboardAvailable(available,{
    requiredRunIds:['missing-child'],
  }),/missing missing-child/);
  assert.throws(() => assertRosWhiteboardAvailable(available,{
    forbiddenRunIds:['ros-panel'],
  }),/leaked ros-panel/);
  assert.deepEqual(rosConnectedTiles(stopped).map((tile) => tile.id),ROS_PROJECTED_SERVICE_IDS);
});

test('RViz display oracle requires TF/markers config and advancing /tf, not process ready',() => {
  const layout=[
    'Class: rviz/Grid','Class: rviz/TF','Class: rviz/MarkerArray','Fixed Frame: world',
    'Marker Topic: /markers','Namespaces: {}',
  ].join('\n');
  assert.doesNotThrow(() => assertRvizConfigDisplays(layout));
  assert.throws(() => assertRvizConfigDisplays('Class: rviz/Grid\nFixed Frame: world'),/TF/);
  assert.throws(() => assertRvizConfigDisplays(`${layout}\nugv1_body:`),/pins robot instance/);
  assert.doesNotThrow(() => assertRvizTopicsAdvancing({ tfHasWorld:true,tfTransforms:2,processReady:true }));
  assert.throws(() => assertRvizTopicsAdvancing({ tfHasWorld:false,tfTransforms:0,processReady:true }),/process ready/);
  assert.throws(() => assertRvizTopicsAdvancing({ tfHasWorld:true,tfTransforms:0 }),/not advancing/);
});

test('Scout Run DOM evidence requires exact telemetry order, live required channels, and semantic header icons',() => {
  assert.deepEqual(
    SCOUT_LIST_METRIC_CONTRACT.map(({ title }) => title),
    ['VRPN pos','VRPN vel','VRPN spd','VRPN acc','CMD vel','CMD twist','Battery vol','Yaw'],
  );
  assert.deepEqual(SCOUT_LIST_STATUS_ROLES,[
    'robot-network-indicator','robot-position-indicator','robot-power-indicator','robot-control-indicator',
  ]);
  assert.deepEqual(
    SCOUT_LIST_METRIC_CONTRACT.filter(({ truth }) => truth==='remote-command').map(({ title }) => title),
    ['CMD vel','CMD twist'],
  );
  const held=scoutSnapshot(1_000);
  const advanced=scoutSnapshot(1_750,{
    'robot-ground-vrpn-position':['0.01','0.00','0.18'],
  });
  assert.doesNotThrow(() => assertScoutRunningReadoutSnapshot(held,['scout-01','scout-02']));
  assert.deepEqual(assertScoutRunningReadoutSamples([held,advanced],['scout-01','scout-02']),[
    expectedWindowBehavior(true),expectedWindowBehavior(true,'scout-02'),
  ]);

  const swapped=scoutSnapshot(1_000);
  [swapped.cards[0].metrics[0],swapped.cards[0].metrics[1]]
    =[swapped.cards[0].metrics[1],swapped.cards[0].metrics[0]];
  assert.throws(() => assertScoutRunningReadoutSnapshot(swapped,['scout-01','scout-02']),/metric order drifted/);

  const missingIcon=scoutSnapshot(1_000);
  missingIcon.cards[0].icons.pop();
  assert.throws(() => assertScoutRunningReadoutSnapshot(missingIcon,['scout-01','scout-02']),/icons are incomplete/);

  const singleRow=scoutSnapshot(1_000);
  singleRow.cards[0].layout.rowCount=1;
  assert.throws(() => assertScoutRunningReadoutSnapshot(singleRow,['scout-01','scout-02']),/4x2 grid/);

  const overflow=scoutSnapshot(1_000);
  overflow.cards[0].layout.clipped.push('metric-0-readout');
  assert.throws(() => assertScoutRunningReadoutSnapshot(overflow,['scout-01','scout-02']),/overflowed/);

  const overlap=scoutSnapshot(1_000);
  overlap.cards[0].layout.overlapped.push('metric-0-readout-rate');
  assert.throws(() => assertScoutRunningReadoutSnapshot(overlap,['scout-01','scout-02']),/overlapped/);

  const placeholder=scoutSnapshot(1_000,{ 'robot-ground-battery-voltage':['--'] });
  assert.throws(() => assertScoutRunningReadoutSnapshot(placeholder,['scout-01','scout-02']),/readout is incomplete/);

  const batteryWithoutFrequency=scoutSnapshot(1_000,{},'120.0 Hz',{
    'robot-ground-battery-voltage':'-- Hz',
  });
  assert.throws(
    () => assertScoutRunningReadoutSnapshot(batteryWithoutFrequency,['scout-01','scout-02']),
    /Battery vol rate -- Hz is not live/,
  );

  const stoppedRate=scoutSnapshot(1_000,{},'-- Hz');
  assert.throws(() => assertScoutRunningReadoutSnapshot(stoppedRate,['scout-01','scout-02']),/rate -- Hz is not live/);
});

test('Scout browser accepts an unpublished command while remote-control E2E owns command truth',() => {
  const idle=scoutSnapshot(1_000);
  assert.doesNotThrow(() => assertScoutRunningReadoutSnapshot(idle,['scout-01','scout-02']));

  const published=scoutSnapshot(1_000,{
    'robot-ground-command-velocity':['0.20'],
    'robot-ground-command-twist':['-0.18'],
  },'120.0 Hz',{
    'robot-ground-command-velocity':'20.0 Hz',
    'robot-ground-command-twist':'20.0 Hz',
  });
  assert.doesNotThrow(() => assertScoutRunningReadoutSnapshot(published,['scout-01','scout-02']));

  const valueWithoutRate=scoutSnapshot(1_000,{
    'robot-ground-command-velocity':['0.00'],
  });
  assert.throws(
    () => assertScoutRunningReadoutSnapshot(valueWithoutRate,['scout-01','scout-02']),
    /not live or explicitly unpublished/,
  );

  const rateWithoutValue=scoutSnapshot(1_000,{},'120.0 Hz',{
    'robot-ground-command-twist':'20.0 Hz',
  });
  assert.throws(
    () => assertScoutRunningReadoutSnapshot(rateWithoutValue,['scout-01','scout-02']),
    /partially published/,
  );

  const remoteSource=readFileSync(
    new URL('./local-fleet-ugv-remote-control-data-plane.mjs',import.meta.url),'utf8',
  );
  assert.match(remoteSource,/assertMotionIsolation\(/);
  assert.match(remoteSource,/assertStoppedMotion\(/);
});

test('Scout browser probe rejects clipped labels, values, rates, overlaps, and collapsed vector spacing',() => {
  const source=readFileSync(
    new URL('./local-fleet-scout-browser-evidence.mjs',import.meta.url),'utf8',
  );
  assert.match(source,/const requiredAxisGap=Number\.parseFloat/);
  assert.match(source,/querySelectorAll\('\.robot-metric-vector-axis'\)/);
  assert.match(source,/const rectanglesOverlap=/);
  assert.match(source,/const overlapped=metrics\.flatMap/);
  assert.match(source,/scoutReadoutSnapshot:lastScoutReadoutSnapshot/);
  assert.match(source,/return assertScoutRunningReadoutSnapshot\(snapshot,robotIds\);/);
  assert.match(
    source,
    /\[`metric-\$\{index\}-title`,metric\.querySelector\('\[data-xgc-role="robot-list-metric-title"\]'\)\]/,
  );
});

test('Scout Stop DOM evidence rejects retained Battery voltage or any other live readout',() => {
  const stopped=scoutStoppedSnapshot(2_000);
  assert.doesNotThrow(() => assertScoutStoppedReadouts(stopped,['scout-01','scout-02']));

  const retainedVoltage=scoutStoppedSnapshot(2_000);
  retainedVoltage.cards[1].metrics[6].values=['28.8'];
  assert.throws(
    () => assertScoutStoppedReadouts(retainedVoltage,['scout-01','scout-02']),
    /retained Battery vol: -- Hz 28.8/,
  );

  const retainedRate=scoutStoppedSnapshot(2_000);
  retainedRate.cards[0].metrics[0].rate='120.0 Hz';
  assert.throws(() => assertScoutStoppedReadouts(retainedRate,['scout-01','scout-02']),/retained VRPN pos/);
});

test('Scout Stop requires a multi-sample quiet window and rejects late telemetry',() => {
  const samples=[scoutStoppedSnapshot(2_000),scoutStoppedSnapshot(2_750),scoutStoppedSnapshot(3_500)];
  assert.equal(assertScoutStoppedReadoutSamples(samples,['scout-01','scout-02']).length,3);
  assert.throws(
    () => assertScoutStoppedReadoutSamples(samples.slice(0,2),['scout-01','scout-02']),
    /at least 3 stable samples/,
  );
  const short=[scoutStoppedSnapshot(2_000),scoutStoppedSnapshot(2_300),scoutStoppedSnapshot(2_600)];
  assert.throws(
    () => assertScoutStoppedReadoutSamples(short,['scout-01','scout-02']),
    /expected at least 1000 ms/,
  );
  const late=scoutStoppedSnapshot(3_500);
  late.cards[0].metrics[6].values=['28.8'];
  assert.throws(
    () => assertScoutStoppedReadoutSamples([samples[0],samples[1],late],['scout-01','scout-02']),
    /retained Battery vol/,
  );
});

test('standalone Panel lifecycle promotes without duplicate bindings and reconnect preserves full owner',() => {
  const managedBindingIds=[STANDALONE_PANEL_BINDING_ID,RECONNECT_PANEL_BINDING_ID];
  const partial=sessionView('partial',[
    sessionMember('workflow_command','', 'standalone-root'),
    sessionMember('workflow_run',STANDALONE_PANEL_BINDING_ID,'standalone-child'),
  ]);
  assert.deepEqual(assertStandalonePanelSession(partial,{
    experimentId:'experiment-a',runMode:'simulation',rootRunId:'standalone-root',
    bindingId:STANDALONE_PANEL_BINDING_ID,managedBindingIds,
  }),{ sessionId:'session-a',bindingOwnerId:'standalone-child' });
  const leaked={ ...partial,members:[
    ...partial.members,sessionMember('workflow_run',RECONNECT_PANEL_BINDING_ID,'unexpected-child'),
  ] };
  assert.throws(() => assertStandalonePanelSession(leaked,{
    experimentId:'experiment-a',runMode:'simulation',rootRunId:'standalone-root',
    bindingId:STANDALONE_PANEL_BINDING_ID,managedBindingIds,
  }),/unstarted managed binding/);

  const full=sessionView('full',[
    ...partial.members,
    sessionMember('workflow_command','', 'full-root'),
    sessionMember('workflow_run',RECONNECT_PANEL_BINDING_ID,'full-robot-owner'),
  ]);
  const owners=assertFullPanelSession(full,{
    sessionId:'session-a',experimentId:'experiment-a',runMode:'simulation',fullRootRunId:'full-root',
    managedBindingIds,requiredBindingIds:managedBindingIds,
  });
  assert.deepEqual(owners.get(STANDALONE_PANEL_BINDING_ID),['standalone-child']);
  assert.deepEqual(owners.get(RECONNECT_PANEL_BINDING_ID),['full-robot-owner']);

  const reconnect={ ...full,members:[...full.members,sessionMember('workflow_command','', 'reconnect-root')] };
  assert.equal(assertPanelReconnectPreservesBindingOwner(reconnect,{
    bindingId:RECONNECT_PANEL_BINDING_ID,fullOwnerId:'full-robot-owner',
    reconnectRootRunId:'reconnect-root',reconnectChildRunId:'reconnect-child',
  }),'full-robot-owner');
  const stolen={ ...reconnect,members:[
    ...reconnect.members,sessionMember('workflow_run',RECONNECT_PANEL_BINDING_ID,'reconnect-child'),
  ] };
  assert.throws(() => assertPanelReconnectPreservesBindingOwner(stolen,{
    bindingId:RECONNECT_PANEL_BINDING_ID,fullOwnerId:'full-robot-owner',
    reconnectRootRunId:'reconnect-root',reconnectChildRunId:'reconnect-child',
  }),/changed panel-robot-instruments owner/);
});

test('standalone Panel browser oracle keeps siblings idle and full dispatch excludes its live binding',() => {
  assert.deepEqual(STANDALONE_PROCESS_DEFINITION_IDS,['gazebo-server','roscore','vrpn-client-ros1']);
  assert.doesNotThrow(() => assertStandaloneProcessDefinitions(
    STANDALONE_PROCESS_DEFINITION_IDS.map(readyProcess),
  ));
  assert.throws(() => assertStandaloneProcessDefinitions([
    ...STANDALONE_PROCESS_DEFINITION_IDS.map(readyProcess),readyProcess('scout-gazebo-robot'),
  ]),/scout-gazebo-robot/);
  assert.doesNotThrow(() => assertStandalonePanelControls({
    runIds:[RECONNECT_PANEL_ID,'lichtblick'],stopIds:[STANDALONE_PANEL_ID],
  },{ panelId:STANDALONE_PANEL_ID,otherPanelIds:[RECONNECT_PANEL_ID,'lichtblick'] }));
  assert.throws(() => assertStandalonePanelControls({
    runIds:['lichtblick'],stopIds:[STANDALONE_PANEL_ID],
  },{ panelId:STANDALONE_PANEL_ID,otherPanelIds:[RECONNECT_PANEL_ID,'lichtblick'] }),/robot-instruments/);

  const relations={
    childRunGroups:[{ id:'group',producerNodeId:'run-panels',state:'sealed' }],
    childRunGroupMembers:[{
      groupId:'group',itemKey:RECONNECT_PANEL_BINDING_ID,childRunId:'robot-child',
    }],
  };
  assert.deepEqual(assertFullDispatchExcludesOwnedBinding(
    relations,STANDALONE_PANEL_BINDING_ID,[STANDALONE_PANEL_BINDING_ID,RECONNECT_PANEL_BINDING_ID],
  ).map((member) => member.itemKey),[RECONNECT_PANEL_BINDING_ID]);
  const duplicated={ ...relations,childRunGroupMembers:[
    ...relations.childRunGroupMembers,
    { groupId:'group',itemKey:STANDALONE_PANEL_BINDING_ID,childRunId:'duplicate-child' },
  ] };
  assert.throws(() => assertFullDispatchExcludesOwnedBinding(
    duplicated,STANDALONE_PANEL_BINDING_ID,[STANDALONE_PANEL_BINDING_ID,RECONNECT_PANEL_BINDING_ID],
  ),/expected panel-robot-instruments/);
});

function scoutSnapshot(capturedAtMs,overrides={},rate='120.0 Hz',rateOverrides={}) {
  return {
    capturedAtMs,
    cards:['scout-01','scout-02'].map((id) => ({
      id,health:'healthy',status:'online',presentation:'list',platform:'ground',
      metrics:SCOUT_LIST_METRIC_CONTRACT.map((metric) => ({
        role:metric.role,title:metric.title,
        rate:rateOverrides[metric.role] ?? (metric.truth==='remote-command' ? '-- Hz' : rate),
        values:overrides[metric.role] ?? defaultMetricValues(metric.role,metric.valueCount),
      })),
      layout:{
        metricCount:SCOUT_LIST_METRIC_CONTRACT.length,rowCount:2,columnCount:4,
        clipped:[],overlapped:[],
      },
      icons:SCOUT_LIST_STATUS_ROLES.map((role) => ({ role,id,label:`${role} truth`,hasGraphic:true })),
    })),
  };
}

function scoutStoppedSnapshot(capturedAtMs) {
  const snapshot=scoutSnapshot(capturedAtMs,{},'-- Hz');
  for (const card of snapshot.cards) {
    card.health='idle';
    card.status='offline';
    for (const metric of card.metrics) metric.values=metric.values.map(() => '--');
  }
  return snapshot;
}

function defaultMetricValues(role,valueCount) {
  if (role==='robot-ground-command-velocity' || role==='robot-ground-command-twist') return ['--'];
  if (role==='robot-ground-battery-voltage') return ['28.8'];
  if (role==='robot-ground-vrpn-speed') return ['0.00'];
  return Array.from({ length:valueCount },(_,index) => index===2 ? '0.18' : '0.00');
}

function expectedWindowBehavior(firstAdvanced,id='scout-01') {
  return {
    id,
    metrics:SCOUT_LIST_METRIC_CONTRACT.map((metric) => ({
      role:metric.role,
      behavior:firstAdvanced && metric.role==='robot-ground-vrpn-position'
        ? 'advanced' : 'held',
    })),
  };
}

function tile(id,fields) {
  return { id,...fields };
}

function sessionView(mode,members) {
  return {
    session:{
      id:'session-a',targetId:'local',experimentResourceId:'experiment-a',state:'active',
      mode,runMode:'simulation',revision:1,
    },
    members,
  };
}

function sessionMember(kind,bindingId,ownerId,status='running') {
  return { id:`member-${ownerId}`,targetId:'local',sessionId:'session-a',bindingId,kind,ownerId,status,revision:1 };
}

function readyProcess(definitionId) {
  return {
    definitionId,desiredState:'running',observedState:'running',handle:123,
    readiness:{ status:'passing' },liveness:{ status:'passing' },
  };
}
