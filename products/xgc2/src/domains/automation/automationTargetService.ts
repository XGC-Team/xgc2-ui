import { request,withTerminalAuth } from '../../api/http';
import { queryString,segment } from '../../shared/url';
import { executionTargetResourceId } from '../execution/executionPublic';
import type { AutomationTargetFileList,AutomationWorldPreview } from './automationTargetContracts';
import { parseAutomationTargetFileList,parseAutomationWorldPreview } from './automationTargetModel';

/** The file owner hashes the original bytes; text decoding in the browser is not a fingerprint. */
export async function readAutomationTargetFileFingerprint(targetId:string,path:string,signal?:AbortSignal):Promise<string> {
  const normalizedTarget = targetId.trim() || 'local';
  const targetCoreId = normalizedTarget.startsWith('core:') ? normalizedTarget.slice('core:'.length).trim() : undefined;
  if (!targetCoreId && executionTargetResourceId(normalizedTarget) !== 'local') {
    throw new Error('Saved calibration selection is unavailable on this execution target.');
  }
  const file = await request<{ sha256?:unknown }>(
    `/host/files/content${queryString({ path })}`,{ signal },withTerminalAuth(targetCoreId ? { targetCoreId } : undefined),
  );
  if (typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) {
    throw new Error('This saved calibration could not be verified.');
  }
  return file.sha256;
}

export async function listAutomationTargetFiles(
  targetId: string,
  path: string,
  options: { missing?: 'empty' } = {},
): Promise<AutomationTargetFileList> {
  const normalizedTarget = targetId.trim() || 'local';
  if (normalizedTarget.startsWith('core:')) {
    const targetCoreId = normalizedTarget.slice('core:'.length).trim();
    const requestPath = `/host/files${queryString({ path,missing:options.missing })}`;
    return parseAutomationTargetFileList(
      await request<unknown>(requestPath, undefined, withTerminalAuth({ targetCoreId })),
      requestPath,
    );
  }
  const resourceId = executionTargetResourceId(normalizedTarget);
  if (resourceId !== 'local') {
    const requestPath = `/managed-hosts/${segment(resourceId)}/fs/list${queryString({ path,missing:options.missing })}`;
    return parseAutomationTargetFileList(await request<unknown>(requestPath, undefined, withTerminalAuth()), requestPath);
  }
  const requestPath = `/host/files${queryString({ path,missing:options.missing })}`;
  return parseAutomationTargetFileList(await request<unknown>(requestPath, undefined, withTerminalAuth()), requestPath);
}

export async function getAutomationWorldPreview(targetId: string, path: string): Promise<AutomationWorldPreview> {
  const normalizedTarget = targetId.trim() || 'local';
  if (normalizedTarget.startsWith('core:')) {
    const targetCoreId = normalizedTarget.slice('core:'.length).trim();
    const requestPath = `/host/files/world-preview${queryString({ path })}`;
    return parseAutomationWorldPreview(
      await request<unknown>(requestPath, undefined, withTerminalAuth({ targetCoreId })),
      requestPath,
    );
  }
  const resourceId = executionTargetResourceId(normalizedTarget);
  if (resourceId !== 'local') {
    const requestPath = `/managed-hosts/${segment(resourceId)}/fs/world-preview${queryString({ path })}`;
    return parseAutomationWorldPreview(await request<unknown>(requestPath, undefined, withTerminalAuth()), requestPath);
  }
  const requestPath = `/host/files/world-preview${queryString({ path })}`;
  return parseAutomationWorldPreview(await request<unknown>(requestPath, undefined, withTerminalAuth()), requestPath);
}
