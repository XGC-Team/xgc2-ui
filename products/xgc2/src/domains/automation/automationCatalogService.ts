import { request } from '../../api/http';
import { executionTargetPath } from '../execution/executionPublic';
import { parseAutomationNodeCatalog } from './automationCatalogModel';
import type { AutomationNodeCatalogEntry } from './automationDefinitionContracts';
import type { AutomationRequestOptions } from './automationRequest';

export function listAutomationNodeCatalog(targetId: string, options: AutomationRequestOptions = {}): Promise<AutomationNodeCatalogEntry[]> {
  const path = `${executionTargetPath(targetId)}/orchestration-node-catalog`;
  return request<unknown>(path, { signal: options.signal })
    .then((value) => parseAutomationNodeCatalog(value, path));
}
