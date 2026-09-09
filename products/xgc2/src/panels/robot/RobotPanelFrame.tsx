import { CarFront,Drone,Gamepad2 } from 'lucide-react';
import { useMemo,useState } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { PanelViewSwitcher } from '../../components/PanelViewSwitcher';
import { useRobotText } from '../../domains/robot/robotPublic';
import type { PanelPluginFrameProviderProps,PanelPluginHeaderActionsProps } from '../types';
import {
  RobotControlFrameContext,
  useRobotControlFrame,
  type RobotControlView,
  type RobotRemoteControlLauncher,
} from './robotPanelFrameContext';

export function RobotControlFrameProvider({ panel,children }: PanelPluginFrameProviderProps) {
  const [view,setView] = useState<RobotControlView>('px4');
  const [remoteControl,setRemoteControl] = useState<RobotRemoteControlLauncher | null>(null);
  const value = useMemo(
    () => ({ panelId: panel.id,view,setView,remoteControl,setRemoteControl }),
    [panel.id,remoteControl,view],
  );
  return <RobotControlFrameContext.Provider value={value}>{children}</RobotControlFrameContext.Provider>;
}

export function RobotControlHeaderLeading({ panel }: PanelPluginHeaderActionsProps) {
  const t = useRobotText();
  const frame = useRobotControlFrame(panel.id);
  return (
    <div className="robot-control-header-actions" data-xgc-role="robot-control-header-actions" data-xgc-id={panel.id}>
      <PanelViewSwitcher
        value={frame.view}
        items={[
          { id: 'px4',label: t('UAV control'),icon: Drone },
          { id: 'ground',label: t('UGV control'),icon: CarFront },
        ]}
        onChange={frame.setView}
        ariaLabel={t('Robot control views')}
        presentation="icons"
        appearance="panel"
        dataXgcRole="robot-control-view-switcher"
        dataXgcId={panel.id}
        optionDataXgcRole="robot-control-panel-view"
      />
    </div>
  );
}

export function RobotControlHeaderActions({ panel,editing }: PanelPluginHeaderActionsProps) {
  const t = useRobotText();
  const frame = useRobotControlFrame(panel.id);
  const remote = frame.remoteControl;
  const remoteDisabledReason = editing
    ? t('Remote control is unavailable while editing the dashboard.')
    : remote?.title || (!remote ? t('Remote control is not ready.') : '');
  return (
    <ControlButton
      className="xgc-panel-runtime-action"
      size="compact"
      appearance="raised"
      iconOnly
      aria-label={t('Start remote control')}
      dataXgcRole="robot-remote-control-open"
      dataXgcId={panel.id}
      disabled={editing || !remote || remote.disabled}
      title={remoteDisabledReason || t('Start remote control for the selected robots.')}
      onClick={(event) => {
        event.stopPropagation();
        remote?.open();
      }}
    ><Gamepad2 size={13} aria-hidden="true" /></ControlButton>
  );
}
