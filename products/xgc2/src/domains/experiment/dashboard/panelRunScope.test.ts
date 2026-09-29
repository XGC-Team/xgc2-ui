import { describe,expect,it } from 'vitest';
import { workflowRuntimeDatasources } from '../../../shared/workflowRuntimeProtocol';
import type {
  AutomationExecutionRelations,
  AutomationRunDetail,
  AutomationRunSummaryView,
} from '../../automation/automationPublic';
import type { ExperimentDocument,PanelInstance } from '../experimentModel';
import type { ExperimentSessionView } from '../experimentWorkflowModel';
import type { DashboardRunSnapshot,PanelAutomationRuntime } from './dashboardRunStore';
import {
  createPanelRunScopeCache,
  panelRunOwners,
  panelRunScopeApplies,
  scopePanelRunRuntimes,
  snapshotPanelRunOwners,
} from './panelRunScope';

const now = '2026-01-01T00:00:00Z';

function panel(id:string,workflowInstanceId?:string):PanelInstance {
  return {
    id,pluginId:'probe',title:id,gridPos:{ x:0,y:0,w:4,h:4 },query:{},options:{},fieldConfig:{},
    portBindings:workflowInstanceId ? [{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId,presetId:'run',
      managed:true,relation:'supervised',failurePolicy:'keep-experiment',
    }] : [],
  };
}

function run(id:string,extra:Partial<AutomationRunSummaryView> = {}):AutomationRunSummaryView {
  return {
    id,targetId:'local',automationResourceId:'worker',actionId:'run',actionVersion:1,sourceKind:'automation',
    sourceRef:{ domain:'automation',resourceId:'worker',branch:'main',commitId:'c',version:1,digest:'e'.repeat(64) },
    status:'running',revision:1,rootRunId:'full-root',createdAt:now,updatedAt:now,...extra,
  };
}

function detail(id:string,relations?:Partial<AutomationExecutionRelations>):AutomationRunDetail {
  return {
    run:{ ...run(id),definitionId:'worker',definitionVersion:1 } as unknown as AutomationRunDetail['run'],
    invocations:[],nodeSummaries:[],loading:false,error:'',
    ...(relations ? { relations:{
      runId:id,childRuns:[],childRunGroups:[],childRunGroupMembers:[],waits:[],effects:[],
      runtimeGroups:[],runtimes:[],resources:[],...relations,
    } } : {}),
  };
}

function childRelation(parentRunId:string,childRunId:string) {
  return {
    id:`rel-${childRunId}`,targetId:'local',rootRunId:'full-root',parentRunId,parentInvocationId:'invoke',
    callNodeId:'call',ordinal:0,childRunId,ownerRunId:parentRunId,childDefinitionId:'slot',
    childDefinitionVersion:1,childConfigDigest:'a',childExecutionPlanDigest:'b',childRegistryDigest:'c',
    childDefinitionDigest:'d',triggerNodeId:'trigger',relation:'supervised',waitPolicy:'wait',cancelPolicy:'cascade',
    resultPolicy:'propagate',createdAt:now,updatedAt:now,boundAt:now,runStatus:'running',runRevision:1,revision:1,
  } as AutomationExecutionRelations['childRuns'][number];
}

/** The Runner's full-Run relations: one `run-panels` member per Panel workflow instance. */
function fullRunRelations(items:Record<string,string>):AutomationExecutionRelations {
  return {
    runId:'full-root',
    childRuns:Object.values(items).map((childRunId) => childRelation('full-root',childRunId)),
    childRunGroups:[{
      id:'group-panels',targetId:'local',rootRunId:'full-root',parentRunId:'full-root',producerInvocationId:'invoke',
      producerNodeId:'run-panels',groupKey:'panels',expectedMembers:1,memberCount:1,waitPolicy:'join-later',
      joinMode:'join-all',failurePolicy:'collect-errors',remainingPolicy:'retain',resultPolicy:'reference',
      maxConcurrency:0,state:'sealed',terminalCount:0,createdAt:now,updatedAt:now,revision:1,
    }] as AutomationExecutionRelations['childRunGroups'],
    childRunGroupMembers:Object.entries(items).map(([itemKey,childRunId],ordinal) => ({
      id:`member-${itemKey}`,groupId:'group-panels',ordinal,itemKey,childRunId,state:'dispatched',
      createdAt:now,updatedAt:now,revision:1,
    })) as AutomationExecutionRelations['childRunGroupMembers'],
    waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
  };
}

// Workspace state other than Runs keeps its references between Run snapshots.
const DOCUMENTS:never[] = [];
const CATALOG:never[] = [];

