import { useEffect,useSyncExternalStore } from 'react';
import type { GroundStationInteractionSeverity,GroundStationMessageInteraction } from './groundStationInteractionTypes';
import { decodeGroundStationInteraction } from './groundStationInteractionDecoder';

export type LocalGroundStationNotificationInput = {
  targetId: string;
  title: string;
  message: string;
  severity?: GroundStationInteractionSeverity;
  durationMs?: number;
  source?: string;
  dedupeKey?: string;
};

const listeners = new Set<() => void>();
const snapshots = new Map<string,readonly GroundStationMessageInteraction[]>();
const emptySnapshot: readonly GroundStationMessageInteraction[] = [];
let sequence = 0;
const storageKey = 'xgc.ground-station.local-notifications.v1';
let allSnapshot: readonly GroundStationMessageInteraction[] = emptySnapshot;
let hydrated = false;

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(value)) return;
    for (const raw of value.slice(0, 128)) {
      const item = decodeGroundStationInteraction(raw);
      if (!item || item.kind !== 'message' || !isLocalGroundStationNotification(item)) continue;
      snapshots.set(item.targetScope, [...(snapshots.get(item.targetScope) ?? []),item].slice(0, 32));
    }
    allSnapshot = [...snapshots.values()].flat();
  } catch { /* Notifications remain available without viewer storage. */ }
}

export function publishLocalGroundStationNotification(input: LocalGroundStationNotificationInput) {
  hydrate();
  const targetId = normalizedTarget(input.targetId);
  const message = input.message.trim();
  if (!message) return undefined;
  const title = input.title.trim() || 'Ground station';
  const source = input.source?.trim() || 'WebUI';
  const dedupeKey = input.dedupeKey?.trim();
  const current = snapshots.get(targetId) ?? emptySnapshot;
  const existing = dedupeKey ? current.find((item) => item.origin.ref === dedupeKey) : undefined;
  const now = new Date().toISOString();
  const interaction: GroundStationMessageInteraction = {
    schemaVersion: 1,
    // A new occurrence gets a new identity even after bounded history evicts an
    // earlier error with this dedupe key. Its old receipt must not hide a recurrence.
    id: existing?.id ?? localID(targetId, `${dedupeKey || 'notice'}:${Date.now()}:${sequence += 1}:${crypto.randomUUID()}`),
    targetScope: targetId,
    revision: (existing?.revision ?? 0) + 1,
    status: 'open',
    kind: 'message',
    presentation: 'toast',
    responseMode: 'none',
    severity: input.severity ?? 'error',
    title,
    message,
    origin: { type: 'web-panel',displayName: source,...(dedupeKey ? { ref: dedupeKey } : {}) },
    audience: { scope: 'all' },
    payload: { message: { durationMs: boundedDuration(input.durationMs),dismissLabel: 'Dismiss' } },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  snapshots.set(targetId, [interaction,...current.filter((item) => item.id !== interaction.id)].slice(0, 32));
  emit();
  return interaction;
}

export function dismissLocalGroundStationNotification(targetId: string, id: string) {
  const target = normalizedTarget(targetId);
  const current = snapshots.get(target) ?? emptySnapshot;
  const next = current.filter((item) => item.id !== id);
  if (next.length === current.length) return;
  snapshots.set(target, next);
  emit();
}

export function useLocalGroundStationNotifications(targetId: string) {
  hydrate();
  const target = normalizedTarget(targetId);
  return useSyncExternalStore(subscribe, () => snapshots.get(target) ?? emptySnapshot, () => emptySnapshot);
}

/** App feedback stays reachable when the execution target or active page changes. */
export function useAllLocalGroundStationNotifications() {
  hydrate();
  return useSyncExternalStore(subscribe, () => allSnapshot, () => emptySnapshot);
}

export function useGroundStationErrorNotification(
  targetId: string,
  message: string,
  options: { title: string;source?: string;dedupeKey?: string },
) {
  useGroundStationNotification(targetId, message, { ...options,severity: 'error' });
}

export function useGroundStationNotification(
  targetId: string,
  message: string,
  options: { title: string;severity?: GroundStationInteractionSeverity;source?: string;dedupeKey?: string;durationMs?: number },
) {
  const title = options.title;
  const severity = options.severity;
  const source = options.source;
  const dedupeKey = options.dedupeKey;
  const durationMs = options.durationMs;
  useEffect(() => {
    if (!message.trim()) return;
    publishLocalGroundStationNotification({
      targetId,title,message,severity,source,durationMs,dedupeKey: dedupeKey || `${source || title}:${severity || 'error'}`,
    });
  }, [dedupeKey,durationMs,message,severity,source,targetId,title]);
}

export function isLocalGroundStationNotification(interaction: GroundStationMessageInteraction) {
  return interaction.id.startsWith('local-notification:');
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  allSnapshot = [...snapshots.values()].flat().sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 128);
  try { window.localStorage.setItem(storageKey, JSON.stringify(allSnapshot)); } catch { /* Keep this window's notices. */ }
  listeners.forEach((listener) => listener());
}
function normalizedTarget(targetId: string) { return targetId.trim() || 'local'; }
function localID(targetId: string, key: string) { return `local-notification:${encodeURIComponent(targetId)}:${encodeURIComponent(key)}`; }
function boundedDuration(value?: number) {
  if (!Number.isFinite(value)) return 8_000;
  return Math.max(1_500, Math.min(30_000, Math.round(value!)));
}
