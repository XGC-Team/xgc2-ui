import { useCallback } from 'react';
import type { ApiTargetOptions } from '../../api/http';
import { getContainerStatus } from './containerService';
import type { ContainerRuntimeStatus } from './containerModel';
import { useContainerResourceState } from './useContainerResourceState';

export function useContainerRuntime(target?: ApiTargetOptions) {
  const load = useCallback(() => getContainerStatus(target),[target]);
  const resource = useContainerResourceState<ContainerRuntimeStatus | null>({
    initialValue: null,
    load,
    loadFailure: 'Failed to load Docker runtime.',
  });

  return {
    status: resource.value,
    busy: resource.busy,
    error: resource.error,
    refresh: resource.refresh,
  };
}