function runtime(runSummaries:AutomationRunSummaryView[],runDetailsById:Record<string,AutomationRunDetail> = {}) {
  return {
    targetId:'local',documents:DOCUMENTS,catalog:CATALOG,runSummaries,runDetailsById,loading:false,error:'',
  } as unknown as PanelAutomationRuntime;
}

const PANELS = [panel('instruments','panel-robot-instruments'),panel('lichtblick','panel-lichtblick'),panel('activity')];
const EXPERIMENT = { spec:{ dashboards:[{ panels:PANELS }] } } as unknown as ExperimentDocument;
const INSTRUMENTS_RELATIONS = fullRunRelations({ 'panel-robot-instruments':'child-instruments' });
const LIFECYCLE = { activeRuns:[],sessionViews:[],runDetailsById:{} };

/** A published Run snapshot over one target runtime; lifecycle state is unchanged between snapshots. */
function snapshot(source:PanelAutomationRuntime) {
  return {
    actions:LIFECYCLE,
    fullRunRelations:{ relations:INSTRUMENTS_RELATIONS },
    automation:source,localAutomation:source,runtimes:new Map([['local',source]]),
  } as unknown as DashboardRunSnapshot;
}

describe('panel Run ownership',() => {
  it('keeps one owners map while Runs only change state',() => {
    const experiment = { ...EXPERIMENT } as ExperimentDocument;
    const child = run('child-instruments',{ parentRunId:'full-root' });
    const links = () => detail('child-instruments',{ childRuns:[childRelation('child-instruments','slot-1')] });
    const first = snapshotPanelRunOwners(snapshot(runtime(
      [child,run('slot-1',{ parentRunId:'child-instruments' })],{ 'child-instruments':links() },
    )),experiment);
    expect(first.get('slot-1')).toEqual(['instruments']);
    // The slot and the child's ledger advance; parents and child links are the same.
    const moved = snapshot(runtime(
      [child,run('slot-1',{ parentRunId:'child-instruments',revision:2 })],{ 'child-instruments':links() },
    ));
    expect(snapshotPanelRunOwners(moved,experiment)).toBe(first);
    // A new slot Run: a new owners map that attributes it.
    const grown = snapshotPanelRunOwners(snapshot(runtime(
      [run('slot-2',{ parentRunId:'child-instruments' }),...moved.automation.runSummaries],
      moved.automation.runDetailsById,
    )),experiment);
    expect(grown).not.toBe(first);
    expect(grown.get('slot-2')).toEqual(['instruments']);
  });

  it('attributes a Run again when its parent or its parent\'s child links change in place',() => {
    const experiment = { ...EXPERIMENT } as ExperimentDocument;
    const child = run('child-instruments',{ parentRunId:'full-root' });
    const orphan = run('slot-3',{ rootRunId:'full-root' });
    const before = snapshotPanelRunOwners(snapshot(runtime([child,orphan])),experiment);
    expect(before.has('slot-3')).toBe(false);
    const adopted = snapshotPanelRunOwners(snapshot(runtime([
      child,run('slot-3',{ rootRunId:'full-root',parentRunId:'child-instruments' }),
    ])),experiment);
    expect(adopted.get('slot-3')).toEqual(['instruments']);
    // A slot known only from the child's relation ledger.
    const ledger = (childRunIds:string[]) => detail('child-instruments',{
      childRuns:childRunIds.map((childRunId) => childRelation('child-instruments',childRunId)),
    });
    const listed = snapshotPanelRunOwners(snapshot(runtime([child,orphan],{ 'child-instruments':ledger([]) })),experiment);
    expect(listed.has('slot-3')).toBe(false);
    const linked = snapshotPanelRunOwners(snapshot(runtime([child,orphan],{ 'child-instruments':ledger(['slot-3']) })),experiment);
    expect(linked.get('slot-3')).toEqual(['instruments']);
  });

  it('assigns Panel roots, full-Run workflow children, Session members and their descendants',() => {
    const standalone = run('standalone-root',{ parentRunId:undefined,rootRunId:'standalone-root',
      panelAction:{ panelId:'lichtblick' } as AutomationRunSummaryView['panelAction'] });
    const owners = panelRunOwners({
      panels:PANELS,
      activeRuns:[{ id:'panel-root',panelId:'lichtblick',rootRunId:'panel-root' } as never],
      sessionViews:[{ session:{} as ExperimentSessionView['session'],members:[{
        kind:'workflow_run',bindingId:'panel-lichtblick',ownerId:'member-owner',
      } as ExperimentSessionView['members'][number]] }],
      fullRunRelations:fullRunRelations({ 'panel-robot-instruments':'child-instruments','xgc-world-services':'child-world' }),
      observations:[runtime([
        run('full-root',{ rootRunId:'full-root' }),
        run('child-instruments',{ parentRunId:'full-root' }),
        run('child-world',{ parentRunId:'full-root' }),
        run('panel-root',{ rootRunId:'panel-root' }),
        run('panel-root-child',{ parentRunId:'panel-root',rootRunId:'panel-root' }),
        standalone,
        run('history',{ rootRunId:'history' }),
      ],{
        'child-instruments':detail('child-instruments',{ childRuns:[childRelation('child-instruments','slot-1')] }),
        'slot-1':detail('slot-1',{ childRuns:[childRelation('slot-1','slot-1-observer')] }),
      })],
    });
    expect(owners.get('child-instruments')).toEqual(['instruments']);
    expect(owners.get('slot-1')).toEqual(['instruments']);
    expect(owners.get('slot-1-observer')).toEqual(['instruments']);
    expect(owners.get('panel-root')).toEqual(['lichtblick']);
    expect(owners.get('panel-root-child')).toEqual(['lichtblick']);
    expect(owners.get('standalone-root')).toEqual(['lichtblick']);
    expect(owners.get('member-owner')).toEqual(['lichtblick']);
    // The Runner root, System workflows and history belong to no Panel.
    expect(owners.has('full-root')).toBe(false);
    expect(owners.has('child-world')).toBe(false);
    expect(owners.has('history')).toBe(false);
  });

  it('leaves Runs naming a Panel outside the Experiment unowned',() => {
    const owners = panelRunOwners({
      panels:PANELS,activeRuns:[],sessionViews:[],
      observations:[runtime([run('foreign-root',{ rootRunId:'foreign-root',experimentSelector:{ runMode:'simulation',panelId:'elsewhere' } })])],
    });
    expect(owners.size).toBe(0);
  });

  it('shares a workflow instance bound by two Panels',() => {
    const owners = panelRunOwners({
      panels:[panel('grid-a','panel-robot-instruments'),panel('grid-b','panel-robot-instruments')],
      activeRuns:[],sessionViews:[],
      fullRunRelations:fullRunRelations({ 'panel-robot-instruments':'child-instruments' }),
      observations:[runtime([run('child-instruments',{ parentRunId:'full-root' })])],
    });
    expect(owners.get('child-instruments')).toEqual(['grid-a','grid-b']);
  });
});

