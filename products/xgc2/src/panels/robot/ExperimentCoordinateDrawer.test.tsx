// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import * as ExperimentPublic from '../../domains/experiment/experimentPublic';
import type { ExperimentRobotBinding } from '../../domains/experiment/experimentPublic';
import { ExperimentCoordinateDrawer } from './ExperimentCoordinateDrawer';

vi.mock('../../domains/experiment/experimentPublic',async (importOriginal) => ({
  ...await importOriginal<typeof ExperimentPublic>(),
  loadExperimentCoordinateSamples:vi.fn(),
}));

const loadSamples = vi.mocked(ExperimentPublic.loadExperimentCoordinateSamples);
type ExperimentCoordinateSamples = Awaited<ReturnType<typeof loadSamples>>;
const bindings = [binding('one',1.25),binding('two',0.181)];

describe('ExperimentCoordinateDrawer',() => {
  beforeEach(() => {
    loadSamples.mockReset();
    loadSamples.mockResolvedValue(samples());
  });

  it('keeps the world origin inputs when a running session has no physical localization',async () => {
    const sim = samples();
    sim.samples.forEach((sample) => { sample.physical = false; delete sample.rawPosition; });
    loadSamples.mockResolvedValueOnce(sim);
    renderDrawer({ runMode:'simulation' });
    await waitFor(() => expect(loadSamples).toHaveBeenCalled());
    expect(axis('origin:x')).toBeVisible();
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-robot"]')).toBeNull();
    expect(screen.queryByText('No valid localization')).toBeNull();
    expect(screen.queryByText('No tracked Robots')).toBeNull();
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-source"]')).toBeNull();
  });

  it.each(['origin','starting-poses'] as const)('puts %s save in the drawer header without a reserved receipt',(view) => {
    renderDrawer({ view,runId:undefined });
    const save = control('experiment-coordinate-save',view);
    expect(save.closest('.xgc-drawer-header')).not.toBeNull();
    expect(save).toHaveTextContent('Save for next start');
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-save-receipt"]')).toBeNull();
    expect(control('experiment-coordinate-drawer',view)).not.toHaveAttribute('data-xgc-footer');
    expect(document.querySelector('.xgc-drawer-footer')).toBeNull();
  });

  it('defines a VRPN origin without runtime and persists the negative position as offset',async () => {
    const { onSaveOrigin } = renderDrawer({ runId:undefined,offset:{ x:-2,y:3,z:-4 } });
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-source"]')).toBeNull();
    expect(axis('origin:x')).toHaveValue(2);
    expect(axis('origin:y')).toHaveValue(-3);
    expect(axis('origin:z')).toHaveValue(4);
    changeAxis('origin:x','8');
    changeAxis('origin:y','-6');
    changeAxis('origin:z','1.5');
    fireEvent.click(control('experiment-coordinate-save','origin'));
    await waitFor(() => expect(onSaveOrigin).toHaveBeenCalledWith({ x:-8,y:6,z:-1.5 }));
    expect(loadSamples).not.toHaveBeenCalled();
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-save-receipt"]')).toBeNull();
  });

  it('fills the always-visible origin from one robot and saves the edited numbers',async () => {
    const { onSaveOrigin } = renderDrawer({ offset:{ x:0,y:0,z:-5 } });
    expect(axis('origin:x')).toBeVisible();
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-source"]')).toBeNull();
    await waitFor(() => expect(control('experiment-coordinate-robot','one')).toBeVisible());
    fireEvent.click(control('experiment-coordinate-robot','one'));
    expect(axis('origin:x')).toHaveValue(2);
    expect(axis('origin:y')).toHaveValue(4);
    expect(axis('origin:z')).toHaveValue(1);
    expect(control('experiment-coordinate-robot','one')).toHaveAttribute('aria-pressed','true');
    fireEvent.click(control('experiment-coordinate-robot','two'));
    expect(control('experiment-coordinate-robot','one')).toHaveAttribute('aria-pressed','false');
    expect(axis('origin:x')).toHaveValue(6);
    expect(axis('origin:y')).toHaveValue(8);
    expect(axis('origin:z')).toHaveValue(3);
    changeAxis('origin:z','7');
    fireEvent.click(control('experiment-coordinate-save','origin'));
    await waitFor(() => expect(onSaveOrigin).toHaveBeenCalledWith({ x:-6,y:-8,z:-7 }));
    expect(loadSamples).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-preview"]')).toBeNull();
  });

  it('fills the selected robot from the loaded sample and saves the edited numbers',async () => {
    const sim = samples();
    sim.samples.forEach((sample) => { sample.physical = false;delete sample.rawPosition; });
    sim.samples[1]!.pose = { x:41,y:-3,z:99,yaw:1.2 };
    loadSamples.mockResolvedValueOnce(sim);
    const { onSavePoses,onSaveOrigin } = renderDrawer({ view:'starting-poses' });
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-source-switcher"]')).toBeNull();
    expect(axis('one:x')).toBeVisible();
    expect(axis('one:x')).toHaveValue(0);
    await waitFor(() => {
      fireEvent.click(control('experiment-coordinate-manual-robot','two'));
      expect(axis('two:x')).toHaveValue(41);
    });
    expect(control('experiment-coordinate-manual-robot','two')).toHaveAttribute('aria-pressed','true');
    expect(control('experiment-coordinate-manual-robot','one')).toHaveAttribute('aria-pressed','false');
    expect(control('experiment-coordinate-selected-robot','two')).toHaveTextContent('two');
    expect(control('experiment-coordinate-manual-robot','two').querySelector('.experiment-coordinate-choice svg')).not.toBeNull();
    expect(control('experiment-coordinate-manual-robot','one').querySelector('.experiment-coordinate-choice svg')).toBeNull();
    expect(axis('two:x')).toHaveValue(41);
    expect(axis('two:y')).toHaveValue(-3);
    expect(axis('two:z').value).toBe('0.18');
    expect(inputControl('experiment-coordinate-yaw','two')).toHaveValue(1.2);
    changeAxis('two:y','7');
    fireEvent.click(control('experiment-coordinate-save','starting-poses'));
    await waitFor(() => expect(onSavePoses).toHaveBeenCalledTimes(1));
    const saved = onSavePoses.mock.calls[0]![0];
    expect(saved[0]).toEqual(bindings[0]);
    expect(saved[1]!.initialPose).toEqual({ x:41,y:7,z:0.181,yaw:1.2 });
    expect(onSaveOrigin).not.toHaveBeenCalled();
    expect(loadSamples).toHaveBeenCalledTimes(1);
  });

  it('places the capture identity on the action that requests fresh poses',async () => {
    renderDrawer({ view:'starting-poses' });
    expect(control('experiment-coordinate-manual-robot','one')).toBeVisible();
    await waitFor(() => expect(loadSamples).toHaveBeenCalledTimes(1));
    const capture = control('experiment-robot-assets-fill-current-pose','experiment');
    expect(capture).toHaveRole('button');
    expect(capture).toHaveAccessibleName('Refresh positions');
    fireEvent.click(capture);
    await waitFor(() => expect(loadSamples).toHaveBeenCalledTimes(2));
  });

  it('clears dirty after saving selected live starting poses',async () => {
    const { onSavePoses } = renderDrawer({ view:'starting-poses',runMode:'simulation' });
    await waitFor(() => {
      fireEvent.click(control('experiment-coordinate-manual-robot','one'));
      expect(axis('one:x')).toHaveValue(2);
    });
    expect(axis('one:y')).toHaveValue(4);
    expect(axis('one:z')).toHaveValue(1.25);
    expect(control('experiment-coordinate-drawer','starting-poses')).toHaveAttribute('data-xgc-dirty','true');
    fireEvent.click(control('experiment-coordinate-save','starting-poses'));
    await waitFor(() => expect(onSavePoses).toHaveBeenCalledTimes(1));
    expect(control('experiment-coordinate-drawer','starting-poses')).not.toHaveAttribute('data-xgc-dirty');
    expect(onSavePoses.mock.calls[0]![0][0]!.initialPose).toEqual({ x:2,y:4,z:1.25,yaw:0.5 });
    expect(loadSamples).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-error"]')).toBeNull();
  });

  it('edits each starting pose manually without a running Experiment',async () => {
    const { onSavePoses } = renderDrawer({ view:'starting-poses',runId:undefined });
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-source-switcher"]')).toBeNull();
    expect(axis('one:x')).toBeVisible();
    changeAxis('one:x','3');
    changeAxis('one:z','2.5');
    fireEvent.change(inputControl('experiment-coordinate-yaw','one'),{ target:{ value:'0.75' } });
    fireEvent.click(control('experiment-coordinate-manual-robot','two'));
    changeAxis('two:y','-7');
    fireEvent.click(control('experiment-coordinate-save','starting-poses'));
    await waitFor(() => expect(onSavePoses).toHaveBeenCalledTimes(1));
    const saved = onSavePoses.mock.calls[0]![0];
    expect(saved[0]!.initialPose).toEqual({ x:3,y:0,z:2.5,yaw:0.75 });
    expect(saved[1]!.initialPose).toEqual({ x:0,y:-7,z:0.181,yaw:0 });
    expect(loadSamples).not.toHaveBeenCalled();
  });

  it('saves the filled origin numbers without confirming the robot again',async () => {
    const gone = samples();
    gone.samples = [];
    loadSamples.mockResolvedValueOnce(samples()).mockResolvedValueOnce(gone);
    const { onSaveOrigin } = renderDrawer();
    await waitFor(() => expect(control('experiment-coordinate-robot','one')).toBeVisible());
    fireEvent.click(control('experiment-coordinate-robot','one'));
    fireEvent.click(control('experiment-coordinate-save','origin'));
    await waitFor(() => expect(onSaveOrigin).toHaveBeenCalledWith({ x:-2,y:-4,z:-1 }));
    expect(loadSamples).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-save-receipt"]')).toBeNull();
  });

  it.each(['unmount','park'] as const)('abandons a pending origin sample load on %s',async (exit) => {
    let finish!:(value:ExperimentCoordinateSamples) => void;
    loadSamples.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const { onSaveOrigin,unmount,setVisible } = renderDrawer();
    expect(axis('origin:x')).toBeVisible();
    const signal = loadSamples.mock.calls[0]![0].signal;
    if (exit === 'unmount') unmount();
    else setVisible(false);
    expect(signal?.aborted).toBe(true);
    await act(async () => finish(samples()));
    expect(onSaveOrigin).not.toHaveBeenCalled();
  });

  it('retains the edited value and shows a commit failure without a saved receipt',async () => {
    const onSaveOrigin = vi.fn<(offset:{ x:number;y:number;z:number }) => Promise<void>>()
      .mockRejectedValue(new Error('The Experiment changed. Reload its current version.'));
    renderDrawer({ runId:undefined,onSaveOrigin });
    changeAxis('origin:x','5');
    fireEvent.click(control('experiment-coordinate-save','origin'));
    await waitFor(() => expect(control('experiment-coordinate-error','origin')).toHaveTextContent('The Experiment changed'));
    expect(axis('origin:x')).toHaveValue(5);
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-save-receipt"]')).toBeNull();
    expect(control('experiment-coordinate-drawer','origin')).toHaveAttribute('data-xgc-dirty','true');
  });

  it('does not insert a success receipt when a subsequent save fails',async () => {
    const onSaveOrigin = vi.fn<(offset:{ x:number;y:number;z:number }) => Promise<void>>()
      .mockResolvedValueOnce().mockRejectedValueOnce(new Error('Save failed after the connection changed.'));
    renderDrawer({ runId:undefined,onSaveOrigin });
    fireEvent.click(control('experiment-coordinate-save','origin'));
    await waitFor(() => expect(onSaveOrigin).toHaveBeenCalledTimes(1));
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-save-receipt"]')).toBeNull();
    fireEvent.click(control('experiment-coordinate-save','origin'));
    await waitFor(() => expect(control('experiment-coordinate-error','origin')).toHaveTextContent('Save failed'));
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-save-receipt"]')).toBeNull();
  });

  it('keeps manual authoring available after sample loading fails',async () => {
    loadSamples.mockRejectedValue(new Error('Runtime unavailable'));
    const { onSaveOrigin } = renderDrawer();
    await waitFor(() => expect(control('experiment-coordinate-error','origin')).toHaveTextContent('Runtime unavailable'));
    expect(axis('origin:x')).toBeVisible();
    changeAxis('origin:x','4');
    fireEvent.click(control('experiment-coordinate-save','origin'));
    await waitFor(() => expect(onSaveOrigin).toHaveBeenCalled());
    expect(loadSamples).toHaveBeenCalledTimes(1);
  });

  it('allows manual saving while an independent pose request is still pending',async () => {
    loadSamples.mockReturnValueOnce(new Promise(() => {}));
    const { onSaveOrigin } = renderDrawer();
    expect(axis('origin:x')).toBeVisible();
    changeAxis('origin:x','4');
    expect(control('experiment-coordinate-save','origin')).toBeEnabled();
    fireEvent.click(control('experiment-coordinate-save','origin'));
    await waitFor(() => expect(onSaveOrigin).toHaveBeenCalled());
  });

  it('clears old samples when the running Session disappears and keeps custom authoring available',async () => {
    const props:ComponentProps<typeof ExperimentCoordinateDrawer> = {
      view:'origin',targetId:'local',runId:'robot-run',runMode:'physical',experimentResourceId:'experiment',
      expectedCommitId:'frozen-commit',expectedDigest:'a'.repeat(64),sessionId:'session',robotRunIds:[],bindings,assets:[],offset:{ x:0,y:0,z:0 },
      onSaveOrigin:vi.fn().mockResolvedValue(undefined),onSavePoses:vi.fn().mockResolvedValue(undefined),onClose:vi.fn(),
    };
    const { rerender } = render(<ExperimentCoordinateDrawer {...props} />);
    await waitFor(() => expect(control('experiment-coordinate-robot','one')).toBeVisible());
    fireEvent.click(control('experiment-coordinate-robot','one'));
    rerender(<ExperimentCoordinateDrawer {...props} runId={undefined} />);
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-robot"]')).toBeNull();
    expect(axis('origin:x')).toHaveValue(2);
    changeAxis('origin:y','3');
    fireEvent.click(control('experiment-coordinate-save','origin'));
    await waitFor(() => expect(props.onSaveOrigin).toHaveBeenCalled());
    expect(loadSamples).toHaveBeenCalledTimes(1);
  });

  it('keeps an unsaved custom coordinate when its Experiment is parked and restored',() => {
    const props:ComponentProps<typeof ExperimentCoordinateDrawer> = {
      view:'origin',targetId:'local',runMode:'physical',experimentResourceId:'experiment',
      expectedCommitId:'frozen-commit',expectedDigest:'a'.repeat(64),sessionId:'session',robotRunIds:[],bindings,assets:[],offset:{ x:0,y:0,z:0 },
      onSaveOrigin:vi.fn().mockResolvedValue(undefined),onSavePoses:vi.fn().mockResolvedValue(undefined),onClose:vi.fn(),
    };
    const { rerender } = render(<ExperimentCoordinateDrawer {...props} />);
    changeAxis('origin:x','12.5');
    rerender(<ExperimentCoordinateDrawer {...props} visible={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<ExperimentCoordinateDrawer {...props} visible />);
    expect(axis('origin:x')).toHaveValue(12.5);
    expect(props.onSaveOrigin).not.toHaveBeenCalled();
  });

  it('locks dismissal and authored controls until the save resolves, then keeps the Edit draft action in the header',async () => {
    let finish!:() => void;
    const onSaveOrigin = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    renderDrawer({ runId:undefined,editing:true,onSaveOrigin });
    changeAxis('origin:y','2');
    fireEvent.click(control('experiment-coordinate-save','origin'));
    await waitFor(() => expect(onSaveOrigin).toHaveBeenCalled());
    expect(control('experiment-coordinate-save','origin')).toBeDisabled();
    expect(control('experiment-coordinate-save','origin')).toHaveTextContent('Use in Edit draft');
    expect(axis('origin:y').closest('[inert]')).not.toBeNull();
    expect(screen.getByRole('button',{ name:'Close drawer' })).toBeDisabled();
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-save-receipt"]')).toBeNull();
    await act(async () => finish());
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-save-receipt"]')).toBeNull();
    expect(control('experiment-coordinate-save','origin')).toBeEnabled();
    expect(control('experiment-coordinate-save','origin').closest('.xgc-drawer-header')).not.toBeNull();
  });

  it('shows manual coordinates with at most two decimal places', () => {
    const robot = binding('scout-01', 0);
    robot.initialPose = { x: 12.345678, y: -0.004, z: 1.23456789, yaw: 0.987654 };
    renderDrawer({ view: 'starting-poses', runId: undefined, bindings: [robot] });
    expect(axis('scout-01:x')).toHaveValue(12.35);
    expect(axis('scout-01:y')).toHaveValue(0);
    expect(axis('scout-01:z')).toHaveValue(1.23);
    expect(inputControl('experiment-coordinate-yaw', 'scout-01')).toHaveValue(0.99);
  });

  it('shows a long world origin with at most two decimal places and keeps an unedited offset', async () => {
    const offset = { x: -12.345678, y: -1.23456789, z: 0.181 };
    const { onSaveOrigin } = renderDrawer({ runId: undefined, offset });
    expect(axis('origin:x').value).toBe('12.35');
    expect(axis('origin:y').value).toBe('1.23');
    expect(axis('origin:z').value).toBe('-0.18');
    fireEvent.click(control('experiment-coordinate-save', 'origin'));
    await waitFor(() => expect(onSaveOrigin).toHaveBeenCalledWith(offset));
    changeAxis('origin:x', '8.129');
    fireEvent.click(control('experiment-coordinate-save', 'origin'));
    await waitFor(() => expect(onSaveOrigin).toHaveBeenCalledTimes(2));
    expect(onSaveOrigin.mock.calls[1]![0]).toEqual({ x: -8.13, y: -1.23456789, z: 0.181 });
  });

  it('blocks incomplete manual coordinates and explicit read-only save refusals',() => {
    const { onSaveOrigin,unmount } = renderDrawer({ runId:undefined });
    changeAxis('origin:x','');
    expect(control('experiment-coordinate-save','origin')).toBeDisabled();
    expect(onSaveOrigin).not.toHaveBeenCalled();
    unmount();
    renderDrawer({ runId:undefined,disabledReason:'This Experiment is read only.' });
    expect(control('experiment-coordinate-save','origin')).toBeDisabled();
    expect(control('experiment-coordinate-save','origin')).toHaveAttribute('title','This Experiment is read only.');
  });
});

function renderDrawer(overrides:Partial<ComponentProps<typeof ExperimentCoordinateDrawer>> = {}) {
  const onSaveOrigin = vi.fn<ComponentProps<typeof ExperimentCoordinateDrawer>['onSaveOrigin']>().mockResolvedValue();
  const onSavePoses = vi.fn<ComponentProps<typeof ExperimentCoordinateDrawer>['onSavePoses']>().mockResolvedValue();
  const tree = (visible = overrides.visible ?? true) => <ExperimentCoordinateDrawer
    view="origin" targetId="local" runId="robot-run" runMode="physical" experimentResourceId="experiment"
    expectedCommitId="frozen-commit" expectedDigest={"a".repeat(64)} sessionId="session" robotRunIds={[]}
    bindings={bindings} assets={[]} offset={{ x:0,y:0,z:0 }}
    onSaveOrigin={onSaveOrigin} onSavePoses={onSavePoses} onClose={() => {}}
    {...overrides} visible={visible}
  />;
  const result = render(tree());
  return { ...result,onSaveOrigin,onSavePoses,setVisible:(visible:boolean) => result.rerender(tree(visible)) };
}

function control(role:string,id:string) {
  const element = document.querySelector<HTMLElement>(`[data-xgc-role="${role}"][data-xgc-id="${id}"]`);
  if (!element) throw new Error(`Missing ${role}/${id}`);
  return element;
}
function axis(id:string) {
  return inputControl('experiment-coordinate-axis',id);
}
function inputControl(role:string,id:string) {
  const host = control(role,id);
  return host.matches('input') ? host as HTMLInputElement : host.querySelector('input')!;
}
function changeAxis(id:string,value:string) { fireEvent.change(axis(id),{ target:{ value } }); }

function binding(id:string,z:number):ExperimentRobotBinding {
  return {
    id,ref:{ domain:'robot',resourceId:`asset-${id}`,branch:'main' },namespace:`/${id}`,
    hybridSource:'physical',runtimeParameters:{},initialPose:{ x:0,y:0,z,yaw:0 },
    scout:{ lidarSimulationEnabled:true,imageSimulationEnabled:false },
  };
}
function samples(capturedAt = Date.now()):ExperimentCoordinateSamples {
  return {
    targetId:'local',runId:'robot-run',experimentResourceId:'experiment',experimentCommitId:'frozen-commit',capturedAt,
    frozenOffset:{ x:100,y:-20,z:5 },
    samples:bindings.map((binding,index) => ({
      bindingId:binding.id,robotAssetId:binding.ref.resourceId,namespace:binding.namespace,name:binding.id,
      pose:{ x:102 + index * 4,y:-16 + index * 4,z:6 + index * 2,yaw:0.5 },
      rawPosition:{ x:2 + index * 4,y:4 + index * 4,z:1 + index * 2 },
      physical:true,observedAt:new Date(capturedAt).toISOString(),
    })),
  };
}
