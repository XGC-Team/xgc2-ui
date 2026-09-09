import assert from 'node:assert/strict';
import test from 'node:test';
import {
  B2_ASSET_ID,
  B2_ROBOT_ID,
  B2_TARGET_ID,
  MOCAP_ASSET_ID,
  MOCAP_DESCRIPTION_PARAMETER,
  MOCAP_NAMESPACE,
  MOCAP_PATH_GRADIENT,
  MOCAP_PATH_TOPIC,
  MOCAP_ROBOT_ID,
  MOCAP_TARGET_ID,
  assertB2BrowserEvidence,
  assertB2Ledger,
  assertG4B2Evidence,
  assertG6B2Evidence,
  assertMocapBrowserEvidence,
  assertMocapLayout,
  assertMocapLedger,
  assertMocapTransitionEvidence,
  digestEvidence,
} from './browser-evidence-contract.mjs';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const DIGEST_C = 'c'.repeat(64);
const EXPECTED_ALGORITHM = {
  algorithm:'integer-summary-v1',
  input:[3,1,4,1,5],
  result:{ count:5,sum:14,sumOfSquares:52 },
};
const EXPECTED_STDERR = [
  'xgc2-safe-algorithm: starting deterministic integer summary',
  'xgc2-safe-algorithm: completed count=5',
].join('\n');

const b2Expected = {
  experimentId:'experiment-b2',
  sessionId:'session-b2',
  projectionRunId:'projection-run',
  roscoreRunId:'roscore-run',
  adaptersRunId:'adapters-run',
  serviceResourceId:'service-resource',
  serviceRunId:'service-run',
  algorithmResourceId:'algorithm-resource',
  algorithmRunId:'algorithm-run',
  g6MediaRunId:'canonical-media-run',
  cameraFixtureRunId:'camera-fixture-run',
  cameraMediaRunId:'camera-media-run',
  dashboardTargetId:'local',
};

const mocapExpected = {
  experimentId:'experiment-mocap',
  sessionId:'session-mocap',
  onboardRunId:'mocap-onboard-run',
  onboardRuntimeRunId:'mocap-onboard-child-run',
  projectionRunId:'mocap-projection-run',
  onboardResourceId:'mocap-onboard-resource',
  adaptersResourceId:'mocap-adapters-resource',
  dashboardTargetId:'local',
  adapterRelease:{
    package:'ros-noetic-xgc2-mocap-rotor-adapter',packageArchitecture:'amd64',
    packageVersion:`0.5.0-17+xgc2dev.${DIGEST_A.slice(0,12)}`,
    sourceDigest:DIGEST_A,localDebSha256:DIGEST_C,
  },
  trajectoryRelease:{
    scope:'agent-internal-fixture',targetId:MOCAP_TARGET_ID,
    package:'xgc2-dev-lab-mocap-fs150-trajectory-source',packageArchitecture:'all',
    packageVersion:`0.1.0-1~xgc2dev.${DIGEST_B.slice(0,12)}`,
    sourcePath:'products/xgc2/dev-lab/mocap-fs150-trajectory-source/xgc2_mocap_fs150_trajectory_source_node.py',
    sourceDigest:DIGEST_B,
    installedNode:'/opt/ros/noetic/lib/xgc2_dev_lab_mocap_fs150_trajectory_source/xgc2_mocap_fs150_trajectory_source_node',
    contract:'xgc2-dev-lab-mocap-fs150-trajectory/v1',localDebSha256:DIGEST_A,
  },
};

test('B2 contract accepts pinned finite commands, strict G4/G6, and all live panels',() => {
  assert.doesNotThrow(() => assertB2Ledger(b2Ledger(),b2Expected));
  assert.doesNotThrow(() => assertG4B2Evidence(g4Evidence(),b2Expected));
  assert.doesNotThrow(() => assertG6B2Evidence(g6Evidence(),b2Expected));
  assert.doesNotThrow(() => assertB2BrowserEvidence(b2BrowserEvidence(),b2Expected));
});

test('B2 ledger rejects non-terminal commands, unpinned source truth, and crossed Camera owners',() => {
  const waiting = b2Ledger();
  waiting.runs[0].status = 'waiting';
  assert.throws(() => assertB2Ledger(waiting,b2Expected),/run status/);

  const unpinned = b2Ledger();
  unpinned.runs[0].sourceRef.digest = 'not-a-digest';
  assert.throws(() => assertB2Ledger(unpinned,b2Expected),/sha256 digest/);

  const crossed = b2Ledger();
  crossed.cameraOwnership.robotTopic.media.processDefinitionIds.push('xgc2-image-test-publisher');
  assert.throws(() => assertB2Ledger(crossed,b2Expected),/topic-media process owners/);

  const inventedMemberTarget = b2Ledger();
  inventedMemberTarget.members[0].targetId = B2_TARGET_ID;
  assert.throws(() => assertB2Ledger(inventedMemberTarget,b2Expected),/Session member target/);

  const resultAsLifecycle = b2Ledger();
  resultAsLifecycle.orchestrationLifecycleLogs[b2Expected.algorithmRunId].stdout = JSON.stringify(EXPECTED_ALGORITHM);
  assert.throws(() => assertB2Ledger(resultAsLifecycle,b2Expected),/lifecycle stdout/);

  const inventedResultSource = b2Ledger();
  inventedResultSource.algorithmJob.source = 'job-log-endpoint';
  assert.throws(() => assertB2Ledger(inventedResultSource,b2Expected),/Job source/);

  const wrappedApiSummary = b2Ledger();
  const apiAlgorithm = wrappedApiSummary.runs.find((run) => run.id === b2Expected.algorithmRunId);
  apiAlgorithm.nodeSummaries[0].output = { jobId:'job-algorithm',result:apiAlgorithm.nodeSummaries[0].output };
  assert.throws(() => assertB2Ledger(wrappedApiSummary,b2Expected),/exitCode/);
});

