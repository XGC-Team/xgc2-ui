import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import type { AutomationDocument,AutomationNamespace } from './automationDefinitionContracts';
import { listAutomationDocuments,listAutomationNamespaces } from './automationDocumentService';
import { messageOf } from './automationErrorModel';
import { createAutomationDefinitionRefreshQueue } from './automationDefinitionRefreshQueue';

export function useAutomationDefinitionsCatalog() {
  const [documents,setDocuments] = useState<AutomationDocument[]>([]);
  const [namespaces,setNamespaces] = useState<AutomationNamespace[]>([]);
  const [documentsLoading,setDocumentsLoading] = useState(true);
  const [namespacesLoading,setNamespacesLoading] = useState(true);
  const [documentsLoaded,setDocumentsLoaded] = useState(false);
  const [namespacesLoaded,setNamespacesLoaded] = useState(false);
  const [documentsError,setDocumentsError] = useState('');
  const [namespacesError,setNamespacesError] = useState('');
  const documentsGenerationRef = useRef(0);
  const namespacesGenerationRef = useRef(0);

  const readDocuments = useCallback(async (signal?: AbortSignal) => {
    const generation = documentsGenerationRef.current + 1;
    documentsGenerationRef.current = generation;
    setDocumentsLoading(true);
    setDocumentsLoaded(false);
    setDocumentsError('');
    try {
      const next = await listAutomationDocuments({ signal });
      if (signal?.aborted || documentsGenerationRef.current !== generation) return;
      setDocuments(next);
      setDocumentsLoaded(true);
      return next;
    } catch (cause) {
      if (!signal?.aborted && documentsGenerationRef.current === generation) {
        setDocumentsError(messageOf(cause));
      }
    } finally {
      if (documentsGenerationRef.current === generation) setDocumentsLoading(false);
    }
  }, []);
  const refreshDocuments = useMemo(
    () => createAutomationDefinitionRefreshQueue(readDocuments),[readDocuments],
  );

  const refreshNamespaces = useCallback(async (signal?: AbortSignal) => {
    const generation = namespacesGenerationRef.current + 1;
    namespacesGenerationRef.current = generation;
    setNamespacesLoading(true);
    setNamespacesLoaded(false);
    setNamespacesError('');
    try {
      const next = await listAutomationNamespaces({ signal });
      if (signal?.aborted || namespacesGenerationRef.current !== generation) return;
      setNamespaces(next);
      setNamespacesLoaded(true);
      return next;
    } catch (cause) {
      if (!signal?.aborted && namespacesGenerationRef.current === generation) {
        setNamespacesError(messageOf(cause));
      }
    } finally {
      if (namespacesGenerationRef.current === generation) setNamespacesLoading(false);
    }
  }, []);

  const refreshDefinitions = useCallback(async (signal?: AbortSignal) => {
    const [documents] = await Promise.all([refreshDocuments(signal),refreshNamespaces(signal)]);
    return documents;
  }, [refreshDocuments,refreshNamespaces]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshDefinitions(controller.signal);
    return () => controller.abort();
  }, [refreshDefinitions]);

  return {
    documents,
    documentsError,
    documentsLoaded,
    documentsLoading,
    namespaces,
    namespacesError,
    namespacesLoaded,
    namespacesLoading,
    refreshDefinitions,
    setDocuments,
    setNamespaces,
  };
}
