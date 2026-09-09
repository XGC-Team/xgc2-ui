// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import { downloadROSBagRecording,listROSBagRecordings,type ROSBagRecording,type ROSBagRecordingPage } from '../../domains/recording/recordingPublic';
import type { PanelActionPortRuntime,PanelPluginContext } from '../types';
import { RecordingControlPanel } from './RecordingControlPanel';

vi.mock('../../domains/recording/recordingPublic',() => ({
  listROSBagRecordings: vi.fn(),
  downloadROSBagRecording: vi.fn(),
}));

describe('RecordingControlPanel ports',() => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listROSBagRecordings).mockResolvedValue(archivePage([]));
  });

  it('keeps the unavailable action discoverable without rendering connection plumbing or fetching unrelated bags',() => {
    render(<RecordingControlPanel panel={panel()} context={context()} />);
    expect(screen.getByRole('button',{ name:'Recording' })).toBeDisabled();
    expect(screen.getByRole('button',{ name:'Recording' })).toHaveAttribute('title');
    expect(screen.queryByText(/Data port|Action preset|Projection/)).toBeNull();
    expect(listROSBagRecordings).not.toHaveBeenCalled();
  });

  it('invokes the exact Recording Action and browses bags using the actual experiment projection',async () => {
    const recording = actionPort();
    vi.mocked(listROSBagRecordings).mockResolvedValue(archivePage([bag('bag-1','flight.mcap')]));
    render(<RecordingControlPanel panel={panel()} context={context(recording,{ experimentResourceId: 'experiment-1' })} />);
    fireEvent.click(screen.getByRole('button',{ name:'Recording' }));
    await waitFor(() => expect(recording.invoke).toHaveBeenCalledWith(
      {},'Invoke Recording from its panel port',
    ));
    expect(await screen.findByText('flight.mcap')).toBeInTheDocument();
    expect(listROSBagRecordings).toHaveBeenCalledWith({ experimentId: 'experiment-1',offset: 0 },expect.any(AbortSignal));
    expect(screen.getByRole('button',{ name:'Download recorded bag flight.mcap' })).toBeEnabled();
    expect(document.querySelector('[data-xgc-role="recording-artifact-projection"]')).not.toHaveTextContent('experiment-1');
    expect(document.querySelector('[data-xgc-role="recording-artifact-projection"]')).not.toHaveTextContent('bag-1');
  });

  it('stops only the active Recording Action invocation',async () => {
    const recording = actionPort({ id:'run-recorder',status:'running',revision:2 });
    render(<RecordingControlPanel panel={panel()} context={context(recording)} />);
    fireEvent.click(screen.getByRole('button',{ name:'Stop Recording' }));
    await waitFor(() => expect(recording.control).toHaveBeenCalledWith(
      recording.activeInvocation,'stop','Stop Recording from its panel port',
    ));
    expect(screen.getByRole('button',{ name:'Stop Recording' })).toHaveAttribute('aria-description','Recording: running');
  });

  it('continues an explicit archive page without duplicating existing bags',async () => {
    vi.mocked(listROSBagRecordings)
      .mockResolvedValueOnce({ ...archivePage([bag('first','first.mcap')]),truncated: true,nextOffset: 1,total: 2 })
      .mockResolvedValueOnce({ ...archivePage([bag('first','first.mcap'),bag('older','older.mcap')]),offset: 1 });
    render(<RecordingControlPanel panel={panel()} context={context(undefined,{ experimentResourceId: 'experiment-1' })} />);
    fireEvent.click(await screen.findByRole('button',{ name:'Load older' }));
    expect(await screen.findByText('older.mcap')).toBeInTheDocument();
    expect(screen.getAllByText('first.mcap')).toHaveLength(1);
    expect(listROSBagRecordings).toHaveBeenLastCalledWith({ experimentId: 'experiment-1',offset: 1 },expect.any(AbortSignal));
    expect(screen.queryByRole('button',{ name:'Load older' })).toBeNull();
  });

  it('aborts a stale experiment read and never shows its bags on the next experiment',async () => {
    let finishFirst!: (value: ROSBagRecordingPage) => void;
    vi.mocked(listROSBagRecordings)
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
      .mockResolvedValueOnce(archivePage([bag('new','new-experiment.mcap')]));
    const view = render(<RecordingControlPanel panel={panel()} context={context(undefined,{ experimentResourceId: 'first' })} />);
    const signal = vi.mocked(listROSBagRecordings).mock.calls[0][1]!;
    view.rerender(<RecordingControlPanel panel={panel()} context={context(undefined,{ experimentResourceId: 'next' })} />);
    expect(signal.aborted).toBe(true);
    expect(await screen.findByText('new-experiment.mcap')).toBeInTheDocument();
    await act(async () => finishFirst(archivePage([bag('old','old-experiment.mcap')])));
    expect(screen.queryByText('old-experiment.mcap')).toBeNull();
  });

  it('downloads the chosen archive artifact through the authenticated blob request',async () => {
    const content = new Blob(['recorded data']);
    vi.mocked(downloadROSBagRecording).mockResolvedValue(content);
    vi.mocked(listROSBagRecordings).mockResolvedValue(archivePage([bag('bag /1','flight.mcap')]));
    const createURL = vi.fn(() => 'blob:recording-download');
    const revokeURL = vi.fn();
    vi.stubGlobal('URL',class extends URL {
      static createObjectURL = createURL;
      static revokeObjectURL = revokeURL;
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(() => undefined);
    try {
      render(<RecordingControlPanel panel={panel()} context={context(undefined,{ experimentResourceId: 'experiment-1' })} />);
      fireEvent.click(await screen.findByRole('button',{ name:'Download recorded bag flight.mcap' }));
      await waitFor(() => expect(click).toHaveBeenCalledOnce());
      expect(downloadROSBagRecording).toHaveBeenCalledWith('bag /1',expect.any(AbortSignal));
      expect(createURL).toHaveBeenCalledWith(content);
      expect(click.mock.instances[0]).toHaveAttribute('download','flight.mcap');
      expect(revokeURL).toHaveBeenCalledWith('blob:recording-download');
    } finally {
      click.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('preserves a real archive failure and refresh affordance',async () => {
    vi.mocked(listROSBagRecordings).mockRejectedValueOnce(new Error('Archive disconnected'));
    render(<RecordingControlPanel panel={panel()} context={context(undefined,{ experimentResourceId: 'experiment-1' })} />);
    expect(await screen.findByText('Archive disconnected')).toBeInTheDocument();
    expect(screen.getByRole('button',{ name:'Refresh recorded bags' })).toBeEnabled();
    expect(screen.queryByText('No recorded bags')).toBeNull();
  });
});

function bag(id: string,name: string): ROSBagRecording {
  return { id,name,path: `/archive/${name}`,size: 4096,createdAt: '2026-09-06T10:00:00Z' };
}

function archivePage(items: ROSBagRecording[]): ROSBagRecordingPage {
  return { items,limit: 100,offset: 0,total: items.length,truncated: false };
}

function panel():PanelInstance {
  return { id:'recording',pluginId:'recording-control',title:'Recording',gridPos:{ x:0,y:0,w:6,h:6 },query:{},options:{},fieldConfig:{},portBindings:[] };
}

function actionPort(activeInvocation?:PanelActionPortRuntime['activeInvocation']):PanelActionPortRuntime {
  return { id:'rosbag-recording',label:'Recording',connected:true,disabledReason:'',
    action:{ id:'record',label:'Record',kind:'service',controls:['stop'] },defaults:{},activeInvocation,
    invoke:vi.fn(async () => ({ id:'run-recorder',status:'running' as const,revision:1 })),control:vi.fn(),trace:{} };
}

function context(recording?:PanelActionPortRuntime,artifacts?:unknown):PanelPluginContext {
  return { ports:{ actions:recording ? { 'rosbag-recording':recording } : {},
    data:artifacts === undefined ? {} : { 'recording-artifacts':{
      id:'recording-artifacts',label:'Artifacts',contract:'recording.artifacts.v1',connected:true,value:artifacts,trace:{},
    } },authoring:{},interactions:{} } };
}
