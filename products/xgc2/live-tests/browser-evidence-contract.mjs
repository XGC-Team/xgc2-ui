import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const B2_ASSET_ID = '9f2c1b8e-4a6d-5e1f-b0c3-7d8e9f0a1b2c';
export const B2_ROBOT_ID = 'b2-01';
export const B2_TARGET_ID = 'xgc2-dev-lab-agent-b2';
export const MOCAP_ASSET_ID = '8bbf0b2c-371d-5a94-b4f4-e0fd68f2c801';
export const MOCAP_ROBOT_ID = 'mocap-rotor-01';
export const MOCAP_TARGET_ID = 'xgc2-dev-lab-agent-mocap-rotor';
export const MOCAP_NAMESPACE = '/mocap_rotor1';
export const MOCAP_DESCRIPTION_PARAMETER = `${MOCAP_NAMESPACE}/visual_robot_description`;
export const MOCAP_PATH_TOPIC = `${MOCAP_NAMESPACE}/path`;
export const MOCAP_INITIAL_CAMERA_DISTANCE_METERS = 2.5;
export const MOCAP_PATH_LINE_WIDTH_METERS = 0.03;
export const MOCAP_PATH_GRADIENT = ['#f2003cff', '#f2003c80'];
export const MOCAP_MIN_PATH_EXTENT_METERS = 0.6;
export const MOCAP_MIN_PATH_DISTANCE_FROM_LAST_METERS = 0.35;

const B2_PANEL_ROSTER = {
  asset:['robot-assets'],
  gcs:['robot-instruments','lichtblick','camera-video','ros-control','b2-onboard-workflows'],
};
const MOCAP_PANEL_ROSTER = {
  asset:['robot-assets'],
  gcs:['robot-instruments','lichtblick'],
};

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const ACTIVE_STATUS = new Set(['attached','running','waiting']);
const READY_SERVICE_STATUS = new Set(['ready','running']);
const FORBIDDEN_MOCAP_IDENTITIES = ['mocap_fixture1','xgc2_mocap_fixture_fs150_0','fs150'];
const MOCAP_CHANNELS = new Map([
  ['state.pose',2001],['state.velocity',2002],['state.speed',2006],['state.imu',2003],
  ['state.power',2004],['state.health',2005],['state.flight',3001],
  ['diagnostic.link',2010],['diagnostic.stream-health',2011],
]);
const MOCAP_DIRECT_CHANNELS = [
  'state.pose','state.velocity','state.speed','state.imu','state.power',
  'state.flight','diagnostic.link',
];
const MOCAP_STREAM_CHANNELS = [
  'state.pose','state.velocity','state.speed','state.imu','state.power',
  'state.health','state.flight','diagnostic.link',
];
const EXPECTED_ALGORITHM_RESULT = {
  algorithm:'integer-summary-v1',
  input:[3,1,4,1,5],
  result:{ count:5,sum:14,sumOfSquares:52 },
};
const EXPECTED_ALGORITHM_STDERR = [
  'xgc2-safe-algorithm: starting deterministic integer summary',
  'xgc2-safe-algorithm: completed count=5',
].join('\n');

export function readJSONEvidence(path,label) {
  if (typeof path !== 'string' || !path.startsWith('/')) {
    throw new Error(`${label} path must be absolute`);
  }
  let raw;
  try {
    raw = readFileSync(path,'utf8');
  } catch (cause) {
    throw new Error(`${label} is unreadable: ${messageOf(cause)}`,{ cause });
  }
  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw new Error(`${label} is not one JSON document: ${messageOf(cause)}`,{ cause });
  }
}

export function digestEvidence(value) {
  return createHash('sha256').update(stableJSON(value)).digest('hex');
}

export function assertB2Ledger(ledger,expected) {
  object(ledger,'B2 API ledger');
  assertSession(ledger.session,expected,'B2');
  array(ledger.members,'B2 API ledger members');
  array(ledger.runs,'B2 API ledger runs');
  object(ledger.algorithmJob,'B2 API ledger algorithm Job');
  object(ledger.jobLogs,'B2 API ledger Job logs');
  object(ledger.orchestrationLifecycleLogs,'B2 API ledger orchestration lifecycle logs');

  const service = assertFiniteB2Run(ledger,expected,{
    label:'service',runId:expected.serviceRunId,resourceId:expected.serviceResourceId,
    bindingId:'b2-user-ros2-service',nodeId:'typed-call',
  });
  const sums = deepValuesForKey(service.node.output,'sum');
  invariant(sums.length === 1 && sums[0] === 42,
    'B2 service typed-call output must contain exactly one numeric sum=42');

  const algorithm = assertFiniteB2Run(ledger,expected,{
    label:'algorithm',runId:expected.algorithmRunId,resourceId:expected.algorithmResourceId,
    bindingId:'b2-user-safe-algorithm',nodeId:'algorithm',
  });
  assertAlgorithmOutput(algorithm.node.output,'B2 algorithm node output');
  const algorithmJob = object(ledger.algorithmJob,'B2 algorithm Job');
  equal(algorithmJob.source,'orchestration-invocation-main-output','B2 algorithm Job source');
  equal(algorithmJob.runId,expected.algorithmRunId,'B2 algorithm Job runId');
  equal(algorithmJob.nodeId,'algorithm','B2 algorithm Job nodeId');
  id(algorithmJob.jobId,'B2 algorithm jobId');
  deepEqual(algorithmJob.result,algorithm.node.output,'B2 algorithm Job projected result');
  const jobLogs = object(ledger.jobLogs[expected.algorithmRunId],
    `B2 algorithm ${expected.algorithmRunId} Job logs`);
  equal(jobLogs.source,'job-log-endpoint','B2 algorithm Job log source');
  equal(jobLogs.jobId,algorithmJob.jobId,'B2 algorithm Job log jobId');
  const jobStdout = nonEmptyString(jobLogs.stdout,'B2 algorithm Job stdout');
  includes(jobStdout,'attempt 1 started','B2 algorithm Job stdout');
  includes(jobStdout,JSON.stringify(EXPECTED_ALGORITHM_RESULT),'B2 algorithm Job stdout');
  includes(jobStdout,'attempt 1 succeeded','B2 algorithm Job stdout');
  equal(nonEmptyString(jobLogs.stderr,'B2 algorithm Job stderr').trim(),EXPECTED_ALGORITHM_STDERR,
    'B2 algorithm Job stderr');
  const lifecycle = object(ledger.orchestrationLifecycleLogs[expected.algorithmRunId],
    `B2 algorithm ${expected.algorithmRunId} orchestration lifecycle`);
  equal(lifecycle.source,'orchestration-run-log-endpoint','B2 algorithm lifecycle source');
  const lifecycleStdout = nonEmptyString(lifecycle.stdout,'B2 algorithm lifecycle stdout');
  includes(lifecycleStdout,'run starting with definition ','B2 algorithm lifecycle stdout');
  includes(lifecycleStdout,'node algorithm succeeded','B2 algorithm lifecycle stdout');
  equal(lifecycle.stderr,'','B2 algorithm lifecycle stderr');
  assertB2CameraOwnership(ledger.cameraOwnership,expected);
  return { service,algorithm };
}

export function assertG4B2Evidence(evidence,expected) {
  object(evidence,'G4 B2 evidence');
  equal(evidence.experimentId,expected.experimentId,'G4 experimentId');
  equal(evidence.sessionId,expected.sessionId,'G4 sessionId');
  equal(evidence.runId,expected.projectionRunId,'G4 projection runId');
  equal(evidence.robotId,B2_ROBOT_ID,'G4 B2 robotId');
  equal(evidence.projectionState,'live','G4 projection state');
  const instrument = object(evidence.instrument,'G4 instrument');
  equal(instrument.connection,'online','G4 B2 instrument connection');
  equal(instrument.streamState,'live','G4 B2 stream state');
  const lichtblick = object(evidence.lichtblick,'G4 Lichtblick');
  equal(lichtblick.html,true,'G4 Lichtblick HTML proof');
  positiveInteger(lichtblick.canvasCount,'G4 Lichtblick canvas count');
  equal(lichtblick.dynamic,true,'G4 Lichtblick dynamic proof');
  digest(lichtblick.beforeHash,'G4 Lichtblick before hash');
  digest(lichtblick.afterHash,'G4 Lichtblick after hash');
  invariant(lichtblick.beforeHash !== lichtblick.afterHash,'G4 Lichtblick hashes did not change');
  noPageErrors(evidence.pageErrors,'G4');
}

export function assertG6B2Evidence(evidence,expected) {
  object(evidence,'G6 B2 evidence');
  equal(evidence.experimentId,expected.experimentId,'G6 experimentId');
  equal(evidence.sessionId,expected.sessionId,'G6 sessionId');
  equal(evidence.mediaRunId,expected.g6MediaRunId,'G6 media runId');
  equal(evidence.targetId,B2_TARGET_ID,'G6 targetId');
  equal(evidence.sourceId,'odin1','G6 sourceId');
  noPageErrors(evidence.pageErrors,'G6');
  assertAdvancingVideo(evidence.initial,'G6 initial video');
  equal(object(evidence.viewer,'G6 viewer').disconnect?.state,'disconnected','G6 viewer disconnect');
  assertAdvancingVideo(evidence.viewer.reconnect,'G6 viewer reconnect');
  assertStoppedVideo(evidence.sourceFault,'G6 source fault');
  assertAdvancingVideo(evidence.sourceRecovery,'G6 source recovery');
  equal(object(evidence.edgeFault,'G6 Edge fault').healthUnavailable,true,'G6 Edge fault');
  assertAdvancingVideo(evidence.edgeRecovery,'G6 Edge recovery');
  equal(object(evidence.viewerClosed,'G6 viewer close').viewers,0,'G6 final viewer count');
}

