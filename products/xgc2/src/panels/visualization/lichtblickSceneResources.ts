import { listAutomationDocuments } from '../../domains/automation/automationPublic';
import type { AutomationDocument } from '../../domains/automation/automationPublic';
import { validSceneNamespace } from './lichtblickSceneBridge';

export const LICHTBLICK_SCENE_RUNTIME_DEFINITION = 'xgc2-scene-runtime-ros1';

export type LichtblickSceneResource = {
  resourceId: string;
  name: string;
  namespace: string;
};

export function isOrdinarySceneWorkflow(document: AutomationDocument): boolean {
  if (document.head.archived || document.head.system || document.head.systemKey || document.head.originResourceId) {
    return false;
  }
  return document.spec.nodes.some((node) => (
    node.kind === 'process.run-definition'
    && node.parameters.definitionId === LICHTBLICK_SCENE_RUNTIME_DEFINITION
  ));
}

export function sceneNamespaceFromWorkflow(document: AutomationDocument): string {
  for (const node of document.spec.nodes) {
    if (node.kind !== 'process.run-definition' || node.parameters.definitionId !== LICHTBLICK_SCENE_RUNTIME_DEFINITION) {
      continue;
    }
    const nested = node.parameters.parameters;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const namespace = (nested as Record<string,unknown>).sceneNamespace;
      if (validSceneNamespace(namespace)) return namespace;
    }
  }
  for (const action of document.spec.actions) {
    const field = action.inputSchema.fields.find((item) => item.name === 'sceneNamespace');
    if (validSceneNamespace(field?.string?.default)) return field.string.default;
  }
  return '';
}

export function ordinarySceneResources(documents: AutomationDocument[]): LichtblickSceneResource[] {
  return documents.flatMap((document) => {
    if (!isOrdinarySceneWorkflow(document)) return [];
    const namespace = sceneNamespaceFromWorkflow(document);
    if (!namespace) return [];
    return [{
      resourceId: document.head.resourceId,
      name: document.head.name || document.spec.metadata.name || document.head.resourceId,
      namespace,
    }];
  });
}

export async function loadLichtblickSceneResources(signal?: AbortSignal): Promise<LichtblickSceneResource[]> {
  return ordinarySceneResources(await listAutomationDocuments({ signal }));
}
