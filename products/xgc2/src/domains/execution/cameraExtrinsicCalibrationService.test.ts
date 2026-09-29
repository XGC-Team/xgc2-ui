// @vitest-environment jsdom

import { beforeEach,describe,expect,it,vi } from 'vitest';
import { request,requestBlob } from '../../api/http';
import {
  decodeCameraExtrinsicResult,
  decodeCameraExtrinsicState,
  freezeCameraExtrinsicFrame,
  loadCameraExtrinsicImage,
  beginCameraExtrinsicSample,commitCameraExtrinsicSampleImage,loadCameraExtrinsicSampleImage,
  cancelCameraExtrinsicSample,removeCameraExtrinsicSample,updateCameraExtrinsicSamplePixel,clearCameraExtrinsicSamples,
  solveCameraExtrinsic,
} from './cameraExtrinsicCalibrationService';

vi.mock('../../api/http', () => ({ request: vi.fn(),requestBlob: vi.fn() }));

describe('cameraExtrinsicCalibrationService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes image reads and typed actions through the selected target proxy', async () => {
    vi.mocked(requestBlob).mockResolvedValue(new Blob());
    vi.mocked(request).mockResolvedValue(statePayload());

    await loadCameraExtrinsicImage('agent/a', 'process/id');
    expect(requestBlob).toHaveBeenCalledWith(
      '/visualization/targets/agent%2Fa/camera-calibration/process%2Fid/api/v1/image.jpg',
      { cache: 'no-store',headers: { Accept: 'image/jpeg' },signal: undefined },
    );

    await expect(freezeCameraExtrinsicFrame('agent/a', 'process/id')).resolves.toMatchObject({
      mode: 'frozen',generation: 3,outputFile: undefined,
    });
    expect(request).toHaveBeenCalledWith(
      '/visualization/targets/agent%2Fa/camera-calibration/process%2Fid/api/v1/freeze',
      { method: 'POST',cache: 'no-store',body: '{}' },
    );
  });

  it('shows the frozen assumed model instead of a subsequently changed source file', () => {
    const payload = {...statePayload(), frame: {width:640,height:480,stamp_sec:123,frame_id:'optical',
      camera_model:{intrinsic_source:'ideal-pinhole',intrinsic_file:'',ideal_horizontal_fov_degrees:110}}};
    expect(decodeCameraExtrinsicState(payload).source).toMatchObject({
      intrinsicFile:'',intrinsicSource:'ideal-pinhole',idealHorizontalFovDegrees:110,
    });
  });

  it('accepts an unsaved solve candidate without an output file', () => {
    expect(decodeCameraExtrinsicResult(result(false))).toMatchObject({
      candidateId:'candidate-1',saved:false,outputFile:undefined,
    });
  });

  it('requires a concrete output file for a saved result', () => {
    expect(() => decodeCameraExtrinsicResult(result(true))).toThrow(
      /output_file is required when result.saved is true/,
    );
    expect(decodeCameraExtrinsicResult({
      ...result(true),output_file:'/camera/sim/usb_cam/extrinsics-20260831T120000.000000Z.yaml',
    })).toMatchObject({ saved:true,outputFile:'/camera/sim/usb_cam/extrinsics-20260831T120000.000000Z.yaml' });
  });

  it('preserves explicit application states and rejects unknown status rather than inferring application from Saved',() => {
    const saved={ ...result(true),output_file:'/camera/sim/usb_cam/extrinsics-20260920T123456.000000Z.yaml' };
    expect(decodeCameraExtrinsicResult(saved).application).toBeUndefined();
    for (const status of ['pending','applied','conflict','unavailable']) {
      expect(decodeCameraExtrinsicResult({ ...saved,application:{ status,applicationId:'private-owner-id' } }).application)
        .toEqual({ status });
    }
    for (const status of ['saved','published','',true,null]) {
      expect(() => decodeCameraExtrinsicResult({ ...saved,application:{ status } }))
        .toThrow('result.application.status is invalid');
    }
  });

  it('transports independent pose fixation, raw native image and revision-owned edits through one exact process',async () => {
    const signal=new AbortController().signal;
    const dataset={ samplingSessionId:'a'.repeat(32),expectedRevision:4 };
    const id='b'.repeat(32);
    vi.mocked(request).mockResolvedValueOnce({ sample_id:id,sampling_session_id:dataset.samplingSessionId,dataset_revision:4,status:'pending',expires_in_seconds:120 });
    await beginCameraExtrinsicSample('agent/a','process/id',{
      ...dataset,requestId:'intent-1',marker:'wand',pixel:[1919,1079],replacesSampleId:'c'.repeat(32),
      display:{ id:'frame-a',sourceId:'front',sourceEpoch:'epoch-a',width:3840,height:2160,clockDomain:'browser-performance',presentedAtMs:42,mediaTimeSec:0 },
    },signal);
    const body=JSON.parse(String(vi.mocked(request).mock.calls[0][1]?.body));
    expect(body).toEqual({ sampling_session_id:dataset.samplingSessionId,expected_revision:4,request_id:'intent-1',
      marker:'wand',pixel:[1919,1079],replaces_sample_id:'c'.repeat(32),
      display:{ id:'frame-a',source_id:'front',source_epoch:'epoch-a',width:3840,height:2160,clock_domain:'browser-performance',presented_at_ms:42,media_time_sec:0 } });
    expect(body).not.toHaveProperty('world');
    expect(vi.mocked(request).mock.calls[0][1]?.signal).toBe(signal);

    const image=new Blob(['native frame A'],{ type:'image/png' });
    vi.mocked(request).mockResolvedValue(statePayload());
    await commitCameraExtrinsicSampleImage('agent/a','process/id',id,image,signal);
    expect(request).toHaveBeenLastCalledWith(`/visualization/targets/agent%2Fa/camera-calibration/process%2Fid/api/v1/samples/${id}/image`,{
      method:'POST',cache:'no-store',headers:{ 'Content-Type':'image/png' },body:image,signal,
    });
    await loadCameraExtrinsicSampleImage('agent/a','process/id',id,signal);
    expect(requestBlob).toHaveBeenLastCalledWith(expect.stringContaining(`/samples/${id}/image`),{ cache:'no-store',headers:{ Accept:'image/png, image/jpeg' },signal });
    await updateCameraExtrinsicSamplePixel('local','p',dataset,id,[100,200],signal);
    expect(JSON.parse(String(vi.mocked(request).mock.lastCall?.[1]?.body))).toEqual({ sampling_session_id:dataset.samplingSessionId,expected_revision:4,sample_id:id,pixel:[100,200] });
    await removeCameraExtrinsicSample('local','p',dataset,id,signal);
    expect(JSON.parse(String(vi.mocked(request).mock.lastCall?.[1]?.body))).toEqual({ sampling_session_id:dataset.samplingSessionId,expected_revision:4,sample_id:id });
    await clearCameraExtrinsicSamples('local','p',dataset,signal);
    expect(JSON.parse(String(vi.mocked(request).mock.lastCall?.[1]?.body))).toEqual({ sampling_session_id:dataset.samplingSessionId,expected_revision:4 });
    await cancelCameraExtrinsicSample('local','p',dataset.samplingSessionId,id);
    expect(JSON.parse(String(vi.mocked(request).mock.lastCall?.[1]?.body))).toEqual({ sampling_session_id:dataset.samplingSessionId,sample_id:id });
    vi.mocked(request).mockResolvedValue({ ...result(false),dataset_revision:4 });
    await solveCameraExtrinsic('local','p',dataset,signal);
    expect(JSON.parse(String(vi.mocked(request).mock.lastCall?.[1]?.body))).toEqual({ sampling_session_id:dataset.samplingSessionId,expected_revision:4 });
  });

  it('decodes same-marker samples independently and rejects substituted image authority or malformed evidence',() => {
    const first=samplePayload('b'.repeat(32)),second={ ...samplePayload('c'.repeat(32)),world:[1,2,3] };
    const decoded=decodeCameraExtrinsicState({ ...statePayload(),samples:[first,second] });
    expect(decoded.samples.map((sample) => [sample.sampleId,sample.marker,sample.world])).toEqual([
      [first.sample_id,'wand',[0,0,0]],[second.sample_id,'wand',[1,2,3]],
    ]);
    expect(decoded.samples[0]?.display).toMatchObject({ width:3840,height:2160,sourceId:'front',clockDomain:'browser-performance' });
    for (const bad of [
      { ...first,image:{ ...first.image,path:'http://elsewhere/image.png' } },
      { ...first,image:{ ...first.image,width:1920 } },
      { ...first,pixel:[3840,0] },
      { ...first,world:[NaN,0,0] },
      { ...first,pose_observation:{ ...first.pose_observation,source_clock:'browser-performance' } },
    ]) expect(() => decodeCameraExtrinsicState({ ...statePayload(),samples:[bad] })).toThrow();
    expect(() => decodeCameraExtrinsicState({ ...statePayload(),samples:[first,first] })).toThrow(/unique/);
  });

  it('refuses invalid raw image uploads before transport',async () => {
    await expect(commitCameraExtrinsicSampleImage('local','p','../foreign',new Blob(['x'],{ type:'image/png' }))).rejects.toThrow();
    await expect(commitCameraExtrinsicSampleImage('local','p','b'.repeat(32),new Blob(['x'],{ type:'text/plain' }))).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});

