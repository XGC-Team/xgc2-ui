import { request,withTerminalAuth } from '../../api/http';
import { queryString,segment } from '../../shared/url';
import { executionTargetResourceId } from '../execution/executionPublic';
import type { AutomationTargetFileList,AutomationWorldPreview } from './automationTargetContracts';
import { parseAutomationTargetFileList,parseAutomationWorldPreview } from './automationTargetModel';

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