describe('panel Run scope',() => {
  const owners = new Map([['slot-1',['instruments']],['slot-2',['instruments']],['child-instruments',['instruments']]]);

  it('hides only Runs that belong exclusively to other Panels',() => {
    const history = run('history',{ rootRunId:'history' });
    const slot = run('slot-1',{ parentRunId:'child-instruments' });
    const source = runtime([history,slot],{ 'slot-1':detail('slot-1'),history:detail('history') });
    const lichtblick = scopePanelRunRuntimes(createPanelRunScopeCache(),source,new Map([['local',source]]),owners,'lichtblick');
    expect(lichtblick.automation.runSummaries).toEqual([history]);
    expect(Object.keys(lichtblick.automation.runDetailsById)).toEqual(['history']);
    const instruments = scopePanelRunRuntimes(createPanelRunScopeCache(),source,new Map([['local',source]]),owners,'instruments');
    expect(instruments.automation.runSummaries).toEqual([history,slot]);
    expect(instruments.runtimes.get('local')).toBe(instruments.automation);
  });

  it('keeps the scoped view identical across snapshots until a visible Run changes',() => {
    const cache = createPanelRunScopeCache();
    const history = run('history',{ rootRunId:'history' });
    const first = runtime([history,run('slot-1',{ parentRunId:'child-instruments' })]);
    const scoped = scopePanelRunRuntimes(cache,first,new Map([['local',first]]),owners,'lichtblick');
    // Another Panel's slot advances: a new target snapshot, same visible Runs.
    const second = runtime([history,run('slot-1',{ parentRunId:'child-instruments',revision:2 })]);
    const unchanged = scopePanelRunRuntimes(cache,second,new Map([['local',second]]),new Map(owners),'lichtblick');
    expect(unchanged.automation).toBe(scoped.automation);
    expect(unchanged.runtimes).toBe(scoped.runtimes);
    // A Run it can see changes: a new view.
    const third = runtime([history,run('history-2',{ rootRunId:'history-2' })]);
    const changed = scopePanelRunRuntimes(cache,third,new Map([['local',third]]),owners,'lichtblick');
    expect(changed.automation).not.toBe(scoped.automation);
    expect(changed.automation.runSummaries.map((item) => item.id)).toEqual(['history','history-2']);
  });

  it('keeps the view while only other Panels\' Runs are replaced, inserted or removed',() => {
    const cache = createPanelRunScopeCache();
    const history = run('history',{ rootRunId:'history' });
    const historyDetail = detail('history');
    const view = (source:PanelAutomationRuntime) => scopePanelRunRuntimes(
      cache,source,new Map([['local',source]]),owners,'lichtblick',
    ).automation;
    const first = view(runtime([run('slot-1',{ parentRunId:'child-instruments' }),history],{
      'slot-1':detail('slot-1'),history:historyDetail,
    }));
    const replaced = runtime([run('slot-1',{ parentRunId:'child-instruments',revision:2 }),history],{
      'slot-1':detail('slot-1'),history:historyDetail,
    });
    expect(view(replaced)).toBe(first);
    const inserted = runtime([run('slot-2',{ parentRunId:'child-instruments' }),...replaced.runSummaries],{
      ...replaced.runDetailsById,'slot-2':detail('slot-2'),
    });
    expect(view(inserted)).toBe(first);
    expect(view(runtime([history],{ history:historyDetail }))).toBe(first);
    // A Run the Panel sees is inserted, then replaced: new views.
    const own = run('history-2',{ rootRunId:'history-2' });
    const withOwn = view(runtime([own,history],{ history:historyDetail }));
    expect(withOwn).not.toBe(first);
    expect(withOwn.runSummaries).toEqual([own,history]);
    const ownReplaced = run('history-2',{ rootRunId:'history-2',revision:2 });
    expect(view(runtime([ownReplaced,history],{ history:historyDetail })).runSummaries).toEqual([ownReplaced,history]);
  });

  it('swaps a replaced Run into the view of the Panel that sees it',() => {
    const cache = createPanelRunScopeCache();
    const scopeOwners = new Map([['slot-1',['instruments']],['lichtblick-child',['lichtblick']]]);
    const view = (source:PanelAutomationRuntime) => scopePanelRunRuntimes(
      cache,source,new Map([['local',source]]),scopeOwners,'instruments',
    ).automation;
    const history = run('history',{ rootRunId:'history' });
    const lichtblick = run('lichtblick-child',{ parentRunId:'full-root' });
    const lichtblickDetail = detail('lichtblick-child');
    const first = view(runtime([run('slot-1',{ parentRunId:'child-instruments' }),history,lichtblick],{
      'slot-1':detail('slot-1'),'lichtblick-child':lichtblickDetail,
    }));
    expect(first.runSummaries.map((item) => item.id)).toEqual(['slot-1','history']);
    const slot = run('slot-1',{ parentRunId:'child-instruments',revision:2 });
    const slotDetail = detail('slot-1');
    const next = view(runtime([slot,history,lichtblick],{ 'slot-1':slotDetail,'lichtblick-child':lichtblickDetail }));
    expect(next).not.toBe(first);
    expect(next.runSummaries).toEqual([slot,history]);
    expect(next.runSummaries[0]).toBe(slot);
    expect(next.runDetailsById).toEqual({ 'slot-1':slotDetail });
    expect(next.runDetailsById['slot-1']).toBe(slotDetail);
  });

  it('follows a Run that becomes another Panel\'s through the snapshot owners',() => {
    const experiment = { ...EXPERIMENT } as ExperimentDocument;
    const cache = createPanelRunScopeCache();
    const view = (next:DashboardRunSnapshot) => scopePanelRunRuntimes(
      cache,next.automation,next.runtimes,snapshotPanelRunOwners(next,experiment),'lichtblick',
    ).automation;
    const child = run('child-instruments',{ parentRunId:'full-root' });
    // The slot's parent is not known yet: no Panel owns it, every Panel sees it.
    const slot = run('slot-9',{ rootRunId:'full-root' });
    const unowned = view(snapshot(runtime([child,slot])));
    expect(unowned.runSummaries).toEqual([slot]);
    // The instruments child's relations now name the slot: it leaves this view.
    const childDetail = detail('child-instruments',{ childRuns:[childRelation('child-instruments','slot-9')] });
    const attached = view(snapshot(runtime([child,slot],{ 'child-instruments':childDetail })));
    expect(attached.runSummaries).toEqual([]);
    // Later slot updates keep the view.
    const moved = run('slot-9',{ rootRunId:'full-root',revision:2 });
    expect(view(snapshot(runtime([child,moved],{ 'child-instruments':childDetail })))).toBe(attached);
  });

  it('does not scope Panels that browse target-wide workflow history',() => {
    const plugin = (contract:string) => ({ dataPorts:[{ id:'data',label:'Data',contract }] }) as never;
    expect(panelRunScopeApplies(plugin('experiment.runtime.v1'))).toBe(true);
    expect(panelRunScopeApplies({ dataPorts:[] } as never)).toBe(true);
    expect(panelRunScopeApplies(plugin(workflowRuntimeDatasources.run))).toBe(false);
    expect(panelRunScopeApplies(plugin(workflowRuntimeDatasources.runLogs))).toBe(false);
    expect(panelRunScopeApplies(plugin('camera.video.v1'))).toBe(false);
  });
});
