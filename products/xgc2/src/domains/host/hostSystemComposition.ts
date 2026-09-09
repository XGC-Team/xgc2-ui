import type { ComponentType } from 'react';

export type HostRuntimeProcessMetric = 'cpu' | 'memory' | 'connections';

export type HostRuntimeProcessRequest = Readonly<{
  pid: number;
  name: string;
  metric: HostRuntimeProcessMetric;
}>;

export type HostRuntimeProcessFocus = HostRuntimeProcessRequest & Readonly<{
  requestId: number;
}>;

/** Immutable runtime values supplied by the generic System shell to a static leaf. */
export type HostSystemLeafContext = Readonly<{
  targetCoreId?: string;
  /** Present only for a remote Agent. Local leaf APIs must not receive a fake host id. */
  managedHostId?: string;
  executionTargetId: string;
  isRemote: boolean;
  requestsAllowed: boolean;
  actionsEnabled: boolean;
  /** Transient Overview -> Runtime diagnostic focus; never persisted across targets. */
  runtimeProcessFocus?: HostRuntimeProcessFocus;
  onInspectRuntimeProcess?: (request: HostRuntimeProcessRequest) => void;
  onClearRuntimeProcessFocus?: (requestId: number) => void;
}>;

export type HostSystemLeafSlot =
  | 'Overview'
  | 'HostLogs'
  | 'Files'
  | 'Processes'
  | 'Network'
  | 'SSHService'
  | 'Firewall';

declare const hostSystemLeafSlot: unique symbol;

/** Optional type-only prop brands a leaf without emitting runtime feature metadata. */
export type HostSystemLeafProps<Slot extends HostSystemLeafSlot> = HostSystemLeafContext
  & { readonly [hostSystemLeafSlot]?: Slot };

/** Type-only brand prevents a generated root from wiring a leaf into the wrong slot. */
export type HostSystemLeafComponent<Slot extends HostSystemLeafSlot> =
  ComponentType<HostSystemLeafProps<Slot>>;

/**
 * Build-time System leaf graph. Generated roots import and fill only enabled
 * slots; the generic route never discovers concrete leaves at runtime.
 */
export type HostSystemComposition = Readonly<{
  Overview?: HostSystemLeafComponent<'Overview'>;
  HostLogs?: HostSystemLeafComponent<'HostLogs'>;
  Files?: HostSystemLeafComponent<'Files'>;
  Processes?: HostSystemLeafComponent<'Processes'>;
  Network?: HostSystemLeafComponent<'Network'>;
  SSHService?: HostSystemLeafComponent<'SSHService'>;
  Firewall?: HostSystemLeafComponent<'Firewall'>;
}>;

export const EMPTY_HOST_SYSTEM_COMPOSITION: HostSystemComposition = Object.freeze({});

export function defineHostSystemComposition(
  leaves: HostSystemComposition,
): HostSystemComposition {
  return Object.freeze({ ...leaves });
}
