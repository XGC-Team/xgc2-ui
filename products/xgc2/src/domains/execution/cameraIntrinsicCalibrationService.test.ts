// @vitest-environment jsdom

import { beforeEach,describe,expect,it,vi } from 'vitest';
import { request,requestBlob } from '../../api/http';
import {
  analyzeCameraIntrinsicCandidate,
  autoRunCameraIntrinsic,
  captureCameraIntrinsicValidation,
  commitCameraIntrinsicAsset,
  continueCameraIntrinsicCollection,
  decodeCameraIntrinsicCandidate,
  decodeCameraIntrinsicResult,
  decodeCameraIntrinsicState,
  decodeCameraIntrinsicValidationReport,
  gotoCameraIntrinsicTarget,
  loadCameraIntrinsicEvidence,
  loadCameraIntrinsicImage,
  loadCameraIntrinsicCalibrationFiles,
  loadCameraIntrinsicReference,
  loadCameraIntrinsicValidationImage,
  resetCameraIntrinsicPose,
  saveCameraIntrinsicCandidate,
  startCameraIntrinsicAutoCapture,
  stopCameraIntrinsicAutoCapture,
} from './cameraIntrinsicCalibrationService';

vi.mock('../../api/http', () => ({ request: vi.fn(),requestBlob: vi.fn(),waitForTransportRetry:vi.fn().mockResolvedValue(undefined) }));

