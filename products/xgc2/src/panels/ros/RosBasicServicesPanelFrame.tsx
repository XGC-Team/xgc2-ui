import { Network,SlidersHorizontal,Workflow } from 'lucide-react';
import { useMemo,useState } from 'react';
import { SelectControl } from '../../components/controls/SelectControl';
import { PanelViewSwitcher } from '../../components/PanelViewSwitcher';
import { usePersistentState } from '../../hooks/usePersistentState';
import type { PanelPluginFrameProviderProps,PanelPluginHeaderActionsProps } from '../types';
import {
  RosBasicServicesPanelFrameContext,
  useRosBasicServicesPanelFrame,
  type RosBasicServicesWhiteboardControl,
} from './rosBasicServicesPanelFrameContext';
import { isRosBasicServicesPanelView } from './rosBasicServicesPanelModel';
import { useRosPanelText } from './rosMessages';

/** Browser-local interaction preference; not runtime truth (that stays on SSE). */
function rosBasicServicesViewPersistenceKey(panelId: string) {
  return `xgc.panel.ros-basic-services.view.${panelId}`;
}

export function RosBasicServicesPanelFrameProvider({ panel,children }: PanelPluginFrameProviderProps) {
  // Browser-local persistence owns the active view; no panel option authors a default.
  const [view,setView] = usePersistentState(
    rosBasicServicesViewPersistenceKey(panel.id),
    'controls',
    isRosBasicServicesPanelView,
  );
  const [whiteboardControl,setWhiteboardControl] = useState<RosBasicServicesWhiteboardControl | null>(null);
  const value = useMemo(() => ({
    panelId: panel.id,view,setView,whiteboardControl,setWhiteboardControl,
  }), [panel.id,setView,view,whiteboardControl]);
  return (
    <RosBasicServicesPanelFrameContext.Provider value={value}>
      {children}
    </RosBasicServicesPanelFrameContext.Provider>
  );
}

export function RosBasicServicesPanelHeaderLeading({ panel,editing }: PanelPluginHeaderActionsProps) {
  const frameState = useRosBasicServicesPanelFrame(panel.id);
  const t = useRosPanelText();
  const panelViews = [
    { id: 'controls' as const,label: t('Controls'),icon: SlidersHorizontal },
    { id: 'whiteboard' as const,label: t('Whiteboard'),icon: Network },
  ];
  return (
    <div className="ros-panel-header-actions" data-xgc-role="ros-basic-services-header-leading" data-xgc-id={panel.id}
      data-xgc-workflow-view-active={frameState.view === 'whiteboard' ? 'true' : undefined}>
      <PanelViewSwitcher
        value={frameState.view}
        items={panelViews}
        onChange={frameState.setView}
        ariaLabel={t('ROS Control panel views')}
        presentation="icons"
        appearance="panel"
        disabled={editing}
        dataXgcRole="ros-basic-services-views"
        dataXgcId={panel.id}
        optionDataXgcRole="ros-basic-services-view"
      />
    </div>
  );
}

export function RosBasicServicesPanelHeaderActions({ panel,editing }: PanelPluginHeaderActionsProps) {
  const frameState = useRosBasicServicesPanelFrame(panel.id);
  if (editing || frameState.view !== 'whiteboard' || !frameState.whiteboardControl) return null;
  return (
    <div className="ros-panel-header-actions" data-xgc-role="ros-basic-services-header-actions" data-xgc-id={panel.id}>
      <RosBasicServicesWhiteboardHeaderControls
        control={frameState.whiteboardControl}
        panelId={panel.id}
        disabled={false}
      />
    </div>
  );
}

/**
 * Workflow selector only. Zoom lives on the canvas (vertical column, top-right) so it
 * does not crowd this fixed 34px header next to the view switcher and run/stop buttons.
 */
function RosBasicServicesWhiteboardHeaderControls({ control,panelId,disabled }: {
  control: RosBasicServicesWhiteboardControl;
  panelId: string;
  disabled: boolean;
}) {
  const t = useRosPanelText();
  return (
    <div
      className="ros-panel-header-whiteboard"
      role="toolbar"
      aria-label={t('ROS workflow whiteboard controls')}
      data-xgc-role="ros-basic-services-whiteboard-controls"
      data-xgc-id={panelId}
      data-xgc-selected={control.selectedWorkflowId || undefined}
    >
      <SelectControl
        className="ros-panel-header-whiteboard-workflows"
        size="compact"
        value={control.selectedWorkflowId}
        options={control.options}
        onChange={control.selectWorkflow}
        icon={<Workflow size={13} aria-hidden="true" />}
        ariaLabel={t('ROS Control workflow')}
        dataXgcRole="ros-basic-services-whiteboard-workflows"
        dataXgcId={panelId}
        disabled={disabled}
      />
    </div>
  );
}