test('B2 browser contract rejects loaded-only surfaces, panel roster drift, and non-decoding video',() => {
  const loadedOnly = b2BrowserEvidence();
  loadedOnly.lichtblick.canvasCount = 0;
  assert.throws(() => assertB2BrowserEvidence(loadedOnly,b2Expected),/canvas count/);

  const hiddenTile = b2BrowserEvidence();
  hiddenTile.ros.tileIds.push('gzserver');
  hiddenTile.ros.hiddenIds.push('gzserver');
  assert.throws(() => assertB2BrowserEvidence(hiddenTile,b2Expected),/visible ROS tile ids/);

  const undecoded = b2BrowserEvidence();
  undecoded.camera.video.after.video.readyState = 2;
  assert.throws(() => assertB2BrowserEvidence(undecoded,b2Expected),/HAVE_FUTURE_DATA/);

  const crossedMediaOwner = b2BrowserEvidence();
  crossedMediaOwner.camera.mediaBindingId = 'b2-onboard-media';
  assert.throws(() => assertB2BrowserEvidence(crossedMediaOwner,b2Expected),/media binding id/);

  const extraPanel = b2BrowserEvidence();
  extraPanel.panelRoster.gcs.push('operator-extra');
  assert.throws(() => assertB2BrowserEvidence(extraPanel,b2Expected),/GCS dashboard panel ids/);

  const missingPanel = b2BrowserEvidence();
  missingPanel.panelRoster.gcs = missingPanel.panelRoster.gcs.filter((id) => id !== 'camera-video');
  assert.throws(() => assertB2BrowserEvidence(missingPanel,b2Expected),/GCS dashboard panel ids/);

  const collapsedResult = b2BrowserEvidence();
  collapsedResult.automation.service.history.outputVisible = false;
  assert.throws(() => assertB2BrowserEvidence(collapsedResult,b2Expected),/output visible/);

  const crossedResultStream = b2BrowserEvidence();
  crossedResultStream.automation.algorithm.jobLogs.stdout = 'orchestration lifecycle';
  assert.throws(() => assertB2BrowserEvidence(crossedResultStream,b2Expected),/Job stdout/);

  const unwrappedBrowserJob = b2BrowserEvidence();
  unwrappedBrowserJob.automation.algorithm.history.nodeOutput = {
    exitCode:0,stdoutTail:JSON.stringify(EXPECTED_ALGORITHM),stderrTail:EXPECTED_STDERR,
  };
  assert.throws(() => assertB2BrowserEvidence(unwrappedBrowserJob,b2Expected),/jobId/);
});

test('Mocap contract accepts canonical Asset, recovered readouts, and audited URDF/Path renderer state',() => {
  assert.doesNotThrow(() => assertMocapLedger(mocapLedger(),mocapExpected));
  assert.doesNotThrow(() => assertMocapLayout(mocapLayout()));
  assert.doesNotThrow(() => assertMocapTransitionEvidence(mocapTransition(),mocapExpected));
  assert.doesNotThrow(() => assertMocapBrowserEvidence(
    mocapBrowserEvidence(),mocapExpected,mocapTransition(),mocapLayout(),mocapLedger(),
  ));

  const sparseZeroBrowser = mocapBrowserEvidence();
  delete sparseZeroBrowser.instrument.projectionAudit.channelSnapshot['state.pose'].value.position.x;
  sparseZeroBrowser.instrument.readouts.hud.position.x = '0.0';
  assert.doesNotThrow(() => assertMocapBrowserEvidence(
    sparseZeroBrowser,mocapExpected,mocapTransition(),mocapLayout(),mocapLedger(),
  ));
});

