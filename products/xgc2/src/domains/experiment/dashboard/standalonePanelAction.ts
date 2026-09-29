import { useEffect } from 'react';
import { useProductRouteVisible } from '../../../shared/routeReady';
import type { PanelActionPortBinding,PanelInstance,PanelWorkflowPortBinding,ExperimentWorkflowInstance,WorkflowActionPreset } from '../experimentModel';
import type { PanelActionPortDefinition,PanelActionPortRuntime } from '../../../panels/types';
import type { AutomationAction,AutomationDocument,AutomationRun,AutomationRunSummaryView } from '../../automation/automationPublic';
import { automationActionById } from '../../automation/automationPublic';
import type { PinnedConfigRef } from '../../../shared/configResource';
import { isRunStatusActive } from '../../../shared/executionStatusVocabulary';
import { executionTargetResourceId } from '../../execution/executionPublic';
import type { PanelContextActions } from './panelContextFactory';

type Resolved = { instance?:ExperimentWorkflowInstance;preset?:WorkflowActionPreset;document?:AutomationDocument;action?:AutomationAction;error:string };
/** Discovery and attribution read only the Experiment document and target runtime. */
type RunHost = Pick<PanelContextActions,'experiment'|'automation'>;
type Selection = { panel:PanelInstance;binding:PanelActionPortBinding;owner:PanelWorkflowPortBinding;host:RunHost };

/** Attribution comes from frozen public metadata, never parameters or a recent matching Action. */
function belongs(run:AutomationRunSummaryView,{ panel,binding,owner,host }:Selection) {
  const metadata=run.panelAction;
  return Boolean(host.experiment && metadata && run.targetId===executionTargetResourceId(host.automation.targetId)
    && run.sourceKind==='experiment' && run.sourceRef?.domain==='experiment'
    && run.sourceRef.resourceId===host.experiment.head.resourceId && run.sourceRef.branch===host.experiment.branch.name
    && !run.parentRunId && run.rootRunId===run.id && metadata.executionMode==='standalone'
    && metadata.panelId===panel.id && metadata.portId===binding.portId
    && metadata.workflowInstanceId===owner.workflowInstanceId && metadata.presetId===binding.presetId);
}

