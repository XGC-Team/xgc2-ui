import { useCallback,useEffect,useMemo,useState } from 'react';
import type { NativeRequest } from '@xgc2/native-agent/state';
import { createDeadlineTimer } from '../../shared/eventCoalescer';
import { readGroundStationNativeAttention,createGroundStationNativeClient } from './groundStationNativeAgentService';
import type { GroundStationNativeAttentionItem,GroundStationNativeBinding } from './groundStationNativeAgentTypes';

type Summary = {sessionId:string; experimentId:string; lastSeq:number; pending:Array<{id:string; kind:NativeRequest['kind']; title:string; createdAt?:string; submitted:boolean}>};
type Snapshot = {sessions:Summary[]; revision:string; receivedAt:number};

/** A single bounded summary request monitors background conversations. Full
 * permission arguments are fetched only when their decision is opened. */
export function useNativeConversationAttention(executionTargetId:string,bindings:GroundStationNativeBinding[]) {
  const [snapshot,setSnapshot] = useState<Snapshot>();
  const [error,setError] = useState('');
  const [details,setDetails] = useState<Record<string,GroundStationNativeAttentionItem>>({});
  useEffect(() => {
    if (executionTargetId !== 'local') return;
    const controller = new AbortController();
    const timer = createDeadlineTimer(() => void refresh());
    let running = false;
    const refresh = async () => {
      if (running || controller.signal.aborted) return;
      timer.cancel();
      running = true;
      try {
        const value = decodeAttention(await readGroundStationNativeAttention(controller.signal));
        if (!controller.signal.aborted) {
          setSnapshot({...value,receivedAt:Date.now()});
          setError('');
          const pending = new Set(value.sessions.flatMap(session => session.pending.map(item => `${session.sessionId}:${item.id}`)));
          setDetails(items => Object.fromEntries(Object.entries(items).filter(([id]) => pending.has(id))));
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        running = false;
        if (!controller.signal.aborted) timer.schedule(document.hidden ? 15_000 : 3_000);
      }
    };
    const visible = () => { if (!document.hidden) void refresh(); };
    void refresh();
    document.addEventListener('visibilitychange',visible);
    return () => { controller.abort(); timer.cancel(); document.removeEventListener('visibilitychange',visible); };
  },[executionTargetId]);
  const readInputs = useCallback(async (experimentId:string,sessionId:string,signal?:AbortSignal) => {
    const inputs = await createGroundStationNativeClient(experimentId).getNativeInputs(sessionId,signal);
    if (signal?.aborted) return;
    setDetails(items => ({...Object.fromEntries(Object.entries(items).filter(([,item]) => item.sessionId !== sessionId)),
      ...Object.fromEntries(inputs.map(input => {
        const id = `${sessionId}:${input.request.id}`;
        return [id,{id,experimentId,sessionId,...input}];
      }))}));
  },[]);
  const items = useMemo(() => {
    const result = new Map<string,GroundStationNativeAttentionItem>();
    for (const session of snapshot?.sessions ?? []) for (const pending of session.pending) {
      const id = `${session.sessionId}:${pending.id}`;
      result.set(id,details[id] ? {...details[id],submitted:details[id].submitted || pending.submitted} : {
        id,experimentId:session.experimentId,sessionId:session.sessionId,submitted:pending.submitted,summaryOnly:true,
        request:{id:pending.id,kind:pending.kind,title:pending.title,createdAt:pending.createdAt,options:[],questions:[]},
      });
    }
    for (const binding of bindings) {
      if (!binding.projection) continue;
      const remote = snapshot?.sessions.find(session => session.sessionId === binding.sessionId);
      const newer = remote ? binding.projection.state.cursor >= remote.lastSeq : (binding.projection.receivedAt ?? 0) > (snapshot?.receivedAt ?? 0);
      if (!newer) continue;
      for (const [id,item] of result) if (item.sessionId === binding.sessionId) result.delete(id);
      for (const pending of Object.values(binding.projection.state.pending)) {
        const id = `${binding.sessionId}:${pending.id}`;
        result.set(id,{id,experimentId:binding.experimentId,sessionId:binding.sessionId,request:pending,submitted:pending.submitted});
      }
    }
    return [...result.values()];
  },[snapshot,details,bindings]);
  return {items:executionTargetId === 'local' ? items : [],error:executionTargetId === 'local' ? error : '',readInputs};
}

function decodeAttention(value:unknown): Omit<Snapshot,'receivedAt'> {
  const object = (value:unknown): Record<string,unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid native attention response.');
    return value as Record<string,unknown>;
  };
  const safe = (value:unknown):string => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(value)) throw new Error('Invalid native attention identity.');
    return value;
  };
  const data = object(object(value).data);
  if (!Array.isArray(data.sessions) || data.sessions.length > 128 || typeof data.revision !== 'string') throw new Error('Invalid native attention inventory.');
  const sessions = data.sessions.map(raw => {
    const session = object(raw), context = object(session.context);
    if (context.kind !== 'experiment' || !Number.isSafeInteger(session.lastSeq) || (session.lastSeq as number) < 0 || !Array.isArray(session.pending) || session.pending.length > 16) throw new Error('Invalid experiment attention scope.');
    return {sessionId:safe(session.sessionId),experimentId:safe(context.id),lastSeq:session.lastSeq as number,pending:session.pending.map(raw => {
      const input = object(raw);
      if (!['permission','question','plan'].includes(input.kind as string) || typeof input.title !== 'string' || input.title.length > 4096 || typeof input.submitted !== 'boolean'
        || input.createdAt !== undefined && typeof input.createdAt !== 'string') throw new Error('Invalid native attention request.');
      return {id:safe(input.id),kind:input.kind as NativeRequest['kind'],title:input.title,submitted:input.submitted,createdAt:input.createdAt as string | undefined};
    })};
  });
  return {sessions,revision:data.revision};
}
