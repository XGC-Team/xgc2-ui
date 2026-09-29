import type { SharedSurfaceEndpoint, SharedSurfaceProjection } from '../../../shared/sharedSurface';

const ENTRY_PATH = '/api/access/entry/';

/** Projection routes are templates, never upstream URLs or caller-selected paths. */
export function sharedSurfacePathParameters(path: string): readonly string[] {
  if (!path.startsWith(ENTRY_PATH) || /[%?#\\\s]/.test(path)) {
    throw new Error('Invalid shared surface endpoint path.');
  }
  const parameters: string[] = [];
  for (const segment of path.slice(ENTRY_PATH.length).split('/')) {
    if (/^:[A-Za-z][A-Za-z0-9_]*$/.test(segment)) {
      const name = segment.slice(1);
      if (parameters.includes(name)) throw new Error('Duplicate shared surface path parameter.');
      parameters.push(name);
    } else if (!/^[A-Za-z0-9._~-]+$/.test(segment) || segment.includes('..') || segment === '.') {
      throw new Error('Invalid shared surface endpoint path segment.');
    }
  }
  return parameters;
}

/** Decode only the transport envelope. Feature payloads remain owned by their compiled leaf. */
export function decodeSharedSurfaceProjection(value: unknown): SharedSurfaceProjection {
  const projection = record(value);
  if (projection.contractVersion !== 1) throw new Error('Unsupported shared surface contract version.');
  for (const field of ['entryId', 'name', 'moduleId']) requiredString(projection[field]);
  const expiresAt = requiredString(projection.expiresAt);
  if (!validExpiry(expiresAt)) {
    throw new Error('Invalid shared surface expiry.');
  }
  if (!Number.isSafeInteger(projection.viewContractVersion) || Number(projection.viewContractVersion) < 1) {
    throw new Error('Invalid shared surface view contract version.');
  }
  if (!Array.isArray(projection.actions) || projection.actions.length > 256) {
    throw new Error('Invalid shared surface actions.');
  }
  const actions = projection.actions.map(requiredString);
  if (!actions.includes('surface.read') || new Set(actions).size !== actions.length) {
    throw new Error('Invalid shared surface action set.');
  }
  if (!Array.isArray(projection.endpoints) || projection.endpoints.length > 256) {
    throw new Error('Invalid shared surface endpoints.');
  }
  const ids = new Set<string>();
  const endpoints = projection.endpoints.map((value): SharedSurfaceEndpoint => {
    const endpoint = record(value);
    const id = requiredString(endpoint.id);
    const path = requiredString(endpoint.path);
    const action = requiredString(endpoint.action);
    if (ids.has(id)) throw new Error('Duplicate shared surface endpoint.');
    ids.add(id);
    sharedSurfacePathParameters(path);
    if (typeof endpoint.method !== 'string' || !['GET', 'POST', 'DELETE'].includes(endpoint.method)
      || typeof endpoint.protocol !== 'string' || !['http', 'sse', 'webrtc'].includes(endpoint.protocol)
      || !actions.includes(action)) {
      throw new Error('Invalid shared surface endpoint contract.');
    }
    if (endpoint.protocol === 'sse' && endpoint.method !== 'GET') {
      throw new Error('Invalid shared surface event method.');
    }
    return endpoint as SharedSurfaceEndpoint;
  });
  const events = endpoints.find((endpoint) => endpoint.id === 'surface.events');
  if (!events || events.method !== 'GET' || events.protocol !== 'sse' || events.action !== 'surface.read'
    || sharedSurfacePathParameters(events.path).length > 0) {
    throw new Error('Shared surface event endpoint is missing or invalid.');
  }
  // Isolate the capability set from mutable response objects and owner payloads.
  return immutableJSON(projection) as SharedSurfaceProjection;
}

/** Any changed opaque scope/owner payload requires a new entry exchange, never an in-place takeover. */
export function sharedSurfaceIdentity(projection: SharedSurfaceProjection): string {
  return JSON.stringify(stableJSON(projection));
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || !value || value !== value.trim() || hasControlCharacters(value)) {
    throw new Error('Invalid shared surface string.');
  }
  return value;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error('Invalid shared surface object.');
  }
  return value as Record<string, unknown>;
}

function immutableJSON(value: unknown, depth = 0): unknown {
  if (depth > 64) throw new Error('Shared surface payload is too deeply nested.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return Object.freeze(value.map((item) => immutableJSON(item, depth + 1)));
  return Object.freeze(Object.fromEntries(Object.entries(record(value))
    .map(([key, item]) => [key, immutableJSON(item, depth + 1)])));
}

function stableJSON(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJSON);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableJSON(item)]));
  }
  return value;
}

/** Encode one declared path slot; encoded separators and traversal are never accepted as input. */
export function encodeSharedSurfaceParameter(value: unknown): string {
  if (typeof value !== 'string' || !value || value.includes('..') || value === '.'
    || /[/%\\?#\s]/.test(value) || hasControlCharacters(value)) {
    throw new Error('Invalid shared surface path parameter.');
  }
  return encodeURIComponent(value);
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

function validExpiry(value: string): boolean {
  const match = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year!, month! - 1, day!);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day
    && hour! < 24 && minute! < 60 && second! < 60;
}
