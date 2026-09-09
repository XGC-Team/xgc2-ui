// @vitest-environment jsdom

import { beforeEach,describe,expect,it,vi } from 'vitest';
import { request,requestBlob } from '../../api/http';
import {
  decodeCameraExtrinsicResult,
  decodeCameraExtrinsicState,
  freezeCameraExtrinsicFrame,
  loadCameraExtrinsicImage,
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
});

function statePayload() {
  return {
    mode: 'frozen',generation: 3,output_file: null,parent_frame: 'world',child_frame: 'camera',
    source: {
      image_topic: '/camera/image',intrinsic_file: '/camera/sim/usb_cam/intrinsics-20260830T010203.000000Z.yaml',pose_prefix: '/vrpn',
      image_ready: true,intrinsic_ready: true,marker_count: 0,marker_names: [],latest_image_stamp_sec: null,
    },
    frame: null,markers: [],result: null,
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
