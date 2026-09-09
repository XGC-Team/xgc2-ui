import { useEffect,useRef,useState } from 'react';

export type RemoteControlGear = 1 | 2 | 3;
export type RemoteControlAxis = -1 | 0 | 1;
export type RemoteControlIntent = {
  gear: RemoteControlGear;
  longitudinal: RemoteControlAxis;
  lateral: RemoteControlAxis;
  yaw: RemoteControlAxis;
};

export type SubmitRemoteControlIntent = (
  controllerId: string,
  robotIds: readonly string[],
  intent: RemoteControlIntent,
) => Promise<unknown>;

type Session = {
  identity: string;
  controllerId: string;
  robotIds: readonly string[];
  submit: SubmitRemoteControlIntent;
  desired: RemoteControlIntent;
  inFlight?: RemoteControlIntent;
  queued?: RemoteControlIntent;
  closed: boolean;
  dispatched: boolean;
  finishing?: { promise:Promise<void>;resolve:()=>void;reject:(cause:unknown)=>void };
  reportError: (cause: unknown) => void;
  reportConfirmed: () => void;
};

export const stoppedRemoteIntent: RemoteControlIntent = {
  gear: 1,longitudinal: 0,lateral: 0,yaw: 0,
};

export function useRobotRemoteControlController({
  identity,controllerId,robotIds,submit,initialIntent = stoppedRemoteIntent,onFinishReady,activateOnMount = true,
}: {
  identity: string;
  controllerId: string;
  robotIds: readonly string[];
  submit: SubmitRemoteControlIntent;
  initialIntent?: RemoteControlIntent;
  activateOnMount?: boolean;
  onFinishReady?: (controllerId:string,finish:()=>Promise<void>)=>void;
}) {
  const sessionRef = useRef<Session | undefined>(undefined);
  const submitRef = useRef(submit);
  const initialIntentRef = useRef(initialIntent);
  const [state,setState] = useState({ owner: '',error: '' });
  const robotIdsKey = robotIds.join(',');

  useEffect(() => {
    if (!identity || !robotIdsKey) return;
    const armed = initialIntentRef.current;
    const session: Session = {
      identity,controllerId,robotIds:robotIdsKey.split(','),submit:submitRef.current,
      desired:armed,closed:false,dispatched:false,
      reportError: (cause) => setState({ owner:identity,error:messageOf(cause) }),
      reportConfirmed: () => setState((current) => (
        current.owner === identity && current.error ? { owner:identity,error:'' } : current
      )),
    };
    sessionRef.current = session;
    // The owner retains this exact queue when its window disappears. Closing
    // must drain the final zero after any request already in flight.
    onFinishReady?.(controllerId,() => finishSession(session));
    // Fresh open arms a zero stream (xgc1 is_control). Restore after a page
    // reload re-asserts the last latched intent so Adapter 10 Hz matches the window.
    if (activateOnMount) dispatch(session, armed);
    return () => {
      session.closed = true;
      if (!session.finishing) session.queued = undefined;
      if (sessionRef.current === session) sessionRef.current = undefined;
    };
  }, [activateOnMount,controllerId,identity,onFinishReady,robotIdsKey]);

  useEffect(() => {
    submitRef.current = submit;
    if (sessionRef.current?.identity === identity && !sessionRef.current.finishing) sessionRef.current.submit = submit;
  }, [identity,submit]);

  function send(intent: RemoteControlIntent, force = false) {
    const session = sessionRef.current;
    if (!session || session.closed || session.finishing || session.identity !== identity || (!force && sameIntent(session.desired,intent))) return;
    session.desired = intent;
    setState((current) => (
      current.owner === identity && current.error ? { owner:identity,error:'' } : current
    ));
    if (session.inFlight) session.queued = intent;
    else dispatch(session,intent);
  }

  return {
    send,
    error: state.owner === identity ? state.error : '',
  };
}

function finishSession(session:Session):Promise<void> {
  if (session.finishing) return session.finishing.promise;
  if (!session.dispatched) return Promise.resolve();
  let resolve!:()=>void;
  let reject!:(cause:unknown)=>void;
  const promise = new Promise<void>((yes,no) => { resolve = yes;reject = no; });
  session.finishing = { promise,resolve,reject };
  session.desired = stoppedRemoteIntent;
  // Replace a queued direction, even when unmount already detached its UI.
  session.queued = session.inFlight ? stoppedRemoteIntent : undefined;
  if (!session.inFlight) dispatch(session,stoppedRemoteIntent);
  return promise;
}

function dispatch(session: Session, intent: RemoteControlIntent) {
  session.dispatched = true;
  session.inFlight = intent;
  let succeeded = false;
  let failure:unknown;
  void session.submit(session.controllerId,session.robotIds,intent)
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
    && left.yaw === right.yaw;
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
