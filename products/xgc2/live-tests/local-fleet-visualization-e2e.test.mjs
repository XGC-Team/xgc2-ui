/* global URL,structuredClone */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
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
  mergeOwnedProcessClosures,
  discoverVisualizationMatrix,
  extractNodeOutput,
  filterVisualizationPlansByMode,
  frozenVisualizationRoster,
  parseVisualizationModeFilter,
  rvizGeneratedConfigPath,
} from './local-fleet-visualization-e2e-contract.mjs';

test('discovers every Robot Experiment mode from panels and roster without hardcoded identifiers',() => {
  const experiments=[
    experiment('Scout Fleet',['simulation','physical','hybrid'],[
      binding('scout-a','robot-scout','/scout_a','simulation','scout'),
    ]),
    experiment('PX4 Fleet',['simulation','physical','hybrid'],[
      binding('px4-a','robot-px4','/px4_a','physical','px4'),
    ]),
    experiment('Mixed Fleet',['simulation','physical','hybrid'],[
      binding('mecanum-a','robot-mecanum','/mecanum_a','simulation','mecanum'),
      binding('px4-b','robot-px4-b','/px4_b','physical','px4'),
    ]),
    { ...experiment('No Viewer',['simulation'],[
      binding('scout-b','robot-scout-b','/scout_b','simulation','scout'),
    ]),spec:{ ...experiment('ignored',['simulation'],[]).spec,dashboards:[] } },
  ];
  const plans=discoverVisualizationMatrix(experiments);
  assert.deepEqual(plans.map((plan) => [plan.name,plan.runModes.length]),[
    ['Mixed Fleet',3],['PX4 Fleet',3],['Scout Fleet',3],
  ]);
  assert.deepEqual(plans[0].roster.map((robot) => robot.kind),['mecanum_ugv','px4_multirotor']);
  assert.equal(plans[0].lichtblick.workflowInstanceId,'workflow-lichtblick');
  assert.equal(plans[0].rosControl.workflowInstanceId,'workflow-ros');
});

test('discovers ROS controls on a separate calibration dashboard',() => {
  const fixture=experiment('Mixed',['simulation'],[binding('scout','s','/s','simulation','scout'),binding('px4','p','/p','simulation','px4'),binding('mecanum','m','/m','simulation','mecanum')]);
  const dashboard=fixture.spec.dashboards.find(d=>d.panels.some(p=>p.pluginId==='ros-basic-services-control'));
  const controls=dashboard.panels.filter(p=>p.pluginId==='ros-basic-services-control');
  dashboard.panels=dashboard.panels.filter(p=>p.pluginId!=='ros-basic-services-control');
  fixture.spec.dashboards.push({id:'calibration',name:'Calibration',panels:controls});
  const [plan]=discoverVisualizationMatrix([fixture]);
  assert.equal(plan.rosControl.dashboardId,'calibration');
  assert.equal(plan.rosControl.dashboardName,'Calibration');
  assert.equal(plan.gcsDashboard.id,dashboard.id);
});

test('rejects a visualization matrix that omits a required Robot kind',() => {
  assert.throws(() => discoverVisualizationMatrix([
    experiment('Scout Fleet',['simulation'],[
      binding('scout-a','robot-scout','/scout_a','simulation','scout'),
    ]),
  ]),/does not cover Robot kind/);
});

