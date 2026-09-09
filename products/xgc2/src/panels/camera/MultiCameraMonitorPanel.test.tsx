// @vitest-environment jsdom

import { render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { MediaEdgeSessionHandle } from '../../domains/execution/executionPublic';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import { multiCameraMonitorPanelPlugin } from './manifest';
import { MultiCameraMonitorPanel } from './MultiCameraMonitorPanel';

const mediaMocks = vi.hoisted(() => ({
  createSession:vi.fn(),
}));

vi.mock('../../domains/execution/executionPublic', async (importOriginal) => {
  const original = await importOriginal() as Record<string,unknown>;
  return { ...original,createMediaEdgeSession:mediaMocks.createSession };
});

describe('MultiCameraMonitorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mediaMocks.createSession.mockImplementation(async ({ sourceId }: { sourceId:string }) =>
      sessionHandle(sourceId));
  });

  it('opens one independent direct WebRTC session per enabled source in configured order', async () => {
    const view = render(<MultiCameraMonitorPanel
      panel={panel()}
      context={{ ports:{ actions:{},data:{},authoring:{},interactions:{} } }}
    />);

    expect(view.container.querySelectorAll('[data-xgc-role="multi-camera-monitor-tile"]'))
      .toHaveLength(2);
    expect(screen.getByText('Hangar')).toBeInTheDocument();
    expect(screen.getByText('UAV 1')).toBeInTheDocument();
    expect(screen.queryByText('Disabled')).toBeNull();
    await waitFor(() => expect(mediaMocks.createSession).toHaveBeenCalledTimes(2));
    expect(mediaMocks.createSession.mock.calls.map(([input]) => ({
      edgeUrl:input.edgeUrl,sourceId:input.sourceId,
    }))).toEqual([
      { edgeUrl:'http://192.0.2.10:18090',sourceId:'front' },
      { edgeUrl:'http://192.0.2.11:18091',sourceId:'camera.main' },
    ]);
  });

  it('is a visualization-only panel that uses the shared frame config drawer', () => {
    expect(multiCameraMonitorPanelPlugin.capabilities).toEqual(['visualization']);
    expect(multiCameraMonitorPanelPlugin.backendCapabilities).toBeUndefined();
    expect(multiCameraMonitorPanelPlugin.permissions).toBeUndefined();
    expect(multiCameraMonitorPanelPlugin.optionsEditor).toBeTruthy();
  });
});

function panel(): PanelInstance {
  return {
    id:'multi-camera',
    pluginId:'multi-camera-monitor',
    title:'Multi-camera monitor',
    gridPos:{ x:0,y:0,w:12,h:8 },
    query:{},
    options:{
      streamsJson:JSON.stringify([
        { id:'hangar',name:'Hangar',edgeUrl:'http://192.0.2.10:18090',sourceId:'front',enabled:true },
        { id:'uav-1',name:'UAV 1',edgeUrl:'http://192.0.2.11:18091',sourceId:'camera.main',enabled:true },
        { id:'off',name:'Disabled',edgeUrl:'http://192.0.2.12:18092',sourceId:'rear',enabled:false },
      ]),
      layoutColumns:'2',tileAspectRatio:'16:9',imageFit:'cover',
      reconnectPolicy:'manual',showMetadata:true,
    },
    fieldConfig:{},
    portBindings:[],
  };
}

function sessionHandle(sourceId:string): MediaEdgeSessionHandle {
  return {
    answer:{
      sessionId:`${sourceId.padEnd(32,'0').slice(0,32)}`,
      sdp:'v=0',
      dataChannelLabel:'xgc-media-control.v1',
      source:{ id:sourceId,width:1920,height:1080,fps:30,frameId:'camera',codec:'H264' },
    },
    close:vi.fn().mockResolvedValue(undefined),
  };
}