function ownedRuns(selection:Selection):AutomationRunSummaryView[] {
  const runs=new Map(selection.host.automation.runSummaries.map((run) => [run.id,run]));
  for (const { run } of Object.values(selection.host.automation.runDetailsById)) {
    if (run && (runs.get(run.id)?.revision ?? -1)<=run.revision) runs.set(run.id,run);
  }
  return [...runs.values()].filter((run) => belongs(run,selection))
    .sort((left,right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
}

export function standalonePanelRunDetailDemands(panel:PanelInstance,host:RunHost) {
  const owner=panel.portBindings.find((binding):binding is PanelWorkflowPortBinding => binding.kind==='workflow');
  if (!owner) return [];
  return panel.portBindings.flatMap((binding) => binding.kind==='action' && binding.executionMode==='standalone'
    ? ownedRuns({ panel,binding,owner,host }).filter((run) => isRunStatusActive(run.status))
      .map(({ id,targetId,revision }) => ({ id,targetId,revision,frozenSnapshot:true as const })) : []);
}

/**
 * Discovery source for standalone runs: a rendered panel with standalone
 * Action bindings observes its owner workflow instance's ordinary execution
 * history (one bounded page plus the shared SSE, gated by the same observed
 * registry as every other consumer). Without this the runs only surfaced as a
 * side effect of Session membership, which standalone execution no longer has.
 */
export function standalonePanelHistoryResources(panel:PanelInstance,host:RunHost):string[] {
  const owner=panel.portBindings.find((binding):binding is PanelWorkflowPortBinding => binding.kind==='workflow');
  if (!owner || !panel.portBindings.some((binding) => binding.kind==='action' && binding.executionMode==='standalone')) return [];
  const instance=host.experiment?.spec.workflowInstances.find((candidate) => candidate.id===owner.workflowInstanceId);
  const resourceId=instance?.ref.resourceId ?? '';
  return resourceId ? [resourceId] : [];
}

export function useStandalonePanelActionHistory(panel:PanelInstance,host:RunHost,enabled:boolean) {
  const visible=useProductRouteVisible();
  const signature=standalonePanelHistoryResources(panel,host).join('\0');
  const refresh=host.automation.refreshExecutionHistory;
  useEffect(() => {
    if (!visible || !enabled || !signature) return;
    for (const resourceId of signature.split('\0')) void Promise.resolve(refresh(resourceId)).catch(() => undefined);
  },[visible,enabled,signature,refresh]);
}

function documentPin(document:AutomationDocument|undefined):PinnedConfigRef<'automation'>|undefined {
  if (!document) return undefined;
  const { head,branch }=document;
  if (head.domain!=='automation' || branch.domain!=='automation' || head.resourceId!==branch.resourceId
    || head.archived || branch.archived || head.mainCommitId!==branch.headCommitId || !head.mainCommitId
    || head.currentVersion!==branch.headVersion || !Number.isSafeInteger(head.currentVersion) || head.currentVersion<1
    || !/^[a-f0-9]{64}$/.test(head.digest)) return undefined;
  return { domain:'automation',resourceId:head.resourceId,branch:branch.name,commitId:branch.headCommitId,
    version:branch.headVersion,digest:head.digest };
}
function samePin(left:PinnedConfigRef|undefined,right:PinnedConfigRef) {
  return left?.domain===right.domain && left.resourceId===right.resourceId && left.branch===right.branch
    && (left.componentId??'')===(right.componentId??'') && left.commitId===right.commitId
    && left.version===right.version && left.digest===right.digest;
}
function invocation(run:AutomationRunSummaryView) { return { id:run.id,status:run.status,revision:run.revision }; }

export function createStandalonePanelActionPort(selection:Selection & {
  host:PanelContextActions;definition:PanelActionPortDefinition;resolved:Resolved;
}):PanelActionPortRuntime {
  const { panel,binding,owner,host,definition,resolved }=selection;
  const { instance,preset,document,action }=resolved;
  const pin=documentPin(document);
  const runs=ownedRuns(selection);
  const active=runs.filter((run) => isRunStatusActive(run.status));
  const activeDetail=active.length===1 ? host.automation.runDetailsById[active[0]!.id] : undefined;
  const accepted=activeDetail?.run;
  const snapshot=activeDetail?.snapshot;
  const acceptedAction=accepted && snapshot && belongs(accepted,selection) && snapshot.runId===accepted.id
    && snapshot.targetId===accepted.targetId && samePin(snapshot.sourceRef,accepted.sourceRef)
    && accepted.automationRef && samePin(snapshot.automationRef,accepted.automationRef)
    ? automationActionById(snapshot.automationSpec,accepted.actionId) : undefined;
  const displayedAction=acceptedAction ?? action;
  const disabledReason=!host.experiment ? 'The current Experiment is unavailable.'
    : binding.presetId===owner.presetId ? 'The primary workflow Action must run with the Experiment.'
      : resolved.error || (!pin ? 'The bound workflow source must be loaded before starting.'
        : !host.experiment.spec.runModes.includes(host.experimentLifecycle.runMode) ? 'Select an Experiment run mode.'
          : active.length>1 ? 'Multiple independent runs require an exact Run selection in execution history.' : '');
  return {
    id:definition.id,label:definition.label,executionMode:'standalone',connected:Boolean(instance && preset && action && pin),disabledReason,
    ...(displayedAction ? { action:{ id:displayedAction.id,label:displayedAction.label,kind:displayedAction.kind,controls:displayedAction.controls.filter((control) => control!=='restart') },inputSchema:displayedAction.inputSchema } : {}),
    invocationScope:{ targetId:executionTargetResourceId(host.automation.targetId),
      experimentResourceId:host.experiment?.head.resourceId ?? '',experimentBranch:host.experiment?.branch.name ?? '',
      panelId:panel.id,portId:binding.portId,workflowInstanceId:owner.workflowInstanceId,presetId:binding.presetId },
    defaults:preset?.inputs ?? {},
    ...(active.length===1 ? { activeInvocation:invocation(active[0]!) } : {}),
    ...(runs[0] && active.length<=1 ? { latestInvocation:invocation(runs[0]) } : {}),
    execution:host.execution,
    trace:{ workflowInstanceId:owner.workflowInstanceId,presetId:binding.presetId,automationResourceId:instance?.ref.resourceId,actionId:preset?.actionId },
    invoke:async (overrides={},reason) => {
      if (disabledReason || !host.experiment || !instance || !preset || !action || !pin) throw new Error(disabledReason || 'The Action is unavailable.');
      if (active.length) throw new Error('Stop the existing independent Run before starting another.');
      const runMode=host.experimentLifecycle.runMode;
      if (Object.hasOwn(overrides,'runMode') && overrides.runMode!==runMode) throw new Error('Action run mode must match the selected Experiment mode.');
      const run=await host.automation.runBoundAutomation(instance.ref,{ ...overrides,runMode },reason || `Invoke ${action.label} independently`,'',action.id,{
        experimentRef:{ domain:'experiment',resourceId:host.experiment.head.resourceId,branch:host.experiment.branch.name },
        expectedAutomationRef:pin,panelAction:{ panelId:panel.id,portId:binding.portId },
      });
      if (!belongs(run,selection) || run.automationResourceId!==pin.resourceId || run.actionId!==action.id
        || run.panelAction?.runMode!==runMode || !samePin(run.automationRef,pin)) {
        throw new Error('Independent Action Run receipt identity mismatch.');
      }
      return invocation(run);
    },
    control:async (target,control,reason) => {
      if (control!=='stop' && control!=='cancel') throw new Error('Independent Actions support exact Stop or Cancel only.');
      const detail=await host.automation.loadRunDetail(target.id,target.revision);
      const run:AutomationRun|undefined=detail.run;
      if (!run || run.id!==target.id || !belongs(run,selection)) throw new Error('The selected Run does not belong to this independent Action.');
      const snapshot=detail.snapshot;
      if (!snapshot || snapshot.runId!==run.id || snapshot.targetId!==run.targetId
        || !samePin(snapshot.sourceRef,run.sourceRef) || !run.automationRef || !samePin(snapshot.automationRef,run.automationRef)) {
        throw new Error('The accepted Action source is unavailable.');
      }
      const acceptedAction=automationActionById(snapshot.automationSpec,run.actionId);
      if (!acceptedAction?.controls.includes(control)) throw new Error(`The accepted Action does not support ${control}.`);
      if (control==='cancel') await host.automation.cancel(run,reason || `Cancel ${definition.label}`);
      else await host.automation.stopRunSet(run,{ includeAnchor:true,includeDetached:true,reason:reason || `Stop ${definition.label}` });
    },
  };
}
