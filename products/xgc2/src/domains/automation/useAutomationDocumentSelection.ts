import { useCallback,useEffect,useRef,useState,type Dispatch,type SetStateAction } from 'react';
import type { AutomationDocument } from './automationDefinitionContracts';
import { getAutomationDocument,isAutomationDocumentNotFound } from './automationDocumentService';
import { messageOf } from './automationErrorModel';
import { useAutomationTargetScope,type AutomationTargetScope } from './useAutomationTargetScope';

type CurrentRef<T> = { current: T };
type SelectionSnapshot = {
  scope: AutomationTargetScope;
  document: AutomationDocument | null;
  resourceId: string;
  error: string;
  notFound: boolean;
  loading: boolean;
};

export function useAutomationDocumentSelection({
  targetId,
  selectedResourceIdRef,
  onSelectionRequested,
  loadSupportingFacts,
  onSelectionClosed,
}: {
  targetId: string;
  selectedResourceIdRef: CurrentRef<string>;
  onSelectionRequested: (resourceId: string) => void;
  loadSupportingFacts: (document: AutomationDocument, signal: AbortSignal) => Promise<void>;
  onSelectionClosed: (resourceId: string) => void;
}) {
  const targetScopeRef = useAutomationTargetScope(targetId);
  const targetScope = targetScopeRef.current;
  const [snapshot,setSnapshot] = useState<SelectionSnapshot>(() => emptySelection(targetScope));
  const selectionRef = useRef<SelectionSnapshot>(snapshot);
  const requestGenerationRef = useRef(0);
  const openingRef = useRef<{
    scope: AutomationTargetScope;
    resourceId: string;
    generation: number;
    promise: Promise<AutomationDocument>;
  } | null>(null);
  const supportingFactsControllerRef = useRef<{
    scope: AutomationTargetScope;
    controller: AbortController;
  } | null>(null);

  if (selectionRef.current.scope !== targetScope) {
    selectionRef.current = emptySelection(targetScope);
    selectedResourceIdRef.current = '';
  }

  const replaceSelection = useCallback((
    requestScope: AutomationTargetScope,
    update: (current: SelectionSnapshot) => SelectionSnapshot,
  ) => {
    if (targetScopeRef.current !== requestScope) return false;
    const current = selectionRef.current.scope === requestScope
      ? selectionRef.current
      : emptySelection(requestScope);
    const next = update(current);
    selectionRef.current = next;
    selectedResourceIdRef.current = next.document?.head.resourceId ?? '';
    setSnapshot(next);
    return true;
  }, [selectedResourceIdRef,targetScopeRef]);

  const setSelected = useCallback<Dispatch<SetStateAction<AutomationDocument | null>>>((update) => {
    replaceSelection(targetScope, (current) => ({
      ...current,
      document: typeof update === 'function' ? update(current.document) : update,
    }));
  }, [replaceSelection,targetScope]);

  useEffect(() => {
    requestGenerationRef.current += 1;
    const supporting = supportingFactsControllerRef.current;
    if (supporting && supporting.scope !== targetScope) supporting.controller.abort();
    if (supportingFactsControllerRef.current === supporting) supportingFactsControllerRef.current = null;
    replaceSelection(targetScope, () => emptySelection(targetScope));
  }, [replaceSelection,targetScope]);

  useEffect(() => () => {
    requestGenerationRef.current += 1;
    supportingFactsControllerRef.current?.controller.abort();
  }, []);

  const readSelection = useCallback(async (resourceId: string) => {
    const requestScope = targetScope;
    if (targetScopeRef.current !== requestScope) throw new Error('Automation execution target changed.');
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    supportingFactsControllerRef.current?.controller.abort();
    supportingFactsControllerRef.current = null;
    replaceSelection(requestScope, (current) => ({ ...current,resourceId,error: '',notFound: false,loading: true }));
    onSelectionRequested(resourceId);
    try {
      const document = await getAutomationDocument(resourceId);
      if (openingRef.current?.generation === generation && openingRef.current.scope === requestScope) openingRef.current = null;
      if (targetScopeRef.current !== requestScope || requestGenerationRef.current !== generation) return document;
      replaceSelection(requestScope, (current) => ({ ...current,document,loading: false }));

      const controller = new AbortController();
      const supporting = { scope: requestScope,controller };
      supportingFactsControllerRef.current = supporting;
      try {
        await loadSupportingFacts(document, controller.signal);
      } catch {
        // History and trigger owners expose their own failures. The document is already authoritative.
      } finally {
        if (supportingFactsControllerRef.current === supporting) supportingFactsControllerRef.current = null;
      }
      return document;
    } catch (cause) {
      if (openingRef.current?.generation === generation && openingRef.current.scope === requestScope) openingRef.current = null;
      if (targetScopeRef.current === requestScope && requestGenerationRef.current === generation) {
        const notFound = isAutomationDocumentNotFound(cause);
        replaceSelection(requestScope, (current) => ({
          ...current,error: messageOf(cause),notFound,
          document: notFound && current.document?.head.resourceId === resourceId ? null : current.document,
        }));
      }
      throw cause;
    } finally {
      if (targetScopeRef.current === requestScope && requestGenerationRef.current === generation) {
        replaceSelection(requestScope, (current) => ({ ...current,loading: false }));
      }
    }
  }, [loadSupportingFacts,onSelectionRequested,replaceSelection,targetScope,targetScopeRef]);

  const open = useCallback((resourceId: string) => {
    const active = openingRef.current;
    if (active?.scope === targetScope && active.resourceId === resourceId
      && active.generation === requestGenerationRef.current) return active.promise;
    const promise = readSelection(resourceId);
    const opening = { scope: targetScope,resourceId,generation: requestGenerationRef.current,promise };
    openingRef.current = opening;
    const settled = () => { if (openingRef.current === opening) openingRef.current = null; };
    void promise.then(settled,settled);
    // Only an in-flight read is shared. A Retry after settlement always reads again.
    return promise;
  }, [readSelection,targetScope]);

  const close = useCallback(() => {
    const requestScope = targetScope;
    if (targetScopeRef.current !== requestScope) return;
    const resourceId = selectionRef.current.scope === requestScope
      ? selectionRef.current.document?.head.resourceId ?? ''
      : '';
    requestGenerationRef.current += 1;
    supportingFactsControllerRef.current?.controller.abort();
    supportingFactsControllerRef.current = null;
    replaceSelection(requestScope, () => emptySelection(requestScope));
    onSelectionClosed(resourceId);
  }, [onSelectionClosed,replaceSelection,targetScope,targetScopeRef]);

  const active = snapshot.scope === targetScope ? snapshot : emptySelection(targetScope);
  return {
    close,
    open,
    selected: active.document,
    selectionResourceId: active.resourceId,
    selectionError: active.error,
    selectionNotFound: active.notFound,
    selectionLoading: active.loading,
    setSelected,
  };
}

function emptySelection(scope: AutomationTargetScope): SelectionSnapshot {
  return { scope,document: null,resourceId: '',error: '',notFound: false,loading: false };
}
