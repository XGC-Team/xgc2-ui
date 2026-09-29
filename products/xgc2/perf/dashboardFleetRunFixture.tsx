/**
 * Robot fleet on top of the dashboard Run fixture: the Robot instruments
 * Panel workflow child owns one robot-slot and one robot-observer child Run
 * per robot (instrument slot / observer producer groups), as a connected
 * N-robot Experiment does. Run events on those children are what a fleet
 * connect, disconnect or stop streams to the dashboard, one per transition.
 */
import type {
  AutomationChildRunRelation,
  AutomationExecutionRelations,
  AutomationRunDetail,
  AutomationRunSummaryView,
} from '../src/domains/automation/automationPublic';
import {
  INSTRUMENT_OBSERVER_PRODUCER_NODE_ID,
  INSTRUMENT_SLOT_PRODUCER_NODE_ID,
} from '../src/domains/experiment/dashboard/robotInstrumentConnectionSelection';
import {
  childRun,
  createRunProjectionCache,
  initialRunState,
  PANEL_SPECS,
  ROOT_ID,
  type BenchRunState,
  type PanelSpec,
} from './dashboardRunEventFixture';

type RunStatus = AutomationRunSummaryView['status'];
type AutomationChildRunGroup = AutomationExecutionRelations['childRunGroups'][number];
type SlotKind = 'slot' | 'observer';

export const INSTRUMENTS_CHILD_ID = 'child-w-instruments';

/** GCS Panels with the instruments Panel as the real selection-scoped plugin id. */
export const FLEET_PANEL_SPECS:readonly PanelSpec[] = PANEL_SPECS.map((spec) => (
  spec.id === 'instruments'
    ? { ...spec,pluginId:'robot-instruments-grid',actions:['robot-simulation'] }
    : spec
));

export function fleetRobotIds(count:number) {
  return Array.from({ length:count },(_,index) => `robot-${String(index + 1).padStart(3,'0')}`);
}

export type FleetRunState = {
  base:BenchRunState;
  slots:Record<string,{ status:RunStatus;revision:number }>;
};

function slotRunId(kind:SlotKind,robotId:string) {
  return `${kind}-${robotId}`;
}

export function initialFleetRunState(robotIds:readonly string[]):FleetRunState {
  const base = initialRunState();
  return {
    base:{
      ...base,
      children:Object.fromEntries(Object.entries(base.children).map(([workflow,child]) => [
        workflow,{ ...child,status:'running' as const,revision:2 },
      ])),
    },
    slots:Object.fromEntries(robotIds.flatMap((robotId) => (['slot','observer'] as const).map((kind) => [
      slotRunId(kind,robotId),{ status:'running' as const,revision:2 },
    ]))),
  };
}

/** One slot child Run moves (status or revision): a single fleet Run event. */
export function advanceSlot(state:FleetRunState,robotId:string,kind:SlotKind,status:RunStatus):FleetRunState {
  const id = slotRunId(kind,robotId);
  const current = state.slots[id]!;
  return { ...state,slots:{ ...state.slots,[id]:{ status,revision:current.revision + 1 } } };
}

function slotSummary(kind:SlotKind,robotId:string,status:RunStatus,revision:number):AutomationRunSummaryView {
  const id = slotRunId(kind,robotId);
  return {
    id,targetId:'local',automationResourceId:kind === 'slot' ? 'robot-slot' : 'robot-observer',actionId:'run',
    actionVersion:1,sourceKind:'automation',
    sourceRef:{ domain:'automation',resourceId:kind === 'slot' ? 'robot-slot' : 'robot-observer',branch:'main',commitId:'commit-1',version:1,digest:'e'.repeat(64) },
    status,revision,parentRunId:INSTRUMENTS_CHILD_ID,rootRunId:ROOT_ID,
    createdAt:'2026-01-01T00:00:01Z',updatedAt:`2026-01-01T00:01:${String(revision % 60).padStart(2,'0')}Z`,
  };
}

function slotRelation(kind:SlotKind,robotId:string,ordinal:number,status:RunStatus,revision:number):AutomationChildRunRelation {
  const id = slotRunId(kind,robotId);
  return {
    id:`rel-${id}`,targetId:'local',rootRunId:ROOT_ID,parentRunId:INSTRUMENTS_CHILD_ID,
    parentInvocationId:`invoke-${kind}s`,callNodeId:`robot-${kind}s`,ordinal,childRunId:id,ownerRunId:INSTRUMENTS_CHILD_ID,
    childDefinitionId:`robot-${kind}`,childDefinitionVersion:1,childConfigDigest:'a'.repeat(64),
    childExecutionPlanDigest:'b'.repeat(64),childRegistryDigest:'c'.repeat(64),childDefinitionDigest:'d'.repeat(64),
    triggerNodeId:'trigger',relation:'supervised',waitPolicy:'wait',cancelPolicy:'cascade',resultPolicy:'propagate',
    createdAt:'t',updatedAt:'t',boundAt:'t',runStatus:status,runRevision:revision,revision,
  };
}

