import { useState } from 'react';
import { useConfirmationDialog } from '@xgc2/ui-react';
import {
  AUTOMATION_DOMAIN,
  type AutomationDocument,
  type AutomationNamespace,
  type AutomationSpec,
} from './automationDefinitionContracts';
import { messageOf } from './automationErrorModel';
import { newAutomationSpec } from './automationSpecModel';
import { automationResourceIsProtected } from './automationResourceProtection';
import { useAutomationAuthoringText } from './automationAuthoringMessages';

type ResourceLifecycle = {
  create: (namespaceId: string | undefined, spec: AutomationSpec) => Promise<AutomationDocument>;
  duplicate: (document: AutomationDocument, namespaceId?: string, name?: string) => Promise<unknown>;
  archive: (document: AutomationDocument) => Promise<unknown>;
  move: (document: AutomationDocument, namespaceId?: string) => Promise<unknown>;
  addNamespace: (name: string, parentId?: string) => Promise<unknown>;
  renameNamespace: (namespace: AutomationNamespace, name: string) => Promise<unknown>;
  archiveNamespace: (namespace: AutomationNamespace) => Promise<unknown>;
};

export function useAutomationResourceLifecycle({
  targetId,
  lifecycle,
  onCreated,
}: {
  targetId: string;
  lifecycle: ResourceLifecycle;
  onCreated: (resourceId: string) => void;
}) {
  const t = useAutomationAuthoringText();
  const confirmation = useConfirmationDialog();
  const [createOpen,setCreateOpen] = useState(false);
  const [duplicateDocument,setDuplicateDocument] = useState<AutomationDocument | null>(null);
  const [automationDraft,setAutomationDraft] = useState<NewAutomationDraft | null>(null);
  const [mutationError,setMutationError] = useState('');

  async function runMutation(action: () => Promise<unknown>) {
    setMutationError('');
    try {
      await action();
    } catch (cause) {
      setMutationError(messageOf(cause));
    }
  }

  async function archive(document: AutomationDocument) {
    if (automationResourceIsProtected(document)) return;
    if (!await confirmation.confirm({
      title: t('Archive Automation'),
      message: t('Archive {name}?', { name: document.spec.metadata.name }),
      confirmLabel: t('Archive'),
    })) return;
    await runMutation(() => lifecycle.archive(document));
  }

  function duplicateFromList(document: AutomationDocument) {
    if (automationResourceIsProtected(document)) {
      setDuplicateDocument(document);
      return;
    }
    void runMutation(() => lifecycle.duplicate(document));
  }

  async function createAutomation(
    namespaceId: string,
    name: string,
    description: string,
    tags: string[],
  ) {
    const spec = newAutomationSpec(name, targetId);
    spec.metadata.description = description;
    spec.metadata.tags = tags;
    setMutationError('');
    setAutomationDraft({ namespaceId,document: newAutomationDraftDocument(spec, namespaceId) });
    setCreateOpen(false);
  }

  async function saveAutomationDraft(
    base: AutomationDocument,
    spec: AutomationSpec,
  ) {
    if (!automationDraft || base.head.resourceId !== automationDraft.document.head.resourceId) {
      throw new Error('The new Automation draft is no longer available.');
    }
    const created = await lifecycle.create(automationDraft.namespaceId || undefined, spec);
    setAutomationDraft(null);
    onCreated(created.head.resourceId);
    return created;
  }

  async function createFolder(name: string, parentId: string) {
    await lifecycle.addNamespace(name, parentId || undefined);
    setCreateOpen(false);
  }

  async function duplicateFromDrawer(namespaceId: string, name: string) {
    if (!duplicateDocument) return;
    await lifecycle.duplicate(duplicateDocument, namespaceId, name);
    setDuplicateDocument(null);
  }

  return {
    archive,
    archiveFolder: (namespace: AutomationNamespace) => runMutation(() => lifecycle.archiveNamespace(namespace)),
    automationDraft,
    confirmationDialog: confirmation.dialog,
    createAutomation,
    createFolder,
    createOpen,
    duplicateDocument,
    duplicateFromDrawer,
    duplicateFromList,
    move: (document: AutomationDocument, namespaceId?: string) => runMutation(() => lifecycle.move(document, namespaceId)),
    mutationError,
    renameFolder: (namespace: AutomationNamespace, name: string) => runMutation(() => lifecycle.renameNamespace(namespace, name)),
    saveAutomationDraft,
    discardAutomationDraft: () => setAutomationDraft(null),
    setCreateOpen,
    setDuplicateDocument,
  };
}

type NewAutomationDraft = {
  namespaceId: string;
  document: AutomationDocument;
};

function newAutomationDraftDocument(spec: AutomationSpec, namespaceId: string): AutomationDocument {
  const resourceId = 'new';
  const createdAt = new Date().toISOString();
  return {
    head: {
      domain: AUTOMATION_DOMAIN,resourceId,
      ...(namespaceId ? { namespaceId } : {}),
      name: spec.metadata.name,description: spec.metadata.description,tags: [...spec.metadata.tags],
      mainCommitId: '',currentVersion: 0,digest: '',revision: 0,createdAt,updatedAt: createdAt,
    },
    branch: {
      domain: AUTOMATION_DOMAIN,resourceId,name: 'main',headCommitId: '',headVersion: 0,revision: 0,
      createdAt,updatedAt: createdAt,
    },
    spec,
  };
}
