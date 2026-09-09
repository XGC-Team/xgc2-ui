import type { ReactNode } from 'react';
import { StatusText } from '@xgc2/ui-react';

export function AutomationExecutionStatus({
  status,
  children,
  role,
  id,
  engineStatus,
}: {
  status: string;
  children?: ReactNode;
  role?: string;
  id?: string;
  engineStatus?: string;
}) {
  return (
    <StatusText
      className="automation-execution-status"
      status={status}
      data-xgc-role={role}
      data-xgc-id={id}
      data-xgc-engine-status={engineStatus}
    >{children ?? status.replaceAll('_', ' ')}</StatusText>
  );
}
