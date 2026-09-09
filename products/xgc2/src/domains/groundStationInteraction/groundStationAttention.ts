import { useSyncExternalStore } from 'react';
import type { GroundStationInteraction } from './groundStationInteractionTypes';

type Receipt = { read?: number; hidden?: number };
type Receipts = Readonly<Record<string,Receipt>>;
const storageKey = 'xgc.ground-station.viewer-receipts.v1';
const listeners = new Set<() => void>();
const empty: Receipts = {};
let current: Receipts | undefined;
let stored: string | undefined;

export function interactionAttentionKey(item: GroundStationInteraction, targetId: string) {
  return JSON.stringify([item.origin.type === 'web-panel' ? item.targetScope : targetId,item.targetScope,item.id]);
}

function read(): Receipts {
  try {
    const raw = window.localStorage.getItem(storageKey) || '{}';
    if (current && raw === stored) return current;
    stored = raw;
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      current = Object.fromEntries(Object.entries(value).filter((entry): entry is [string,Receipt] => validReceipt(entry[1])).slice(-1024));
      return current;
    }
  } catch { /* Viewer storage may be unavailable; interaction facts remain on the server. */ }
  current ??= empty;
  return current;
}

function update(item: GroundStationInteraction, kind: keyof Receipt, targetId: string) {
  const key = interactionAttentionKey(item, targetId);
  const previous = read();
  if ((previous[key]?.[kind] ?? 0) >= item.revision) return;
  current = Object.fromEntries(Object.entries({
    ...previous,[key]: { ...previous[key],[kind]: item.revision },
  }).slice(-1024));
  try {
    const next = JSON.stringify(current);
    window.localStorage.setItem(storageKey, next);
    stored = next;
  } catch { /* Keep this window's receipt. */ }
  listeners.forEach((listener) => listener());
}

export function markGroundStationRead(item: GroundStationInteraction, targetId: string) { update(item, 'read', targetId); }
export function hideGroundStationNotification(item: GroundStationInteraction, targetId: string) { update(item, 'hidden', targetId); }
export function groundStationRead(item: GroundStationInteraction, receipts: Receipts, targetId: string) {
  return (receipts[interactionAttentionKey(item, targetId)]?.read ?? 0) >= item.revision;
}
export function groundStationNotificationHidden(item: GroundStationInteraction, receipts: Receipts, targetId: string) {
  return (receipts[interactionAttentionKey(item, targetId)]?.hidden ?? 0) >= item.revision;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const changed = (event: StorageEvent) => {
    if (event.key && event.key !== storageKey) return;
    current = undefined;
    listeners.forEach((notify) => notify());
  };
  window.addEventListener('storage', changed);
  return () => { listeners.delete(listener); window.removeEventListener('storage', changed); };
}
export function useGroundStationAttention() { return useSyncExternalStore(subscribe, read, () => empty); }

export function groundStationAttentionPriority(item: GroundStationInteraction) {
  if (item.kind === 'decision' && item.status === 'open') return 6;
  return { critical: 5,error: 4,warning: 3,success: 2,info: 1 }[item.severity];
}

function validReceipt(value: unknown): value is Receipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const receipt = value as Record<string,unknown>;
  return ['read','hidden'].every((key) => receipt[key] === undefined
    || (typeof receipt[key] === 'number' && Number.isSafeInteger(receipt[key]) && receipt[key] > 0));
}
