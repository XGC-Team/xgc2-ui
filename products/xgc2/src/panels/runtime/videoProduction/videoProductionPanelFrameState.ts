import { createContext,useContext,useState } from 'react';

export type VideoProductionView = 'studio' | 'renders';

export type VideoProductionFrameState = {
  panelId: string;
  view: VideoProductionView;
  setView: (view: VideoProductionView) => void;
};

export const VideoProductionFrameContext = createContext<VideoProductionFrameState | null>(null);

export function useVideoProductionView(panelId: string): readonly [VideoProductionView,(view: VideoProductionView) => void] {
  const frame = useContext(VideoProductionFrameContext);
  const standalone = useState<VideoProductionView>('studio');
  if (!frame || frame.panelId !== panelId) return standalone;
  return [frame.view,frame.setView];
}
