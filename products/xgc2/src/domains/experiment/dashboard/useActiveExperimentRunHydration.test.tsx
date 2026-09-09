// @vitest-environment jsdom

import { renderHook,waitFor } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { AutomationRunDetail } from '../../automation/automationPublic';
import { useActiveExperimentRunHydration } from './useActiveExperimentRunHydration';

describe('useActiveExperimentRunHydration',() => {
  it('loads missing roots, reloads an evicted success, and follows an authoritative revision',async () => {
    const loadRunDetail = vi.fn(async () => undefined);
    const properties = {
      runs:[run('panel-root',2)],targetId:'local',detailsById:{},loadRunDetail,
    };
    const view = renderHook((input) => useActiveExperimentRunHydration(input),{
      initialProps:properties,
    });
    await waitFor(() => expect(loadRunDetail).toHaveBeenCalledWith('panel-root',2));
    view.rerender({ ...properties });
    expect(loadRunDetail).toHaveBeenCalledTimes(1);
    view.rerender({ ...properties,detailsById:{} });
    await waitFor(() => expect(loadRunDetail).toHaveBeenCalledTimes(2));
    view.rerender({ ...properties,runs:[run('panel-root',3)] });
    await waitFor(() => expect(loadRunDetail).toHaveBeenCalledTimes(3));
  });

  it('records a resolved detail error as failed and retries only after revision advances',async () => {
    const loadRunDetail=vi.fn(async () => ({ error:'detail unavailable' }));
    const { rerender }=renderHook(({ revision,detailsById }) => useActiveExperimentRunHydration({
      runs:[run('panel-root',revision)],targetId:'local',detailsById,loadRunDetail,
    }),{ initialProps:{ revision:2,detailsById:{} as Record<string,AutomationRunDetail> } });
    await waitFor(() => expect(loadRunDetail).toHaveBeenCalledTimes(1));
    rerender({ revision:2,detailsById:{} });
    expect(loadRunDetail).toHaveBeenCalledTimes(1);
    rerender({ revision:3,detailsById:{} });
    await waitFor(() => expect(loadRunDetail).toHaveBeenCalledTimes(2));
  });

  it('does not reload a matching detail or a root on another execution target',() => {
    const loadRunDetail = vi.fn(async () => undefined);
    const detail = {
      run:{ id:'panel-root',revision:2 },relations:{},loading:false,error:'',invocations:[],nodeSummaries:[],
    } as unknown as AutomationRunDetail;
    renderHook(() => useActiveExperimentRunHydration({
      runs:[run('panel-root',2),{ ...run('remote-root',1),targetId:'agent-a' }],
      targetId:'local',detailsById:{ 'panel-root':detail },loadRunDetail,
    }));
    expect(loadRunDetail).not.toHaveBeenCalled();
  });
});

function run(id:string,revision:number) {
  return {
    id,targetId:'local',experimentRef:{ domain:'experiment' as const,resourceId:'experiment-a',branch:'main' },
    automationResourceId:'system-runner',actionId:'run-panel',runMode:'simulation',status:'waiting' as const,
    revision,rootRunId:id,createdAt:'t',updatedAt:'t',workflowTargets:[],
  };
}
