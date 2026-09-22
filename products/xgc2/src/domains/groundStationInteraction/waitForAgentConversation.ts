import { createDeadlineTimer } from '../../shared/eventCoalescer';
import type { AgentSession } from '@xgc2/agent-runtime/state';
import { assertNativeExperimentSession,createGroundStationNativeClient,nativeExperimentPath,openGroundStationAgentStream } from './groundStationAgentService';

/** A first send waits for this runtime's journal. It never replays a prompt. */
export async function waitForAgentConversation(experimentId:string,sessionId:string):Promise<AgentSession> {
  const client = createGroundStationNativeClient(experimentId);
  const initial = assertNativeExperimentSession(await client.getNativeSession(sessionId),experimentId);
  if (initial.state === 'ready') return initial;
  if (initial.state !== 'starting' && initial.state !== 'disconnected' && initial.state !== 'closed') {
    throw new Error('The assistant could not prepare this conversation.');
  }
  return new Promise((resolve,reject) => {
    const transport:{stream?:ReturnType<typeof openGroundStationAgentStream>} = {};
    let done = false;
    const finish = (error?:unknown,session?:AgentSession) => {
      if (done) return;
      done = true; timeout.cancel(); transport.stream?.close();
      if (error) reject(error); else resolve(session!);
    };
    const timeout = createDeadlineTimer(() => finish(new Error('The assistant did not become ready. Your message has not been sent.')));
    timeout.schedule(70_000);
    const check = async () => {
      try {
        const session = assertNativeExperimentSession(await client.getNativeSession(sessionId),experimentId);
        if (session.runtimeId !== initial.runtimeId) finish(new Error('The assistant changed while preparing this message. Please send it again.'));
        else if (session.state === 'ready') finish(undefined,session);
        else if (session.state !== 'starting' && session.state !== 'disconnected' && session.state !== 'closed') {
          finish(new Error('The assistant could not prepare this conversation.'));
        }
      } catch (cause) { finish(cause); }
    };
    transport.stream = openGroundStationAgentStream({
      url:`/api${nativeExperimentPath(experimentId)}/sessions/${sessionId}/events`,lastEventId:()=>String(initial.lastSeq),
      onOpen:()=>void check(),
      onEvent:event => { if (event && typeof event === 'object' && 'kind' in event && event.kind === 'session.state') void check(); },
      onError:cause => finish(cause ?? new Error('The assistant became unavailable before sending.')),
      onInvalid:cause => finish(cause),
    });
    if (done) transport.stream.close();
  });
}
