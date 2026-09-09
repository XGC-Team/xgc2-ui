import type { RemoteControlGear } from './useRobotRemoteControlController';

export type RemoteControlDirection = 'forward'|'backward'|'left'|'right'|'yaw-left'|'yaw-right';

export type PersistedRemoteController = {
  id: string;
  sessionId?: string;
  interactionId?: string;
  robots: Array<{ id: string; name: string }>;
  gear: RemoteControlGear;
  pressed: RemoteControlDirection[];
  origin: { left: number; top: number } | null;
};

export type RemoteControllerIdentity = {
  id: string;
  sessionId?: string;
  interactionId?: string;
  robots: ReadonlyArray<{ id: string; name: string }>;
};

const storageVersion = 1;
const directions: readonly RemoteControlDirection[] = [
  'forward','backward','left','right','yaw-left','yaw-right',
];

export function remoteControlStorageKey(experimentId: string, panelId: string) {
  return [
    'xgc.experiment',
    segment(experimentId),
    'panel',
    segment(panelId),
    'remote-control.v1',
  ].join('.');
}

export function readPersistedRemoteControllers(experimentId: string, panelId: string) {
  if (!experimentId.trim() || !panelId.trim()) return [] as PersistedRemoteController[];
  try {
    const raw = window.localStorage.getItem(remoteControlStorageKey(experimentId, panelId));
    if (!raw) return [];
    return parsePersistedRemoteControllers(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export function readPersistedRemoteController(experimentId: string, panelId: string, controllerId: string) {
  return readPersistedRemoteControllers(experimentId, panelId).find((item) => item.id === controllerId);
}

export function syncPersistedRemoteControllers(
  experimentId: string,
  panelId: string,
  identities: ReadonlyArray<RemoteControllerIdentity>,
) {
  if (!experimentId.trim() || !panelId.trim()) return;
  if (identities.length === 0) {
    clearPersistedRemoteControllers(experimentId, panelId);
    return;
  }
  const previous = new Map(
    readPersistedRemoteControllers(experimentId, panelId).map((item) => [item.id, item]),
  );
  writePersistedRemoteControllers(experimentId, panelId, identities.map((identity) => {
    const stored = previous.get(identity.id);
    const robots = identity.robots.map((robot) => ({ id: robot.id, name: robot.name }));
    return stored
      ? { ...stored, sessionId: identity.sessionId, interactionId: identity.interactionId, robots }
      : { id: identity.id, sessionId: identity.sessionId, interactionId: identity.interactionId, robots, gear: 1, pressed: [], origin: null };
  }));
}

export function patchPersistedRemoteController(
  experimentId: string,
  panelId: string,
  controllerId: string,
  patch: Partial<Pick<PersistedRemoteController, 'gear' | 'pressed' | 'origin'>>,
) {
  if (!experimentId.trim() || !panelId.trim() || !controllerId) return;
  const current = readPersistedRemoteControllers(experimentId, panelId);
  const index = current.findIndex((item) => item.id === controllerId);
  if (index < 0) return;
  const next = current.slice();
  const item = next[index];
  if (!item) return;
  next[index] = {
    ...item,
    gear: patch.gear ?? item.gear,
    pressed: patch.pressed ? persistPressed(patch.pressed) : item.pressed,
    origin: patch.origin === undefined ? item.origin : patch.origin,
  };
  writePersistedRemoteControllers(experimentId, panelId, next);
}

export function clearPersistedRemoteControllers(experimentId: string, panelId: string) {
  if (!experimentId.trim() || !panelId.trim()) return;
  try {
    window.localStorage.removeItem(remoteControlStorageKey(experimentId, panelId));
  } catch {
    return;
  }
}

export function persistPressed(pressed: Iterable<string>) {
  const present = new Set(pressed);
  return directions.filter((direction) => present.has(direction));
}

function writePersistedRemoteControllers(
  experimentId: string,
  panelId: string,
  controllers: readonly PersistedRemoteController[],
) {
  try {
    window.localStorage.setItem(
      remoteControlStorageKey(experimentId, panelId),
      JSON.stringify({ v: storageVersion, controllers }),
    );
  } catch {
    return;
  }
}

function parsePersistedRemoteControllers(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const body = value as { v?: unknown; controllers?: unknown };
  if (body.v !== storageVersion || !Array.isArray(body.controllers)) return [];
  return body.controllers.flatMap((item) => {
    const parsed = parseController(item);
    return parsed ? [parsed] : [];
  });
}

function parseController(value: unknown): PersistedRemoteController | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = value as Partial<PersistedRemoteController>;
  if (typeof item.id !== 'string' || !item.id.trim()) return undefined;
  if (!Array.isArray(item.robots) || item.robots.length === 0) return undefined;
  const robots = item.robots.flatMap((robot) => {
    if (!robot || typeof robot !== 'object') return [];
    if (typeof robot.id !== 'string' || !robot.id.trim()) return [];
    const name = typeof robot.name === 'string' && robot.name.trim() ? robot.name : robot.id;
    return [{ id: robot.id, name }];
  });
  if (robots.length === 0 || robots.length !== item.robots.length) return undefined;
  if (item.gear !== 1 && item.gear !== 2 && item.gear !== 3) return undefined;
  if (!Array.isArray(item.pressed)) return undefined;
  return {
    id: item.id,
    interactionId: typeof item.interactionId === 'string' ? item.interactionId : undefined,
    sessionId: typeof item.sessionId === 'string' ? item.sessionId : undefined,
    robots,
    gear: item.gear,
    pressed: persistPressed(item.pressed.filter((direction) => typeof direction === 'string')),
    origin: parseOrigin(item.origin),
  };
}

function parseOrigin(value: unknown): { left: number; top: number } | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const origin = value as { left?: unknown; top?: unknown };
  if (!Number.isFinite(origin.left) || !Number.isFinite(origin.top)) return null;
  return { left: origin.left as number, top: origin.top as number };
}

function segment(value: string) {
  return value.trim() || 'default';
}
