import { GroundStationActivityPanel } from '../../domains/groundStationInteraction/groundStationInteractionPublic';
import type { PanelPluginProps } from '../types';

export function GroundStationActivityPanelPlugin({ context,panel }: PanelPluginProps<readonly ['visualization']>) {
  return <GroundStationActivityPanel targetId={context.executionTargetId || 'local'} workspaceId={typeof panel.options.workspaceId === 'string' ? panel.options.workspaceId : undefined} />;
}
