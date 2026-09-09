import { createNativeAgentClient } from '@xgc2/native-agent/client';
import { decodeProfiles,type NativeProfile,type NativeSession } from '@xgc2/native-agent/state';
import { request } from '../../api/http';
import { fetchNativeAgent,experimentServicesTransport } from '../../api/nativeAgent';

export { openNativeAgentStream as openGroundStationNativeStream } from '../../api/nativeAgent';

export type NativeDebugWorkspace = { id: string; label: string; revision: string; directory?:string };
export type ExperimentWorkspaceBinding = { experimentId:string; workspace:{id:string; revision:string}; revision:number };
export type GroundStationNativeCapabilities = {
  available: boolean;
  detail: string;
  profiles: NativeProfile[];
  workspaces: NativeDebugWorkspace[];
  executionTargetId: 'local';
  experimentServices: boolean;
  workspaceBinding: ExperimentWorkspaceBinding | null;
};

const safeId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
export function nativeExperimentPath(experimentId: string) {
  assertNativeExperimentId(experimentId);
  return `/experiments/${experimentId}/native-agents`;
}

export async function bindGroundStationWorkspace(experimentId:string,workspace:{id:string; revision:string},expectedRevision:number) {
  const result = await request<unknown>(`${nativeExperimentPath(experimentId)}/workspace`,{
    method:'POST',headers:{'Content-Type':'application/json','X-XGC-Native-Client':'1'},body:JSON.stringify({workspace,expectedRevision}),
  });
  const binding = decodeWorkspaceBinding(record(result).data);
  if (!binding || binding.experimentId !== experimentId || binding.workspace.id !== workspace.id || binding.workspace.revision !== workspace.revision) throw new Error('Experiment workspace response did not match the selection.');
  return binding;
}

export function createGroundStationNativeClient(experimentId: string,experimentServices = false) {
  return createNativeAgentClient({ basePath: `/api${nativeExperimentPath(experimentId)}`,fetch: experimentServices ? experimentServicesTransport(true) : fetchNativeAgent });
}

export async function getGroundStationNativeCapabilities(experimentId: string,signal?: AbortSignal) {
  assertNativeExperimentId(experimentId);
  return decodeGroundStationNativeCapabilities(await request<unknown>(`/experiments/${experimentId}/native-agents/capabilities`,{ signal }));
}

export function decodeGroundStationNativeCapabilities(value: unknown): GroundStationNativeCapabilities {
  const envelope = record(value), data = record(envelope.data);
  if (typeof data.available !== 'boolean' || typeof data.detail !== 'string' || data.detail.length > 4096
    || data.executionTargetId !== 'local' || !Array.isArray(data.workspaces) || data.workspaces.length > 64) {
    throw new Error('Invalid local native Agent capability response.');
  }
  const workspaces = data.workspaces.map((entry) => {
    const workspace = record(entry);
    if (typeof workspace.id !== 'string' || !safeId.test(workspace.id)
      || typeof workspace.label !== 'string' || !workspace.label.trim() || workspace.label.length > 256
      || typeof workspace.revision !== 'string' || !workspace.revision || workspace.revision.length > 256
      || /[\0\r\n]/.test(workspace.revision)) throw new Error('Invalid reviewed debug workspace.');
    if (workspace.directory !== undefined && (typeof workspace.directory !== 'string' || !workspace.directory.startsWith('/') || workspace.directory.length > 4096 || /[\0\r\n]/.test(workspace.directory))) throw new Error('Invalid workspace directory.');
    return { id: workspace.id,label: workspace.label,revision: workspace.revision,...(typeof workspace.directory === 'string' ? {directory:workspace.directory} : {}) };
  });
  if (new Set(workspaces.map(({ id }) => id)).size !== workspaces.length) throw new Error('Duplicate debug workspace identity.');
  return { experimentServices: data.experimentServices === true,available: data.available,detail: data.detail,profiles: decodeProfiles(data.profiles),workspaces,executionTargetId: 'local',workspaceBinding:decodeWorkspaceBinding(data.workspaceBinding) };
}

function decodeWorkspaceBinding(value:unknown):ExperimentWorkspaceBinding | null {
  if (value === null) return null;
  const binding = record(value), workspace = record(binding.workspace);
  if (typeof binding.experimentId !== 'string' || !safeId.test(binding.experimentId) || !Number.isSafeInteger(binding.revision) || (binding.revision as number) < 1
    || typeof workspace.id !== 'string' || !safeId.test(workspace.id) || typeof workspace.revision !== 'string' || !/^[a-f0-9]{64}$/.test(workspace.revision)) throw new Error('Invalid experiment workspace binding.');
  return {experimentId:binding.experimentId,revision:binding.revision as number,workspace:{id:workspace.id,revision:workspace.revision}};
}

export function assertNativeExperimentSession(session: NativeSession,experimentId: string) {
  if (session.scope.context.kind !== 'experiment' || session.scope.context.id !== experimentId) {
    throw new Error('The native session does not belong to this Experiment and local native Agent.');
  }
  return session;
}

function assertNativeExperimentId(experimentId: string) {
  if (!safeId.test(experimentId)) throw new Error('An exact Experiment resource ID is required.');
}

function record(value: unknown): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid native Agent response.');
  return value as Record<string,unknown>;
}

export function readGroundStationNativeAttention(signal:AbortSignal) {
 return request<unknown>('/native-agents/attention',{signal});
}
