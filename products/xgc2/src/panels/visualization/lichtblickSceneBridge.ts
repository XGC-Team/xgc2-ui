import type { AutomationRun } from '../../domains/automation/automationPublic';
import { getAutomationExecutionRelations,getAutomationRun } from '../../domains/automation/automationPublic';
import { retainExecutionTarget,subscribeExecutionEvents,subscribeExecutionSnapshot } from '../../domains/execution/executionPublic';
import { SYSTEM_EXPERIMENT_RUNNER } from '../../domains/experiment/experimentPublic';
import { REPLAY_SCENE_LOCKED_REASON } from '../../domains/experiment/experimentPublic';
import { isRunStatusActive } from '../../shared/executionStatusVocabulary';
import type { PanelActionPortRuntime } from '../types';
import { LICHTBLICK_EMBED_CHANNEL,LICHTBLICK_EMBED_VERSION } from './lichtblickEmbedBridge';

export type LichtblickSceneCommand = Record<string,unknown> & { requestId:string;operation:string };
export type LichtblickSceneCommandMessage = {
  channel:typeof LICHTBLICK_EMBED_CHANNEL;version:typeof LICHTBLICK_EMBED_VERSION;
  sender:'lichtblick';type:'scene-command';requestId:string;command:LichtblickSceneCommand;
};
export const LICHTBLICK_SCENE_CONSUMER_CAPABILITIES = ['','ok','unsupported'] as const;
export type LichtblickSceneConsumerCapability = typeof LICHTBLICK_SCENE_CONSUMER_CAPABILITIES[number];
export type LichtblickSceneConsumer = {
  consumer:string;
  epoch:string;
  revision:number;
  applied:boolean;
  operational:boolean;
  capability:LichtblickSceneConsumerCapability;
  generation?:number;
  message:string;
  success:boolean;
};
export type LichtblickSceneResult = Record<string,unknown> & {
  success:boolean;
  error?:string;
  consumers?:LichtblickSceneConsumer[];
  synchronized?:boolean;
  syncRetryable?:boolean;
  /** Runtime truth: a replay asset froze this scene for the Run. Absent means false. */
  frozen?:boolean;
};
export type LichtblickSceneHost = { namespace:string;targetId:string;action:PanelActionPortRuntime;editable:boolean;panelId:string };
export type LichtblickSceneHostInput = {
  panelId:string;
  sceneNamespace:string;
  action?:PanelActionPortRuntime;
  targetId?:string;
  webReady:boolean;
  bridgeReady:boolean;
  lifecycleStopping:boolean;
  disabledReason?:string;
  editing?:boolean;
};
const operations:Record<string,readonly string[]> = {
  get:[],add:['obstacle'],update:['obstacle'],delete:['id'],clear:[],replace:['document'],
  undo:[],redo:[],resync:[],save:[],reload:[],play:[],pause:[],reset:[],
};

/** Mutating edits a replay-frozen scene must never send; reads and playback stay live. */
export const REPLAY_FROZEN_BLOCKED_OPERATIONS = ['add','update','delete','clear','replace','save','reload'] as const;
export function replayFrozenSceneCommandError(frozen:boolean,operation:string):string {
  return frozen && (REPLAY_FROZEN_BLOCKED_OPERATIONS as readonly string[]).includes(operation)
    ? REPLAY_SCENE_LOCKED_REASON
    : '';
}

export function validSceneNamespace(value:unknown):value is string {
  return typeof value==='string' && value.length<=160 && /^\/[A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)*$/.test(value);
}
function record(value:unknown):value is Record<string,unknown> {
  return typeof value==='object' && value!==null && !Array.isArray(value) && Object.getPrototypeOf(value)===Object.prototype;
}
export function sceneCommandRequestId(value:unknown):string|undefined {
  return record(value) && value.channel===LICHTBLICK_EMBED_CHANNEL && value.version===LICHTBLICK_EMBED_VERSION
    && value.sender==='lichtblick' && value.type==='scene-command' && typeof value.requestId==='string'
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.requestId) ? value.requestId : undefined;
}
export function isLichtblickSceneCommandMessage(value:unknown):value is LichtblickSceneCommandMessage {
  if (!record(value) || Object.keys(value).length!==6
    || !Object.keys(value).every((key) => ['channel','version','sender','type','requestId','command'].includes(key))
    || value.channel!==LICHTBLICK_EMBED_CHANNEL || value.version!==LICHTBLICK_EMBED_VERSION
    || value.sender!=='lichtblick' || value.type!=='scene-command'
    || typeof value.requestId!=='string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.requestId)
    || !record(value.command) || value.command.requestId!==value.requestId
    || typeof value.command.operation!=='string' || !Object.hasOwn(operations,value.command.operation)) return false;
  const command=value.command;
  if (!Object.keys(command).every((key) => ['requestId','operation','expectedEpoch','expectedRevision',...operations[command.operation as string]].includes(key))) return false;
  if (command.operation!=='get' && (typeof command.expectedEpoch!=='string' || !command.expectedEpoch
    || !Number.isSafeInteger(command.expectedRevision) || (command.expectedRevision as number)<1)) return false;
  if ((command.operation==='add' || command.operation==='update') && !record(command.obstacle)) return false;
  if (command.operation==='replace' && !record(command.document)) return false;
  if (command.operation==='delete' && (typeof command.id!=='string' || !command.id)) return false;
  try { return JSON.stringify(command).length<=2_000_000; } catch { return false; }
}

