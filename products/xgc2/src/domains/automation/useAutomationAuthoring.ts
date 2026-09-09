import { useCallback,type Dispatch,type SetStateAction } from 'react';
import { CONFIGURATION_MAIN_BRANCH } from '../../shared/configResource';
import { createMutationIdentity } from '../../shared/utils/intent';
import type {
  AutomationDocument,
  AutomationNamespace,
  AutomationNodeCatalogEntry,
  AutomationSpec,
} from './automationDefinitionContracts';
import { automationResourceIsProtected } from './automationResourceProtection';
import {
  archiveAutomationDocument,
  archiveAutomationNamespace,
  commitAutomationDocument,
  createAutomationDocument,
  createAutomationNamespace,
  duplicateAutomationDocument,
  getAutomationDocument,
  isAutomationCASConflict,
  restoreAutomationDocument,
  updateAutomationNamespace,
} from './automationDocumentService';
import { normalizeAutomationSpec } from './automationSpecModel';
import {
  mergeMainDocument,
  mergeResourceHead,
  nextAutomationDuplicateName,
} from './automationAuthoringModel';
import { AutomationCommitConflict,messageOf } from './automationErrorModel';
import { validateAutomationSpec } from './automationValidation';
import type { AutomationNodeWebComposition } from './nodes/automationNodeWebComposition';

type UseAutomationAuthoringOptions = {
  catalog: AutomationNodeCatalogEntry[];
  documents: AutomationDocument[];
  setDocuments: Dispatch<SetStateAction<AutomationDocument[]>>;
  setNamespaces: Dispatch<SetStateAction<AutomationNamespace[]>>;
  setSelected: Dispatch<SetStateAction<AutomationDocument | null>>;
  clearTriggerResource: (resourceId: string) => void;
  nodeComposition?: AutomationNodeWebComposition;
};