export function assertB2BrowserEvidence(evidence,expected) {
  object(evidence,'B2 browser evidence');
  equal(evidence.experimentId,expected.experimentId,'B2 browser experimentId');
  equal(evidence.sessionId,expected.sessionId,'B2 browser sessionId');
  equal(evidence.targetId,B2_TARGET_ID,'B2 browser targetId');
  noPageErrors(evidence.pageErrors,'B2 browser');
  assertPanelRoster(evidence.panelRoster,B2_PANEL_ROSTER,'B2');

  const asset = object(evidence.asset,'B2 Asset panel');
  equal(asset.resourceId,B2_ASSET_ID,'B2 Asset resourceId');
  equal(asset.count,1,'B2 Asset count');
  equal(asset.state,'','B2 Asset disabled state');
  includes(asset.text,'B2 01','B2 Asset text');

  const instrument = object(evidence.instrument,'B2 instrument');
  equal(instrument.cardCount,1,'B2 robot card count');
  equal(instrument.cardStatus,'online','B2 robot card status');
  equal(instrument.cardHealth,'healthy','B2 robot card health');
  equal(instrument.connection,'online','B2 instrument connection');
  equal(instrument.streamState,'live','B2 instrument stream state');
  finiteNumberString(instrument.heading,'B2 heading');
  finiteNumberString(instrument.linearSpeed,'B2 linear speed');

  const lichtblick = object(evidence.lichtblick,'B2 Lichtblick browser proof');
  equal(lichtblick.frameCount,1,'B2 Lichtblick frame count');
  positiveInteger(lichtblick.canvasCount,'B2 Lichtblick canvas count');
  equal(lichtblick.projectionState,'live','B2 Lichtblick projection state');
  equal(lichtblick.dynamic,true,'B2 Lichtblick dynamic proof');
  digest(lichtblick.beforeHash,'B2 Lichtblick before hash');
  digest(lichtblick.afterHash,'B2 Lichtblick after hash');
  invariant(lichtblick.beforeHash !== lichtblick.afterHash,'B2 Lichtblick hashes did not change');

  const ros = object(evidence.ros,'B2 ROS Control');
  equal(ros.panelCount,1,'B2 ROS Control panel count');
  sameStrings(ros.tileIds,['adapters','roscore'],'B2 visible ROS tile ids');
  sameStrings(ros.hiddenIds,[],'B2 hidden ROS tiles present');
  assertRosTile(ros.tiles?.roscore,expected.roscoreRunId,'ROS Core');
  assertRosTile(ros.tiles?.adapters,expected.adaptersRunId,'Robot Adapters');

  const automation = object(evidence.automation,'B2 Automation panel');
  equal(automation.panelCount,1,'B2 Automation panel count');
  sameStrings(automation.views,['controls','history','logs','whiteboard'],'B2 Automation views');
  assertBrowserWorkflow(automation.service,expected,{
    label:'service',resourceId:expected.serviceResourceId,runId:expected.serviceRunId,nodeId:'typed-call',
  });
  const serviceSums = deepValuesForKey(automation.service.history.nodeOutput,'sum');
  invariant(serviceSums.length === 1 && serviceSums[0] === 42,
    'B2 browser service history must render one numeric sum=42');
  assertBrowserWorkflow(automation.algorithm,expected,{
    label:'algorithm',resourceId:expected.algorithmResourceId,runId:expected.algorithmRunId,nodeId:'algorithm',
  });
  const browserAlgorithm = assertBrowserAlgorithmJobOutput(
    automation.algorithm.history.nodeOutput,'B2 browser algorithm history output');
  const jobLogs = object(automation.algorithm.jobLogs,'B2 browser algorithm Job logs');
  equal(jobLogs.source,'job-log-endpoint','B2 browser algorithm Job log source');
  equal(jobLogs.runId,expected.algorithmRunId,'B2 browser algorithm Job log runId');
  equal(jobLogs.nodeId,'algorithm','B2 browser algorithm Job log nodeId');
  equal(jobLogs.jobId,browserAlgorithm.jobId,'B2 browser algorithm Job log jobId');
  const jobStdout = nonEmptyString(jobLogs.stdout,'B2 browser algorithm Job stdout');
  includes(jobStdout,'attempt 1 started','B2 browser algorithm Job stdout');
  includes(jobStdout,browserAlgorithm.result.stdoutTail.trim(),'B2 browser algorithm Job stdout');
  includes(jobStdout,'attempt 1 succeeded','B2 browser algorithm Job stdout');
  const jobStderr = nonEmptyString(jobLogs.stderr,'B2 browser algorithm Job stderr');
  includes(jobStderr,browserAlgorithm.result.stderrTail.trim(),'B2 browser algorithm Job stderr');
  const lifecycle = object(automation.algorithm.orchestrationLifecycleLogs,
    'B2 browser algorithm orchestration lifecycle');
  equal(lifecycle.source,'orchestration-run-log-endpoint','B2 browser algorithm lifecycle source');
  equal(lifecycle.runId,expected.algorithmRunId,'B2 browser algorithm lifecycle runId');
  includes(nonEmptyString(lifecycle.stdout,'B2 browser algorithm lifecycle stdout'),
    'run starting with definition ','B2 browser algorithm lifecycle stdout');
  includes(lifecycle.stdout,'node algorithm succeeded','B2 browser algorithm lifecycle stdout');
  equal(lifecycle.stderr,'No stderr captured yet.','B2 browser algorithm lifecycle stderr placeholder');

  const camera = object(evidence.camera,'B2 Camera panel');
  equal(camera.tileCount,1,'B2 Camera tile count');
  equal(camera.sourceId,'odin1','B2 Camera source id');
  equal(camera.mediaBindingId,'b2-camera-topic-media','B2 Camera media binding id');
  equal(camera.mediaRunId,expected.cameraMediaRunId,'B2 Camera active topic-media runId');
  invariant(ACTIVE_STATUS.has(camera.mediaState),'B2 Camera media state is not active');
  equal(camera.viewerState,'playing','B2 Camera viewer state');
  equal(camera.hasStart,false,'B2 Camera start control while media is active');
  equal(camera.hasRestart,true,'B2 Camera restart control');
  equal(camera.hasStop,true,'B2 Camera stop control');
  equal(camera.hasHeaderViewerToggle,true,'B2 Camera header viewer control');
  equal(camera.hasTileViewerToggle,true,'B2 Camera tile viewer control');
  assertAdvancingVideo(camera.video,'B2 decoded camera video');

  const inputs = object(evidence.inputs,'B2 evidence input digests');
  for (const key of ['ledger','g4','g6']) digest(inputs[key],`B2 ${key} evidence digest`);
}

export function assertMocapLedger(ledger,expected) {
  object(ledger,'Mocap API ledger');
  assertSession(ledger.session,expected,'Mocap');
  id(ledger.session.openingRunId,'Mocap Session opening Run id');
  array(ledger.members,'Mocap ledger members');
  array(ledger.runs,'Mocap ledger runs');
  const asset = object(ledger.asset,'Mocap ledger Asset');
  equal(asset.resourceId,MOCAP_ASSET_ID,'Mocap Asset resourceId');
  equal(asset.name,'Mocap Rotor 01','Mocap Asset name');
  equal(asset.kind,'px4_multirotor','Mocap Asset kind');
  equal(asset.profileId,'px4.mocap-rotor.ros1.v1','Mocap Asset profile');
  equal(asset.modelId,'mocap_rotor','Mocap Asset model');
  const binding = object(ledger.robotBinding,'Mocap Robot binding');
  equal(binding.id,MOCAP_ROBOT_ID,'Mocap Robot binding id');
  equal(binding.namespace,MOCAP_NAMESPACE,'Mocap Robot namespace');
  equal(binding.ref?.resourceId,MOCAP_ASSET_ID,'Mocap Robot binding Asset ref');
  equal(binding.runtimeParameters?.wire_transport,'zenoh','Mocap wire transport');
  equal(binding.runtimeParameters?.zenoh_listen,'tcp/0.0.0.0:7457','Mocap Zenoh listener');
  const release = object(ledger.adapterRelease,'Mocap Adapter release provenance');
  sameStrings(Object.keys(release),[
    'package','packageArchitecture','packageVersion','sourceDigest','localDebSha256',
  ],'Mocap Adapter release provenance fields');
  equal(release.package,'ros-noetic-xgc2-mocap-rotor-adapter','Mocap Adapter package');
  equal(release.packageArchitecture,'amd64','Mocap Adapter package architecture');
  digest(release.sourceDigest,'Mocap Adapter source digest');
  equal(release.packageVersion,`0.5.0-17+xgc2dev.${release.sourceDigest.slice(0,12)}`,
    'Mocap Adapter package version');
  digest(release.localDebSha256,'Mocap Adapter local Debian digest');
  if (expected.adapterRelease !== undefined) {
    const frozen = object(expected.adapterRelease,'Frozen Mocap Adapter release provenance');
    sameStrings(Object.keys(frozen),[
      'package','packageArchitecture','packageVersion','sourceDigest','localDebSha256',
    ],'Frozen Mocap Adapter release provenance fields');
    deepEqual(release,frozen,'Mocap Adapter release versus frozen provenance');
  }

  const trajectoryRelease = object(
    ledger.trajectoryRelease,
    'Mocap Agent-internal trajectory release provenance',
  );
  sameStrings(Object.keys(trajectoryRelease),[
    'scope','targetId','package','packageArchitecture','packageVersion','sourcePath',
    'sourceDigest','installedNode','contract','localDebSha256',
  ],'Mocap Agent-internal trajectory release provenance fields');
  equal(trajectoryRelease.scope,'agent-internal-fixture','Mocap trajectory release scope');
  equal(trajectoryRelease.targetId,MOCAP_TARGET_ID,'Mocap trajectory release target');
  equal(trajectoryRelease.package,'xgc2-dev-lab-mocap-fs150-trajectory-source',
    'Mocap trajectory package');
  equal(trajectoryRelease.packageArchitecture,'all','Mocap trajectory package architecture');
  equal(trajectoryRelease.sourcePath,
    'products/xgc2/dev-lab/mocap-fs150-trajectory-source/xgc2_mocap_fs150_trajectory_source_node.py',
    'Mocap trajectory source path');
  equal(trajectoryRelease.installedNode,
    '/opt/ros/noetic/lib/xgc2_dev_lab_mocap_fs150_trajectory_source/xgc2_mocap_fs150_trajectory_source_node',
    'Mocap trajectory installed node');
  equal(trajectoryRelease.contract,'xgc2-dev-lab-mocap-fs150-trajectory/v1',
    'Mocap trajectory contract');
  digest(trajectoryRelease.sourceDigest,'Mocap trajectory source digest');
  equal(trajectoryRelease.packageVersion,
    `0.1.0-1~xgc2dev.${trajectoryRelease.sourceDigest.slice(0,12)}`,
    'Mocap trajectory package version');
  digest(trajectoryRelease.localDebSha256,'Mocap trajectory local Debian digest');
  if (expected.trajectoryRelease !== undefined) {
    const frozen = object(expected.trajectoryRelease,'Frozen Mocap trajectory release provenance');
    sameStrings(Object.keys(frozen),[
      'scope','targetId','package','packageArchitecture','packageVersion','sourcePath',
      'sourceDigest','installedNode','contract','localDebSha256',
    ],'Frozen Mocap trajectory release provenance fields');
    deepEqual(trajectoryRelease,frozen,'Mocap trajectory release versus frozen provenance');
  }

  assertMocapOnboardRuntime(ledger,expected);
  assertLocalSessionChildRun(ledger,expected,{
    label:'Mocap Adapter projection',bindingId:'robot-adapters',runId:expected.projectionRunId,
    targetId:expected.dashboardTargetId,resourceId:expected.adaptersResourceId,
  });
  const operatorLedger = { ...ledger };
  delete operatorLedger.trajectoryRelease;
  rejectMocapIdentities(operatorLedger,'Mocap ledger');
}

