import { describe,expect,it } from 'vitest';
import { localMediaEdgeURLForPort } from '../../config/urls';
import type { ProcessInstance } from '../../domains/execution/executionPublic';
import { CAMERA_INTRINSIC_CALIBRATION_DEFINITION_ID } from '../../domains/execution/cameraCalibrationProcessPublic';
import {
  intrinsicLiveCameraOptions,
  intrinsicWorkflowDocument,
  intrinsicWorkflowRuntime,
  projectIntrinsicLifecyclePipeline,
  resolveIntrinsicCalibratorProcess,
  resolveIntrinsicCalibratorOwnerProcessFromRuntime,
  resolveIntrinsicCameraSourceOwnerProcess,
  resolveIntrinsicMediaEdgeOwnerProcessFromRuntime,
} from './cameraIntrinsicWorkspaceModel';
import type { PanelActionPortRuntime } from '../types';

describe('intrinsic workspace workflow projection',() => {
  it('requires workflow summaries and details alongside authored metadata',() => {
    expect(intrinsicWorkflowRuntime({ targetId:'local',documents:[],catalog:[] })).toBeUndefined();
    const runtime = intrinsicWorkflowRuntime({
      targetId:'local',catalog:[],loading:false,error:'',experimentResourceId:'experiment-a',
      documents:[documentFixture()],runSummaries:[],runDetailsById:{},
    });
    expect(intrinsicWorkflowDocument(runtime,portFixture())?.head.resourceId).toBe('camera');
  });

  it('uses only the calibrator explicitly owned by the selected workflow Run',() => {
    const owned = processFixture('owned','panel-run','running');
    const unrelated = processFixture('other','other-run','running');
    expect(resolveIntrinsicCalibratorProcess([unrelated,owned],'panel-run')?.id).toBe('owned');
    expect(resolveIntrinsicCalibratorProcess([unrelated],'panel-run')).toBeUndefined();
    expect(resolveIntrinsicCalibratorProcess([unrelated],'')).toBeUndefined();
  });

  it('follows the exact router child relation to the provider-owned calibrator',() => {
    const runtime = intrinsicWorkflowRuntime({
      targetId:'local',catalog:[],loading:false,error:'',experimentResourceId:'experiment-a',
      documents:[],runSummaries:[],runDetailsById:{
        'panel-router':{
          loading:false,error:'',invocations:[],nodeSummaries:[],relations:{
            runId:'panel-router',childRuns:[{ parentRunId:'panel-router',childRunId:'physical-provider' }],
            childRunGroups:[],childRunGroupMembers:[],waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
          },
        },
      },
    });
    const provider = processFixture('provider-calibrator','physical-provider','running');
    const unrelated = processFixture('other-calibrator','other-provider','running');
    expect(resolveIntrinsicCalibratorProcess(
      [unrelated,provider], 'panel-router',runtime,
    )?.id).toBe('provider-calibrator');
  });

  it('waits for the owned calibrator readiness fact',() => {
    const starting = processFixture('starting','panel-run','running');
    starting.observedState = 'starting';starting.readiness.status = 'unknown';
    expect(resolveIntrinsicCalibratorProcess([starting],'panel-run')).toBeUndefined();
    starting.observedState = 'running';starting.readiness.status = 'passing';
    expect(resolveIntrinsicCalibratorProcess([starting],'panel-run')?.id).toBe('starting');
  });

  it('lets an observer panel resolve the one running intrinsic provider from Experiment runtime',() => {
    const runtime=intrinsicWorkflowRuntime({
      targetId:'local',catalog:[],loading:false,error:'',experimentResourceId:'experiment-a',documents:[],
      runSummaries:[
        { id:'provider-run',status:'running' },{ id:'old-run',status:'succeeded' },
      ],
      runDetailsById:{},
    });
    const calibrator=processFixture('calibrator','provider-run','running');
    const media=processFixture('media','provider-run','running','xgc-media-edge');
    const foreign=processFixture('foreign','foreign-run','running');
    expect(resolveIntrinsicCalibratorOwnerProcessFromRuntime([foreign,calibrator],runtime)?.id)
      .toBe('calibrator');
    expect(resolveIntrinsicMediaEdgeOwnerProcessFromRuntime([media],runtime)?.id).toBe('media');
  });

  it('projects a four-stage calibration pipeline from process facts',() => {
    expect(projectIntrinsicLifecyclePipeline({ phase:'stopped',runActive:false }).stages)
      .toEqual([
        { id:'run',status:'idle' },
        { id:'camera',status:'idle' },
        { id:'media',status:'idle' },
        { id:'calibrator',status:'idle' },
      ]);
    expect(projectIntrinsicLifecyclePipeline({ phase:'stopping',runActive:true }).stages)
      .toEqual([
        { id:'run',status:'stopping' },
        { id:'camera',status:'stopping' },
        { id:'media',status:'stopping' },
        { id:'calibrator',status:'stopping' },
      ]);
    const camera = processFixture('cam','panel-run','running','gazebo-static-camera');
    const media = processFixture('media','panel-run','running','xgc-media-edge');
    media.observedState = 'starting';
    media.readiness.status = 'unknown';
    const failed = processFixture('cal','panel-run','running');
    failed.readiness.status = 'failing';
    failed.observedState = 'failed';
    failed.lastError = 'board missing';
    expect(projectIntrinsicLifecyclePipeline({
      phase:'starting',runActive:true,camera,media,calibrator:failed,
      sourceId:'usb_cam',edgeUrl:'https://media.example.test',
    }).stages).toEqual([
      { id:'run',status:'ready' },
      { id:'camera',status:'ready',identity:'usb_cam',observedState:'running' },
      { id:'media',status:'active',identity:'media.example.test',observedState:'starting' },
      { id:'calibrator',status:'failed',detail:'board missing',observedState:'failed' },
    ]);
  });

  it('resolves the capture source owned by the selected workflow Run',() => {
    const owned = processFixture('cam','panel-run','running','gazebo-static-camera');
    const unrelated = processFixture('other','other-run','running','gazebo-static-camera');
    expect(resolveIntrinsicCameraSourceOwnerProcess([unrelated,owned],'panel-run')?.id).toBe('cam');
    expect(resolveIntrinsicCameraSourceOwnerProcess([unrelated],'panel-run')).toBeUndefined();
  });

  it('takes Media Edge URL and source ID only from authored panel options',() => {
    const edgeUrl = localMediaEdgeURLForPort(28090);
    expect(intrinsicLiveCameraOptions({ edgeUrl,sourceId:'camera_4k' })).toMatchObject({
      edgeUrl,sourceId:'camera_4k',
    });
  });
});

