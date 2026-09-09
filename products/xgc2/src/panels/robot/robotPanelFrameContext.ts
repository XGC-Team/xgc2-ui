import { createContext,useContext } from 'react';

export type RobotControlView = 'px4' | 'ground';

/** Header launcher for the shared Remote teleop controller. */
export type RobotRemoteControlLauncher = {
  open: () => void;
  disabled: boolean;
  title: string;
  activeCount: number;
};

export type RobotControlFrameState = {
  panelId: string;
  view: RobotControlView;
  setView: (view: RobotControlView) => void;
  remoteControl: RobotRemoteControlLauncher | null;
  setRemoteControl: (control: RobotRemoteControlLauncher | null) => void;
};

export const RobotControlFrameContext = createContext<RobotControlFrameState | null>(null);

export function useRobotControlFrame(panelId: string) {
  const frame = useContext(RobotControlFrameContext);
  if (!frame) {
    throw new Error(`Robot control panel ${panelId} must be rendered inside its registered frame provider.`);
  }
  return frame;
}

export function useRobotControlView(panelId: string): RobotControlView {
  const frame = useRobotControlFrame(panelId);
  return frame.view;
}