describe('cameraIntrinsicCalibrationService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('waits on the exact accepted job without repeating the candidate POST', async () => {
    const job={ id:'job-1',status:'running',stage:'validating',completed:0,total:17,error:null };
    vi.mocked(request).mockResolvedValueOnce({ accepted:true,job })
      .mockResolvedValueOnce(statePayload({ solve_job:job,candidate_pool:{ count:17,image_size:[1280,720],solve_frozen:true } }))
      .mockResolvedValueOnce(statePayload({
        phase:'candidate_ready',candidate:candidatePayload(),
        candidate_pool:{ count:17,image_size:[1280,720],solve_frozen:true },
        solve_job:{ ...job,status:'succeeded',stage:'complete',completed:17 },
      }));
    expect((await analyzeCameraIntrinsicCandidate('local','process-1')).candidateId).toBe('candidate-1');
    expect(vi.mocked(request).mock.calls.filter((call) => call[1]?.method==='POST')).toHaveLength(1);
  });

  it('recovers a transient polling timeout without submitting another solve', async () => {
    const job={ id:'job-1',status:'running',stage:'validating',completed:0,total:17,error:null };
    vi.mocked(request).mockResolvedValueOnce({ accepted:true,job })
      .mockRejectedValueOnce(new Error('request timeout after 8000ms: /state'))
      .mockResolvedValueOnce(statePayload({ phase:'candidate_ready',candidate:candidatePayload(),
        candidate_pool:{ count:17,image_size:[1280,720],solve_frozen:true },
        solve_job:{ ...job,status:'succeeded',stage:'complete',completed:17 } }));
    expect((await analyzeCameraIntrinsicCandidate('local','process-1')).candidateId).toBe('candidate-1');
    expect(vi.mocked(request).mock.calls.filter((call) => call[1]?.method==='POST')).toHaveLength(1);
  });

  it('stops polling after repeated transport failures', async () => {
    const job={ id:'job-1',status:'running',stage:'validating',completed:0,total:17,error:null };
    vi.mocked(request).mockResolvedValueOnce({ accepted:true,job });
    for (let attempt=0;attempt<3;attempt++) vi.mocked(request).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(analyzeCameraIntrinsicCandidate('local','process-1')).rejects.toThrow('Failed to fetch');
    expect(vi.mocked(request)).toHaveBeenCalledTimes(4);
  });

  it('rejects replaced and failed jobs without committing a candidate', async () => {
    const job={ id:'job-1',status:'running',stage:'solving',completed:0,total:17,error:null };
    vi.mocked(request).mockResolvedValueOnce({ accepted:true,job })
      .mockResolvedValueOnce(statePayload({ solve_job:{ ...job,id:'another-job' },candidate_pool:{ count:17,image_size:[1280,720],solve_frozen:true } }));
    await expect(analyzeCameraIntrinsicCandidate('local','process-1')).rejects.toThrow('session changed');
    vi.mocked(request).mockResolvedValueOnce({ accepted:true,job })
      .mockResolvedValueOnce(statePayload({ solve_job:{ ...job,status:'failed',error:'Samples retained' } }));
    await expect(analyzeCameraIntrinsicCandidate('local','process-1')).rejects.toThrow('Samples retained');
  });

  it('decodes the ROS backend state into the native panel contract', () => {
    const state = decodeCameraIntrinsicState(statePayload({
      action: {
        name: 'auto_run',status: 'running',target_index: 2,target_name: 'left',error: null,
      },
    }));

    expect(state).toMatchObject({
      mode:'intrinsic',phase:'collecting',sessionRevision:1,collectionRevision:17,
      samples:17,candidatePool:{ count:17,imageSize:[1280,720],solveFrozen:false },
      imageReady: true,imageTopic: 'usb_cam',
      board: { size: [7,5],squareSizeM: 0.2 },next: 1,cameraControl: true,
      autoCapture: { enabled:false,intervalSeconds:0.5,lastError:null,coverageComplete:false },
      guidance:{ complete:false,dimension:'Size',direction:'closer',progress:0.75 },
      resultRestored:false,
      evidence:{ available:false,sampleCount:0,filename:'' },
      recovery:{ checkpointFile:'/tmp/intrinsics.yaml.session.npz',checkpointAvailable:true,resultRestored:false,lastError:null },
      action: { name: 'auto_run',status: 'running',targetIndex: 2,targetName: 'left',error: null },
      detection: {
        status:'detected',cornerCount:35,expectedCornerCount:35,frameWidth:1280,frameHeight:720,
        sequence:42,accepted:true,duplicate:false,
      },
    });
    expect(state.coverage[2]).toEqual({ label: 'Size',progress: 0.75 });
    expect(state.targets[1]).toEqual({ name: 'near',position: [0.2,0,1.5],done: false,hasRef: true });
    expect(state.pose).toEqual({ x: -4,y: 0,z: 1.5,qx: 0,qy: 0,qz: 0,qw: 1 });
    expect(state.detection.metrics[2]).toEqual({ label:'Size',value:0.36 });
    expect(state.candidate).toBeUndefined();
    expect(state.result).toBeUndefined();
  });

  it('decodes an AprilGrid board document from the physical calibrator', () => {
    const state = decodeCameraIntrinsicState(statePayload({
      board: {
        type: 'aprilgrid',size: [6,6],square_size_m: 0.088,
        tag_family: 'tag36h11',tag_spacing_m: 0.0264,start_id: 0,end_id: 35,
      },
    }));
    expect(state.board).toEqual({
      type: 'aprilgrid',size: [6,6],squareSizeM: 0.088,
      tagFamily: 'tag36h11',tagSpacingM: 0.0264,startId: 0,endId: 35,
    });
  });

  it('accepts the backend zero-delay continuous detection contract',() => {
    expect(decodeCameraIntrinsicState(statePayload({
      auto_capture:{ enabled:false,interval_seconds:0,last_error:null,coverage_complete:false },
    })).autoCapture).toMatchObject({ enabled:false,intervalSeconds:0 });
    expect(decodeCameraIntrinsicState(statePayload({
      auto_capture:{ enabled:true,interval_seconds:0,last_error:null,coverage_complete:false },
    })).autoCapture).toMatchObject({ enabled:true,intervalSeconds:0 });
  });

  it('keeps nullable state semantics and decodes a completed calibration', () => {
    const state = decodeCameraIntrinsicState(statePayload({
      phase:'saved',
      result:resultPayload(),output_file:'/tmp/intrinsics.yaml',saved_candidate_id:'candidate-1',
      next:null,pose:null,action:null,
    }));

    expect(state.next).toBeNull();
    expect(state.pose).toBeNull();
    expect(state.action).toBeUndefined();
    expect(state.result).toEqual({
      cameraMatrix: [800,0,640,0,805,360,0,0,1],distortion: [-0.1,0.02,0,0,0],
      fx: 800,fy: 805,cx: 640,cy: 360,imageWidth: 1280,imageHeight: 720,
      rmsReprojectionErrorPx:0.31,sampleCount:17,candidateId:'candidate-1',phase:'saved',
      sessionRevision:3,collectionRevision:17,saved:true,outputFile:'/tmp/intrinsics.yaml',
    });
  });

  it('rejects malformed state, result, and action payloads', () => {
    expect(() => decodeCameraIntrinsicState(statePayload({ coverage: [{ label: 'X',progress: 1.1 }] })))
      .toThrow(/state\.coverage\[0\]\.progress/);
    expect(() => decodeCameraIntrinsicState(statePayload({ next: 9 }))).toThrow(/state\.next/);
    expect(() => decodeCameraIntrinsicState(statePayload({ next: undefined }))).toThrow(/state\.next/);
    expect(() => decodeCameraIntrinsicState(statePayload({ action: {
      name: 'auto_run',status: 'done',target_index: null,target_name: null,error: null,
    } }))).toThrow(/state\.action\.status/);
    expect(() => decodeCameraIntrinsicState(statePayload({ detection: {
      ...detectionPayload(),status:'maybe',
    } }))).toThrow(/state\.detection\.status/);
    expect(() => decodeCameraIntrinsicState(statePayload({ auto_capture: {
      enabled:true,interval_seconds:-0.1,last_error:null,coverage_complete:false,
    } }))).toThrow(/state\.auto_capture\.interval_seconds must be non-negative/);
    expect(() => decodeCameraIntrinsicState(statePayload({ auto_capture: {
      enabled:true,interval_seconds:10.1,last_error:null,coverage_complete:false,
    } }))).toThrow(/state\.auto_capture\.interval_seconds must be at most 10 seconds/);
    expect(() => decodeCameraIntrinsicState(statePayload({ evidence: {
      available:true,sample_count:0,filename:'',
    } }))).toThrow(/state\.evidence available bundle/);
    expect(() => decodeCameraIntrinsicResult({ ...resultPayload(),camera_matrix: [1,2,3] }))
      .toThrow(/camera_matrix/);
    expect(() => decodeCameraIntrinsicCandidate({
      ...candidatePayload(),quality:{
        ...candidatePayload().quality,status:'save_ready',reasons:['not-empty'],
      },
    })).toThrow(/reasons must agree/);
    expect(() => decodeCameraIntrinsicState(statePayload({
      phase:'candidate_ready',candidate:candidatePayload(),
      candidate_pool:{ count:17,image_size:[1280,720],solve_frozen:false },
    }))).toThrow(/candidate pool must be frozen/);
  });

  it('decodes one unsaved independently assessed candidate',() => {
    expect(decodeCameraIntrinsicCandidate(candidatePayload())).toMatchObject({
      candidateId:'candidate-1',phase:'candidate_ready',saved:false,outputFile:null,
      quality:{
        status:'save_ready',reasons:[],assessment:{
          method:'detector_uncertainty_plus_three_sigma_mad',passed:true,
          heldOutRmsMaximumPx:0.42,confidenceLimitPx:0.8,
        },
      },
    });
    const state=decodeCameraIntrinsicState(statePayload({
      phase:'candidate_ready',candidate:candidatePayload(),
      candidate_pool:{ count:17,image_size:[1280,720],solve_frozen:true },
    }));
    expect(state.phase).toBe('candidate_ready');
    if (state.phase!=='candidate_ready') throw new Error('candidate phase expected');
    expect(state.candidate.candidateId).toBe('candidate-1');
    expect(state.outputFile).toBeUndefined();
  });

  it('decodes the compact auto-run candidate receipt without a second result payload',() => {
    const quality=candidatePayload().quality;
    const state=decodeCameraIntrinsicState(statePayload({
      action:{
        name:'auto_run',status:'succeeded',target_index:14,target_name:'final',error:null,
        result:{ candidate_id:'candidate-1',quality },
      },
    }));
    expect(state.action?.result).toEqual({
      candidateId:'candidate-1',
      quality:expect.objectContaining({ status:'save_ready' }),
    });
    expect(() => decodeCameraIntrinsicState(statePayload({
      action:{
        name:'auto_run',status:'succeeded',target_index:14,target_name:'final',error:null,
        result:{ candidate_id:'candidate-1',quality,phase:'candidate_ready' },
      },
    }))).toThrow(/must contain only candidate_id and quality/);
  });

  it('uses the intrinsic proxy paths and validates successful action payloads', async () => {
    vi.mocked(requestBlob).mockResolvedValue(new Blob());
    vi.mocked(request)
      .mockResolvedValueOnce({ ok: true,name: 'near' })
      .mockResolvedValueOnce({ ok: true });

    await loadCameraIntrinsicImage('agent-a', 'process/id');
    expect(requestBlob).toHaveBeenNthCalledWith(1,
      '/visualization/targets/agent-a/camera-calibration/process%2Fid/api/v1/intrinsic/image.jpg',
      { cache: 'no-store',headers: { Accept: 'image/jpeg' },signal: undefined },
    );
    await loadCameraIntrinsicReference('agent-a', 'process/id', 3);
    expect(requestBlob).toHaveBeenNthCalledWith(2,
      '/visualization/targets/agent-a/camera-calibration/process%2Fid/api/v1/intrinsic/ref/3.jpg',
      { cache: 'no-store',headers: { Accept: 'image/jpeg' },signal: undefined },
    );
    await loadCameraIntrinsicEvidence('agent-a','process/id');
    expect(requestBlob).toHaveBeenNthCalledWith(3,
      '/visualization/targets/agent-a/camera-calibration/process%2Fid/api/v1/intrinsic/evidence.zip',
      { cache:'no-store',headers:{ Accept:'application/zip' },signal:undefined },
    );
    await expect(gotoCameraIntrinsicTarget('agent-a', 'process/id', 1)).resolves.toEqual({ ok: true,name: 'near' });
    await expect(resetCameraIntrinsicPose('agent-a', 'process/id')).resolves.toEqual({ ok: true });
    expect(() => loadCameraIntrinsicReference('agent-a', 'process/id', -1)).toThrow(/reference index/);
  });

  it('lists versioned intrinsics and captures typed comparison images',async () => {
    vi.mocked(request)
      .mockResolvedValueOnce({
        items:[{
          id:'intrinsics-20260830T120000.000000Z.yaml',created_at:'2026-08-30T12:00:00Z',
          image_width:3840,image_height:2160,rms_reprojection_error_px:0.31,sample_count:40,latest:true,validated:true,
          file_sha256:'f'.repeat(64),board_profile:'field_6x6_88mm_30pct',
          feature_model:'aprilgrid_kalibr_tag_corners_v2',quality_contract:'xgc2.camera.intrinsic-quality.v2',
          quality_passed:true,algorithm:{ sha256:'a'.repeat(64) },
        }],
        selected:'intrinsics-20260830T120000.000000Z.yaml',
      })
      .mockResolvedValueOnce({
        schema:'xgc2.camera.intrinsic-validation.v2',generation:2,
        configurations:{
          reference:{ kind:'raw' },
          comparison:{ kind:'calibration',calibration_id:'intrinsics-20260830T120000.000000Z.yaml',
            calibration_created_at:'2026-08-30T12:00:00Z' },
        },
        captured_at:'2026-08-30T12:01:00Z',
        source_image_size:[3840,2160],analysis_image_size:[3840,2160],
        remap_delta_px:{ mean:4.2,maximum:18.5 },default_view:'overlay_checker',
        views:[{ id:'overlay_checker',label:'Grid comparison',description:'Alternating tiles.' }],
      });
    vi.mocked(requestBlob).mockResolvedValue(new Blob(['jpeg'],{ type:'image/jpeg' }));

    await expect(loadCameraIntrinsicCalibrationFiles('local','process/id')).resolves.toEqual({
      items:[expect.objectContaining({
        id:'intrinsics-20260830T120000.000000Z.yaml',imageWidth:3840,imageHeight:2160,latest:true,validated:true,
      })],
      selected:'intrinsics-20260830T120000.000000Z.yaml',
    });
    await expect(captureCameraIntrinsicValidation(
      'local','process/id',{
        reference:{ kind:'raw' },
        comparison:{ kind:'calibration',calibrationId:'intrinsics-20260830T120000.000000Z.yaml' },
      },
    )).resolves.toMatchObject({
      generation:2,defaultView:'overlay_checker',remapMeanPx:4.2,remapMaximumPx:18.5,
      sourceImageSize:[3840,2160],analysisImageSize:[3840,2160],
      referenceConfiguration:{ kind:'raw' },
      comparisonConfiguration:{
        kind:'calibration',calibrationId:'intrinsics-20260830T120000.000000Z.yaml',
      },
    });
    await loadCameraIntrinsicValidationImage('local','process/id','overlay_checker',2);

    expect(request).toHaveBeenNthCalledWith(1,
      '/visualization/targets/local/camera-calibration/process%2Fid/api/v1/intrinsic/calibrations',
      { cache:'no-store',signal:undefined },
    );
    expect(request).toHaveBeenNthCalledWith(2,
      '/visualization/targets/local/camera-calibration/process%2Fid/api/v1/intrinsic/validation',
      { method:'POST',cache:'no-store',body:JSON.stringify({
        reference:{ kind:'raw' },
        comparison:{ kind:'calibration',calibration_id:'intrinsics-20260830T120000.000000Z.yaml' },
      }) },
      { timeoutMs:30_000 },
    );
    expect(requestBlob).toHaveBeenCalledWith(
      '/visualization/targets/local/camera-calibration/process%2Fid/api/v1/intrinsic/validation/image/overlay_checker.jpg?generation=2',
      { cache:'no-store',headers:{ Accept:'image/jpeg' },signal:undefined },
    );
  });

  it('rejects the removed one-calibration validation report',() => {
    expect(() => decodeCameraIntrinsicValidationReport({
      schema:'xgc2.camera.intrinsic-validation.v1',generation:1,
      calibration_id:'intrinsics-legacy.yaml',calibration_created_at:'2026-08-29T12:00:00Z',
      captured_at:'2026-08-30T12:01:00Z',source_image_size:[3840,2160],analysis_image_size:[3840,2160],
      remap_px:{ mean:1.25,maximum:6.5 },default_view:'raw',
      views:[{ id:'raw',label:'Raw capture',description:'Immutable source.' }],
    })).toThrow(/must be v2/);
  });

  it('starts and stops bounded physical automatic capture through the trusted proxy', async () => {
    vi.mocked(request)
      .mockResolvedValueOnce({ ok:true,auto_capture:{
        enabled:true,interval_seconds:0,last_error:null,coverage_complete:false,
      } })
      .mockResolvedValueOnce({ ok:true,auto_capture:{
        enabled:false,interval_seconds:0,last_error:null,coverage_complete:false,
      } });

    await expect(startCameraIntrinsicAutoCapture('local','physical-1')).resolves.toMatchObject({
      ok:true,autoCapture:{ enabled:true,intervalSeconds:0 },
    });
    await expect(stopCameraIntrinsicAutoCapture('local','physical-1')).resolves.toMatchObject({
      ok:true,autoCapture:{ enabled:false },
    });
    expect(request).toHaveBeenNthCalledWith(1,
      '/visualization/targets/local/camera-calibration/physical-1/api/v1/intrinsic/auto_capture/start',
      { method:'POST',cache:'no-store',body:'{}' },undefined,
    );
  });

  it('accepts only the asynchronous auto-run protocol', async () => {
    vi.mocked(request)
      .mockResolvedValueOnce({
        accepted: true,
        action: { name: 'auto_run',status: 'running',target_index: null,target_name: null,error: null },
      })
      .mockResolvedValueOnce({ ok: true });

    await expect(autoRunCameraIntrinsic('agent-a', 'process-1')).resolves.toEqual({
      accepted: true,
      action: { name: 'auto_run',status: 'running',targetIndex: null,targetName: null,error: null },
    });
    expect(request).toHaveBeenCalledWith(
      '/visualization/targets/agent-a/camera-calibration/process-1/api/v1/intrinsic/auto_run',
      { method: 'POST',cache: 'no-store',body: '{}' },
      { timeoutMs: 30_000 },
    );

    await expect(autoRunCameraIntrinsic('agent-a', 'process-1')).rejects.toThrow(/accepted must be true/);
  });

  it('analyzes, saves, and continues through three disjoint mutation routes',async () => {
    vi.mocked(request)
      .mockResolvedValueOnce(candidatePayload())
      .mockResolvedValueOnce(resultPayload())
      .mockResolvedValueOnce(statePayload());

    await expect(analyzeCameraIntrinsicCandidate('local','process-1')).resolves.toMatchObject({
      candidateId:'candidate-1',saved:false,
    });
    await expect(saveCameraIntrinsicCandidate('local','process-1','candidate-1')).resolves.toMatchObject({
      candidateId:'candidate-1',saved:true,outputFile:'/tmp/intrinsics.yaml',
    });
    await expect(continueCameraIntrinsicCollection('local','process-1')).resolves.toMatchObject({
      phase:'collecting',candidatePool:{ solveFrozen:false },
    });

    expect(request).toHaveBeenNthCalledWith(1,
      '/visualization/targets/local/camera-calibration/process-1/api/v1/intrinsic/candidate',
      { method:'POST',cache:'no-store',body:'{}' },undefined,
    );
    expect(request).toHaveBeenNthCalledWith(2,
      '/visualization/targets/local/camera-calibration/process-1/api/v1/intrinsic/save',
      { method:'POST',cache:'no-store',body:JSON.stringify({ candidate_id:'candidate-1' }) },undefined,
    );
    expect(request).toHaveBeenNthCalledWith(3,
      '/visualization/targets/local/camera-calibration/process-1/api/v1/intrinsic/continue',
      { method:'POST',cache:'no-store',body:'{}' },undefined,
    );
    await expect(saveCameraIntrinsicCandidate('local','process-1',' ')).rejects.toThrow(/candidate id/);
  });

  it('commits the supervised result as an immutable Calibration Asset pin', async () => {
    vi.mocked(request).mockResolvedValue({
      resourceId:'asset-1',commitId:'commit-2',version:2,digest:'a'.repeat(64),
    });
    await expect(commitCameraIntrinsicAsset('local', 'process-1', {
      assetName:'Gazebo camera simulation intrinsics',cameraSourceId:'usb_cam',idempotencyKey:'request-1',
    })).resolves.toEqual({ resourceId:'asset-1',commitId:'commit-2',version:2,digest:'a'.repeat(64) });
    expect(request).toHaveBeenCalledWith(
      '/visualization/targets/local/camera-calibration/process-1/api/v1/intrinsic/commit-asset',
      { method:'POST',cache:'no-store',body:JSON.stringify({
        namespacePath:'/',assetName:'Gazebo camera simulation intrinsics',
        cameraSourceId:'usb_cam',idempotencyKey:'request-1',
      }) },
      undefined,
    );
  });
});

