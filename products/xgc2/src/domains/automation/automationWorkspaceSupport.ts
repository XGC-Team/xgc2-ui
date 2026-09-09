import type { Viewport } from '@xyflow/react';
import type { AutomationGraphInstance } from './automationGraphTypes';

export type AutomationPoint = { x: number;y: number };

export function viewportCenter(instance: AutomationGraphInstance | null, element: HTMLDivElement | null): AutomationPoint {
  if (!instance || !element) return { x: 80,y: 80 };
  const bounds = element.getBoundingClientRect();
  return instance.screenToFlowPosition({ x: bounds.left + bounds.width / 2,y: bounds.top + bounds.height / 2 });
}
export function viewportKey(resourceId: string) {
  return `xgc.automation.viewport.${encodeURIComponent(resourceId)}`;
}

export function readViewport(key: string): Viewport | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!isRecord(value) || !finiteNumber(value.x) || !finiteNumber(value.y) || !finiteNumber(value.zoom)) return undefined;
    return { x: value.x,y: value.y,zoom: value.zoom };
  } catch {
    return undefined;
  }
}

export function writeViewport(key: string, viewport: Viewport) {
  try {
    localStorage.setItem(key, JSON.stringify(viewport));
  } catch {
    // Viewport persistence is best-effort and never blocks Automation editing.
  }
}

export function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

export function isRecord(value: unknown): value is Record<string,unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function shortRunID(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-3)}` : value;
}
