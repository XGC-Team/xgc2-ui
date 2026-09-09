// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import type { PanelActionPortRuntime,PanelPluginContext } from '../types';
import { CameraVideoFrameProvider,CameraVideoHeaderActions } from './CameraVideoPanelFrame';
import { ManagedCameraVideoPanel } from './ManagedCameraVideoPanel';

vi.mock('./CameraVideoPanel',() => ({ CameraVideoPanel:({ panel }:{ panel:PanelInstance }) => <div data-testid="camera-stream">{panel.title}</div> }));

describe('ManagedCameraVideoPanel Action port',() => {
  it('renders authored streams and keeps only the recoverable media restart domain Action',async () => {
    const panel = panelFixture();
    const media = actionPort({ id:'run-media',status:'running',revision:1 });
    render(<CameraVideoFrameProvider panel={panel}>
      <CameraVideoHeaderActions panel={panel} editing={false} />
      <ManagedCameraVideoPanel panel={panel} context={context(media)} />
    </CameraVideoFrameProvider>);
    expect(screen.getAllByTestId('camera-stream')).toHaveLength(2);
    expect(screen.queryByRole('button',{ name:'Start camera media workflow' })).toBeNull();
    expect(screen.queryByRole('button',{ name:'Stop camera media workflow' })).toBeNull();
    fireEvent.click(screen.getByRole('button',{ name:'Restart camera media workflow' }));
    await waitFor(() => expect(media.control).toHaveBeenCalledWith(
      media.activeInvocation,'restart','Restart Media service from camera panel',
    ));
  });

  it('does not invent a second media lifecycle control when its Action port is disconnected',() => {
    const panel = panelFixture();
    render(<CameraVideoFrameProvider panel={panel}>
      <CameraVideoHeaderActions panel={panel} editing={false} />
      <ManagedCameraVideoPanel panel={panel} context={context()} />
    </CameraVideoFrameProvider>);
    expect(screen.queryByRole('button',{ name:'Start camera media workflow' })).toBeNull();
    expect(screen.queryByRole('button',{ name:'Stop camera media workflow' })).toBeNull();
    expect(screen.queryByRole('button',{ name:'Restart camera media workflow' })).toBeNull();
  });
});

function panelFixture():PanelInstance {
  return { id:'camera',pluginId:'camera-video',title:'Camera',gridPos:{ x:0,y:0,w:10,h:6 },query:{},options:{
    mediaBindingId:'b2-onboard-media',autoConnect:false,autoConnectOnExperimentRun:false,
    streamsJson:JSON.stringify([
      { id:'front',name:'Front',edgeUrl:'https://front.example.test',sourceId:'front',enabled:true },
      { id:'rear',name:'Rear',edgeUrl:'https://rear.example.test',sourceId:'rear',enabled:true },
    ]),layoutColumns:'2',tileAspectRatio:'16:9',
  },fieldConfig:{},portBindings:[] };
}
function actionPort(activeInvocation?:PanelActionPortRuntime['activeInvocation']):PanelActionPortRuntime {
  return { id:'b2-onboard-media',label:'Media service',connected:true,disabledReason:'',
    action:{ id:'serve',label:'Serve',kind:'service',controls:['stop','restart'] },defaults:{},activeInvocation,
    invoke:vi.fn(async () => ({ id:'run-media',status:'running' as const,revision:1 })),control:vi.fn(),trace:{} };
}
function context(media?:PanelActionPortRuntime):PanelPluginContext {
  return { ports:{ actions:media ? { 'b2-onboard-media':media } : {},data:{},authoring:{},interactions:{} } };
}
