/**
 * Synthetic but protocol-shaped Experiment dashboard for render-cascade
 * measurement. Plugins mirror the real port shapes (process runtime, run logs,
 * many Action ports, no run ports) and count their own renders; the host path
 * (canvas, frame, header control, createPanelContext) is the production code.
 */
import { useMemo } from 'react';
import {
  newAutomationNode,
  newAutomationSpec,
  type AutomationAction,
  type AutomationChildRunRelation,
  type AutomationDocument,
  type AutomationRun,
  type AutomationRunDetail,
  type AutomationRunSummaryView,
} from '../src/domains/automation/automationPublic';
import {
  EXPERIMENT_PROCESS_RUNTIME_DATASOURCE,
  experimentOwnedProcessInstances,
  experimentProcessRuntimeProjection,
  SYSTEM_EXPERIMENT_RUNNER,
  type ExperimentRunView,
} from '../src/domains/experiment/experimentPublic';
import { newExperimentSpec,panelFromEditor,type ExperimentDocument,type PanelInstance } from '../src/domains/experiment/experimentModel';
import type { StationExperimentOccupancy } from '../src/domains/experiment/useExperimentListRunningIds';
import { definePanelPlugin,type AnyPanelPluginDefinition,type AutomationPanelContext,type PanelPluginProps } from '../src/panels/types';
import { workflowRuntimeDatasources } from '../src/shared/workflowRuntimeProtocol';

import { countRender } from './renderCounts';

export { countRender,renderCounts } from './renderCounts';

const CONTROL_ACTIONS = Array.from({ length:10 },(_,index) => `control-${index}`);
const STATIC_ROWS = Array.from({ length:60 },(_,index) => index);

function ProcessPanel({ panel,context }:PanelPluginProps) {
  countRender(`plugin:${panel.id}`);
  const runtime = experimentProcessRuntimeProjection(context.ports.data.runtime?.value);
  const owned = experimentOwnedProcessInstances(runtime);
  const action = context.ports.actions.service;
  return <section data-bench-panel={panel.id}>
    <p>{action?.activeInvocation?.status ?? 'idle'}</p>
    {owned.map((process) => <div key={process.id}>{process.definitionId}:{process.observedState}</div>)}
    {(runtime?.runSummaries ?? []).slice(0,20).map((run) => <div key={run.id}>{run.id}:{run.status}</div>)}
  </section>;
}

function ControlPanel({ panel,context }:PanelPluginProps) {
  countRender(`plugin:${panel.id}`);
  return <section data-bench-panel={panel.id}>
    {Object.values(context.ports.actions).map((port) => (
      <button key={port.id} type="button" disabled={Boolean(port.disabledReason)}>
        {port.label}:{port.activeInvocation?.status ?? port.latestInvocation?.status ?? 'idle'}
      </button>
    ))}
  </section>;
}

function StaticPanel({ panel }:PanelPluginProps) {
  countRender(`plugin:${panel.id}`);
  // Stands in for a heavy subtree (chat timeline, catalog) that never reads Runs.
  const rows = useMemo(() => STATIC_ROWS.map((row) => `row-${row}`),[]);
  return <section data-bench-panel={panel.id}>{rows.map((row) => <div key={row}>{row}</div>)}</section>;
}

/** Stands in for the Robot instruments grid: the dashboard host treats it as the
 * selection-scoped instrument Panel (pluginId), and it reads the runtime port. */
function RobotInstrumentsBenchPanel({ panel,context }:PanelPluginProps) {
  countRender(`plugin:${panel.id}`);
  const runtime = experimentProcessRuntimeProjection(context.ports.data['robot-runtime']?.value);
  return <section data-bench-panel={panel.id}>
    <p>{context.ports.actions['robot-simulation']?.activeInvocation?.status ?? 'idle'}</p>
    {(runtime?.sessionViews ?? []).map((view) => <div key={view.session.id}>{view.session.state}</div>)}
  </section>;
}

function LogsPanel({ panel,context }:PanelPluginProps) {
  countRender(`plugin:${panel.id}`);
  const value = context.ports.data.traces?.value as { runSummaries?:AutomationRunSummaryView[] } | undefined;
  return <section data-bench-panel={panel.id}>{(value?.runSummaries ?? []).slice(0,30).map((run) => (
    <div key={run.id}>{run.id}:{run.status}</div>
  ))}</section>;
}

