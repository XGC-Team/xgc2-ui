import { describe,expect,it,vi } from 'vitest';
import { newExperimentSpec,type ExperimentDocument,type ExperimentRobotBinding } from '../experimentModel';
import {
  EXPERIMENT_ROBOT_ROSTER_EDIT_REASON,
  createExperimentRobotBindingActions,
} from './experimentRobotBindingActions';

describe('createExperimentRobotBindingActions',() => {
  it.each([false,true])('keeps System pose and origin authoring locked when runtimeActive=%s',async (runtimeActive) => {
    const current = experiment([px4Binding('uav-01')]);
    current.head.system = true;
    const save = vi.fn(async (value: ExperimentDocument) => value);
    const applyDraft = vi.fn();
    const actions = createExperimentRobotBindingActions({
      getRendered:() => current,runtimeActive,dashboardEditing:false,save,applyDraft,
    });
    expect(actions.disabledReason()).toBe('This Experiment is read only.');
    expect(actions.localizationOffsetDisabledReason()).toBe('This Experiment is read only.');
    const robots = structuredClone(current.spec.robots);
    robots[0]!.initialPose.x = 1;
    await expect(actions.update(robots,'commit-1')).rejects.toThrow('This Experiment is read only.');
    await expect(actions.updateLocalizationOffset({ x:1,y:0,z:0 },'commit-1')).rejects.toThrow('This Experiment is read only.');
    expect(save).not.toHaveBeenCalled();
    expect(applyDraft).not.toHaveBeenCalled();
  });

  it('chains roster updates into the Edit draft without saving',async () => {
    const first = experiment();
    let current: ExperimentDocument | undefined = first;
    const save = vi.fn(async (value: ExperimentDocument) => value);
    const applyDraft = vi.fn((next: ExperimentDocument) => { current = next; });
    const actions = createExperimentRobotBindingActions({
      getRendered: () => current,
      rememberSaved: (saved) => { current = saved; },
      runtimeActive: false,
      dashboardEditing: true,
      save,
      applyDraft,
    });

    const added = [px4Binding('uav-01'),px4Binding('uav-02')];
    await actions.update(added,'commit-1');
    expect(save).not.toHaveBeenCalled();
    expect(applyDraft).toHaveBeenCalledOnce();
    await actions.update([added[0]!],'commit-1');
    expect(applyDraft).toHaveBeenCalledTimes(2);
    expect(current?.spec.robots).toEqual([added[0]]);
    expect(current?.branch.headCommitId).toBe('commit-1');
  });

  it('opens the first roster change atomically and keeps subsequent parameters and origin in that same draft',async () => {
    const original = experiment();
    let current = original;
    const save = vi.fn(async (value: ExperimentDocument) => value);
    const beginEdit = vi.fn();
    const applyDraft = vi.fn();
    const actions = createExperimentRobotBindingActions({
      getRendered:() => current,
      rememberSaved:(next) => { current = next; },
      runtimeActive:false,dashboardEditing:false,save,applyDraft,beginEdit,
    });

    const added = await actions.update([px4Binding('uav-01')],'commit-1');
    expect(beginEdit).toHaveBeenCalledExactlyOnceWith(added);
    expect(added.spec.robots).toEqual([px4Binding('uav-01')]);
    expect(applyDraft).not.toHaveBeenCalled();

    const renamed = structuredClone(current.spec.robots);
    renamed[0]!.namespace = '/formation-leader';
    await actions.update(renamed,'commit-1');
    await actions.updateLocalizationOffset({ x:-2,y:3,z:0.5 },'commit-1');

    expect(beginEdit).toHaveBeenCalledOnce();
    expect(applyDraft).toHaveBeenCalledTimes(2);
    expect(applyDraft.mock.calls[1]?.[0]).toBe(current);
    expect(current.spec.robots[0]?.namespace).toBe('/formation-leader');
    expect(current.spec.localizationOffset).toEqual({ x:-2,y:3,z:0.5 });
    expect(current.branch.headCommitId).toBe('commit-1');
    expect(save).not.toHaveBeenCalled();
    expect(original.spec.robots).toEqual([]);
    expect(original.spec.localizationOffset).toEqual({ x:0,y:0,z:0 });
  });

  it.each(['remove','reassign'] as const)('opens a draft for the first %s gesture',async (gesture) => {
    const current = experiment([px4Binding('uav-01'),px4Binding('uav-02')]);
    const save = vi.fn(async (value: ExperimentDocument) => value);
    const beginEdit = vi.fn();
    const applyDraft = vi.fn();
    const rememberSaved = vi.fn();
    const actions = createExperimentRobotBindingActions({
      getRendered:() => current,rememberSaved,
      runtimeActive:false,dashboardEditing:false,save,applyDraft,beginEdit,
    });
    const nextBindings = gesture === 'remove'
      ? [current.spec.robots[0]!]
      : current.spec.robots.map((binding,index) => ({
        ...binding,ref:current.spec.robots[1-index]!.ref,
      }));

    const accepted = await actions.update(nextBindings,'commit-1');
    expect(beginEdit).toHaveBeenCalledExactlyOnceWith(accepted);
    expect(accepted.spec.robots).toEqual(nextBindings);
    expect(rememberSaved).toHaveBeenCalledExactlyOnceWith(accepted);
    expect(applyDraft).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('does not open a draft or save unchanged bindings',async () => {
    const current = experiment([px4Binding('uav-01')]);
    const save = vi.fn(async (value: ExperimentDocument) => value);
    const beginEdit = vi.fn();
    const applyDraft = vi.fn();
    const actions = createExperimentRobotBindingActions({
      getRendered:() => current,
      runtimeActive:false,dashboardEditing:false,save,applyDraft,beginEdit,
    });
    await expect(actions.update(structuredClone(current.spec.robots),'commit-1')).resolves.toBe(current);
    expect(beginEdit).not.toHaveBeenCalled();
    expect(applyDraft).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it.each([
    ['missing','The current Experiment is unavailable.'],
    ['readonly','This Experiment is read only.'],
    ['runtime','Stop it before editing assets'],
    ['stale','The Experiment changed while its Robots were being updated.'],
  ] as const)('keeps the %s gate ahead of automatic draft creation',async (gate,message) => {
    const current = experiment([px4Binding('uav-01')]);
    current.head.system = gate === 'readonly';
    const save = vi.fn(async (value: ExperimentDocument) => value);
    const beginEdit = vi.fn();
    const applyDraft = vi.fn();
    const rememberSaved = vi.fn();
    const actions = createExperimentRobotBindingActions({
      getRendered:() => gate === 'missing' ? undefined : current,rememberSaved,
      runtimeActive:gate === 'runtime',dashboardEditing:false,save,applyDraft,beginEdit,
    });
    await expect(actions.update([],gate === 'stale' ? 'old-commit' : 'commit-1')).rejects.toThrow(message);
    expect(beginEdit).not.toHaveBeenCalled();
    expect(applyDraft).not.toHaveBeenCalled();
    expect(rememberSaved).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('does not enter editing or remember an unaccepted draft when opening fails',async () => {
    const current = experiment([px4Binding('uav-01')]);
    const save = vi.fn(async (value: ExperimentDocument) => value);
    const beginEdit = vi.fn(() => { throw new Error('The selected Experiment changed.'); });
    const applyDraft = vi.fn();
    const rememberSaved = vi.fn();
    const actions = createExperimentRobotBindingActions({
      getRendered:() => current,rememberSaved,
      runtimeActive:false,dashboardEditing:false,save,applyDraft,beginEdit,
    });
    await expect(actions.update([],'commit-1')).rejects.toThrow('The selected Experiment changed.');
    expect(rememberSaved).not.toHaveBeenCalled();
    expect(current.spec.robots).toHaveLength(1);
    const renamed = structuredClone(current.spec.robots);
    renamed[0]!.namespace = '/retained';
    await actions.update(renamed,'commit-1');
    expect(beginEdit).toHaveBeenCalledOnce();
    expect(applyDraft).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledOnce();
  });

  it.each([
    { dashboardEditing:false,runtimeActive:false },
    { dashboardEditing:true,runtimeActive:false },
    { dashboardEditing:false,runtimeActive:true },
  ])('refuses every authoring path while saving with %j',async ({ dashboardEditing,runtimeActive }) => {
    const current = experiment([px4Binding('uav-01')]);
    const save = vi.fn(async (value: ExperimentDocument) => value);
    const beginEdit = vi.fn();
    const applyDraft = vi.fn();
    const rememberSaved = vi.fn();
    const actions = createExperimentRobotBindingActions({
      getRendered:() => current,rememberSaved,runtimeActive,dashboardEditing,
      saving:true,save,applyDraft,beginEdit,
    });
    const refusal = 'Wait for the current changes to finish saving.';
    expect(actions.disabledReason()).toBe(refusal);
    expect(actions.localizationOffsetDisabledReason()).toBe(refusal);
    await expect(actions.update([],'commit-1')).rejects.toThrow(refusal);
    const renamed = structuredClone(current.spec.robots);
    renamed[0]!.namespace = '/pending';
    await expect(actions.update(renamed,'commit-1')).rejects.toThrow(refusal);
    const initialPose = structuredClone(current.spec.robots);
    initialPose[0]!.initialPose.x = 4;
    await expect(actions.update(initialPose,'commit-1')).rejects.toThrow(refusal);
    await expect(actions.updateLocalizationOffset({ x:2,y:0,z:0 },'commit-1')).rejects.toThrow(refusal);
    expect(beginEdit).not.toHaveBeenCalled();
    expect(applyDraft).not.toHaveBeenCalled();
    expect(rememberSaved).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('chains immediate parameter updates against the last saved Experiment head',async () => {
    const first = experiment([px4Binding('uav-01')]);
    let current: ExperimentDocument | undefined = first;
    const save = vi.fn(async (next: ExperimentDocument) => {
      current = {
        ...next,
        branch:{
          ...next.branch,
          headCommitId:`commit-${next.branch.headVersion + 1}`,
          headVersion:next.branch.headVersion + 1,
        },
      };
      return current;
    });
    const beginEdit = vi.fn();
    const applyDraft = vi.fn();
    const actions = createExperimentRobotBindingActions({
      getRendered: () => current,
      rememberSaved: (saved) => { current = saved; },
      runtimeActive: false,
      dashboardEditing: false,
      save,
      beginEdit,
      applyDraft,
    });

    const renamed = structuredClone(first.spec.robots);
    renamed[0]!.namespace = '/uav9';
    await actions.update(renamed,'commit-1');
    expect(save).toHaveBeenCalledOnce();
    renamed[0]!.namespace = '/uav8';
    await actions.update(renamed,'commit-2');
    expect(save).toHaveBeenCalledTimes(2);
    expect(current?.spec.robots[0]?.namespace).toBe('/uav8');
    expect(current?.branch.headCommitId).toBe('commit-3');
    expect(beginEdit).not.toHaveBeenCalled();
    expect(applyDraft).not.toHaveBeenCalled();
  });

  it('refuses roster updates when the host cannot open a Dashboard Edit draft',async () => {
    const save = vi.fn(async (value: ExperimentDocument) => value);
    const actions = createExperimentRobotBindingActions({
      getRendered: () => experiment(),
      runtimeActive: false,
      dashboardEditing: false,
      save,
    });
    expect(actions.disabledReason()).toBe('');
    await expect(actions.update([px4Binding('uav-02')],'commit-1'))
      .rejects.toThrow(EXPERIMENT_ROBOT_ROSTER_EDIT_REASON);
    expect(save).not.toHaveBeenCalled();
  });

  it('refuses updates while the Experiment is running',async () => {
    const save = vi.fn(async (value: ExperimentDocument) => value);
    const actions = createExperimentRobotBindingActions({
      getRendered: () => experiment(),
      runtimeActive: true,
      dashboardEditing: false,
      save,
    });
    expect(actions.disabledReason()).toMatch(/Stop it before editing assets/);
    await expect(actions.update([],'commit-1')).rejects.toThrow(/Stop it before editing assets/);
    expect(save).not.toHaveBeenCalled();
  });

  it('allows only next-run initial XYZ/yaw authoring while the current Run stays frozen',async () => {
    const current=experiment();
    current.spec.robots=[px4Binding('uav-01')];
    const save=vi.fn(async (value:ExperimentDocument) => value);
    const actions=createExperimentRobotBindingActions({
      getRendered:()=>current,runtimeActive:true,dashboardEditing:false,save,
    });
    const aligned=structuredClone(current.spec.robots);
    aligned[0]!.initialPose.x=4;
    aligned[0]!.initialPose.y=-2;
    aligned[0]!.initialPose.z=1;
    aligned[0]!.initialPose.yaw=0.5;
    await expect(actions.update(aligned,'commit-1')).resolves.toBeDefined();
    expect(save).toHaveBeenCalledOnce();
    expect(current.spec.robots[0]!.initialPose).toEqual({ x:0,y:0,z:0,yaw:0 });
    const changedSource=structuredClone(aligned);
    changedSource[0]!.hybridSource='simulation';
    await expect(actions.update(changedSource,'commit-1')).rejects.toThrow(/Stop it before editing assets/);
    expect(save).toHaveBeenCalledOnce();
  });

  it('applies parameter edits to the Edit draft instead of saving immediately',async () => {
    const current = experiment([px4Binding('uav-01')]);
    const save = vi.fn(async (value: ExperimentDocument) => value);
    const applyDraft = vi.fn();
    const actions = createExperimentRobotBindingActions({
      getRendered: () => current,
      runtimeActive: false,
      dashboardEditing: true,
      save,
      applyDraft,
    });
    const renamed = structuredClone(current.spec.robots);
    renamed[0]!.namespace = '/uav9';
    await actions.update(renamed,'commit-1');
    expect(save).not.toHaveBeenCalled();
    expect(applyDraft).toHaveBeenCalledOnce();
    expect(applyDraft.mock.calls[0]?.[0].spec.robots[0]?.namespace).toBe('/uav9');
  });

  it('saves world origin offset immediately when Dashboard Edit is closed',async () => {
    const first = experiment();
    let current: ExperimentDocument | undefined = first;
    const save = vi.fn(async (next: ExperimentDocument) => {
      current = {
        ...next,
        branch:{
          ...next.branch,
          headCommitId:`commit-${next.branch.headVersion + 1}`,
          headVersion:next.branch.headVersion + 1,
        },
      };
      return current;
    });
    const actions = createExperimentRobotBindingActions({
      getRendered: () => current,
      rememberSaved: (saved) => { current = saved; },
      runtimeActive: false,
      dashboardEditing: false,
      save,
    });
    await actions.updateLocalizationOffset({ x:1.25,y:-2,z:0.1 },'commit-1');
    expect(save).toHaveBeenCalledOnce();
    expect(current?.spec.localizationOffset).toEqual({ x:1.25,y:-2,z:0.1 });
    expect(current?.spec.robots).toEqual(first.spec.robots);
  });

  it('applies world origin offset to the Edit draft instead of saving immediately',async () => {
    const current = experiment();
    const save = vi.fn(async (value: ExperimentDocument) => value);
    const applyDraft = vi.fn();
    const actions = createExperimentRobotBindingActions({
      getRendered: () => current,
      runtimeActive: false,
      dashboardEditing: true,
      save,
      applyDraft,
    });
    await actions.updateLocalizationOffset({ x:4,y:0,z:0 },'commit-1');
    expect(save).not.toHaveBeenCalled();
    expect(applyDraft).toHaveBeenCalledOnce();
    expect(applyDraft.mock.calls[0]?.[0].spec.localizationOffset).toEqual({ x:4,y:0,z:0 });
  });

  it('allows world origin offset fill while the Experiment is running',async () => {
    const current = experiment([px4Binding('uav-01')]);
    const save = vi.fn(async (value: ExperimentDocument) => value);
    const actions = createExperimentRobotBindingActions({
      getRendered: () => current,
      runtimeActive: true,
      dashboardEditing: false,
      save,
    });
    expect(actions.localizationOffsetDisabledReason()).toBe('');
    expect(actions.disabledReason()).toMatch(/Stop it before editing assets/);
    await expect(actions.updateLocalizationOffset({ x:1,y:0,z:0 },'commit-1')).resolves.toBeDefined();
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0]?.[0].spec.localizationOffset).toEqual({ x:1,y:0,z:0 });
    expect(save.mock.calls[0]?.[0].spec.robots).toEqual(current.spec.robots);
    expect(current.spec.localizationOffset).toEqual({ x:0,y:0,z:0 });
    await expect(actions.update([],'commit-1')).rejects.toThrow(/Stop it before editing assets/);
    const changedNamespace = structuredClone(current.spec.robots);
    changedNamespace[0]!.namespace = '/changed';
    await expect(actions.update(changedNamespace,'commit-1')).rejects.toThrow(/Stop it before editing assets/);
    expect(save).toHaveBeenCalledOnce();
  });

  it('keeps world origin authoring locked in an active dashboard Edit draft',async () => {
    const save = vi.fn(async (value: ExperimentDocument) => value);
    const applyDraft = vi.fn();
    const actions = createExperimentRobotBindingActions({
      getRendered:() => experiment(),runtimeActive:true,dashboardEditing:true,save,applyDraft,
    });
    expect(actions.localizationOffsetDisabledReason()).toMatch(/Stop it before editing assets/);
    await expect(actions.updateLocalizationOffset({ x:1,y:0,z:0 },'commit-1'))
      .rejects.toThrow(/Stop it before editing assets/);
    expect(save).not.toHaveBeenCalled();
    expect(applyDraft).not.toHaveBeenCalled();
  });

  it('requires a save capability for next-restart origin changes even when draft authoring exists',async () => {
    const applyDraft = vi.fn();
    const actions = createExperimentRobotBindingActions({
      getRendered:() => experiment(),runtimeActive:true,dashboardEditing:false,applyDraft,
    });
    expect(actions.localizationOffsetDisabledReason()).toBe('This dashboard cannot save world origin changes.');
    await expect(actions.updateLocalizationOffset({ x:1,y:0,z:0 },'commit-1'))
      .rejects.toThrow('This dashboard cannot save world origin changes.');
    expect(applyDraft).not.toHaveBeenCalled();
  });

  it('requires the current Experiment and its matching head for origin changes',async () => {
    const rendered: { current?: ExperimentDocument } = {};
    const save = vi.fn(async (value: ExperimentDocument) => value);
    const actions = createExperimentRobotBindingActions({
      getRendered:() => rendered.current,runtimeActive:true,dashboardEditing:false,save,
    });
    expect(actions.localizationOffsetDisabledReason()).toBe('The current Experiment is unavailable.');
    await expect(actions.updateLocalizationOffset({ x:1,y:0,z:0 },'commit-1'))
      .rejects.toThrow('The current Experiment is unavailable.');
    rendered.current = experiment();
    await expect(actions.updateLocalizationOffset({ x:1,y:0,z:0 },'stale-head'))
      .rejects.toThrow('The Experiment changed while its world origin offset was being updated.');
    expect(save).not.toHaveBeenCalled();
  });
});

function experiment(robots: ExperimentRobotBinding[] = []): ExperimentDocument {
  const now = '2026-01-01T00:00:00Z';
  return {
    head:{
      domain:'experiment',resourceId:'experiment-a',name:'Experiment',tags:[],
      mainCommitId:'commit-1',currentVersion:1,digest:'d'.repeat(64),revision:1,createdAt:now,updatedAt:now,
    },
    branch:{
      domain:'experiment',resourceId:'experiment-a',name:'main',headCommitId:'commit-1',
      headVersion:1,revision:1,createdAt:now,updatedAt:now,
    },
    spec:newExperimentSpec({ name:'Experiment',robots }),
  };
}

function px4Binding(id: string): ExperimentRobotBinding {
  return {
    id,
    ref:{ domain:'robot',resourceId:id,branch:'main' },
    namespace:`/${id}`,
    hybridSource:'physical',
    runtimeParameters:{},
    initialPose:{ x:0,y:0,z:0,yaw:0 },
    px4:{},
  };
}
