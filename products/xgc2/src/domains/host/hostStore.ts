import type { ApiTargetOptions } from '../../api/http';
import { usePolling } from '../../hooks/usePolling';
import type { HostOverview } from './hostModel';
import { getHostOverview } from './hostOverviewActions';

export function useHostOverviewRefresh({
  enabled,
  intervalMs,
  options,
  onOverview,
  onError,
}: {
  enabled: boolean;
  intervalMs: number;
  options?: ApiTargetOptions;
  onOverview: (overview: HostOverview) => void;
  onError?: (error: unknown) => void;
}) {
  usePolling({
    enabled,
    intervalMs,
    immediate: false,
    pollKey: `${options?.targetCoreId ?? 'local'}:${options?.managedHostId ?? 'local'}`,
    task: async () => {
      try {
        onOverview(await getHostOverview(options));
      } catch (error) {
        onError?.(error);
      }
    },
  });
}
