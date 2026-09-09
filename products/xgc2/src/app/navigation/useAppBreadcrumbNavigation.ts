import { useCallback,useLayoutEffect,useState } from 'react';
import {
  configurationListHash,
  configurationResourceIdFromHash,
} from '../../shared/configurationLocation';
import type { Page } from './navConfig';

export type AppBreadcrumbState = { view: 'list' | 'detail'; name?: string };

export type AppBreadcrumbNavigation = {
  automation: AppBreadcrumbState;
  experiment: AppBreadcrumbState;
  showAutomationList: () => void;
  showExperimentList: () => void;
  showRobotList: () => void;
};

export function useExperimentHashResourceId() {
  const [resourceId,setResourceId] = useState(
    () => configurationResourceIdFromHash(window.location.hash, 'experiment'),
  );
  useLayoutEffect(() => {
    const sync = () => {
      setResourceId(configurationResourceIdFromHash(window.location.hash, 'experiment'));
    };
    window.addEventListener('hashchange', sync);
    sync();
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  return resourceId;
}

export function useAppBreadcrumbNavigation(_page: Page, navigatePage: (page: Page) => void): AppBreadcrumbNavigation {
  const [experiment] = useBreadcrumbState('xgc:experiment-breadcrumb');
  const [automation] = useBreadcrumbState('xgc:automation-breadcrumb');

  const showExperimentList = useCallback(() => {
    navigatePage('experiment');
    window.location.hash = configurationListHash('experiment');
    window.dispatchEvent(new CustomEvent('xgc:experiment-list'));
  }, [navigatePage]);
  const showRobotList = useCallback(() => {
    navigatePage('robotAssets');
    window.location.hash = configurationListHash('robotAsset');
    window.dispatchEvent(new CustomEvent('xgc:robot-list'));
  }, [navigatePage]);
  const showAutomationList = useCallback(() => {
    navigatePage('automations');
    window.dispatchEvent(new CustomEvent('xgc:automation-list'));
  }, [navigatePage]);

  return {
    automation,
    experiment,
    showAutomationList,
    showExperimentList,
    showRobotList,
  };
}

function useBreadcrumbState(eventName: string) {
  const [state,setState] = useState<AppBreadcrumbState>({ view: 'list' });
  useLayoutEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<Partial<AppBreadcrumbState>>).detail;
      setState({ view: detail?.view === 'detail' ? 'detail' : 'list',name: detail?.name });
    };
    window.addEventListener(eventName, update);
    return () => window.removeEventListener(eventName, update);
  }, [eventName]);
  return [state,setState] as const;
}
