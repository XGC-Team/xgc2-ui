import { useCallback,useEffect,useRef,useState } from 'react';
import type { NativeSession } from '@xgc2/native-agent/state';
import { assertNativeExperimentSession,createGroundStationNativeClient,nativeExperimentPath } from './groundStationNativeAgentService';
import type { GroundStationNativeBinding,NativeConversationInventory } from './groundStationNativeAgentTypes';

import { startRemoteConversationDraft } from './groundStationRemoteMessages';

const SELECTION_KEY = 'xgc.ground-station.conversation-selection.v2';
const LEGACY_KEY = 'xgc.ground-station.native-agent.bindings.v1';

/** Server journals define existence; browser storage only remembers selection. */
export function useGroundStationConversationIndex(executionTargetId: string,focusedExperimentId: string) {
  const [bindings,setBindings] = useState<GroundStationNativeBinding[]>([]);
  const [selected,setSelected] = useState<Record<string,string | null>>(readSelection);
  const [inventories,setInventories] = useState<Record<string,NativeConversationInventory>>({});
  const requests = useRef(new Map<string,number>());
  const current = useRef({bindings,selected,inventories,executionTargetId});
  current.current = {bindings,selected,inventories,executionTargetId};
  useEffect(() => {
    try {
      localStorage.setItem(SELECTION_KEY,JSON.stringify(selected));
      localStorage.removeItem(LEGACY_KEY);
    } catch { /* Selection is optional; history remains on the workstation. */ }
  },[selected]);

  const upsert = useCallback((experimentId: string,sessions: NativeSession[]) => {
    for (const session of sessions) assertNativeExperimentSession(session,experimentId);
    setBindings(items => {
      const byID = new Map(items.map(item => [item.sessionId,item]));
      for (const session of sessions) {
        const previous = byID.get(session.id);
        if (previous?.session && previous.session.lastSeq > session.lastSeq) continue;
        byID.set(session.id,{...previous,experimentId,sessionId:session.id,session,reload:previous?.reload ?? 0,error:undefined});
      }
      return [...byID.values()];
    });
  },[]);

  const refresh = useCallback(async (experimentId: string,signal?: AbortSignal,more = false) => {
    nativeExperimentPath(experimentId);
    if (current.current.executionTargetId !== 'local') return;
    const requestId = (requests.current.get(experimentId) ?? 0) + 1;
    requests.current.set(experimentId,requestId);
    const stale = () => signal?.aborted || current.current.executionTargetId !== 'local' || requests.current.get(experimentId) !== requestId;
    const after = more ? current.current.inventories[experimentId]?.nextCursor : undefined;
    setInventories(items => ({...items,[experimentId]:{...items[experimentId],loading:true,error:''}}));
    try {
      const api = createGroundStationNativeClient(experimentId);
      const page = await api.getNativeSessionPage(signal,{after});
      if (stale()) return;
      upsert(experimentId,page.sessions);
      const preferred = current.current.selected[experimentId];
      if (preferred && !page.sessions.some(session => session.id === preferred) && !current.current.bindings.some(item => item.sessionId === preferred)) {
        try {
          const session = await api.getNativeSession(preferred,signal);
          if (stale()) return;
          upsert(experimentId,[session]);
        }
        catch (cause) {
          if (stale()) return;
          if (!(cause instanceof Error) || !('status' in cause) || cause.status !== 404) throw cause;
          setSelected(items => items[experimentId] === preferred ? {...items,[experimentId]:page.sessions.find(session => !session.archived)?.id ?? null} : items);
        }
      }
      if (stale()) return;
      setSelected(items => items[experimentId] === undefined ? {...items,[experimentId]:page.sessions.find(session => !session.archived)?.id ?? null} : items);
      setInventories(items => ({...items,[experimentId]:{loading:false,error:'',nextCursor:page.nextCursor}}));
    } catch (cause) {
      if (!stale()) setInventories(items => ({...items,[experimentId]:{...items[experimentId],loading:false,error:cause instanceof Error ? cause.message : String(cause)}}));
    }
  },[upsert]);
  useEffect(() => {
    if (!focusedExperimentId || executionTargetId !== 'local') return;
    const controller = new AbortController();
    void refresh(focusedExperimentId,controller.signal);
    return () => controller.abort();
  },[executionTargetId,focusedExperimentId,refresh]);

  const select = useCallback((experimentId: string,sessionId: string | null) => {
    nativeExperimentPath(experimentId);
    if (sessionId !== null) {
      const binding = current.current.bindings.find(item => item.sessionId === sessionId && item.experimentId === experimentId);
      if (!binding?.session) throw new Error('Choose a conversation from this experiment.');
    }
    if (sessionId === null) startRemoteConversationDraft(experimentId);
    setSelected(items => ({...items,[experimentId]:sessionId}));
  },[]);
  const chooseCreated = useCallback((experimentId: string,session: NativeSession) => {
    upsert(experimentId,[session]);
    setSelected(items => ({...items,[experimentId]:session.id}));
  },[upsert]);
  return {bindings,setBindings,selected,inventories,refresh,select,upsert,chooseCreated};
}

function readSelection(): Record<string,string | null> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(SELECTION_KEY) ?? 'null');
    const result: Record<string,string | null> = {};
    const safe = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      for (const [experimentId,sessionId] of Object.entries(stored)) {
        if (safe.test(experimentId) && (sessionId === null || typeof sessionId === 'string' && safe.test(sessionId))) result[experimentId] = sessionId;
      }
      return result;
    }
    // Import the old selection once, without treating it as the session index.
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? 'null') as {version?:number; bindings?:Array<{experimentId?:unknown; sessionId?:unknown}>} | null;
    if (legacy?.version === 1 && Array.isArray(legacy.bindings)) for (const entry of legacy.bindings) {
      if (typeof entry.experimentId === 'string' && safe.test(entry.experimentId) && typeof entry.sessionId === 'string' && safe.test(entry.sessionId)) result[entry.experimentId] = entry.sessionId;
    }
    return result;
  } catch { return {}; }
}
