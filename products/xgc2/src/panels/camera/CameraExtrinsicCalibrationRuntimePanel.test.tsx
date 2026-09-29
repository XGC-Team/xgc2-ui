// @vitest-environment jsdom
import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import type { CameraExtrinsicSample,CameraExtrinsicSampleInput,CameraExtrinsicState } from '../../domains/execution/cameraCalibrationProcessPublic';
import type * as CalibrationModule from '../../domains/execution/cameraCalibrationProcessPublic';
import { CameraExtrinsicCalibrationRuntimePanel } from './CameraExtrinsicCalibrationRuntimePanel';
import type { CameraVideoLatchedFrame,CameraVideoObservationPort } from './cameraVideoSurfaceTypes';
import { cameraPixelForClientPoint } from './cameraExtrinsicPixel';

const execution=vi.hoisted(() => ({ revision:0 }));
const api=vi.hoisted(() => ({ state:vi.fn(),image:vi.fn(),begin:vi.fn(),commit:vi.fn(),cancel:vi.fn(),remove:vi.fn(),pixel:vi.fn(),clear:vi.fn(),solve:vi.fn(),save:vi.fn() }));
vi.mock('../../domains/execution/cameraCalibrationProcessPublic',async (original) => ({
  ...await original<typeof CalibrationModule>(),loadCameraExtrinsicState:api.state,loadCameraExtrinsicSampleImage:api.image,
  beginCameraExtrinsicSample:api.begin,commitCameraExtrinsicSampleImage:api.commit,cancelCameraExtrinsicSample:api.cancel,
  removeCameraExtrinsicSample:api.remove,updateCameraExtrinsicSamplePixel:api.pixel,clearCameraExtrinsicSamples:api.clear,
  solveCameraExtrinsic:api.solve,saveCameraExtrinsicCandidate:api.save,
}));
vi.mock('../../domains/groundStationInteraction/groundStationInteractionPublic',() => ({ useGroundStationErrorNotification:vi.fn(),useGroundStationNotification:vi.fn() }));
vi.mock('../../domains/execution/executionPublic',() => ({ useExecutionTarget:() => ({ processInstances:[{ id:'calibrator-1',revision:execution.revision }] }) }));
let backend:CameraExtrinsicState,sequence=0;
beforeEach(() => {
  vi.resetAllMocks();sequence=0;execution.revision=0;backend=state();
  vi.stubGlobal('URL',class extends URL { static createObjectURL=vi.fn(() => 'blob:sample-image');static revokeObjectURL=vi.fn(); });
  api.state.mockImplementation(async () => backend);api.image.mockResolvedValue(new Blob(['A'],{ type:'image/png' }));api.cancel.mockResolvedValue(undefined);
  api.begin.mockImplementation(async (_target,_process,input:CameraExtrinsicSampleInput) => ({ sampleId:String(++sequence).padStart(32,'0'),samplingSessionId:input.samplingSessionId,datasetRevision:input.expectedRevision,expiresInSeconds:120 }));
  api.commit.mockImplementation(async (_target,_process,id:string) => {
    const input=api.begin.mock.lastCall![2] as CameraExtrinsicSampleInput;
    const next={ ...sample(sequence),sampleId:id,marker:input.marker,pixel:input.pixel,display:input.display };
    backend={ ...backend,datasetRevision:backend.datasetRevision+1,result:undefined,samples:input.replacesSampleId
      ? backend.samples.map((point) => point.sampleId===input.replacesSampleId ? next : point) : [...backend.samples,next] };return backend;
  });
  api.remove.mockImplementation(async (_target,_process,_ref,id:string) => {
    backend={ ...backend,datasetRevision:backend.datasetRevision+1,result:undefined,samples:backend.samples.filter((point) => point.sampleId!==id) };return backend;
  });
  api.pixel.mockImplementation(async (_target,_process,_ref,id:string,pixel:readonly [number,number]) => {
    backend={ ...backend,datasetRevision:backend.datasetRevision+1,result:undefined,samples:backend.samples.map((point) => point.sampleId===id ? { ...point,pixel } : point) };return backend;
  });
  api.clear.mockImplementation(async () => { backend={ ...backend,datasetRevision:backend.datasetRevision+1,result:undefined,samples:[] };return backend; });
});
afterEach(() => { cleanup();vi.unstubAllGlobals();vi.restoreAllMocks(); });
const props={ processInstanceId:'calibrator-1',targetId:'agent-a',panelId:'panel-1',liveStage:<div data-testid="webrtc">Original WebRTC track</div> };
const rows=() => document.querySelectorAll('[data-xgc-role="camera-calibration-points"] li');
const stage=() => document.querySelector<HTMLElement>('[data-xgc-role="camera-calibration-image"]')!;
const clickStage=() => fireEvent.click(stage(),{ clientX:320,clientY:240 });
async function ready() { await waitFor(() => expect(screen.getByRole('button',{ name:'Rigid body pose' })).toHaveTextContent('wand')); }

