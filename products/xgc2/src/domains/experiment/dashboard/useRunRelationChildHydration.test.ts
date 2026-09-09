// @vitest-environment jsdom

import { renderHook,waitFor } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { AutomationChildRunRelation,AutomationRun,AutomationRunDetail } from '../../automation/automationPublic';
import { useRunRelationChildHydration } from './useRunRelationChildHydration';

describe('useRunRelationChildHydration',() => {
  it('loads nested children once, reloads after eviction, and follows an advanced Run revision',async () => {
    const loadRunDetail = vi.fn(async () => undefined);
    const initial = details([child('nested-run',{ runRevision:3,revision:4 })]);
    const { rerender } = renderHook(
      ({ current }) => useRunRelationChildHydration({
        rootRunIds:['panel-run'],detailsById:current,loadRunDetail,
      }),
      { initialProps:{ current:initial } },
    );
    await waitFor(() => expect(loadRunDetail).toHaveBeenCalledTimes(1));
    expect(loadRunDetail).toHaveBeenCalledWith('nested-run',3);
    const loaded={ ...initial,'nested-run':detail('nested-run',[],3) };
    rerender({ current:loaded });
    expect(loadRunDetail).toHaveBeenCalledTimes(1);
    rerender({ current:{
      ...details([child('nested-run',{ runRevision:3,revision:5 })]),
      'nested-run':loaded['nested-run'],
    } });
    expect(loadRunDetail).toHaveBeenCalledTimes(1);
    rerender({ current:details([child('nested-run',{ runRevision:4,revision:6 })]) });
    await waitFor(() => expect(loadRunDetail).toHaveBeenCalledTimes(2));
    expect(loadRunDetail).toHaveBeenLastCalledWith('nested-run',4);
  });

  it('does not hydrate disconnected children and does not retry a failed revision',async () => {
    const loadRunDetail = vi.fn(async () => ({ error:'run detail unavailable' }));
    const { rerender } = renderHook(
      ({ current }) => useRunRelationChildHydration({
        rootRunIds:['panel-run'],detailsById:current,loadRunDetail,
      }),
      { initialProps:{ current:details([
        child('nested-run',{ runRevision:3,revision:4 }),
        child('remote-run',{ targetRoot:true,targetId:'agent/scout' }),
        child('detached-run',{ relation:'detached' }),
        child('abandoned-run',{ launchAbandonedAt:'t' }),
      ]) } },
    );
    await waitFor(() => expect(loadRunDetail).toHaveBeenCalledTimes(1));
    expect(loadRunDetail).toHaveBeenCalledWith('nested-run',3);
    expect(loadRunDetail).not.toHaveBeenCalledWith('remote-run',expect.anything());
    expect(loadRunDetail).not.toHaveBeenCalledWith('detached-run',expect.anything());
    expect(loadRunDetail).not.toHaveBeenCalledWith('abandoned-run',expect.anything());
    rerender({ current:details([child('nested-run',{ runRevision:3,revision:4 })]) });
    expect(loadRunDetail).toHaveBeenCalledTimes(1);
  });

  it('hydrates newly revealed descendants and refreshes only advanced revisions',async () => {
    const loadRunDetail = vi.fn(async () => undefined);
    const initial = details([child('start-ros-run',{ runRevision:2,revision:3 })]);
    const { rerender } = renderHook(
      ({ current }) => useRunRelationChildHydration({ rootRunIds:['panel-run'],detailsById:current,loadRunDetail }),
      { initialProps:{ current:initial } },
    );
    await waitFor(() => expect(loadRunDetail).toHaveBeenCalledWith('start-ros-run',2));

    const withGrandchild = {
      ...initial,
      'start-ros-run':detail('start-ros-run',[
        child('ros-core-run',{
          parentRunId:'start-ros-run',ownerRunId:'start-ros-run',runRevision:4,revision:5,
        }),
      ],2),
    };
    rerender({ current:withGrandchild });
    await waitFor(() => expect(loadRunDetail).toHaveBeenCalledWith('ros-core-run',4));

    const withDeeper = {
      ...withGrandchild,
      'ros-core-run':detail('ros-core-run',[
        child('provider-run',{
          parentRunId:'ros-core-run',ownerRunId:'ros-core-run',runRevision:6,revision:7,
        }),
      ],4),
    };
    rerender({ current:withDeeper });
    await waitFor(() => expect(loadRunDetail).toHaveBeenCalledWith('provider-run',6));
    expect(loadRunDetail).toHaveBeenCalledTimes(3);

    rerender({ current:{
      ...withDeeper,
      'provider-run':detail('provider-run',[],6),
    } });
    expect(loadRunDetail).toHaveBeenCalledTimes(3);
    rerender({ current:details([child('start-ros-run',{ runRevision:3,revision:4 })]) });
    await waitFor(() => expect(loadRunDetail).toHaveBeenCalledTimes(4));
    expect(loadRunDetail).toHaveBeenLastCalledWith('start-ros-run',3);
  });
});

function details(childRuns:AutomationChildRunRelation[]):Record<string,AutomationRunDetail> {
  return {
    'panel-run':detail('panel-run',childRuns),
  };
}

function detail(runId:string,childRuns:AutomationChildRunRelation[],revision=1):AutomationRunDetail {
  return {
    run:{ id:runId,revision,status:'waiting',targetId:'local' } as AutomationRun,
    invocations:[],nodeSummaries:[],loading:false,error:'',
    relations:{
      runId,childRuns,childRunGroups:[],childRunGroupMembers:[],
      waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
    },
  };
}

function child(childRunId:string,overrides:Partial<AutomationChildRunRelation> = {}):AutomationChildRunRelation {
  return {
    id:`rel-${childRunId}`,targetId:'local',rootRunId:'root-run',parentRunId:'panel-run',
    parentInvocationId:'invoke-call',callNodeId:'call-nested',ordinal:0,childRunId,ownerRunId:'panel-run',
    childDefinitionId:'nested-workflow',childDefinitionVersion:1,childConfigDigest:'a'.repeat(64),
    childExecutionPlanDigest:'b'.repeat(64),childRegistryDigest:'c'.repeat(64),
    childDefinitionDigest:'d'.repeat(64),triggerNodeId:'trigger',relation:'supervised',waitPolicy:'wait',
    cancelPolicy:'cascade',resultPolicy:'propagate',createdAt:'t',updatedAt:'t',boundAt:'t',
    runStatus:'running',runRevision:3,revision:4,...overrides,
  };
}
