// @vitest-environment jsdom
import { fireEvent,render,screen,within } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { VideoSourceCatalog,VideoSourceObject,VideoModelCapability } from '../../../domains/recording/recordingPublic';
import { selectControlOption } from '../../../test/selectControlTestUtils';
import { newVideoTrackDraft } from './videoEditingModel';
import { initialVideoSettings } from './videoSourceSettingsModel';
import { VideoSourceObjects } from './VideoSourceObjects';
import { VideoTrackInspector } from './VideoEditingCards';
const digest = 'a'.repeat(64);
const model:VideoModelCapability = { modelId:'controlled-model',label:'Controlled Scout',bundleSha256:digest,description:{ package:'scout',file:'model.urdf' },rootFrame:'base_link',jointPose:'urdf-rest' };
function robot(index:number):VideoSourceObject { return { id:`robot-${index}`,kind:'robot',label:`Recorded ${index}`,labelSource:'recorded-name',robot:{
  slotId:`slot${index}`,kind:'ugv',namespace:`/r${index}`,visualizationDigest:digest,frame:{ id:`r${index}/base_link`,evidence:'recorded-visualization',availability:'unverified' },
  description:{ package:'scout',file:'model.urdf' },modelEvidence:'metadata-only',suggestedModelIds:[model.modelId] } }; }
