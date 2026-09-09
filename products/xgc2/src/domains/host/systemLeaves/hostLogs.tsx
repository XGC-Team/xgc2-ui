import { HostOverviewLogsCard } from '../HostOverviewLogsCard';
import type { HostSystemLeafProps } from '../hostSystemComposition';

export function HostLogsSystemLeaf(context: HostSystemLeafProps<'HostLogs'>) {
  return (
    <HostOverviewLogsCard
      managedHostId={context.managedHostId}
      targetCoreId={context.targetCoreId}
      requestsAllowed={context.requestsAllowed}
      actionsEnabled={context.actionsEnabled}
    />
  );
}