describe('independent extrinsic observations',() => {
  it('captures the same marker repeatedly without Freeze, live JPEG reads or historical live overlays',async () => {
    render(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={observation()} />);await ready();
    expect(screen.queryByRole('button',{ name:'Freeze' })).toBeNull();
    clickStage();await waitFor(() => expect(rows()).toHaveLength(1));clickStage();await waitFor(() => expect(rows()).toHaveLength(2));
    expect(backend.samples.map((point) => point.marker)).toEqual(['wand','wand']);
    expect(new Set(backend.samples.map((point) => point.sampleId)).size).toBe(2);
    expect(backend.samples.map((point) => point.world)).toEqual([[1,0,0],[2,0,0]]);
    expect(screen.getByRole('button',{ name:'Rigid body pose' })).toHaveTextContent('wand');
    expect(api.image).not.toHaveBeenCalled();expect(document.querySelectorAll('.panels-camera-extrinsic-overlay-point')).toHaveLength(0);
  });
  it('begins pose fixation before encoding and uploads latched A even after the live port advances to B',async () => {
    const encoded=deferred<Blob>(),frame=latched('A');frame.encode=vi.fn(() => encoded.promise);
    const port=observation(frame);render(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={port} />);await ready();clickStage();
    expect(api.begin).toHaveBeenCalledOnce();expect(frame.encode).toHaveBeenCalledOnce();
    expect(api.begin.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(frame.encode).mock.invocationCallOrder[0]!);
    expect(api.begin.mock.lastCall![2]).toMatchObject({ marker:'wand',pixel:[1920,1080],display:{ id:'A',width:3840,height:2160 },expectedRevision:0 });
    vi.mocked(port.latch).mockReturnValue(latched('B'));expect(api.commit).not.toHaveBeenCalled();
    const image=new Blob(['native A'],{ type:'image/png' });await act(async () => encoded.resolve(image));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(api.commit).toHaveBeenCalledWith('agent-a','calibrator-1',sample(1).sampleId,image,expect.any(AbortSignal));
    expect(backend.samples[0]?.display.id).toBe('A');expect(frame.release).toHaveBeenCalledOnce();
  });
  it('reviews only its sample image, edits pixels on the scrolled native image and preserves the old pose',async () => {
    backend={ ...state(),datasetRevision:2,samples:[sample(1),sample(2)] };const pose=backend.samples[0]!.poseObservation;
    render(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={observation()} />);await ready();
    fireEvent.click(screen.getByRole('button',{ name:'View sample 1: wand' }));await decodeImage();
    expect(api.image).toHaveBeenCalledWith('agent-a','calibrator-1',sample(1).sampleId,expect.any(AbortSignal));
    expect(document.querySelectorAll('.panels-camera-extrinsic-overlay-point')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button',{ name:'Zoom in' }));expect(stage().style.width).toBe('200%');
    vi.spyOn(stage(),'getBoundingClientRect').mockReturnValue({ left:-300,top:-200,width:1280,height:960,right:980,bottom:760,x:-300,y:-200,toJSON:() => ({}) });
    fireEvent.click(stage(),{ clientX:340,clientY:280 });
    await waitFor(() => expect(api.pixel).toHaveBeenCalledWith('agent-a','calibrator-1',expect.objectContaining({ expectedRevision:2 }),sample(1).sampleId,[1920,1080],expect.any(AbortSignal)));
    expect(backend.samples[0]?.poseObservation).toBe(pose);expect(backend.samples[1]).toEqual(sample(2));expect(api.begin).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button',{ name:'Live' })).toBeEnabled());fireEvent.click(screen.getByRole('button',{ name:'Live' }));
    expect(rows()).toHaveLength(2);expect(document.querySelectorAll('.panels-camera-extrinsic-overlay-point')).toHaveLength(0);expect(screen.getByTestId('webrtc')).toBeInTheDocument();
  });
  it('requires decoded native pixels before editing a fetched sample and locks again after image failure',async () => {
    backend={ ...state(),datasetRevision:1,samples:[sample(1)] };
    render(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={observation()} />);await ready();
    fireEvent.click(screen.getByRole('button',{ name:'View sample 1: wand' }));const image=await screen.findByAltText<HTMLImageElement>('Captured calibration image');
    stageBounds();clickStage();expect(api.pixel).not.toHaveBeenCalled();expect(stage()).not.toHaveAttribute('role','button');
    const decoded=deferred<void>();Object.defineProperty(image,'decode',{ configurable:true,value:vi.fn(() => decoded.promise) });setImageDimensions(image,3840,2160);
    fireEvent.load(image);clickStage();expect(api.pixel).not.toHaveBeenCalled();
    await act(async () => decoded.resolve());expect(stage()).toHaveAttribute('role','button');
    fireEvent.error(image);clickStage();expect(api.pixel).not.toHaveBeenCalled();expect(stage()).not.toHaveAttribute('role','button');
  });
  it.each([[0,0],[1280,720]])('refuses review pixels with invalid native dimensions %s × %s',async (width,height) => {
    backend={ ...state(),datasetRevision:1,samples:[sample(1)] };
    render(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={observation()} />);await ready();
    fireEvent.click(screen.getByRole('button',{ name:'View sample 1: wand' }));const image=await screen.findByAltText<HTMLImageElement>('Captured calibration image');
    setImageDimensions(image,width,height);stageBounds();await act(async () => fireEvent.load(image));clickStage();
    expect(api.pixel).not.toHaveBeenCalled();expect(stage()).not.toHaveAttribute('role','button');
  });
  it('does not let a previous sample decode or load event unlock the newly selected image',async () => {
    backend={ ...state(),datasetRevision:2,samples:[sample(1),sample(2)] };
    render(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={observation()} />);await ready();
    fireEvent.click(screen.getByRole('button',{ name:'View sample 1: wand' }));const first=await screen.findByAltText<HTMLImageElement>('Captured calibration image');
    const decoded=deferred<void>();Object.defineProperty(first,'decode',{ configurable:true,value:vi.fn(() => decoded.promise) });setImageDimensions(first,3840,2160);fireEvent.load(first);
    fireEvent.click(screen.getByRole('button',{ name:'View sample 2: wand' }));await waitFor(() => expect(screen.getByAltText('Captured calibration image')).not.toBe(first));
    await act(async () => decoded.resolve());fireEvent.load(first);stageBounds();clickStage();expect(api.pixel).not.toHaveBeenCalled();
    await decodeImage();clickStage();await waitFor(() => expect(api.pixel).toHaveBeenCalledWith('agent-a','calibrator-1',expect.any(Object),sample(2).sampleId,[1920,1080],expect.any(AbortSignal)));
  });
  it('requires a new image decode after the calibration instance changes even when sample ID and URL repeat',async () => {
    backend={ ...state(),datasetRevision:1,samples:[sample(1)] };const port=observation();
    const view=render(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={port} />);await ready();
    fireEvent.click(screen.getByRole('button',{ name:'View sample 1: wand' }));const first=await decodeImage();
    view.rerender(<CameraExtrinsicCalibrationRuntimePanel {...props} processInstanceId="calibrator-2" observationPort={port} />);await ready();
    fireEvent.click(screen.getByRole('button',{ name:'View sample 1: wand' }));await waitFor(() => expect(screen.getByAltText('Captured calibration image')).not.toBe(first));
    stageBounds();fireEvent.load(first);clickStage();expect(api.pixel).not.toHaveBeenCalled();
    await decodeImage();clickStage();await waitFor(() => expect(api.pixel).toHaveBeenCalledWith('agent-a','calibrator-2',expect.any(Object),sample(1).sampleId,[1920,1080],expect.any(AbortSignal)));
  });
  it('keeps review locked when decoding rejects or an error overtakes a pending decode',async () => {
    backend={ ...state(),datasetRevision:1,samples:[sample(1)] };
    render(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={observation()} />);await ready();
    fireEvent.click(screen.getByRole('button',{ name:'View sample 1: wand' }));const image=await screen.findByAltText<HTMLImageElement>('Captured calibration image');
    setImageDimensions(image,3840,2160);stageBounds();Object.defineProperty(image,'decode',{ configurable:true,value:vi.fn().mockRejectedValue(new Error('bad image')) });
    await act(async () => fireEvent.load(image));clickStage();expect(api.pixel).not.toHaveBeenCalled();
    const decoded=deferred<void>();Object.defineProperty(image,'decode',{ configurable:true,value:vi.fn(() => decoded.promise) });
    fireEvent.load(image);fireEvent.error(image);await act(async () => decoded.resolve());clickStage();expect(api.pixel).not.toHaveBeenCalled();
  });
  it('deletes and undoes exact same-marker sample identities independently',async () => {
    backend={ ...state(),datasetRevision:3,samples:[sample(1),sample(2),sample(3)] };
    render(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={observation()} />);await ready();
    fireEvent.click(screen.getByRole('button',{ name:'Remove sample 2: wand' }));await waitFor(() => expect(rows()).toHaveLength(2));
    expect(backend.samples.map((point) => point.sampleId)).toEqual([sample(1).sampleId,sample(3).sampleId]);
    fireEvent.click(screen.getByRole('button',{ name:'Undo last correspondence' }));await waitFor(() => expect(rows()).toHaveLength(1));expect(api.remove.mock.lastCall![3]).toBe(sample(3).sampleId);
    fireEvent.click(screen.getByRole('button',{ name:'Clear correspondences' }));await waitFor(() => expect(rows()).toHaveLength(0));
  });
  it.each(['buffer-unavailable','new-display-epoch'] as const)('accepts a dataset deletion across %s and uses its revision for the next deletion',async (change) => {
    backend={ ...state(),datasetRevision:2,samples:[sample(1),sample(2)] };
    const receipt=deferred<CameraExtrinsicState>(),port=observation();api.remove.mockReturnValueOnce(receipt.promise);
    const view=render(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={port} />);await ready();
    fireEvent.click(screen.getByRole('button',{ name:'Remove sample 1: wand' }));
    const signal=api.remove.mock.lastCall![4] as AbortSignal;
    view.rerender(<CameraExtrinsicCalibrationRuntimePanel {...props}
      observationPort={change==='buffer-unavailable' ? undefined : { ...port,sourceEpoch:'epoch-b' }} />);
    expect(signal.aborted).toBe(false);
    expect(screen.getByRole('button',{ name:'Remove sample 2: wand' })).toBeDisabled();
    view.rerender(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={{ ...port,sourceEpoch:'epoch-b' }} />);
    backend={ ...backend,datasetRevision:3,samples:[sample(2)] };await act(async () => receipt.resolve(backend));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(screen.getByRole('button',{ name:'View sample 1: wand' })).toHaveAttribute('data-xgc-id',`calibrator-1:${sample(2).sampleId}`);
    fireEvent.click(screen.getByRole('button',{ name:'Remove sample 1: wand' }));
    await waitFor(() => expect(rows()).toHaveLength(0));
    expect(api.remove.mock.lastCall).toEqual(['agent-a','calibrator-1',{ samplingSessionId:'a'.repeat(32),expectedRevision:3 },sample(2).sampleId,expect.any(AbortSignal)]);
    expect(api.state).toHaveBeenCalledOnce();expect(api.cancel).not.toHaveBeenCalled();
  });
  it.each(['process','target','session','source','display-source','unmount'] as const)('still aborts a dataset deletion on a true %s change and ignores its late receipt',async (change) => {
    backend={ ...state(),datasetRevision:2,samples:[sample(1),sample(2)] };
    const oldReceipt={ ...backend,datasetRevision:3,samples:[sample(2)] },receipt=deferred<CameraExtrinsicState>(),port=observation();
    api.remove.mockReturnValueOnce(receipt.promise);
    const view=render(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={port} />);await ready();
    fireEvent.click(screen.getByRole('button',{ name:'Remove sample 1: wand' }));
    const signal=api.remove.mock.lastCall![4] as AbortSignal;
    if (change==='unmount') view.unmount();
    else {
      if (change==='session' || change==='source') {
        backend={ ...backend,samplingSessionId:change==='session' ? 'b'.repeat(32) : backend.samplingSessionId,
          source:{ ...backend.source,sourceId:change==='source' ? 'rear' : 'front' } };
        execution.revision++;
      }
      view.rerender(<CameraExtrinsicCalibrationRuntimePanel {...props}
        processInstanceId={change==='process' ? 'calibrator-2' : props.processInstanceId}
        targetId={change==='target' ? 'agent-b' : props.targetId}
        observationPort={change==='display-source' ? { ...port,sourceId:'rear' } : port} />);
    }
    await waitFor(() => expect(signal.aborted).toBe(true));
    await act(async () => receipt.resolve(oldReceipt));
    if (change!=='unmount') await waitFor(() => expect(rows()).toHaveLength(2));
    expect(api.remove).toHaveBeenCalledOnce();expect(api.cancel).not.toHaveBeenCalled();
  });
  it('replaces exactly the reviewed sample only after successful image commit',async () => {
    backend={ ...state(),datasetRevision:2,samples:[sample(1),sample(2)] };sequence=2;
    const upload=deferred<CameraExtrinsicState>();api.commit.mockReturnValueOnce(upload.promise);
    render(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={observation()} />);await ready();
    fireEvent.click(screen.getByRole('button',{ name:'View sample 1: wand' }));fireEvent.click(screen.getByRole('button',{ name:'Resample' }));clickStage();
    await waitFor(() => expect(api.commit).toHaveBeenCalledOnce());expect(rows()).toHaveLength(2);
    expect(api.begin.mock.lastCall![2]).toMatchObject({ marker:'wand',replacesSampleId:sample(1).sampleId,expectedRevision:2 });
    expect(screen.getByRole('button',{ name:'View sample 1: wand' })).toHaveAttribute('data-xgc-id',`calibrator-1:${sample(1).sampleId}`);
    backend={ ...backend,datasetRevision:3,samples:[sample(3),sample(2)] };await act(async () => upload.resolve(backend));
    expect(screen.getByRole('button',{ name:'View sample 1: wand' })).toHaveAttribute('data-xgc-id',`calibrator-1:${sample(3).sampleId}`);
    expect(screen.getByRole('button',{ name:'View sample 2: wand' })).toHaveAttribute('data-xgc-id',`calibrator-1:${sample(2).sampleId}`);
  });
  it('does not let a delayed earlier state read erase a committed sample',async () => {
    const oldState=backend,refresh=deferred<CameraExtrinsicState>(),port=observation();
    const view=render(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={port} />);await ready();
    api.state.mockReturnValueOnce(refresh.promise);execution.revision++;
    view.rerender(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={port} />);
    await waitFor(() => expect(api.state).toHaveBeenCalledTimes(2));clickStage();await waitFor(() => expect(rows()).toHaveLength(1));
    await act(async () => refresh.resolve(oldState));expect(rows()).toHaveLength(1);
    clickStage();await waitFor(() => expect(rows()).toHaveLength(2));expect(api.begin.mock.lastCall![2]).toMatchObject({ expectedRevision:1 });
  });
  it('cancels a late begin receipt after image encoding fails',async () => {
    const begin=deferred<{sampleId:string;samplingSessionId:string;datasetRevision:number;expiresInSeconds:number}>();api.begin.mockReturnValueOnce(begin.promise);
    const frame=latched('A');frame.encode=vi.fn().mockRejectedValue(new Error('image encoding failed'));
    render(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={observation(frame)} />);await ready();clickStage();
    await waitFor(() => expect(frame.release).toHaveBeenCalled());
    await act(async () => begin.resolve({ sampleId:sample(1).sampleId,samplingSessionId:'a'.repeat(32),datasetRevision:0,expiresInSeconds:120 }));
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith('agent-a','calibrator-1','a'.repeat(32),sample(1).sampleId));expect(api.commit).not.toHaveBeenCalled();
  });
  it('cancels an accepted pending receipt when the source epoch changes during encoding',async () => {
    const encoded=deferred<Blob>(),frame=latched('A');frame.encode=vi.fn(() => encoded.promise);const port=observation(frame);
    const view=render(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={port} />);await ready();clickStage();
    await act(async () => undefined);view.rerender(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={{ ...port,sourceEpoch:'epoch-b' }} />);
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith('agent-a','calibrator-1','a'.repeat(32),sample(1).sampleId));
    await act(async () => encoded.resolve(new Blob(['A'],{ type:'image/png' })));expect(api.commit).not.toHaveBeenCalled();expect(rows()).toHaveLength(0);
  });
  it('retains the original sample when replacement upload fails and cancels the pending receipt',async () => {
    backend={ ...state(),datasetRevision:1,samples:[sample(1)] };sequence=1;api.commit.mockRejectedValueOnce(new Error('image upload failed'));
    render(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={observation()} />);await ready();
    fireEvent.click(screen.getByRole('button',{ name:'View sample 1: wand' }));fireEvent.click(screen.getByRole('button',{ name:'Resample' }));clickStage();
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith('agent-a','calibrator-1','a'.repeat(32),sample(2).sampleId));
    expect(api.begin.mock.lastCall![2]).toMatchObject({ replacesSampleId:sample(1).sampleId });expect(backend.samples).toEqual([sample(1)]);expect(rows()).toHaveLength(1);
  });
  it.each(['process','source','epoch','buffer','unmount'] as const)('aborts on %s change and cancels a late receipt without uploading it',async (change) => {
    const begin=deferred<{sampleId:string;samplingSessionId:string;datasetRevision:number;expiresInSeconds:number}>();api.begin.mockReturnValueOnce(begin.promise);
    const frame=latched('A'),port=observation(frame);const view=render(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={port} />);await ready();clickStage();
    const signal=api.begin.mock.lastCall![3] as AbortSignal;
    if (change==='unmount') view.unmount();
    else view.rerender(<CameraExtrinsicCalibrationRuntimePanel {...props} processInstanceId={change==='process' ? 'other-process' : props.processInstanceId}
      observationPort={change==='buffer' ? undefined : change==='epoch' ? { ...port,sourceEpoch:'epoch-b' } : change==='source' ? { ...port,sourceId:'rear' } : port} />);
    expect(signal.aborted).toBe(true);expect(frame.release).toHaveBeenCalled();
    await act(async () => begin.resolve({ sampleId:sample(1).sampleId,samplingSessionId:'a'.repeat(32),datasetRevision:0,expiresInSeconds:120 }));
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith('agent-a','calibrator-1','a'.repeat(32),sample(1).sampleId));expect(api.commit).not.toHaveBeenCalled();expect(backend.samples).toHaveLength(0);
  });
  it('refuses a mismatched camera source or letterbox click before beginning capture',async () => {
    const port=observation();const view=render(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={{ ...port,sourceId:'other' }} />);await ready();clickStage();
    expect(port.latch).not.toHaveBeenCalled();expect(api.begin).not.toHaveBeenCalled();vi.mocked(port.latch).mockReturnValue(undefined);
    view.rerender(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={port} />);clickStage();expect(api.begin).not.toHaveBeenCalled();
  });
  it('solves only the server revision and saves the exact candidate without overlaying history on live video',async () => {
    const samples=[sample(1),sample(2),sample(3),sample(4)].map((point,index) => ({ ...point,world:[[0,0,0],[1,0,0],[1,1,0],[0,1,0]][index] as [number,number,number] }));
    backend={ ...state(),datasetRevision:4,samples };
    const candidate={ candidateId:'candidate-a',datasetRevision:4,saved:false,translation:[1,2,3],quaternionXyzw:[0,0,0,1],meanReprojectionErrorPx:0.1,maxReprojectionErrorPx:0.2,
      inlierIndices:[0,1,2,3],warnings:[],points:samples,projections:samples.map((point) => ({ sampleId:point.sampleId,marker:point.marker,pixel:point.pixel })) };
    api.solve.mockResolvedValue(candidate);api.save.mockResolvedValue({ ...candidate,saved:true,outputFile:'/camera/extrinsics.yaml' });
    render(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={observation()} />);await ready();fireEvent.click(screen.getByRole('button',{ name:'Solve' }));
    await waitFor(() => expect(api.solve).toHaveBeenCalledWith('agent-a','calibrator-1',{ samplingSessionId:'a'.repeat(32),expectedRevision:4 },expect.any(AbortSignal)));
    const save=screen.getByRole('button',{ name:'Save' });await waitFor(() => expect(save).toBeEnabled());expect(document.querySelectorAll('.panels-camera-extrinsic-overlay-point')).toHaveLength(0);
    fireEvent.click(save);await waitFor(() => expect(api.save).toHaveBeenCalledWith('agent-a','calibrator-1','candidate-a',expect.any(AbortSignal)));await waitFor(() => expect(save).toBeDisabled());
  });
  it('shows a restored saved candidate without inventing active samples or fetching old images',async () => {
    backend={ ...state(),resultRestored:true,result:{ candidateId:'saved-before-restart',saved:true,outputFile:'/camera/extrinsics.yaml',translation:[1,2,3],quaternionXyzw:[0,0,0,1],
      meanReprojectionErrorPx:0.1,maxReprojectionErrorPx:0.2,inlierIndices:[0],warnings:[],points:[{ marker:'wand',pixel:[100,200],world:[1,2,3] }],projections:[{ marker:'wand',pixel:[100,200] }] } };
    render(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={observation()} />);await ready();
    expect(screen.getByRole('button',{ name:'Saved' })).toBeDisabled();expect(screen.getByRole('button',{ name:'Solve' })).toBeDisabled();
    expect(rows()).toHaveLength(0);expect(document.querySelectorAll('.panels-camera-extrinsic-overlay-point')).toHaveLength(0);expect(api.image).not.toHaveBeenCalled();
  });
  it('retries applying an already saved unavailable candidate without solving or claiming pending is Applied',async () => {
    backend={ ...state(),result:savedApplicationResult('unavailable') };
    api.save.mockResolvedValue(savedApplicationResult('pending'));
    render(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={observation()} />);await ready();
    const retry=screen.getByRole('button',{ name:'Retry apply' });expect(retry).toBeEnabled();
    fireEvent.click(retry);
    await waitFor(() => expect(api.save).toHaveBeenCalledWith('agent-a','calibrator-1','saved-application',expect.any(AbortSignal)));
    await waitFor(() => expect(screen.getByRole('button',{ name:'Saved' })).toBeDisabled());
    expect(screen.queryByRole('button',{ name:'Applied' })).toBeNull();
    expect(api.solve).not.toHaveBeenCalled();expect(api.begin).not.toHaveBeenCalled();
    expect(api.save).toHaveBeenCalledOnce();
  });
  it('shows Applied only after a new state snapshot explicitly confirms the same saved result',async () => {
    backend={ ...state(),result:savedApplicationResult('pending') };
    const port=observation();const view=render(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={port} />);await ready();
    expect(screen.getByRole('button',{ name:'Saved' })).toBeDisabled();
    expect(screen.queryByRole('button',{ name:'Applied' })).toBeNull();
    backend={ ...backend,result:savedApplicationResult('applied') };execution.revision++;
    view.rerender(<CameraExtrinsicCalibrationRuntimePanel {...props} observationPort={port} />);
    await waitFor(() => expect(screen.getByRole('button',{ name:'Applied' })).toBeDisabled());
    expect(api.save).not.toHaveBeenCalled();expect(api.solve).not.toHaveBeenCalled();
  });
  it('maps contained and scrolled 4K pixels while rejecting letterboxing',() => {
    expect(cameraPixelForClientPoint(210,220,{ left:10,top:20,width:400,height:400 },3840,2160)).toEqual([1920,1080]);
    expect(cameraPixelForClientPoint(210,40,{ left:10,top:20,width:400,height:400 },3840,2160)).toBeUndefined();
    expect(cameraPixelForClientPoint(340,280,{ left:-300,top:-200,width:1280,height:960 },3840,2160)).toEqual([1920,1080]);
  });
});
function savedApplicationResult(status:'pending'|'applied'|'conflict'|'unavailable'):NonNullable<CameraExtrinsicState['result']> {
  return { candidateId:'saved-application',saved:true,application:{ status },
    outputFile:'/camera/sim/usb_cam/extrinsics-20260920T123456.000000Z.yaml',
    translation:[1,2,3],quaternionXyzw:[0,0,0,1],meanReprojectionErrorPx:0.1,maxReprojectionErrorPx:0.2,
    inlierIndices:[],warnings:[],points:[],projections:[] };
}
function state():CameraExtrinsicState {
  return { samplingSessionId:'a'.repeat(32),datasetRevision:0,samples:[],sampleLimits:{ imageBytes:33554432,imagePixels:16777216,samples:64,pending:4,totalImageBytes:268435456,pendingSeconds:120 },
    resultRestored:false,mode:'live',generation:0,parentFrame:'world',childFrame:'camera',source:{ sourceId:'front',imageTopic:'/camera/image',intrinsicFile:'/camera/intrinsics.yaml',posePrefix:'/vrpn',imageReady:true,intrinsicReady:true,markerCount:1,markerNames:['wand'] },markers:[] };
}
function sample(index:number):CameraExtrinsicSample {
  const id=String(index).padStart(32,'0');return { sampleId:id,marker:'wand',pixel:[100,200],world:[index,0,0],sourceWorld:[index,0,0],display:latched(`frame-${index}`).display,
    poseObservation:{ observationId:`pose-${index}`,frameId:'world',sourceStampSec:index,sourceClock:'ros',receivedAtSec:index+1,receivedClock:'unix',receivedMonotonicSec:index+2 },
    cameraModelId:'model-a',poseCoordinateId:'world-a',image:{ path:`api/v1/samples/${id}/image`,mimeType:'image/png',sha256:'d'.repeat(64),width:3840,height:2160 } };
}
function latched(id:string):CameraVideoLatchedFrame {
  return { display:{ id,sourceId:'front',sourceEpoch:'epoch-a',width:3840,height:2160,clockDomain:'browser-performance',presentedAtMs:10 },pixel:[1920,1080],encode:vi.fn().mockResolvedValue(new Blob([id],{ type:'image/png' })),release:vi.fn() };
}
function observation(frame=latched('A')):CameraVideoObservationPort { return { sourceId:'front',sourceEpoch:'epoch-a',latch:vi.fn(() => frame) }; }
function deferred<T>() { let resolve!:(value:T) => void;const promise=new Promise<T>((done) => { resolve=done; });return { promise,resolve }; }

function setImageDimensions(image:HTMLImageElement,width:number,height:number) {
  Object.defineProperties(image,{ naturalWidth:{ configurable:true,value:width },naturalHeight:{ configurable:true,value:height } });
}
async function decodeImage() {
  const image=await screen.findByAltText<HTMLImageElement>('Captured calibration image');setImageDimensions(image,3840,2160);
  await act(async () => fireEvent.load(image));await waitFor(() => expect(stage()).toHaveAttribute('role','button'));return image;
}
function stageBounds() {
  vi.spyOn(stage(),'getBoundingClientRect').mockReturnValue({ left:0,top:0,width:640,height:480,right:640,bottom:480,x:0,y:0,toJSON:() => ({}) });
}
