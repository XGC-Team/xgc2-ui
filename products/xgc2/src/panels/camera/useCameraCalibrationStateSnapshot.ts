import { useCallback,useEffect,useRef,useState,type Dispatch,type SetStateAction } from 'react';
import { isCameraCalibrationTeardownError } from './cameraCalibrationTeardownError';

/**
 * Reads one calibration state snapshot at an observable execution boundary.
 *
 * `revision` comes from the execution snapshot/cursor SSE projection. It is an
 * invalidation token, not a timer: the camera service is read once when the
 * process identity, visibility, or durable process revision changes. Mutating
 * controls call `refresh` at their exact response boundary.
 */
export function useCameraCalibrationStateSnapshot<State>({
  sessionKey,
  enabled,
  revision,
  load,
}: {
  sessionKey: string;
  enabled: boolean;
  revision: number;
  load: (signal: AbortSignal) => Promise<State>;
}): {
  state: State | undefined;
  setState: Dispatch<SetStateAction<State | undefined>>;
  error: string;
  refresh: () => Promise<void>;
} {
  const [snapshot, setSnapshot] = useState<{
    sessionKey: string;
    state: State | undefined;
    error: string;
  }>(() => ({ sessionKey,state: undefined,error: '' }));
  const activeSessionRef = useRef(sessionKey);
  const requestRef = useRef<{ sessionKey: string;controller: AbortController } | undefined>(undefined);
  activeSessionRef.current = sessionKey;

  const state = snapshot.sessionKey === sessionKey ? snapshot.state : undefined;
  const error = snapshot.sessionKey === sessionKey ? snapshot.error : '';

  const setState = useCallback<Dispatch<SetStateAction<State | undefined>>>((next) => {
    setSnapshot((current) => {
      if (activeSessionRef.current !== sessionKey) return current;
      const previous = current.sessionKey === sessionKey ? current.state : undefined;
      const stateValue = typeof next === 'function'
        ? (next as (value: State | undefined) => State | undefined)(previous)
        : next;
      return {
        sessionKey,
        state: stateValue,
        error: current.sessionKey === sessionKey ? current.error : '',
      };
    });
  }, [sessionKey]);

  useEffect(() => {
    requestRef.current?.controller.abort();
    requestRef.current = undefined;
    setSnapshot({ sessionKey,state: undefined,error: '' });
    return () => {
      if (requestRef.current?.sessionKey === sessionKey) {
        requestRef.current.controller.abort();
        requestRef.current = undefined;
      }
    };
  }, [sessionKey]);

  const refresh = useCallback(async () => {
    requestRef.current?.controller.abort();
    const controller = new AbortController();
    const requestSessionKey = sessionKey;
    requestRef.current = { sessionKey: requestSessionKey,controller };
    try {
      const next = await load(controller.signal);
      if (isCurrentRequest(requestRef.current, activeSessionRef.current, requestSessionKey, controller)) {
        setSnapshot({ sessionKey: requestSessionKey,state: next,error: '' });
      }
    } catch (cause) {
      if (!isAbort(cause)
          && !isCameraCalibrationTeardownError(cause)
          && isCurrentRequest(requestRef.current, activeSessionRef.current, requestSessionKey, controller)) {
        setSnapshot((current) => ({
          sessionKey: requestSessionKey,
          state: current.sessionKey === requestSessionKey ? current.state : undefined,
          error: messageOf(cause),
        }));
      }
    } finally {
      if (requestRef.current?.controller === controller) requestRef.current = undefined;
    }
  }, [load,sessionKey]);

  useEffect(() => {
    if (!enabled) {
      requestRef.current?.controller.abort();
      requestRef.current = undefined;
      setSnapshot((current) => current.sessionKey === sessionKey
        ? { ...current,error:'' } : current);
      return;
    }
    void refresh();
  }, [enabled,refresh,revision,sessionKey]);

  return { state,setState,error,refresh };
}

function isCurrentRequest(
  current: { sessionKey: string;controller: AbortController } | undefined,
  activeSessionKey: string,
  requestSessionKey: string,
  controller: AbortController,
) {
  return !controller.signal.aborted
    && activeSessionKey === requestSessionKey
    && current?.sessionKey === requestSessionKey
    && current.controller === controller;
}

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
