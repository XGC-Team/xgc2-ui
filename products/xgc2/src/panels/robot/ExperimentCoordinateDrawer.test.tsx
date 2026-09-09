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
    vi.clearAllMocks();
    loadSamples.mockResolvedValue(samples());
  });

  it('defines a VRPN origin without runtime and persists the negative position as offset',async () => {
    const { onSaveOrigin } = renderDrawer({ runId:undefined,offset:{ x:-2,y:3,z:-4 } });
    expect(control('experiment-coordinate-source','custom')).toHaveAttribute('aria-pressed','true');
    expect(axis('origin:x')).toHaveValue(2);
    expect(axis('origin:y')).toHaveValue(-3);
    expect(axis('origin:z')).toHaveValue(4);
    changeAxis('origin:x','8');
    changeAxis('origin:y','-6');
    changeAxis('origin:z','1.5');
    fireEvent.click(control('experiment-coordinate-save','origin'));
    await waitFor(() => expect(onSaveOrigin).toHaveBeenCalledWith({ x:-8,y:6,z:-1.5 }));
    expect(loadSamples).not.toHaveBeenCalled();
    expect(control('experiment-coordinate-save-receipt','origin')).toHaveTextContent('Saved for the next experiment start.');
    fireEvent.click(control('experiment-coordinate-source','sample'));
    expect(control('experiment-coordinate-save-receipt','origin')).not.toHaveTextContent('Saved');
  });

  it('previews a captured multi-Robot centroid and samples again before saving',async () => {
    const now = Date.now();
    const captured = samples(now - 2000);
    captured.samples.forEach((sample) => { sample.expiresAt = now - 1000; });
    const fresh = samples();
    fresh.samples[0]!.rawPosition = { x:10,y:20,z:2 };
    fresh.samples[1]!.rawPosition = { x:14,y:24,z:4 };
    loadSamples.mockResolvedValueOnce(captured).mockResolvedValueOnce(fresh);
    const { onSaveOrigin } = renderDrawer();
    await waitFor(() => expect(control('experiment-coordinate-robot','one')).toBeVisible());
    fireEvent.click(control('experiment-coordinate-robot','one'));
    fireEvent.click(control('experiment-coordinate-robot','two'));
    expect(control('experiment-coordinate-preview','origin')).toHaveTextContent('4.000 · 6.000 · 2.000 m');
    expect(control('experiment-coordinate-save','origin')).toBeEnabled();
    fireEvent.click(control('experiment-coordinate-save','origin'));
    await waitFor(() => expect(onSaveOrigin).toHaveBeenCalledWith({ x:-12,y:-22,z:-3 }));
    expect(loadSamples).toHaveBeenCalledTimes(2);
    expect(loadSamples.mock.calls[1]![0]).toMatchObject({
      targetId:'local',runId:'robot-run',runMode:'physical',experimentResourceId:'experiment',bindings,
    });
    expect(control('experiment-coordinate-preview','origin')).toHaveTextContent('12.000 · 22.000 · 3.000 m');
    fireEvent.click(control('experiment-coordinate-source','custom'));
    expect(axis('origin:x')).toHaveValue(12);
    expect(axis('origin:y')).toHaveValue(22);
    expect(axis('origin:z')).toHaveValue(3);
  });

  it('copies fresh selected simulation XY and heading while preserving all slot heights',async () => {
    const fresh = samples();
    fresh.samples[1]!.pose = { x:41,y:-3,z:99,yaw:1.2 };
    loadSamples.mockResolvedValueOnce(samples()).mockResolvedValueOnce(fresh);
    const { onSavePoses,onSaveOrigin } = renderDrawer({ view:'starting-poses' });
    await waitFor(() => expect(control('experiment-coordinate-robot','two')).toBeVisible());
    fireEvent.click(control('experiment-coordinate-robot','two'));
    fireEvent.click(control('experiment-coordinate-save','starting-poses'));
    await waitFor(() => expect(onSavePoses).toHaveBeenCalledTimes(1));
    const saved = onSavePoses.mock.calls[0]![0];
    expect(saved[0]).toEqual(bindings[0]);
    expect(saved[1]!.initialPose).toEqual({ x:41,y:-3,z:0.181,yaw:1.2 });
    expect(onSaveOrigin).not.toHaveBeenCalled();
    expect(loadSamples).toHaveBeenCalledTimes(2);
    fireEvent.click(control('experiment-coordinate-source','custom'));
    fireEvent.click(control('experiment-coordinate-manual-robot','two'));
    expect(axis('two:x')).toHaveValue(41);
    changeAxis('two:y','7');
    fireEvent.click(control('experiment-coordinate-save','starting-poses'));
    await waitFor(() => expect(onSavePoses).toHaveBeenCalledTimes(2));
    expect(onSavePoses.mock.calls[1]![0][1]!.initialPose).toEqual({ x:41,y:7,z:0.181,yaw:1.2 });
  });

  it('places the capture identity on the action that requests fresh poses',async () => {
    renderDrawer({ view:'starting-poses' });
    await waitFor(() => expect(control('experiment-coordinate-robot','one')).toBeVisible());
    expect(loadSamples).toHaveBeenCalledTimes(1);
    const capture = control('experiment-robot-assets-fill-current-pose','experiment');
    expect(capture).toHaveRole('button');
    expect(capture).toHaveAccessibleName('Refresh positions');
    fireEvent.click(capture);
    await waitFor(() => expect(loadSamples).toHaveBeenCalledTimes(2));
  });

  it('edits each starting pose manually without a running Experiment',async () => {
    const { onSavePoses } = renderDrawer({ view:'starting-poses',runId:undefined });
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

  it('does not save or report success when the selected live position disappears on confirmation',async () => {
    const gone = samples();
    gone.samples = [];
    loadSamples.mockResolvedValueOnce(samples()).mockResolvedValueOnce(gone);
    const { onSaveOrigin } = renderDrawer();
    await waitFor(() => expect(control('experiment-coordinate-robot','one')).toBeVisible());
    fireEvent.click(control('experiment-coordinate-robot','one'));
    fireEvent.click(control('experiment-coordinate-save','origin'));
    await waitFor(() => expect(control('experiment-coordinate-error','origin')).toHaveTextContent('unavailable or expired'));
    expect(onSaveOrigin).not.toHaveBeenCalled();
    expect(control('experiment-coordinate-save-receipt','origin')).not.toHaveTextContent('Saved');
  });

  it.each(['unmount','park'] as const)('abandons a pending confirmation sample on %s',async (exit) => {
    let finish!:(value:ExperimentCoordinateSamples) => void;
    loadSamples.mockResolvedValueOnce(samples()).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const { onSaveOrigin,unmount,setVisible } = renderDrawer();
    await waitFor(() => expect(control('experiment-coordinate-robot','one')).toBeVisible());
    fireEvent.click(control('experiment-coordinate-robot','one'));
    fireEvent.click(control('experiment-coordinate-save','origin'));
    await waitFor(() => expect(loadSamples).toHaveBeenCalledTimes(2));
    const signal = loadSamples.mock.calls[1]![0].signal;
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
    expect(control('experiment-coordinate-save-receipt','origin')).not.toHaveTextContent('Saved');
    expect(control('experiment-coordinate-drawer','origin')).toHaveAttribute('data-xgc-dirty','true');
  });

  it('does not leave an earlier success receipt visible when a subsequent save fails',async () => {
    const onSaveOrigin = vi.fn<(offset:{ x:number;y:number;z:number }) => Promise<void>>()
      .mockResolvedValueOnce().mockRejectedValueOnce(new Error('Save failed after the connection changed.'));
    renderDrawer({ runId:undefined,onSaveOrigin });
    fireEvent.click(control('experiment-coordinate-save','origin'));
    await waitFor(() => expect(control('experiment-coordinate-save-receipt','origin')).toHaveTextContent('Saved'));
    fireEvent.click(control('experiment-coordinate-save','origin'));
    await waitFor(() => expect(control('experiment-coordinate-error','origin')).toHaveTextContent('Save failed'));
    expect(control('experiment-coordinate-save-receipt','origin')).not.toHaveTextContent('Saved');
  });

  it('keeps manual authoring available after sample loading fails',async () => {
    loadSamples.mockRejectedValueOnce(new Error('Runtime unavailable'));
    const { onSaveOrigin } = renderDrawer();
    await waitFor(() => expect(control('experiment-coordinate-error','origin')).toHaveTextContent('Runtime unavailable'));
    fireEvent.click(control('experiment-coordinate-source','custom'));
    changeAxis('origin:x','4');
    fireEvent.click(control('experiment-coordinate-save','origin'));
    await waitFor(() => expect(onSaveOrigin).toHaveBeenCalled());
    expect(loadSamples).toHaveBeenCalledTimes(1);
  });

  it('allows manual saving while an independent pose request is still pending',async () => {
    loadSamples.mockReturnValueOnce(new Promise(() => {}));
    const { onSaveOrigin } = renderDrawer();
    fireEvent.click(control('experiment-coordinate-source','custom'));
    changeAxis('origin:x','4');
    expect(control('experiment-coordinate-save','origin')).toBeEnabled();
    fireEvent.click(control('experiment-coordinate-save','origin'));
    await waitFor(() => expect(onSaveOrigin).toHaveBeenCalled());
  });

  it('clears old samples when the running Session disappears and keeps custom authoring available',async () => {
    const props:ComponentProps<typeof ExperimentCoordinateDrawer> = {
      view:'origin',targetId:'local',runId:'robot-run',runMode:'physical',experimentResourceId:'experiment',
      bindings,assets:[],offset:{ x:0,y:0,z:0 },
      onSaveOrigin:vi.fn().mockResolvedValue(undefined),onSavePoses:vi.fn().mockResolvedValue(undefined),onClose:vi.fn(),
    };
    const { rerender } = render(<ExperimentCoordinateDrawer {...props} />);
    await waitFor(() => expect(control('experiment-coordinate-robot','one')).toBeVisible());
    fireEvent.click(control('experiment-coordinate-robot','one'));
    rerender(<ExperimentCoordinateDrawer {...props} runId={undefined} />);
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-robot"]')).toBeNull();
    expect(control('experiment-coordinate-save','origin')).toBeDisabled();
    fireEvent.click(control('experiment-coordinate-source','custom'));
    changeAxis('origin:y','3');
    fireEvent.click(control('experiment-coordinate-save','origin'));
    await waitFor(() => expect(props.onSaveOrigin).toHaveBeenCalled());
    expect(loadSamples).toHaveBeenCalledTimes(1);
  });

  it('keeps an unsaved custom coordinate when its Experiment is parked and restored',() => {
    const props:ComponentProps<typeof ExperimentCoordinateDrawer> = {
      view:'origin',targetId:'local',runMode:'physical',experimentResourceId:'experiment',
      bindings,assets:[],offset:{ x:0,y:0,z:0 },
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

  it('locks dismissal and authored controls until the save resolves, then reports an Edit draft receipt',async () => {
    let finish!:() => void;
    const onSaveOrigin = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    renderDrawer({ runId:undefined,editing:true,onSaveOrigin });
    changeAxis('origin:y','2');
    fireEvent.click(control('experiment-coordinate-save','origin'));
    await waitFor(() => expect(onSaveOrigin).toHaveBeenCalled());
    expect(control('experiment-coordinate-save','origin')).toBeDisabled();
    expect(axis('origin:y').closest('[inert]')).not.toBeNull();
    expect(screen.getByRole('button',{ name:'Close drawer' })).toBeDisabled();
    expect(control('experiment-coordinate-save-receipt','origin')).not.toHaveTextContent('Added to the Edit draft');
    await act(async () => finish());
    expect(control('experiment-coordinate-save-receipt','origin')).toHaveTextContent('Added to the Edit draft. Save the Experiment to use it next time.');
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
      physical:true,expiresAt:capturedAt + 60_000,
    })),
  };
}
