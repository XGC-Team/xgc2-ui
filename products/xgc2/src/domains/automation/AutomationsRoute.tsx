import { useEffect,useRef,useState } from 'react';
import { useNavigation } from '../../app/navigationContext';
import { useTargetCore } from '../../app/useTargetCore';
import { selectedExecutionTargetId } from '../execution/executionPublic';
import {
  automationDocumentHash,
  automationDocumentListHash,
  canonicalAutomationHash,
  clearStoredAutomationResourceId,
  isAutomationLocationHash,
  isCurrentTargetAutomationListHash,
  resourceIdFromAutomationHash,
  readStoredAutomationResourceId,
  storeAutomationResourceId,
} from './automationNavigation';
import { AutomationsPage } from './AutomationsPage';
import type { AutomationNodeWebComposition } from './nodes/automationNodeWebComposition';

export function AutomationsRoute({ nodeComposition }: {
  nodeComposition?: AutomationNodeWebComposition;
}) {
  const nav = useNavigation();
  const { selectedTargetCore } = useTargetCore();
  const targetId = selectedExecutionTargetId({ managedHostId: nav.managedHostId,selectedTargetCore });
  const [resourceId, setResourceId] = useState(() => {
    const hashResourceId = resourceIdFromAutomationHash(window.location.hash,targetId);
    if (hashResourceId) return hashResourceId;
    if (isCurrentTargetAutomationListHash(window.location.hash,targetId)) {
      clearStoredAutomationResourceId(targetId);
      return '';
    }
    return readStoredAutomationResourceId(targetId);
  });
  const syncedTargetId = useRef<string | undefined>(undefined);
  const pageRef = useRef(nav.page);
  const resourceIdRef = useRef(resourceId);
  pageRef.current = nav.page;
  resourceIdRef.current = resourceId;

  useEffect(() => {
    const sync = () => {
      const hashResourceId = resourceIdFromAutomationHash(window.location.hash,targetId);
      const restoreLast = syncedTargetId.current !== targetId;
      const parked = pageRef.current !== 'automations';
      const onListHash = isCurrentTargetAutomationListHash(window.location.hash,targetId);
      if (onListHash) {
        if (parked) return;
        if (resourceIdRef.current) {
          resourceIdRef.current = '';
          setResourceId('');
        }
        clearStoredAutomationResourceId(targetId);
        syncedTargetId.current = targetId;
        const canonicalHash = canonicalAutomationHash(window.location.hash, targetId);
        if (canonicalHash !== window.location.hash) replaceHash(canonicalHash);
        return;
      }
      const foreignOrEmpty = !window.location.hash || !isAutomationLocationHash(window.location.hash);
      if (!hashResourceId && !restoreLast && foreignOrEmpty) {
        if (parked) return;
        if (resourceIdRef.current) {
          const hash = automationDocumentHash(targetId, resourceIdRef.current);
          if (window.location.hash !== hash) replaceHash(hash);
          return;
        }
        setResourceId('');
        return;
      }
      const storedResourceId = restoreLast && !hashResourceId ? readStoredAutomationResourceId(targetId) : '';
      if (!hashResourceId && !storedResourceId && parked && !restoreLast) return;
      const nextResourceId = hashResourceId || storedResourceId;
      setResourceId(nextResourceId);
      if (hashResourceId) storeAutomationResourceId(targetId,hashResourceId);
      if (storedResourceId) replaceHash(automationDocumentHash(targetId,storedResourceId));
      const canonicalHash = canonicalAutomationHash(window.location.hash, targetId);
      if (!storedResourceId && canonicalHash !== window.location.hash) replaceHash(canonicalHash);
      syncedTargetId.current = targetId;
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [targetId]);

  useEffect(() => {
    if (nav.page !== 'automations' || !resourceIdRef.current) return;
    const hash = automationDocumentHash(targetId, resourceIdRef.current);
    if (window.location.hash === hash) return;
    replaceHash(hash);
  }, [nav.page,targetId]);

  function openDocument(id: string) {
    storeAutomationResourceId(targetId,id);
    resourceIdRef.current = id;
    setResourceId(id);
    window.location.hash = automationDocumentHash(targetId, id);
  }

  function closeDocument() {
    resourceIdRef.current = '';
    setResourceId('');
    clearStoredAutomationResourceId(targetId);
    window.location.hash = automationDocumentListHash(targetId);
  }

  function replaceInvalidDocument() {
    resourceIdRef.current = '';
    clearStoredAutomationResourceId(targetId);
    setResourceId('');
    replaceHash(automationDocumentListHash(targetId));
  }

  return (
    <AutomationsPage
      targetId={targetId}
      resourceId={resourceId}
      nodeComposition={nodeComposition}
      onOpenDocument={openDocument}
      onCloseDocument={closeDocument}
      onInvalidDocument={replaceInvalidDocument}
    />
  );
}

function replaceHash(hash: string) {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
}