test('explicit visualization mode filter is strict and preserves the default matrix',() => {
  assert.deepEqual(parseVisualizationModeFilter(''),[]);
  assert.deepEqual(parseVisualizationModeFilter('   '),[]);
  assert.deepEqual(parseVisualizationModeFilter('simulation, night-field'),['simulation','night-field']);
  assert.throws(() => parseVisualizationModeFilter('simulation,simulation'),/duplicate modes/);
  assert.throws(() => parseVisualizationModeFilter('simulation,'),/empty modes/);
  assert.throws(() => parseVisualizationModeFilter('simulation,field mode'),/non-canonical modes: field mode/);
  assert.throws(() => parseVisualizationModeFilter('9field'),/non-canonical modes: 9field/);
  assert.throws(
    () => parseVisualizationModeFilter(`a${'b'.repeat(64)}`),
    /non-canonical modes/,
  );

  const plans=discoverVisualizationMatrix([
    experiment('Scout Fleet',['simulation','physical','hybrid'],[
      binding('scout-a','robot-scout','/scout_a','simulation','scout'),
    ]),
    experiment('PX4 Fleet',['simulation','physical','hybrid'],[
      binding('px4-a','robot-px4','/px4_a','physical','px4'),
    ]),
    experiment('Mecanum Fleet',['simulation','physical','hybrid'],[
      binding('mecanum-a','robot-mecanum','/mecanum_a','simulation','mecanum'),
    ]),
  ]);
  assert.strictEqual(filterVisualizationPlansByMode(plans,[]),plans);
  assert.deepEqual(
    filterVisualizationPlansByMode(plans,['simulation']).map((plan) => plan.runModes),
    [['simulation'],['simulation'],['simulation']],
  );
  assert.deepEqual(
    filterVisualizationPlansByMode(plans,['hybrid','simulation']).map((plan) => plan.runModes),
    [['simulation','hybrid'],['simulation','hybrid'],['simulation','hybrid']],
  );
  const incompatible=plans.map((plan,index) => index===1
    ? { ...plan,runModes:['simulation','physical'] }
    : plan);
  assert.throws(
    () => filterVisualizationPlansByMode(incompatible,['hybrid']),
    /does not declare requested visualization modes: hybrid/,
  );
  const custom=plans.map((plan) => ({ ...plan,runModes:[...plan.runModes,'night-field'] }));
  assert.deepEqual(
    filterVisualizationPlansByMode(custom,parseVisualizationModeFilter('night-field'))
      .map((plan) => plan.runModes),
    [['night-field'],['night-field'],['night-field']],
  );
  assert.throws(
    () => filterVisualizationPlansByMode(plans,parseVisualizationModeFilter('night-field')),
    /does not declare requested visualization modes: night-field/,
  );
});

test('live visualization entry wires the explicit filter and has one package alias',() => {
  const entry=readFileSync(new URL('./local-fleet-visualization-e2e.mjs',import.meta.url),'utf8');
  assert.match(entry,/XGC_VISUALIZATION_E2E_MODES/);
  assert.match(entry,/filterVisualizationPlansByMode/);
  assert.match(entry,/sha256sum/);
  assert.match(entry,/\bcat\b/);
  const packageDocument=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(
    packageDocument.scripts?.['test:live:local-fleet-visualization'],
    'node live-tests/local-fleet-visualization-e2e.mjs',
  );
});

test('viewer actions stay opt-in and manual Runs are distinct',() => {
  const idle=[tile('rviz'),tile('gzclient')];
  assert.doesNotThrow(() => assertViewerOptIn({ tiles:idle,relations:{ childRuns:[] },runMode:'simulation' }));
  assert.throws(() => assertViewerOptIn({
    tiles:[tile('rviz',{ status:'ready',percent:100,running:'true',runId:'auto-rviz' }),tile('gzclient')],
    relations:{ childRuns:[] },runMode:'simulation',
  }),/auto-started/);
  const manual=assertManualViewerEvidence({
    before:idle,runMode:'simulation',after:[
      tile('rviz',{ status:'ready',percent:100,running:'true',runId:'manual-rviz' }),
      tile('gzclient',{ status:'ready',percent:100,running:'true',runId:'manual-gzclient' }),
    ],
  });
  assert.deepEqual(manual,{ rviz:'manual-rviz',gzclient:'manual-gzclient' });
  assert.doesNotThrow(() => assertViewerRunIdentity([
    tile('rviz',{ status:'ready',percent:100,running:'true',runId:'manual-rviz' }),
    tile('gzclient',{ status:'ready',percent:100,running:'true',runId:'manual-gzclient' }),
  ],manual));
  assert.throws(() => assertViewerRunIdentity([
    tile('rviz',{ status:'ready',percent:100,running:'true',runId:'replacement-rviz' }),
    tile('gzclient',{ status:'ready',percent:100,running:'true',runId:'manual-gzclient' }),
  ],manual),/identity changed/);
  assert.deepEqual(assertManualViewerEvidence({
    before:idle,runMode:'physical',after:[
      tile('rviz',{ status:'ready',percent:100,running:'true',runId:'manual-rviz' }),
      tile('gzclient',{ status:'waiting',percent:25,running:'true',runId:'manual-gzclient' }),
    ],
  }),{ rviz:'manual-rviz',gzclient:'manual-gzclient' });
});