export const benchPlugins:ReadonlyMap<string,AnyPanelPluginDefinition> = new Map<string,AnyPanelPluginDefinition>([
  ['bench-process',definePanelPlugin({
    id:'bench-process',name:'Process',category:'Custom',description:'',capabilities:['experiment'] as const,
    executionTargetPolicy:'local',
    actionPorts:[{ id:'service',label:'Service',actionKinds:['service'] }],
    dataPorts:[{ id:'runtime',label:'Runtime',contract:EXPERIMENT_PROCESS_RUNTIME_DATASOURCE }],
    component:ProcessPanel,
  })],
  ['bench-control',definePanelPlugin({
    id:'bench-control',name:'Control',category:'Control',description:'',capabilities:['experiment'] as const,
    executionTargetPolicy:'local',
    actionPorts:CONTROL_ACTIONS.map((id) => ({ id,label:id })),
    dataPorts:[{ id:'robots',label:'Robots',contract:'experiment.robots.v1' }],
    component:ControlPanel,
  })],
  ['bench-static',definePanelPlugin({
    id:'bench-static',name:'Static',category:'Operations',description:'',capabilities:['visualization'] as const,
    executionTargetPolicy:'dashboard',
    dataPorts:[{ id:'activity',label:'Activity',contract:'ground-station.interactions.v1' }],
    panelWorkflowControls:'hidden',
    component:StaticPanel,
  })],
  ['robot-instruments-grid',definePanelPlugin({
    id:'robot-instruments-grid',name:'Robot instruments grid',category:'Swarm',description:'',
    capabilities:['visualization','experiment','automation'] as const,
    executionTargetPolicy:'local',
    sharedStateScope:'experiment',
    actionPorts:[{ id:'robot-simulation',label:'Robot simulation',actionKinds:['service'] }],
    dataPorts:[
      { id:'robots',label:'Robots',contract:'experiment.robots.v1' },
      { id:'robot-runtime',label:'Runtime',contract:EXPERIMENT_PROCESS_RUNTIME_DATASOURCE },
    ],
    component:RobotInstrumentsBenchPanel,
  })],
  ['bench-logs',definePanelPlugin({
    id:'bench-logs',name:'Logs',category:'Log',description:'',capabilities:['automation'] as const,
    executionTargetPolicy:'local',
    dataPorts:[{ id:'traces',label:'Traces',contract:workflowRuntimeDatasources.runLogs }],
    component:LogsPanel,
  })],
]);

export type PanelSpec = { id:string;pluginId:string;workflow?:string;actions?:readonly string[] };

export const HIDDEN_PANEL_SPECS:readonly PanelSpec[] = [
  { id:'ros-services',pluginId:'bench-process',workflow:'w-ros',actions:['service'] },
  { id:'algo-activity',pluginId:'bench-static' },
];

export const PANEL_SPECS:readonly PanelSpec[] = [
  { id:'instruments',pluginId:'bench-process',workflow:'w-instruments',actions:['service'] },
  { id:'lichtblick',pluginId:'bench-process',workflow:'w-lichtblick',actions:['service'] },
  { id:'world-camera',pluginId:'bench-process',workflow:'w-camera',actions:['service'] },
  { id:'control',pluginId:'bench-control',workflow:'w-control',actions:CONTROL_ACTIONS },
  { id:'activity',pluginId:'bench-static' },
  { id:'logs',pluginId:'bench-logs',workflow:'w-logs' },
];

const WORKFLOWS = ['w-instruments','w-lichtblick','w-camera','w-control','w-logs','w-ros'];
export const EXPERIMENT_ID = 'bench-experiment';
export const ROOT_ID = 'full-root';

function head(domain:string,resourceId:string) {
  return {
    domain,resourceId,name:resourceId,tags:[],mainCommitId:'commit-1',currentVersion:1,
    digest:'d'.repeat(64),revision:1,createdAt:'t',updatedAt:'t',
  };
}
function branch(domain:string,resourceId:string) {
  return { domain,resourceId,name:'main',headCommitId:'commit-1',headVersion:1,revision:1,createdAt:'t',updatedAt:'t' };
}

function action(id:string,entryNodeId:string,kind:AutomationAction['kind']):AutomationAction {
  return {
    id,version:1,label:id,entryNodeId,kind,inputSchema:{ fields:[] },resultSchema:{ fields:[] },
    controls:['stop'],admission:{},requiredCapabilities:[],projectionContracts:[],
  };
}

