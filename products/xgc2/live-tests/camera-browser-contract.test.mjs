/* global URL */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertCameraInitialEvidence,
  assertCameraContinuity,
  assertExclusiveCameraImageBranch,
  assertNoCameraPromptOverlap,
  assertNoPageFaults,
  assertRunStopMutualExclusion,
  assertStopOwnershipClosure,
  assertWorldCameraInitialEvidence,
  cameraVideoContract,
  cameraWorkspaceContract,
  CAMERA_PANEL_KINDS,
  INTRINSIC_PHYSICAL_VIDEO_CONTRACT,
  INTRINSIC_SIMULATION_VIDEO_CONTRACT,
  readCameraTargets,
  WORLD_CAMERA_VIDEO_CONTRACT,
} from './camera-browser-contract.mjs';

test('Camera targets are parameterized and cannot carry transient Run identity',() => {
  assert.deepEqual(readCameraTargets({
    XGC_CAMERA_CASES:JSON.stringify([
      {
        caseId:'alpha-camera',fixture:{ experimentId:'experiment-alpha' },
        panel:{ id:'panel-camera',dashboardId:'gcs',pluginId:'camera-intrinsic-calibration' },runMode:'simulation',
      },
      { experimentId:'experiment-beta',panelId:'panel-world',workspaceKind:'gazebo-world-camera',runMode:'physical' },
    ]),
  }),[
    {
      caseId:'alpha-camera',experimentId:'experiment-alpha',panelId:'panel-camera',dashboardId:'gcs',
      panelKind:'camera-intrinsic-calibration',runMode:'simulation',
    },
    {
      caseId:'experiment-beta:gcs:panel-world:physical',experimentId:'experiment-beta',panelId:'panel-world',
      dashboardId:'gcs',panelKind:'gazebo-world-camera',runMode:'physical',
    },
  ]);
  assert.deepEqual(readCameraTargets({
    XGC_CAMERA_EXPERIMENT_ID:'experiment-alpha',XGC_CAMERA_PANEL_ID:'panel-camera',
  }),[{
    caseId:'experiment-alpha:gcs:panel-camera:simulation',experimentId:'experiment-alpha',
    panelId:'panel-camera',dashboardId:'gcs',panelKind:'gazebo-world-camera',runMode:'simulation',
  }]);
  assert.throws(() => readCameraTargets({
    XGC_CAMERA_CASES:'[{"experimentId":"experiment-alpha","panelId":"panel-camera","runId":"temporary"}]',
  }),/must not contain runId/);
  assert.throws(() => readCameraTargets({
    XGC_CAMERA_CASES:'[{"experimentId":"experiment-alpha","panelId":"panel-camera"},{"experimentId":"experiment-alpha","panelId":"panel-camera"}]',
  }),/duplicate/);
  assert.throws(() => readCameraTargets({
    XGC_CAMERA_CASES:'[{"experimentId":"experiment-alpha","panelId":"panel-camera","panelKind":"unknown-camera"}]',
  }),/unknown Camera panel\/workspace kind/);
  assert.throws(() => readCameraTargets({
    XGC_CAMERA_CASES:'[{"experimentId":"experiment-alpha","panelId":"panel-camera","panelKind":"constructor"}]',
  }),/unknown Camera panel\/workspace kind/);
  assert.throws(() => readCameraTargets({
    XGC_CAMERA_CASES:'[{"experimentId":"experiment-alpha","panelId":"panel-camera","panelKind":"gazebo-world-camera","panel":{"id":"panel-camera","kind":"camera-intrinsic-calibration"}}]',
  }),/declarations disagree/);
});

test('workspace contracts follow the mounted world and intrinsic Panel DOM',() => {
  assert.deepEqual(cameraWorkspaceContract(CAMERA_PANEL_KINDS.world),{
    workspaceRole:'gazebo-world-camera-workspace',
    branchRole:'gazebo-world-camera-image-view',
    liveViewRole:'gazebo-world-camera-image-view',
    runtimeRole:'',
    emptyStateSelector:'[data-xgc-role="gazebo-world-camera-empty-state"]',
    lifecycleAttribute:'data-xgc-camera-lifecycle',
  });
  assert.deepEqual(cameraWorkspaceContract(CAMERA_PANEL_KINDS.intrinsic),{
    workspaceRole:'camera-calibration-panel',
    branchRole:'',
    liveViewRole:'camera-intrinsic-image',
    runtimeRole:'camera-intrinsic-runtime',
    emptyStateSelector:':scope > .xgc-empty-state',
    lifecycleAttribute:'',
  });
  const intrinsicWorkspace = readFileSync(
    new URL('../src/panels/camera/CameraIntrinsicCalibrationWorkspace.tsx',import.meta.url),'utf8',
  );
  assert.match(intrinsicWorkspace,/data-xgc-role="camera-calibration-panel"/);
  assert.match(intrinsicWorkspace,/data-xgc-id=\{panel\.id\}/);
});