test('extracts one exact succeeded public node output',() => {
  const value={ fixedFrame:'world' };
  assert.deepEqual(extractNodeOutput([
    { nodeId:'rviz-layout',status:'succeeded',outputRefs:[{ port:'main',value }] },
  ],'rviz-layout'),value);
  assert.throws(() => extractNodeOutput([],['experiment-robots','experiment-robots-called']),/expected one/);
});

test('freezes exact Experiment slots into visualization roster',() => {
  const source=experiment('Mixed Fleet',['simulation'],[
    binding('px4-a','robot-px4','/px4_a','simulation','px4'),
    binding('scout-a','robot-scout','/scout_a','physical','scout'),
    binding('mecanum-a','robot-mecanum','/mecanum_a','simulation','mecanum'),
  ]);
  const roster=frozenVisualizationRoster(source,robotOutput(source));
  assert.deepEqual(roster.map((robot) => ({
    slotId:robot.slotId,kind:robot.kind,pathTopic:robot.pathTopic,sceneModel:robot.sceneModel,
  })),[
    { slotId:'mecanum-a',kind:'mecanum_ugv',pathTopic:'/mecanum_a/path',sceneModel:'mecanum_a' },
    { slotId:'px4-a',kind:'px4_multirotor',pathTopic:'/px4_a/path',sceneModel:'px4_a' },
    { slotId:'scout-a',kind:'scout_mini',pathTopic:'/scout_a/path',sceneModel:'scout_body' },
  ]);
  const missingPath=robotOutput(source);
  missingPath.robots[0].visualization.pathTopic='';
  assert.throws(() => frozenVisualizationRoster(source,missingPath),/no Path topic/);
});

test('RViz oracle requires generated world-frame RobotModel TF and per-roster Paths',() => {
  const source=experiment('Mixed Fleet',['simulation'],[
    binding('px4-a','robot-px4','/px4_a','simulation','px4'),
    binding('scout-a','robot-scout','/scout_a','physical','scout'),
    binding('mecanum-a','robot-mecanum','/mecanum_a','simulation','mecanum'),
  ]);
  const roster=frozenVisualizationRoster(source,robotOutput(source));
  const layout=rvizLayout(roster,'simulation');
  assert.doesNotThrow(() => assertRvizLayoutOutput(layout,{ roster,runMode:'simulation' }));
  assert.doesNotThrow(() => assertRvizProcessBinding({
    definitionId:'rviz',parameters:{ configPath:rvizGeneratedConfigPath(layout.config),fixedFrame:'world' },
  },layout));
  const missingPath={ ...layout,config:layout.config.replace('Class: rviz/Path','Class: rviz/Pose') };
  assert.throws(() => assertRvizLayoutOutput(missingPath,{ roster,runMode:'simulation' }),/no enabled Path display/);
  const disabledPath={ ...layout,config:layout.config.replace(
    'Class: rviz/Path\n      Enabled: true','Class: rviz/Path\n      Enabled: false',
  ) };
  assert.throws(() => assertRvizLayoutOutput(disabledPath,{ roster,runMode:'simulation' }),/no enabled Path display/);
  assert.throws(() => assertRvizProcessBinding({
    definitionId:'rviz',parameters:{
      configPath:`/home/operator/${'default'}.rviz`,configContent:'',fixedFrame:'world',
    },
  },layout),/exact generated config path/);
  assert.throws(() => assertRvizProcessBinding({
    definitionId:'rviz',parameters:{
      configPath:rvizGeneratedConfigPath(layout.config),configContent:layout.config,fixedFrame:'world',
    },
  },layout),/did not consume/);
});

