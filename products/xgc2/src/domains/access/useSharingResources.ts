import { useCallback, useEffect, useState } from 'react';
import { listExperiments, type ExperimentDocument } from '../experiment/experimentPublic';
import { listRobotAssets, type RobotAssetDocument } from '../robot/robotAssetPublic';
import { getAccessCatalog, isAccessCatalogSessionMissing } from './accessService';
import type { AccessCatalog } from './accessTypes';

type RemoteDocument<T> =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; document: T };

/** Owns management inventory reads and discards results after the view leaves. */
export function useSharingResources() {
  const [experiments, setExperiments] = useState<ExperimentDocument[] | null>(null);
  const [experimentsFailed, setExperimentsFailed] = useState(false);
  const [experimentsRetry, setExperimentsRetry] = useState(0);
  const retryExperiments = useCallback(() => setExperimentsRetry((current) => current + 1), []);
  const [robotAssets, setRobotAssets] = useState<RobotAssetDocument[]>([]);

  useEffect(() => {
    let alive = true;
    setExperimentsFailed(false);
    listExperiments()
      .then((documents) => { if (alive) setExperiments(documents); })
      .catch(() => {
        if (!alive) return;
        setExperiments([]);
        setExperimentsFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [experimentsRetry]);

  useEffect(() => {
    let alive = true;
    listRobotAssets()
      .then((documents) => { if (alive) setRobotAssets(documents); })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return { experiments, experimentsFailed, robotAssets, retryExperiments };
}

export function useSharedPanelTitle(panelSurfaceExperimentId: string, panelSurfacePanelId: string) {
  const [panelTitle, setPanelTitle] = useState('');
  useEffect(() => {
    setPanelTitle('');
    if (!panelSurfaceExperimentId) return undefined;
    let alive = true;
    getAccessCatalog(panelSurfaceExperimentId)
      .then((catalog) => {
        if (!alive) return;
        for (const module of catalog.modules) {
          for (const resource of module.resources) {
            if (resource.surface.kind === 'experiment-panel' && resource.surface.panelId === panelSurfacePanelId
              && resource.title.trim()) {
              setPanelTitle(resource.title.trim());
              return;
            }
          }
        }
        const unsupported = catalog.unsupportedPanels.find((panel) => panel.panelId === panelSurfacePanelId);
        if (unsupported?.title.trim()) setPanelTitle(unsupported.title.trim());
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [panelSurfaceExperimentId, panelSurfacePanelId]);
  return panelTitle;
}

/** A catalog response belongs to one experiment selection and retry generation. */
export function useAccessCatalog(experimentId: string, catalogRetry: number) {
  const [catalog, setCatalog] = useState<RemoteDocument<AccessCatalog>>({ state: 'loading' });
  const [catalogFor, setCatalogFor] = useState('');
  const [sessionMissing, setSessionMissing] = useState(false);
  useEffect(() => {
    setCatalog({ state: 'loading' });
    setSessionMissing(false);
    if (!experimentId) return undefined;
    let alive = true;
    const target = experimentId;
    getAccessCatalog(target)
      .then((document) => {
        if (!alive) return;
        setCatalog({ state: 'ready', document });
        setCatalogFor(target);
      })
      .catch((cause) => {
        if (!alive) return;
        setCatalog({ state: 'failed' });
        setCatalogFor(target);
        setSessionMissing(isAccessCatalogSessionMissing(cause));
      });
    return () => {
      alive = false;
    };
  }, [experimentId, catalogRetry]);
  return { catalog, catalogFor, sessionMissing };
}
