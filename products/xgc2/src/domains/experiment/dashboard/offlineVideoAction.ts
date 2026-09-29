import type { AutomationPanelContext,PanelActionPortRuntime,PanelExecutionObserver } from '../../../panels/types';
import { VIDEO_RENDER_ACTION_PORT,VIDEO_WORKFLOW_INSTANCE_ID } from '../../../panels/runtime/videoProduction/videoProductionModel';
import { SCIENTIFIC_GALLERY_PANEL_ID } from '../../../panels/runtime/scientificGalleryPanelModel';
import type { PinnedConfigRef } from '../../../shared/configResource';
import { isRunStatusActive } from '../../../shared/executionStatusVocabulary';
import type { AutomationDocument,AutomationRun,AutomationRunDetail,AutomationRunSummaryView,AutomationSpec } from '../../automation/automationPublic';
import type { ExperimentDocument,ExperimentWorkflowInstance,PanelInstance } from '../experimentModel';

type Automation = AutomationPanelContext['automation'];
type Host = { experiment?:ExperimentDocument;automation:Automation };
type PortHost = Host & { execution:PanelExecutionObserver };

/** This exact published two-node workflow has no live Experiment effects. */
export function isClosedOfflineVideoWorkflow(spec:AutomationSpec):boolean {
  const action=spec.actions[0];
  const trigger=spec.nodes.find((node) => node.id==='manual');
  const render=spec.nodes.find((node) => node.id==='render');
  const edge=spec.edges[0];
  const fields=action?.inputSchema.fields??[];
  const concurrency=action?.admission.concurrency;
  return spec.schemaVersion===4 && spec.targetPolicy.mode==='fixed'
    && spec.targetPolicy.executionTargetId==='local'
    && spec.nodes.length===2 && spec.edges.length===1 && spec.actions.length===1
    && trigger?.kind==='trigger.manual' && trigger.typeVersion===2
    && Object.keys(trigger.parameters).length===0 && !trigger.parameterBindings?.length && !trigger.effectRole
    && render?.kind==='video.render-archive' && render.typeVersion===1 && !render.effectRole
    && sameRecord(render.parameters,{ experimentId:'pending',videoJobId:'0'.repeat(32) })
    && render.parameterBindings?.length===2
    && ['experimentId','videoJobId'].every((name) => render.parameterBindings?.some((binding) => (
      binding.target===`/${name}` && binding.language==='xgc-expression-v2'
      && binding.expression===`{{ $inputs["manual"].${name} }}`
    )))
    && edge?.from==='manual' && edge.to==='render' && edge.condition==='success'
    && !edge.sourcePort && !edge.route
    && action?.id===VIDEO_RENDER_ACTION_PORT && action.version===1 && action.entryNodeId==='manual'
    && action.kind==='command' && action.controls.length===1 && action.controls[0]==='cancel'
    && fields.length===2 && ['experimentId','videoJobId'].every((name) => fields.some((field) => (
      field.name===name && field.kind==='string' && field.required===true
      && Object.keys(field.string??{}).length===0
    )))
    && concurrency?.scope==='workflow' && concurrency.limit===1
    && concurrency.onConflict==='reject' && concurrency.appliesTo==='all' && !concurrency.keyExpression;
}

function sameRecord(actual:Record<string,unknown>,expected:Record<string,unknown>) {
  return Object.keys(actual).length===Object.keys(expected).length
    && Object.entries(expected).every(([key,value]) => actual[key]===value);
}

/** Panel Workflow refs, plus the closed render workflow when a panel binds render-video. */
export function automationRefsForPanels(
  instances: readonly ExperimentWorkflowInstance[],
  panels: readonly PanelInstance[],
) {
  const wanted = new Set<string>();
  for (const panel of panels) {
    const owner = panel.portBindings.find((binding) => binding.kind === 'workflow');
    if (owner?.kind === 'workflow') wanted.add(owner.workflowInstanceId);
    if (panel.portBindings.some((binding) => binding.kind === 'action' && binding.portId === VIDEO_RENDER_ACTION_PORT)) {
      wanted.add(VIDEO_WORKFLOW_INSTANCE_ID);
    }
  }
  return instances.filter((instance) => wanted.has(instance.id)).map((instance) => instance.ref);
}