function statePayload(overrides: Record<string,unknown> = {}) {
  const payload:Record<string,unknown> = {
    mode:'intrinsic',phase:'collecting',session_revision:1,collection_revision:17,
    samples:17,candidate_pool:{ count:17,image_size:[1280,720],solve_frozen:false },
    coverage: [
      { label: 'X',progress: 1 },{ label: 'Y',progress: 0.8 },
      { label: 'Size',progress: 0.75 },{ label: 'Skew',progress: 1 },
    ],
    result_restored:false,
    image_ready: true,media_source: 'usb_cam',
    board: { size: [7,5],square_size_m: 0.2 },
    targets: [
      { name: 'far',position: [-4,0,1.5],done: true,has_ref: true },
      { name: 'near',position: [0.2,0,1.5],done: false,has_ref: true },
    ],
    next: 1,pose: { x: -4,y: 0,z: 1.5,qx: 0,qy: 0,qz: 0,qw: 1 },camera_control: true,
    auto_capture:{ enabled:false,interval_seconds:0.5,last_error:null,coverage_complete:false },
    guidance:{ complete:false,dimension:'Size',direction:'closer',progress:0.75 },
    recovery:{
      checkpoint_file:'/tmp/intrinsics.yaml.session.npz',checkpoint_available:true,
      result_restored:false,last_error:null,
    },
    evidence:{ available:false,sample_count:0,filename:'' },
    detection:detectionPayload(),
    ...overrides,
  };
  if (payload.phase==='saved') delete payload.candidate_pool;
  return payload;
}