test('committed mixed RViz golden interoperates across property order and exact robotDisplays',() => {
  const roster=committedMixedRvizRoster();
  const layout=committedMixedRvizLayout(roster);
  assert.doesNotThrow(() => assertRvizLayoutOutput(layout,{ roster,runMode:'simulation' }));

  const shuffled={ ...layout,config:shuffleRvizClassProperties(layout.config) };
  assert.doesNotThrow(() => assertRvizLayoutOutput(shuffled,{ roster,runMode:'simulation' }));

  const nested={ ...layout,config:layout.config
    .replaceAll('      Class: rviz/RobotModel','      Metadata:\n        Class: rviz/RobotModel')
    .replaceAll('      Class: rviz/Path','      Metadata:\n        Class: rviz/Path') };
  assert.throws(() => assertRvizLayoutOutput(nested,{ roster,runMode:'simulation' }),/no enabled RobotModel/);

  const duplicate=structuredClone(layout);
  duplicate.robotDisplays[1]=structuredClone(duplicate.robotDisplays[0]);
  assert.throws(() => assertRvizLayoutOutput(duplicate,{ roster,runMode:'simulation' }),/repeat Robot/);

  const missing={ ...layout,robotDisplays:layout.robotDisplays.slice(0,-1) };
  assert.throws(() => assertRvizLayoutOutput(missing,{ roster,runMode:'simulation' }),/count does not match/);

  const extra={ ...layout,robotDisplays:[...layout.robotDisplays,structuredClone(layout.robotDisplays[0])] };
  assert.throws(() => assertRvizLayoutOutput(extra,{ roster,runMode:'simulation' }),/count does not match/);

  const extraField=structuredClone(layout);
  extraField.robotDisplays[0].kind=roster[0].kind;
  assert.throws(() => assertRvizLayoutOutput(extraField,{ roster,runMode:'simulation' }),/fields are not exact/);

  const missingField=structuredClone(layout);
  delete missingField.robotDisplays[0].tfPrefix;
  assert.throws(() => assertRvizLayoutOutput(missingField,{ roster,runMode:'simulation' }),/fields are not exact/);

  const wrongMapping=structuredClone(layout);
  wrongMapping.robotDisplays[0].pathTopic='/wrong/path';
  assert.throws(() => assertRvizLayoutOutput(wrongMapping,{ roster,runMode:'simulation' }),/does not match frozen Robot/);

  const wrongPose=structuredClone(layout);
  wrongPose.robotDisplays[0].initialPose.x+=1;
  assert.throws(() => assertRvizLayoutOutput(wrongPose,{ roster,runMode:'simulation' }),/initialPose does not match/);

  const wrongRobotIdentity=structuredClone(layout);
  wrongRobotIdentity.robots[0].namespace='/wrong_namespace';
  assert.throws(() => assertRvizLayoutOutput(wrongRobotIdentity,{ roster,runMode:'simulation' }),/Robot roster does not match/);
});

test('Lichtblick oracle requires roster 3D layers, paths, and camera AR',() => {
  const source=experiment('Mixed Fleet',['simulation'],[
    binding('px4-a','robot-px4','/px4_a','simulation','px4'),
    binding('scout-a','robot-scout','/scout_a','physical','scout'),
    binding('mecanum-a','robot-mecanum','/mecanum_a','simulation','mecanum'),
  ]);
  const roster=frozenVisualizationRoster(source,robotOutput(source));
  const layout=lichtblickLayout(roster);
  assert.doesNotThrow(() => assertLichtblickLayoutOutput(layout,roster));
  const horizontal=structuredClone(layout);
  horizontal.layout.direction='row';
  assert.throws(() => assertLichtblickLayoutOutput(horizontal,roster),/does not match/);
  const plotted=structuredClone(layout);
  plotted.layout.second={direction:'row',first:SEMANTIC_CANVAS_IDS.cameraAR,second:'Plot!test'};
  assert.doesNotThrow(()=>assertLichtblickLayoutOutput(plotted,roster,'3d-above-camera-ar-plot'));
  const missingCamera=structuredClone(layout);
  delete missingCamera.configById[SEMANTIC_CANVAS_IDS.cameraAR];
  assert.throws(() => assertLichtblickLayoutOutput(missingCamera,roster),/3D and camera AR/);
  const missingPath=structuredClone(layout);
  delete missingPath.configById[SEMANTIC_CANVAS_IDS.threeD].topics[roster[0].pathTopic];
  assert.throws(() => assertLichtblickLayoutOutput(missingPath,roster),/no visible roster Path/);
});

