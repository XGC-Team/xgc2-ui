import { createEventCoalescer,type EventCoalescer } from '../../shared/eventCoalescer';

const EXECUTION_CURSOR_EPOCH = 'execution-v8';
const CURSOR_WRITE_DELAY_MS = 16;

export type StoredExecutionCursor = {
  streamId: string;
  offset: number;
};

type PendingCursorWrite = {
  cursor:StoredExecutionCursor;
  coalescer:EventCoalescer;
};

const pendingCursorWrites=new Map<string,PendingCursorWrite>();

export function readExecutionCursor(targetId: string): StoredExecutionCursor {
  try {
    const raw = window.sessionStorage.getItem(executionCursorStorageKey(targetId));
    if (!raw) return emptyExecutionCursor();
    const parsed = JSON.parse(raw) as unknown;
    if (!isStoredExecutionCursor(parsed)) return emptyExecutionCursor();
    return { streamId: parsed.streamId.trim(),offset: parsed.offset };
  } catch {
    return emptyExecutionCursor();
  }
}

export function writeExecutionCursor(targetId: string, cursor: StoredExecutionCursor) {
  cancelPendingCursorWrite(targetId);
  persistExecutionCursor(targetId,cursor);
}

export function scheduleExecutionCursorWrite(targetId:string,cursor:StoredExecutionCursor) {
  const pending=pendingCursorWrites.get(targetId);
  if (pending) {
    pending.cursor=cursor;
    return;
  }
  const write:PendingCursorWrite={ cursor,coalescer:createEventCoalescer(CURSOR_WRITE_DELAY_MS,() => {
      if (pendingCursorWrites.get(targetId)!==write) return;
      pendingCursorWrites.delete(targetId);
      persistExecutionCursor(targetId,write.cursor);
    }) };
  pendingCursorWrites.set(targetId,write);
  write.coalescer.schedule();
}

export function flushExecutionCursor(targetId:string) {
  const pending=pendingCursorWrites.get(targetId);
  if (!pending) return;
  pending.coalescer.cancel();
  pendingCursorWrites.delete(targetId);
  persistExecutionCursor(targetId,pending.cursor);
}

export function resetExecutionCursorWritesForTests() {
  pendingCursorWrites.forEach(({ coalescer }) => coalescer.cancel());
  pendingCursorWrites.clear();
}

function persistExecutionCursor(targetId:string,cursor:StoredExecutionCursor) {
  try {
    window.sessionStorage.setItem(executionCursorStorageKey(targetId), JSON.stringify(cursor));
  } catch {
    // The live snapshot remains authoritative when session storage is unavailable.
  }
}

function cancelPendingCursorWrite(targetId:string) {
  const pending=pendingCursorWrites.get(targetId);
  if (!pending) return;
  pending.coalescer.cancel();
  pendingCursorWrites.delete(targetId);
}

function executionCursorStorageKey(targetId: string) {
  return `xgc.execution.lastOffset.${EXECUTION_CURSOR_EPOCH}.${targetId}`;
}

function emptyExecutionCursor(): StoredExecutionCursor {
  return { streamId: '',offset: 0 };
}

function isStoredExecutionCursor(value: unknown): value is StoredExecutionCursor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const cursor = value as Record<string,unknown>;
  return Object.keys(cursor).length === 2
    && typeof cursor.streamId === 'string'
    && Number.isSafeInteger(cursor.offset)
    && Number(cursor.offset) >= 0;
}
