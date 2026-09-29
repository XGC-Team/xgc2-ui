import { memo } from 'react';
import type { AnyPanelPluginDefinition,PanelPluginContext } from '../../../panels/types';
import type { PanelInstance } from '../experimentModel';

// The registry intentionally erases each plugin's capability tuple. Keep the
// single type restoration at this rendering boundary; panel hosts themselves
// work with the narrow, capability-built context.
//
// Memo boundary: the host hands an unchanged context by reference (see
// useStablePanelContext), so Run events that do not change this Panel's
// ports skip the plugin. Any changed panel, plugin or context re-renders it;
// the plugin's own state and subscriptions update as usual.
export const PanelPluginRenderer = memo(function PanelPluginRenderer({ panel,plugin,context }: {
  panel: PanelInstance;
  plugin: AnyPanelPluginDefinition;
  context: PanelPluginContext;
}) {
  const Component = plugin.component;
  return <Component panel={panel} context={context as PanelPluginContext} />;
});