test('camera video dimensions follow the provisioned profile for each target',() => {
  assert.equal(cameraVideoContract({
    panelKind:CAMERA_PANEL_KINDS.intrinsic,runMode:'simulation',
  }),INTRINSIC_SIMULATION_VIDEO_CONTRACT);
  assert.deepEqual(INTRINSIC_SIMULATION_VIDEO_CONTRACT,{
    lifecycle:'ready',state:'playing',readyState:4,
    videoWidth:3840,videoHeight:2160,minimumTimeDelta:0.2,
  });
  assert.equal(cameraVideoContract({
    panelKind:CAMERA_PANEL_KINDS.intrinsic,runMode:'physical',
  }),INTRINSIC_PHYSICAL_VIDEO_CONTRACT);
  assert.deepEqual(INTRINSIC_PHYSICAL_VIDEO_CONTRACT,{
    lifecycle:'ready',state:'playing',readyState:4,
    videoWidth:3840,videoHeight:2160,minimumTimeDelta:0.2,
  });
  assert.equal(cameraVideoContract({
    panelKind:CAMERA_PANEL_KINDS.world,runMode:'simulation',
  }),WORLD_CAMERA_VIDEO_CONTRACT);
  assert.deepEqual(WORLD_CAMERA_VIDEO_CONTRACT,{
    lifecycle:'ready',state:'playing',readyState:4,
    videoWidth:3840,videoHeight:2160,minimumTimeDelta:0.2,
  });
  assert.throws(() => cameraVideoContract({
    panelKind:CAMERA_PANEL_KINDS.intrinsic,runMode:'hybrid',
  }),/supports simulation or physical/);

  const intrinsicProvisioner = readFileSync(
    new URL('../../scripts/provision-camera-intrinsic-calibration-automation.sh',import.meta.url),'utf8',
  );
  const worldProvisioner = readFileSync(
    new URL('../../scripts/provision-gazebo-world-camera-automation.sh',import.meta.url),'utf8',
  );
  const profileValidator = readFileSync(
    new URL('../../scripts/configure-gazebo-camera-source-manifest.py',import.meta.url),'utf8',
  );
  assert.match(intrinsicProvisioner,/cameraProfile:"world_wide_4k30_110"/);
  assert.match(worldProvisioner,/default:"world_wide_4k30_110"/);
  assert.match(profileValidator,/image\.get\("width_px"\) != 3840/);
  assert.match(profileValidator,/image\.get\("height_px"\) != 2160/);
});

test('camera image and prompt branches never overlap after navigation or reload',() => {
  assert.doesNotThrow(() => assertNoCameraPromptOverlap({ visibleVideoCount:1,visiblePromptCount:0,overlapArea:0 }));
  assert.doesNotThrow(() => assertNoCameraPromptOverlap({ visibleVideoCount:0,visiblePromptCount:1,overlapArea:0 }));
  assert.throws(() => assertNoCameraPromptOverlap({ visibleVideoCount:1,visiblePromptCount:1,overlapArea:120 }),/overlap|exactly one/);
});

test('Stop closure rejects active Runs, Sessions, and Run-owned Processes',() => {
  const closed={
    runs:[{ id:'root',status:'stopped' },{ id:'camera-child',status:'canceled' }],
    sessions:[],processes:[{ desiredState:'stopped',observedState:'stopped',handle:null }],
  };
  assert.doesNotThrow(() => assertStopOwnershipClosure(closed));
  assert.throws(() => assertStopOwnershipClosure({ ...closed,runs:[{ id:'root',status:'waiting' }] }),/active Runs/);
  assert.throws(() => assertStopOwnershipClosure({ ...closed,sessions:[{ state:'active' }] }),/Sessions/);
  assert.throws(() => assertStopOwnershipClosure({
    ...closed,processes:[{ desiredState:'running',observedState:'running',handle:'pid:1' }],
  }),/Processes/);
});

test('initial world-camera evidence requires the ready 4K playing contract',() => {
  assert.doesNotThrow(() => assertWorldCameraInitialEvidence({
    lifecycle:WORLD_CAMERA_VIDEO_CONTRACT.lifecycle,
    state:WORLD_CAMERA_VIDEO_CONTRACT.state,
    readyState:WORLD_CAMERA_VIDEO_CONTRACT.readyState,
    videoWidth:WORLD_CAMERA_VIDEO_CONTRACT.videoWidth,
    videoHeight:WORLD_CAMERA_VIDEO_CONTRACT.videoHeight,
    currentTime:4.2,
    paused:false,
    ended:false,
    trackReadyState:'live',
  }));
  assert.throws(() => assertWorldCameraInitialEvidence({
    lifecycle:'ready',state:'playing',readyState:3,videoWidth:3840,videoHeight:2160,
    currentTime:4.2,paused:false,ended:false,
  }),/readyState/);
  assert.throws(() => assertWorldCameraInitialEvidence({
    lifecycle:'ready',state:'playing',readyState:4,videoWidth:1920,videoHeight:1080,
    currentTime:4.2,paused:false,ended:false,
  }),/videoWidth/);
});

