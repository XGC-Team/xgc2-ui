import { createContext,useContext,useMemo,useRef,useSyncExternalStore } from 'react';
import type { AutomationPanelContext,PanelExecutionObserver } from '../../../panels/types';
import { createPanelExecutionObserver } from '../../../panels/panelExecutionObserver';
import { structuralEqual } from '../../../shared/structuralEqual';
import type { AutomationExecutionRelations } from '../../automation/automationPublic';
import type { ExperimentDashboardActions } from './useExperimentDashboardActions';

export type PanelAutomationRuntime = AutomationPanelContext['automation'];
export type PanelAutomationRuntimeMap = ReadonlyMap<string,PanelAutomationRuntime>;

/** Relations of the single full-Run System root, keyed by its exact revision. */
export type FullRunRelationsSnapshot = {
  rootId:string;
  rootRevision:number;
  loading:boolean;
  error:string;
  relations?:AutomationExecutionRelations;
};

/** Which host runtime a Panel falls back to when its target has no exact runtime. */
export type PanelRuntimeFallback = 'dashboard' | 'local';

/** Run-driven dashboard state. Frames and layout never read it. */
export type DashboardRunLifecycle = {
  actions: ExperimentDashboardActions;
  fullRunRelations?: FullRunRelationsSnapshot;
  /** Dashboard target runtime; fallback for configurable and dashboard Panels. */
  automation: PanelAutomationRuntime;
  /** Local GCS runtime; fallback for local-policy Panels. */
  localAutomation: PanelAutomationRuntime;
};

export type DashboardRunSnapshot = DashboardRunLifecycle & {
  /** Exact runtime per execution target, with bound workflow definitions. */
  runtimes: PanelAutomationRuntimeMap;
};

export type DashboardRunStore = {
  get: () => DashboardRunSnapshot;
  subscribe: (listener: () => void) => () => void;
};

export type DashboardRunPublisher = DashboardRunStore & {
  publish: (snapshot: DashboardRunSnapshot) => void;
};

/**
 * Run events change this snapshot, not the canvas render context: memoized
 * Panel frames stay put, and only the components that read Run state
 * subscribe to it.
 */
export function createDashboardRunStore(initial: DashboardRunSnapshot): DashboardRunPublisher {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    publish(snapshot) {
      if (snapshot === current) return;
      current = snapshot;
      listeners.forEach((listener) => listener());
    },
  };
}

const DashboardRunStoreContext = createContext<DashboardRunStore | null>(null);

export const DashboardRunStoreProvider = DashboardRunStoreContext.Provider;

export function useDashboardRunStore(): DashboardRunStore {
  const store = useContext(DashboardRunStoreContext);
  if (!store) throw new Error('Dashboard Run state is only available inside an Experiment dashboard.');
  return store;
}

/** The whole Run snapshot; the caller re-renders on every Run event. */
export function useDashboardRunSnapshot(): DashboardRunSnapshot {
  const store = useDashboardRunStore();
  return useSyncExternalStore(store.subscribe,store.get,store.get);
}

/**
 * The part of the Run snapshot a component renders. `select` must return
 * everything the render reads (as plain data); the caller re-renders only
 * when that selection changes structurally. Commands read `store.get()` when
 * they run instead of capturing a rendered snapshot.
 */
export function useDashboardRunSelection<T>(select: (snapshot: DashboardRunSnapshot) => T): T {
  const store = useDashboardRunStore();
  const selection = useRef<{ snapshot: DashboardRunSnapshot;select: typeof select;value: T } | undefined>(undefined);
  const read = () => {
    const snapshot = store.get();
    const previous = selection.current;
    if (previous && previous.snapshot === snapshot && previous.select === select) return previous.value;
    const next = select(snapshot);
    const value = previous && structuralEqual(previous.value,next) ? previous.value : next;
    selection.current = { snapshot,select,value };
    return value;
  };
  return useSyncExternalStore(store.subscribe,read,read);
}

export function panelFallbackRuntime(snapshot: DashboardRunSnapshot,fallback: PanelRuntimeFallback) {
  return fallback === 'local' ? snapshot.localAutomation : snapshot.automation;
}

/** The exact target runtime shared by every Panel on that target. */
export function panelAutomationRuntime(
  snapshot: DashboardRunSnapshot,
  targetId: string,
  fallback: PanelRuntimeFallback,
): PanelAutomationRuntime {
  return snapshot.runtimes.get(targetId) ?? panelFallbackRuntime(snapshot,fallback);
}

/**
 * Subscribable view of one Panel target's retained Run details. Components
 * that read a Run through it re-render for that Run only; commands keep the
 * target runtime's own identities so retention follows a replaced runtime.
 */
export function usePanelExecutionObserver(
  targetId: string,
  fallback: PanelRuntimeFallback,
  runtime: Pick<PanelAutomationRuntime,'loadRunDetail'|'retainRunDetail'|'retainRunObservation'>,
): PanelExecutionObserver {
  const store = useDashboardRunStore();
  const { loadRunDetail,retainRunDetail,retainRunObservation } = runtime;
  return useMemo(() => createPanelExecutionObserver(
    () => panelAutomationRuntime(store.get(),targetId,fallback).runDetailsById,
    store.subscribe,
    { loadRunDetail,retainRunDetail,retainRunObservation },
  ),[fallback,loadRunDetail,retainRunDetail,retainRunObservation,store,targetId]);
}