test('semantic canvas oracle rejects static, identical, or process-only evidence',() => {
  const evidence={
    threeD:canvas('threeD','a','b'),cameraAR:canvas('cameraAR','c','d'),
  };
  assert.doesNotThrow(() => assertSemanticCanvasEvidence(evidence));
  const identical=structuredClone(evidence);
  identical.cameraAR.samples[0].hash=identical.threeD.samples[0].hash;
  assert.throws(() => assertSemanticCanvasEvidence(identical),/identical pixels/);
  assert.throws(() => assertSemanticCanvasEvidence({ processReady:true }),/not real rendered/);
  const staticCanvas=structuredClone(evidence);
  staticCanvas.cameraAR.transitions=0;
  staticCanvas.cameraAR.uniqueHashes=1;
  assert.throws(() => assertSemanticCanvasEvidence(staticCanvas),/did not render advancing pixels/);
});

test('trajectory oracle requires world TF, fresh Path samples including bounded rollover, and ENU/ground z',() => {
  const roster=[
    robot('px4','px4_multirotor','/px4/path'),
    robot('scout','scout_mini','/scout/path'),
    robot('mecanum','mecanum_ugv','/mecanum/path'),
  ];
  const before=roster.map((item,index) => pathSample(item,index+2,index+10));
  const after=roster.map((item,index) => pathSample(item,index+5,index+20));
  assert.doesNotThrow(() => assertTrajectoryProgress(before,after,roster));
  const stalled=structuredClone(after);
  stalled[0].pointCount=before[0].pointCount;
  assert.throws(() => assertTrajectoryProgress(before,stalled,roster),/history did not advance/);
  const boundedBefore=before.map(item=>({...item,oldestStamp:1}));
  const boundedAfter=before.map(item=>({...item,oldestStamp:2,latestStamp:item.latestStamp+1}));
  assert.doesNotThrow(()=>assertTrajectoryProgress(boundedBefore,boundedAfter,roster));
  boundedAfter[0].latestStamp=boundedBefore[0].latestStamp;
  assert.throws(()=>assertTrajectoryProgress(boundedBefore,boundedAfter,roster),/timestamp did not advance/);
  const ned=structuredClone(after);
  ned[0].minZ=-4;
  assert.throws(() => assertTrajectoryProgress(before,ned,roster),/negative-down z frame/);
  const floatingGround=structuredClone(after);
  floatingGround[1].maxZ=2;
  assert.throws(() => assertTrajectoryProgress(before,floatingGround,roster),/world ground plane/);
});

test('Stop oracle requires terminal viewer Runs, idle tiles, and zero active processes',() => {
  const stopped={
    activeRun:undefined,
    processes:[{ id:'rviz-process',desiredState:'stopped',observedState:'stopped',handle:null }],
    tiles:[tile('rviz'),tile('gzclient')],
    viewerRuns:[{ id:'rviz-run',status:'stopped' },{ id:'gzclient-run',status:'canceled' }],
  };
  assert.doesNotThrow(() => assertStopClosure(stopped));
  assert.throws(() => assertStopClosure({
    ...stopped,processes:[{ id:'rviz-process',desiredState:'running',observedState:'running',handle:'pid:1' }],
  }),/survived Stop/);
});

test('Process ownership merges only exact Total and independent viewer Run closures',() => {
  const total={ id:'lichtblick',targetId:'local',ownerType:'orchestration-run',ownerId:'total-child',definitionId:'lichtblick-web' };
  const rviz={ id:'rviz',targetId:'local',ownerType:'orchestration-run',ownerId:'rviz-child',definitionId:'rviz' };
  const merged=mergeOwnedProcessClosures([
    { rootRunId:'total',targetId:'local',processes:[total] },
    { rootRunId:'viewer-rviz',targetId:'local',processes:[rviz] },
    { rootRunId:'viewer-gz',targetId:'local',processes:[rviz] },
  ]);
  assert.deepEqual(merged,[total,rviz]);
  assert.throws(() => mergeOwnedProcessClosures([
    { rootRunId:'viewer-a',targetId:'local',processes:[rviz] },
    { rootRunId:'viewer-b',targetId:'local',processes:[{ ...rviz,ownerId:'other' }] },
  ]),/changed identity/);
});

