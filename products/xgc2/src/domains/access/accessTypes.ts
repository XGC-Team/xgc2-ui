/**
 * Collaboration access entries (harness#118): share one exact surface — a
 * camera projection panel, a precise remote controller, or a read-only
 * calibration view — to a LAN listener. Field names mirror the Core API
 * access routes (core-xgc/internal/api).
 */

export const ACCESS_ENTRY_PATH = '/access-entry';

export const ACCESS_ACTION_SURFACE_READ = 'surface.read';
export const ACCESS_ACTION_CAMERA_LIVE = 'camera.live';
export const ACCESS_ACTION_CAMERA_SNAPSHOT = 'camera.snapshot';
export const ACCESS_ACTION_REMOTE_MOTION = 'remote.motion';
export const ACCESS_ACTION_CALIBRATION_STATE_READ = 'calibration.state.read';
export const ACCESS_ACTION_CALIBRATION_IMAGE_READ = 'calibration.image.read';

export const ACCESS_MODULE_CAMERA = 'experiment.camera';
export const ACCESS_MODULE_REMOTE_CONTROL = 'experiment.remote-control';
export const ACCESS_MODULE_CALIBRATION_READONLY = 'experiment.calibration-readonly';

export type AccessEntryStatus = 'running' | 'stopped' | 'revoked' | 'expired' | 'failed';

export type AccessEntrySurface =
  | { kind: 'experiment-panel'; experimentId: string; sessionId?: string; panelId: string }
  | {
      kind: 'remote-controller';
      experimentId: string;
      sessionId: string;
      controllerId: string;
      robotIds: string[];
    };

export type CreateAccessEntryBody = {
  name: string;
  /** Local interface IP or wildcard (e.g. 0.0.0.0); never a DNS name. */
  listenHost: string;
  /** 0 = OS allocation; otherwise 1..65535. */
  port: number;
  /** ISO timestamp, future, at most 8 hours ahead. */
  expiresAt: string;
  /** Owner contribution module; omitted only for legacy camera/remote selection. */
  moduleId?: string;
  /** Explicit action subset; surface.read is required. */
  actions?: string[];
  surface: AccessEntrySurface;
};

export type AccessEntry = {
  id: string;
  grantId: string;
  name: string;
  listenHost: string;
  requestedPort: number;
  boundPort: number;
  status: AccessEntryStatus;
  moduleId?: string;
  viewContractVersion?: number;
  surface: AccessEntrySurface;
  capabilities: string[];
  actions: string[];
  /** LAN candidate addresses reported by the backend; empty = no LAN candidate. */
  advertisedHosts: string[];
  expiresAt: string;
  entryPath: typeof ACCESS_ENTRY_PATH | string;
  error?: string;
};

export type AccessEntryIssued = {
  entry: AccessEntry;
  bootstrapToken: string;
  bootstrapExpiresAt: string;
};

export type AccessEntryParticipant = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  mediaSessions: number;
  cleanupPending: boolean;
  holdingControl: boolean;
};

/** Frozen-Session share candidates; the only authority for the create flow. */
export type AccessCatalogAction = {
  id: string;
  label: string;
  required: boolean;
  available: boolean;
  reason?: string;
};

export type AccessCatalogResource = {
  title: string;
  surface: AccessEntrySurface;
  available: boolean;
  reason?: string;
  actions: AccessCatalogAction[];
};

export type AccessCatalogModule = {
  moduleId: string;
  title: string;
  viewContractVersion: number;
  resources: AccessCatalogResource[];
};

export type AccessCatalog = {
  contractVersion: number;
  experimentId: string;
  sessionId: string;
  modules: AccessCatalogModule[];
  unsupportedPanels: { panelId: string; pluginId: string; title: string; reason: string }[];
};

export type AccessEntryEndpoint = {
  id: string;
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  protocol: 'http' | 'sse' | 'webrtc';
  action: string;
};

export type AccessEntryProjection = {
  entryId: string;
  name: string;
  expiresAt: string;
  contractVersion?: number;
  moduleId?: string;
  viewContractVersion?: number;
  endpoints?: AccessEntryEndpoint[];
  surface: AccessEntrySurface;
  capabilities: string[];
  /** Effective actions granted to this browser session; render controls only for these. */
  actions: string[];
  panel?: { id: string; pluginId: string; title: string };
  media?: {
    sourceId: string;
    processInstanceId: string;
    /** Same-origin relative API URLs; never rebuild them from an edgeUrl. */
    sessionsPath: string;
    sessionPathPrefix: string;
    snapshotPath?: string;
  };
};

export type AccessEntryMotionIntent = {
  gear: 1 | 2 | 3;
  longitudinal: -1 | 0 | 1;
  lateral: -1 | 0 | 1;
  yaw: -1 | 0 | 1;
  release: boolean;
};

export function accessEntrySurfaceKindLabel(surface: AccessEntrySurface): 'camera' | 'remote' {
  return surface.kind === 'experiment-panel' ? 'camera' : 'remote';
}

export function accessEntryKindLabel(
  entry: Pick<AccessEntry, 'moduleId' | 'surface'>,
): 'camera' | 'remote' | 'calibration' {
  if (entry.moduleId === ACCESS_MODULE_CALIBRATION_READONLY) return 'calibration';
  return accessEntrySurfaceKindLabel(entry.surface);
}
