import { request,withTerminalAuth,type ApiTargetOptions } from '../../api/http';
import { executionTargetResourceId } from '../execution/executionPublic';
import { queryString,segment } from '../../shared/url';
import type { AppStoreInstallOperation,AppStoreJobResponse,AppStoreSetting,AppStoreSnapshot,AppStoreVersionDiff } from './appStoreModel';

export type AppStoreJobIntent = {
  targetId?: string;
  requestId: string;
  idempotencyKey: string;
  reason: string;
};

export type AppStoreCatalogAction = AppStoreJobIntent & { action: 'sync' };
export type AppStoreAppAction = AppStoreJobIntent & { action: 'install'; version?: string };
export type AppStoreInstallAction = AppStoreJobIntent & { action: AppStoreInstallOperation; version?: string };

export function getAppStoreSnapshot(targetId: string, options?: ApiTargetOptions): Promise<AppStoreSnapshot> {
  return request<AppStoreSnapshot>(`/app-store/snapshot${targetQuery(targetId)}`, undefined, options);
}

export function saveAppStoreSetting(targetId: string, setting: AppStoreSetting, options?: ApiTargetOptions): Promise<AppStoreSetting> {
  return request<AppStoreSetting>(`/app-store/settings${targetQuery(targetId)}`, { method: 'PUT',body: JSON.stringify(setting) }, withTerminalAuth(options));
}

export function syncCatalogAppStore(body: AppStoreCatalogAction, options?: ApiTargetOptions): Promise<AppStoreJobResponse> {
  const payload = { ...body,targetId: executionTargetResourceId(body.targetId) };
  return request<AppStoreJobResponse>('/app-store/catalog/actions', {
    method: 'POST',
    headers: { 'X-Request-ID': body.requestId,'Idempotency-Key': body.idempotencyKey },
    body: JSON.stringify(payload),
  }, withTerminalAuth(options));
}

export function installAppStoreApp(id: string, body: AppStoreAppAction, options?: ApiTargetOptions): Promise<AppStoreJobResponse> {
  const payload = { ...body,targetId: executionTargetResourceId(body.targetId) };
  return request<AppStoreJobResponse>(`/app-store/apps/${segment(id)}/actions`, {
    method: 'POST',
    headers: { 'X-Request-ID': body.requestId,'Idempotency-Key': body.idempotencyKey },
    body: JSON.stringify(payload),
  }, withTerminalAuth(options));
}

export function operateAppStoreInstall(id: string, body: AppStoreInstallAction, options?: ApiTargetOptions): Promise<AppStoreJobResponse> {
  const payload = { ...body,targetId: executionTargetResourceId(body.targetId) };
  return request<AppStoreJobResponse>(`/app-store/installed/${segment(id)}/actions`, {
    method: 'POST',
    headers: { 'X-Request-ID': body.requestId,'Idempotency-Key': body.idempotencyKey },
    body: JSON.stringify(payload),
  }, withTerminalAuth(options));
}

export function getAppStoreInstallDiff(id: string, targetId: string, version?: string, options?: ApiTargetOptions): Promise<AppStoreVersionDiff> {
  return request<AppStoreVersionDiff>(`/app-store/installed/${segment(id)}/diff${queryString({ targetId: executionTargetResourceId(targetId),version })}`, undefined, options);
}

function targetQuery(targetId: string) {
  return queryString({ targetId: executionTargetResourceId(targetId) });
}
