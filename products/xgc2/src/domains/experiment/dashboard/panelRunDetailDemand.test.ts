// @vitest-environment jsdom

import { renderHook,waitFor } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { AutomationPanelContext } from '../../../panels/types';
import { EXPERIMENT_PROCESS_RUNTIME_DATASOURCE } from '../experimentProcessRuntime';
import { workflowRuntimeDatasources } from '../../../shared/workflowRuntimeProtocol';
import {
  dataContractsDemandRunDetails,
  panelRunDetailDemands,
  usePanelRunDetailDemand,
} from './panelRunDetailDemand';

describe('Panel Run detail demand',() => {
  it('is declared by runtime-bearing data contracts, never dashboard or Panel names',() => {
    expect(dataContractsDemandRunDetails([EXPERIMENT_PROCESS_RUNTIME_DATASOURCE])).toBe(true);
    expect(dataContractsDemandRunDetails([workflowRuntimeDatasources.run])).toBe(true);
    expect(dataContractsDemandRunDetails([workflowRuntimeDatasources.runLogs])).toBe(true);
    expect(dataContractsDemandRunDetails(['camera.video.v1'])).toBe(true);
    expect(dataContractsDemandRunDetails(['experiment.robots.v1','robot.assets.v1'])).toBe(false);
  });

  it('selects only exact mounted Panel roots on the requested target',() => {
    const runs=[
      run('own','arbitrary-panel','local',4),
      run('sibling','other-panel','local',5),
      run('remote','arbitrary-panel','agent/a',6),
    ];
    expect(panelRunDetailDemands({
      panelId:'arbitrary-panel',targetId:'local',activeRuns:runs,
      fallback:{ rootRunId:'full',targetId:'local',id:'managed',status:'waiting',revision:7 },
      enabled:true,
    })).toEqual([
      { id:'managed',targetId:'local',revision:7 },
      { id:'own',targetId:'local',revision:4 },
    ]);
    expect(panelRunDetailDemands({
      panelId:'arbitrary-panel',targetId:'local',activeRuns:runs,enabled:false,
    })).toEqual([]);
  });

  it('keeps an equal demand stable across rerenders and issues one root detail load',async () => {
    const loadRunDetail=vi.fn(async () => undefined);
    const release=vi.fn();
    const retainRunDetail=vi.fn(() => release);
    const automation={
      targetId:'local',runDetailsById:{},loadRunDetail,retainRunDetail,
    } as unknown as AutomationPanelContext['automation'];
    const { rerender,unmount }=renderHook(({ demands }) => usePanelRunDetailDemand({
      demands,automation,
    }),{ initialProps:{ demands:[{ id:'root',targetId:'local',revision:3 }] } });
    await waitFor(() => expect(loadRunDetail).toHaveBeenCalledWith('root',3));
    rerender({ demands:[{ id:'root',targetId:'local',revision:3 }] });
    expect(loadRunDetail).toHaveBeenCalledTimes(1);
    expect(retainRunDetail).toHaveBeenCalledOnce();
    unmount();
    expect(release).toHaveBeenCalledOnce();
  });
});

function run(id:string,panelId:string,targetId:string,revision:number) {
  return {
    id,panelId,targetId,revision,
    experimentRef:{ domain:'experiment' as const,resourceId:'experiment',branch:'main' },
    automationResourceId:'system',actionId:'run-panel',runMode:'simulation',status:'waiting' as const,
    rootRunId:id,createdAt:'t',updatedAt:'t',workflowTargets:[],
  };
}
