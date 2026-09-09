import { Network,Video } from 'lucide-react';
import { createContext,useContext,useMemo,useState } from 'react';
import type { ReactNode } from 'react';
import { PanelViewSwitcher } from '../../components/PanelViewSwitcher';
import type { PanelPluginFrameProviderProps,PanelPluginHeaderActionsProps } from '../types';
import { useCameraText } from './cameraMessages';

export type CameraIntrinsicCalibrationView = 'camera' | 'workflow';

type FrameState = {
  panelId: string;
  view: CameraIntrinsicCalibrationView;
  setView: (view: CameraIntrinsicCalibrationView) => void;
};

const FrameContext = createContext<FrameState | null>(null);
const contract = {
  headerRole: 'camera-intrinsic-header-actions',viewRole: 'camera-intrinsic-panel-view',
} as const;

export function CameraIntrinsicCalibrationFrameProvider({ panel,children }: PanelPluginFrameProviderProps) {
  const [view,setView] = useState<CameraIntrinsicCalibrationView>('camera');
  const value = useMemo(() => ({ panelId: panel.id,view,setView }), [panel.id,view]);
  return <FrameContext.Provider value={value}>{children}</FrameContext.Provider>;
}

function useCameraIntrinsicCalibrationFrame(panelId: string) {
  const frame = useContext(FrameContext);
  if (!frame || frame.panelId !== panelId) {
    throw new Error(`Camera calibration panel ${panelId} must be rendered inside its registered frame provider.`);
  }
  return frame;
}

export function CameraIntrinsicCalibrationFrameBinding({
  panelId,children,
}: {
  panelId: string;
  children: (view: CameraIntrinsicCalibrationView) => ReactNode;
}) {
  const frame = useCameraIntrinsicCalibrationFrame(panelId);
  return children(frame.view);
}

export function CameraIntrinsicCalibrationHeaderActions({
  panel,editing,
}: PanelPluginHeaderActionsProps) {
  const frame = useCameraIntrinsicCalibrationFrame(panel.id);
  const t = useCameraText();
  const viewItems = [
    { id: 'camera',label: t('Camera'),icon: Video },
    { id: 'workflow',label: t('Workflow'),icon: Network },
  ] as const;
  return <div className="panels-camera-calibration-header-actions" data-xgc-role={contract.headerRole}
    data-xgc-id={panel.id}
    data-xgc-workflow-view-active={frame.view === 'workflow' ? 'true' : undefined}>
    <PanelViewSwitcher value={frame.view} items={viewItems} onChange={frame.setView}
      ariaLabel={t('Camera intrinsic calibration views')} disabled={editing} presentation="icons" appearance="panel"
      dataXgcRole="camera-calibration-view-switcher"
      dataXgcId={panel.id}
      optionDataXgcRole={contract.viewRole} />
  </div>;
}
