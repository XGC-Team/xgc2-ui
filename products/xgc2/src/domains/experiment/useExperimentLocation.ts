import { useCallback,useEffect,useRef,useState } from 'react';
import { CONFIG_DASHBOARD_ID } from './experimentModel';
import { getExperiment } from './experimentService';
import {
  clearStoredExperimentLocation,
  dashboardIdFromExperimentHash,
  experimentDocumentHash,
  experimentListHash,
  isExperimentListHash,
  isExperimentLocationHash,
  readStoredExperimentLocation,
  registerExperimentSourceNavigation,
  resourceIdFromExperimentHash,
  storeExperimentLocation,
} from './experimentNavigation';

export type ExperimentLocationView = 'list' | 'detail';

function dashboardFromHash(hash: string) {
  return dashboardIdFromExperimentHash(hash) || CONFIG_DASHBOARD_ID;
}

export function useExperimentLocation(page = 'experiment', targetId = 'local') {
  const pageRef = useRef(page);
  pageRef.current = page;
  const [initialLocation] = useState(() => {
    const hashResourceId = resourceIdFromExperimentHash(window.location.hash);
    if (hashResourceId) {
      return { resourceId: hashResourceId,dashboardId: dashboardFromHash(window.location.hash) };
    }
    if (isExperimentListHash(window.location.hash)) {
      clearStoredExperimentLocation();
      return { resourceId: '',dashboardId: CONFIG_DASHBOARD_ID };
    }
    return page === 'experiment'
      ? readStoredExperimentLocation() ?? { resourceId: '',dashboardId: CONFIG_DASHBOARD_ID }
      : { resourceId: '',dashboardId: CONFIG_DASHBOARD_ID };
  });
  const [view,setViewState] = useState<ExperimentLocationView>(initialLocation.resourceId ? 'detail' : 'list');
  const [selectedExperimentId,setSelectedExperimentIdState] = useState(initialLocation.resourceId);
  const [selectedDashboardId,setSelectedDashboardIdState] = useState(initialLocation.dashboardId);
  const viewRef = useRef(view);
  viewRef.current = view;
  const selectedExperimentIdRef = useRef(selectedExperimentId);
  const selectedDashboardIdRef = useRef(selectedDashboardId);
  const targetIdRef = useRef(targetId);
  targetIdRef.current = targetId;

  const commitHash = useCallback((resourceId: string, dashboardId: string, nextView: ExperimentLocationView) => {
    const nextHash = nextView === 'detail' && resourceId
      ? experimentDocumentHash(resourceId, dashboardId)
      : experimentListHash();
    if (window.location.hash !== nextHash) window.location.hash = nextHash;
  }, []);

  const setSelectedExperimentId = useCallback((id: string) => {
    const resourceId = id.trim();
    if (resourceId !== selectedExperimentIdRef.current) {
      selectedDashboardIdRef.current = CONFIG_DASHBOARD_ID;
      setSelectedDashboardIdState(CONFIG_DASHBOARD_ID);
    }
    if (!resourceId) clearStoredExperimentLocation();
    selectedExperimentIdRef.current = resourceId;
    setSelectedExperimentIdState(resourceId);
  }, []);

  const setSelectedDashboardId = useCallback((id: string) => {
    const dashboardId = id.trim() || CONFIG_DASHBOARD_ID;
    selectedDashboardIdRef.current = dashboardId;
    setSelectedDashboardIdState(dashboardId);
    if (pageRef.current !== 'experiment' || viewRef.current !== 'detail') return;
    storeExperimentLocation(selectedExperimentIdRef.current, dashboardId);
    commitHash(selectedExperimentIdRef.current, dashboardId, 'detail');
  }, [commitHash]);

  const setView = useCallback((nextView: ExperimentLocationView) => {
    setViewState(nextView);
    viewRef.current = nextView;
    if (nextView === 'detail') {
      storeExperimentLocation(selectedExperimentIdRef.current, selectedDashboardIdRef.current);
    } else {
      clearStoredExperimentLocation();
    }
    commitHash(selectedExperimentIdRef.current, selectedDashboardIdRef.current, nextView);
  }, [commitHash]);

  const replaceInvalidDetailWithList = useCallback(() => {
    setSelectedExperimentId('');
    clearStoredExperimentLocation();
    setViewState('list');
    viewRef.current = 'list';
    const hash = experimentListHash();
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  }, [setSelectedExperimentId]);

  const replaceDetailResourceId = useCallback((id: string) => {
    const resourceId = id.trim();
    if (!resourceId || viewRef.current !== 'detail') return;
    selectedExperimentIdRef.current = resourceId;
    setSelectedExperimentIdState(resourceId);
    storeExperimentLocation(resourceId, selectedDashboardIdRef.current);
    const hash = experimentDocumentHash(resourceId, selectedDashboardIdRef.current);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  }, []);

  useEffect(() => registerExperimentSourceNavigation(async ({ destination,signal,activate }) => {
    if (signal.aborted || destination.targetId !== targetIdRef.current || !destination.resourceId.trim()) return false;
    const document = await getExperiment(destination.resourceId, signal);
    if (signal.aborted || destination.targetId !== targetIdRef.current
      || document.head.resourceId !== destination.resourceId || document.head.archived) return false;
    const activityDashboard = destination.preferActivity
      ? document.spec.dashboards.find((dashboard) => dashboard.panels.some((panel) => (
        panel.pluginId === 'ground-station-activity'
        && (!panel.executionTargetId || panel.executionTargetId === destination.targetId)
      )))?.id
      : undefined;
    const dashboardId = destination.dashboardId || activityDashboard || CONFIG_DASHBOARD_ID;
    if (dashboardId !== CONFIG_DASHBOARD_ID && !document.spec.dashboards.some((dashboard) => dashboard.id === dashboardId)) return false;
    // Update the owner before activate clears the global hash. Park restoration
    // will now restore the requested location, never the previous Experiment.
    selectedExperimentIdRef.current = document.head.resourceId;
    selectedDashboardIdRef.current = dashboardId;
    viewRef.current = 'detail';
    setSelectedExperimentIdState(document.head.resourceId);
    setSelectedDashboardIdState(dashboardId);
    setViewState('detail');
    storeExperimentLocation(document.head.resourceId, dashboardId);
    activate();
    commitHash(document.head.resourceId, dashboardId, 'detail');
    return true;
  }), [commitHash,targetId]);

  useEffect(() => {
    if (page !== 'experiment' || viewRef.current !== 'detail' || !selectedExperimentIdRef.current) return;
    const resourceId = selectedExperimentIdRef.current;
    const dashboardId = selectedDashboardIdRef.current;
    storeExperimentLocation(resourceId, dashboardId);
    const hash = experimentDocumentHash(resourceId, dashboardId);
    if (window.location.hash === hash) return;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  }, [page]);

  useEffect(() => {
    const showList = () => {
      setView('list');
    };
    window.addEventListener('xgc:experiment-list', showList);
    return () => window.removeEventListener('xgc:experiment-list', showList);
  }, [setView]);

  useEffect(() => {
    const syncLocation = () => {
      if (!window.location.hash) {
        if (pageRef.current !== 'experiment') return;
        if (viewRef.current === 'detail' && selectedExperimentIdRef.current) {
          const hash = experimentDocumentHash(
            selectedExperimentIdRef.current,
            selectedDashboardIdRef.current,
          );
          if (window.location.hash !== hash) {
            window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
          }
          return;
        }
        clearStoredExperimentLocation();
        setViewState('list');
        viewRef.current = 'list';
        return;
      }
      if (!isExperimentLocationHash(window.location.hash)) return;
      const resourceId = resourceIdFromExperimentHash(window.location.hash);
      if (resourceId) {
        setSelectedExperimentId(resourceId);
        const dashboardId = dashboardFromHash(window.location.hash);
        selectedDashboardIdRef.current = dashboardId;
        setSelectedDashboardIdState(dashboardId);
        setViewState('detail');
        viewRef.current = 'detail';
        storeExperimentLocation(resourceId, dashboardId);
        return;
      }
      clearStoredExperimentLocation();
      setViewState('list');
      viewRef.current = 'list';
    };
    window.addEventListener('hashchange', syncLocation);
    return () => window.removeEventListener('hashchange', syncLocation);
  }, [setSelectedExperimentId]);

  return {
    view,
    setView,
    selectedExperimentId,
    setSelectedExperimentId,
    selectedDashboardId,
    setSelectedDashboardId,
    replaceDetailResourceId,
    replaceInvalidDetailWithList,
  };
}