function statePayload() {
  return {
    sampling_session_id:'a'.repeat(32),dataset_revision:0,samples:[],
    sample_limits:{ image_bytes:33554432,image_pixels:16777216,samples:64,pending:4,total_image_bytes:268435456,pending_seconds:120 },
    mode: 'frozen',generation: 3,output_file: null,parent_frame: 'world',child_frame: 'camera',
    source: {
      source_id:'front',
      image_topic: '/camera/image',intrinsic_file: '/camera/sim/usb_cam/intrinsics-20260830T010203.000000Z.yaml',pose_prefix: '/vrpn',
      image_ready: true,intrinsic_ready: true,marker_count: 0,marker_names: [],latest_image_stamp_sec: null,
    },
    frame: null,markers: [],result: null,
  };
}

function samplePayload(id:string) {
  return { sample_id:id,marker:'wand',pixel:[100,200],world:[0,0,0],source_world:[0,0,0],
    display:{ id:'frame-a',source_id:'front',source_epoch:'epoch-a',width:3840,height:2160,clock_domain:'browser-performance',presented_at_ms:12 },
    pose_observation:{ observation_id:'pose-a',frame_id:'world',source_stamp_sec:123,source_clock:'ros',received_at_sec:124,received_clock:'unix',received_monotonic_sec:10 },
    camera_model_id:'model-a',pose_coordinate_id:'world-a',
    image:{ path:`api/v1/samples/${id}/image`,mime_type:'image/png',sha256:'d'.repeat(64),width:3840,height:2160 },
  };
}

function result(saved: boolean) {
  return {
    candidate_id:'candidate-1',saved,output_file:null,
    translation:[1,2,3],quaternion_xyzw:[0,0,0,1],
    mean_reprojection_error_px:0.1,max_reprojection_error_px:0.2,
    inlier_indices:[0,1,2,3],warnings:[],projections:[],points:[],
  };
}
