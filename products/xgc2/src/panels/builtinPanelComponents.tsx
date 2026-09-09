import { LichtblickWorkspacePanel } from './visualization/LichtblickPanelWorkspace';
import type { PanelPluginProps } from './types';

export function LichtblickPlugin({ panel, context: pluginContext }: PanelPluginProps<readonly ['visualization', 'experiment', 'execution', 'automation']>) {
  return <LichtblickWorkspacePanel panel={panel} context={pluginContext} />;
}