function automationDocument(resourceId:string,actionIds:readonly string[]):AutomationDocument {
  const spec = newAutomationSpec(resourceId);
  spec.nodes = actionIds.map((id) => ({ ...newAutomationNode('trigger.manual',{},id),id:`entry-${id}` }));
  spec.actions = actionIds.map((id) => action(id,`entry-${id}`,id==='service' || id==='run' ? 'service' : 'command'));
  return { head:head('automation',resourceId),branch:branch('automation',resourceId),spec };
}

export function benchDocuments(specs:readonly PanelSpec[] = [...PANEL_SPECS,...HIDDEN_PANEL_SPECS]):AutomationDocument[] {
  return WORKFLOWS.map((workflow) => {
    const spec = specs.find((candidate) => candidate.workflow===workflow);
    return automationDocument(workflow,['run',...(spec?.actions ?? [])]);
  });
}

export function benchExperiment(
  panels:readonly PanelSpec[] = PANEL_SPECS,
  hidden:readonly PanelSpec[] = HIDDEN_PANEL_SPECS,
):ExperimentDocument {
  const spec = newExperimentSpec({ name:'Bench',runModes:['simulation'] });
  spec.workflowInstances = WORKFLOWS.map((workflow) => {
    const panel = [...panels,...hidden].find((candidate) => candidate.workflow===workflow);
    return {
      id:workflow,ref:{ domain:'automation' as const,resourceId:workflow,branch:'main' },
      actionPresets:[{ id:'run',actionId:'run',inputs:{},parameterBindings:[] },
        ...(panel?.actions ?? []).map((id) => ({ id,actionId:id,inputs:{},parameterBindings:[] }))],
    };
  });
  spec.dashboards = [
    { id:'gcs',name:'GCS',description:'',panels:benchPanels(panels).map(panelFromEditor) },
    { id:'algo',name:'Algorithm',description:'',panels:benchPanels(hidden).map(panelFromEditor) },
  ];
  return { head:head('experiment',EXPERIMENT_ID),branch:branch('experiment',EXPERIMENT_ID),spec };
}

export function benchPanels(specs:readonly PanelSpec[] = PANEL_SPECS):PanelInstance[] {
  return specs.map((spec,index) => ({
    id:spec.id,pluginId:spec.pluginId,title:spec.id,gridPos:{ x:(index % 3) * 4,y:Math.floor(index / 3) * 5,w:4,h:5 },
    query:{},options:{},fieldConfig:{},
    portBindings:[
      ...(spec.workflow ? [{
        portId:'panel-workflow',kind:'workflow' as const,workflowInstanceId:spec.workflow,presetId:'run',
        managed:true,relation:'supervised' as const,failurePolicy:'keep-experiment' as const,
      }] : []),
      ...(spec.actions ?? []).map((id) => ({ portId:id,kind:'action' as const,presetId:id })),
      ...(spec.pluginId==='bench-process' ? [{ portId:'runtime',kind:'data' as const,projection:EXPERIMENT_PROCESS_RUNTIME_DATASOURCE }] : []),
      ...(spec.pluginId==='bench-control' ? [{ portId:'robots',kind:'data' as const,projection:'experiment.robots.v1' }] : []),
      ...(spec.pluginId==='bench-static' ? [{ portId:'activity',kind:'data' as const,projection:'ground-station.interactions.v1' }] : []),
      ...(spec.pluginId==='bench-logs' ? [{ portId:'traces',kind:'data' as const,projection:workflowRuntimeDatasources.runLogs }] : []),
      ...(spec.pluginId==='robot-instruments-grid' ? [
        { portId:'robots',kind:'data' as const,projection:'experiment.robots.v1' },
        { portId:'robot-runtime',kind:'data' as const,projection:EXPERIMENT_PROCESS_RUNTIME_DATASOURCE },
      ] : []),
    ],
  }));
}

const sourceRef = { domain:'experiment' as const,resourceId:EXPERIMENT_ID,branch:'main',commitId:'commit-1',version:1,digest:'d'.repeat(64) };