test('Mocap contract rejects fixture identity, generic URDF, and recovery without path growth',() => {
  const inventedMemberTarget = mocapLedger();
  inventedMemberTarget.members[0].targetId = MOCAP_TARGET_ID;
  assert.throws(() => assertMocapLedger(inventedMemberTarget,mocapExpected),/Session member target/);

  const waitingParent = mocapLedger();
  waitingParent.runs.find((run) => run.id === mocapExpected.onboardRunId).status = 'waiting';
  assert.throws(() => assertMocapLedger(waitingParent,mocapExpected),/parent run status/);

  const experimentSourcedAdapter = mocapLedger();
  experimentSourcedAdapter.runs.find((run) => run.id === mocapExpected.projectionRunId).sourceKind =
    'experiment';
  assert.throws(() => assertMocapLedger(experimentSourcedAdapter,mocapExpected),/sourceKind/);

  const crossedAdapterSourceRef = mocapLedger();
  crossedAdapterSourceRef.runs.find((run) => run.id === mocapExpected.projectionRunId).sourceRef =
    pinnedRef('automation','another-adapter-resource');
  assert.throws(() => assertMocapLedger(crossedAdapterSourceRef,mocapExpected),/sourceRef resourceId/);

  const crossedAdapterParent = mocapLedger();
  crossedAdapterParent.runs.find((run) => run.id === mocapExpected.projectionRunId).parentRunId =
    'another-opening-run';
  assert.throws(() => assertMocapLedger(crossedAdapterParent,mocapExpected),/parentRunId/);

  const wrongAdapterCallNode = mocapLedger();
  wrongAdapterCallNode.runs.find((run) => run.id === mocapExpected.projectionRunId).callNodeId =
    'another-dispatch';
  assert.throws(() => assertMocapLedger(wrongAdapterCallNode,mocapExpected),/call node/);

  const crossedAdapterTrigger = mocapLedger();
  crossedAdapterTrigger.runs.find((run) => run.id === mocapExpected.projectionRunId)
    .triggerInvocation.sessionId = 'another-opening-run';
  assert.throws(() => assertMocapLedger(crossedAdapterTrigger,mocapExpected),/trigger invocation sessionId/);

  const succeededChild = mocapLedger();
  succeededChild.onboardRuntime.childRun.status = 'succeeded';
  assert.throws(() => assertMocapLedger(succeededChild,mocapExpected),/child run status/);

  const crossedChildTrigger = mocapLedger();
  crossedChildTrigger.onboardRuntime.childRun.triggerInvocation.sessionId = 'another-parent-run';
  assert.throws(() => assertMocapLedger(crossedChildTrigger,mocapExpected),/trigger invocation sessionId/);

  const missingChild = mocapLedger();
  delete missingChild.onboardRuntime.childRun;
  assert.throws(() => assertMocapLedger(missingChild,mocapExpected),/runtime proof fields/);

  const wrongChildTarget = mocapLedger();
  wrongChildTarget.onboardRuntime.childRun.targetId = 'local';
  assert.throws(() => assertMocapLedger(wrongChildTarget,mocapExpected),/child target/);

  const reusedParent = mocapLedger();
  reusedParent.onboardRuntime.childRunId = mocapExpected.onboardRunId;
  assert.throws(() => assertMocapLedger(reusedParent,mocapExpected),/reused the parent/);

  const leakedLedger = mocapLedger();
  leakedLedger.diagnostic = 'FS150';
  assert.throws(() => assertMocapLedger(leakedLedger,mocapExpected),/forbidden identity/);

  const missingAdapterRelease = mocapLedger();
  delete missingAdapterRelease.adapterRelease;
  assert.throws(() => assertMocapLedger(missingAdapterRelease,mocapExpected),/release provenance/);

  const driftedAdapterVersion = mocapLedger();
  driftedAdapterVersion.adapterRelease.packageVersion = '0.5.0-17+xgc2dev.deadbeefcafe';
  assert.throws(() => assertMocapLedger(driftedAdapterVersion,mocapExpected),/package version/);

  const wrongAdapterArchitecture = mocapLedger();
  wrongAdapterArchitecture.adapterRelease.packageArchitecture = 'arm64';
  assert.throws(() => assertMocapLedger(wrongAdapterArchitecture,mocapExpected),/package architecture/);

  const shortDebDigest = mocapLedger();
  shortDebDigest.adapterRelease.localDebSha256 = 'abc';
  assert.throws(() => assertMocapLedger(shortDebDigest,mocapExpected),/Debian digest/);

  const internallyConsistentStaleRelease = mocapLedger();
  internallyConsistentStaleRelease.adapterRelease.sourceDigest = DIGEST_B;
  internallyConsistentStaleRelease.adapterRelease.packageVersion =
    `0.5.0-17+xgc2dev.${DIGEST_B.slice(0,12)}`;
  internallyConsistentStaleRelease.adapterRelease.localDebSha256 = DIGEST_B;
  assert.throws(() => assertMocapLedger(internallyConsistentStaleRelease,mocapExpected),
    /versus frozen provenance/);

  const missingTrajectoryRelease = mocapLedger();
  delete missingTrajectoryRelease.trajectoryRelease;
  assert.throws(() => assertMocapLedger(missingTrajectoryRelease,mocapExpected),
    /trajectory release provenance/);

  const wrongTrajectoryScope = mocapLedger();
  wrongTrajectoryScope.trajectoryRelease.scope = 'operator-visible';
  assert.throws(() => assertMocapLedger(wrongTrajectoryScope,mocapExpected),
    /trajectory release scope/);

  const wrongTrajectoryTarget = mocapLedger();
  wrongTrajectoryTarget.trajectoryRelease.targetId = 'local';
  assert.throws(() => assertMocapLedger(wrongTrajectoryTarget,mocapExpected),
    /trajectory release target/);

  const staleTrajectoryRelease = mocapLedger();
  staleTrajectoryRelease.trajectoryRelease.sourceDigest = DIGEST_C;
  staleTrajectoryRelease.trajectoryRelease.packageVersion =
    `0.1.0-1~xgc2dev.${DIGEST_C.slice(0,12)}`;
  staleTrajectoryRelease.trajectoryRelease.localDebSha256 = DIGEST_C;
  assert.throws(() => assertMocapLedger(staleTrajectoryRelease,mocapExpected),
    /trajectory release versus frozen provenance/);

  const leakedOutsideTrajectoryRelease = mocapLedger();
  leakedOutsideTrajectoryRelease.runtimeDiagnostic =
    'xgc2-dev-lab-mocap-fs150-trajectory-source';
  assert.throws(() => assertMocapLedger(leakedOutsideTrajectoryRelease,mocapExpected),
    /forbidden identity/);

  const leaked = mocapBrowserEvidence();
  leaked.instrument.text = 'Mocap Rotor 01 FS150';
  assert.throws(() => assertMocapBrowserEvidence(
    leaked,mocapExpected,mocapTransition(),mocapLayout(),mocapLedger(),
  ),/forbidden identity/);

  const genericLayout = mocapLayout();
  genericLayout.configById['3D!xgc2'].layers['xgc2-urdf-mocap_rotor1'].parameter = '/robot_description';
  assert.throws(() => assertMocapLayout(genericLayout),/URDF parameter/);

  const staleRecovery = mocapTransition();
  staleRecovery.recovered.pathPoseCount = staleRecovery.offline.pathPoseCount;
  assert.throws(() => assertMocapTransitionEvidence(staleRecovery,mocapExpected),/poses did not grow/);

  const missingForwarder = mocapTransition();
  delete missingForwarder.forwarderIdentity;
  assert.throws(() => assertMocapTransitionEvidence(missingForwarder,mocapExpected),/forwarder identity/);

  const missingChannel = mocapTransition();
  delete missingChannel.offline.channelSnapshot['state.pose'];
  assert.throws(() => assertMocapTransitionEvidence(missingChannel,mocapExpected),/exact channel ids/);

  const emptyPose = mocapTransition();
  emptyPose.offline.channelSnapshot['state.pose'].value = {};
  assert.throws(() => assertMocapTransitionEvidence(emptyPose,mocapExpected),/state.pose is empty/);

  const emptyImu = mocapTransition();
  emptyImu.recovered.channelSnapshot['state.imu'].value = {};
  assert.throws(() => assertMocapTransitionEvidence(emptyImu,mocapExpected),/state.imu is empty/);

  const staleSequence = mocapTransition();
  staleSequence.recovered.channelSnapshot['state.velocity'].sequence =
    staleSequence.offline.channelSnapshot['state.velocity'].sequence;
  assert.throws(() => assertMocapTransitionEvidence(staleSequence,mocapExpected),/sequence did not advance/);

  const neverRecovered = mocapTransition();
  neverRecovered.recovered.channelSnapshot['state.pose'].stale = true;
  assert.throws(() => assertMocapTransitionEvidence(neverRecovered,mocapExpected),/stale state/);

  const parentOwnedTransition = mocapTransition();
  parentOwnedTransition.onboardRuntimeRunId = mocapExpected.onboardRunId;
  assert.throws(() => assertMocapTransitionEvidence(parentOwnedTransition,mocapExpected),
    /runtime runId/);

  const shortPath = mocapTransition();
  shortPath.offline.pathExtentMeters = 0.01;
  assert.throws(() => assertMocapTransitionEvidence(shortPath,mocapExpected),/extent must exceed/);

  const stationaryPath = mocapTransition();
  stationaryPath.recovered.pathLastPosition = { ...stationaryPath.offline.pathLastPosition };
  assert.throws(() => assertMocapTransitionEvidence(stationaryPath,mocapExpected),/did not move/);

  const missingReadout = mocapBrowserEvidence();
  delete missingReadout.instrument.readouts.frequencies.IMU;
  assert.throws(() => assertMocapBrowserEvidence(
    missingReadout,mocapExpected,mocapTransition(),mocapLayout(),mocapLedger(),
  ),/frequency labels/);

  const placeholderMetric = mocapBrowserEvidence();
  placeholderMetric.instrument.readouts.metrics.altitude.value = '--';
  assert.throws(() => assertMocapBrowserEvidence(
    placeholderMetric,mocapExpected,mocapTransition(),mocapLayout(),mocapLedger(),
  ),/altitude value/);

  const fabricatedSpeed = mocapBrowserEvidence();
  fabricatedSpeed.instrument.readouts.metrics.speed.value = '9.9';
  assert.throws(() => assertMocapBrowserEvidence(
    fabricatedSpeed,mocapExpected,mocapTransition(),mocapLayout(),mocapLedger(),
  ),
    /speed versus sampled/);

  const crossedProjection = mocapBrowserEvidence();
  crossedProjection.instrument.projectionAudit.runId = 'foreign-projection-run';
  assert.throws(() => assertMocapBrowserEvidence(
    crossedProjection,mocapExpected,mocapTransition(),mocapLayout(),mocapLedger(),
  ),/instrument projection runId/);

  const staleBrowserProjection = mocapBrowserEvidence();
  staleBrowserProjection.instrument.projectionAudit.channelSnapshot['state.pose'].sequence = 6;
  assert.throws(() => assertMocapBrowserEvidence(
    staleBrowserProjection,mocapExpected,mocapTransition(),mocapLayout(),mocapLedger(),
  ),/direct channel did not advance/);

  const redFrequency = mocapBrowserEvidence();
  redFrequency.instrument.readouts.frequencies.PWR.tone = 'danger';
  assert.throws(() => assertMocapBrowserEvidence(
    redFrequency,mocapExpected,mocapTransition(),mocapLayout(),mocapLedger(),
  ),/PWR frequency tone/);

  const falseRendererClaim = mocapBrowserEvidence();
  falseRendererClaim.lichtblick.rendererAudit.visualGate.pixelSemanticsClaimed = true;
  assert.throws(() => assertMocapBrowserEvidence(
    falseRendererClaim,mocapExpected,mocapTransition(),mocapLayout(),mocapLedger(),
  ),/pixel semantic claim/);

  const driftedUrdfRenderer = mocapBrowserEvidence();
  driftedUrdfRenderer.lichtblick.layoutAudit.urdfLayer.parameter = '/robot_description';
  assert.throws(() => assertMocapBrowserEvidence(
    driftedUrdfRenderer,mocapExpected,mocapTransition(),mocapLayout(),mocapLedger(),
  ),/URDF parameter source/);

  const inventedLayoutState = mocapBrowserEvidence();
  inventedLayoutState.lichtblick.layoutAudit.stateDigest = DIGEST_A;
  inventedLayoutState.lichtblick.rendererAudit.visualGate.layoutStateDigest = DIGEST_A;
  assert.throws(() => assertMocapBrowserEvidence(
    inventedLayoutState,mocapExpected,mocapTransition(),mocapLayout(),mocapLedger(),
  ),/audited layout state digest/);

  const crossedDataSource = mocapBrowserEvidence();
  crossedDataSource.lichtblick.dataSourceAudit.websocketPath = '/foreign/ws';
  assert.throws(() => assertMocapBrowserEvidence(
    crossedDataSource,mocapExpected,mocapTransition(),mocapLayout(),mocapLedger(),
  ),/websocket path/);

  const extraPanel = mocapBrowserEvidence();
  extraPanel.panelRoster.asset.push('operator-extra');
  assert.throws(() => assertMocapBrowserEvidence(
    extraPanel,mocapExpected,mocapTransition(),mocapLayout(),mocapLedger(),
  ),/Asset dashboard panel ids/);
});