export function assertMocapLayout(layout) {
  object(layout,'Mocap Lichtblick layout');
  equal(layout.layout,'3D!xgc2','Mocap Lichtblick selected layout');
  const threeD = object(layout.configById?.['3D!xgc2'],'Mocap Lichtblick 3D config');
  equal(threeD.followMode,'follow-none','Mocap Lichtblick follow mode');
  equal(threeD.followTf,'world','Mocap Lichtblick follow frame');
  equal(threeD.cameraState?.distance,MOCAP_INITIAL_CAMERA_DISTANCE_METERS,
    'Mocap Lichtblick initial camera distance');
  const topics = object(threeD.topics,'Mocap Lichtblick topics');
  equal(topics[MOCAP_PATH_TOPIC]?.visible,true,'Mocap path visibility');
  equal(topics[MOCAP_PATH_TOPIC]?.type,'line','Mocap path render type');
  equal(topics[MOCAP_PATH_TOPIC]?.lineWidth,MOCAP_PATH_LINE_WIDTH_METERS,
    'Mocap path line width');
  deepEqual(topics[MOCAP_PATH_TOPIC]?.gradient,MOCAP_PATH_GRADIENT,
    'Mocap path PX4 history gradient');
  equal(topics[`${MOCAP_NAMESPACE}/odom`]?.visible,true,'Mocap odometry visibility');
  object(topics[`param:${MOCAP_DESCRIPTION_PARAMETER}`],'Mocap description parameter topic');
  equal(topics['/tf']?.visible,true,'Mocap TF visibility');
  equal(topics['/tf_static']?.visible,true,'Mocap static TF visibility');
  const layers = object(threeD.layers,'Mocap Lichtblick layers');
  const urdfLayers = Object.values(layers).filter((layer) => layer?.layerId === 'foxglove.Urdf');
  equal(urdfLayers.length,1,'Mocap URDF layer count');
  const layer = object(layers['xgc2-urdf-mocap_rotor1'],'Mocap dedicated URDF layer');
  equal(layer.sourceType,'param','Mocap URDF source type');
  equal(layer.parameter,MOCAP_DESCRIPTION_PARAMETER,'Mocap URDF parameter');
  equal(layer.framePrefix,'mocap_rotor1/','Mocap URDF frame prefix');
  equal(layer.visible,true,'Mocap URDF visibility');
  equal(layer.displayMode,'visual','Mocap URDF display mode');
  rejectMocapIdentities(layout,'Mocap Lichtblick layout');
}

export function assertMocapTransitionEvidence(evidence,expected) {
  object(evidence,'Mocap offline/recovery evidence');
  equal(evidence.experimentId,expected.experimentId,'Mocap transition experimentId');
  equal(evidence.sessionId,expected.sessionId,'Mocap transition sessionId');
  equal(evidence.runId,expected.projectionRunId,'Mocap transition projection runId');
  equal(evidence.robotId,MOCAP_ROBOT_ID,'Mocap transition robotId');
  equal(evidence.onboardParentRunId,expected.onboardRunId,'Mocap transition onboard parent runId');
  equal(evidence.onboardRuntimeRunId,expected.onboardRuntimeRunId,'Mocap transition onboard runtime runId');
  invariant(evidence.onboardRuntimeRunId !== evidence.onboardParentRunId,
    'Mocap transition confused the Session parent with the process-owning child Run');
  assertMocapForwarderIdentity(evidence.forwarderIdentity);
  const offline = object(evidence.offline,'Mocap offline phase');
  const recovered = object(evidence.recovered,'Mocap recovered phase');
  equal(offline.cardStatus,'offline','Mocap offline card status');
  equal(offline.instrumentConnection,'offline','Mocap offline instrument connection');
  equal(recovered.cardStatus,'online','Mocap recovered card status');
  equal(recovered.cardHealth,'healthy','Mocap recovered card health');
  equal(recovered.instrumentConnection,'online','Mocap recovered instrument connection');
  const offlineRevision = nonNegativeInteger(offline.projectionRevision,'Mocap offline revision');
  const recoveredRevision = positiveInteger(recovered.projectionRevision,'Mocap recovered revision');
  invariant(recoveredRevision > offlineRevision,'Mocap recovery projection revision did not advance');
  const offlinePoses = nonNegativeInteger(offline.pathPoseCount,'Mocap offline path pose count');
  const recoveredPoses = positiveInteger(recovered.pathPoseCount,'Mocap recovered path pose count');
  invariant(recoveredPoses > offlinePoses,'Mocap path poses did not grow after recovery');
  assertMocapPathPhase(offline,'Mocap offline Path');
  assertMocapPathPhase(recovered,'Mocap recovered Path');
  invariant(vectorDistance(recovered.pathLastPosition,offline.pathLastPosition) > 0.01,
    'Mocap recovered Path last position did not move more than 0.01 m from the offline recovery start');
  assertMocapChannelSnapshot(offline.channelSnapshot,{ offline:true,label:'Mocap offline channels' });
  assertMocapChannelSnapshot(recovered.channelSnapshot,{ offline:false,label:'Mocap recovered channels' });
  for (const channelId of MOCAP_DIRECT_CHANNELS) {
    invariant(recovered.channelSnapshot[channelId].sequence > offline.channelSnapshot[channelId].sequence,
      `Mocap recovered direct channel sequence did not advance: ${channelId}`);
  }
  equal(offline.streamId,recovered.streamId,'Mocap transition stream identity');
  nonEmptyString(offline.streamId,'Mocap transition streamId');
  const offlineAt = timestamp(offline.observedAt,'Mocap offline observedAt');
  const recoveredAt = timestamp(recovered.observedAt,'Mocap recovered observedAt');
  invariant(recoveredAt > offlineAt,'Mocap recovered evidence is not newer than offline evidence');
  rejectMocapIdentities(evidence,'Mocap transition evidence');
}

export function assertMocapBrowserEvidence(evidence,expected,transition,layout,ledger) {
  object(evidence,'Mocap browser evidence');
  assertMocapLedger(ledger,expected);
  assertMocapTransitionEvidence(transition,expected);
  assertMocapLayout(layout);
  equal(transition.onboardParentRunId,ledger.onboardRuntime.parentRunId,
    'Mocap browser transition versus ledger parent runId');
  equal(transition.onboardRuntimeRunId,ledger.onboardRuntime.childRunId,
    'Mocap browser transition versus ledger runtime child runId');
  equal(evidence.experimentId,expected.experimentId,'Mocap browser experimentId');
  equal(evidence.sessionId,expected.sessionId,'Mocap browser sessionId');
  equal(evidence.targetId,expected.dashboardTargetId,'Mocap browser targetId');
  noPageErrors(evidence.pageErrors,'Mocap browser');
  assertPanelRoster(evidence.panelRoster,MOCAP_PANEL_ROSTER,'Mocap');
  const asset = object(evidence.asset,'Mocap browser Asset');
  equal(asset.resourceId,MOCAP_ASSET_ID,'Mocap browser Asset resourceId');
  equal(asset.count,1,'Mocap browser Asset count');
  equal(asset.state,'','Mocap browser Asset disabled state');
  includes(asset.text,'Mocap Rotor 01','Mocap browser Asset text');
  const instrument = object(evidence.instrument,'Mocap browser instrument');
  equal(instrument.cardCount,1,'Mocap browser robot card count');
  equal(instrument.cardStatus,'online','Mocap browser robot card status');
  equal(instrument.cardHealth,'healthy','Mocap browser robot card health');
  equal(instrument.connection,'online','Mocap browser flight instrument connection');
  equal(instrument.health,'healthy','Mocap browser flight instrument health');
  includes(instrument.text,'Mocap Rotor 01','Mocap browser flight instrument text');
  finiteNumberString(instrument.roll,'Mocap browser roll');
  finiteNumberString(instrument.pitch,'Mocap browser pitch');
  finiteNumberString(instrument.yaw,'Mocap browser yaw');
  assertMocapInstrumentProjectionSample({
    readouts:instrument.readouts,projectionAudit:instrument.projectionAudit,
  },expected,transition);
  equal(instrument.readouts.attitude.roll,instrument.roll,'Mocap browser visible roll identity');
  equal(instrument.readouts.attitude.pitch,instrument.pitch,'Mocap browser visible pitch identity');
  equal(instrument.readouts.attitude.yaw,instrument.yaw,'Mocap browser visible yaw identity');
  const lichtblick = object(evidence.lichtblick,'Mocap browser Lichtblick');
  equal(lichtblick.frameCount,1,'Mocap browser Lichtblick frame count');
  positiveInteger(lichtblick.canvasCount,'Mocap browser Lichtblick canvas count');
  equal(lichtblick.dynamic,true,'Mocap browser Lichtblick dynamic proof');
  digest(lichtblick.beforeHash,'Mocap browser Lichtblick before hash');
  digest(lichtblick.afterHash,'Mocap browser Lichtblick after hash');
  invariant(lichtblick.beforeHash !== lichtblick.afterHash,'Mocap browser Lichtblick hashes did not change');
  equal(lichtblick.descriptionParameter,MOCAP_DESCRIPTION_PARAMETER,'Mocap browser URDF parameter');
  equal(lichtblick.pathTopic,MOCAP_PATH_TOPIC,'Mocap browser path topic');
  positiveInteger(lichtblick.pathPoseCount,'Mocap browser recovered path pose count');
  assertMocapLichtblickSemanticAudit(lichtblick);
  const identityAudit = object(evidence.identityAudit,'Mocap browser identity audit');
  sameStrings(identityAudit.scopes,['asset','lichtblick-frame','robot-card'],'Mocap identity audit scopes');
  sameStrings(identityAudit.forbiddenMatches,[],'Mocap forbidden identity matches');
  const surfaceDigests = object(identityAudit.surfaceDigests,'Mocap identity audit surface digests');
  for (const key of ['asset','lichtblickFrame','robotCard']) {
    digest(surfaceDigests[key],`Mocap ${key} identity audit digest`);
  }
  const inputs = object(evidence.inputs,'Mocap evidence input digests');
  for (const key of ['ledger','layout','transition']) digest(inputs[key],`Mocap ${key} evidence digest`);
  equal(inputs.ledger,digestEvidence(ledger),'Mocap browser ledger input digest');
  equal(inputs.transition,digestEvidence(transition),'Mocap browser transition input digest');
  equal(inputs.layout,digestEvidence(layout),'Mocap browser layout input digest');
  equal(inputs.layout,lichtblick.layoutAudit.stateDigest,'Mocap browser audited layout state digest');
  rejectMocapIdentities({ asset,instrument,lichtblick },'Mocap browser evidence');
}