function videoBinding(panel:PanelInstance,host:Host) {
  if (!host.experiment || host.automation.targetId!=='local' || panel.pluginId!==SCIENTIFIC_GALLERY_PANEL_ID) return undefined;
  const actions=panel.portBindings.filter((binding) => binding.portId===VIDEO_RENDER_ACTION_PORT);
  if (actions.length!==1) return undefined;
  const binding=actions[0]!;
  if (binding.kind!=='action' || binding.presetId!==VIDEO_RENDER_ACTION_PORT) return undefined;
  return videoInstance(host,VIDEO_WORKFLOW_INSTANCE_ID);
}

function videoInstance(host:Host,workflowInstanceId:string) {
  const instances=host.experiment!.spec.workflowInstances.filter((instance) => instance.id===workflowInstanceId);
  if (instances.length!==1) return undefined;
  const instance=instances[0]!;
  if (instance.ref.domain!=='automation' || !instance.ref.resourceId || instance.ref.componentId) return undefined;
  const presets=instance.actionPresets.filter((preset) => preset.id===VIDEO_RENDER_ACTION_PORT);
  if (presets.length!==1 || presets[0]!.actionId!==VIDEO_RENDER_ACTION_PORT
    || Object.keys(presets[0]!.inputs).length || presets[0]!.parameterBindings.length) return undefined;
  return { ref:instance.ref };
}

function documentPin(document:AutomationDocument):PinnedConfigRef<'automation'>|undefined {
  const { head,branch }=document;
  if (head.domain!=='automation' || branch.domain!=='automation' || branch.resourceId!==head.resourceId
    || head.archived || branch.archived || !head.mainCommitId || head.mainCommitId!==branch.headCommitId
    || head.currentVersion!==branch.headVersion || !Number.isInteger(head.currentVersion) || head.currentVersion<1
    || !/^[0-9a-f]{64}$/.test(head.digest)) return undefined;
  return { domain:'automation',resourceId:head.resourceId,branch:branch.name,
    commitId:head.mainCommitId,version:head.currentVersion,digest:head.digest };
}

function samePin(left:PinnedConfigRef|undefined,right:PinnedConfigRef) {
  return left?.domain===right.domain && left.resourceId===right.resourceId && left.branch===right.branch
    && (left.componentId??'')===(right.componentId??'') && left.commitId===right.commitId
    && left.version===right.version && left.digest===right.digest;
}

function candidate(run:AutomationRunSummaryView,panel:PanelInstance,host:Host) {
  const binding=videoBinding(panel,host);
  return Boolean(binding && run.targetId==='local' && run.sourceKind==='automation'
    && run.sourceRef?.domain==='automation' && run.sourceRef.resourceId===binding.ref.resourceId
    && run.sourceRef.branch===binding.ref.branch && !run.sourceRef.componentId
    && run.automationResourceId===binding.ref.resourceId && run.actionId===VIDEO_RENDER_ACTION_PORT
    && run.actionVersion===1 && !run.parentRunId && run.rootRunId===run.id);
}

function ticketParameters(parameters:Record<string,unknown>,experimentId:string) {
  return Object.keys(parameters).length===2 && parameters.experimentId===experimentId
    && typeof parameters.videoJobId==='string' && /^[0-9a-f]{32}$/.test(parameters.videoJobId);
}

function verifiedDetail(detail:AutomationRunDetail|undefined,panel:PanelInstance,host:Host) {
  const run=detail?.run;
  const snapshot=detail?.snapshot;
  if (!run || !snapshot || !candidate(run,panel,host)
    || !ticketParameters(run.parameters,host.experiment!.head.resourceId)
    || snapshot.runId!==run.id || snapshot.targetId!==run.targetId || snapshot.sourceKind!=='automation'
    || !samePin(snapshot.sourceRef,run.sourceRef) || !samePin(snapshot.automationRef,run.sourceRef)
    || !isClosedOfflineVideoWorkflow(snapshot.automationSpec)) return undefined;
  return run;
}

