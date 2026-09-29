// @vitest-environment jsdom
import { act,fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { PanelInstance } from '../../../domains/experiment/experimentPublic';
import type { AutomationRunDetail } from '../../../domains/automation/automationPublic';
import { selectControlOption } from '../../../test/selectControlTestUtils';
import type { PanelActionPortRuntime,PanelPluginContext } from '../../types';
import { VideoProductionPanel } from './VideoProductionPanel';
import { VideoProductionFrameProvider } from './videoProductionPanelFrame';
import { VIDEO_FRAME_CHANNEL } from './frameProtocol';
import { testPanelExecution,testRunDetails } from '../../../test/panelExecutionTestSupport';

const api = vi.hoisted(() => ({
  listROSBagRecordings: vi.fn(),getVideoSourceCatalog: vi.fn(),getVideoCapabilities: vi.fn(),
  listVideoRecipes: vi.fn(),saveVideoRecipe: vi.fn(),deleteVideoRecipe: vi.fn(),
  createVideoJob: vi.fn(),listVideoJobs: vi.fn(),getVideoJob: vi.fn(),cancelPreparedVideoJob: vi.fn(),
  fetchVideoArtifact: vi.fn(),fetchVideoPreview: vi.fn(),downloadVideoArtifact: vi.fn(),
  publishVideoJobToGallery: vi.fn(),
  createVideoPreviewSession: vi.fn(),getVideoPreviewSession: vi.fn(),getVideoPreviewFrameMap: vi.fn(),
  videoPreviewRendererUrl: vi.fn(),
}));
vi.mock('../../../domains/recording/recordingPublic',() => api);
const bag = { id: 'bag-1',name: 'run_0.bag',path: '/archive/run_0.bag',size: 1024,experimentId: 'exp-1',sessionId: 'session-1',createdAt: '2026-01-01T00:00:00Z' };
const catalog = { ...bag,durationNs: '10000000000',topics: [
  { name: '/camera/image/compressed',type: 'sensor_msgs/CompressedImage',messageCount: 300 },
  { name: '/camera/info',type: 'sensor_msgs/CameraInfo',messageCount: 300 },
  { name: '/tf',type: 'tf2_msgs/TFMessage',messageCount: 300 },
  { name: '/planned',type: 'nav_msgs/Path',messageCount: 300 },
  { name: '/obstacles',type: 'visualization_msgs/MarkerArray',messageCount: 300 },
],recordedContext:{ status:'unavailable',reason:'missing-sidecar' },recordFacts:{ status:'absent',reason:'missing-descriptor' },objects:[
  { id:'camera',kind:'camera',label:'/camera/image/compressed',labelSource:'topic',topic:'/camera/image/compressed' },
  { id:'path',kind:'path',label:'/planned',labelSource:'topic',topic:'/planned',selector:{ kind:'topic',topic:'/planned' } },
  { id:'markers',kind:'markers',label:'/obstacles',labelSource:'topic',topic:'/obstacles',selector:{ kind:'topic',topic:'/obstacles' } },
] };
const capability = { available:true,reason:'',maxFrames:100000,jobKind:'video.render-archive',actionPort:'render-video',
  width:3840,height:2160,messageTypes:['sensor_msgs/CompressedImage'],modelReason:'',editing:{ trackEnabled:true },
  models:[{ modelId:'mocap-rotor',label:'Mocap rotor',bundleSha256:'a'.repeat(64),description:{ package:'mocap',file:'rotor.urdf' },rootFrame:'base_link',jointPose:'urdf-rest' }] };
const admitted = { id: 'a'.repeat(32),experimentId: 'exp-1',bagId: 'bag-1',status: 'prepared',rendition: { kind: 'video' } };
const sessionId = '6b7e2da6-4747-4509-ad2f-8f331cf3e30f';
const sha = 'd'.repeat(64);
const plan = (frameIndex: number) => ({
  snapshotSha256: sha,frameIndex,targetTimeNs: String(frameIndex * 33333333),sourceFrameId: `camera:${frameIndex}`,
  cameraTimeNs: String(frameIndex * 33333333),width: 3840,height: 2160,
});
const panel: PanelInstance = { id: 'video',pluginId: 'scientific-gallery',title: 'Scientific plots',gridPos: { x: 0,y: 0,w: 16,h: 10 },query: {},options: {},fieldConfig: {},portBindings: [] };
function context(experimentId = 'exp-1',port?: PanelActionPortRuntime): PanelPluginContext {
  return { ports: { actions: port ? { 'render-video': port } : {},data: { 'recording-artifacts': {
    id: 'recording-artifacts',label: 'Archive',contract: 'recording.artifacts.v1',connected: Boolean(experimentId),value: { experimentResourceId: experimentId },trace: {},
  } },authoring: {},interactions: {} } };
}
function renderPort(): PanelActionPortRuntime {
  return { id: 'render-video',label: 'Render video',connected: true,disabledReason: '',defaults: {},trace: {},
    action: { id: 'render',label: 'Render',kind: 'command',controls: ['cancel'] },
    invoke: vi.fn().mockResolvedValue({ id: 'render-1',revision: 1,status: 'running' }),control: vi.fn().mockResolvedValue(undefined) };
}
function ensurePressed(name: string) {
  const button = screen.getByRole('button',{ name });
  if (button.getAttribute('aria-pressed') !== 'true') fireEvent.click(button);
}
function ensureReleased(name: string) {
  const button = screen.getByRole('button',{ name });
  if (button.getAttribute('aria-pressed') === 'true') fireEvent.click(button);
}
function ensureTopic(role: string, topic: string) {
  const button = document.querySelector(`[data-xgc-role="video-layer-topic"][data-xgc-id="video:${role}:${topic}"]`);
  if (!(button instanceof HTMLElement)) throw new Error(`missing ${role} topic ${topic}`);
  if (button.getAttribute('aria-pressed') !== 'true') fireEvent.click(button);
}
async function selectBag() {
  await waitFor(() => expect(api.listROSBagRecordings).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button',{ name: 'Media' }));
  fireEvent.click(await screen.findByRole('button',{ name: /^run_0\.bag · 1\.0 KiB/ }));
  await waitFor(() => expect(document.querySelector('[data-xgc-role="video-sequence-inspector"]')).not.toBeNull());
  openSettings('Sources & layers');
  await screen.findByLabelText('Recorded calibration');
}
function closeSettings() {
  const close = screen.queryByRole('button',{ name: 'Close settings' });
  if (close) fireEvent.click(close);
}
function chooseMenu(trigger: string,item: string) {
  fireEvent.click(screen.getByRole('button',{ name: trigger }));
  fireEvent.click(screen.getByRole('menuitem',{ name: item }));
}
function openSettings(name: 'Sources & layers' | 'Clock sync') {
  closeSettings();
  chooseMenu('Project menu',`${name}…`);
}
function chooseRendition(name: 'Video' | 'Still frame' | 'Afterimage trail') {
  const group = document.querySelector('[data-xgc-role="video-rendition-kind"]') as HTMLElement;
  fireEvent.click(within(group).getByRole('button',{ name }));
}
async function configureSource() {
  await selectBag();
  selectControlOption('Recorded calibration','/camera/info');
  fireEvent.change(screen.getByLabelText('Recorded fixed frame'),{ target: { value: 'world' } });
  ensurePressed('/tf');
  closeSettings();
  for (const name of ['History','Predictions','Labels','Obstacles']) ensureReleased(name);
  await waitFor(() => expect(document.querySelector('[data-xgc-role="video-browser"]')).toHaveAttribute('data-xgc-recipe-ready','true'));
}
async function configureWithPathTopic() {
  await selectBag();
  selectControlOption('Recorded calibration','/camera/info');
  fireEvent.change(screen.getByLabelText('Recorded fixed frame'),{ target: { value: 'world' } });
  ensurePressed('/tf');
  ensureTopic('history','/planned');
  closeSettings();
  for (const name of ['Predictions','Labels','Obstacles']) ensureReleased(name);
  await waitFor(() => expect(document.querySelector('[data-xgc-role="video-browser"]')).toHaveAttribute('data-xgc-recipe-ready','true'));
}
function openFallback() {
  chooseMenu('Preview options','Fallback PNG preview');
}
describe('Integrated offline video production',() => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.listROSBagRecordings.mockResolvedValue({ items: [bag],offset: 0,limit: 100,total: 1,truncated: false });
    api.getVideoSourceCatalog.mockResolvedValue(catalog);
    api.getVideoCapabilities.mockResolvedValue(capability);
    api.listVideoRecipes.mockResolvedValue({ items: [] });api.listVideoJobs.mockResolvedValue({ items: [] });
    api.createVideoJob.mockResolvedValue(admitted);
    api.createVideoPreviewSession.mockResolvedValue({ sessionId,status: 'preparing' });
    api.getVideoPreviewSession.mockResolvedValue({ sessionId,status: 'preparing' });
    api.getVideoPreviewFrameMap.mockResolvedValue({ plans: Array.from({ length: 300 },(_,index) => plan(index)),diagnostics: { outputFrames: 300 } });
    api.videoPreviewRendererUrl.mockImplementation((experiment: string,session: string,hash: string) => `/api/recordings/video-production/${experiment}/preview-sessions/${session}/renderer/index.html?xgcTfHistorySeconds=600&xgcInteractive=1#snapshot=…&sha256=${hash}`);
    api.saveVideoRecipe.mockImplementation((experimentId,request) => Promise.resolve({ id: 'b'.repeat(32),experimentId,request,revision: 'c'.repeat(64),updatedAt: '2026-09-16T00:00:00Z' }));
  });
  it('requires the Experiment archive binding before loading anything',() => {
    render(<VideoProductionPanel panel={panel} context={context('')} />);
    expect(api.listROSBagRecordings).not.toHaveBeenCalled();expect(api.listVideoJobs).not.toHaveBeenCalled();
  });
  it('filters the current Experiment before pagination and allows the complete archive',async () => {
    render(<VideoProductionPanel panel={panel} context={context()} />);
    await waitFor(() => expect(api.listROSBagRecordings).toHaveBeenCalledWith({ experimentId: 'exp-1',offset: 0 },expect.any(AbortSignal)));
    fireEvent.click(screen.getByRole('button',{ name: 'Media' }));
    fireEvent.click(screen.getByRole('button',{ name: 'All recordings' }));
    await waitFor(() => expect(api.listROSBagRecordings).toHaveBeenLastCalledWith({ offset: 0 },expect.any(AbortSignal)));
  });
  it('keeps the selected source and edit when the archive scope excludes it',async () => {
    render(<VideoProductionPanel panel={panel} context={context()} />);await configureWithPathTopic();
    chooseMenu('Add track','Path: /planned');
    fireEvent.change(screen.getByLabelText('Track label'),{ target:{ value:'Recorded route' } });
    api.listROSBagRecordings.mockResolvedValue({ items:[],offset:0,limit:100,total:0,truncated:false });
    fireEvent.click(screen.getByRole('button',{ name:'Media' }));
    fireEvent.click(screen.getByRole('button',{ name:'All recordings' }));
    await screen.findByText('No archived bags');
    expect(document.querySelector('[data-xgc-role="video-current-source"]')).toHaveTextContent('run_0.bag');
    expect(screen.getByLabelText('Track label')).toHaveValue('Recorded route');
    fireEvent.click(screen.getByRole('button',{ name:'Objects' }));
    expect(screen.getByRole('button',{ name:'Recorded route · 0–10s' })).toHaveAttribute('aria-pressed','true');
    expect(api.getVideoSourceCatalog).toHaveBeenCalledTimes(1);
  });
  it('uses one selection for the object browser, timeline and selected-only inspector',async () => {
    render(<VideoProductionPanel panel={panel} context={context()} />);await configureWithPathTopic();
    const inspector = document.querySelector('[data-xgc-role="video-inspector"]') as HTMLElement;
    expect(within(inspector).getByRole('region',{ name:'Clip' })).toBeInTheDocument();
    expect(within(inspector).queryByLabelText('Add track target')).not.toBeInTheDocument();
    chooseMenu('Add track','Path: /planned');
    fireEvent.change(screen.getByLabelText('Track label'),{ target:{ value:'Opening' } });
    fireEvent.change(screen.getByLabelText('Exit (exclusive, seconds)'),{ target:{ value:'5' } });
    chooseMenu('Add track','Path: /planned');
    fireEvent.change(screen.getByLabelText('Track label'),{ target:{ value:'Ending' } });
    fireEvent.change(screen.getByLabelText('Enter (seconds from bag start)'),{ target:{ value:'5' } });
    fireEvent.click(screen.getByRole('button',{ name:'Opening · 0–5s' }));
    expect(within(inspector).getByLabelText('Track label')).toHaveValue('Opening');
    const ending = [...document.querySelectorAll('[data-xgc-role="video-timeline-span"]')].find((node) => node.getAttribute('aria-label')?.includes('Ending'));
    expect(ending).toBeTruthy();
    fireEvent.click(ending!);
    expect(within(inspector).getByLabelText('Track label')).toHaveValue('Ending');
    expect(screen.getByRole('button',{ name:'Ending · 5–10s' })).toHaveAttribute('aria-pressed','true');
    fireEvent.click(screen.getByRole('button',{ name:'Delete track' }));
    expect(within(inspector).getByRole('region',{ name:'Clip' })).toBeInTheDocument();
  });
  it('allows saved configuration but requires a bound action and ready runtime',async () => {
    render(<VideoProductionPanel panel={panel} context={context()} />);await configureSource();
    expect(screen.getByRole('button',{ name: 'Render 4K video' })).toBeDisabled();
    expect(document.querySelector('[data-xgc-role="video-production-frame-count"]')).toHaveTextContent('300 frames');
    fireEvent.change(screen.getByLabelText('End (exclusive, seconds from bag start)'),{ target: { value: '11' } });
    expect(document.querySelector('[data-xgc-role="video-browser"]')).toHaveAttribute('data-xgc-recipe-ready','false');
  });
  it('fails closed when the installed runtime is unavailable',async () => {
    api.getVideoCapabilities.mockResolvedValue({ ...capability,available: false,reason: 'Runtime digest mismatch' });
    render(<VideoProductionPanel panel={panel} context={context('exp-1',renderPort())} />);await configureSource();
    expect(screen.getByRole('button',{ name: 'Render 4K video' })).toBeDisabled();
    expect(screen.getByText(/Runtime digest mismatch/)).toBeInTheDocument();
  });
  it('admits once, invokes only the immutable ticket and cancels the exact invocation',async () => {
    const port = renderPort();render(<VideoProductionPanel panel={panel} context={context('exp-1',port)} />);await configureSource();
    fireEvent.click(screen.getByRole('button',{ name: 'Render 4K video' }));fireEvent.click(screen.getByRole('button',{ name: 'Render 4K video' }));
    await waitFor(() => expect(port.invoke).toHaveBeenCalledTimes(1));expect(api.createVideoJob).toHaveBeenCalledTimes(1);
    expect(api.createVideoJob).toHaveBeenCalledWith('exp-1',expect.objectContaining({ rendition: { kind: 'video' } }),expect.any(String));
    expect(port.invoke).toHaveBeenCalledWith({ experimentId: 'exp-1',videoJobId: admitted.id },expect.any(String));
    await waitFor(() => expect(screen.getByRole('button',{ name: 'Cancel render' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button',{ name: 'Cancel render' }));
    await waitFor(() => expect(port.control).toHaveBeenCalledWith({ id: 'render-1',revision: 1,status: 'running' },'cancel',expect.any(String)));
  });
  it('does not occupy a finite render whose admission is already terminal',async () => {
    const port = renderPort();
    port.invoke = vi.fn().mockResolvedValue({ id:'render-1',revision:2,status:'succeeded' });
    render(<VideoProductionPanel panel={panel} context={context('exp-1',port)} />);await configureSource();
    fireEvent.click(screen.getByRole('button',{ name:'Render 4K video' }));
    await waitFor(() => expect(port.invoke).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button',{ name:'Render 4K video' })).toBeEnabled());
    expect(screen.queryByRole('button',{ name:'Cancel render' })).toBeNull();
  });
  it('consumes exact terminal detail despite an older active projection and keeps its failure visible',async () => {
    const port = renderPort();
    const current = { run:{ id:'render-1',status:'running',revision:1 },invocations:[],nodeSummaries:[],loading:false,error:'' } as unknown as AutomationRunDetail;
    port.execution = testPanelExecution({},{ loadRunDetail:vi.fn(async () => current),retainRunDetail:vi.fn(),retainRunObservation:vi.fn(() => vi.fn()) });
    port.activeInvocation = { id:'render-1',status:'running',revision:1 };
    // Submit before the stale shared projection arrives.
    const projected = port.activeInvocation;port.activeInvocation = undefined;
    const view = render(<VideoProductionPanel panel={panel} context={context('exp-1',port)} />);await configureSource();
    fireEvent.click(screen.getByRole('button',{ name:'Render 4K video' }));
    await waitFor(() => expect(port.execution!.retainRunObservation).toHaveBeenCalledWith('render-1'));
    port.activeInvocation = projected;
    testRunDetails(port.execution)['render-1'] = { ...current,run:{ ...current.run!,status:'failed',revision:4,primaryError:'renderer failed' } };
    view.rerender(<VideoProductionPanel panel={panel} context={context('exp-1',port)} />);
    expect(await screen.findByText('renderer failed')).toBeInTheDocument();
    expect(screen.getByRole('button',{ name:'Render 4K video' })).toBeEnabled();
    expect(screen.queryByRole('button',{ name:'Cancel render' })).toBeNull();
  });
  it('submits a still rendition with its exact frame',async () => {
    const port = renderPort();render(<VideoProductionPanel panel={panel} context={context('exp-1',port)} />);await configureSource();
    chooseRendition('Still frame');
    fireEvent.change(screen.getByLabelText('Still frame (zero-based)'),{ target: { value: '7' } });
    fireEvent.click(screen.getByRole('button',{ name: 'Render 4K still' }));
    await waitFor(() => expect(api.createVideoJob).toHaveBeenCalledWith('exp-1',expect.objectContaining({ rendition: { kind: 'still',frame: 7 } }),expect.any(String)));
  });
  it('rejects non-ascending trail samples and submits a valid trail rendition',async () => {
    const port = renderPort();render(<VideoProductionPanel panel={panel} context={context('exp-1',port)} />);await configureSource();
    chooseRendition('Afterimage trail');
    fireEvent.change(screen.getByLabelText('Trail frames (comma-separated, ascending)'),{ target: { value: '20,10,25' } });
    expect(screen.getByText(/Trail samples must increase strictly/)).toBeInTheDocument();
    expect(screen.getByRole('button',{ name: 'Render 4K afterimage' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Trail frames (comma-separated, ascending)'),{ target: { value: '10,20,25' } });
    fireEvent.change(screen.getByLabelText('Oldest ghost opacity'),{ target: { value: '20' } });
    await waitFor(() => expect(screen.getByRole('button',{ name: 'Render 4K afterimage' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button',{ name: 'Render 4K afterimage' }));
    await waitFor(() => expect(api.createVideoJob).toHaveBeenCalledWith('exp-1',expect.objectContaining({ rendition: { kind: 'trail',frames: [10,20,25],method: 'afterimage',fadeFromPermille: 200,fadeToPermille: 720 } }),expect.any(String)));
  });
  it('previews a selected frame of the original full composition through the fallback job path',async () => {
    const port = renderPort();render(<VideoProductionPanel panel={panel} context={context('exp-1',port)} />);await configureSource();
    openFallback();
    fireEvent.change(screen.getByLabelText('Preview frame (zero-based)'),{ target: { value: '12' } });
    fireEvent.click(screen.getByRole('button',{ name: 'Render preview frame' }));
    await waitFor(() => expect(api.createVideoJob).toHaveBeenCalledWith('exp-1',expect.objectContaining({ rendition: { kind: 'preview',frame: 12 },videoRecipe: expect.objectContaining({ interval: expect.objectContaining({ startNs: '0',endNs: '10000000000' }) }) }),expect.any(String)));
  });
  it('shows the committed fallback preview frame in the workbench stage',async () => {
    const objectURL = vi.fn().mockReturnValue('blob:preview');
    Object.assign(URL,{ createObjectURL: objectURL,revokeObjectURL: vi.fn() });
    const port = renderPort();render(<VideoProductionPanel panel={panel} context={context('exp-1',port)} />);await configureSource();
    api.getVideoJob.mockResolvedValue({
      id: admitted.id,experimentId: 'exp-1',bagId: 'bag-1',rendition: { kind: 'preview',frame: 0 },status: 'succeeded',
      createdAt: '2026-09-16T00:00:00Z',updatedAt: '2026-09-16T00:00:01Z',requestSha256: 'd'.repeat(64),
      outputFrames: 1,renderedFrames: 1,encodedFrames: 0,captureCount: 1,artifact: 'preview.png',
    });
    api.fetchVideoArtifact.mockResolvedValue(new Blob(['png'],{ type: 'image/png' }));
    openFallback();
    fireEvent.click(screen.getByRole('button',{ name: 'Render preview frame' }));
    await waitFor(() => expect(api.getVideoJob).toHaveBeenCalledWith('exp-1',admitted.id));
    await screen.findByRole('img',{ name: 'Preview' });
    expect(api.fetchVideoArtifact).toHaveBeenCalledWith('exp-1',admitted.id,'preview.png');
  });
  it('persists the recipe and uses its exact revision on the next save',async () => {
    render(<VideoProductionPanel panel={panel} context={context()} />);await configureSource();
    chooseMenu('Project menu','Save recipe');
    await waitFor(() => expect(api.saveVideoRecipe).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.querySelector('[data-xgc-role="video-browser"]')).toHaveAttribute('data-xgc-recipe-ready','true'));
    chooseMenu('Project menu','Save recipe');
    await waitFor(() => expect(api.saveVideoRecipe).toHaveBeenCalledWith('exp-1',expect.anything(),expect.objectContaining({ revision: 'c'.repeat(64) })));
  });
  it('does not start an admitted task after switching Experiment scope',async () => {
    let resolveAdmission!: (value: typeof admitted) => void;
    api.createVideoJob.mockImplementation(() => new Promise((resolve) => { resolveAdmission = resolve; }));
    const port = renderPort();const view = render(<VideoProductionPanel panel={panel} context={context('exp-1',port)} />);await configureSource();
    fireEvent.click(screen.getByRole('button',{ name: 'Render 4K video' }));
    await waitFor(() => expect(api.createVideoJob).toHaveBeenCalled());
    view.rerender(<VideoProductionPanel panel={panel} context={context('exp-2',port)} />);
    await act(async () => { resolveAdmission(admitted); });
    expect(port.invoke).not.toHaveBeenCalled();expect(port.control).not.toHaveBeenCalled();
  });
  it('does not start an admitted task after changing the workflow binding in the same Experiment',async () => {
    let resolveAdmission!: (value:typeof admitted) => void;
    api.createVideoJob.mockImplementation(() => new Promise((resolve) => { resolveAdmission = resolve; }));
    const port = renderPort();port.trace.workflowInstanceId = 'original';
    const view = render(<VideoProductionPanel panel={panel} context={context('exp-1',port)} />);await configureSource();
    fireEvent.click(screen.getByRole('button',{ name:'Render 4K video' }));
    await waitFor(() => expect(api.createVideoJob).toHaveBeenCalled());
    port.trace.workflowInstanceId = 'replacement';
    view.rerender(<VideoProductionPanel panel={panel} context={context('exp-1',port)} />);
    await act(async () => resolveAdmission(admitted));
    expect(port.invoke).not.toHaveBeenCalled();expect(port.control).not.toHaveBeenCalled();
  });
  it('publishes a succeeded still to the scientific image gallery, never a video',async () => {
    const stillJob = {
      id: 'e'.repeat(32),experimentId: 'exp-1',bagId: 'bag-1',rendition: { kind: 'still',frame: 7 },status: 'succeeded',
      createdAt: '2026-09-16T00:00:00Z',updatedAt: '2026-09-16T00:00:01Z',requestSha256: 'd'.repeat(64),
      outputFrames: 1,renderedFrames: 1,encodedFrames: 1,captureCount: 1,artifact: 'still.png',
    };
    const videoJob = {
      id: 'f'.repeat(32),experimentId: 'exp-1',bagId: 'bag-1',rendition: { kind: 'video' },status: 'succeeded',
      createdAt: '2026-09-16T00:00:00Z',updatedAt: '2026-09-16T00:00:01Z',requestSha256: 'd'.repeat(64),
      outputFrames: 300,renderedFrames: 300,encodedFrames: 300,captureCount: 300,artifact: 'video.mp4',
    };
    api.listVideoJobs.mockResolvedValue({ items: [stillJob,videoJob] });
    api.publishVideoJobToGallery.mockResolvedValue({
      galleryId: '6b7e2da6-4747-4509-ad2f-8f331cf3e30f',publicationId: '6b7e2da6-4747-4509-ad2f-8f331cf3e30f',file: 'still.png',
    });
    render(<VideoProductionFrameProvider panel={panel}>
      <VideoProductionPanel panel={panel} context={context()} />
    </VideoProductionFrameProvider>);
    fireEvent.click(screen.getByRole('button',{ name: 'Renders' }));
    const publish = await screen.findByRole('button',{ name: 'Publish to gallery' });
    expect(screen.getAllByRole('button',{ name: 'Publish to gallery' })).toHaveLength(1);
    fireEvent.click(publish);
    await waitFor(() => expect(api.publishVideoJobToGallery).toHaveBeenCalledWith('exp-1',stillJob.id));
    await screen.findByText(/Published to the scientific image gallery: 6b7e2da6/);
    await waitFor(() => expect(screen.getByRole('button',{ name: 'Publish to gallery' })).toBeDisabled());
  });
  it('opens on the studio view and switches to the renders history from the header',async () => {
    render(<VideoProductionFrameProvider panel={panel}>
      <VideoProductionPanel panel={panel} context={context()} />
    </VideoProductionFrameProvider>);
    await waitFor(() => expect(api.listROSBagRecordings).toHaveBeenCalled());
    // The bar is thin: view switch, transport and one Render action — nothing else.
    const topbar = document.querySelector('[data-xgc-role="video-studio-topbar"][data-xgc-id="video"]') as HTMLElement;
    expect(topbar).toContainElement(document.querySelector('[data-xgc-role="video-production-views"]'));
    expect(topbar).toContainElement(document.querySelector('[data-xgc-role="video-transport"]'));
    expect(topbar).toContainElement(document.querySelector('[data-xgc-role="video-production-render"]'));
    expect(within(topbar).getAllByRole('button').map((node) => node.getAttribute('data-xgc-role'))
      .filter((role) => !role?.startsWith('video-transport') && role !== 'video-production-render')).toEqual(['video-production-view','video-production-view']);
    expect(topbar.querySelector('select,input,[role="combobox"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="video-workbench-tools"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="video-inspector"]')).not.toBeNull();
    expect(document.querySelector('[data-xgc-role="video-job-history"]')).toBeNull();
    fireEvent.click(screen.getByRole('button',{ name: 'Renders' }));
    expect(document.querySelector('[data-xgc-role="video-job-history"]')).not.toBeNull();
    expect(document.querySelector('[data-xgc-role="video-inspector"]')).toBeNull();
    fireEvent.click(screen.getByRole('button',{ name: 'Studio' }));
    expect(document.querySelector('[data-xgc-role="video-inspector"]')).not.toBeNull();
  });
  it('steps the playhead with the frame transport',async () => {
    render(<VideoProductionPanel panel={panel} context={context()} />);await configureSource();
    expect(screen.getByText('Frame 0 of 300')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{ name: 'Next frame' }));
    expect(screen.getByText('Frame 1 of 300')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{ name: 'Previous frame' }));
    expect(screen.getByText('Frame 0 of 300')).toBeInTheDocument();
    expect(screen.getByRole('button',{ name: 'First frame' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{ name: 'Last frame' }));
    expect(screen.getByText('Frame 299 of 300')).toBeInTheDocument();
    expect(screen.getByRole('button',{ name: 'Next frame' })).toBeDisabled();
  });
  it('closing the panel is not a render or recording cancellation',async () => {
    const port = renderPort();const view = render(<VideoProductionPanel panel={panel} context={context('exp-1',port)} />);await configureSource();
    fireEvent.click(screen.getByRole('button',{ name: 'Render 4K video' }));await waitFor(() => expect(port.invoke).toHaveBeenCalled());view.unmount();
    expect(port.control).not.toHaveBeenCalled();expect(api.cancelPreparedVideoJob).not.toHaveBeenCalled();
  });
  it('plays and pauses the playhead at wall-clock frame rate',async () => {
    render(<VideoProductionPanel panel={panel} context={context()} />);await configureSource();
    expect(screen.getByText('Frame 0 of 300')).toBeInTheDocument();
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole('button',{ name: 'Play' }));
      act(() => { vi.advanceTimersByTime(110); });
      expect(screen.getByText('Frame 3 of 300')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button',{ name: 'Pause' }));
      act(() => { vi.advanceTimersByTime(200); });
      expect(screen.getByText('Frame 3 of 300')).toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });
  it('stops playback at the last frame',async () => {
    render(<VideoProductionPanel panel={panel} context={context()} />);await configureSource();
    fireEvent.click(screen.getByRole('button',{ name: 'Last frame' }));
    fireEvent.click(screen.getByRole('button',{ name: 'Previous frame' }));
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole('button',{ name: 'Play' }));
      act(() => { vi.advanceTimersByTime(200); });
      expect(screen.getByText('Frame 299 of 300')).toBeInTheDocument();
      expect(screen.getByRole('button',{ name: 'Play' })).toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });
  it('adds and removes trail samples on the timeline',async () => {
    render(<VideoProductionPanel panel={panel} context={context()} />);await configureSource();
    chooseRendition('Afterimage trail');
    fireEvent.click(screen.getByRole('button',{ name: 'Add trail sample at playhead' }));
    expect(screen.getByRole('button',{ name: 'Trail sample frame 0' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{ name: 'Next frame' }));
    fireEvent.click(screen.getByRole('button',{ name: 'Add trail sample at playhead' }));
    expect(screen.getByRole('button',{ name: 'Trail sample frame 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{ name: 'Trail sample frame 0' }));
    expect(screen.getByLabelText('Trail frames (comma-separated, ascending)')).toHaveValue('1');
  });
  it('adds a path track with span/fade and submits it in the render request',async () => {
    const port = renderPort();render(<VideoProductionPanel panel={panel} context={context('exp-1',port)} />);await configureWithPathTopic();
    chooseMenu('Add track','Path: /planned');
    expect((screen.getByLabelText('Track label') as HTMLInputElement).value).toBe('/planned');
    expect((screen.getByLabelText('Exit (exclusive, seconds)') as HTMLInputElement).value).toBe('10');
    fireEvent.change(screen.getByLabelText('Fade in (seconds)'),{ target: { value: '0.25' } });
    await waitFor(() => expect(document.querySelector('[data-xgc-role="video-timeline-span"]')).not.toBeNull());
    fireEvent.click(screen.getByRole('button',{ name: 'Render 4K video' }));
    await waitFor(() => expect(api.createVideoJob).toHaveBeenCalledWith('exp-1',expect.objectContaining({
      settings: expect.objectContaining({ tracks: [expect.objectContaining({
        kind: 'path',label: '/planned',selector: { kind: 'topic',topic: '/planned' },
        span: { startNs: '0',endNs: '10000000000' },
        animation: { fadeInNs: '250000000',fadeOutNs: '0',easing: 'linear' },
        style: { color: '#3b82f6',opacity: 1,widthMeters: 0.01 },
      })] }),
    }),expect.any(String)));
  });
  it('selects and submits a recorded H264 camera only with installed decoder capability',async () => {
    api.getVideoCapabilities.mockResolvedValue({ ...capability,messageTypes:['sensor_msgs/CompressedImage','foxglove_msgs/CompressedVideo'] });
    api.getVideoSourceCatalog.mockResolvedValue({ ...catalog,topics:catalog.topics.map((topic) => topic.type === 'sensor_msgs/CompressedImage' ? { ...topic,type:'foxglove_msgs/CompressedVideo' } : topic) });
    render(<VideoProductionPanel panel={panel} context={context('exp-1',renderPort())} />);await configureSource();
    fireEvent.click(screen.getByRole('button',{ name:'Render 4K video' }));
    await waitFor(() => expect(api.createVideoJob).toHaveBeenCalled());
    expect(api.createVideoJob.mock.lastCall![1].videoRecipe.source).toMatchObject({ cameraTopic:'/camera/image/compressed',messageType:'foxglove_msgs/CompressedVideo' });
    await waitFor(() => expect(api.createVideoPreviewSession).toHaveBeenCalled());
    expect(api.createVideoPreviewSession.mock.lastCall![1].videoRecipe.source).toEqual(api.createVideoJob.mock.lastCall![1].videoRecipe.source);
  });
  it('does not offer or request a H264 camera when the runtime only supports JPEG/PNG',async () => {
    api.getVideoSourceCatalog.mockResolvedValue({ ...catalog,topics:catalog.topics.map((topic) => topic.type === 'sensor_msgs/CompressedImage' ? { ...topic,type:'foxglove_msgs/CompressedVideo' } : topic) });
    render(<VideoProductionPanel panel={panel} context={context('exp-1',renderPort())} />);await selectBag();
    fireEvent.click(screen.getByLabelText('Recorded camera',{ selector:'button' }));
    expect(screen.queryByRole('option',{ name:'/camera/image/compressed' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-xgc-role="video-source-camera"]')).toBeNull();
    expect(screen.getByRole('button',{ name:'Render 4K video' })).toBeDisabled();
    expect(api.createVideoPreviewSession).not.toHaveBeenCalled();expect(api.createVideoJob).not.toHaveBeenCalled();
  });
  it('waits for a late capability response before choosing the sole encoded camera',async () => {
    let finish!:(value:unknown) => void;
    api.getVideoCapabilities.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    api.getVideoSourceCatalog.mockResolvedValue({ ...catalog,topics:catalog.topics.map((topic) => topic.type === 'sensor_msgs/CompressedImage' ? { ...topic,type:'foxglove_msgs/CompressedVideo' } : topic) });
    render(<VideoProductionPanel panel={panel} context={context('exp-1',renderPort())} />);await selectBag();
    expect(document.querySelector('[data-xgc-role="video-source-camera"]')).toBeNull();
    expect(api.createVideoPreviewSession).not.toHaveBeenCalled();
    await act(async () => finish({ ...capability,messageTypes:['foxglove_msgs/CompressedVideo'] }));
    expect(screen.getByLabelText('Recorded camera',{ selector:'button' })).toHaveTextContent('/camera/image/compressed');
    expect(document.querySelector('[data-xgc-role="video-source-camera"]')).toHaveAttribute('aria-pressed','true');
  });
  it('uses the exact recorded object and controlled model, sharing visibility with preview and render',async () => {
    api.getVideoPreviewSession.mockResolvedValue({ sessionId,status:'ready',frameCount:300,snapshotSha256:sha });
    const historical = { status:'available',sha256:'c'.repeat(64),experimentId:'historical',experimentName:'Recorded experiment',runMode:'simulation' };
    const robot = { id:'recorded-robot',kind:'robot',label:'Recorded Scout',labelSource:'recorded-name',robot:{
      slotId:'ugv1',kind:'ugv',namespace:'/ugv1',visualizationDigest:'d'.repeat(64),description:{ package:'scout',file:'model.urdf' },modelEvidence:'metadata-only',suggestedModelIds:[],
      frame:{ id:'ugv1/base_link',evidence:'recorded-visualization',availability:'unverified' } } };
    api.getVideoSourceCatalog.mockResolvedValue({ ...catalog,recordedContext:historical,objects:[robot,...catalog.objects] });
    render(<VideoProductionPanel panel={panel} context={context('exp-1',renderPort())} />);await configureSource();
    chooseMenu('Add model track for Recorded Scout','Mocap rotor');
    expect(screen.getByLabelText('Recorded TF frame')).toHaveValue('ugv1/base_link');
    fireEvent.click(screen.getByRole('button',{ name:'Hide tracks of Recorded Scout' }));
    expect(screen.getByRole('button',{ name:'Recorded Scout · 0–10s' })).toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('button',{ name:'Track visibility' })).toHaveAttribute('aria-pressed','false');
    expect(document.querySelector('[data-xgc-role="video-timeline-span"]')).toHaveAttribute('data-enabled','false');
    await screen.findByTitle('Interactive preview');
    fireEvent.click(screen.getByRole('button',{ name:'Refresh interactive preview' }));
    await waitFor(() => expect(api.createVideoPreviewSession).toHaveBeenLastCalledWith('exp-1',expect.objectContaining({ settings:expect.objectContaining({
      sourceContextSha256:historical.sha256,tracks:[expect.objectContaining({ enabled:false,source:{ modelId:'mocap-rotor',bundleSha256:'a'.repeat(64),frameId:'ugv1/base_link' } })],
    }) })));
    fireEvent.click(screen.getByRole('button',{ name:'Render 4K video' }));
    await waitFor(() => expect(api.createVideoJob).toHaveBeenCalled());
    expect(api.createVideoJob.mock.lastCall![1].settings).toEqual(api.createVideoPreviewSession.mock.lastCall![1].settings);
    expect(api.createVideoJob.mock.lastCall![1].settings.tracks[0]).toMatchObject({ label:'Recorded Scout',enabled:false,span:{ startNs:'0',endNs:'10000000000' } });
  });
  it('adds a catalog path only with an explicit layer and enables that source in the same request',async () => {
    render(<VideoProductionPanel panel={panel} context={context('exp-1',renderPort())} />);await configureSource();
    openSettings('Sources & layers');
    fireEvent.click(document.querySelector('[data-xgc-role="video-layer-topic"][data-xgc-id="video:history:/planned"]')!);
    closeSettings();
    chooseMenu('Add track for /planned','Add as History');
    fireEvent.click(screen.getByRole('button',{ name:'Render 4K video' }));
    await waitFor(() => expect(api.createVideoJob).toHaveBeenCalled());
    const request = api.createVideoJob.mock.lastCall![1];
    expect(request.videoRecipe.view.layers.history).toBe(true);
    expect(request.settings.layerTopics.history).toEqual(['/planned']);
    expect(request.settings.tracks[0]).toMatchObject({ kind:'path',selector:{ kind:'topic',topic:'/planned' },style:{ color:'#3b82f6' } });
  });
  it('rejects a changed recorded-context digest when restoring a pinned saved recipe',async () => {
    api.getVideoSourceCatalog.mockResolvedValue({ ...catalog,recordedContext:{ status:'available',sha256:'e'.repeat(64),experimentId:'historical' } });
    const first = render(<VideoProductionPanel panel={panel} context={context('exp-1',renderPort())} />);await configureSource();
    chooseMenu('Project menu','Save recipe');
    await waitFor(() => expect(api.saveVideoRecipe).toHaveBeenCalled());
    const request = api.saveVideoRecipe.mock.calls[0][1];
    first.unmount();
    api.listVideoRecipes.mockResolvedValue({ items:[{ id:'pinned',experimentId:'exp-1',revision:'revision',updatedAt:'2026-09-19T00:00:00Z',request }] });
    api.getVideoSourceCatalog.mockResolvedValue({ ...catalog,recordedContext:{ status:'available',sha256:'f'.repeat(64),experimentId:'historical' } });
    render(<VideoProductionPanel panel={panel} context={context('exp-1',renderPort())} />);
    await waitFor(() => expect(api.listVideoRecipes).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button',{ name:/bag-1 · \/camera\/image\/compressed · 0–10s/ }));
    await screen.findByText(/saved recording context changed/);
    expect(screen.getByRole('button',{ name:'Render 4K video' })).toBeDisabled();
    expect(document.querySelector('[data-xgc-role="video-source-objects"]')).toBeNull();
    expect(api.createVideoJob).not.toHaveBeenCalled();
  });
  it.each([true,false])('labels the recent recording with available identity, never its archive path (metadata=%s)',async (metadata) => {
    api.listROSBagRecordings.mockResolvedValue({ items:[{ ...bag,name:'Experiments/name/Runs/run/Data/segment.bag',
      ...(metadata ? { experimentName:'Recorded experiment',runMode:'simulation',startedAt:'2026-09-19T12:30:00Z' } : {}) }],offset:0,total:1,truncated:false });
    render(<VideoProductionPanel panel={panel} context={context()} />);
    const recent = await screen.findByRole('button',{ name:/Latest recording/ });
    expect(recent).toHaveTextContent(metadata ? 'Recorded experiment · segment.bag' : 'segment.bag');
    expect(recent).not.toHaveTextContent('Experiments/');
    if (!metadata) expect(recent).not.toHaveTextContent('Simulation');
  });
  it('blocks the render when same-object tracks overlap in time',async () => {
    render(<VideoProductionPanel panel={panel} context={context()} />);await configureSource();
    chooseMenu('Add track','Robot model: Mocap rotor');
    fireEvent.change(screen.getByLabelText('Recorded TF frame'),{ target: { value: 'uav1/base_link' } });
    fireEvent.change(screen.getByLabelText('Exit (exclusive, seconds)'),{ target: { value: '6' } });
    chooseMenu('Add track','Robot model: Mocap rotor');
    fireEvent.change(screen.getByLabelText('Recorded TF frame'),{ target: { value: 'uav1/base_link' } });
    fireEvent.change(screen.getByLabelText('Enter (seconds from bag start)'),{ target: { value: '4' } });
    await screen.findByText(/must not overlap/);
    expect(screen.getByRole('button',{ name: 'Render 4K video' })).toBeDisabled();
  });
  it('declares a signed clock offset on a TF edge',async () => {
    const port = renderPort();render(<VideoProductionPanel panel={panel} context={context('exp-1',port)} />);await configureSource();
    openSettings('Clock sync');
    fireEvent.click(screen.getByRole('button',{ name: 'Add clock mapping' }));
    fireEvent.click(screen.getByRole('button',{ name: 'TF edge' }));
    selectControlOption('Recorded topic','/tf');
    fireEvent.change(screen.getByLabelText('Parent frame'),{ target: { value: 'world' } });
    fireEvent.change(screen.getByLabelText('Child frame'),{ target: { value: 'uav1/base_link' } });
    fireEvent.change(screen.getByLabelText('Offset (seconds, signed)'),{ target: { value: '-0.5' } });
    closeSettings();
    fireEvent.click(screen.getByRole('button',{ name: 'Render 4K video' }));
    await waitFor(() => expect(api.createVideoJob).toHaveBeenCalledWith('exp-1',expect.objectContaining({
      settings: expect.objectContaining({ clockMappings: [expect.objectContaining({
        selector: { kind: 'tf-edge',topic: '/tf',parentFrame: 'world',childFrame: 'uav1/base_link' },
        offsetNs: '-500000000',provenance: 'operator-declared',
      })] }),
    }),expect.any(String)));
  });
  it('rejects a duplicate clock scope and a topic-wide TF mapping over edge mappings',async () => {
    render(<VideoProductionPanel panel={panel} context={context()} />);await configureSource();
    openSettings('Clock sync');
    fireEvent.click(screen.getByRole('button',{ name: 'Add clock mapping' }));
    fireEvent.click(screen.getByRole('button',{ name: 'TF edge' }));
    selectControlOption('Recorded topic','/tf');
    fireEvent.change(screen.getByLabelText('Parent frame'),{ target: { value: 'world' } });
    fireEvent.change(screen.getByLabelText('Child frame'),{ target: { value: 'uav1/base_link' } });
    fireEvent.click(screen.getByRole('button',{ name: 'Add clock mapping' }));
    const topics = screen.getAllByLabelText('Recorded topic');
    fireEvent.click(topics[1]);
    fireEvent.click(screen.getByRole('option',{ name: '/tf' }));
    expect((await screen.findAllByText(/A topic-wide TF mapping cannot coexist with edge mappings/)).length).toBeGreaterThan(0);
    expect(screen.getByRole('button',{ name: 'Render 4K video' })).toBeDisabled();
  });
  it('enables the owning layer when a track is added',async () => {
    const port = renderPort();render(<VideoProductionPanel panel={panel} context={context('exp-1',port)} />);
    await selectBag();
    selectControlOption('Recorded calibration','/camera/info');
    fireEvent.change(screen.getByLabelText('Recorded fixed frame'),{ target: { value: 'world' } });
    ensurePressed('/tf');
    ensureTopic('history','/planned');
    for (const name of ['History','Predictions','Labels','Obstacles']) ensureReleased(name);
    closeSettings();
    chooseMenu('Add track','Path: /planned');
    await waitFor(() => expect(screen.getByRole('button',{ name: 'Render 4K video' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button',{ name: 'Render 4K video' }));
    await waitFor(() => expect(api.createVideoJob).toHaveBeenCalledWith('exp-1',expect.objectContaining({
      videoRecipe: expect.objectContaining({ view: { kind: 'ar',layers: { history: true,predictions: false,labels: false,obstacles: false } } }),
      settings: expect.objectContaining({ tracks: [expect.objectContaining({ kind: 'path' })] }),
    }),expect.any(String)));
  });
  it('blocks the submit when a tracked layer is disabled or its topic source removed',async () => {
    render(<VideoProductionPanel panel={panel} context={context('exp-1',renderPort())} />);await configureWithPathTopic();
    chooseMenu('Add track','Path: /planned');
    await waitFor(() => expect(screen.getByRole('button',{ name: 'Render 4K video' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button',{ name: 'Back to sequence' }));
    fireEvent.click(screen.getByRole('button',{ name: 'History' }));
    await screen.findByText(/layer is disabled/);
    expect(screen.getByRole('button',{ name: 'Render 4K video' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{ name: 'History' }));
    await waitFor(() => expect(screen.getByRole('button',{ name: 'Render 4K video' })).toBeEnabled());
    openSettings('Sources & layers');
    const historyTopic = document.querySelector('[data-xgc-role="video-layer-topic"][data-xgc-id="video:history:/planned"]');
    expect(historyTopic).not.toBeNull();
    fireEvent.click(historyTopic as Element);
    await screen.findByText(/no longer a selected source/);
    expect(screen.getByRole('button',{ name: 'Render 4K video' })).toBeDisabled();
  });
  it('loading a saved recipe then deleting its edits leaves no stale tracks or clock mappings',async () => {
    const savedRecipe = {
      id: 'r'.repeat(32),experimentId: 'exp-1',revision: 'rev-1',updatedAt: '2026-09-19T00:00:00Z',
      request: {
        videoRecipe: {
          schema: 'xgc2.video-recipe',version: 1,experimentId: 'exp-1',
          source: { kind: 'rosbag',bagId: 'bag-1',recordedSize: 1024,sessionId: 'session-1',cameraTopic: '/camera/image/compressed',messageType: 'sensor_msgs/CompressedImage' },
          interval: { basis: 'bag-start',startNs: '0',endNs: '10000000000',endExclusive: true },
          output: { width: 3840,height: 2160,fps: 30,codec: 'h264',pixelFormat: 'yuv420p' },
          view: { kind: 'ar',layers: { history: true,predictions: false,labels: false,obstacles: false } },
          requires: { immutableSourceSnapshot: true,nativeCameraPixels: true,frameReadyProtocol: 1 },
        },
        settings: {
          calibrationTopic: '/camera/info',fixedFrame: 'world',transformTopics: ['/tf'],staticTransformTopics: [],
          layerTopics: { history: ['/planned'],predictions: [],labels: [],obstacles: [] },pathColors: {},pathWidth: 0.01,
          clockMappings: [{ id: 'm1',selector: { kind: 'topic',topic: '/tf' },offsetNs: '-500000000',provenance: 'operator-declared' }],
          tracks: [{ id: 't1',label: 'Planned',kind: 'path',selector: { kind: 'topic',topic: '/planned' },
            span: { startNs: '0',endNs: '10000000000' },animation: { fadeInNs: '0',fadeOutNs: '0',easing: 'linear' },
            style: { color: '#22c55e',opacity: 1,widthMeters: 0.01 } }],
        },
        rendition: { kind: 'video' },
      },
    };
    api.getVideoSourceCatalog.mockResolvedValue({ ...catalog,recordedContext:{ status:'available',sha256:'e'.repeat(64),experimentId:'historical' } });
    api.listVideoRecipes.mockResolvedValue({ items: [savedRecipe] });
    render(<VideoProductionPanel panel={panel} context={context('exp-1',renderPort())} />);
    await waitFor(() => expect(api.listVideoRecipes).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button',{ name:/bag-1 · \/camera\/image\/compressed · 0–10s/ }));
    await waitFor(() => expect(screen.getByRole('button',{ name: 'Render 4K video' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button',{ name: 'Planned · 0–10s' }));
    fireEvent.click(screen.getByRole('button',{ name: 'Delete track' }));
    openSettings('Clock sync');
    fireEvent.click(screen.getByRole('button',{ name: 'Delete mapping' }));
    closeSettings();
    await waitFor(() => expect(screen.getByRole('button',{ name: 'Render 4K video' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button',{ name: 'Render 4K video' }));
    await waitFor(() => expect(api.createVideoJob).toHaveBeenCalled());
    const rendered = api.createVideoJob.mock.calls[0][1] as { settings: Record<string,unknown> };
    expect('tracks' in rendered.settings).toBe(false);
    expect('clockMappings' in rendered.settings).toBe(false);
    expect('sourceContextSha256' in rendered.settings).toBe(false);
    chooseMenu('Project menu','Save recipe');
    await waitFor(() => expect(api.saveVideoRecipe).toHaveBeenCalled());
    const persisted = api.saveVideoRecipe.mock.calls.at(-1)![1] as { settings: Record<string,unknown> };
    expect('tracks' in persisted.settings).toBe(false);
    expect('clockMappings' in persisted.settings).toBe(false);
  });
  it('drives the studio from the keyboard but never while typing',async () => {
    render(<VideoProductionPanel panel={panel} context={context()} />);await configureSource();
    fireEvent.keyDown(document.body,{ key: 'ArrowRight' });
    expect(screen.getByText('Frame 1 of 300')).toBeInTheDocument();
    fireEvent.keyDown(document.body,{ key: 'ArrowRight',shiftKey: true });
    expect(screen.getByText('Frame 11 of 300')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText('Start (seconds from bag start)'),{ key: 'ArrowRight' });
    expect(screen.getByText('Frame 11 of 300')).toBeInTheDocument();
    fireEvent.keyDown(document.body,{ key: 'End' });
    expect(screen.getByText('Frame 299 of 300')).toBeInTheDocument();
    fireEvent.keyDown(document.body,{ key: 'Home' });
    expect(screen.getByText('Frame 0 of 300')).toBeInTheDocument();
    fireEvent.keyDown(document.body,{ key: ' ' });
    expect(screen.getByRole('button',{ name: 'Pause' })).toBeInTheDocument();
    fireEvent.keyDown(document.body,{ key: ' ' });
    expect(screen.getByRole('button',{ name: 'Play' })).toBeInTheDocument();
  });
  it('marks in/out at the playhead and keeps output markers on the same source instant',async () => {
    const port = renderPort();render(<VideoProductionPanel panel={panel} context={context('exp-1',port)} />);await configureSource();
    chooseRendition('Afterimage trail');
    fireEvent.change(screen.getByLabelText('Trail frames (comma-separated, ascending)'),{ target: { value: '15,45,60,90' } });
    for (let step = 0; step < 30; step += 1) fireEvent.keyDown(document.body,{ key: 'ArrowRight' });
    fireEvent.keyDown(document.body,{ key: 'i' });
    expect(screen.getByLabelText('Start (seconds from bag start)')).toHaveValue('1');
    expect(screen.getByLabelText('Trail frames (comma-separated, ascending)')).toHaveValue('15,30,60');
    expect(screen.getByText('Frame 0 of 270')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{ name: 'Last frame' }));
    fireEvent.click(screen.getByRole('button',{ name: 'Previous frame' }));
    fireEvent.click(screen.getByRole('button',{ name: /^Mark out/ }));
    expect(screen.getByLabelText('End (exclusive, seconds from bag start)')).toHaveValue('9.966666666');
    fireEvent.click(screen.getByRole('button',{ name: 'Render 4K afterimage' }));
    await waitFor(() => expect(api.createVideoJob).toHaveBeenCalledWith('exp-1',expect.objectContaining({
      videoRecipe: expect.objectContaining({ interval: expect.objectContaining({ startNs: '1000000000',endNs: '9966666666' }) }),
      rendition: { kind: 'trail',frames: [15,30,60],method: 'afterimage',fadeFromPermille: 280,fadeToPermille: 720 },
    }),expect.any(String)));
  });
  it('distributes explicit afterimage moments over a window, the last one solid',async () => {
    const port = renderPort();render(<VideoProductionPanel panel={panel} context={context('exp-1',port)} />);await configureSource();
    chooseRendition('Afterimage trail');
    fireEvent.change(screen.getByLabelText('Window from frame'),{ target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Window to frame'),{ target: { value: '299' } });
    fireEvent.change(screen.getByLabelText('Samples'),{ target: { value: '4' } });
    fireEvent.click(screen.getByRole('button',{ name: 'Distribute samples' }));
    expect(screen.getByLabelText('Trail frames (comma-separated, ascending)')).toHaveValue('0,100,199,299');
    expect(document.querySelector('[data-xgc-role="video-trail-summary"]')).toHaveTextContent('4 moments · last one solid');
    const samples = document.querySelectorAll('[data-xgc-role="video-timeline-sample"]');
    expect(samples).toHaveLength(4);
    expect(samples[3]).toHaveAttribute('data-solid','true');expect(samples[0]).not.toHaveAttribute('data-solid');
    fireEvent.click(screen.getByRole('button',{ name: 'Render 4K afterimage' }));
    await waitFor(() => expect(api.createVideoJob).toHaveBeenCalledWith('exp-1',expect.objectContaining({
      rendition: { kind: 'trail',frames: [0,100,199,299],method: 'afterimage',fadeFromPermille: 280,fadeToPermille: 720 },
    }),expect.any(String)));
  });
  it('sets the still frame from the playhead',async () => {
    render(<VideoProductionPanel panel={panel} context={context('exp-1',renderPort())} />);await configureSource();
    chooseRendition('Still frame');
    fireEvent.click(screen.getByRole('button',{ name: 'Next frame' }));
    fireEvent.click(screen.getByRole('button',{ name: 'Next frame' }));
    fireEvent.keyDown(document.body,{ key: 's' });
    expect(screen.getByLabelText('Still frame (zero-based)')).toHaveValue('2');
    expect(screen.getByRole('img',{ name: 'Still frame 2' })).toHaveClass('video-timeline-still');
  });
  it('lists camera streams and finished renders in the media bin',async () => {
    const finished = { id: 'f'.repeat(32),experimentId: 'exp-1',bagId: 'bag-1',rendition: { kind: 'trail',frames: [0,10],halfLifeNs: '500000000' },status: 'succeeded',
      createdAt: '2026-09-16T00:00:00Z',updatedAt: '2026-09-16T00:00:01Z',requestSha256: 'd'.repeat(64),
      outputFrames: 300,renderedFrames: 2,encodedFrames: 0,captureCount: 2,artifact: 'trail.png' };
    api.listVideoJobs.mockResolvedValue({ items: [finished,{ ...finished,id: 'e'.repeat(32),status: 'failed',artifact: undefined }] });
    api.fetchVideoArtifact.mockResolvedValue(new Blob(['png']));
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:trail');globalThis.URL.revokeObjectURL = vi.fn();
    render(<VideoProductionPanel panel={panel} context={context()} />);await configureSource();
    fireEvent.click(screen.getByRole('button',{ name: 'Media' }));
    expect(document.querySelector('[data-xgc-role="video-media-camera"]')).toHaveAttribute('aria-pressed','true');
    const renders = await waitFor(() => { const nodes = document.querySelectorAll('[data-xgc-role="video-media-render"]');expect(nodes).toHaveLength(1);return nodes; });
    fireEvent.click(renders[0]);
    await waitFor(() => expect(api.fetchVideoArtifact).toHaveBeenCalledWith('exp-1','f'.repeat(32),'trail.png'));
    expect(await screen.findByRole('img',{ name: 'Preview' })).toHaveAttribute('src','blob:trail');
  });
});

describe('Interactive preview session',() => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.listROSBagRecordings.mockResolvedValue({ items: [bag],offset: 0,limit: 100,total: 1,truncated: false });
    api.getVideoSourceCatalog.mockResolvedValue(catalog);
    api.getVideoCapabilities.mockResolvedValue(capability);
    api.listVideoRecipes.mockResolvedValue({ items: [] });api.listVideoJobs.mockResolvedValue({ items: [] });
    api.createVideoJob.mockResolvedValue(admitted);
    api.createVideoPreviewSession.mockResolvedValue({ sessionId,status: 'preparing' });
    api.getVideoPreviewSession.mockResolvedValue({ sessionId,status: 'preparing' });
    api.getVideoPreviewFrameMap.mockResolvedValue({ plans: Array.from({ length: 300 },(_,index) => plan(index)),diagnostics: { outputFrames: 300 } });
    api.videoPreviewRendererUrl.mockImplementation((experiment: string,session: string,hash: string) => `/api/recordings/video-production/${experiment}/preview-sessions/${session}/renderer/index.html?xgcTfHistorySeconds=600&xgcInteractive=1#snapshot=…&sha256=${hash}`);
    api.saveVideoRecipe.mockImplementation((experimentId,request) => Promise.resolve({ id: 'b'.repeat(32),experimentId,request,revision: 'c'.repeat(64),updatedAt: '2026-09-16T00:00:00Z' }));
  });
  async function readyStage() {
    api.getVideoPreviewSession.mockResolvedValue({ sessionId,status: 'ready',frameCount: 300,snapshotSha256: sha });
    render(<VideoProductionPanel panel={panel} context={context('exp-1',renderPort())} />);
    await configureSource();
    // Admission can finish on the seeded clip before the operator's last edit.
    // Wait until that session is on screen, then refresh once if it is stale.
    await screen.findByTitle('Interactive preview');
    if (screen.queryByText('Preview is out of date')) {
      fireEvent.click(screen.getByRole('button',{ name: 'Refresh interactive preview' }));
      await waitFor(() => expect(screen.queryByText('Preview is out of date')).not.toBeInTheDocument());
    }
    return await screen.findByTitle('Interactive preview') as HTMLIFrameElement;
  }
  function requests(spy: ReturnType<typeof vi.spyOn>) {
    return spy.mock.calls.map((call: unknown[]) => call[0] as { type: string;requestId: string;plan: { frameIndex: number } });
  }
  function answer(frame: HTMLIFrameElement,request: { requestId: string;plan: unknown },type: 'frame-ready' | 'frame-error' = 'frame-ready') {
    fireEvent(window,new MessageEvent('message',{
      origin: window.location.origin,source: frame.contentWindow as Window,
      data: { channel: VIDEO_FRAME_CHANNEL,version: 1,type,requestId: request.requestId,plan: request.plan,...(type === 'frame-error' ? { error: 'renderer failed' } : {}) },
    }));
  }
  it('admits one session with the full edit request as its fingerprint',async () => {
    render(<VideoProductionPanel panel={panel} context={context('exp-1',renderPort())} />);
    await configureSource();
    await waitFor(() => expect(api.createVideoPreviewSession).toHaveBeenCalledTimes(1));
    expect(api.createVideoPreviewSession).toHaveBeenCalledWith('exp-1',{
      videoRecipe: expect.objectContaining({
        source: expect.objectContaining({ bagId: 'bag-1',cameraTopic: '/camera/image/compressed' }),
        interval: { basis: 'bag-start',startNs: '0',endNs: '10000000000',endExclusive: true },
        output: expect.objectContaining({ fps: 30 }),
      }),
      settings: expect.objectContaining({ calibrationTopic: '/camera/info',fixedFrame: 'world',transformTopics: ['/tf'] }),
    });
    await screen.findByText('Preparing interactive preview');
  });
  it('embeds the pinned renderer once the session is ready',async () => {
    const frame = await readyStage();
    await waitFor(() => expect(api.getVideoPreviewFrameMap).toHaveBeenCalledWith('exp-1',sessionId));
    expect(frame.src).toContain(`/preview-sessions/${sessionId}/renderer/index.html`);
    expect(frame.src).toContain(`sha256=${sha}`);
  });
  it('scrubs serially: one in-flight request, coalesced scrub targets',async () => {
    const frame = await readyStage();
    const spy = vi.spyOn(frame.contentWindow as Window,'postMessage');
    fireEvent.load(frame);
    await waitFor(() => expect(requests(spy)).toHaveLength(1));
    expect(requests(spy)[0].plan).toEqual(plan(0));
    // Scrub while the first frame is in flight: nothing is sent until it settles.
    const playhead = screen.getByRole('slider',{ name: 'Playhead' });
    fireEvent.keyDown(playhead,{ key: 'ArrowRight' });
    const start = Date.now();
    await waitFor(() => expect(Date.now() - start).toBeGreaterThan(250),{ interval: 25 });
    expect(requests(spy)).toHaveLength(1);
    answer(frame,requests(spy)[0] as never);
    await waitFor(() => expect(requests(spy)).toHaveLength(2));
    expect(requests(spy)[1].plan).toEqual(plan(1));
    answer(frame,requests(spy)[1] as never);
    await waitFor(() => expect(screen.queryByText(/Renderer reloaded/)).not.toBeInTheDocument());
  });
  it('stops on a frame failure and recreates the renderer only on explicit retry',async () => {
    const frame = await readyStage();
    const spy = vi.spyOn(frame.contentWindow as Window,'postMessage');
    fireEvent.load(frame);
    await waitFor(() => expect(requests(spy)).toHaveLength(1));
    answer(frame,requests(spy)[0] as never,'frame-error');
    await screen.findByText('Preview could not render this frame. Retry or check source settings.');
    expect(requests(spy)).toHaveLength(1);
    expect(screen.getByTitle('Interactive preview')).toBe(frame);
    fireEvent.keyDown(screen.getByRole('slider',{ name: 'Playhead' }),{ key: 'ArrowRight' });
    expect(requests(spy)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button',{ name: 'Retry preview' }));
    await waitFor(() => expect(screen.getByTitle('Interactive preview')).not.toBe(frame));
    const replacement = screen.getByTitle('Interactive preview') as HTMLIFrameElement;
    const retrySpy = vi.spyOn(replacement.contentWindow as Window,'postMessage');
    fireEvent.load(replacement);
    await waitFor(() => expect(requests(retrySpy)).toHaveLength(1));
    answer(replacement,requests(retrySpy)[0] as never);
    await waitFor(() => expect(screen.queryByRole('button',{ name: 'Retry preview' })).not.toBeInTheDocument());
  });
  it('marks a stale preview when the clip changes and refreshes explicitly',async () => {
    await readyStage();
    openSettings('Sources & layers');
    const beforeEdit = api.createVideoPreviewSession.mock.calls.length;
    fireEvent.change(screen.getByLabelText('End (exclusive, seconds from bag start)'),{ target: { value: '9' } });
    await screen.findByText('Preview is out of date');
    expect(api.createVideoPreviewSession).toHaveBeenCalledTimes(beforeEdit);
    closeSettings();
    fireEvent.click(screen.getByRole('button',{ name: 'Refresh interactive preview' }));
    await waitFor(() => expect(api.createVideoPreviewSession).toHaveBeenCalledTimes(beforeEdit + 1));
    expect(api.createVideoPreviewSession).toHaveBeenLastCalledWith('exp-1',expect.objectContaining({
      videoRecipe: expect.objectContaining({ interval: expect.objectContaining({ startNs: '0',endNs: '9000000000' }) }),
    }));
  });
  it('marks the preview stale when a source setting or an edit changes',async () => {
    await readyStage();
    openSettings('Sources & layers');
    fireEvent.change(screen.getByLabelText('Path width (metres)'),{ target: { value: '0.02' } });
    await screen.findByText('Preview is out of date');
  });
  it('locks the old preview when the current edit cannot build a valid request',async () => {
    const frame = await readyStage();
    const spy = vi.spyOn(frame.contentWindow as Window,'postMessage');
    fireEvent.load(frame);
    await waitFor(() => expect(requests(spy)).toHaveLength(1));
    chooseMenu('Add track','Robot model: Mocap rotor');
    await screen.findByText('Preview is out of date');
    expect(screen.getByRole('button',{ name: 'Refresh interactive preview' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('slider',{ name: 'Playhead' }),{ key: 'ArrowRight' });
    expect(requests(spy)).toHaveLength(1);
  });
  it('coalesces continuous scrubbing behind the frame ACK: multiple sends, latest frame last',async () => {
    const frame = await readyStage();
    const spy = vi.spyOn(frame.contentWindow as Window,'postMessage');
    fireEvent.load(frame);
    await waitFor(() => expect(requests(spy)).toHaveLength(1));
    answer(frame,requests(spy)[0] as never);
    const playhead = screen.getByRole('slider',{ name: 'Playhead' });
    // ~500 ms of 30 fps input: 16 frame steps, each ACK releasing the coalesced next send.
    for (let step = 1; step <= 16; step += 1) {
      fireEvent.keyDown(playhead,{ key: 'ArrowRight' });
      await screen.findByText(`Frame ${step} of 300`);
      await waitFor(() => expect(requests(spy).length).toBe(step + 1));
      answer(frame,requests(spy).at(-1) as never);
      await act(async () => {});
    }
    const sent = requests(spy);
    expect(sent.length).toBeGreaterThan(2);
    expect(sent[sent.length - 1].plan.frameIndex).toBe(16);
  });
  it('keeps the PNG job path as a labelled fallback when the session fails',async () => {
    api.createVideoPreviewSession.mockRejectedValue(new Error('ambiguous CameraInfo attribution'));
    render(<VideoProductionPanel panel={panel} context={context('exp-1',renderPort())} />);
    await configureSource();
    await screen.findByText(/ambiguous CameraInfo attribution/);
    expect(screen.getByRole('button',{ name: 'Retry interactive preview' })).toBeInTheDocument();
    openFallback();
    fireEvent.change(screen.getByLabelText('Preview frame (zero-based)'),{ target: { value: '3' } });
    fireEvent.click(screen.getByRole('button',{ name: 'Render preview frame' }));
    await waitFor(() => expect(api.createVideoJob).toHaveBeenCalledWith('exp-1',expect.objectContaining({ rendition: { kind: 'preview',frame: 3 } }),expect.any(String)));
  });
});