function slotGroup(kind:SlotKind,count:number):AutomationChildRunGroup {
  return {
    id:`group-${kind}s`,targetId:'local',rootRunId:ROOT_ID,parentRunId:INSTRUMENTS_CHILD_ID,
    producerInvocationId:`invoke-${kind}s`,
    producerNodeId:kind === 'slot' ? INSTRUMENT_SLOT_PRODUCER_NODE_ID : INSTRUMENT_OBSERVER_PRODUCER_NODE_ID,
    groupKey:`robot-${kind}s`,expectedMembers:count,memberCount:count,waitPolicy:'join-later',joinMode:'join-all',
    failurePolicy:'collect-errors',remainingPolicy:'retain',resultPolicy:'reference',maxConcurrency:0,state:'sealed',
    terminalCount:0,createdAt:'t',updatedAt:'t',revision:1,
  };
}

/**
 * Immutable projections with reference reuse for unchanged rows, like the
 * real merges: only a moved slot gets a new summary, relation and detail.
 */
export function createFleetRunProjectionCache(robotIds:readonly string[]) {
  const base = createRunProjectionCache();
  const summaries = new Map<string,AutomationRunSummaryView>();
  const relations = new Map<string,AutomationChildRunRelation>();
  const details = new Map<string,AutomationRunDetail>();
  let relationSet:{ key:string;value:AutomationExecutionRelations } | undefined;
  let instrumentsDetail:{ base:AutomationRunDetail;relations:AutomationExecutionRelations;value:AutomationRunDetail } | undefined;
  const groups = [slotGroup('slot',robotIds.length),slotGroup('observer',robotIds.length)];
  const members = robotIds.flatMap((robotId,ordinal) => (['slot','observer'] as const).map((kind) => ({
    id:`member-${slotRunId(kind,robotId)}`,groupId:`group-${kind}s`,ordinal,itemKey:robotId,
    childRunId:slotRunId(kind,robotId),state:'dispatched' as const,createdAt:'t',updatedAt:'t',revision:1,
  })));
  return (state:FleetRunState) => {
    const projection = base(state.base);
    const slotRows = robotIds.flatMap((robotId,ordinal) => (['slot','observer'] as const).map((kind) => {
      const id = slotRunId(kind,robotId);
      const slot = state.slots[id]!;
      const key = `${id}:${slot.revision}`;
      let summary = summaries.get(id);
      if (!summary || summary.revision !== slot.revision) {
        summary = slotSummary(kind,robotId,slot.status,slot.revision);
        summaries.set(id,summary);
      }
      let relation = relations.get(id);
      if (!relation || relation.runRevision !== slot.revision) {
        relation = slotRelation(kind,robotId,ordinal,slot.status,slot.revision);
        relations.set(id,relation);
      }
      let detail = details.get(key);
      if (!detail) {
        detail = { run:childRun(summary),invocations:[],nodeSummaries:[],loading:false,error:'' };
        details.set(key,detail);
      }
      return { id,summary,relation,detail };
    }));
    const relationKey = slotRows.map((row) => row.relation.runRevision).join(',');
    if (!relationSet || relationSet.key !== relationKey) {
      relationSet = { key:relationKey,value:{
        runId:INSTRUMENTS_CHILD_ID,
        childRuns:slotRows.map((row) => row.relation),
        childRunGroups:groups,
        childRunGroupMembers:members,
        waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
      } };
    }
    const baseInstruments = projection.runDetailsById[INSTRUMENTS_CHILD_ID]!;
    if (!instrumentsDetail || instrumentsDetail.base !== baseInstruments || instrumentsDetail.relations !== relationSet.value) {
      instrumentsDetail = {
        base:baseInstruments,relations:relationSet.value,value:{ ...baseInstruments,relations:relationSet.value },
      };
    }
    return {
      root:projection.root,
      runSummaries:[...projection.runSummaries,...slotRows.map((row) => row.summary)],
      runDetailsById:{
        ...projection.runDetailsById,
        [INSTRUMENTS_CHILD_ID]:instrumentsDetail.value,
        ...Object.fromEntries(slotRows.map((row) => [row.id,row.detail])),
      } as Record<string,AutomationRunDetail>,
    };
  };
}