export function useAutomationAuthoring({
  catalog,
  documents,
  setDocuments,
  setNamespaces,
  setSelected,
  clearTriggerResource,
  nodeComposition,
}: UseAutomationAuthoringOptions) {
  const create = useCallback(async (namespaceId: string | undefined, spec: AutomationSpec) => {
    const normalized = normalizeAutomationSpec(spec);
    const validation = validateAutomationSpec(normalized, catalog, nodeComposition);
    if (validation) throw new Error(validation);
    const document = await createAutomationDocument({
      namespaceId: namespaceId || undefined,
      spec: normalized,
      reason: 'Create Automation definition',
      ...createMutationIdentity('automation.create'),
    });
    setDocuments((items) => mergeMainDocument(items, document));
    setSelected(document);
    return document;
  }, [catalog,nodeComposition,setDocuments,setSelected]);

  const duplicate = useCallback(async (
    document: AutomationDocument,
    targetNamespaceId?: string,
    name?: string,
  ) => {
    const namespaceId = targetNamespaceId ?? (automationResourceIsProtected(document)
      ? ''
      : document.head.namespaceId ?? '');
    const duplicateName = name?.trim()
      || nextAutomationDuplicateName(documents, document.spec.metadata.name, namespaceId);
    const cloned = await duplicateAutomationDocument(document.head.resourceId, {
      sourceCommitId: document.branch.headCommitId,
      targetNamespaceId: namespaceId,
      name: duplicateName,
      expectedRevision: document.head.revision,
      reason: 'Duplicate Automation definition',
      ...createMutationIdentity('automation.duplicate'),
    });
    setDocuments((items) => mergeMainDocument(items, cloned));
    return cloned;
  }, [documents,setDocuments]);

  const commit = useCallback(async (
    base: AutomationDocument,
    draft: AutomationSpec,
    reason: string,
    namespaceId = base.head.namespaceId ?? '',
    selectResult = true,
  ) => {
    const normalized = normalizeAutomationSpec(draft);
    const validation = validateAutomationSpec(normalized, catalog, nodeComposition);
    if (validation) throw new Error(validation);
    try {
      const saved = await commitAutomationDocument(base.head.resourceId, base.branch.name, {
        spec: normalized,
        baseCommitId: base.branch.headCommitId,
        expectedBranchRevision: base.branch.revision,
        expectedResourceRevision: base.head.revision,
        namespaceId,
        reason: reason.trim() || 'Update Automation definition',
        ...createMutationIdentity('automation.commit'),
      });
      if (selectResult) setSelected(saved);
      setDocuments((items) => saved.branch.name === CONFIGURATION_MAIN_BRANCH
        ? mergeMainDocument(items, saved)
        : mergeResourceHead(items, saved));
      return saved;
    } catch (cause) {
      if (!isAutomationCASConflict(cause)) throw cause;
      let latest: AutomationDocument | undefined;
      try {
        latest = await getAutomationDocument(base.head.resourceId);
        if (selectResult) setSelected(latest);
        setDocuments((items) => latest?.branch.name === CONFIGURATION_MAIN_BRANCH
          ? mergeMainDocument(items, latest)
          : latest ? mergeResourceHead(items, latest) : items);
      } catch {
        // The original 409 remains authoritative when the reload also fails.
      }
      throw new AutomationCommitConflict(messageOf(cause), latest);
    }
  }, [catalog,nodeComposition,setDocuments,setSelected]);

  const move = useCallback(async (base: AutomationDocument, namespaceId?: string) => (
    commit(base, base.spec, 'Move Automation definition', namespaceId ?? '', false)
  ), [commit]);

  const archive = useCallback(async (document: AutomationDocument) => {
    if (automationResourceIsProtected(document)) return document;
    const archived = await archiveAutomationDocument(document.head.resourceId, {
      expectedRevision: document.head.revision,
      reason: 'Archive Automation definition',
      ...createMutationIdentity('automation.archive'),
    });
    setDocuments((items) => items.filter((item) => item.head.resourceId !== archived.head.resourceId));
    setSelected((current) => current?.head.resourceId === archived.head.resourceId ? null : current);
    clearTriggerResource(archived.head.resourceId);
    return archived;
  }, [clearTriggerResource,setDocuments,setSelected]);

  const restore = useCallback(async (document: AutomationDocument) => {
    const restored = await restoreAutomationDocument(document.head.resourceId, {
      expectedRevision: document.head.revision,
      reason: 'Restore Automation definition',
      ...createMutationIdentity('automation.restore'),
    });
    setDocuments((items) => mergeMainDocument(items, restored));
    setSelected(restored);
    return restored;
  }, [setDocuments,setSelected]);

  const addNamespace = useCallback(async (name: string, parentNamespaceId?: string) => {
    const created = await createAutomationNamespace({
      name: name.trim(),
      parentNamespaceId: parentNamespaceId || undefined,
      reason: 'Create Automation folder',
      ...createMutationIdentity('automation.namespace.create'),
    });
    setNamespaces((items) => [...items.filter((item) => item.namespaceId !== created.namespaceId),created]);
    return created;
  }, [setNamespaces]);

  const renameNamespace = useCallback(async (namespace: AutomationNamespace, name: string) => {
    const saved = await updateAutomationNamespace(namespace.namespaceId, {
      name: name.trim(),
      expectedRevision: namespace.revision,
      ...createMutationIdentity('automation.namespace.rename'),
    });
    setNamespaces((items) => [...items.filter((item) => item.namespaceId !== saved.namespaceId),saved]);
    return saved;
  }, [setNamespaces]);

  const archiveNamespace = useCallback(async (namespace: AutomationNamespace) => {
    await archiveAutomationNamespace(namespace.namespaceId, {
      expectedRevision: namespace.revision,
      ...createMutationIdentity('automation.namespace.archive'),
    });
    setNamespaces((items) => items.filter((item) => item.namespaceId !== namespace.namespaceId));
  }, [setNamespaces]);

  return { create,duplicate,commit,move,archive,restore,addNamespace,renameNamespace,archiveNamespace };
}