function documentFixture() {
  return {
    head:{ domain:'automation',resourceId:'camera',name:'Camera',tags:[],mainCommitId:'c',currentVersion:1,digest:'d'.repeat(64),revision:1,createdAt:'t',updatedAt:'t' },
    branch:{ domain:'automation',resourceId:'camera',name:'main',headCommitId:'c',headVersion:1,revision:1,createdAt:'t',updatedAt:'t' },
    spec:{ schemaVersion:1,metadata:{ name:'Camera',description:'',tags:[] },targetPolicy:{ mode:'inherit' as const,executionTargetId:'' },actions:[],nodes:[],edges:[],stickyNotes:[] },
  };
}
function portFixture():PanelActionPortRuntime {
  return { id:'calibration',label:'Calibration',connected:true,disabledReason:'',defaults:{},invoke:async () => ({ id:'x',status:'running',revision:1 }),control:async () => undefined,trace:{ automationResourceId:'camera' } };
}
function processFixture(
  id:string,ownerId:string,state:'running'|'stopped',definitionId=CAMERA_INTRINSIC_CALIBRATION_DEFINITION_ID,
):ProcessInstance {
  return {
    id,targetId:'local',definitionId,definitionVersion:'1',definitionDigest:'d'.repeat(64),
    ownerType:'orchestration-run',ownerId,scope:'run',parameters:{},driver:'host',desiredState:state,observedState:state,
    readiness:{ status:state === 'running' ? 'passing' : 'unknown' },liveness:{ status:state === 'running' ? 'passing' : 'unknown' },
    restartCount:0,revision:1,createdAt:'t',updatedAt:'t',
  };
}
