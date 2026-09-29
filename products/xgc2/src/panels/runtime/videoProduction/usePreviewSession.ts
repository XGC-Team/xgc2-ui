import { useCallback,useRef,useState } from 'react';
import {
  createVideoPreviewSession,getVideoPreviewFrameMap,getVideoPreviewSession,isVideoPreviewSessionGone,
  type VideoPreviewFramePlan,type VideoPreviewSessionRequest,
} from '../../../domains/recording/recordingPublic';
import { usePolling } from '../../../hooks/usePolling';

export type PreviewSessionState =
  | { phase: 'idle' }
  | { phase: 'preparing';fingerprint: string;sessionId: string }
  | { phase: 'ready';fingerprint: string;sessionId: string;frameCount: number;snapshotSha256: string;plans: VideoPreviewFramePlan[] }
  | { phase: 'failed';fingerprint: string;error: string };

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * One interactive preview session at a time. Admission and preparation are
 * Core-owned; this hook only polls the persisted status and, once ready, the
 * output-grid frame map. A newer start() supersedes any in-flight polling.
 */
export function usePreviewSession(experimentId: string) {
  const [state,setState] = useState<PreviewSessionState>({ phase: 'idle' });
  const generation = useRef(0);
  const start = useCallback((value: VideoPreviewSessionRequest,fingerprint: string) => {
    const ticket = ++generation.current;
    setState({ phase: 'preparing',fingerprint,sessionId: '' });
    void createVideoPreviewSession(experimentId,value).then((created) => {
      if (generation.current !== ticket) return;
      if (!created.sessionId) throw new Error('Preview admission returned no session.');
      setState({ phase: 'preparing',fingerprint,sessionId: created.sessionId });
    }).catch((cause: unknown) => {
      if (generation.current === ticket) setState({ phase: 'failed',fingerprint,error: message(cause) });
    });
  },[experimentId]);
  const reset = useCallback(() => { generation.current += 1;setState({ phase: 'idle' }); },[]);
  const preparing = state.phase === 'preparing' && Boolean(state.sessionId);
  usePolling({
    enabled: preparing,intervalMs: 2000,pollKey: `${experimentId}:${preparing ? state.sessionId : ''}`,
    task: async () => {
      if (state.phase !== 'preparing' || !state.sessionId) return;
      const fingerprint = state.fingerprint;
      const sessionId = state.sessionId;
      try {
        const value = await getVideoPreviewSession(experimentId,sessionId);
        if (value.sessionId !== sessionId) throw new Error('Preview session scope mismatch.');
        if (value.status === 'ready') {
          const snapshotSha256 = value.snapshotSha256;
          if (!snapshotSha256) throw new Error('Ready preview has no snapshot receipt.');
          const map = await getVideoPreviewFrameMap(experimentId,sessionId);
          const plans = Array.isArray(map.plans) ? map.plans : [];
          setState((current) => (current.phase === 'preparing' && current.sessionId === sessionId)
            ? { phase: 'ready',fingerprint,sessionId,frameCount: value.frameCount ?? plans.length,snapshotSha256,plans }
            : current);
          return;
        }
        if (value.status === 'failed') {
          setState((current) => (current.phase === 'preparing' && current.sessionId === sessionId)
            ? { phase: 'failed',fingerprint,error: value.error || 'Preview session failed.' }
            : current);
        }
      } catch (cause) {
        // 404 means unknown/expired session: terminal. Other failures retry on the next tick.
        if (isVideoPreviewSessionGone(cause)) {
          setState((current) => (current.phase === 'preparing' && current.sessionId === sessionId)
            ? { phase: 'failed',fingerprint,error: 'The preview session expired.' }
            : current);
        }
      }
    },
  });
  return { ...state,start,reset };
}
