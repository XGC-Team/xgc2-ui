import { createContext,useContext } from 'react';

export type GazeboWorldCameraView = 'image' | 'workflow';

/** Header launcher for the extrinsic-calibration dialog. */
export type GazeboWorldCameraCalibrationAccess = {
  canOpen: boolean;
  disabledReason: string;
};

export type GazeboWorldCameraPoseAccess = {
  canOpen: boolean;
  disabledReason: string;
};

export type GazeboWorldCameraFrameState = {
  panelId: string;
  view: GazeboWorldCameraView;
  setView: (view: GazeboWorldCameraView) => void;
  calibrationOpen: boolean;
  setCalibrationOpen: (open: boolean) => void;
  calibrationAccess: GazeboWorldCameraCalibrationAccess | null;
  setCalibrationAccess: (access: GazeboWorldCameraCalibrationAccess | null) => void;
  poseOpen: boolean;
  setPoseOpen: (open: boolean) => void;
  poseAccess: GazeboWorldCameraPoseAccess | null;
  setPoseAccess: (access: GazeboWorldCameraPoseAccess | null) => void;
};

export const GazeboWorldCameraFrameContext = createContext<GazeboWorldCameraFrameState | null>(null);

export function useGazeboWorldCameraFrame(panelId: string) {
  const frame = useContext(GazeboWorldCameraFrameContext);
  if (!frame || frame.panelId !== panelId) throw new Error(`Gazebo world camera ${panelId} has no frame provider.`);
  return frame;
}
