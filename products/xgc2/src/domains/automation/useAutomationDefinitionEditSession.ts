import { useCallback,useEffect,useRef,useState } from 'react';
import { useConfirmationDialog } from '@xgc2/ui-react';
import { useAutomationAuthoringText } from './automationAuthoringMessages';
import type {
  AutomationDocument,
  AutomationNodeCatalogEntry,
  AutomationNodeLibraryItem,
  AutomationSpec,
} from './automationDefinitionContracts';
import { AutomationCommitConflict,messageOf } from './automationErrorModel';
import { validateAutomationLibraryNodes } from './automationNodeLibrary';
import { automationResourceIsProtected,automationResourceProtection } from './automationResourceProtection';
import { normalizeAutomationSpec } from './automationSpecModel';
import { validateAutomationSpec } from './automationValidation';
import type { AutomationNodeWebComposition } from './nodes/automationNodeWebComposition';
import { useAutomationDraftHistory } from './useAutomationDraftHistory';

export function useAutomationDefinitionEditSession({
  document,catalog,libraryItems,nodeComposition,onBack,onCommit,
}: {
  document: AutomationDocument;
  catalog: AutomationNodeCatalogEntry[];
  libraryItems: AutomationNodeLibraryItem[];
  nodeComposition?: AutomationNodeWebComposition;
  onBack: () => void;
  onCommit: (base: AutomationDocument, draft: AutomationSpec, reason: string) => Promise<AutomationDocument>;
}) {
  const t = useAutomationAuthoringText();
  const { confirm,dialog: confirmationDialog } = useConfirmationDialog();
  const { draft,dirty,commitChange: commitDraftChange,adopt: adoptDraft,undo,redo } = useAutomationDraftHistory(document.spec);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [conflict,setConflict] = useState('');
  const [adoptionRevision,setAdoptionRevision] = useState(0);
  const identity = documentIdentity(document);
  const previousIdentity = useRef(identity);
  const archived = Boolean(document.head.archived);
  const protection = automationResourceProtection(document);
  const protectedResource = automationResourceIsProtected(document);
  const readOnly = archived || protectedResource;
  const canEdit = !readOnly;

  const commitChange = useCallback((change: (current: AutomationSpec) => AutomationSpec) => {
    commitDraftChange(change);
    setError('');
  }, [commitDraftChange]);

  const clearMutationMessages = useCallback(() => {
    setError('');
    setConflict('');
  }, []);

  const adoptDocument = useCallback((next: AutomationDocument) => {
    adoptDraft(next.spec);
    clearMutationMessages();
    previousIdentity.current = documentIdentity(next);
    setAdoptionRevision((revision) => revision + 1);
  }, [adoptDraft,clearMutationMessages]);

  const handleBack = useCallback(() => {
    void (async () => {
      if (dirty && !await confirm({
        title: t('Discard unsaved draft'),
        message: t('Discard the unsaved Automation draft and return to the list?'),
        confirmLabel: t('Discard'),
      })) return;
      onBack();
    })();
  }, [confirm,dirty,onBack,t]);

  useEffect(() => {
    if (previousIdentity.current === identity || dirty) return;
    adoptDocument(document);
  }, [adoptDocument,document,dirty,identity]);

  useEffect(() => {
    if (!readOnly || !dirty) return;
    adoptDocument(document);
  }, [adoptDocument,document,dirty,readOnly]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    window.addEventListener('xgc:automation-list', handleBack);
    return () => window.removeEventListener('xgc:automation-list', handleBack);
  }, [handleBack]);

  function reportMutationError(cause: unknown) {
    if (cause instanceof AutomationCommitConflict) setConflict(t('Review the latest data and save again.'));
    else setError(messageOf(cause));
  }

  async function persistDraft(reason: string) {
    const normalized = normalizeAutomationSpec(draft);
    const validation = validateAutomationSpec(normalized, catalog, nodeComposition)
      || validateAutomationLibraryNodes(normalized, libraryItems);
    if (validation) throw new Error(validation);
    const saved = await onCommit(document, normalized, reason);
    adoptDocument(saved);
    return saved;
  }

  async function saveDefinition(blocked = false) {
    if (!canEdit || !dirty || saving || blocked) return document;
    setSaving(true);
    clearMutationMessages();
    try {
      return await persistDraft('Update Automation definition');
    } catch (cause) {
      reportMutationError(cause);
      throw cause;
    } finally {
      setSaving(false);
    }
  }

  return {
    adoptionRevision,archived,canEdit,clearMutationMessages,commitChange,conflict,dirty,draft,error,
    handleBack,persistDraft,protectedResource,protection,readOnly,redo,reportMutationError,saveDefinition,
    saving,setError,setConflict,undo,confirmationDialog,
  };
}

function documentIdentity(document: AutomationDocument) {
  return `${document.head.resourceId}:${document.branch.name}:${document.branch.headCommitId}`;
}
