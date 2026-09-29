// @vitest-environment jsdom
import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { ExperimentSceneDrawer } from './ExperimentSceneDrawer';
import type { SceneReplayAsset } from '../experimentService';

const listScenes = vi.hoisted(() => vi.fn());
vi.mock('../experimentService',() => ({ listScenes }));
const assets: SceneReplayAsset[] = [
  { name:'workshop',path:'',relativePath:'',kind:'still',createdAt:'',simulators:{ gazebo:{ geometry:'document' },lightweight:{ geometry:'document',note:'Box geometry only.' } } },
  { name:'native-world',path:'',relativePath:'',kind:'obstacle',createdAt:'',simulators:{ gazebo:{ geometry:'native' } } },
];

describe('Experiment scene selection',() => {
  beforeEach(() => { listScenes.mockReset();listScenes.mockResolvedValue(assets); });

  it('only saves an explicit change and preserves authored backend parameters',async () => {
    const onSave = vi.fn(async () => {});
    const onClose = vi.fn();
    render(<ExperimentSceneDrawer visible headCommitId="commit-1" value={{ asset:'workshop',simulator:'gazebo',parameters:{ gravity:[0,0,-9.81] } }} onSave={onSave} onClose={onClose} />);
    await screen.findByRole('switch',{ name:'Custom physics timing' });
    expect(screen.getByRole('button',{ name:'Save' })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('switch',{ name:'Custom physics timing' }));
    fireEvent.change(screen.getByRole('spinbutton',{ name:'Integration step' }),{ target:{ value:'0.002' } });
    fireEvent.click(screen.getByRole('button',{ name:'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ asset:'workshop',simulator:'gazebo',parameters:{
      gravity:[0,0,-9.81],overrideWorldPhysicsTiming:true,maxStepSize:0.002,realTimeUpdateRate:250,
    } },'commit-1'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('allows a fixed photograph with lightweight geometry and offers only the declared simulators',async () => {
    render(<ExperimentSceneDrawer visible headCommitId="commit-1" value={{ asset:'workshop',simulator:'lightweight' }} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText('Box geometry only.')).toBeVisible();
    expect(screen.getByRole('img',{ name:'Recorded camera frame' })).toHaveAttribute('src','/api/scenes/workshop/media');
    expect(screen.queryByRole('switch',{ name:'Custom physics timing' })).toBeNull();
    fireEvent.click(screen.getByRole('button',{ name:'Scene' }));
    fireEvent.click(await screen.findByRole('option',{ name:'native-world' }));
    expect(screen.getByRole('button',{ name:'Save' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{ name:'Simulator' }));
    expect(await screen.findByRole('option',{ name:'Gazebo' })).toBeVisible();
    expect(screen.queryByRole('option',{ name:'Lightweight simulator' })).toBeNull();
  });

  it('keeps failures visible and does not close after a rejected save',async () => {
    const onClose = vi.fn();
    render(<ExperimentSceneDrawer visible headCommitId="commit-1" value={{ asset:'workshop',simulator:'gazebo' }}
      onSave={vi.fn(async () => { throw new Error('Save rejected'); })} onClose={onClose} />);
    fireEvent.click(await screen.findByRole('switch',{ name:'Custom physics timing' }));
    fireEvent.click(screen.getByRole('button',{ name:'Save' }));
    expect(await screen.findByText('Save rejected')).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not fetch when parked and cancels the catalog request on close',async () => {
    const props = { headCommitId:'commit-1',onSave:vi.fn(),onClose:vi.fn() };
    const { rerender,unmount } = render(<ExperimentSceneDrawer {...props} visible={false} />);
    expect(listScenes).not.toHaveBeenCalled();
    await act(async () => rerender(<ExperimentSceneDrawer {...props} visible />));
    expect(listScenes).toHaveBeenCalledOnce();
    const signal = listScenes.mock.calls[0]![0] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it('does not infer simulator support for an unmigrated scene',async () => {
    listScenes.mockResolvedValue([{ ...assets[0],simulators:undefined }]);
    render(<ExperimentSceneDrawer visible headCommitId="commit-1" value={{ asset:'workshop',simulator:'gazebo' }} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText('This scene has no simulator representation yet.')).toBeVisible();
    expect(screen.getByRole('button',{ name:'Save' })).toBeDisabled();
  });
});