export function assertMocapInstrumentProjectionSample(sample,expected,transition) {
  const value = object(sample,'Mocap browser instrument projection sample');
  const projection = object(value.projectionAudit,'Mocap browser instrument projection audit');
  sameStrings(Object.keys(projection),[
    'runId','targetId','streamId','projectionRevision','updatedAt','channelSnapshot',
  ],'Mocap browser instrument projection audit fields');
  equal(projection.runId,expected.projectionRunId,'Mocap browser instrument projection runId');
  equal(projection.targetId,expected.dashboardTargetId,'Mocap browser instrument projection targetId');
  equal(projection.streamId,transition.recovered.streamId,
    'Mocap browser instrument projection streamId');
  const revision = positiveInteger(projection.projectionRevision,
    'Mocap browser instrument projection revision');
  invariant(revision >= transition.recovered.projectionRevision,
    'Mocap browser instrument projection predates recovered evidence');
  const updatedAt = timestamp(projection.updatedAt,'Mocap browser instrument projection updatedAt');
  const recoveredAt = timestamp(transition.recovered.observedAt,'Mocap recovered observedAt');
  invariant(updatedAt >= recoveredAt,
    'Mocap browser instrument projection timestamp predates recovered evidence');
  assertMocapChannelSnapshot(projection.channelSnapshot,{
    offline:false,label:'Mocap browser instrument projection channels',
  });
  for (const channelId of MOCAP_CHANNELS.keys()) {
    invariant(projection.channelSnapshot[channelId].sequence
      >= transition.recovered.channelSnapshot[channelId].sequence,
    `Mocap browser instrument projection sequence regressed: ${channelId}`);
  }
  for (const channelId of MOCAP_DIRECT_CHANNELS) {
    invariant(projection.channelSnapshot[channelId].sequence
      > transition.recovered.channelSnapshot[channelId].sequence,
    `Mocap browser instrument projection direct channel did not advance: ${channelId}`);
  }
  assertMocapInstrumentReadouts(value.readouts,projection.channelSnapshot);
}

function assertMocapForwarderIdentity(value) {
  const identity = object(value,'Mocap forwarder identity');
  sameStrings(Object.keys(identity),[
    'processInstanceId','pid','startTime','executable','cmdlineSha256',
  ],'Mocap forwarder identity fields');
  id(identity.processInstanceId,'Mocap forwarder process instance id');
  positiveInteger(identity.pid,'Mocap forwarder pid');
  invariant(identity.pid > 1,'Mocap forwarder pid must identify a real child process');
  invariant(typeof identity.startTime === 'string' && /^[0-9]+$/.test(identity.startTime),
    'Mocap forwarder startTime must be a Linux process start tick string');
  invariant(typeof identity.executable === 'string'
    && identity.executable.endsWith('/xgc_mocap_rotor_zenoh_forwarder_node'),
  'Mocap forwarder executable must be the exact installed forwarder node');
  digest(identity.cmdlineSha256,'Mocap forwarder cmdline digest');
}

function assertMocapPathPhase(phase,label) {
  invariant(positiveInteger(phase.pathPoseCount,`${label} pose count`) >= 2,
    `${label} must contain at least two poses`);
  finite(phase.pathExtentMeters,`${label} extent`);
  invariant(phase.pathExtentMeters > MOCAP_MIN_PATH_EXTENT_METERS,
    `${label} extent must exceed ${MOCAP_MIN_PATH_EXTENT_METERS} m`);
  finite(phase.maxDistanceFromLastMeters,`${label} maximum distance from last pose`);
  invariant(phase.maxDistanceFromLastMeters > MOCAP_MIN_PATH_DISTANCE_FROM_LAST_METERS,
    `${label} must extend more than ${MOCAP_MIN_PATH_DISTANCE_FROM_LAST_METERS} m behind the current Robot pose`);
  const position = object(phase.pathLastPosition,`${label} last position`);
  sameStrings(Object.keys(position),['x','y','z'],`${label} last position fields`);
  for (const axis of ['x','y','z']) finite(position[axis],`${label} last position ${axis}`);
}

function assertMocapChannelSnapshot(value,{ offline,label }) {
  const channels = object(value,label);
  sameStrings(Object.keys(channels),[...MOCAP_CHANNELS.keys()],`${label} exact channel ids`);
  for (const [channelId,messageId] of MOCAP_CHANNELS) {
    const channel = object(channels[channelId],`${label} ${channelId}`);
    equal(channel.channelId,channelId,`${label} ${channelId} envelope id`);
    equal(channel.messageId,messageId,`${label} ${channelId} message id`);
    positiveInteger(channel.sequence,`${label} ${channelId} sequence`);
    const shouldBeStale = offline && !['state.health','diagnostic.stream-health'].includes(channelId);
    equal(channel.stale,shouldBeStale,`${label} ${channelId} stale state`);
  }
  invariant(mocapPoseValue(channels['state.pose'].value),`${label} state.pose is empty or invalid`);
  invariant(mocapVelocityValue(channels['state.velocity'].value),`${label} state.velocity is empty or invalid`);
  invariant(mocapSpeedValue(channels['state.speed'].value),`${label} state.speed is empty or invalid`);
  invariant(mocapImuValue(channels['state.imu'].value),`${label} state.imu is empty or invalid`);
  invariant(mocapPowerValue(channels['state.power'].value),`${label} state.power is invalid`);
  invariant(mocapHealthValue(channels['state.health'].value,!offline),`${label} state.health is invalid`);
  invariant(mocapFlightValue(channels['state.flight'].value),`${label} state.flight is invalid`);
  invariant(!offline || channels['state.flight'].value.connected === true,
    `${label} offline phase lost the still-live forwarder flight envelope`);
  invariant(mocapLinkValue(channels['diagnostic.link'].value),`${label} diagnostic.link is invalid`);
  invariant(mocapStreamHealthValue(channels['diagnostic.stream-health'].value,offline),
    `${label} diagnostic.stream-health is invalid`);
}

function assertMocapInstrumentReadouts(value,channels) {
  const readouts = object(value,'Mocap browser visible instrument readouts');
  const metrics = object(readouts.metrics,'Mocap browser instrument metrics');
  assertVisibleNumber(metrics.speed,'m/s','Mocap browser speed');
  assertVisibleNumber(metrics.altitude,'m','Mocap browser altitude');
  const flight = object(readouts.flight,'Mocap browser flight state');
  nonPlaceholderString(flight.mode,'Mocap browser flight mode');
  invariant(['ARMED','DISARMED'].includes(flight.armed),'Mocap browser armed state is not visible');
  equal(flight.visible,true,'Mocap browser flight state visibility');
  const frequencies = object(readouts.frequencies,'Mocap browser channel frequencies');
  sameStrings(Object.keys(frequencies),['POSE','VEL','IMU','PWR'],'Mocap browser frequency labels');
  for (const label of ['POSE','VEL','IMU','PWR']) {
    const frequency = object(frequencies[label],`Mocap browser ${label} frequency`);
    finiteNumberString(frequency.value,`Mocap browser ${label} frequency value`);
    invariant(Number(frequency.value) > 0,`Mocap browser ${label} frequency must be positive`);
    equal(frequency.tone,'normal',`Mocap browser ${label} frequency tone`);
    equal(frequency.visible,true,`Mocap browser ${label} frequency visibility`);
  }
  const hud = object(readouts.hud,'Mocap browser HUD');
  assertVisibleNumber(hud.climb,'m/s','Mocap browser climb');
  invariant(['up','down'].includes(hud.climb.direction),'Mocap browser climb direction is unavailable');
  finiteNumberString(hud.position?.x,'Mocap browser local X');
  finiteNumberString(hud.position?.y,'Mocap browser local Y');
  equal(hud.position?.visible,true,'Mocap browser local position visibility');
  const statuses = object(readouts.statuses,'Mocap browser compact statuses');
  sameStrings(Object.keys(statuses),['LNK','FLT','POS','IMU'],'Mocap browser compact status labels');
  equal(statuses.LNK?.value,'OK','Mocap browser LNK status');
  equal(statuses.POS?.value,'OK','Mocap browser POS status');
  equal(statuses.IMU?.value,'OK','Mocap browser IMU status');
  invariant(['GND','AIR','TO','LND'].includes(statuses.FLT?.value),
    'Mocap browser FLT status is unavailable');
  for (const label of ['LNK','FLT','POS','IMU']) {
    nonEmptyString(statuses[label]?.title,`Mocap browser ${label} status title`);
    equal(statuses[label]?.visible,true,`Mocap browser ${label} status visibility`);
  }
  const compass = object(readouts.compass,'Mocap browser compass');
  finiteNumberString(compass.heading,'Mocap browser heading');
  equal(compass.visible,true,'Mocap browser heading visibility');
  invariant(Math.abs(Number(compass.heading)-Number(readouts.attitude?.yaw)) <= 0.51,
    'Mocap browser compass heading does not match visible yaw');
  const attitude = object(readouts.attitude,'Mocap browser attitude');
  for (const axis of ['roll','pitch','yaw']) finiteNumberString(attitude[axis],`Mocap browser ${axis} readout`);
  const indicators = object(readouts.indicators,'Mocap browser status indicators');
  sameStrings(Object.keys(indicators),['network','position','power'],
    'Mocap browser status indicator ids');
  includes(indicators.network?.label,'connected','Mocap browser network indicator');
  includes(indicators.position?.label,'VRPN position','Mocap browser position indicator');
  invariant(!/Positioning ready/.test(indicators.position?.label ?? ''),
    'Mocap browser position indicator still uses Positioning ready');
  invariant(/^Battery [0-9]+%/.test(indicators.power?.label ?? ''),
    'Mocap browser power indicator has no numeric battery value');
  for (const key of ['network','position','power']) {
    nonEmptyString(indicators[key]?.tone,`Mocap browser ${key} indicator tone`);
    invariant(indicators[key].visible === true,`Mocap browser ${key} indicator is not visible`);
  }
  assertMocapInstrumentProjection(readouts,channels);
}