export function sceneBindingMessage(host:LichtblickSceneHost|undefined) {
  return { channel:LICHTBLICK_EMBED_CHANNEL,version:LICHTBLICK_EMBED_VERSION,sender:'xgc2',type:'scene-binding',
    ...(host && validSceneNamespace(host.namespace) ? { binding:{ namespace:host.namespace,editable:host.editable } } : {}),
  } as const;
}
export function sceneResultMessage(requestId:string,result:LichtblickSceneResult) {
  return { channel:LICHTBLICK_EMBED_CHANNEL,version:LICHTBLICK_EMBED_VERSION,sender:'xgc2',type:'scene-command-result',requestId,result } as const;
}
export function sceneHostSignature(host:LichtblickSceneHost|undefined):string {
  return host ? JSON.stringify([host.panelId,host.targetId,host.namespace,host.editable,host.action.trace]) : '';
}

/** A6 workspace should call this instead of matching typed namespace against Action defaults. */
export function resolveLichtblickSceneHost(input:LichtblickSceneHostInput):LichtblickSceneHost|undefined {
  if (!input.action || !input.targetId || !validSceneNamespace(input.sceneNamespace)) return undefined;
  return {
    panelId:input.panelId,
    namespace:input.sceneNamespace,
    targetId:input.targetId,
    action:input.action,
    editable:Boolean(input.webReady && input.bridgeReady && !input.lifecycleStopping && !input.disabledReason
      && !input.editing && input.action.connected && !input.action.disabledReason),
  };
}

function parseSceneConsumers(value:unknown):LichtblickSceneConsumer[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid scene synchronization status.');
  }
  return value.map((item) => {
    if (!record(item)
      || typeof item.consumer!=='string'
      || typeof item.epoch!=='string'
      || typeof item.revision!=='number'
      || !Number.isSafeInteger(item.revision)
      || typeof item.applied!=='boolean'
      || typeof item.operational!=='boolean'
      || typeof item.capability!=='string'
      || !LICHTBLICK_SCENE_CONSUMER_CAPABILITIES.includes(item.capability as LichtblickSceneConsumerCapability)
      || typeof item.success!=='boolean'
      || item.success!==item.applied
      || (item.generation!==undefined && (!Number.isSafeInteger(item.generation) || (item.generation as number)<0))
      || typeof item.message!=='string') {
      throw new Error('Invalid scene synchronization status.');
    }
    return {
      consumer:item.consumer,
      epoch:item.epoch,
      revision:item.revision,
      applied:item.applied,
      operational:item.operational,
      capability:item.capability as LichtblickSceneConsumerCapability,
      message:item.message,
      success:item.applied,
      ...(item.generation!==undefined ? { generation:item.generation as number } : {}),
    };
  });
}

