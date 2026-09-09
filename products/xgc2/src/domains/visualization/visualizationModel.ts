import type { AutomationNodeExecutionSummary } from '../automation/automationPublic';
import type { ProcessInstance } from '../execution/executionPublic';

export type LichtblickRuntime = {
  master: ProcessInstance;
  bridge: ProcessInstance;
  web: ProcessInstance;
  descriptions: ProcessInstance;
  scene?: ProcessInstance;
};

export type LichtblickRuntimeRequirement = {
  state: 'pending' | 'process' | 'no-runtime' | 'failed';
  instance?: ProcessInstance;
  error?: string;
};

export type LichtblickRuntimeProjection = Partial<LichtblickRuntime> & {
  workflowRunId?: string;
  requirements?: {
    descriptions: LichtblickRuntimeRequirement;
    scene: LichtblickRuntimeRequirement;
  };
};

export type LichtblickRuntimeComponentKey = 'master' | 'bridge' | 'web' | 'descriptions' | 'scene';

export type LichtblickRuntimeComponent = {
  key: LichtblickRuntimeComponentKey;
  label: string;
  instance?: ProcessInstance;
  error?: string;
};

const componentLabels: Record<LichtblickRuntimeComponentKey,string> = {
  master: 'ROS master',
  bridge: 'Foxglove bridge',
  web: 'Lichtblick WebUI',
  descriptions: 'Robot descriptions',
  scene: '3D scene publisher',
};

const runtimeDefinitionIds = new Set([
  'roscore',
  'foxglove-bridge',
  'lichtblick-web',
  'lichtblick-robot-descriptions',
  'lichtblick-robot-scene',
]);

export function isLichtblickRuntimeProcessCandidate(instance: ProcessInstance) {
  return instance.driver === 'host'
    && runtimeDefinitionIds.has(instance.definitionId);
}

export function resolveLichtblickRuntimeComponents(
  runtime: LichtblickRuntimeProjection | undefined,
  observedInstances: readonly ProcessInstance[],
): LichtblickRuntimeComponent[] {
  const observedById = new Map(observedInstances.map((instance) => [instance.id,instance]));
  const resolve = (instance: ProcessInstance | undefined) => {
    if (!instance) return undefined;
    const observed = observedById.get(instance.id);
    return observed && observed.revision >= instance.revision ? observed : instance;
  };
  const keys: LichtblickRuntimeComponentKey[] = runtime?.master
    ? ['master','bridge','web','descriptions','scene']
    : ['bridge','web','descriptions','scene'];
  if (runtime?.requirements?.scene.state === 'no-runtime') keys.pop();
  return keys.map((key) => ({
    key,
    label: componentLabels[key],
    instance: resolve(runtime?.[key]),
    error: runtimeRequirement(runtime, key)?.error,
  }));
}

export function resolveLichtblickWorkflowRuntime(
  workflowRunId: string,
  observedInstances: readonly ProcessInstance[],
  nodeSummaries: readonly AutomationNodeExecutionSummary[],
  targetId = 'local',
): LichtblickRuntimeProjection | undefined {
  if (!workflowRunId) return undefined;
  const owned = observedInstances.filter((instance) => (
    instance.targetId === targetId
    && instance.driver === 'host'
    && instance.ownerType === 'orchestration-run'
    && instance.ownerId === workflowRunId
  ));
  const resolve = (definitionId: string) => owned.find((instance) => instance.definitionId === definitionId);
  const descriptions = resolveRuntimeRequirement(
    workflowRunId,targetId,observedInstances,nodeSummaries,
    'visualization.robot-descriptions','lichtblick-robot-descriptions',false,
  );
  const scene = resolveRuntimeRequirement(
    workflowRunId,targetId,observedInstances,nodeSummaries,
    'visualization.robot-scene','lichtblick-robot-scene',true,
  );
  return {
    workflowRunId,
    bridge: resolve('foxglove-bridge'),
    web: resolve('lichtblick-web'),
    descriptions: descriptions.instance,
    scene: scene.instance,
    requirements: { descriptions,scene },
  };
}

function runtimeRequirement(
  runtime: LichtblickRuntimeProjection | undefined,
  key: LichtblickRuntimeComponentKey,
) {
  return key === 'descriptions' || key === 'scene' ? runtime?.requirements?.[key] : undefined;
}

