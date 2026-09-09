import type { PX4RobotAssetSpec } from './robotAssetContracts';

export type RobotSourceTime = {
  nanoseconds: string;
  clockDomain: number;
};

export type RobotChannelProjection = {
  channelId: string;
  sequence: number;
  messageId: number;
  sourceTime?: RobotSourceTime;
  observedAt: string;
  sourceAgeMs: number;
  staleAt: string;
  stale: boolean;
  value: Record<string,unknown>;
};

export type RunRobotPX4 = {
  modelId: PX4RobotAssetSpec['px4']['modelId'];
  mavSystemId: number;
  managementIp: string;
  mocapRigidBodyName: string;
  positioningFrameNumber?: number;
  positioningComparisonThresholdM?: number;
};

export type RunRobotScout = {
  managementAddress: string;
  positioningFrameNumber?: number;
  positioningComparisonThresholdM?: number;
};

export type RunRobotMecanum = {
  mocapRigidBodyName: string;
  positioningFrameNumber?: number;
  positioningComparisonThresholdM?: number;
};

export type RobotConnectionState = 'inactive' | 'opening' | 'live' | 'closed' | 'revoked';
export type RunRobotHybridSource = 'simulation' | 'physical';

export type RobotOperationContract = {
  id: string;
  parameterSchema: Record<string,unknown>;
};

export type RunRobot = {
  /** Stable logical Experiment slot identity. */
  id: string;
  /** Frozen physical Robot asset identity for audit and resource claims. */
  robotAssetId: string;
  robotAssetCommitId: string;
  robotAssetDigest: string;
  name: string;
  kind: string;
  // Raw authored source used only when the Session selects its visible hybrid
  // branch. Core never derives an effective mode for the browser.
  hybridSource: RunRobotHybridSource;
  profileId: string;
  namespace: string;
  px4?: RunRobotPX4;
  scout?: RunRobotScout;
  mecanum?: RunRobotMecanum;
  operationContracts: RobotOperationContract[];
  adapterDefinitionId: string;
  connectionEpoch: number;
  connectionState: RobotConnectionState;
  connectionDetail?: string;
  connectionRevision: number;
  online: boolean;
  operationalReady: boolean;
  status: 'online' | 'limited' | 'offline';
  onlineUntil?: string;
  operationalReadyUntil?: string;
  channels: Record<string,RobotChannelProjection>;
};

export type RunRobotProjection = {
  targetId: string;
  runId: string;
  streamId: string;
  projectionRevision: number;
  pending: boolean;
  experimentResourceId: string;
  experimentCommitId: string;
  robotSelectionDigest: string;
  robots: RunRobot[];
  operations: RobotOperation[];
  updatedAt: string;
};

export type RobotChannelChange = RobotChannelProjection & {
  robotId: string;
  connectionEpoch: number;
  online: boolean;
  operationalReady: boolean;
  status: RunRobot['status'];
  onlineUntil?: string;
  operationalReadyUntil?: string;
};

export type RobotConnectionReset = {
  robotId: string;
  connectionEpoch: number;
  state: Exclude<RobotConnectionState,'inactive'>;
  revision: number;
  detail?: string;
};

export type RobotPatchEvent = {
  revision: number;
  targetId: string;
  runId: string;
  /** Refresh-only topology signal; it never carries a synthetic patch. */
  refresh?: boolean;
  changes: RobotChannelChange[];
  resets: RobotConnectionReset[];
  operations?: RobotOperation[];
  emittedAt: string;
};

export type RobotOperationPhase = 'accepted' | 'started' | 'retry_pending' | 'succeeded' | 'rejected' | 'failed' | 'expired' | 'uncertain';

export type RobotOperationFailureClass =
  | 'rejected'
  | 'permanent'
  | 'transient'
  | 'uncertain'
  | 'deadline'
  | 'canceled'
  | 'resource-exhausted';

export type RobotOperation = {
  id: string;
  targetId: string;
  runId: string;
  experimentId: string;
  robotId: string;
  operation: string;
  parameters: Record<string,unknown>;
  phase: RobotOperationPhase;
  attempt: number;
  maxAttempts: number;
  failureClass?: RobotOperationFailureClass;
  resultCode?: string;
  detail?: string;
  connectionEpoch: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type RobotRuntimeStreamState = 'idle' | 'connecting' | 'connected' | 'replaying' | 'disconnected';

export type RunRobotRuntimeState = {
  projection?: RunRobotProjection;
  operations: RobotOperation[];
  streamState: RobotRuntimeStreamState;
  loaded: boolean;
  loading: boolean;
  error: string;
};

export type RunRobotStatus = Pick<RunRobot,'online' | 'operationalReady' | 'status'>;