test('evidence digest is stable across object key order',() => {
  assert.equal(digestEvidence({ a:1,b:{ c:2 } }),digestEvidence({ b:{ c:2 },a:1 }));
});

function b2Ledger() {
  const serviceOutput = { response:{ sum:42 } };
  const algorithmOutput = {
    exitCode:0,
    stdoutTail:JSON.stringify(EXPECTED_ALGORITHM),
    stderrTail:EXPECTED_STDERR,
  };
  return {
    session:{
      id:b2Expected.sessionId,
      experimentResourceId:b2Expected.experimentId,
      targetId:'local',
      state:'active',
    },
    members:[
      member('b2-user-ros2-service',b2Expected.serviceRunId,'succeeded'),
      member('b2-user-safe-algorithm',b2Expected.algorithmRunId,'succeeded'),
    ],
    runs:[
      finiteRun(b2Expected.serviceRunId,b2Expected.serviceResourceId,'typed-call',serviceOutput),
      finiteRun(b2Expected.algorithmRunId,b2Expected.algorithmResourceId,'algorithm',algorithmOutput),
    ],
    algorithmJob:{
      source:'orchestration-invocation-main-output',runId:b2Expected.algorithmRunId,
      nodeId:'algorithm',jobId:'job-algorithm',result:algorithmOutput,
    },
    jobLogs:{
      [b2Expected.algorithmRunId]:{
        source:'job-log-endpoint',jobId:'job-algorithm',
        stdout:`attempt 1 started\n${JSON.stringify(EXPECTED_ALGORITHM)}\nattempt 1 succeeded\n`,
        stderr:`${EXPECTED_STDERR}\n`,
      },
    },
    orchestrationLifecycleLogs:{
      [b2Expected.algorithmRunId]:{
        source:'orchestration-run-log-endpoint',
        stdout:'run starting with definition algorithm-resource@1\ninvocation invocation-a node algorithm succeeded\n',
        stderr:'',
      },
    },
    cameraOwnership:{
      sourceId:'odin1',
      imageTopic:'/odin1/image/compressed',
      canonical:{
        bindingId:'b2-onboard-media',runId:b2Expected.g6MediaRunId,
        targetId:B2_TARGET_ID,status:'stopped',
        processDefinitionIds:['xgc2-image-test-publisher','xgc2-ros-image-rtp-adapter','xgc-media-edge'],
      },
      robotTopic:{
        fixture:{
          bindingId:'b2-camera-topic-lab-fixture',runId:b2Expected.cameraFixtureRunId,
          targetId:B2_TARGET_ID,status:'active',processDefinitionIds:['xgc2-image-test-publisher'],
        },
        media:{
          bindingId:'b2-camera-topic-media',runId:b2Expected.cameraMediaRunId,
          targetId:B2_TARGET_ID,status:'active',sourceId:'odin1',imageTopic:'/odin1/image/compressed',
          processDefinitionIds:['xgc2-ros-image-rtp-adapter','xgc-media-edge'],
        },
      },
    },
  };
}

