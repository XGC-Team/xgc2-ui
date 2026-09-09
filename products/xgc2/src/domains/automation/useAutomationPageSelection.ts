import { useEffect } from 'react';
import type { AutomationDocument } from './automationDefinitionContracts';
import { automationDocumentVisibleForExecutionTarget } from './automationTargetCatalogModel';

export function useAutomationPageSelection({
  targetId,
  resourceId,
  workspaceSelected,
  selectionNotFound,
  openDocument,
  closeDocument,
  onInvalidDocument,
}: {
  targetId: string;
  resourceId?: string;
  workspaceSelected: AutomationDocument | null;
  selectionNotFound: boolean;
  openDocument: (resourceId: string) => Promise<unknown>;
  closeDocument: () => void;
  onInvalidDocument?: () => void;
}) {
  const workspaceHasSelection = Boolean(workspaceSelected);
  const workspaceSelectedResourceId = workspaceSelected?.head.resourceId;
  const matching = resourceId
    ? workspaceSelectedResourceId === resourceId ? workspaceSelected : null
    : workspaceSelected;
  const selected = matching && automationDocumentVisibleForExecutionTarget(matching,targetId) ? matching : null;

  useEffect(() => {
    if (!resourceId) {
      if (workspaceHasSelection) closeDocument();
      return;
    }
    if (selectionNotFound || workspaceSelectedResourceId === resourceId) return;
    void openDocument(resourceId).catch(() => undefined);
  }, [closeDocument,openDocument,resourceId,selectionNotFound,workspaceHasSelection,workspaceSelectedResourceId]);

  useEffect(() => {
    if (!resourceId || selected) return;
    // A catalog is a projection, not authority for an exact document's absence.
    // Only its own 404 or an explicit target-policy mismatch invalidates a link.
    if (selectionNotFound || matching) onInvalidDocument?.();
  }, [matching,onInvalidDocument,resourceId,selected,selectionNotFound]);

  useEffect(() => {
    const name = selected?.spec.metadata.name;
    window.dispatchEvent(new CustomEvent('xgc:automation-breadcrumb', {
      detail: name ? { view: 'detail',name } : { view: 'list' },
    }));
  }, [selected?.spec.metadata.name]);

  return selected;
}
