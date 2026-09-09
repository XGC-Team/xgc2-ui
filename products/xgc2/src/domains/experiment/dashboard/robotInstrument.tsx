import { Columns2,List,Network,Square } from 'lucide-react';
import { useMemo } from 'react';
import { PanelViewSwitcher } from '../../../components/PanelViewSwitcher';
import {
  robotInstrumentViewModes,
  useRobotInstrumentViewMode,
} from './robotInstrumentModel';

/**
 * Header control for the robot instruments panel: view switcher only.
 * Page-size prefs stay in panel private state with defaults — no second gear
 * next to the panel settings control.
 */
export function RobotInstrumentViewHeaderControl({
  experimentId,
  dashboardId,
  panelId,
}: {
  experimentId?: string;
  dashboardId?: string;
  panelId?: string;
  editing?: boolean;
}) {
  const scope = useMemo(() => ({ experimentId,dashboardId,panelId }), [dashboardId,experimentId,panelId]);
  const [viewMode, setViewMode] = useRobotInstrumentViewMode(scope);

  return (
    <div className="robot-instrument-header-controls" data-xgc-role="robot-instrument-header-controls" data-xgc-id={panelId}>
      <PanelViewSwitcher
        value={viewMode}
        items={robotInstrumentViewModes.map((mode) => ({
          id: mode.id,
          label: mode.label,
          icon: mode.id === 'list' ? List : mode.id === 'single' ? Square : mode.id === 'double' ? Columns2 : Network,
        }))}
        onChange={setViewMode}
        ariaLabel="Robot instrument views"
        presentation="icons"
        appearance="panel"
        dataXgcRole="robot-instrument-view-switcher"
        dataXgcId={panelId}
        optionDataXgcRole="robot-instrument-view"
      />
    </div>
  );
}