function setup(objects:VideoSourceObject[],tracks:ReturnType<typeof newVideoTrackDraft>[] = []) {
  const catalog:VideoSourceCatalog = { id:'bag',name:'record.bag',experimentId:'workspace',sessionId:'',size:1024,durationNs:'10000000000',topics:[],
    recordedContext:{ status:'available',sha256:digest,experimentId:'recorded',experimentName:'Historic experiment',runMode:'simulation' },
    recordFacts:{ status:'absent',reason:'missing-descriptor' },objects };
  const props = { id:'video',catalog,models:[model],settings:initialVideoSettings(),tracks,selectedTrackId:tracks[0]?.id ?? '',cameraTopic:'',canToggle:true,
    onSelectTrack:vi.fn(),onSetEnabled:vi.fn(),onAdd:vi.fn(),onCamera:vi.fn() };
  render(<VideoSourceObjects {...props} />);return props;
}
describe('recorded objects',() => {
  it.each([4,5,9])('shows exactly the %i recorded robots and requires an explicit controlled model', (count) => {
    const props = setup(Array.from({ length:count },(_,index) => robot(index)));
    expect(document.querySelectorAll('[data-xgc-role="video-source-robot"]')).toHaveLength(count);
    expect(screen.getByText('Historic experiment · Simulation')).toBeInTheDocument();
    const first = document.querySelector('[data-xgc-role="video-source-robot"]') as HTMLElement;
    const toggle = first.querySelector('[data-xgc-role="video-source-robot-toggle"]') as HTMLElement;
    expect(toggle.getAttribute('title')).toContain('Model bytes not recorded');
    expect(toggle.getAttribute('title')).toContain('Frame unverified');
    fireEvent.click(within(first).getByRole('button',{ name:'Add model track for Recorded 0' }));
    fireEvent.click(screen.getByRole('menuitem',{ name:'Controlled Scout' }));
    expect(props.onAdd).toHaveBeenCalledWith({ objectId:'robot-0',modelId:'controlled-model' });
  });
  it('bulk visibility includes only exact owned tracks and never deletes or selects them',() => {
    const own = { ...newVideoTrackDraft('path',{ topic:'/r0/path',durationNs:10_000_000_000n }),id:'own',label:'Owned' };
    const unbound = { ...own,id:'unbound',topic:'/r1/path',label:'Unbound' };
    const path:VideoSourceObject = { id:'path',kind:'path',label:'/r0/path',labelSource:'topic',topic:'/r0/path',selector:{ kind:'topic',topic:'/r0/path' },parentId:'robot-0' };
    const props = setup([robot(0),path],[own,unbound]);
    fireEvent.click(screen.getByRole('button',{ name:'Hide tracks of Recorded 0' }));
    expect(props.onSetEnabled).toHaveBeenCalledWith(['own'],false);
    expect(props.onSelectTrack).not.toHaveBeenCalled();
    expect(screen.getByRole('button',{ name:'Unbound · 0–10s' })).toBeInTheDocument();
  });
  it('does not attach an ambiguous model frame to either recorded robot',() => {
    const first = robot(0),second = robot(1);second.robot!.frame.id = first.robot!.frame.id;
    const track = { ...newVideoTrackDraft('robot-model',{ durationNs:10_000_000_000n,frameId:first.robot!.frame.id }),id:'ambiguous',label:'Ambiguous',enabled:false };
    const props = setup([first,second],[track]);
    expect(screen.getByRole('button',{ name:'Show tracks of Recorded 0' })).toBeDisabled();
    expect(screen.getByRole('button',{ name:'Show tracks of Recorded 1' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{ name:'Show Ambiguous' }));
    expect(props.onSetEnabled).toHaveBeenCalledWith(['ambiguous'],true);
    expect(screen.getByRole('button',{ name:'Ambiguous · 0–10s' })).toHaveAttribute('aria-pressed','true');
  });
  it('requires the selected source role before adding a path',() => {
    const path:VideoSourceObject = { id:'path',kind:'path',label:'/route',labelSource:'topic',topic:'/route',selector:{ kind:'topic',topic:'/route' } };
    const props = setup([path]);
    fireEvent.click(screen.getByRole('button',{ name:'Add track for /route' }));
    fireEvent.click(screen.getByRole('menuitem',{ name:'Add as Predictions' }));
    expect(props.onAdd).toHaveBeenCalledWith({ objectId:'path',layer:'predictions' });
  });
  it('shows applied world, ground and fence facts without adding tracks',() => {
    const world:VideoSourceObject = { id:'world',kind:'world',label:'World world',labelSource:'recorded-fact',fact:{ availability:'applied',sourceId:'world-boundary',sequence:1 } };
    const ground:VideoSourceObject = { id:'ground',kind:'ground',label:'Ground',labelSource:'recorded-fact',parentId:'world',fact:{ availability:'applied',sourceId:'world-boundary',sequence:1 } };
    const fence:VideoSourceObject = { id:'fence',kind:'fence',label:'Control fence',labelSource:'recorded-fact',parentId:'world',fact:{ availability:'applied',sourceId:'world-boundary',sequence:1 } };
    setup([world,ground,fence]);
    expect(screen.getByText('World world · Applied')).toBeInTheDocument();
    expect(screen.getByText('Ground · Applied')).toBeInTheDocument();
    expect(screen.getByText('Control fence · Applied')).toBeInTheDocument();
    expect(document.querySelector('[data-xgc-role="video-source-world"]')).not.toBeNull();
  });
});

it('does not present a current bundle as the saved model version or upgrade it before explicit selection',() => {
  const saved = { ...newVideoTrackDraft('robot-model',{ modelId:model.modelId,bundleSha256:'b'.repeat(64),frameId:'r0/base_link',durationNs:10_000_000_000n }),label:'Saved',enabled:false };
  const editing = { tracks:[saved],clockMappings:[] },onChange = vi.fn();
  render(<VideoTrackInspector id="video" editing={editing} selectedTrackId={saved.id} issues={[]} models={[model]} canToggle
    onChange={onChange} onSelectTrack={vi.fn()} />);
  expect(screen.getByLabelText('Controlled model',{ selector:'button' })).toHaveTextContent('Saved model unavailable');
  expect(onChange).not.toHaveBeenCalled();
  selectControlOption('Controlled model','Controlled Scout');
  expect(onChange).toHaveBeenCalledWith({ ...editing,tracks:[{ ...saved,bundleSha256:model.bundleSha256 }] });
});