function assertMocapInstrumentProjection(readouts,channels) {
  const pose = channels['state.pose'].value;
  const velocity = channels['state.velocity'].value;
  const imu = channels['state.imu'].value;
  const power = channels['state.power'].value;
  const flight = channels['state.flight'].value;
  const link = channels['diagnostic.link'].value;
  const streamRates = Object.fromEntries(channels['diagnostic.stream-health'].value.channels
    .map((channel) => [channel.channelId,channel.sourceRateHz ?? 0]));
  const quaternion = normalizedMocapQuaternion(imu.orientation ?? pose.orientation);
  const roll = clampMocap(quaternionRoll(quaternion),-30,30);
  const pitch = clampMocap(quaternionPitch(quaternion),-30,30);
  const yaw = normalizeMocapYaw(quaternionYaw(quaternion));
  equal(readouts.attitude.roll,roll.toFixed(2),'Mocap browser roll versus sampled IMU');
  equal(readouts.attitude.pitch,pitch.toFixed(2),'Mocap browser pitch versus sampled IMU');
  equal(readouts.attitude.yaw,yaw.toFixed(2),'Mocap browser yaw versus sampled IMU');
  equal(readouts.metrics.speed.value,channels['state.speed'].value.metersPerSecond.toFixed(1),
    'Mocap browser speed versus sampled state.speed');
  equal(readouts.metrics.altitude.value,mocapProtoAxis(pose.position,'z').toFixed(1),
    'Mocap browser altitude versus sampled state.pose');
  equal(readouts.flight.mode,flight.mode,'Mocap browser mode versus sampled state.flight');
  equal(readouts.flight.armed,flight.armed ? 'ARMED' : 'DISARMED',
    'Mocap browser armed state versus sampled state.flight');
  for (const [label,channelId,threshold] of [
    ['POSE','state.pose',5],['VEL','state.velocity',5],['IMU','state.imu',5],
  ]) {
    const rate = Number(streamRates[channelId]);
    equal(readouts.frequencies[label].value,rate > 0 ? rate.toFixed(1) : '--',
      `Mocap browser ${label} frequency versus sampled stream health`);
    equal(readouts.frequencies[label].tone,rate < threshold ? 'danger' : 'normal',
      `Mocap browser ${label} tone versus sampled stream health`);
  }
  equal(readouts.frequencies.PWR.value,(Number(streamRates['state.power']) > 0
    ? Number(streamRates['state.power']).toFixed(1) : '--'),
    'Mocap browser PWR frequency versus sampled stream health');
  equal(readouts.frequencies.PWR.tone,'normal','Mocap browser PWR frequency stays white');
  equal(readouts.hud.climb.value,Math.abs(velocity.linear.z).toFixed(1),
    'Mocap browser climb versus sampled state.velocity');
  equal(readouts.hud.climb.direction,velocity.linear.z >= 0 ? 'up' : 'down',
    'Mocap browser climb direction versus sampled state.velocity');
  equal(readouts.hud.position.x,mocapProtoAxis(pose.position,'x').toFixed(1),
    'Mocap browser local X versus sampled state.pose');
  equal(readouts.hud.position.y,mocapProtoAxis(pose.position,'y').toFixed(1),
    'Mocap browser local Y versus sampled state.pose');
  equal(readouts.statuses.LNK.value,channels['diagnostic.link'].stale ? '--' : 'OK',
    'Mocap browser link status versus recovered diagnostic.link');
  equal(readouts.statuses.LNK.title,'Onboard Zenoh telemetry link ready',
    'Mocap browser link title versus recovered diagnostic.link');
  equal(readouts.statuses.FLT.value,mocapFlightStage(flight.landedState),
    'Mocap browser flight stage versus recovered state.flight');
  equal(readouts.statuses.FLT.title,`Flight stage: ${mocapFlightStageLong(flight.landedState)}`,
    'Mocap browser flight stage title versus recovered state.flight');
  equal(readouts.statuses.POS.value,channels['state.pose'].stale ? '--' : 'OK',
    'Mocap browser pose status versus recovered state.pose');
  equal(readouts.statuses.POS.title,'Local pose fresh',
    'Mocap browser pose title versus recovered state.pose');
  equal(readouts.statuses.IMU.value,mocapRateHealth(streamRates['state.imu'],5),
    'Mocap browser IMU status versus recovered stream health');
  equal(readouts.statuses.IMU.title,`IMU source rate ${Number(streamRates['state.imu']).toFixed(1)} Hz`,
    'Mocap browser IMU title versus recovered stream health');
  equal(readouts.compass.heading,String(Math.round(yaw)),
    'Mocap browser compass versus recovered IMU');
  const rtt = Number.isFinite(link.roundTripTimeMs) ? Math.max(0,link.roundTripTimeMs) : null;
  equal(readouts.indicators.network.label,rtt === null
    ? 'Communication link connected' : `Communication latency ${rtt.toFixed(1)} ms`,
  'Mocap browser network indicator versus recovered diagnostic.link');
  equal(readouts.indicators.network.tone,mocapCommunicationTone(rtt),
    'Mocap browser network tone versus recovered diagnostic.link');
  const positioning = channels['state.health']?.value?.positioning;
  if (positioning?.state) {
    includes(readouts.indicators.position.label,'VRPN positioning',
      'Mocap browser position indicator versus recovered state.health.positioning');
  } else {
    equal(readouts.indicators.position.label,'VRPN position unavailable',
      'Mocap browser position indicator versus recovered state.health.positioning');
    equal(readouts.indicators.position.tone,'neutral',
      'Mocap browser position tone versus recovered state.health.positioning');
  }
  invariant(!/Positioning ready/.test(readouts.indicators.position.label),
    'Mocap browser position indicator still uses Positioning ready');
  const battery = clampMocap(power.percentage <= 1 ? power.percentage * 100 : power.percentage,0,100);
  includes(readouts.indicators.power.label,`Battery ${Math.round(battery)}%`,
    'Mocap browser battery indicator versus recovered state.power');
  equal(readouts.indicators.power.tone,mocapBatteryTone(battery),
    'Mocap browser battery tone versus recovered state.power');
}

function assertMocapLichtblickSemanticAudit(lichtblick) {
  const layout = object(lichtblick.layoutAudit,'Mocap browser Lichtblick layout audit');
  equal(layout.selectedLayout,'3D!xgc2','Mocap browser selected Lichtblick layout');
  equal(layout.followMode,'follow-none','Mocap browser Lichtblick follow mode');
  equal(layout.followTf,'world','Mocap browser Lichtblick follow frame');
  equal(layout.cameraDistanceMeters,MOCAP_INITIAL_CAMERA_DISTANCE_METERS,
    'Mocap browser Lichtblick initial camera distance');
  const path = object(layout.pathRenderer,'Mocap browser Path renderer');
  equal(path.topic,MOCAP_PATH_TOPIC,'Mocap browser Path renderer topic');
  equal(path.visible,true,'Mocap browser Path renderer visibility');
  equal(path.type,'line','Mocap browser Path renderer type');
  equal(path.lineWidthMeters,MOCAP_PATH_LINE_WIDTH_METERS,
    'Mocap browser Path renderer line width');
  deepEqual(path.gradient,MOCAP_PATH_GRADIENT,
    'Mocap browser Path renderer PX4 history gradient');
  invariant(path.extentMeters > MOCAP_MIN_PATH_EXTENT_METERS,
    'Mocap browser Path renderer has no operator-visible spatial path extent');
  invariant(path.maxDistanceFromLastMeters > MOCAP_MIN_PATH_DISTANCE_FROM_LAST_METERS,
    'Mocap browser Path renderer remains hidden inside the current Robot footprint');
  const lastPosition = object(path.lastPosition,'Mocap browser Path renderer last position');
  for (const axis of ['x','y','z']) finite(lastPosition[axis],`Mocap browser Path renderer ${axis}`);
  const urdf = object(layout.urdfLayer,'Mocap browser URDF renderer');
  equal(urdf.key,'xgc2-urdf-mocap_rotor1','Mocap browser URDF layer key');
  equal(urdf.layerId,'foxglove.Urdf','Mocap browser URDF renderer id');
  equal(urdf.sourceType,'param','Mocap browser URDF source type');
  equal(urdf.parameter,MOCAP_DESCRIPTION_PARAMETER,'Mocap browser URDF parameter source');
  equal(urdf.framePrefix,'mocap_rotor1/','Mocap browser URDF frame prefix');
  equal(urdf.visible,true,'Mocap browser URDF renderer visibility');
  equal(urdf.displayMode,'visual','Mocap browser URDF display mode');
  digest(layout.stateDigest,'Mocap browser Lichtblick layout state digest');
  const source = object(lichtblick.dataSourceAudit,'Mocap browser Lichtblick data source audit');
  id(source.processInstanceId,'Mocap browser Lichtblick process instance id');
  equal(source.targetId,'local','Mocap browser Lichtblick data source target');
  equal(source.kind,'foxglove-websocket','Mocap browser Lichtblick data source kind');
  const proxyPath = `/api/visualization/targets/local/lichtblick/${encodeURIComponent(source.processInstanceId)}`;
  equal(source.proxyPath,proxyPath,'Mocap browser Lichtblick proxy path');
  equal(source.websocketPath,`${proxyPath}/ws`,'Mocap browser Lichtblick websocket path');
  equal(source.embedded,true,'Mocap browser Lichtblick embedded state');
  const renderer = object(lichtblick.rendererAudit,'Mocap browser Lichtblick renderer audit');
  equal(renderer.canvasCount,lichtblick.canvasCount,'Mocap browser renderer canvas count');
  const anchors = array(renderer.readableAnchors,'Mocap browser Lichtblick readable anchors');
  invariant(anchors.every((anchor) => [MOCAP_DESCRIPTION_PARAMETER,MOCAP_PATH_TOPIC].includes(anchor)),
    'Mocap browser Lichtblick contains an unknown semantic UI anchor');
  const visual = object(renderer.visualGate,'Mocap browser Lichtblick visual gate');
  equal(visual.pixelSemanticsClaimed,false,'Mocap browser Lichtblick pixel semantic claim');
  invariant(typeof visual.screenshotPath === 'string' && visual.screenshotPath.startsWith('/'),
    'Mocap browser Lichtblick visual gate screenshot path must be absolute');
  digest(visual.screenshotSha256,'Mocap browser Lichtblick visual gate screenshot digest');
  equal(visual.layoutStateDigest,layout.stateDigest,'Mocap browser Lichtblick visual gate layout digest');
  if (renderer.anchorMode === 'ui-readable') {
    sameStrings(anchors,[MOCAP_DESCRIPTION_PARAMETER,MOCAP_PATH_TOPIC],
      'Mocap browser Lichtblick semantic UI anchors');
  } else {
    equal(renderer.anchorMode,'layout-and-screenshot-manual',
      'Mocap browser Lichtblick semantic fallback mode');
  }
}

function assertVisibleNumber(value,unit,label) {
  const readout = object(value,label);
  finiteNumberString(readout.value,`${label} value`);
  equal(readout.unit,unit,`${label} unit`);
  invariant(readout.visible === true,`${label} is not visible`);
}

