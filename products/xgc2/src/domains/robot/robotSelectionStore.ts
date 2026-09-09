import { useCallback,useMemo,type Dispatch,type SetStateAction } from 'react';
import { panelStateKey,usePanelState,type PanelStateScope } from '../../shared/panelPrivateState';

/**
 * Robot selection is panel state like any other: this store keys it by whatever
 * scope the caller was handed, and the caller is handed the scope its plugin
 * manifest declared. Robot instruments picks the robots and Robot control acts
 * on them, so both manifests declare `sharedStateScope: 'experiment'` and both
 * therefore land on one experiment-wide slot. A plugin that declares nothing
 * keeps its own instance's slot, and this module never has to know which plugin
 * is asking.
 */
const selectionKey = 'robot.selection';
const noSelection: string[] = [];

export function robotSelectionKey(scope: PanelStateScope) {
  return panelStateKey(scope, selectionKey);
}

export function readRobotSelection(scope: PanelStateScope) {
  return normalizeSelection(readStoredSelection(robotSelectionKey(scope)));
}

/**
 * Typed Panel Workflow parameters owned by the experiment-wide robot.selection
 * slot. Empty robotId means the frozen roster; a sole selection is that slot.
 * robotIds is always sorted so run-robots can filter the same subset across
 * simulation / physical / hybrid. selectionKey is the canonical admission
 * identity, so a selected subset never replaces the concurrently managed
 * full-roster parent.
 */
export function canonicalRobotSelectionParameters(robotIds: readonly string[]) {
  const normalized = Array.from(new Set(
    robotIds
      .filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
      .map((id) => id.trim()),
  )).sort();
  return {
    robotIds: normalized,
    robotId: normalized.length === 1 ? normalized[0]! : '',
    selectionKey: normalized.length === 0
      ? 'all'
      : `selected:${JSON.stringify(normalized)}`,
  };
}

export function robotSelectionWorkflowParameters(experimentId?: string) {
  return canonicalRobotSelectionParameters(
    readRobotSelection({ experimentId,shared: 'experiment' }),
  );
}

export function useRobotSelection(scope: PanelStateScope) {
  const [stored,setStored] = usePanelState<string[]>(scope, selectionKey, noSelection);
  const selected = useMemo(() => normalizeSelection(stored), [stored]);
  const setSelected: Dispatch<SetStateAction<string[]>> = useCallback((value) => {
    setStored((current) => {
      const previous = normalizeSelection(current);
      const next = normalizeSelection(typeof value === 'function' ? value(previous) : value);
      return sameSelection(next, previous) ? current : next;
    });
  }, [setStored]);
  return [selected,setSelected] as const;
}

function readStoredSelection(storageKey: string): unknown {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function normalizeSelection(items: unknown) {
  if (!Array.isArray(items)) return noSelection;
  return Array.from(new Set(items
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .map((item) => item.trim())));
}

function sameSelection(left: string[], right: string[]) {
  return left.length === right.length && left.every((value,index) => value === right[index]);
}
