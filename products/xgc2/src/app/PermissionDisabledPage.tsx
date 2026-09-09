import { ShieldCheck } from 'lucide-react';
import { EmptyState } from '@xgc2/ui-react';

export function PermissionDisabledPage({ reason }: { reason: string }) {
  return (
    <EmptyState
      as="section"
      className="xgc-workspace-full-span"
      data-xgc-role="target-core-disabled-page"
      data-xgc-id="target-core-disabled-page"
      icon={<ShieldCheck size={34} />}
      title="Target Core permission required"
      description={reason}
    />
  );
}