function member(bindingId,ownerId,status) {
  return {
    sessionId:b2Expected.sessionId,
    bindingId,
    kind:'workflow_run',
    ownerId,
    targetId:'local',
    status,
  };
}

function finiteRun(runId,resourceId,nodeId,output) {
  return {
    id:runId,
    targetId:B2_TARGET_ID,
    automationResourceId:resourceId,
    status:'succeeded',
    sourceKind:'experiment',
    sourceRef:pinnedRef('experiment',b2Expected.experimentId),
    automationRef:pinnedRef('automation',resourceId),
    nodeSummaries:[{ nodeId,status:'succeeded',output }],
  };
}

function g4Evidence() {
  return {
    experimentId:b2Expected.experimentId,
    sessionId:b2Expected.sessionId,
    runId:b2Expected.projectionRunId,
    robotId:B2_ROBOT_ID,
    projectionState:'live',
    instrument:{ connection:'online',streamState:'live' },
    lichtblick:{
      html:true,canvasCount:1,dynamic:true,beforeHash:DIGEST_A,afterHash:DIGEST_B,
    },
    pageErrors:[],
  };
}

function g6Evidence() {
  return {
    experimentId:b2Expected.experimentId,
    sessionId:b2Expected.sessionId,
    mediaRunId:b2Expected.g6MediaRunId,
    targetId:B2_TARGET_ID,
    sourceId:'odin1',
    initial:advancingVideo(),
    viewer:{ disconnect:{ state:'disconnected' },reconnect:advancingVideo() },
    sourceFault:stoppedVideo(),
    sourceRecovery:advancingVideo(),
    edgeFault:{ healthUnavailable:true },
    edgeRecovery:advancingVideo(),
    viewerClosed:{ viewers:0 },
    pageErrors:[],
  };
}

function b2BrowserEvidence() {
  return {
    experimentId:b2Expected.experimentId,
    sessionId:b2Expected.sessionId,
    targetId:B2_TARGET_ID,
    panelRoster:{
      asset:['robot-assets'],
      gcs:['robot-instruments','lichtblick','camera-video','ros-control','b2-onboard-workflows'],
    },
    asset:{ resourceId:B2_ASSET_ID,count:1,state:'',text:'B2 01' },
    instrument:{
      cardCount:1,cardStatus:'online',cardHealth:'healthy',connection:'online',streamState:'live',
      heading:'12.25',linearSpeed:'0.00',
    },
    lichtblick:{
      frameCount:1,canvasCount:1,projectionState:'live',dynamic:true,
      beforeHash:DIGEST_A,afterHash:DIGEST_B,
    },
    ros:{
      panelCount:1,tileIds:['roscore','adapters'],hiddenIds:[],
      tiles:{
        roscore:{ status:'ready',running:'true',runId:b2Expected.roscoreRunId },
        adapters:{ status:'running',running:'true',runId:b2Expected.adaptersRunId },
      },
    },
    automation:{
      panelCount:1,
      views:['controls','whiteboard','history','logs'],
      service:{
        resourceId:b2Expected.serviceResourceId,
        controlAria:`Call ROS2 service; ${B2_TARGET_ID}; ready`,
        history:{
          runId:b2Expected.serviceRunId,source:`Experiment: ${b2Expected.experimentId}`,
          nodeId:'typed-call',nodeStatus:'succeeded',outputExpanded:true,outputVisible:true,
          nodeOutput:{ response:{ sum:42 } },
        },
      },
      algorithm:{
        resourceId:b2Expected.algorithmResourceId,
        controlAria:`Safe algorithm; ${B2_TARGET_ID}; ready`,
        history:{
          runId:b2Expected.algorithmRunId,source:`Experiment: ${b2Expected.experimentId}`,
          nodeId:'algorithm',nodeStatus:'succeeded',outputExpanded:true,outputVisible:true,
          nodeOutput:{
            jobId:'job-algorithm',
            result:{ exitCode:0,stdoutTail:JSON.stringify(EXPECTED_ALGORITHM),stderrTail:EXPECTED_STDERR },
          },
        },
        jobLogs:{
          source:'job-log-endpoint',runId:b2Expected.algorithmRunId,nodeId:'algorithm',jobId:'job-algorithm',
          stdout:`attempt 1 started\n${JSON.stringify(EXPECTED_ALGORITHM)}\nattempt 1 succeeded\n`,
          stderr:`${EXPECTED_STDERR}\n`,
        },
        orchestrationLifecycleLogs:{
          source:'orchestration-run-log-endpoint',runId:b2Expected.algorithmRunId,
          stdout:'run starting with definition algorithm-resource@1\ninvocation invocation-a node algorithm succeeded\n',
          stderr:'No stderr captured yet.',
        },
      },
    },
    camera:{
      tileCount:1,sourceId:'odin1',mediaBindingId:'b2-camera-topic-media',
      mediaRunId:b2Expected.cameraMediaRunId,
      mediaState:'running',viewerState:'playing',hasStart:false,hasRestart:true,hasStop:true,
      hasHeaderViewerToggle:true,hasTileViewerToggle:true,video:advancingVideo(),
    },
    inputs:{ ledger:DIGEST_A,g4:DIGEST_B,g6:DIGEST_C },
    pageErrors:[],
  };
}

