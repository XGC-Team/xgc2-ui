// @vitest-environment jsdom

import { act,renderHook } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { ExperimentDocument } from '../experimentModel';
import { ExperimentCommitConflict } from '../useExperimentCatalog';
import { useDashboardEditSession } from './useDashboardEditSession';
import { createExperimentRobotBindingActions } from './experimentRobotBindingActions';

describe('useDashboardEditSession', () => {
  it('locks System authoring while retaining editable templates and ordinary experiments', async () => {
    const saveExperimentDraft = vi.fn(async (experiment: ExperimentDocument) => experiment);
    const system = experimentFixture();
    system.head.system = true;
    const { result,rerender } = renderHook(
      ({ selectedExperiment }) => useDashboardEditSession({ selectedExperiment,saveExperimentDraft }),
      { initialProps:{ selectedExperiment:system } },
    );
    expect(result.current.readOnly).toBe(true);
    act(() => result.current.start());
    expect(result.current.editing).toBe(false);
    await act(async () => { await result.current.save(); });
    expect(saveExperimentDraft).not.toHaveBeenCalled();

    const template = { ...system,spec:{ ...system.spec,tags:['template'] } };
    rerender({ selectedExperiment:template });
    expect(result.current.readOnly).toBe(false);
    act(() => result.current.start());
    expect(result.current.editing).toBe(true);
    rerender({ selectedExperiment:system });
    expect(result.current.editing).toBe(false);
    expect(result.current.activeDraft).toBeUndefined();
  });

  it('invalidates an edit when selection changes', () => {
    const saveExperimentDraft = vi.fn(async (experiment: ExperimentDocument) => experiment);
    const first = experimentFixture('experiment-a');
    const second = experimentFixture('experiment-b');
    const { result,rerender } = renderHook(
      ({ selectedExperiment }) => useDashboardEditSession({ selectedExperiment,saveExperimentDraft }),
      { initialProps: { selectedExperiment: first } },
    );

    act(() => result.current.start());
    expect(result.current.editing).toBe(true);
    rerender({ selectedExperiment: second });

    expect(result.current.editing).toBe(false);
    expect(result.current.activeDraft).toBeUndefined();
    expect(result.current.visibleExperiment?.head.resourceId).toBe('experiment-b');
  });

  it('accepts the first roster gesture into the normal Edit draft and keeps Save and Discard authoritative',async () => {
    const selectedExperiment=experimentFixture();
    const saveExperimentDraft=vi.fn(async (document:ExperimentDocument) => document);
    const { result }=renderHook(() => {
      const session=useDashboardEditSession({ selectedExperiment,saveExperimentDraft });
      const actions=createExperimentRobotBindingActions({
        getRendered:() => session.visibleExperiment,runtimeActive:false,dashboardEditing:session.editing,
        save:saveExperimentDraft,applyDraft:session.updateDraft,beginEdit:session.startWithDraft,
      });
      return { session,actions };
    });
    const binding={
      id:'px4-01',ref:{ domain:'robot' as const,resourceId:'fs150-16',branch:'main' },
      namespace:'/uav1',hybridSource:'physical' as const,runtimeParameters:{},
      initialPose:{ x:1,y:2,z:3,yaw:0 },px4:{},
    };
    await act(async () => { await result.current.actions.update([binding],'c1'); });
    expect(result.current.session.editing).toBe(true);
    expect(result.current.session.activeDraft?.spec.robots).toEqual([binding]);
    expect(saveExperimentDraft).not.toHaveBeenCalled();
    act(() => result.current.session.discard());
    expect(result.current.session.editing).toBe(false);
    expect(result.current.session.visibleExperiment?.spec.robots).toEqual([]);
    await act(async () => { await result.current.actions.update([binding],'c1'); });
    await act(async () => { await result.current.session.save(); });
    expect(saveExperimentDraft).toHaveBeenCalledOnce();
    expect(saveExperimentDraft.mock.calls[0]?.[0]).toMatchObject({
      branch:{ headCommitId:'c1' },spec:{ robots:[binding] },
    });
  });

  it('refuses stale or foreign first-gesture drafts and does not replace an in-flight Save',async () => {
    const selectedExperiment=experimentFixture();
    let finishSave!: (value:ExperimentDocument) => void;
    const saveExperimentDraft=vi.fn(() => new Promise<ExperimentDocument>((resolve) => { finishSave=resolve; }));
    const { result }=renderHook(() => useDashboardEditSession({ selectedExperiment,saveExperimentDraft }));
    const foreign=experimentFixture('another-experiment');
    const stale={ ...selectedExperiment,branch:{ ...selectedExperiment.branch,headCommitId:'other-head' } };
    expect(() => result.current.startWithDraft(foreign)).toThrow('The Experiment changed');
    expect(() => result.current.startWithDraft(stale)).toThrow('The Experiment changed');
    expect(result.current.editing).toBe(false);
    act(() => result.current.startWithDraft(selectedExperiment));
    let saving!: Promise<void>;
    act(() => { saving=result.current.save(); });
    expect(result.current.saving).toBe(true);
    expect(() => result.current.startWithDraft(selectedExperiment)).toThrow('Wait for the current changes');
    expect(result.current.saving).toBe(true);
    await act(async () => { finishSave(selectedExperiment);await saving; });
    expect(result.current.editing).toBe(false);
    expect(saveExperimentDraft).toHaveBeenCalledOnce();
  });

  it('keeps the authored spec open on a CAS conflict while adopting the latest resource revision', async () => {
    const selectedExperiment = experimentFixture();
    const latest = experimentFixture();
    latest.head.revision = 2;
    latest.branch.revision = 2;
    const saveExperimentDraft = vi.fn().mockRejectedValue(new ExperimentCommitConflict('409 Conflict', latest));
    const { result } = renderHook(() => useDashboardEditSession({ selectedExperiment,saveExperimentDraft }));

    act(() => result.current.start());
    act(() => result.current.updateDraft({
      ...result.current.activeDraft!,
      spec: { ...result.current.activeDraft!.spec,name: 'Unsaved dashboard edit' },
    }));
    await act(async () => { await result.current.save(); });

    expect(result.current.editing).toBe(true);
    expect(result.current.activeDraft?.head.revision).toBe(2);
    expect(result.current.activeDraft?.spec.name).toBe('Unsaved dashboard edit');
    expect(result.current.commitConflict).toBe('409 Conflict');
    expect(result.current.saving).toBe(false);
  });
});

function experimentFixture(resourceId = 'experiment-a'): ExperimentDocument {
  return {
    head: {
      domain: 'experiment',resourceId,name: 'Experiment',tags: [],mainCommitId: 'c1',currentVersion: 1,
      digest: 'd',revision: 1,createdAt: '',updatedAt: '',
    },
    branch: {
      domain: 'experiment',resourceId,name: 'main',headCommitId: 'c1',headVersion: 1,
      revision: 1,createdAt: '',updatedAt: '',
    },
    spec: {
      schemaVersion: 15,name: 'Experiment',description: '',tags: [],
      runModes: ['simulation','physical'],
      localizationOffset:{ x:0,y:0,z:0 },
      robots: [],workflowInstances: [],
      dashboards: [{ id: 'gcs',name: 'GCS',description: '',panels: [] }],
    },
  };
}