export function rootSummary(revision:number):AutomationRunSummaryView {
  return {
    id:ROOT_ID,targetId:'local',automationResourceId:SYSTEM_EXPERIMENT_RUNNER.resourceId,actionId:SYSTEM_EXPERIMENT_RUNNER.actions.run,
    actionVersion:1,sourceKind:'experiment',sourceRef,experimentSelector:{ runMode:'simulation' },
    status:'running',revision,rootRunId:ROOT_ID,createdAt:'2026-01-01T00:00:00Z',updatedAt:`2026-01-01T00:00:${String(revision).padStart(2,'0')}Z`,
  };
}

export function rootView(revision:number):ExperimentRunView {
  return {
    id:ROOT_ID,targetId:'local',experimentRef:{ domain:'experiment',resourceId:EXPERIMENT_ID,branch:'main' },
    automationResourceId:SYSTEM_EXPERIMENT_RUNNER.resourceId,actionId:SYSTEM_EXPERIMENT_RUNNER.actions.run,runMode:'simulation',
    status:'running',revision,rootRunId:ROOT_ID,createdAt:'t',updatedAt:'t',workflowTargets:[],
  };
}

export function childSummary(workflow:string,status:AutomationRunSummaryView['status'],revision:number):AutomationRunSummaryView {
  return {
    id:`child-${workflow}`,targetId:'local',automationResourceId:workflow,actionId:'run',actionVersion:1,
    sourceKind:'automation',sourceRef:{ domain:'automation',resourceId:workflow,branch:'main',commitId:'commit-1',version:1,digest:'e'.repeat(64) },
    status,revision,parentRunId:ROOT_ID,rootRunId:ROOT_ID,createdAt:'2026-01-01T00:00:01Z',updatedAt:`2026-01-01T00:00:${String(revision).padStart(2,'0')}Z`,
  };
}

export function childRun(summary:AutomationRunSummaryView):AutomationRun {
  return {
    ...summary,definitionId:summary.automationResourceId,definitionVersion:1,configDigest:'a'.repeat(64),
    executionPlanDigest:'b'.repeat(64),registryDigest:'c'.repeat(64),definitionDigest:'d'.repeat(64),
    executionModel:'orchestration-occurrence-v1',parameters:{},admissionMode:'parallel',admissionScope:'root',
    depth:1,correlationId:`correlation-${summary.id}`,acceptedAt:summary.createdAt,
  } as AutomationRun;
}

function relation(workflow:string,ordinal:number,status:AutomationRunSummaryView['status'],revision:number):AutomationChildRunRelation {
  return {
    id:`rel-${workflow}`,targetId:'local',rootRunId:ROOT_ID,parentRunId:ROOT_ID,parentInvocationId:'invoke-run-panels',
    callNodeId:'run-panels',ordinal,childRunId:`child-${workflow}`,ownerRunId:ROOT_ID,childDefinitionId:workflow,
    childDefinitionVersion:1,childConfigDigest:'a'.repeat(64),childExecutionPlanDigest:'b'.repeat(64),
    childRegistryDigest:'c'.repeat(64),childDefinitionDigest:'d'.repeat(64),triggerNodeId:'trigger',
    relation:'supervised',waitPolicy:'wait',cancelPolicy:'cascade',resultPolicy:'propagate',
    createdAt:'t',updatedAt:'t',boundAt:'t',runStatus:status,runRevision:revision,revision,
  };
}

/** Unrelated history rows every target accumulates (other Experiments, retries). */
function backgroundSummaries(count:number):AutomationRunSummaryView[] {
  return Array.from({ length:count },(_,index) => ({
    ...childSummary(`other-${index}`,'succeeded',1),id:`history-${index}`,parentRunId:undefined,rootRunId:`history-${index}`,
  }));
}

export type BenchRunState = {
  rootRevision:number;
  children:Record<string,{ status:AutomationRunSummaryView['status'];revision:number }>;
};

export function initialRunState():BenchRunState {
  return {
    rootRevision:3,
    children:Object.fromEntries(WORKFLOWS.map((workflow) => [workflow,{ status:'waiting' as const,revision:1 }])),
  };
}

const background = backgroundSummaries(80);

