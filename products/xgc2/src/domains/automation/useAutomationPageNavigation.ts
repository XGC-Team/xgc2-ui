import { useState } from 'react';
import type { AutomationDocument } from './automationDefinitionContracts';
import { messageOf } from './automationErrorModel';
import type { AutomationExecutionRunSummary } from './automationHistoryTypes';

export function useAutomationPageNavigation({
  openDocument,
  closeDocument,
  onOpenDocument,
  onCloseDocument,
  onClearSourceLocation,
}: {
  openDocument: (resourceId: string) => Promise<unknown>;
  closeDocument: () => void;
  onOpenDocument?: (resourceId: string) => void;
  onCloseDocument?: () => void;
  onClearSourceLocation?: () => void;
}) {
  const [preferredRunId,setPreferredRunId] = useState('');
  const [navigationError,setNavigationError] = useState('');

  function open(document: AutomationDocument) {
    onClearSourceLocation?.();
    setPreferredRunId('');
    setNavigationError('');
    onOpenDocument?.(document.head.resourceId);
    void openDocument(document.head.resourceId).catch((cause) => setNavigationError(messageOf(cause)));
  }

  function close() {
    onClearSourceLocation?.();
    setPreferredRunId('');
    setNavigationError('');
    closeDocument();
    onCloseDocument?.();
  }

  function openRelatedRun(run: AutomationExecutionRunSummary) {
    onClearSourceLocation?.();
    const relatedResourceId = run.automationResourceId;
    if (!relatedResourceId) return;
    setPreferredRunId(run.id);
    setNavigationError('');
    onOpenDocument?.(relatedResourceId);
    void openDocument(relatedResourceId).catch((cause) => setNavigationError(messageOf(cause)));
  }

  return { close,navigationError,open,openRelatedRun,preferredRunId };
}