function advancingVideo() {
  return {
    before:{
      video:{ currentTime:1,readyState:4,width:1280,height:720 },
      health:{ bytesReceived:1000,active:true,consumers:1,viewers:1 },
    },
    after:{
      video:{ currentTime:2,readyState:4,width:1280,height:720 },
      health:{ bytesReceived:2000,active:true,consumers:1,viewers:1 },
    },
    advancing:true,
  };
}

function stoppedVideo() {
  return {
    before:{ video:{ currentTime:2 },health:{ bytesReceived:2000 } },
    after:{ video:{ currentTime:2 },health:{ bytesReceived:2000 } },
    bytesStopped:true,
  };
}

function mocapLedger() {
  const childRef = pinnedRef('automation','mocap-child-resource');
  return {
    session:{
      id:mocapExpected.sessionId,
      experimentResourceId:mocapExpected.experimentId,
      targetId:'local',
      state:'active',
      openingRunId:'mocap-opening-run',
    },
    asset:{
      resourceId:MOCAP_ASSET_ID,name:'Mocap Rotor 01',kind:'px4_multirotor',
      profileId:'px4.mocap-rotor.ros1.v1',modelId:'mocap_rotor',
    },
    robotBinding:{
      id:MOCAP_ROBOT_ID,namespace:MOCAP_NAMESPACE,
      ref:{ resourceId:MOCAP_ASSET_ID },
      runtimeParameters:{ wire_transport:'zenoh',zenoh_listen:'tcp/0.0.0.0:7457' },
    },
    adapterRelease:{
      package:'ros-noetic-xgc2-mocap-rotor-adapter',packageArchitecture:'amd64',
      packageVersion:`0.5.0-17+xgc2dev.${DIGEST_A.slice(0,12)}`,
      sourceDigest:DIGEST_A,localDebSha256:DIGEST_C,
    },
    trajectoryRelease:{ ...mocapExpected.trajectoryRelease },
    onboardRuntime:{
      parentRunId:mocapExpected.onboardRunId,childRunId:mocapExpected.onboardRuntimeRunId,
      callInvocationId:'mocap-call-invocation',targetId:MOCAP_TARGET_ID,
      automationResourceId:'mocap-child-resource',
      childRun:{
        id:mocapExpected.onboardRuntimeRunId,targetId:MOCAP_TARGET_ID,
        automationResourceId:'mocap-child-resource',status:'waiting',result:{ state:'ready' },
        sourceKind:'automation',sourceRef:childRef,automationRef:{ ...childRef },
        definitionId:'mocap-child-definition',definitionVersion:1,
        configDigest:DIGEST_A,executionPlanDigest:DIGEST_B,registryDigest:DIGEST_C,
        definitionDigest:DIGEST_A,parentRunId:mocapExpected.onboardRunId,
        rootRunId:mocapExpected.onboardRunId,callNodeId:'mocap-runtimes',depth:1,
        correlationId:mocapExpected.onboardRunId,triggerInvocation:{
          eventId:'mocap-call-event',nodeId:'called',kind:'trigger.automation-call',
          sessionId:mocapExpected.onboardRunId,
          occurredAt:'2026-08-10T03:00:00.000Z',
        },
      },
      relation:{
        parentRunId:mocapExpected.onboardRunId,parentInvocationId:'mocap-call-invocation',
        callNodeId:'mocap-runtimes',ordinal:0,childRunId:mocapExpected.onboardRuntimeRunId,
        ownerRunId:mocapExpected.onboardRunId,childDefinitionId:'mocap-child-definition',
        childDefinitionVersion:1,childConfigDigest:DIGEST_A,childExecutionPlanDigest:DIGEST_B,
        childRegistryDigest:DIGEST_C,childDefinitionDigest:DIGEST_A,triggerNodeId:'called',
        relation:'attached',waitPolicy:'wait',cancelPolicy:'cascade',resultPolicy:'propagate',
      },
      group:{
        id:'mocap-child-group',targetId:MOCAP_TARGET_ID,rootRunId:mocapExpected.onboardRunId,
        parentRunId:mocapExpected.onboardRunId,producerInvocationId:'mocap-call-invocation',
        producerNodeId:'mocap-runtimes',groupKey:'automation-call:fan-out',expectedMembers:1,
        memberCount:1,membershipDigest:`sha256:${DIGEST_A}`,waitPolicy:'wait',joinMode:'join-all',
        failurePolicy:'fail-fast',remainingPolicy:'cancel',resultPolicy:'propagate',maxConcurrency:1,
        state:'resolved',outcome:'succeeded',terminalCount:1,
      },
      member:{
        id:'mocap-child-member',groupId:'mocap-child-group',ordinal:0,itemKey:MOCAP_ROBOT_ID,
        childRunId:mocapExpected.onboardRuntimeRunId,state:'terminal',
      },
    },
    members:[
      mocapMember('mocap-onboard',mocapExpected.onboardRunId,'local'),
      mocapMember('robot-adapters',mocapExpected.projectionRunId,'local'),
    ],
    runs:[
      experimentRootRun(
        mocapExpected.onboardRunId,mocapExpected.onboardResourceId,MOCAP_TARGET_ID,'succeeded',
      ),
      localSessionChildRun(
        mocapExpected.projectionRunId,mocapExpected.adaptersResourceId,
      ),
    ],
  };
}

