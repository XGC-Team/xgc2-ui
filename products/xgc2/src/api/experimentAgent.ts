import { HTTPError,request } from './http';

export const STATION_AUTH_CHANGED = 'xgc-station-auth-changed';
export type AgentDelegation = {
  id: string; scope: { conversationId: string; experimentId: string; targetId: 'local' };
  canPropose: boolean; expiresAt: string; ownerStationId: string;
};
const identifier = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
function agentPath(experimentId: string) {
  if (!identifier.test(experimentId)) throw new Error('An exact experiment is required.');
  return `/experiments/${experimentId}/agent-delegations`;
}
export async function signInAgentStation(fingerprint: string,inviteToken: string,stationCredential: string) {
  const value = await request<unknown>('/access/sessions',{ method:'POST',body:JSON.stringify({name:'Operator',fingerprint,inviteToken,stationCredential}) });
  if (!value || typeof value !== 'object' || !('stationToken' in value) || typeof value.stationToken !== 'string' || !value.stationToken || value.stationToken.length > 4096) {
    throw new Error('Invalid station session response.');
  }
  window.localStorage.setItem('xgcStationToken',value.stationToken);
  window.dispatchEvent(new Event(STATION_AUTH_CHANGED));
}
export async function signOutAgentStation() {
  try { await request<void>('/access/sessions/current',{method:'DELETE'}); }
  catch (cause) { if (!(cause instanceof HTTPError && cause.status === 401)) throw cause; }
  window.localStorage.removeItem('xgcStationToken');
  window.dispatchEvent(new Event(STATION_AUTH_CHANGED));
}
export async function getExperimentAgentDelegations(experimentId: string,signal?: AbortSignal): Promise<AgentDelegation[]> {
  const value = await request<unknown>(agentPath(experimentId),{signal});
  if (!Array.isArray(value) || value.length > 256) throw new Error('Invalid delegation inventory.');
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid delegation.');
    const item = entry as Partial<AgentDelegation>;
    if (typeof item.id !== 'string' || !/^ag_[a-f0-9]{32}$/.test(item.id) || item.scope?.experimentId !== experimentId
      || item.scope.targetId !== 'local' || !identifier.test(item.scope.conversationId) || typeof item.canPropose !== 'boolean'
      || typeof item.expiresAt !== 'string' || !Number.isFinite(Date.parse(item.expiresAt)) || typeof item.ownerStationId !== 'string') throw new Error('Invalid delegation scope.');
    return item as AgentDelegation;
  });
}
export async function revokeExperimentAgentDelegation(experimentId: string,delegationId: string) {
  if (!/^ag_[a-f0-9]{32}$/.test(delegationId)) throw new Error('Invalid delegation ID.');
  await request<void>(`${agentPath(experimentId)}/${delegationId}`,{method:'DELETE'});
}
