import { useCallback,useEffect,useRef,useState } from 'react';
import { isCameraCalibrationTeardownError } from './cameraCalibrationTeardownError';

/** One immutable JPEG read for a user-visible capture boundary. Live video is WebRTC. */
export function useCameraCalibrationImageSnapshot({
  sessionKey,
  load,
  enabled = true,
}: {
  sessionKey: string;
  load: (signal: AbortSignal) => Promise<Blob>;
  enabled?: boolean;
}) {
  const [snapshot, setSnapshot] = useState(() => ({ sessionKey,imageUrl: '',error: '' }));
  const activeSessionRef = useRef(sessionKey);
  const objectUrlRef = useRef('');
  const requestRef = useRef<{ sessionKey: string;controller: AbortController } | undefined>(undefined);
  const queuedRefreshRef = useRef(false);
  const enabledRef = useRef(enabled);
  activeSessionRef.current = sessionKey;
  enabledRef.current = enabled;

  const imageUrl = snapshot.sessionKey === sessionKey ? snapshot.imageUrl : '';
  const error = snapshot.sessionKey === sessionKey ? snapshot.error : '';

  const clear = useCallback(() => {
    queuedRefreshRef.current = false;
    requestRef.current?.controller.abort();
    requestRef.current = undefined;
    revokeObjectUrl(objectUrlRef);
    setSnapshot({ sessionKey,imageUrl: '',error: '' });
  }, [sessionKey]);

  useEffect(() => {
    queuedRefreshRef.current = false;
    requestRef.current?.controller.abort();
    requestRef.current = undefined;
    revokeObjectUrl(objectUrlRef);
    setSnapshot({ sessionKey,imageUrl: '',error: '' });
    return () => {
      if (requestRef.current?.sessionKey === sessionKey) {
        requestRef.current.controller.abort();
        requestRef.current = undefined;
      }
      revokeObjectUrl(objectUrlRef);
    };
  }, [sessionKey]);

  useEffect(() => {
    if (enabled) return;
    queuedRefreshRef.current = false;
    requestRef.current?.controller.abort();
    requestRef.current = undefined;
    setSnapshot((current) => current.sessionKey === sessionKey
      ? { ...current,error:'' } : current);
  }, [enabled,sessionKey]);

  const refresh = useCallback(async () => {
    if (!enabledRef.current) return;
    const currentRequest = requestRef.current;
    if (currentRequest?.sessionKey === sessionKey) {
      queuedRefreshRef.current = true;
      return;
    }
    currentRequest?.controller.abort();
    requestRef.current = undefined;
    const requestSessionKey = sessionKey;
    do {
      queuedRefreshRef.current = false;
      const controller = new AbortController();
      requestRef.current = { sessionKey: requestSessionKey,controller };
      try {
        const blob = await load(controller.signal);
        if (isCurrentRequest(requestRef.current, activeSessionRef.current, requestSessionKey, controller)) {
          const nextUrl = URL.createObjectURL(blob);
          replaceObjectUrl(nextUrl, objectUrlRef);
          setSnapshot({ sessionKey: requestSessionKey,imageUrl: nextUrl,error: '' });
        }
      } catch (cause) {
        if (!isAbort(cause)
            && !isCameraCalibrationTeardownError(cause)
            && isCurrentRequest(requestRef.current, activeSessionRef.current, requestSessionKey, controller)) {
          setSnapshot((current) => ({
            sessionKey: requestSessionKey,
            imageUrl: current.sessionKey === requestSessionKey ? current.imageUrl : '',
            error: messageOf(cause),
          }));
        }
      } finally {
        if (requestRef.current?.controller === controller) requestRef.current = undefined;
      }
    } while (enabledRef.current && queuedRefreshRef.current
      && activeSessionRef.current === requestSessionKey);
  }, [load,sessionKey]);

  return { imageUrl,error,refresh,clear };
}

function replaceObjectUrl(next: string, reference: { current: string }) {
  const previous = reference.current;
  reference.current = next;
  if (previous) URL.revokeObjectURL(previous);
}

function revokeObjectUrl(reference: { current: string }) {
  const current = reference.current;
  reference.current = '';
  if (current) URL.revokeObjectURL(current);
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
