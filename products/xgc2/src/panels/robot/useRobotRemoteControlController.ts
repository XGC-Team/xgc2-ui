import { useEffect,useRef,useState } from 'react';

export type RemoteControlGear = 1 | 2 | 3;
export type RemoteControlAxis = -1 | 0 | 1;
export type RemoteControlIntent = {
  gear: RemoteControlGear;
  longitudinal: RemoteControlAxis;
  lateral: RemoteControlAxis;
  yaw: RemoteControlAxis;
  release?: boolean;
};

export type SubmitRemoteControlIntent = (
  controllerId: string,
  robotIds: readonly string[],
  intent: RemoteControlIntent,
) => Promise<unknown>;

type Session = {
  key: string;
  identity: string;
  controllerId: string;
  robotIds: readonly string[];
  submit: SubmitRemoteControlIntent;
  desired: RemoteControlIntent;
  inFlight?: RemoteControlIntent;
  queued?: RemoteControlIntent;
  closed: boolean;
  dispatched: boolean;
  ready: boolean;
  finishing?: { promise:Promise<void>;resolve:()=>void;reject:(cause:unknown)=>void };
  reportError: (cause: unknown) => void;
  reportConfirmed: () => void;
};

// Only closing queues live here. An exact controller remount (including
// StrictMode replay) cannot overtake its previous release on the wire.
const pendingReleases = new Map<string,Promise<void>>();

export const stoppedRemoteIntent: RemoteControlIntent = {
  gear: 1,longitudinal: 0,lateral: 0,yaw: 0,release: false,
};

export const releasedRemoteIntent: RemoteControlIntent = {
  gear: 1,longitudinal: 0,lateral: 0,yaw: 0,release: true,
};

export function useRobotRemoteControlController({
  identity,controllerId,robotIds,submit,initialIntent = stoppedRemoteIntent,onFinishReady,activateOnMount = true,canMotion = true,
}: {
  identity: string;
  controllerId: string;
  robotIds: readonly string[];
  submit: SubmitRemoteControlIntent;
  initialIntent?: RemoteControlIntent;
  activateOnMount?: boolean;
  canMotion?: boolean;
  onFinishReady?: (controllerId:string,finish:()=>Promise<void>)=>void;
}) {
  const sessionRef = useRef<Session | undefined>(undefined);
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const initialIntentRef = useRef(initialIntent);
  const finishReadyRef = useRef(onFinishReady);
  initialIntentRef.current = initialIntent;
  finishReadyRef.current = onFinishReady;
  const [state,setState] = useState({ owner: '',error: '' });
  const robotIdsKey = JSON.stringify(robotIds);

  useEffect(() => {
    if (!canMotion || !identity || robotIdsKey === '[]') return;
    const armed = initialIntentRef.current;
    const key = JSON.stringify([identity,controllerId,robotIdsKey]);
    const previousRelease = pendingReleases.get(key);
    const session: Session = {
      key,identity,controllerId,robotIds:JSON.parse(robotIdsKey) as string[],submit:submitRef.current,
      desired:armed,closed:false,dispatched:false,ready:!previousRelease,
      reportError: (cause) => setState({ owner:identity,error:messageOf(cause) }),
      reportConfirmed: () => setState((current) => (
        current.owner === identity && current.error ? { owner:identity,error:'' } : current
      )),
    };
    sessionRef.current = session;
    // The owner retains this exact queue when its window disappears. Closing
    // must drain the final zero after any request already in flight.
    finishReadyRef.current?.(controllerId,() => finishSession(session));
    // Fresh open arms a zero stream (xgc1 is_control). Restore after a page
    // reload re-asserts the last latched intent so Adapter 10 Hz matches the window.
    if (activateOnMount) {
      if (session.ready) dispatch(session, armed);
      else session.queued = armed;
    }
    if (previousRelease) void previousRelease.then(() => {
      session.ready = true;
      const queued = session.queued;
      session.queued = undefined;
      if (!session.closed && queued) dispatch(session,queued);
    }).catch((cause) => {
      if (!session.closed) session.reportError(cause);
      session.closed = true;
      session.queued = undefined;
    });
    return () => {
      // The explicit owner and automatic unmount share this same final drain.
      void finishSession(session).catch(() => undefined);
      if (sessionRef.current === session) sessionRef.current = undefined;
    };
  }, [activateOnMount,canMotion,controllerId,identity,robotIdsKey]);

  useEffect(() => {
    submitRef.current = submit;
    if (sessionRef.current?.identity === identity && !sessionRef.current.closed) sessionRef.current.submit = submit;
  }, [identity,submit]);

  function send(intent: RemoteControlIntent, force = false) {
    const session = sessionRef.current;
    if (!canMotion || !session || session.closed || session.finishing || session.identity !== identity || (!force && sameIntent(session.desired,intent))) return;
    session.desired = intent;
    setState((current) => (
      current.owner === identity && current.error ? { owner:identity,error:'' } : current
    ));
    if (session.inFlight || !session.ready) session.queued = intent;
    else dispatch(session,intent);
  }

  return {
    send,
    error: state.owner === identity ? state.error : '',
  };
}

function finishSession(session:Session):Promise<void> {
  if (session.finishing) return session.finishing.promise;
  session.closed = true;
  session.queued = undefined;
  if (!session.dispatched) return pendingReleases.get(session.key) ?? Promise.resolve();
  let resolve!:()=>void;
  let reject!:(cause:unknown)=>void;
  const promise = new Promise<void>((yes,no) => { resolve = yes;reject = no; });
  session.finishing = { promise,resolve,reject };
  pendingReleases.set(session.key,promise);
  const forget = () => { if (pendingReleases.get(session.key) === promise) pendingReleases.delete(session.key); };
  void promise.then(forget,forget);
  const release = { ...releasedRemoteIntent,gear:session.desired.gear };
  session.desired = release;
  // Replace a queued direction, even when unmount already detached its UI.
  session.queued = session.inFlight ? release : undefined;
  if (!session.inFlight) dispatch(session,release);
  return promise;
}

function dispatch(session: Session, intent: RemoteControlIntent) {
  session.dispatched = true;
  session.inFlight = intent;
  let succeeded = false;
  let failure:unknown;
  let submitted:Promise<unknown>;
  try { submitted = Promise.resolve(session.submit(session.controllerId,session.robotIds,intent)); }
  catch (cause) { submitted = Promise.reject(cause); }
  void submitted
    .then(() => {
      succeeded = true;
      if (!session.closed) session.reportConfirmed();
    })
    .catch((cause) => {
      failure = cause;
      if (!session.closed) session.reportError(cause);
    })
    .finally(() => {
      if (session.inFlight !== intent) return;
      session.inFlight = undefined;
      const queued = session.queued;
      session.queued = undefined;
      if (queued && (session.finishing || (!session.closed && !(succeeded && sameIntent(queued,intent))))) {
        dispatch(session,queued);
      } else if (session.finishing) {
        if (succeeded) session.finishing.resolve();
        else session.finishing.reject(failure);
      }
    });
}

function sameIntent(left: RemoteControlIntent,right: RemoteControlIntent) {
  return left.gear === right.gear
    && left.longitudinal === right.longitudinal
    && left.lateral === right.lateral
    && left.yaw === right.yaw
    && Boolean(left.release) === Boolean(right.release);
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