function detectionPayload() {
  return {
    status:'detected',corner_count:35,expected_corner_count:35,frame_width:1280,frame_height:720,
    sequence:42,metrics:[
      { label:'X',value:0.18 },{ label:'Y',value:0.72 },
      { label:'Size',value:0.36 },{ label:'Skew',value:0.51 },
    ],accepted:true,duplicate:false,
  };
}

function resultPayload() {
  return {
    camera_matrix: [800,0,640,0,805,360,0,0,1],distortion: [-0.1,0.02,0,0,0],
    fx: 800,fy: 805,cx: 640,cy: 360,image_width: 1280,image_height: 720,
    rms_reprojection_error_px:0.31,sample_count:17,candidate_id:'candidate-1',
    phase:'saved',session_revision:3,collection_revision:17,saved:true,
    output_file:'/tmp/intrinsics.yaml',
  };
}

function candidatePayload() {
  return {
    camera_matrix:[800,0,640,0,805,360,0,0,1],distortion:[-0.1,0.02,0,0,0],
    fx:800,fy:805,cx:640,cy:360,image_width:1280,image_height:720,
    rms_reprojection_error_px:0.31,sample_count:17,candidate_id:'candidate-1',
    phase:'candidate_ready',session_revision:2,collection_revision:17,saved:false,
    output_file:null,save_blocked:'explicit_save_required',diagnostics:{ available:true },
    quality:{
      status:'save_ready',reasons:[],assessment:{
        method:'detector_uncertainty_plus_three_sigma_mad',detector_uncertainty_px:0.25,
        training_per_view_median_px:0.3,training_robust_sigma_px:0.05,
        confidence_limit_px:0.8,held_out_rms_max_px:0.42,
        undistorted_ray_max_equivalent_px:0.38,normalized_ray_confidence_limit_px:0.85,
        passed:true,
      },
    },
  };
}
