import { createContext,useContext } from 'react';

export type CameraVideoViewerState = 'connecting' | 'disconnected' | 'failed' | 'playing' | 'waiting';

export type CameraVideoViewerControl = {
  requested: boolean;
  state: CameraVideoViewerState;
  connect: () => void;
  disconnect: () => void;
  retry: () => void;
};

export type CameraVideoMediaControl = {
  bindingId: string;
  runId: string;
  state: string;
  running: boolean;
  restarting: boolean;
  restartDisabledReason: string;
  restart: () => Promise<void>;
};

export type CameraVideoFrameState = {
  panelId: string;
  viewer: CameraVideoViewerControl | null;
  setViewer: (viewer: CameraVideoViewerControl | null) => void;
  media: CameraVideoMediaControl | null;
  setMedia: (media: CameraVideoMediaControl | null) => void;
};

export const CameraVideoFrameContext = createContext<CameraVideoFrameState | null>(null);

export function useCameraVideoFrame(panelId: string) {
  const frame = useContext(CameraVideoFrameContext);
  if (!frame || frame.panelId !== panelId) throw new Error(`Camera video ${panelId} has no frame provider.`);
  return frame;
}