function mocapMember(bindingId,ownerId,targetId) {
  return {
    sessionId:mocapExpected.sessionId,bindingId,kind:'workflow_run',ownerId,targetId,status:'running',
  };
}

function experimentRootRun(id,resourceId,targetId,status='running') {
  return {
    id,targetId,automationResourceId:resourceId,status,sourceKind:'experiment',
    sourceRef:pinnedRef('experiment',mocapExpected.experimentId),
    automationRef:pinnedRef('automation',resourceId),
  };
}

function localSessionChildRun(id,resourceId,status='running') {
  const automationRef = pinnedRef('automation',resourceId);
  return {
    id,targetId:'local',automationResourceId:resourceId,status,sourceKind:'automation',
    sourceRef:automationRef,automationRef:{ ...automationRef },
    rootRunId:'mocap-opening-run',parentRunId:'mocap-opening-run',callNodeId:'dispatch-all',depth:1,
    correlationId:'mocap-opening-run',triggerInvocation:{
      eventId:'mocap-adapter-call-event',nodeId:'called',kind:'trigger.automation-call',
      sessionId:'mocap-opening-run',occurredAt:'2026-08-10T03:00:00.000Z',
    },
  };
}

function mocapLayout() {
  return {
    layout:'3D!xgc2',
    configById:{
      '3D!xgc2':{
        followMode:'follow-none',followTf:'world',cameraState:{ distance:2.5 },
        topics:{
          [MOCAP_PATH_TOPIC]:{
            visible:true,type:'line',lineWidth:0.03,gradient:MOCAP_PATH_GRADIENT,
          },
          [`${MOCAP_NAMESPACE}/odom`]:{ visible:true },
          [`param:${MOCAP_DESCRIPTION_PARAMETER}`]:{ visible:true },
          '/tf':{ visible:true },
          '/tf_static':{ visible:true },
        },
        layers:{
          'xgc2-urdf-mocap_rotor1':{
            layerId:'foxglove.Urdf',sourceType:'param',parameter:MOCAP_DESCRIPTION_PARAMETER,
            framePrefix:'mocap_rotor1/',visible:true,displayMode:'visual',
          },
        },
      },
    },
  };
}

function mocapTransition() {
  const offlineChannels = mocapChannelSnapshot({ offline:true,sequence:5 });
  const recoveredChannels = mocapChannelSnapshot({ offline:false,sequence:6 });
  return {
    experimentId:mocapExpected.experimentId,
    sessionId:mocapExpected.sessionId,
    runId:mocapExpected.projectionRunId,
    robotId:MOCAP_ROBOT_ID,
    onboardParentRunId:mocapExpected.onboardRunId,
    onboardRuntimeRunId:mocapExpected.onboardRuntimeRunId,
    forwarderIdentity:{
      processInstanceId:'onboard-forwarder',pid:103,startTime:'12345',
      executable:'/opt/ros/noetic/lib/xgc_mocap_rotor_zenoh_forwarder/xgc_mocap_rotor_zenoh_forwarder_node',
      cmdlineSha256:DIGEST_A,
    },
    offline:{
      cardStatus:'offline',instrumentConnection:'offline',projectionRevision:10,pathPoseCount:20,
      pathExtentMeters:0.8,maxDistanceFromLastMeters:0.7,
      pathLastPosition:{ x:0,y:0,z:1 },channelSnapshot:offlineChannels,
      streamId:'mocap-stream-1',observedAt:'2026-08-10T03:00:00.000Z',
    },
    recovered:{
      cardStatus:'online',cardHealth:'healthy',instrumentConnection:'online',
      projectionRevision:12,pathPoseCount:25,pathExtentMeters:0.82,maxDistanceFromLastMeters:0.72,
      pathLastPosition:{ x:0.02,y:0,z:1 },channelSnapshot:recoveredChannels,streamId:'mocap-stream-1',
      observedAt:'2026-08-10T03:00:05.000Z',
    },
  };
}

