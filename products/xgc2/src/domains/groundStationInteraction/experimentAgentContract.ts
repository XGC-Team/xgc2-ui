export const AGENT_ACTION_SCHEMA = 'xgc.experiment-agent-action/v1' as const;
export type ExperimentAgentAction = {
  schema: typeof AGENT_ACTION_SCHEMA;
  delegationId: string; conversationId: string; targetId: 'local'; experimentId: string;
  sessionId: string; openingRunId: string; openingSnapshotDigest: string;
  experimentCommitId: string; experimentDigest: string; robotSelectionDigest: string;
  bindingId?: string; bundleDigest: string; automationId: string; automationCommitId: string;
  actionId: string; actionLabel: string; entrypointNodeId: string; entrypointVersion: number;
  parameters: Record<string,unknown>; requiredCapabilities: string[]; requestDigest: string;
  sourceEventKey: string; eventId: string; runId: string;
  lifecycle?: {operation:'start'|'stop'|'restart'; runMode:string; reviewSnapshotId:string; reviewSnapshotDigest:string; previousSessionId?:string};
};
export type AgentAdmission = { commandId: string; eventId: string; runId: string; status: 'accepted' };
const identities = ['delegationId','conversationId','experimentId','sessionId','openingRunId','experimentCommitId',
  'automationId','automationCommitId','actionId','entrypointNodeId','sourceEventKey','eventId','runId'] as const;
const digests = ['openingSnapshotDigest','experimentDigest','robotSelectionDigest','bundleDigest','requestDigest'] as const;
const keys: readonly string[] = ['schema','targetId',...identities,...digests,'bindingId','actionLabel','entrypointVersion','parameters','requiredCapabilities','lifecycle'];
function record(value: unknown): Record<string,unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : undefined;
}
function bounded(value: unknown,max: number) { return typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value && !/[\0\r\n\t]/.test(value); }
/** A malformed executable intent must never become an ordinary approval. */
export function decodeExperimentAgentAction(value: unknown): ExperimentAgentAction | null | undefined {
  if (value === undefined) return undefined;
  const item = record(value);
  const lifecycle = item?.lifecycle === undefined ? undefined : record(item.lifecycle);
  if (item?.lifecycle !== undefined && (!lifecycle || Object.keys(lifecycle).some(key => !['operation','runMode','reviewSnapshotId','reviewSnapshotDigest','previousSessionId'].includes(key))
    || !['start','stop','restart'].includes(lifecycle.operation as string) || typeof lifecycle.runMode !== 'string' || lifecycle.runMode.length > 64
    || lifecycle.operation !== 'stop' && !bounded(lifecycle.runMode,64)
    || !bounded(lifecycle.reviewSnapshotId,255) || !bounded(lifecycle.reviewSnapshotDigest,128)
    || lifecycle.previousSessionId !== undefined && !bounded(lifecycle.previousSessionId,255)
    || lifecycle.operation !== 'start' && lifecycle.previousSessionId !== item.sessionId)) return null;
  const starting = lifecycle?.operation === 'start';
  if (!item || Object.keys(item).some((key) => !keys.includes(key)) || item.schema !== AGENT_ACTION_SCHEMA || item.targetId !== 'local'
    || !identities.every((key) => starting && (key === 'sessionId' || key === 'openingRunId') ? item[key] === '' : bounded(item[key],255))
    || !digests.every((key) => starting && key === 'openingSnapshotDigest' ? item[key] === '' : bounded(item[key],128))
    || (item.bindingId !== undefined && !bounded(item.bindingId,128)) || typeof item.actionLabel !== 'string' || item.actionLabel.length > 512
    || typeof item.entrypointVersion !== 'number' || !Number.isSafeInteger(item.entrypointVersion) || item.entrypointVersion < 1
    || !record(item.parameters) || new TextEncoder().encode(JSON.stringify(item.parameters)).length > 8192
    || !Array.isArray(item.requiredCapabilities) || item.requiredCapabilities.length > 64
    || !item.requiredCapabilities.every((capability) => bounded(capability,128))
    || new Set(item.requiredCapabilities).size !== item.requiredCapabilities.length) return null;
  return item as ExperimentAgentAction;
}
export function decodeAgentAdmission(value: unknown): AgentAdmission | null | undefined {
  if (value === undefined) return undefined;
  const item = record(value);
  if (!item || Object.keys(item).some((key) => !['commandId','eventId','runId','status'].includes(key)) || item.status !== 'accepted'
    || !['commandId','eventId','runId'].every((key) => bounded(item[key],255))) return null;
  return item as AgentAdmission;
}