test('initial intrinsic evidence enforces the same 4K dimensions in simulation and physical modes',() => {
  const base={ lifecycle:'ready',state:'playing',readyState:4,currentTime:4.2,paused:false,ended:false };
  assert.doesNotThrow(() => assertCameraInitialEvidence({
    ...base,videoWidth:3840,videoHeight:2160,
  },{ panelKind:CAMERA_PANEL_KINDS.intrinsic,runMode:'simulation' }));
  assert.throws(() => assertCameraInitialEvidence({
    ...base,videoWidth:1280,videoHeight:720,
  },{ panelKind:CAMERA_PANEL_KINDS.intrinsic,runMode:'simulation' }),/videoWidth/);
  assert.doesNotThrow(() => assertCameraInitialEvidence({
    ...base,videoWidth:3840,videoHeight:2160,
  },{ panelKind:CAMERA_PANEL_KINDS.intrinsic,runMode:'physical' }));
  assert.throws(() => assertCameraInitialEvidence({
    ...base,videoWidth:1920,videoHeight:1080,
  },{ panelKind:CAMERA_PANEL_KINDS.intrinsic,runMode:'physical' }),/videoWidth/);
});

test('same-tab continuity requires the same video element and advancing time',() => {
  assert.doesNotThrow(() => assertCameraContinuity({
    sameVideoElement:true,
    before:{ currentTime:10.1 },
    after:{ currentTime:10.7 },
  }));
  assert.throws(() => assertCameraContinuity({
    sameVideoElement:false,
    before:{ currentTime:10.1 },
    after:{ currentTime:10.7 },
  }),/DOM identity/);
  assert.throws(() => assertCameraContinuity({
    sameVideoElement:true,
    before:{ currentTime:10.1 },
    after:{ currentTime:10.2 },
  }),/did not advance/);
});

test('each visible panel has one workspace and EmptyState XOR CameraVideoPanel',() => {
  assert.doesNotThrow(() => assertExclusiveCameraImageBranch({
    totalWorkspaceCount:1,visibleWorkspaceCount:1,imageViewCount:1,emptyStateCount:0,cameraPanelCount:1,
  }));
  assert.doesNotThrow(() => assertExclusiveCameraImageBranch({
    totalWorkspaceCount:1,visibleWorkspaceCount:1,imageViewCount:1,emptyStateCount:1,cameraPanelCount:0,
  }));
  assert.throws(() => assertExclusiveCameraImageBranch({
    totalWorkspaceCount:1,visibleWorkspaceCount:1,imageViewCount:1,emptyStateCount:1,cameraPanelCount:1,
  }),/XOR/);
  assert.throws(() => assertExclusiveCameraImageBranch({
    totalWorkspaceCount:2,visibleWorkspaceCount:2,imageViewCount:1,emptyStateCount:0,cameraPanelCount:1,
  }),/more than one visible/);
});

test('Run and Stop are mutually exclusive after rapid lifecycle changes',() => {
  assert.doesNotThrow(() => assertRunStopMutualExclusion({ runVisible:true,stopVisible:false,loadingVisible:false }));
  assert.doesNotThrow(() => assertRunStopMutualExclusion({ runVisible:false,stopVisible:true,loadingVisible:false }));
  assert.doesNotThrow(() => assertRunStopMutualExclusion({ runVisible:false,stopVisible:false,loadingVisible:true }));
  assert.throws(() => assertRunStopMutualExclusion({ runVisible:true,stopVisible:true,loadingVisible:false }),/together/);
  assert.throws(() => assertRunStopMutualExclusion({ runVisible:false,stopVisible:false,loadingVisible:false }),/exactly one/);
});

test('browser contract rejects console errors and page errors and does not use Lichtblick iframe evidence',() => {
  assert.doesNotThrow(() => assertNoPageFaults([]));
  assert.throws(() => assertNoPageFaults(['console: Media error']),/console\/page errors/);
  const source = readFileSync(new URL('./camera-world-browser.spec.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/iframe|Lichtblick/i);
  assert.doesNotMatch(source,/XGC_CAMERA_ALLOW_RUN_STOP|test\.skip/);
  assert.match(source,/startOwnedExperimentRun/);
  assert.match(source,/stopOwnedExperimentRun/);
  assert.match(source,/assertStopOwnershipClosure/);
  assert.match(source,/ownedRunId = await startOwnedExperimentRun[\s\S]*await waitForCameraReady/);
  assert.match(source,/finally \{[\s\S]*if \(ownedRunId\) await stopOwnedExperimentRun/);
  assert.match(source,/cameraWorkspaceContract\(target\.panelKind\)/);
  assert.match(source,/cameraVideoContract\(target\)/);
  assert.doesNotMatch(source,/video\.videoWidth === 3840|video\.videoHeight === 2160/);
  assert.doesNotMatch(source,/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i);
});