function experiment(name,runModes,robots) {
  const id=`experiment-${name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`;
  return {
    head:{ domain:'experiment',resourceId:id },branch:{ name:'main' },
    spec:{ schemaVersion:15,name,runModes,localizationOffset:{x:0,y:0,z:0},robots,dashboards:[
      { id:'config',name:'Config',panels:[] },
      { id:'gcs',name:'GCS',panels:[
        panel('lichtblick','xgc2-lichtblick','workflow-lichtblick'),
        panel('ros-control','ros-basic-services-control','workflow-ros'),
      ] },
    ] },
  };
}

function panel(id,pluginId,workflowInstanceId) {
  return { id,pluginId,portBindings:[{ kind:'workflow',workflowInstanceId,presetId:'start' }] };
}

function binding(id,robotAssetId,namespace,hybridSource,arm) {
  return {
    id,namespace,hybridSource,ref:{ domain:'robot',resourceId:robotAssetId,branch:'main' },
    initialPose:{ x:0,y:0,z:arm==='scout' ? 0.181 : 0,yaw:0 },[arm]:{},
  };
}

function robotOutput(source) {
  const robots=source.spec.robots.map((item) => {
    const kind=Object.hasOwn(item,'px4') ? 'px4_multirotor'
      : Object.hasOwn(item,'scout') ? 'scout_mini' : 'mecanum_ugv';
    const name=item.namespace.slice(1);
    return {
      id:item.id,robotAssetId:item.ref.resourceId,name:item.id,kind,namespace:item.namespace,
      hybridSource:item.hybridSource,initialPose:item.initialPose,
      visualization:{
        sceneClass:kind==='px4_multirotor' ? 'fs150' : kind==='scout_mini' ? 'scout' : 'mecanum',
        descriptionPackage:`${name}_description`,descriptionFile:`urdf/${name}.urdf`,
        jointStateTopic:'joint_states',pathTopic:'path',visuals:[],
      },
      ...(kind==='px4_multirotor' ? { px4:{ modelId:'fs150',modelName:name } } : {}),
      ...(kind==='scout_mini' ? { scout:{ modelName:name,mocapRigidBodyName:'scout_body' } } : {}),
      ...(kind==='mecanum_ugv' ? { mecanum:{ modelName:name } } : {}),
    };
  });
  return { schemaVersion:3,robotCount:robots.length,robots };
}

function rvizLayout(roster,runMode) {
  const robots=roster.map((item) => ({
    id:item.name,kind:item.kind,namespace:item.namespace,
    sceneClass:item.sceneClass,sceneModel:item.sceneModel,
  }));
  const displays=[
    '    - Class: rviz/TF\n      Enabled: true\n      Name: TF\n      Value: true',
    ...roster.flatMap((item) => [
      `    - Class: rviz/RobotModel\n      Enabled: true\n      Name: ${item.name} Robot\n      Robot Description: ${item.robotDescriptionParameter}\n      Value: true`,
      `    - Class: rviz/Path\n      Enabled: true\n      Name: ${item.name} Path\n      Topic: ${item.pathTopic}\n      Value: true`,
    ]),
  ];
  const config=`Visualization Manager:\n  Displays:\n${displays.join('\n')}\n  Global Options:\n    Fixed Frame: world\n`;
  const rosterDigest=createHash('sha256').update(JSON.stringify({
    fixedFrame:'world',runMode,robots,
  })).digest('hex');
  const robotDisplays=roster.map((item) => ({
    id:item.name,robotDescriptionParameter:item.robotDescriptionParameter,
    tfPrefix:item.sceneModel,pathTopic:item.pathTopic,
    pathLineWidthMeters:item.pathLineWidthMeters,initialPose:item.initialPose,
  }));
  return {
    schemaVersion:1,fixedFrame:'world',runMode,robots,robotDisplays,
    displays:['RobotModel','TF','Path'],config,rosterDigest,
  };
}

function committedMixedRvizRoster() {
  return [
    {
      name:'scout_beta',kind:'scout_mini',namespace:'/scout_beta',sceneClass:'scout',
      sceneModel:'field_scout',robotDescriptionParameter:'/scout_beta/visual_robot_description',
      pathTopic:'/scout_beta/history/path',pathLineWidthMeters:0.04,
      initialPose:{ x:-2,y:3,z:0.181,yaw:1.2 },
    },
    {
      name:'uav_alpha',kind:'px4_multirotor',namespace:'/uav_alpha',sceneClass:'fs150',
      sceneModel:'uav_alpha',robotDescriptionParameter:'/uav_alpha/visual_robot_description',
      pathTopic:'/uav_alpha/path',pathLineWidthMeters:0.03,
      initialPose:{ x:6,y:-1,z:1.4,yaw:0.25 },
    },
  ];
}