function nonPlaceholderString(value,label) {
  nonEmptyString(value,label);
  invariant(value !== '--',`${label} is a placeholder`);
}

function vectorDistance(left,right) {
  return Math.hypot(...['x','y','z'].map((axis) => left[axis]-right[axis]));
}

function normalizedMocapQuaternion(value) {
  const quaternion = Object.fromEntries(['x','y','z','w'].map((axis) => [
    axis,Number.isFinite(value?.[axis]) ? value[axis] : axis === 'w' ? 1 : 0,
  ]));
  const norm = Math.hypot(quaternion.x,quaternion.y,quaternion.z,quaternion.w);
  return norm < 1e-12
    ? { x:0,y:0,z:0,w:1 }
    : Object.fromEntries(Object.entries(quaternion).map(([axis,component]) => [axis,component/norm]));
}

function quaternionRoll(q) {
  return Math.atan2(2*(q.w*q.x+q.y*q.z),1-2*(q.x*q.x+q.y*q.y))*180/Math.PI;
}

function quaternionPitch(q) {
  return Math.asin(clampMocap(2*(q.w*q.y-q.z*q.x),-1,1))*180/Math.PI;
}

function quaternionYaw(q) {
  return Math.atan2(2*(q.w*q.z+q.x*q.y),1-2*(q.y*q.y+q.z*q.z))*180/Math.PI;
}

function clampMocap(value,min,max) {
  return Math.max(min,Math.min(max,value));
}

function normalizeMocapYaw(value) {
  const yaw = value%360;
  return yaw < 0 ? yaw+360 : yaw;
}

function mocapFlightStage(value) {
  return ({ 1:'GND',2:'AIR',3:'TO',4:'LND' })[value] ?? '--';
}

function mocapProtoAxis(value,axis) {
  return Number.isFinite(value?.[axis]) ? value[axis] : 0;
}

function mocapFlightStageLong(value) {
  return ({ 1:'GROUND',2:'AIRBORNE',3:'TAKEOFF',4:'LANDING' })[value] ?? '--';
}

function mocapRateHealth(value,threshold) {
  if (!(value > 0)) return '--';
  return value >= threshold ? 'OK' : 'LO';
}

function mocapCommunicationTone(latency) {
  if (latency === null) return 'info';
  if (latency <= 60) return 'success';
  if (latency <= 100) return 'info';
  if (latency <= 150) return 'warning';
  return 'danger';
}

function mocapBatteryTone(value) {
  const shown = Math.round(value);
  if (shown <= 50) return 'danger';
  if (shown === 51) return 'warning';
  if (shown <= 75) return 'info';
  return 'success';
}

function mocapRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mocapKeysOnly(value,allowed) {
  return mocapRecord(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function mocapCanonicalFrame(value) {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_./-]+$/.test(value)
    && !value.includes('//') && !value.includes('..')
    && !/(?:fs150|mocap_fixture)/i.test(value);
}

function mocapSparseVector(value,required=false) {
  return mocapKeysOnly(value,['x','y','z'])
    && Object.values(value).every((entry) => typeof entry === 'number' && Number.isFinite(entry))
    && (!required || Object.keys(value).length > 0);
}

function mocapFullVector(value) {
  return mocapSparseVector(value) && ['x','y','z'].every((axis) => Number.isFinite(value[axis]));
}

function mocapQuaternion(value) {
  if (!mocapKeysOnly(value,['x','y','z','w']) || Object.keys(value).length === 0
    || !Object.values(value).every((entry) => typeof entry === 'number' && Number.isFinite(entry))) return false;
  const [x,y,z,w] = ['x','y','z','w'].map((axis) => value[axis] ?? 0);
  return x*x + y*y + z*z + w*w > 1e-24;
}

function mocapPoseValue(value) {
  return mocapRecord(value) && mocapCanonicalFrame(value.frameId)
    && value.childFrameId === 'mocap_rotor1/base_link'
    && mocapSparseVector(value.position,true) && mocapQuaternion(value.orientation);
}

function mocapVelocityValue(value) {
  return mocapRecord(value) && mocapCanonicalFrame(value.frameId)
    && value.frameId.startsWith('mocap_rotor1/')
    && mocapFullVector(value.linear) && mocapFullVector(value.angular);
}

function mocapSpeedValue(value) {
  return mocapRecord(value) && mocapCanonicalFrame(value.frameId)
    && value.frameId.startsWith('mocap_rotor1/')
    && typeof value.metersPerSecond === 'number' && Number.isFinite(value.metersPerSecond)
    && value.metersPerSecond >= 0;
}

function mocapImuValue(value) {
  return mocapRecord(value) && mocapCanonicalFrame(value.frameId)
    && value.frameId.startsWith('mocap_rotor1/') && mocapQuaternion(value.orientation)
    && mocapSparseVector(value.angularVelocity) && mocapSparseVector(value.linearAcceleration)
    && ['orientationCovariance','angularVelocityCovariance','linearAccelerationCovariance']
      .every((key) => Array.isArray(value[key]) && value[key].length === 9
        && value[key].every((entry) => typeof entry === 'number' && Number.isFinite(entry)));
}

function mocapPowerValue(value) {
  return mocapRecord(value) && Number.isFinite(value.percentage)
    && (value.percentage === -1 || (value.percentage >= 0 && value.percentage <= 1))
    && Number.isFinite(value.voltageV) && value.voltageV >= 0
    && ['currentA','temperatureC'].every((key) => !Object.hasOwn(value,key) || Number.isFinite(value[key]))
    && (!Object.hasOwn(value,'charging') || typeof value.charging === 'boolean');
}

function mocapHealthValue(value,online) {
  return mocapRecord(value) && typeof value.summary === 'string' && value.summary.length > 0
    && (online ? value.online === true : (!Object.hasOwn(value,'online') || value.online === false));
}

function mocapFlightValue(value) {
  return mocapRecord(value) && typeof value.connected === 'boolean' && typeof value.armed === 'boolean'
    && typeof value.mode === 'string' && value.mode.length > 0;
}

function mocapUint64(value) {
  return (Number.isSafeInteger(value) && value >= 0)
    || (typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value)
      && (value.length < 20 || (value.length === 20 && value <= '18446744073709551615')));
}

function mocapLinkValue(value) {
  return mocapRecord(value) && value.channelId === 'forwarder_hb'
    && Number.isFinite(value.sourceRateHz) && value.sourceRateHz > 0
    && Number.isFinite(value.outputRateHz) && value.outputRateHz > 0
    && (!Object.hasOwn(value,'droppedSamples') || mocapUint64(value.droppedSamples))
    && (!Object.hasOwn(value,'sourceAgeMs') || mocapUint64(value.sourceAgeMs))
    && (!Object.hasOwn(value,'stale') || value.stale === false);
}

function mocapStreamHealthValue(value,offline) {
  if (!mocapRecord(value) || !Array.isArray(value.channels) || value.channels.length !== 8
    || [...new Set(value.channels.map((item) => item?.channelId))].sort().join('\0')
      !== [...MOCAP_STREAM_CHANNELS].sort().join('\0')) return false;
  return value.channels.every((item) => {
    if (!mocapRecord(item) || !MOCAP_STREAM_CHANNELS.includes(item.channelId)
      || (Object.hasOwn(item,'droppedSamples') && !mocapUint64(item.droppedSamples))
      || (Object.hasOwn(item,'sourceAgeMs') && !mocapUint64(item.sourceAgeMs))) return false;
    if (offline) return item.stale === true
      && (!Object.hasOwn(item,'sourceRateHz') || Number.isFinite(item.sourceRateHz) && item.sourceRateHz >= 0)
      && (!Object.hasOwn(item,'outputRateHz') || Number.isFinite(item.outputRateHz) && item.outputRateHz >= 0);
    return Number.isFinite(item.sourceRateHz) && item.sourceRateHz > 0
      && Number.isFinite(item.outputRateHz) && item.outputRateHz > 0
      && (!Object.hasOwn(item,'stale') || item.stale === false);
  });
}

export function assertAdvancingVideo(value,label) {
  const evidence = object(value,label);
  equal(evidence.advancing,true,`${label} advancing flag`);
  const before = object(evidence.before,`${label} before`);
  const after = object(evidence.after,`${label} after`);
  const beforeVideo = object(before.video,`${label} before video`);
  const afterVideo = object(after.video,`${label} after video`);
  const beforeHealth = object(before.health,`${label} before health`);
  const afterHealth = object(after.health,`${label} after health`);
  finite(beforeVideo.currentTime,`${label} before currentTime`);
  finite(afterVideo.currentTime,`${label} after currentTime`);
  invariant(afterVideo.currentTime > beforeVideo.currentTime + 0.2,`${label} video time did not advance`);
  invariant(afterVideo.readyState >= 3,`${label} readyState is below HAVE_FUTURE_DATA`);
  positive(afterVideo.width,`${label} decoded width`);
  positive(afterVideo.height,`${label} decoded height`);
  nonNegative(beforeHealth.bytesReceived,`${label} before bytesReceived`);
  nonNegative(afterHealth.bytesReceived,`${label} after bytesReceived`);
  invariant(afterHealth.bytesReceived > beforeHealth.bytesReceived,`${label} inbound bytes did not advance`);
  equal(afterHealth.active,true,`${label} source active`);
  positiveInteger(afterHealth.consumers,`${label} consumers`);
  positiveInteger(afterHealth.viewers,`${label} viewers`);
}

export function assertAlgorithmOutput(value,label) {
  const output = object(value,label);
  equal(output.exitCode,0,`${label} exitCode`);
  const stdout = nonEmptyString(output.stdoutTail,`${label} stdoutTail`).trim();
  let decoded;
  try { decoded = JSON.parse(stdout); } catch (cause) {
    throw new Error(`${label} stdoutTail is not one JSON document: ${messageOf(cause)}`,{ cause });
  }
  deepEqual(decoded,EXPECTED_ALGORITHM_RESULT,`${label} deterministic result`);
  equal(nonEmptyString(output.stderrTail,`${label} stderrTail`).trim(),EXPECTED_ALGORITHM_STDERR,
    `${label} stderr audit trail`);
}

function assertBrowserAlgorithmJobOutput(value,label) {
  const output = object(value,label);
  id(output.jobId,`${label} jobId`);
  assertAlgorithmOutput(output.result,`${label} result`);
  return output;
}

export function rejectMocapIdentities(value,label) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const identity of FORBIDDEN_MOCAP_IDENTITIES) {
    invariant(!serialized.includes(identity.toLowerCase()),`${label} leaked forbidden identity ${identity}`);
  }
}

