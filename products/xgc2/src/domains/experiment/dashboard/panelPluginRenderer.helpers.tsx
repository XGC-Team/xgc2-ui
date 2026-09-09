import type { AnyPanelPluginDefinition,PanelPluginContext } from '../../../panels/types';
import type { PanelInstance } from '../experimentModel';

// The registry intentionally erases each plugin's capability tuple. Keep the
// single type restoration at this rendering boundary; panel hosts themselves
// work with the narrow, capability-built context.
export function PanelPluginRenderer({ panel,plugin,context }: {
  panel: PanelInstance;
  plugin: AnyPanelPluginDefinition;
  context: PanelPluginContext;
}) {
  const Component = plugin.component;
  return <Component panel={panel} context={context as PanelPluginContext} />;
}
