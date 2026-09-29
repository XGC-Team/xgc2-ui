import { describe,expect,it } from 'vitest';
import type { AutomationChildRunRelation,AutomationRunDetail } from '../../automation/automationPublic';
import type { ExperimentDashboard } from '../experimentModel';
import type { ExperimentSessionView } from '../experimentWorkflowModel';
import {
  connectedRobotIdsForSelection,
  instrumentRunCoversAll,
  instrumentSlotGroupsKnown,
  liveInstrumentRobotStops,
  liveInstrumentSlotStops,
  partitionSelectedRobotConnection,
  robotInstrumentSessionRunIds,
} from './robotInstrumentConnectionSelection';

describe('robotInstrumentConnectionSelection',() => {
  it('uses the binding owner once instead of duplicating its command ancestor',() => {
    const dashboards=[{panels:[
      {pluginId:'robot-instruments-grid',portBindings:[{kind:'workflow',workflowInstanceId:'authored-instruments'}]},
      {pluginId:'algorithm-panel',portBindings:[{kind:'workflow',workflowInstanceId:'algorithm'}]},
    ]}] as ExperimentDashboard[];
    const session={session:{targetId:'local',state:'active'},members:[
      {kind:'workflow_command',bindingId:'authored-instruments',ownerId:'opening-root',targetId:'local',status:'running'},
      {kind:'workflow_command',bindingId:'algorithm',ownerId:'command-root',targetId:'local',status:'running'},
      {kind:'workflow_run',bindingId:'authored-instruments',ownerId:'instrument-owner',targetId:'local',status:'running'},
      {kind:'workflow_run',bindingId:'authored-instruments',ownerId:'old-owner',targetId:'local',status:'canceled'},
      {kind:'workflow_run',bindingId:'algorithm',ownerId:'algorithm-owner',targetId:'local',status:'running'},
      {kind:'workflow_run',bindingId:'authored-instruments',ownerId:'foreign-owner',targetId:'remote',status:'running'},
    ]} as ExperimentSessionView;
    expect(robotInstrumentSessionRunIds(dashboards,session)).toEqual(['instrument-owner']);
    expect(robotInstrumentSessionRunIds(dashboards,{...session,members:session.members.filter(member => member.kind !== 'workflow_run')})).toEqual(['opening-root','command-root']);
    expect(robotInstrumentSessionRunIds([],session)).toEqual([]);
    expect(robotInstrumentSessionRunIds(dashboards,{...session,session:{...session.session,state:'stopping'}})).toEqual([]);
    expect(robotInstrumentSessionRunIds(dashboards,undefined)).toEqual([]);
  });

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
    details['slot-scout-01']={
      invocations:[],nodeSummaries:[],loading:false,error:'',
      run:{ id:'slot-scout-01',status:'stopping',revision:4 } as never,
    };
    expect(liveInstrumentSlotStops(details,['panel-run'],new Set(['scout-01'])))
      .toEqual([{ itemKey:'scout-01',child:{ ...child,runStatus:'stopping' } }]);
    details['slot-scout-01'].run!.status='stopped';
    expect(liveInstrumentSlotStops(details,['panel-run'],new Set(['scout-01']))).toEqual([]);
    details['slot-scout-01'].run!.revision=2;
    expect(liveInstrumentSlotStops(details,['panel-run'],new Set(['scout-01'])))
      .toEqual([{ itemKey:'scout-01',child }]);
  });

  it('lists live slots for Unplug and leaves observers running so Plug can reuse Adapter',() => {
    const slot = {
      childRunId:'slot-scout-01',runStatus:'waiting',runRevision:3,
    } as AutomationChildRunRelation;
    const observer = {
      childRunId:'observer-scout-01',runStatus:'waiting',runRevision:2,
    } as AutomationChildRunRelation;
    const details:Record<string,AutomationRunDetail>={
      'panel-run':{
        invocations:[],nodeSummaries:[],loading:false,error:'',
        relations:{
          runId:'panel-run',
          childRunGroups:[
            { id:'slots',producerNodeId:'robot-slots' } as never,
            { id:'observers',producerNodeId:'robot-observers' } as never,
          ],
          childRunGroupMembers:[
            { groupId:'slots',itemKey:'scout-01',childRunId:'slot-scout-01',state:'dispatched' } as never,
            { groupId:'observers',itemKey:'scout-01',childRunId:'observer-scout-01',state:'dispatched' } as never,
            { groupId:'observers',itemKey:'scout-02',childRunId:'observer-scout-02',state:'dispatched' } as never,
          ],
          childRuns:[
            slot,
            observer,
            { childRunId:'observer-scout-02',runStatus:'waiting',runRevision:1 } as never,
          ],
          waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
        },
      },
    };
    expect(liveInstrumentSlotStops(
      details,['panel-run'],new Set(['scout-01']),
    )).toEqual([{ itemKey:'scout-01',child:slot }]);
    expect(liveInstrumentRobotStops(
      details,['panel-run'],new Set(['scout-01']),
    )).toEqual([{ itemKey:'scout-01',child:slot }]);
    expect(liveInstrumentRobotStops(
      details,['panel-run'],new Set(['scout-01']),new Set(),
      ['robot-slots','robot-observers'],
    )).toEqual([
      { itemKey:'scout-01',child:slot },
      { itemKey:'scout-01',child:observer },
    ]);
    expect(liveInstrumentSlotStops(
      details,['panel-run'],new Set(['scout-02']),
    )).toEqual([]);
  });
});
