// @vitest-environment jsdom

import { act,render,screen } from '@testing-library/react';
import { describe,it,expect,vi,beforeEach } from 'vitest';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import { LichtblickPanelFrameProvider,LichtblickPanelFrameBinding,LichtblickSceneHostBinding } from './LichtblickPanelFrame';
import { LICHTBLICK_EMBED_CHANNEL,LICHTBLICK_EMBED_VERSION } from './lichtblickEmbedBridge';
import * as sceneBridge from './lichtblickSceneBridge';
import type { LichtblickSceneHost,LichtblickSceneResult } from './lichtblickSceneBridge';

const panel={ id:'viewer',title:'Viewer',options:{} } as PanelInstance;
const host:LichtblickSceneHost={ panelId:'viewer',namespace:'/xgc/scene',targetId:'local',editable:true,action:{ id:'scene-command',label:'Edit scene',connected:true,disabledReason:'',defaults:{ sceneNamespace:'/xgc/scene' },trace:{ actionId:'scene-command',automationResourceId:'workflow',presetId:'scene' },invoke:vi.fn(),control:vi.fn() } };
function Viewer({ binding=host }:{binding?:LichtblickSceneHost}) {
  return <LichtblickPanelFrameProvider panel={panel}>
    <LichtblickSceneHostBinding panelId={panel.id} host={binding} />
    <LichtblickPanelFrameBinding panelId={panel.id}>{(_view,bridge) => <iframe title="Scene viewer" ref={bridge.iframeRef} src="/viewer" />}</LichtblickPanelFrameBinding>
  </LichtblickPanelFrameProvider>;
}
function incoming(frame:HTMLIFrameElement,data:unknown,overrides:Partial<MessageEventInit>={}) {
  window.dispatchEvent(new MessageEvent('message',{ source:frame.contentWindow,origin:window.location.origin,data,...overrides }));
}
const header={ channel:LICHTBLICK_EMBED_CHANNEL,version:LICHTBLICK_EMBED_VERSION,sender:'lichtblick' };
const edit={ ...header,type:'scene-command',requestId:'edit-1',command:{ requestId:'edit-1',operation:'delete',id:'box',expectedEpoch:'scene',expectedRevision:1 } };

describe('scene iframe authority',() => {
  beforeEach(() => vi.restoreAllMocks());
  it('announces exact binding on ready and invokes only authenticated frame edits',async () => {
    const run=vi.spyOn(sceneBridge,'runLichtblickSceneCommand').mockResolvedValue({ success:true,epoch:'scene',revision:2 });
    render(<Viewer />);const frame=screen.getByTitle('Scene viewer') as HTMLIFrameElement;
    const post=vi.spyOn(frame.contentWindow!,'postMessage');
    act(() => incoming(frame,{ ...header,type:'ready',capabilities:[],visibleSurfaces:[] }));
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type:'scene-binding',binding:{ namespace:'/xgc/scene',editable:true } }),window.location.origin);
    await act(async () => { incoming(frame,edit,{ source:null });incoming(frame,edit,{ origin:'https://elsewhere.invalid' }); });
    expect(run).not.toHaveBeenCalled();
    await act(async () => incoming(frame,edit));
    expect(run).toHaveBeenCalledExactlyOnceWith(host,edit.command,expect.any(AbortSignal));
    expect(post).toHaveBeenLastCalledWith(expect.objectContaining({ type:'scene-command-result',requestId:'edit-1',result:{ success:true,epoch:'scene',revision:2 } }),window.location.origin);
  });
  it('reports malformed edits without invoking an Action',async () => {
    const run=vi.spyOn(sceneBridge,'runLichtblickSceneCommand');
    render(<Viewer />);const frame=screen.getByTitle('Scene viewer') as HTMLIFrameElement;
    const post=vi.spyOn(frame.contentWindow!,'postMessage');
    await act(async () => incoming(frame,{ ...edit,command:{ ...edit.command,operation:'ros-service-call' } }));
    expect(run).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ requestId:'edit-1',result:expect.objectContaining({ success:false,error:expect.stringContaining('Invalid scene edit') }) }),window.location.origin);
  });
  it('deduplicates retransmissions while waiting for the actual terminal result',async () => {
    let complete!:(result:LichtblickSceneResult) => void;
    const run=vi.spyOn(sceneBridge,'runLichtblickSceneCommand').mockReturnValue(new Promise((resolve) => { complete=resolve; }));
    render(<Viewer />);const frame=screen.getByTitle('Scene viewer') as HTMLIFrameElement;
    const post=vi.spyOn(frame.contentWindow!,'postMessage');
    await act(async () => { incoming(frame,edit);incoming(frame,edit); });
    expect(run).toHaveBeenCalledTimes(1);expect(post).not.toHaveBeenCalled();
    await act(async () => complete({ success:false,error:'Gazebo rejected the collision update' }));
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ result:{ success:false,error:'Gazebo rejected the collision update' } }),window.location.origin);
  });
  it('locks mutating edits once the runtime reports a frozen scene',async () => {
    const run=vi.spyOn(sceneBridge,'runLichtblickSceneCommand').mockResolvedValue({ success:true,frozen:true });
    render(<Viewer />);const frame=screen.getByTitle('Scene viewer') as HTMLIFrameElement;
    const post=vi.spyOn(frame.contentWindow!,'postMessage');
    const get={ ...header,type:'scene-command',requestId:'get-1',command:{ requestId:'get-1',operation:'get' } };
    await act(async () => incoming(frame,get));
    expect(run).toHaveBeenCalledTimes(1);
    await act(async () => incoming(frame,edit));
    expect(run).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenLastCalledWith(expect.objectContaining({
      requestId:'edit-1',
      result:expect.objectContaining({ success:false,error:'Scene geometry is read-only for this Run: it comes from a native Gazebo world or has no Experiment copy to edit.' }),
    }),window.location.origin);
    // Reads and playback controls stay live on a frozen scene.
    await act(async () => incoming(frame,{ ...get,requestId:'get-2',command:{ requestId:'get-2',operation:'get' } }));
    expect(run).toHaveBeenCalledTimes(2);
  });
  it('revokes writes and suppresses an old result when the live runtime stops',async () => {
    let complete!:(result:LichtblickSceneResult) => void;
    const run=vi.spyOn(sceneBridge,'runLichtblickSceneCommand').mockReturnValue(new Promise((resolve) => { complete=resolve; }));
    const view=render(<Viewer />);const frame=screen.getByTitle('Scene viewer') as HTMLIFrameElement;
    const post=vi.spyOn(frame.contentWindow!,'postMessage');
    await act(async () => incoming(frame,edit));
    const signal=run.mock.calls[0]![2];
    view.rerender(<Viewer binding={{ ...host,editable:false }} />);
    expect(signal.aborted).toBe(true);
    expect(post).toHaveBeenLastCalledWith(expect.objectContaining({ type:'scene-binding',binding:{ namespace:'/xgc/scene',editable:false } }),window.location.origin);
    post.mockClear();
    await act(async () => complete({ success:true }));expect(post).not.toHaveBeenCalled();
    await act(async () => incoming(frame,{ ...edit,requestId:'new',command:{ ...edit.command,requestId:'new' } }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenLastCalledWith(expect.objectContaining({ result:expect.objectContaining({ success:false }) }),window.location.origin);
  });
});