function parseResult(value:unknown):LichtblickSceneResult {
  if (!record(value) || typeof value.resultJson!=='string') {
    throw new Error('Scene workflow completed without its structured scene result. Connect the scene-command Action.');
  }
  value=JSON.parse(value.resultJson) as unknown;
  if (!record(value) || typeof value.success!=='boolean' || (value.error!==undefined && typeof value.error!=='string')) {
    throw new Error('Scene workflow completed without a scene result. Connect the scene-command Action that returns the accepted scene.');
  }
  if (!value.success) return value as LichtblickSceneResult;
  if (typeof value.epoch!=='string' || !value.epoch || !Number.isSafeInteger(value.revision)
    || !Number.isSafeInteger(value.savedRevision) || typeof value.dirty!=='boolean' || typeof value.playing!=='boolean'
    || !Number.isFinite(value.sceneTime) || !record(value.document)
    || value.document.schema!=='xgc2.scene.v1' || typeof value.document.frame!=='string' || !Array.isArray(value.document.obstacles)
    || (value.synchronized!==undefined && typeof value.synchronized!=='boolean')
    || (value.syncRetryable!==undefined && typeof value.syncRetryable!=='boolean')
    || (value.frozen!==undefined && typeof value.frozen!=='boolean')) {
    throw new Error('Scene workflow returned no accepted scene document. Refresh the scene and check its workflow result.');
  }
  return {
    ...value,
    success:true,
    frozen:value.frozen===true,
    consumers:parseSceneConsumers(value.consumers),
  } as LichtblickSceneResult;
}
function terminalResult(run:AutomationRun):LichtblickSceneResult|undefined {
  if (isRunStatusActive(run.status)) return undefined;
  if (run.status!=='succeeded') throw new Error(run.primaryError || run.reason || `Scene workflow ${run.status}.`);
  return parseResult(run.result);
}
/** Admission is not completion. Resolve only this invocation's exact bound scene Action child. */
export async function runLichtblickSceneCommand(
  host:LichtblickSceneHost,command:LichtblickSceneCommand,signal:AbortSignal,
  services={ getRun:getAutomationRun,getRelations:getAutomationExecutionRelations,subscribeEvents:subscribeExecutionEvents,subscribeSnapshot:subscribeExecutionSnapshot,retainTarget:retainExecutionTarget },
):Promise<LichtblickSceneResult> {
  if (signal.aborted || !host.editable || !host.action.connected || host.action.disabledReason
    || !validSceneNamespace(host.namespace) || !host.action.trace.actionId || !host.action.trace.automationResourceId || !host.action.trace.presetId) {
    throw new Error(host.action.disabledReason || 'Scene editing is unavailable. Connect the scene-command Action in this experiment.');
  }
  const invocation=await host.action.invoke({ commandJson:JSON.stringify(command),sceneNamespace:host.namespace });
  let actionRunId:string|undefined;
  const check=async ():Promise<LichtblickSceneResult|undefined> => {
    if (!actionRunId) {
      const root=await services.getRun(host.targetId,invocation.id,{ signal });
      if (root.id!==invocation.id) throw new Error('Scene command Run identity mismatch.');
      if (root.actionId===host.action.trace.actionId && root.automationResourceId===host.action.trace.automationResourceId) {
        actionRunId=root.id;
      } else {
        if (root.automationResourceId!==SYSTEM_EXPERIMENT_RUNNER.resourceId
          || root.actionId!==SYSTEM_EXPERIMENT_RUNNER.actions.invokePanelAction
          || root.parameters.panelId!==host.panelId || root.parameters.presetId!==host.action.trace.presetId) {
          throw new Error('Scene command did not return the selected Panel Action invocation.');
        }
        if (!isRunStatusActive(root.status) && root.status!=='succeeded') terminalResult(root);
        const relations=await services.getRelations(host.targetId,root.id,{ signal });
        if (relations.runId!==root.id) throw new Error('Scene command relations identity mismatch.');
        const candidates=relations.childRuns.filter((child) => child.parentRunId===root.id && child.targetId===root.targetId
          && child.boundAt && !child.launchAbandonedAt && child.relation!=='detached' && !child.targetRoot
          && child.callNodeId==='invoke-selected-action');
        if (candidates.length>1) throw new Error('Scene command resolved multiple Actions. Connect one scene-command Action.');
        if (candidates[0]) actionRunId=candidates[0].childRunId;
      }
    }
    if (!actionRunId) return undefined;
    const run=await services.getRun(host.targetId,actionRunId,{ signal });
    if (run.id!==actionRunId || run.actionId!==host.action.trace.actionId || run.automationResourceId!==host.action.trace.automationResourceId) {
      throw new Error('Scene Action identity changed. Refresh the experiment view.');
    }
    return terminalResult(run);
  };
  return new Promise((resolve,reject) => {
    let done=false;let checking=false;let invalidated=false;
    const cleanup:(() => void)[]=[];
    const finish=(error:unknown,result?:LichtblickSceneResult) => {
      if (done) return;done=true;cleanup.forEach((release) => release());
      if (error) reject(error);else resolve(result!);
    };
    const reconcile=async () => {
      if (done) return;
      if (checking) { invalidated=true;return; }
      checking=true;
      try {
        do {
          invalidated=false;
          const result=await check();
          if (result) { finish(undefined,result);break; }
        } while (invalidated && !done);
      } catch (error) { finish(error); }
      finally { checking=false; }
    };
    const abort=() => finish(new Error('Scene command canceled or timed out. Refresh the scene before editing.'));
    signal.addEventListener('abort',abort,{ once:true });
    cleanup.push(() => signal.removeEventListener('abort',abort));
    cleanup.push(services.subscribeEvents(host.targetId,(event) => {
      if (event.entityId===invocation.id || event.entityId===actionRunId) void reconcile();
    }));
    cleanup.push(services.subscribeSnapshot(host.targetId,() => void reconcile()));
    cleanup.push(services.retainTarget(host.targetId,{ processes:false,jobs:false }));
    if (signal.aborted) abort();else void reconcile();
  });
}
