import { useSyncExternalStore } from 'react';

type RemoteMessage = { conversationId?:string; id:string; panelId:string; names:string[]; createdAt:string; closedAt?:string };
const cache = new Map<string,readonly RemoteMessage[]>();
const listeners = new Set<() => void>();
const draftScopes = new Map<string,string>();
const draftKey = (experimentId:string) => `xgc.experiment.${experimentId}.remote-draft.v1`;
const empty:readonly RemoteMessage[] = [];
const key = (experimentId:string) => `xgc.experiment.${experimentId}.remote-messages.v1`;
function read(experimentId:string):readonly RemoteMessage[] {
  if (!experimentId) return empty;
  const cached = cache.get(experimentId);
  if (cached) return cached;
  let messages:RemoteMessage[] = [];
  try {
    const value:unknown = JSON.parse(localStorage.getItem(key(experimentId)) ?? '[]');
    if (Array.isArray(value)) messages = value.filter((item):item is RemoteMessage => Boolean(item)
      && typeof item.id === 'string' && typeof item.panelId === 'string'
      && (item.conversationId === undefined || typeof item.conversationId === 'string')
      && Array.isArray(item.names) && item.names.every((name:unknown) => typeof name === 'string')
      && typeof item.createdAt === 'string' && (item.closedAt === undefined || typeof item.closedAt === 'string'));
  } catch { /* Unavailable storage does not prevent control. */ }
  cache.set(experimentId,messages);
  return messages;
}
export function syncGroundStationRemoteMessages(experimentId:string,panelId:string,controllers:readonly {id:string;robots:readonly {name:string}[]}[],conversationId?:string) {
  if (!experimentId) return;
  const previous = read(experimentId);
  const now = new Date().toISOString();
  const ids = new Set(controllers.map(item => item.id));
  const next = previous.map(item => item.panelId === panelId && !item.closedAt && !ids.has(item.id)
    ? {...item,closedAt:now} : item);
  for (const controller of controllers) {
    if (!next.some(item => item.id === controller.id)) next.push({id:controller.id,panelId,conversationId,names:controller.robots.map(robot => robot.name),createdAt:now});
  }
  if (JSON.stringify(previous) === JSON.stringify(next)) return;
  cache.set(experimentId,next);
  try { localStorage.setItem(key(experimentId),JSON.stringify(next)); } catch { /* Keep the current session record. */ }
  for (const listener of listeners) listener();
}
export function useGroundStationRemoteMessages(experimentId:string) {
  return useSyncExternalStore(callback => {listeners.add(callback); return () => {listeners.delete(callback);};},
    () => read(experimentId),() => empty);
}

export function isGroundStationRemoteMessageClosed(experimentId:string,controllerId:string) {
  return Boolean(read(experimentId).find(item => item.id === controllerId)?.closedAt);
}

export function remoteMessagesForConversation(messages:readonly RemoteMessage[],conversationId?:string) {
  return conversationId ? messages.filter(message => message.conversationId === conversationId) : [];
}

/** A blank conversation exists locally before the first prompt creates a CLI session. */
export function remoteConversationScope(experimentId:string,selected:string | null | undefined) {
  if (selected !== null || !experimentId) return selected ?? undefined;
  let scope = draftScopes.get(experimentId);
  if (!scope) {
    try { scope = localStorage.getItem(draftKey(experimentId)) ?? undefined; } catch { /* Memory-only draft. */ }
    if (!scope?.startsWith('draft:')) scope = `draft:${crypto.randomUUID()}`;
    draftScopes.set(experimentId,scope);
    try { localStorage.setItem(draftKey(experimentId),scope); } catch { /* Memory-only draft. */ }
  }
  return scope;
}

export function startRemoteConversationDraft(experimentId:string) {
  const scope = `draft:${crypto.randomUUID()}`;
  draftScopes.set(experimentId,scope);
  try { localStorage.setItem(draftKey(experimentId),scope); } catch { /* Memory-only draft. */ }
}

export function bindRemoteConversationDraft(experimentId:string,draft:string | undefined,sessionId:string) {
  if (!draft?.startsWith('draft:')) return;
  const previous = read(experimentId);
  const next = previous.map(message => message.conversationId === draft ? {...message,conversationId:sessionId} : message);
  if (next.every((message,index) => message === previous[index])) return;
  cache.set(experimentId,next);
  try { localStorage.setItem(key(experimentId),JSON.stringify(next)); } catch { /* Keep this browser's history. */ }
  for (const listener of listeners) listener();
}
