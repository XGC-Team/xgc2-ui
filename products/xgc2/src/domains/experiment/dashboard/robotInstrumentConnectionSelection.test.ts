import { describe,expect,it } from 'vitest';
import type { AutomationChildRunRelation,AutomationRunDetail } from '../../automation/automationPublic';
import {
  connectedRobotIdsForSelection,
  instrumentRunCoversAll,
  instrumentSlotGroupsKnown,
  liveInstrumentSlotStops,
  partitionSelectedRobotConnection,
} from './robotInstrumentConnectionSelection';

describe('robotInstrumentConnectionSelection',() => {
  it('partitions mixed selection into unconnected and connected robots',() => {
    expect(partitionSelectedRobotConnection(
      ['uav-01','scout-01','scout-02'],
      new Set(['scout-01']),
    )).toEqual({
      selected:['scout-01','scout-02','uav-01'],
      toConnect:['scout-02','uav-01'],
      toDisconnect:['scout-01'],
    });
  });

  it('treats a full-roster instrument run as covering the current selection',() => {
    expect(instrumentRunCoversAll([],'all')).toBe(true);
    expect(connectedRobotIdsForSelection(['scout-01','uav-01'],[
      { robotIds:[],coversAll:true },
    ])).toEqual(new Set(['scout-01','uav-01']));
  });

  it('unions explicit instrument runs without treating unlisted robots as connected',() => {
    expect(connectedRobotIdsForSelection(['scout-01','scout-02','uav-01'],[
      { robotIds:['scout-01'],coversAll:false },
    ])).toEqual(new Set(['scout-01']));
  });

  it('lists live robot-slots children for selected robots only',() => {
    const child = {
      childRunId:'slot-scout-01',runStatus:'waiting',runRevision:3,
    } as AutomationChildRunRelation;
    const details:Record<string,AutomationRunDetail>={
      'panel-run':{
        invocations:[],nodeSummaries:[],loading:false,error:'',
        relations:{
          runId:'panel-run',
          childRunGroups:[{ id:'slots',producerNodeId:'robot-slots' } as never],
          childRunGroupMembers:[
            { groupId:'slots',itemKey:'scout-01',childRunId:'slot-scout-01',state:'dispatched' } as never,
            { groupId:'slots',itemKey:'scout-02',childRunId:'slot-scout-02',state:'dispatched' } as never,
            { groupId:'slots',itemKey:'uav-01',childRunId:'slot-uav-01',state:'terminal' } as never,
          ],
          childRuns:[child,{ childRunId:'slot-scout-02',runStatus:'stopped',runRevision:1 } as never],
          waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
        },
      },
    };
    expect(liveInstrumentSlotStops(
      details,['panel-run'],new Set(['scout-01','scout-02','uav-01']),
    )).toEqual([{ itemKey:'scout-01',child }]);
    expect(instrumentSlotGroupsKnown(details,['panel-run'])).toBe(true);
    expect(instrumentSlotGroupsKnown(details,['missing'])).toBe(false);
  });
});