function mocapBrowserEvidence() {
  const layoutDigest = digestEvidence(mocapLayout());
  const ledgerDigest = digestEvidence(mocapLedger());
  return {
    experimentId:mocapExpected.experimentId,
    sessionId:mocapExpected.sessionId,
    targetId:'local',
    panelRoster:{ asset:['robot-assets'],gcs:['robot-instruments','lichtblick'] },
    asset:{ resourceId:MOCAP_ASSET_ID,count:1,state:'',text:'Mocap Rotor 01' },
    instrument:{
      cardCount:1,cardStatus:'online',cardHealth:'healthy',connection:'online',health:'healthy',
      text:'Mocap Rotor 01 flight instrument',roll:'0.00',pitch:'0.00',yaw:'0.00',
      projectionAudit:{
        runId:mocapExpected.projectionRunId,targetId:'local',streamId:'mocap-stream-1',
        projectionRevision:13,updatedAt:'2026-08-10T03:00:06.000Z',
        channelSnapshot:mocapChannelSnapshot({ offline:false,sequence:7 }),
      },
      readouts:{
        attitude:{ roll:'0.00',pitch:'0.00',yaw:'0.00' },
        metrics:{
          speed:{ value:'0.3',unit:'m/s',visible:true },
          altitude:{ value:'1.3',unit:'m',visible:true },
        },
        flight:{ mode:'AUTO.LOITER',armed:'DISARMED',visible:true },
        frequencies:Object.fromEntries(['POSE','VEL','IMU','PWR'].map((label) => [
          label,{ value:'15.0',title:'',tone:'normal',visible:true },
        ])),
        hud:{
          climb:{ value:'0.1',unit:'m/s',direction:'up',visible:true },
          position:{ x:'0.4',y:'-0.2',visible:true },
        },
        statuses:{
          LNK:{ value:'OK',title:'Onboard Zenoh telemetry link ready',tone:'',visible:true },
          FLT:{ value:'GND',title:'Flight stage: GROUND',tone:'',visible:true },
          POS:{ value:'OK',title:'Local pose fresh',tone:'',visible:true },
          IMU:{ value:'OK',title:'IMU source rate 15.0 Hz',tone:'',visible:true },
        },
        compass:{ heading:'0',visible:true },
        indicators:{
          network:{ label:'Communication link connected',tone:'info',visible:true },
          position:{ label:'VRPN position unavailable',tone:'neutral',visible:true },
          power:{ label:'Battery 80%',tone:'success',visible:true },
        },
      },
    },
    lichtblick:{
      frameCount:1,canvasCount:1,dynamic:true,beforeHash:DIGEST_A,afterHash:DIGEST_B,
      descriptionParameter:MOCAP_DESCRIPTION_PARAMETER,pathTopic:MOCAP_PATH_TOPIC,pathPoseCount:25,
      layoutAudit:{
        selectedLayout:'3D!xgc2',followMode:'follow-none',followTf:'world',
        cameraDistanceMeters:2.5,
        pathRenderer:{
          topic:MOCAP_PATH_TOPIC,visible:true,type:'line',lineWidthMeters:0.03,
          gradient:MOCAP_PATH_GRADIENT,extentMeters:0.82,
          maxDistanceFromLastMeters:0.72,
          lastPosition:{ x:0.02,y:0,z:1 },
        },
        urdfLayer:{
          key:'xgc2-urdf-mocap_rotor1',layerId:'foxglove.Urdf',sourceType:'param',
          parameter:MOCAP_DESCRIPTION_PARAMETER,framePrefix:'mocap_rotor1/',visible:true,
          displayMode:'visual',
        },
        stateDigest:layoutDigest,
      },
      dataSourceAudit:{
        processInstanceId:'lichtblick-web-process',targetId:'local',kind:'foxglove-websocket',
        proxyPath:'/api/visualization/targets/local/lichtblick/lichtblick-web-process',
        websocketPath:'/api/visualization/targets/local/lichtblick/lichtblick-web-process/ws',
        embedded:true,
      },
      rendererAudit:{
        canvasCount:1,readableAnchors:[],anchorMode:'layout-and-screenshot-manual',
        visualGate:{
          pixelSemanticsClaimed:false,screenshotPath:'/tmp/mocap-lichtblick.png',
          screenshotSha256:DIGEST_C,layoutStateDigest:layoutDigest,
        },
      },
    },
    identityAudit:{
      scopes:['asset','robot-card','lichtblick-frame'],forbiddenMatches:[],
      surfaceDigests:{ asset:DIGEST_A,robotCard:DIGEST_B,lichtblickFrame:DIGEST_C },
    },
    inputs:{ ledger:ledgerDigest,layout:layoutDigest,transition:digestEvidence(mocapTransition()) },
    pageErrors:[],
  };
}

function mocapChannelSnapshot({ offline,sequence }) {
  const channel = (channelId,messageId,value) => ({
    channelId,messageId,sequence,stale:offline && !['state.health','diagnostic.stream-health'].includes(channelId),value,
  });
  const streamChannels = [
    'state.pose','state.velocity','state.speed','state.imu','state.power',
    'state.health','state.flight','diagnostic.link',
  ].map((channelId) => ({
    channelId,sourceRateHz:offline ? 0 : 15,outputRateHz:offline ? 0 : 15,
    droppedSamples:'0',sourceAgeMs:'17',stale:offline,
  }));
  return {
    'state.pose':channel('state.pose',2001,{
      frameId:'world',childFrameId:'mocap_rotor1/base_link',
      position:{ x:0.4,y:-0.2,z:1.25 },orientation:{ w:1 },
    }),
    'state.velocity':channel('state.velocity',2002,{
      frameId:'mocap_rotor1/base_link',linear:{ x:0.3,y:0,z:0.1 },angular:{ x:0,y:0,z:0 },
    }),
    'state.speed':channel('state.speed',2006,{
      frameId:'mocap_rotor1/base_link',metersPerSecond:0.3,
    }),
    'state.imu':channel('state.imu',2003,{
      frameId:'mocap_rotor1/base_link',orientation:{ w:1 },angularVelocity:{},
      linearAcceleration:{ z:9.81 },orientationCovariance:Array(9).fill(0),
      angularVelocityCovariance:Array(9).fill(0),linearAccelerationCovariance:Array(9).fill(0),
    }),
    'state.power':channel('state.power',2004,{ percentage:0.8,voltageV:12.1 }),
    'state.health':channel('state.health',2005,{
      ...(offline ? {} : { online:true }),summary:'Mocap Rotor read-only telemetry is healthy',
    }),
    'state.flight':channel('state.flight',3001,{
      connected:true,armed:false,mode:'AUTO.LOITER',landedState:1,
    }),
    'diagnostic.link':channel('diagnostic.link',2010,{
      channelId:'forwarder_hb',sourceRateHz:1,outputRateHz:1,droppedSamples:'0',sourceAgeMs:'17',
    }),
    'diagnostic.stream-health':channel('diagnostic.stream-health',2011,{ channels:streamChannels }),
  };
}

function pinnedRef(domain,resourceId) {
  return {
    domain,resourceId,branch:'main',commitId:`${domain}-commit`,version:1,digest:DIGEST_A,
  };
}