function resolveRuntimeRequirement(
  workflowRunId: string,
  targetId: string,
  observedInstances: readonly ProcessInstance[],
  nodeSummaries: readonly AutomationNodeExecutionSummary[],
  nodeKind: string,
  definitionId: string,
  allowNoSceneClass: boolean,
): LichtblickRuntimeRequirement {
  const candidates = nodeSummaries.filter((summary) => (
    summary.runId === workflowRunId && summary.kind === nodeKind
  ));
  if (candidates.length === 0) return { state:'pending' };
  if (candidates.length > 1) {
    return { state:'failed',error:`Current Lichtblick Run has multiple ${nodeKind} node summaries.` };
  }
  const summary = candidates[0]!;
  if (summary.status === 'failed' || summary.status === 'canceled' || summary.status === 'skipped') {
    return {
      state:'failed',
      error:summary.error || `${nodeKind} ended as ${summary.status} before proving its runtime requirement.`,
    };
  }
  if (allowNoSceneClass && isNoSceneClassPublicOutput(summary.output, definitionId, targetId)) {
    return { state:'no-runtime' };
  }
  const processInstanceId = exactRunProcessIdFromPublicOutput(
    summary.output,workflowRunId,targetId,definitionId,
  );
  if (processInstanceId) {
    const instance = observedInstances.find((candidate) => candidate.id === processInstanceId);
    if (!instance) return { state:'pending' };
    if (isExactRunProcess(instance, workflowRunId, targetId, definitionId)) {
      return { state:'process',instance };
    }
  }
  if (summary.output === undefined && (summary.status === 'pending' || summary.status === 'running')) {
    return { state:'pending' };
  }
  return {
    state:'failed',
    error:`${nodeKind} did not publish its exact ${definitionId} runtime contract.`,
  };
}

function isNoSceneClassPublicOutput(
  value: unknown,
  definitionId: string,
  targetId: string,
) {
  return record(value)
    && exactKeys(value, ['definitionId','event','reason','skipped','targetId'])
    && value.definitionId === definitionId
    && value.event === 'ready'
    && value.reason === 'no-scene-class'
    && value.skipped === true
    && value.targetId === targetId;
}

function exactRunProcessIdFromPublicOutput(
  value: unknown,
  workflowRunId: string,
  targetId: string,
  definitionId: string,
): string {
  let processInstanceId = '';
  if (definitionId === 'lichtblick-robot-descriptions'
    && isExactRunProcess(value, workflowRunId, targetId, definitionId)) {
    processInstanceId = value.id;
  } else if (definitionId === 'lichtblick-robot-scene'
    && record(value)
    && exactKeys(value, ['definitionId','event','processInstanceId','targetId'])
    && value.definitionId === definitionId
    && value.event === 'ready'
    && value.targetId === targetId
    && nonEmpty(value.processInstanceId)) {
    processInstanceId = value.processInstanceId;
  }
  return processInstanceId;
}

function isExactRunProcess(
  value: unknown,
  workflowRunId: string,
  targetId: string,
  definitionId: string,
): value is ProcessInstance {
  if (!record(value) || !record(value.parameters) || !record(value.readiness) || !record(value.liveness)) return false;
  return nonEmpty(value.id) && value.targetId === targetId && value.definitionId === definitionId
    && nonEmpty(value.definitionVersion)
    && typeof value.definitionDigest === 'string' && /^[0-9a-f]{64}$/.test(value.definitionDigest)
    && value.ownerType === 'orchestration-run' && value.ownerId === workflowRunId
    && value.driver === 'host' && nonEmpty(value.scope)
    && nonEmpty(value.desiredState) && nonEmpty(value.observedState)
    && nonEmpty(value.readiness.status) && nonEmpty(value.liveness.status)
    && nonNegativeInteger(value.revision) && nonNegativeInteger(value.restartCount)
    && nonEmpty(value.createdAt) && nonEmpty(value.updatedAt);
}

function exactKeys(value: Record<string,unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key,index) => key === wanted[index]);
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function record(value: unknown): value is Record<string,unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function lichtblickRuntimeProcessReady(instance: ProcessInstance | undefined) {
  return Boolean(instance)
    && instance?.desiredState === 'running'
    && instance.observedState === 'running'
    && instance.readiness.status === 'passing'
    && instance.liveness.status === 'passing';
}

export function lichtblickRuntimeProcessFailed(instance: ProcessInstance | undefined) {
  return Boolean(instance) && (
    ['failed','lost','exited'].includes(instance!.observedState)
    || instance!.readiness.status === 'failing'
    || instance!.liveness.status === 'failing'
  );
}