function assertB2CameraOwnership(value,expected) {
  const ownership = object(value,'B2 Camera ownership');
  equal(ownership.sourceId,'odin1','B2 Camera ownership sourceId');
  equal(ownership.imageTopic,'/odin1/image/compressed','B2 Camera ownership image topic');
  const canonical = object(ownership.canonical,'B2 canonical Camera ownership');
  equal(canonical.bindingId,'b2-onboard-media','B2 canonical Camera binding');
  equal(canonical.runId,expected.g6MediaRunId,'B2 canonical Camera runId');
  equal(canonical.targetId,B2_TARGET_ID,'B2 canonical Camera target');
  equal(canonical.status,'stopped','B2 canonical Camera terminal status');
  sameStrings(canonical.processDefinitionIds,[
    'xgc-media-edge','xgc2-image-test-publisher','xgc2-ros-image-rtp-adapter',
  ],'B2 canonical Camera process owners');
  const robotTopic = object(ownership.robotTopic,'B2 robot-topic Camera ownership');
  const fixture = object(robotTopic.fixture,'B2 Camera topic fixture ownership');
  equal(fixture.bindingId,'b2-camera-topic-lab-fixture','B2 Camera fixture binding');
  equal(fixture.runId,expected.cameraFixtureRunId,'B2 Camera fixture runId');
  equal(fixture.targetId,B2_TARGET_ID,'B2 Camera fixture target');
  equal(fixture.status,'active','B2 Camera fixture status');
  sameStrings(fixture.processDefinitionIds,['xgc2-image-test-publisher'],
    'B2 Camera fixture process owners');
  const media = object(robotTopic.media,'B2 Camera topic-media ownership');
  equal(media.bindingId,'b2-camera-topic-media','B2 Camera topic-media binding');
  equal(media.runId,expected.cameraMediaRunId,'B2 Camera topic-media runId');
  equal(media.targetId,B2_TARGET_ID,'B2 Camera topic-media target');
  equal(media.status,'active','B2 Camera topic-media status');
  equal(media.sourceId,'odin1','B2 Camera topic-media sourceId');
  equal(media.imageTopic,'/odin1/image/compressed','B2 Camera topic-media image topic');
  sameStrings(media.processDefinitionIds,['xgc-media-edge','xgc2-ros-image-rtp-adapter'],
    'B2 Camera topic-media process owners');
}

function assertSession(sessionValue,expected,label) {
  const session = object(sessionValue,`${label} Session`);
  equal(session.id,expected.sessionId,`${label} Session id`);
  equal(session.experimentResourceId,expected.experimentId,`${label} Session Experiment`);
  equal(session.targetId,expected.dashboardTargetId,`${label} Session target`);
  equal(session.state,'active',`${label} Session state`);
}

function assertFiniteB2Run(ledger,expected,contract) {
  const run = exactRun(ledger.runs,contract.runId,contract.label);
  equal(run.targetId,B2_TARGET_ID,`B2 ${contract.label} target`);
  equal(run.automationResourceId,contract.resourceId,`B2 ${contract.label} Automation`);
  equal(run.status,'succeeded',`B2 ${contract.label} run status`);
  assertExperimentRunRefs(run,expected.experimentId,contract.resourceId,`B2 ${contract.label}`);
  const member = exactMember(ledger.members,expected.sessionId,contract.bindingId,contract.runId,contract.label);
  equal(member.targetId,expected.dashboardTargetId,`B2 ${contract.label} Session member target`);
  equal(member.status,'succeeded',`B2 ${contract.label} member status`);
  const nodes = array(run.nodeSummaries,`B2 ${contract.label} node summaries`);
  const matching = nodes.filter((node) => node?.nodeId === contract.nodeId);
  equal(matching.length,1,`B2 ${contract.label} ${contract.nodeId} node count`);
  const node = object(matching[0],`B2 ${contract.label} ${contract.nodeId} node`);
  equal(node.status,'succeeded',`B2 ${contract.label} ${contract.nodeId} status`);
  object(node.output,`B2 ${contract.label} ${contract.nodeId} output`);
  return { run,member,node };
}

function assertLocalSessionChildRun(ledger,expected,contract) {
  const run = exactRun(ledger.runs,contract.runId,contract.label);
  equal(run.targetId,contract.targetId,`${contract.label} target`);
  equal(run.automationResourceId,contract.resourceId,`${contract.label} Automation`);
  invariant(ACTIVE_STATUS.has(run.status),`${contract.label} run is not active`);
  assertAutomationRunRefs(run,contract.resourceId,contract.label);
  equal(run.rootRunId,ledger.session.openingRunId,`${contract.label} rootRunId`);
  equal(run.parentRunId,ledger.session.openingRunId,`${contract.label} parentRunId`);
  equal(run.callNodeId,'dispatch-all',`${contract.label} call node`);
  equal(run.depth,1,`${contract.label} depth`);
  equal(run.correlationId,ledger.session.openingRunId,`${contract.label} correlation id`);
  assertAutomationCallTrigger(
    run.triggerInvocation,ledger.session.openingRunId,`${contract.label} trigger invocation`,
  );
  const member = exactMember(ledger.members,expected.sessionId,contract.bindingId,contract.runId,contract.label);
  equal(member.targetId,expected.dashboardTargetId,`${contract.label} Session member target`);
  invariant(ACTIVE_STATUS.has(member.status),`${contract.label} member is not active`);
}

function assertMocapOnboardRuntime(ledger,expected) {
  const parent = exactRun(ledger.runs,expected.onboardRunId,'Mocap onboard parent');
  equal(parent.targetId,MOCAP_TARGET_ID,'Mocap onboard parent target');
  equal(parent.automationResourceId,expected.onboardResourceId,'Mocap onboard parent Automation');
  equal(parent.status,'succeeded','Mocap onboard parent run status');
  assertExperimentRunRefs(parent,expected.experimentId,expected.onboardResourceId,'Mocap onboard parent');
  const sessionMember = exactMember(
    ledger.members,expected.sessionId,'mocap-onboard',expected.onboardRunId,'Mocap onboard parent',
  );
  equal(sessionMember.targetId,expected.dashboardTargetId,'Mocap onboard Session member target');
  invariant(ACTIVE_STATUS.has(sessionMember.status),'Mocap onboard Session member is not active');

  const runtime = object(ledger.onboardRuntime,'Mocap onboard runtime proof');
  sameStrings(Object.keys(runtime),[
    'parentRunId','childRunId','callInvocationId','targetId','automationResourceId',
    'childRun','relation','group','member',
  ],'Mocap onboard runtime proof fields');
  equal(runtime.parentRunId,parent.id,'Mocap onboard runtime parent runId');
  invariant(runtime.childRunId !== runtime.parentRunId,'Mocap onboard runtime reused the parent as its child');
  equal(runtime.childRunId,expected.onboardRuntimeRunId,'Mocap onboard runtime child runId');
  id(runtime.callInvocationId,'Mocap onboard runtime call invocation id');
  equal(runtime.targetId,MOCAP_TARGET_ID,'Mocap onboard runtime target');
  id(runtime.automationResourceId,'Mocap onboard runtime Automation resource id');

  const child = object(runtime.childRun,'Mocap onboard child Run');
  sameStrings(Object.keys(child),[
    'id','targetId','automationResourceId','status','result','sourceKind','sourceRef','automationRef',
    'definitionId','definitionVersion','configDigest','executionPlanDigest','registryDigest','definitionDigest',
    'parentRunId','rootRunId','callNodeId','depth','correlationId','triggerInvocation',
  ],'Mocap onboard child Run fields');
  equal(child.id,runtime.childRunId,'Mocap onboard child Run id');
  equal(child.targetId,runtime.targetId,'Mocap onboard child target');
  equal(child.automationResourceId,runtime.automationResourceId,'Mocap onboard child Automation');
  equal(child.status,'waiting','Mocap onboard child run status');
  object(child.result,'Mocap onboard child result');
  equal(child.sourceKind,'automation','Mocap onboard child sourceKind');
  pinnedRef(child.sourceRef,'automation',runtime.automationResourceId,'Mocap onboard child sourceRef');
  pinnedRef(child.automationRef,'automation',runtime.automationResourceId,'Mocap onboard child automationRef');
  deepEqual(child.sourceRef,child.automationRef,'Mocap onboard child protected refs');
  id(child.definitionId,'Mocap onboard child definition id');
  positiveInteger(child.definitionVersion,'Mocap onboard child definition version');
  for (const key of ['configDigest','executionPlanDigest','registryDigest','definitionDigest']) {
    digest(child[key],`Mocap onboard child ${key}`);
  }
  equal(child.parentRunId,runtime.parentRunId,'Mocap onboard child parentRunId');
  equal(child.rootRunId,runtime.parentRunId,'Mocap onboard child rootRunId');
  equal(child.callNodeId,'mocap-runtimes','Mocap onboard child call node');
  equal(child.depth,1,'Mocap onboard child depth');
  equal(child.correlationId,runtime.parentRunId,'Mocap onboard child correlation id');
  assertAutomationCallTrigger(
    child.triggerInvocation,runtime.parentRunId,'Mocap onboard child trigger invocation',
  );

  const relation = object(runtime.relation,'Mocap onboard child relation');
  sameStrings(Object.keys(relation),[
    'parentRunId','parentInvocationId','callNodeId','ordinal','childRunId','ownerRunId',
    'childDefinitionId','childDefinitionVersion','childConfigDigest','childExecutionPlanDigest',
    'childRegistryDigest','childDefinitionDigest','triggerNodeId','relation','waitPolicy',
    'cancelPolicy','resultPolicy',
  ],'Mocap onboard child relation fields');
  equal(relation.parentRunId,runtime.parentRunId,'Mocap onboard relation parent runId');
  equal(relation.parentInvocationId,runtime.callInvocationId,'Mocap onboard relation invocation');
  equal(relation.callNodeId,child.callNodeId,'Mocap onboard relation call node');
  equal(relation.ordinal,0,'Mocap onboard relation ordinal');
  equal(relation.childRunId,runtime.childRunId,'Mocap onboard relation child runId');
  equal(relation.ownerRunId,runtime.parentRunId,'Mocap onboard relation owner runId');
  equal(relation.childDefinitionId,child.definitionId,'Mocap onboard relation definition id');
  equal(relation.childDefinitionVersion,child.definitionVersion,'Mocap onboard relation definition version');
  for (const [relationKey,childKey] of [
    ['childConfigDigest','configDigest'],['childExecutionPlanDigest','executionPlanDigest'],
    ['childRegistryDigest','registryDigest'],['childDefinitionDigest','definitionDigest'],
  ]) equal(relation[relationKey],child[childKey],`Mocap onboard relation ${relationKey}`);
  equal(relation.triggerNodeId,'called','Mocap onboard relation trigger node');
  equal(relation.relation,'attached','Mocap onboard relation type');
  equal(relation.waitPolicy,'wait','Mocap onboard relation wait policy');
  equal(relation.cancelPolicy,'cascade','Mocap onboard relation cancel policy');
  equal(relation.resultPolicy,'propagate','Mocap onboard relation result policy');

  const group = object(runtime.group,'Mocap onboard child group');
  sameStrings(Object.keys(group),[
    'id','targetId','rootRunId','parentRunId','producerInvocationId','producerNodeId','groupKey',
    'expectedMembers','memberCount','membershipDigest','waitPolicy','joinMode','failurePolicy',
    'remainingPolicy','resultPolicy','maxConcurrency','state','outcome','terminalCount',
  ],'Mocap onboard child group fields');
  id(group.id,'Mocap onboard child group id');
  equal(group.targetId,runtime.targetId,'Mocap onboard child group target');
  equal(group.rootRunId,runtime.parentRunId,'Mocap onboard child group root runId');
  equal(group.parentRunId,runtime.parentRunId,'Mocap onboard child group parent runId');
  equal(group.producerInvocationId,runtime.callInvocationId,'Mocap onboard child group invocation');
  equal(group.producerNodeId,child.callNodeId,'Mocap onboard child group producer node');
  equal(group.groupKey,'automation-call:fan-out','Mocap onboard child group key');
  equal(group.expectedMembers,1,'Mocap onboard child group expected members');
  equal(group.memberCount,1,'Mocap onboard child group member count');
  tokenDigest(group.membershipDigest,'Mocap onboard child group membership digest');
  equal(group.waitPolicy,'wait','Mocap onboard child group wait policy');
  equal(group.joinMode,'join-all','Mocap onboard child group join mode');
  equal(group.failurePolicy,'fail-fast','Mocap onboard child group failure policy');
  equal(group.remainingPolicy,'cancel','Mocap onboard child group remaining policy');
  equal(group.resultPolicy,'propagate','Mocap onboard child group result policy');
  equal(group.maxConcurrency,1,'Mocap onboard child group max concurrency');
  equal(group.state,'resolved','Mocap onboard child group state');
  equal(group.outcome,'succeeded','Mocap onboard child group outcome');
  equal(group.terminalCount,1,'Mocap onboard child group terminal count');

  const member = object(runtime.member,'Mocap onboard child group member');
  sameStrings(Object.keys(member),[
    'id','groupId','ordinal','itemKey','childRunId','state',
  ],'Mocap onboard child group member fields');
  id(member.id,'Mocap onboard child group member id');
  equal(member.groupId,group.id,'Mocap onboard member group id');
  equal(member.ordinal,0,'Mocap onboard member ordinal');
  equal(member.itemKey,MOCAP_ROBOT_ID,'Mocap onboard member Robot id');
  equal(member.childRunId,runtime.childRunId,'Mocap onboard member child runId');
  equal(member.state,'terminal','Mocap onboard member state');
}

