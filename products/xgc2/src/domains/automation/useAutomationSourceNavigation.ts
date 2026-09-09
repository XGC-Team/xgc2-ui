import { useCallback,useEffect,useRef,useState } from 'react';
import { executionTargetResourceId } from '../execution/executionPublic';
import { getAutomationDocument } from './automationDocumentService';
import { automationDocumentVisibleForExecutionTarget } from './automationTargetCatalogModel';
import { registerAutomationSourceNavigation,type AutomationSourceLocation } from './automationNavigation';
import type { AutomationDocument } from './automationDefinitionContracts';
import type { AutomationRunDetail } from './automationExecutionContracts';

export function useAutomationSourceNavigation(options: {
  targetId: string;
  openDocument: (resourceId: string) => Promise<AutomationDocument>;
  onOpenDocument?: (resourceId: string) => void;
  loadRunDetail: (runId: string) => Promise<AutomationRunDetail>;
}) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [sourceLocation,setSourceLocation] = useState<AutomationSourceLocation>();
  const clearSourceLocation = useCallback(() => setSourceLocation(undefined), []);

  useEffect(() => registerAutomationSourceNavigation(async ({ destination,signal,activate }) => {
    const current = () => !signal.aborted && optionsRef.current.targetId === destination.targetId;
    if (!current() || !optionsRef.current.onOpenDocument) return false;
    let resourceId = destination.resourceId;
    let nodeId = destination.nodeId;
    if (destination.runId) {
      const detail = await optionsRef.current.loadRunDetail(destination.runId);
      if (!current() || detail.error || detail.run?.id !== destination.runId
        || detail.run.targetId !== executionTargetResourceId(destination.targetId)) return false;
      if (resourceId && resourceId !== detail.run.automationResourceId) return false;
      resourceId = detail.run.automationResourceId;
      if (destination.invocationId) {
        const invocation = detail.invocations.find((item) => item.id === destination.invocationId);
        if (!invocation || (nodeId && invocation.nodeId !== nodeId)) return false;
        nodeId = invocation.nodeId;
      }
      if (nodeId && !detail.snapshot?.automationSpec.nodes.some((node) => node.id === nodeId)) return false;
    } else if (destination.invocationId) return false;
    if (!resourceId || !current()) return false;
    const document = await getAutomationDocument(resourceId);
    if (!current() || document.head.resourceId !== resourceId
      || !automationDocumentVisibleForExecutionTarget(document, destination.targetId)) return false;
    if (!destination.runId && destination.nodeId && !document.spec.nodes.some((node) => node.id === destination.nodeId)) return false;
    // The route callback updates its refs synchronously, before activation can
    // restore a parked workflow's old hash.
    optionsRef.current.onOpenDocument?.(resourceId);
    const opened = await optionsRef.current.openDocument(resourceId);
    if (!current() || opened.head.resourceId !== resourceId) return false;
    setSourceLocation({ ...destination,resourceId,...(nodeId ? { nodeId } : {}) });
    activate();
    return true;
  }), [options.targetId]);

  return {
    sourceLocation: sourceLocation?.targetId === options.targetId ? sourceLocation : undefined,
    clearSourceLocation,
  };
}
