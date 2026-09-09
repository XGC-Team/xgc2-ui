import { Crosshair,Move3d,Network,Video } from 'lucide-react';
import { useMemo,useState,type ReactNode } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { PanelViewSwitcher } from '../../components/PanelViewSwitcher';
import type { PanelPluginFrameProviderProps,PanelPluginHeaderActionsProps } from '../types';
import {
  GazeboWorldCameraFrameContext,
  useGazeboWorldCameraFrame,
  type GazeboWorldCameraCalibrationAccess,
  type GazeboWorldCameraPoseAccess,
  type GazeboWorldCameraView,
} from './gazeboWorldCameraPanelFrameContext';
import { localizeCameraMessage,useCameraText } from './cameraMessages';

export function GazeboWorldCameraFrameProvider({ panel,children }: PanelPluginFrameProviderProps) {
  const [view,setView] = useState<GazeboWorldCameraView>('image');
  const [calibrationOpen,setCalibrationOpen] = useState(false);
  const [calibrationAccess,setCalibrationAccess] = useState<GazeboWorldCameraCalibrationAccess | null>(null);
  const [poseOpen,setPoseOpen] = useState(false);
  const [poseAccess,setPoseAccess] = useState<GazeboWorldCameraPoseAccess | null>(null);
  const value = useMemo(() => ({
    panelId:panel.id,view,setView,
    calibrationOpen,setCalibrationOpen,calibrationAccess,setCalibrationAccess,
    poseOpen,setPoseOpen,poseAccess,setPoseAccess,
  }), [calibrationAccess,calibrationOpen,panel.id,poseAccess,poseOpen,view]);
  return <GazeboWorldCameraFrameContext.Provider value={value}>{children}</GazeboWorldCameraFrameContext.Provider>;
}

export function GazeboWorldCameraFrameBinding({
  panelId,children,
}: {
  panelId: string;
  children: (view: GazeboWorldCameraView) => ReactNode;
}) {
  const frame = useGazeboWorldCameraFrame(panelId);
  return children(frame.view);
}

export function GazeboWorldCameraHeaderLeading({
  panel,editing,
}: PanelPluginHeaderActionsProps) {
  const frame = useGazeboWorldCameraFrame(panel.id);
  const t = useCameraText();
  const views = [
    { id:'image',label:t('Camera image'),icon:Video },
    { id:'workflow',label:t('Workflow'),icon:Network },
  ] as const;
  return <div className="gazebo-world-camera-panel-header-actions" data-xgc-role="gazebo-world-camera-header-leading"
    data-xgc-id={panel.id}
    data-xgc-workflow-view-active={frame.view === 'workflow' ? 'true' : undefined}>
    <PanelViewSwitcher value={frame.view} items={views} onChange={frame.setView}
      ariaLabel={t('Gazebo world camera views')} presentation="icons" appearance="panel"
      dataXgcRole="gazebo-world-camera-view-switcher"
      dataXgcId={panel.id}
      disabled={editing} optionDataXgcRole="gazebo-world-camera-view" />
  </div>;
}

export function GazeboWorldCameraHeaderActions({
  panel,editing,
}: PanelPluginHeaderActionsProps) {
  const frame = useGazeboWorldCameraFrame(panel.id);
  const t = useCameraText();
  const calibration = frame.calibrationAccess;
  const calibrationReason = calibration?.disabledReason
    ? localizeCameraMessage(t,calibration.disabledReason)
    : !calibration ? t('Extrinsic calibration is not ready.') : '';
  const pose = frame.poseAccess;
  const poseReason = pose?.disabledReason
    ? localizeCameraMessage(t,pose.disabledReason)
    : !pose ? t('World-camera pose controls are not ready.') : '';
  const posePurpose = t('Adjust the running Gazebo camera pose without restarting video.');
  if (editing) return null;
  return <div className="gazebo-world-camera-panel-header-actions" data-xgc-role="gazebo-world-camera-header-actions"
    data-xgc-id={panel.id}>
    <ControlButton className="xgc-panel-runtime-action" iconOnly
      aria-label={frame.poseOpen ? t('Hide world camera pose controls') : t('Adjust world camera pose')}
      aria-controls={`gazebo-world-camera-pose-editor-${panel.id}`}
      aria-expanded={frame.poseOpen}
      dataXgcRole="gazebo-world-camera-pose-mode" dataXgcId={panel.id}
      data-xgc-available={pose?.canOpen ? 'true' : 'false'}
      title={poseReason ? `${posePurpose} ${poseReason}` : posePurpose}
      onClick={(event) => {
        event.stopPropagation();
        frame.setPoseOpen(!frame.poseOpen);
      }}>
      <Move3d size={14} aria-hidden="true" />
    </ControlButton>
    <ControlButton className="xgc-panel-runtime-action" iconOnly
      aria-label={t('Open extrinsic calibration')}
      dataXgcRole="gazebo-world-camera-calibration-mode" dataXgcId={panel.id}
      disabled={!calibration || !calibration.canOpen || frame.calibrationOpen}
      title={calibrationReason || t('Open extrinsic calibration in a large dialog.')}
      onClick={(event) => {
        event.stopPropagation();
        frame.setCalibrationOpen(true);
      }}>
      <Crosshair size={14} aria-hidden="true" />
    </ControlButton>
  </div>;
}