/** Summary-only candidates are observed, never attributed or controlled until their frozen detail is checked. */
export function offlineVideoRunDetailDemands(panel:PanelInstance,host:Host) {
  if (!videoBinding(panel,host)) return [];
  return host.automation.runSummaries.filter((run) => isRunStatusActive(run.status) && candidate(run,panel,host))
    .map(({ id,targetId,revision }) => ({ id,targetId,revision,frozenSnapshot:true as const }));
}

export function createOfflineVideoActionPort(panel:PanelInstance,host:PortHost):PanelActionPortRuntime {
  const binding=videoBinding(panel,host);
  const documents=host.automation.documents.filter((doc) => (
    doc.head.resourceId===binding?.ref.resourceId && doc.branch.name===binding.ref.branch
  ));
  const document=documents.length===1 ? documents[0] : undefined;
  const pin=document && documentPin(document);
  const valid=Boolean(binding && document && pin && isClosedOfflineVideoWorkflow(document.spec));
  const disabledReason=valid ? ''
    : !binding ? 'Connect a dedicated Render video workflow to submit a recipe.'
      : !document ? 'The render workflow document is not loaded for this dashboard.'
        : 'The bound offline video workflow must be the published, fixed-local render contract.';
  const runs=Object.values(host.automation.runDetailsById)
    .map((detail) => verifiedDetail(detail,panel,host)).filter((run):run is AutomationRun => Boolean(run))
    .map((run) => {
      const summary=host.automation.runSummaries.find((item) => item.id===run.id && candidate(item,panel,host));
      return summary && summary.revision>run.revision ? { ...run,status:summary.status,revision:summary.revision } : run;
    }).sort((left,right) => right.createdAt.localeCompare(left.createdAt) || right.revision-left.revision);
  const latest=runs[0];
  const active=runs.find((run) => isRunStatusActive(run.status));
  const invocation=(run:AutomationRun) => ({ id:run.id,status:run.status,revision:run.revision });
  return {
    id:VIDEO_RENDER_ACTION_PORT,label:'Render video',connected:valid,disabledReason,
    action:{ id:VIDEO_RENDER_ACTION_PORT,label:'Render video',kind:'command',controls:['cancel'] },
    ...(document ? { inputSchema:document.spec.actions[0]?.inputSchema } : {}),defaults:{},
    ...(active ? { activeInvocation:invocation(active) } : {}),
    ...(latest ? { latestInvocation:invocation(latest) } : {}),
    execution:host.execution,
    trace:{ automationResourceId:binding?.ref.resourceId,actionId:VIDEO_RENDER_ACTION_PORT,presetId:VIDEO_RENDER_ACTION_PORT },
    invoke:async (parameters={},reason) => {
      if (!valid || !binding || !pin) throw new Error(disabledReason);
      if (!ticketParameters(parameters,host.experiment!.head.resourceId)) throw new Error('An exact Experiment video ticket is required.');
      const run=await host.automation.runBoundAutomation(binding.ref,parameters,reason,'',VIDEO_RENDER_ACTION_PORT,{ expectedAutomationRef:pin });
      if (!candidate(run,panel,host) || !samePin(run.sourceRef,pin) || !sameRecord(run.parameters,parameters)) {
        throw new Error('Offline video Run receipt identity mismatch.');
      }
      return invocation(run);
    },
    control:async (target,control,reason) => {
      if (control!=='cancel') throw new Error('Offline video only supports cancel.');
      const detail=await host.automation.loadRunDetail(target.id,target.revision);
      const run=verifiedDetail(detail,panel,host);
      if (!run || run.id!==target.id) throw new Error('The selected Run is not this Experiment’s bound offline video render.');
      // Validate the accepted immutable snapshot, not the current authoring
      // head: editing a workflow must not strand an already admitted render.
      await host.automation.cancel(run,reason || 'Cancel this offline video render only');
    },
  };
}
