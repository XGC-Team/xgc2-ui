import { useEffect,useMemo,useState } from 'react';
import {
  clipExperimentDashboardTabName,
  CONFIG_DASHBOARD_ID,
  defaultDashboard,
  defaultDashboards,
  normalizeExperimentDashboards,
  uniqueDashboardId,
  type ExperimentDashboard,
  type ExperimentDocument,
} from '../experimentModel';
import { experimentWithDashboards } from './experimentDashboardDocument';

export function useExperimentDashboardCollection({
  visibleExperiment,
  activeDraft,
  editing,
  updateDraft,
  selectedDashboardId: selectedDashboardIdProp,
  onSelectedDashboardIdChange,
}: {
  visibleExperiment?: ExperimentDocument;
  activeDraft?: ExperimentDocument;
  editing: boolean;
  updateDraft: (draft: ExperimentDocument) => void;
  selectedDashboardId?: string;
  onSelectedDashboardIdChange?: (id: string) => void;
}) {
  const [internalDashboardId,setInternalDashboardId] = useState(defaultDashboard.id);
  const controlled = selectedDashboardIdProp !== undefined;
  const selectedDashboardId = (controlled ? selectedDashboardIdProp : internalDashboardId).trim()
    || CONFIG_DASHBOARD_ID;
  const [deleteTarget,setDeleteTarget] = useState<ExperimentDashboard | null>(null);
  const items = useMemo(() => visibleExperiment
    ? normalizeExperimentDashboards(visibleExperiment.spec.dashboards)
    : defaultDashboards, [visibleExperiment]);
  const selected = useMemo(
    () => items.find((item) => item.id === selectedDashboardId) ?? items[0] ?? defaultDashboard,
    [items,selectedDashboardId],
  );

  function commitSelectedDashboardId(id: string) {
    const next = id.trim() || CONFIG_DASHBOARD_ID;
    if (controlled) onSelectedDashboardIdChange?.(next);
    else setInternalDashboardId(next);
  }

  useEffect(() => {
    if (!editing) setDeleteTarget(null);
  }, [editing]);

  function replace(nextDashboards: ExperimentDashboard[]) {
    if (!activeDraft) return;
    updateDraft(experimentWithDashboards(activeDraft, nextDashboards));
  }

  function create() {
    if (!editing) return;
    const id = uniqueDashboardId(items, `dashboard-${Date.now()}`);
    replace([...items,{
      id,
      name: clipExperimentDashboardTabName(`Dashboard ${items.length + 1}`),
      description: 'Custom operator dashboard.',
      panels: [],
    }]);
    commitSelectedDashboardId(id);
  }

  function rename(id: string, name: string) {
    if (!editing) return;
    const nextName = clipExperimentDashboardTabName(name);
    if (!nextName) return;
    replace(items.map((dashboard) => dashboard.id === id ? { ...dashboard,name: nextName } : dashboard));
  }

  function requestDelete(id: string) {
    if (!editing || items.length <= 1) return;
    setDeleteTarget(items.find((dashboard) => dashboard.id === id) ?? null);
  }

  function confirmDelete() {
    if (!editing || !deleteTarget || items.length <= 1) {
      setDeleteTarget(null);
      return;
    }
    const remaining = items.filter((dashboard) => dashboard.id !== deleteTarget.id);
    replace(remaining);
    if (selectedDashboardId === deleteTarget.id) {
      commitSelectedDashboardId(remaining[0]?.id ?? defaultDashboard.id);
    }
    setDeleteTarget(null);
  }

  function reorder(orderedIds: string[]) {
    if (!editing || orderedIds.length !== items.length || orderedIds.length <= 1) return;
    const byId = new Map(items.map((dashboard) => [dashboard.id, dashboard]));
    if (new Set(orderedIds).size !== items.length) return;
    if (!orderedIds.every((id) => byId.has(id))) return;
    if (orderedIds.every((id, index) => items[index]?.id === id)) return;
    replace(orderedIds.map((id) => byId.get(id)!));
  }

  function select(id: string) {
    const next = id.trim();
    if (!next) return;
    commitSelectedDashboardId(next);
  }

  return {
    items,
    selected,
    select,
    create,
    rename,
    reorder,
    deleteTarget,
    requestDelete,
    cancelDelete: () => setDeleteTarget(null),
    confirmDelete,
  };
}
