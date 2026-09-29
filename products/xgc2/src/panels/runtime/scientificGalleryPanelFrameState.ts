import { createContext,useContext } from 'react';

export type ScientificGalleryView = 'gallery' | 'recordings' | 'video' | 'workflow';

export type ScientificGalleryBagActionModel = {
  bagId: string;
  removing: boolean;
  runDisabled: boolean;
  runTitle?: string;
  running: boolean;
  onDelete: () => void;
  onRun: () => void;
  onStop: () => void;
};

export type ScientificGalleryRecordingSearchModel = {
  query: string;
  placeholder: string;
  onChange: (query: string) => void;
};

export type ScientificGalleryRecordingActionsModel = {
  recordingId: string;
  removing: boolean;
  stopLabel: string;
  removeLabel: string;
  onStop: () => void;
  onDelete: () => void;
};

export type ScientificGalleryFrameState = {
  panelId: string;
  view: ScientificGalleryView;
  setView: (view: ScientificGalleryView) => void;
  bagActions: ScientificGalleryBagActionModel | null;
  setBagActions: (next: ScientificGalleryBagActionModel | null) => void;
  recordingSearch: ScientificGalleryRecordingSearchModel | null;
  setRecordingSearch: (next: ScientificGalleryRecordingSearchModel | null) => void;
  recordingActions: ScientificGalleryRecordingActionsModel | null;
  setRecordingActions: (next: ScientificGalleryRecordingActionsModel | null) => void;
};

export const ScientificGalleryFrameContext = createContext<ScientificGalleryFrameState | null>(null);

export function useScientificGalleryFrame(panelId: string) {
  const frame = useContext(ScientificGalleryFrameContext);
  if (!frame || frame.panelId !== panelId) {
    throw new Error(`Scientific gallery panel ${panelId} must be rendered inside its registered frame provider.`);
  }
  return frame;
}
