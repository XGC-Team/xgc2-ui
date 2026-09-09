import { StatusText } from '@xgc2/ui-react';
import { containerStatusToken } from './containerViewModel';

/** Normalize the Docker vocabulary into the shared plain state treatment. */
export function ContainerStatusText({ status }: { status: string }) {
  const value = status.trim() || '-';
  return <StatusText status={value === '-' ? 'unknown' : containerStatusToken(value)}>{value}</StatusText>;
}
