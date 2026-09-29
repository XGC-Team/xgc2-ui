import { HTTPError, request } from '../../api/http';
import { queryString } from '../../shared/url';
import type {
  AccessCatalog,
  AccessEntry,
  AccessEntryIssued,
  AccessEntryParticipant,
  CreateAccessEntryBody,
} from './accessTypes';

/**
 * Management-plane client (main station only; Core enforces access.manage).
 * Bootstrap tokens appear only in create/start/bootstrap responses and are
 * never listed or logged by this layer.
 */

export async function listAccessEntries(signal?: AbortSignal): Promise<AccessEntry[]> {
  const payload = await request<unknown>('/access/entries', { signal, cache: 'no-store' });
  return record(payload, 'access entries').entries as AccessEntry[];
}

export function createAccessEntry(
  body: CreateAccessEntryBody,
  signal?: AbortSignal,
): Promise<AccessEntryIssued> {
  return request<AccessEntryIssued>('/access/entries', {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  });
}

export function getAccessEntry(entryId: string, signal?: AbortSignal): Promise<AccessEntry> {
  return request<AccessEntry>(`/access/entries/${encodeURIComponent(entryId)}`, {
    signal,
    cache: 'no-store',
  });
}

export function startAccessEntry(entryId: string, signal?: AbortSignal): Promise<AccessEntryIssued> {
  return request<AccessEntryIssued>(`/access/entries/${encodeURIComponent(entryId)}/start`, {
    method: 'POST',
    body: JSON.stringify({}),
    signal,
  });
}

export function stopAccessEntry(entryId: string, signal?: AbortSignal): Promise<AccessEntry> {
  return request<AccessEntry>(`/access/entries/${encodeURIComponent(entryId)}/stop`, {
    method: 'POST',
    body: JSON.stringify({}),
    signal,
  });
}

export function rotateAccessEntryBootstrap(
  entryId: string,
  signal?: AbortSignal,
): Promise<AccessEntryIssued> {
  return request<AccessEntryIssued>(`/access/entries/${encodeURIComponent(entryId)}/bootstrap`, {
    method: 'POST',
    body: JSON.stringify({}),
    signal,
  });
}

export async function revokeAccessEntry(entryId: string, signal?: AbortSignal): Promise<void> {
  await request<void>(`/access/entries/${encodeURIComponent(entryId)}`, {
    method: 'DELETE',
    signal,
  });
}

export async function listAccessEntryParticipants(
  entryId: string,
  signal?: AbortSignal,
): Promise<AccessEntryParticipant[]> {
  const payload = await request<unknown>(
    `/access/entries/${encodeURIComponent(entryId)}/participants`,
    { signal, cache: 'no-store' },
  );
  return record(payload, 'access participants').participants as AccessEntryParticipant[];
}

export async function revokeAccessEntryParticipant(
  entryId: string,
  participantId: string,
  signal?: AbortSignal,
): Promise<void> {
  await request<void>(
    `/access/entries/${encodeURIComponent(entryId)}/participants/${encodeURIComponent(participantId)}`,
    { method: 'DELETE', signal },
  );
}

/**
 * Frozen-Session share candidates (A/B/C owner contract). Returns 409 when the
 * Experiment has no active local Session; there is no authoring-HEAD fallback.
 */
export async function getAccessCatalog(
  experimentId: string,
  signal?: AbortSignal,
): Promise<AccessCatalog> {
  const payload = await request<unknown>(
    `/access/catalog${queryString({ experimentId })}`,
    { signal, cache: 'no-store' },
  );
  return record(payload, 'access catalog') as unknown as AccessCatalog;
}

export function isAccessCatalogSessionMissing(cause: unknown): boolean {
  return cause instanceof HTTPError && cause.status === 409;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} response must be an object`);
  }
  return value as Record<string, unknown>;
}
