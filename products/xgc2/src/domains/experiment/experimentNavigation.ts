import {
  configurationDetailHash,
  configurationListHash,
  configurationLocationFromHash,
  configurationResourceIdFromHash,
} from '../../shared/configurationLocation';
import { CONFIG_DASHBOARD_ID } from './experimentModel';
import { createDomainNavigationRequest } from '../../shared/domainNavigationRequest';

export type ExperimentSourceLocation = {
  targetId: string;
  resourceId: string;
  dashboardId?: string;
  preferActivity?: boolean;
};

const sourceNavigation = createDomainNavigationRequest<ExperimentSourceLocation>();
export const openExperimentSourceLocation = sourceNavigation.open;
export const registerExperimentSourceNavigation = sourceNavigation.register;

export type StoredExperimentLocation = {
  resourceId: string;
  dashboardId: string;
};

const EXPERIMENT_LAST_LOCATION_STORAGE_KEY = 'xgc.experiment.user.lastLocation';

export function experimentDocumentHash(resourceId: string, dashboardId = '') {
  const base = configurationDetailHash('experiment', resourceId);
  const dashboard = dashboardId.trim();
  if (!dashboard || dashboard === CONFIG_DASHBOARD_ID) return base;
  return `${base}/${encodeURIComponent(dashboard)}`;
}

export function experimentListHash() {
  return configurationListHash('experiment');
}

export function isExperimentLocationHash(hash: string) {
  return configurationLocationFromHash(hash)?.domain === 'experiment';
}

export function isExperimentListHash(hash: string) {
  return isExperimentLocationHash(hash) && !resourceIdFromExperimentHash(hash);
}

export function resourceIdFromExperimentHash(hash: string) {
  return configurationResourceIdFromHash(hash, 'experiment');
}

export function dashboardIdFromExperimentHash(hash: string) {
  const location = configurationLocationFromHash(hash);
  if (location?.domain !== 'experiment' || !location.resourceId) return '';
  const prefix = `${configurationListHash('experiment')}/${encodeURIComponent(location.resourceId)}/`;
  if (!hash.startsWith(prefix)) return '';
  const dashboardId = hash.slice(prefix.length);
  if (!dashboardId || dashboardId.includes('/')) return '';
  try {
    return decodeURIComponent(dashboardId);
  } catch {
    return '';
  }
}

export function experimentLastLocationStorageKey() {
  return EXPERIMENT_LAST_LOCATION_STORAGE_KEY;
}

export function readStoredExperimentLocation(): StoredExperimentLocation | undefined {
  try {
    const raw = window.localStorage.getItem(EXPERIMENT_LAST_LOCATION_STORAGE_KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object') return undefined;
    const candidate = value as Partial<StoredExperimentLocation>;
    if (typeof candidate.resourceId !== 'string' || !candidate.resourceId.trim()) return undefined;
    if (typeof candidate.dashboardId !== 'string') return undefined;
    return {
      resourceId: candidate.resourceId.trim(),
      dashboardId: candidate.dashboardId.trim() || CONFIG_DASHBOARD_ID,
    };
  } catch {
    return undefined;
  }
}

export function storeExperimentLocation(resourceId: string, dashboardId: string) {
  const nextResourceId = resourceId.trim();
  if (!nextResourceId) return;
  try {
    window.localStorage.setItem(EXPERIMENT_LAST_LOCATION_STORAGE_KEY, JSON.stringify({
      resourceId: nextResourceId,
      dashboardId: dashboardId.trim() || CONFIG_DASHBOARD_ID,
    } satisfies StoredExperimentLocation));
  } catch {
    return;
  }
}

export function clearStoredExperimentLocation() {
  try {
    window.localStorage.removeItem(EXPERIMENT_LAST_LOCATION_STORAGE_KEY);
  } catch {
    return;
  }
}