function assertExperimentRunRefs(run,experimentId,automationId,label) {
  equal(run.sourceKind,'experiment',`${label} sourceKind`);
  pinnedRef(run.sourceRef,'experiment',experimentId,`${label} sourceRef`);
  pinnedRef(run.automationRef,'automation',automationId,`${label} automationRef`);
}

function assertAutomationRunRefs(run,automationId,label) {
  equal(run.sourceKind,'automation',`${label} sourceKind`);
  pinnedRef(run.sourceRef,'automation',automationId,`${label} sourceRef`);
  pinnedRef(run.automationRef,'automation',automationId,`${label} automationRef`);
  deepEqual(run.sourceRef,run.automationRef,`${label} protected refs`);
}

function assertAutomationCallTrigger(value,parentRunId,label) {
  const trigger = object(value,label);
  sameStrings(Object.keys(trigger),[
    'eventId','nodeId','kind','sessionId','occurredAt',
  ],`${label} fields`);
  id(trigger.eventId,`${label} event id`);
  equal(trigger.nodeId,'called',`${label} node`);
  equal(trigger.kind,'trigger.automation-call',`${label} kind`);
  equal(trigger.sessionId,parentRunId,`${label} sessionId`);
  timestamp(trigger.occurredAt,`${label} time`);
}

function assertRosTile(value,runId,label) {
  const tile = object(value,`${label} tile`);
  invariant(READY_SERVICE_STATUS.has(tile.status),`${label} tile is neither ready nor running`);
  equal(tile.running,'true',`${label} tile running state`);
  equal(tile.runId,runId,`${label} tile runId`);
  id(tile.runId,`${label} tile runId`);
}

function assertBrowserWorkflow(value,expected,contract) {
  const workflow = object(value,`B2 browser ${contract.label} workflow`);
  equal(workflow.resourceId,contract.resourceId,`B2 browser ${contract.label} resourceId`);
  includes(workflow.controlAria,B2_TARGET_ID,`B2 browser ${contract.label} fixed target`);
  const history = object(workflow.history,`B2 browser ${contract.label} history`);
  equal(history.runId,contract.runId,`B2 browser ${contract.label} history runId`);
  equal(history.source,`Experiment: ${expected.experimentId}`,`B2 browser ${contract.label} history source`);
  equal(history.nodeId,contract.nodeId,`B2 browser ${contract.label} history nodeId`);
  equal(history.nodeStatus,'succeeded',`B2 browser ${contract.label} history node status`);
  equal(history.outputExpanded,true,`B2 browser ${contract.label} output expanded`);
  equal(history.outputVisible,true,`B2 browser ${contract.label} output visible`);
  object(history.nodeOutput,`B2 browser ${contract.label} node output`);
}

function assertStoppedVideo(value,label) {
  const evidence = object(value,label);
  equal(evidence.bytesStopped,true,`${label} bytesStopped`);
  const before = object(evidence.before,`${label} before`);
  const after = object(evidence.after,`${label} after`);
  nonNegative(before.health?.bytesReceived,`${label} before bytesReceived`);
  equal(after.health?.bytesReceived,before.health.bytesReceived,`${label} stopped bytes`);
  finite(before.video?.currentTime,`${label} before currentTime`);
  finite(after.video?.currentTime,`${label} after currentTime`);
  invariant(after.video.currentTime <= before.video.currentTime + 0.1,`${label} video kept advancing`);
}

function exactRun(runs,runId,label) {
  id(runId,`${label} runId`);
  const matches = runs.filter((run) => run?.id === runId);
  equal(matches.length,1,`${label} exact run count`);
  return object(matches[0],`${label} run`);
}

function exactMember(members,sessionId,bindingId,ownerId,label) {
  const matches = members.filter((member) => member?.sessionId === sessionId
    && member?.bindingId === bindingId && member?.kind === 'workflow_run' && member?.ownerId === ownerId);
  equal(matches.length,1,`${label} exact Session member count`);
  return object(matches[0],`${label} Session member`);
}

function pinnedRef(value,domain,resourceId,label) {
  const ref = object(value,label);
  equal(ref.domain,domain,`${label} domain`);
  equal(ref.resourceId,resourceId,`${label} resourceId`);
  equal(ref.branch,'main',`${label} branch`);
  id(ref.commitId,`${label} commitId`);
  positiveInteger(ref.version,`${label} version`);
  digest(ref.digest,`${label} digest`);
}

function deepValuesForKey(value,key) {
  if (Array.isArray(value)) return value.flatMap((item) => deepValuesForKey(item,key));
  if (!value || typeof value !== 'object') return [];
  const entries = Object.entries(value);
  return entries.flatMap(([name,item]) => [
    ...(name === key ? [item] : []),
    ...deepValuesForKey(item,key),
  ]);
}

function stableJSON(value) {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJSON(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function noPageErrors(value,label) {
  const errors = array(value,`${label} page errors`);
  equal(errors.length,0,`${label} page error count`);
}

function assertPanelRoster(value,expected,label) {
  const roster = object(value,`${label} panel roster`);
  sameStrings(roster.asset,expected.asset,`${label} Asset dashboard panel ids`);
  sameStrings(roster.gcs,expected.gcs,`${label} GCS dashboard panel ids`);
}

function sameStrings(value,expected,label) {
  const values = array(value,label);
  invariant(values.every((item) => typeof item === 'string'),`${label} must contain strings`);
  deepEqual([...values].sort(),[...expected].sort(),label);
}

function object(value,label) {
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value),`${label} must be an object`);
  return value;
}

function array(value,label) {
  invariant(Array.isArray(value),`${label} must be an array`);
  return value;
}

function nonEmptyString(value,label) {
  invariant(typeof value === 'string' && value.trim().length > 0,`${label} must be a non-empty string`);
  return value;
}

function id(value,label) {
  invariant(typeof value === 'string' && ID_PATTERN.test(value),`${label} is not a canonical id`);
  return value;
}

function digest(value,label) {
  invariant(typeof value === 'string' && DIGEST_PATTERN.test(value),`${label} is not a sha256 digest`);
  return value;
}

function tokenDigest(value,label) {
  invariant(typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value),
    `${label} is not a sha256 token digest`);
  return value;
}

function finite(value,label) {
  invariant(typeof value === 'number' && Number.isFinite(value),`${label} must be finite`);
  return value;
}

function finiteNumberString(value,label) {
  invariant(typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)),
    `${label} must be a finite numeric attribute`);
}

function positive(value,label) {
  finite(value,label);
  invariant(value > 0,`${label} must be positive`);
  return value;
}

function nonNegative(value,label) {
  finite(value,label);
  invariant(value >= 0,`${label} must be non-negative`);
  return value;
}

function positiveInteger(value,label) {
  invariant(Number.isInteger(value) && value > 0,`${label} must be a positive integer`);
  return value;
}

function nonNegativeInteger(value,label) {
  invariant(Number.isInteger(value) && value >= 0,`${label} must be a non-negative integer`);
  return value;
}

function timestamp(value,label) {
  nonEmptyString(value,label);
  const parsed = Date.parse(value);
  invariant(Number.isFinite(parsed),`${label} must be an ISO timestamp`);
  return parsed;
}

function includes(value,needle,label) {
  invariant(typeof value === 'string' && value.includes(needle),`${label} must contain ${needle}`);
}

function equal(actual,expected,label) {
  invariant(Object.is(actual,expected),`${label} must equal ${JSON.stringify(expected)}; got ${JSON.stringify(actual)}`);
}

function deepEqual(actual,expected,label) {
  invariant(stableJSON(actual) === stableJSON(expected),`${label} does not match the canonical value`);
}

function invariant(condition,message) {
  if (!condition) throw new Error(message);
}

function messageOf(cause) {
  return cause instanceof Error ? cause.message : String(cause);
}
