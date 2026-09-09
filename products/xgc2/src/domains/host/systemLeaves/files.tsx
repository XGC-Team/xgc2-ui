import { HostFilesWorkspace } from '../HostFilesWorkspace';
import type { HostSystemLeafProps } from '../hostSystemComposition';

export function HostFilesSystemLeaf(context: HostSystemLeafProps<'Files'>) {
  return (
    <HostFilesWorkspace
      targetCoreId={context.targetCoreId}
      managedHostId={context.managedHostId ?? 'local'}
      executionTargetId={context.executionTargetId}
      isRemoteManagedHost={context.isRemote}
    />
  );
}
