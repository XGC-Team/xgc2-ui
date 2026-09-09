import { HostOverview } from '../HostOverview';
import type { HostSystemLeafProps } from '../hostSystemComposition';

export function HostOverviewSystemLeaf(context: HostSystemLeafProps<'Overview'>) {
  return (
    <HostOverview
      targetCoreId={context.targetCoreId}
      managedHostId={context.managedHostId}
      requestsAllowed={context.requestsAllowed}
      actionsEnabled={context.actionsEnabled}
      isRemote={context.isRemote}
      onInspectProcess={context.onInspectRuntimeProcess}
    />
  );
}