function committedMixedRvizLayout(roster) {
  const runMode='simulation';
  const robots=roster.map((item) => ({
    id:item.name,kind:item.kind,namespace:item.namespace,
    sceneClass:item.sceneClass,sceneModel:item.sceneModel,
  }));
  const robotDisplays=roster.map((item) => ({
    id:item.name,robotDescriptionParameter:item.robotDescriptionParameter,
    tfPrefix:item.sceneModel,pathTopic:item.pathTopic,
    pathLineWidthMeters:item.pathLineWidthMeters,initialPose:item.initialPose,
  }));
  const config=readFileSync(new URL(
    '../../core-xgc/internal/workflow/plugins/visualization/testdata/rviz_layout_mixed.golden.rviz',
    import.meta.url,
  ),'utf8');
  const rosterDigest=createHash('sha256').update(JSON.stringify({
    fixedFrame:'world',runMode,robots,
  })).digest('hex');
  return {
    schemaVersion:1,fixedFrame:'world',runMode,robots,robotDisplays,
    displays:['Grid','TF','RobotModel','Path','Image'],
    cameraImageTopic:'/xgc/camera/world/image_raw',config,rosterDigest,
  };
}

function shuffleRvizClassProperties(config) {
  return config
    .replaceAll(
      '    - Alpha: 1\n      Class: rviz/RobotModel\n      Collision Enabled: false\n      Enabled: true',
      '    - Alpha: 1\n      Collision Enabled: false\n      Enabled: true\n      Class: rviz/RobotModel',
    )
    .replace(
      / {4}- Alpha: 1\n {6}Buffer Length: 1\n {6}Class: rviz\/Path\n {6}Color: (\d+; \d+; \d+)\n {6}Enabled: true/g,
      '    - Alpha: 1\n      Buffer Length: 1\n      Color: $1\n      Enabled: true\n      Class: rviz/Path',
    );
}

function lichtblickLayout(roster) {
  const topics={ '/xgc/scene':{ visible:true },'/xgc/tf':{ visible:true } };
  const layers={};
  for (const item of roster) {
    topics[item.pathTopic]={ visible:true,type:'line' };
    layers[`xgc2-urdf-${item.name}`]={
      layerId:'foxglove.Urdf',visible:true,parameter:item.robotDescriptionParameter,
      framePrefix:`${item.sceneModel}/`,
    };
  }
  return {
    layout:{ first:SEMANTIC_CANVAS_IDS.threeD,second:SEMANTIC_CANVAS_IDS.cameraAR,direction:'column' },
    configById:{
      [SEMANTIC_CANVAS_IDS.threeD]:{ followTf:'world',followMode:'follow-none',topics,layers },
      [SEMANTIC_CANVAS_IDS.cameraAR]:{
        imageMode:{ imageTopic:'/camera/image',calibrationTopic:'/camera/info' },
        topics:{ '/xgc/scene':{ visible:true } },
      },
    },
  };
}

function canvas(role,first,last) {
  const panelId=SEMANTIC_CANVAS_IDS[role];
  return {
    panelId,width:640,height:360,pixelWidth:1280,pixelHeight:720,webgl:true,
    transitions:1,uniqueHashes:2,
    samples:[
      { bytes:12_000,hash:first.repeat(64) },{ bytes:13_000,hash:last.repeat(64) },
    ],
  };
}

function robot(slotId,kind,pathTopic) {
  return { slotId,kind,pathTopic };
}

function pathSample(item,pointCount,latestStamp) {
  const ground=item.kind!=='px4_multirotor';
  return {
    slotId:item.slotId,topic:item.pathTopic,messageType:'nav_msgs/Path',frameId:'world',
    poseFramesWorld:true,tfWorldLinked:true,pointCount,latestStamp,
    minZ:ground ? 0 : 0.1,maxZ:ground ? 0.02 : 2,
  };
}

function tile(id,fields={}) {
  return { id,status:'idle',percent:0,running:'false',runId:'',...fields };
}