/** Immutable projections; unchanged rows keep their references like the real merges. */
export function createRunProjectionCache() {
  const summaries = new Map<string,AutomationRunSummaryView>();
  const details = new Map<string,AutomationRunDetail>();
  const reuse = <T,>(cache:Map<string,T>,key:string,next:T,same:(left:T,right:T) => boolean) => {
    const previous = cache.get(key);
    if (previous && same(previous,next)) return previous;
    cache.set(key,next);
    return next;
  };
  const sameSummary = (left:AutomationRunSummaryView,right:AutomationRunSummaryView) => left.status===right.status && left.revision===right.revision;
  return (state:BenchRunState) => {
    const root = reuse(summaries,ROOT_ID,rootSummary(state.rootRevision),sameSummary);
    const children = WORKFLOWS.map((workflow) => reuse(
      summaries,workflow,childSummary(workflow,state.children[workflow]!.status,state.children[workflow]!.revision),sameSummary,
    ));
    const rootDetailKey = JSON.stringify([state.rootRevision,WORKFLOWS.map((workflow) => state.children[workflow])]);
    const rootDetail = reuse(details,`root:${rootDetailKey}`,{
      run:{ ...childRun(root),parentRunId:undefined,depth:0 } as AutomationRun,
      invocations:[],nodeSummaries:[],loading:false,error:'',
      relations:{
        runId:ROOT_ID,
        childRuns:WORKFLOWS.map((workflow,ordinal) => relation(workflow,ordinal,state.children[workflow]!.status,state.children[workflow]!.revision)),
        childRunGroups:[{
          id:'group-panels',targetId:'local',rootRunId:ROOT_ID,parentRunId:ROOT_ID,producerInvocationId:'invoke-run-panels',
          producerNodeId:'run-panels',groupKey:'panels',expectedMembers:WORKFLOWS.length,memberCount:WORKFLOWS.length,
          waitPolicy:'join-later',joinMode:'join-all',failurePolicy:'collect-errors',remainingPolicy:'retain',
          resultPolicy:'reference',maxConcurrency:0,state:'sealed',terminalCount:0,createdAt:'t',updatedAt:'t',revision:1,
        }],
        childRunGroupMembers:WORKFLOWS.map((workflow,ordinal) => ({
          id:`member-${workflow}`,groupId:'group-panels',ordinal,itemKey:workflow,childRunId:`child-${workflow}`,
          state:'dispatched' as const,createdAt:'t',updatedAt:'t',revision:1,
        })),
        waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
      },
    },() => true);
    const childDetails = Object.fromEntries(WORKFLOWS.map((workflow,index) => {
      const summary = children[index]!;
      return [summary.id,reuse(details,`${summary.id}:${summary.revision}`,{
        run:childRun(summary),invocations:[],nodeSummaries:[],loading:false,error:'',
      },() => true)];
    }));
    return {
      root:rootView(state.rootRevision),
      runSummaries:[root,...children,...background],
      runDetailsById:{ [ROOT_ID]:rootDetail,...childDetails } as Record<string,AutomationRunDetail>,
    };
  };
}

/** Station occupancy the Experiment route provides: this Experiment's full Session is active. */
export function benchStationOccupancy():StationExperimentOccupancy {
  return {
    runningExperimentIds:new Set([EXPERIMENT_ID]),
    sessions:[{
      session:{
        id:'bench-session',targetId:'local',experimentResourceId:EXPERIMENT_ID,state:'active',mode:'full',
        runMode:'simulation',revision:1,
      },
      members:[],
    }] as unknown as StationExperimentOccupancy['sessions'],
    resolved:true,error:'',refresh:async () => undefined,convergeStoppedExperiment:async () => undefined,
  };
}

// The Experiment route memoizes the runtime on workspace fields, and the node
// catalog is workspace state: one stable empty catalog, as in production.
const BENCH_CATALOG:AutomationPanelContext['automation']['catalog'] = [];

export function benchAutomation(
  projection:{ runSummaries:AutomationRunSummaryView[];runDetailsById:Record<string,AutomationRunDetail> },
  documents:AutomationDocument[],
  functions:Pick<AutomationPanelContext['automation'],'runDocument'|'runBoundAutomation'|'stop'|'cancel'|'stopRunSet'|'loadRunDetail'|'retainRunDetail'|'retainRunObservation'|'refreshExecutionHistory'>,
):AutomationPanelContext['automation'] {
  return {
    targetId:'local',documents,catalog:BENCH_CATALOG,runSummaries:projection.runSummaries,runDetailsById:projection.runDetailsById,
    loading:false,error:'',...functions,
  };
}
