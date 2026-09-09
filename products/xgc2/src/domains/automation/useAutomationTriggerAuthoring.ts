import { useEffect,useMemo,useRef,useState } from 'react';
import type { AutomationDefinitionTriggerCapability } from './AutomationDefinitionWorkspace.types';
import type {
  AutomationDocument,
  AutomationNode,
  AutomationSpec,
} from './automationDefinitionContracts';
import {
  AUTOMATION_CALL_TRIGGER_KIND,
  isAutomationTriggerKind,
  type AutomationTriggerKind,
} from './automationTriggerContracts';

type TriggerNode = AutomationNode & { kind: AutomationTriggerKind };

export function useAutomationTriggerAuthoring({
  document,draft,dirty,canEdit,capability,persistDraft,onClearMutationMessages,onMutationError,
}: {
  document: AutomationDocument;
  draft: AutomationSpec;
  dirty: boolean;
  canEdit: boolean;
  capability: AutomationDefinitionTriggerCapability;
  persistDraft: (reason: string) => Promise<AutomationDocument>;
  onClearMutationMessages: () => void;
  onMutationError: (cause: unknown) => void;
}) {
  const {
    activations = [],activationCredentials = [],testListenerSessions = [],onActivate,onDeactivate,
    onDismissActivationCredential,onStartTestListener,onCancelTestListener,onSubmitTestEvent,onRunOnce,
  } = capability;
  const [busy,setBusy] = useState('');
  const [selectedEntrypointNodeId,setSelectedEntrypointNodeId] = useState('');
  const triggerSelectionResource = useRef(document.head.resourceId);
  const triggerNodes = useMemo(() => draft.nodes.filter(
    (node): node is TriggerNode => isAutomationTriggerKind(node.kind),
  ), [draft.nodes]);
  const effectiveEntrypointNodeId = triggerNodes.length === 1
    ? triggerNodes[0].id
    : selectedEntrypointNodeId;
  const selectedEntrypoint = triggerNodes.find((node) => node.id === effectiveEntrypointNodeId);
  const triggerKind: AutomationTriggerKind | '' = selectedEntrypoint?.kind ?? '';
  const hasCallTrigger = triggerNodes.some((node) => node.kind === AUTOMATION_CALL_TRIGGER_KIND);
  const activation = activations.find((candidate) => candidate.entrypointNodeId === effectiveEntrypointNodeId);
  const activationCredential = activationCredentials
    .find((candidate) => candidate.entrypointNodeId === effectiveEntrypointNodeId)?.credential;
  const testListenerSession = testListenerSessions
    .find((candidate) => candidate.entrypointNodeId === effectiveEntrypointNodeId);
  const activationDraftMismatch = Boolean(
    activation?.desiredState === 'active'
    && (dirty || activation.pinnedRef.commitId !== document.branch.headCommitId),
  );

  useEffect(() => {
    const resourceChanged = triggerSelectionResource.current !== document.head.resourceId;
    triggerSelectionResource.current = document.head.resourceId;
    setSelectedEntrypointNodeId((current) => {
      if (triggerNodes.length === 1) return triggerNodes[0].id;
      if (resourceChanged || !triggerNodes.some((node) => node.id === current)) return '';
      return current;
    });
  }, [document.head.resourceId,triggerNodes]);

  async function triggerDocument(reason: string) {
    return canEdit && dirty ? persistDraft(reason) : document;
  }

  async function performMutation<T>(name: string, action: () => Promise<T>) {
    setBusy(name);
    onClearMutationMessages();
    try {
      return await action();
    } catch (cause) {
      onMutationError(cause);
      throw cause;
    } finally {
      setBusy('');
    }
  }

  function requireEntrypointNodeId() {
    if (!selectedEntrypoint) throw new Error('Select an Automation trigger entrypoint.');
    return selectedEntrypoint.id;
  }

  function runOnce() {
    const entrypointNodeId = requireEntrypointNodeId();
    return performMutation('run-once', async () => (
      onRunOnce(await triggerDocument('Run Automation trigger once'), entrypointNodeId)
    ));
  }

  function activate() {
    const entrypointNodeId = requireEntrypointNodeId();
    return performMutation('activate', async () => (
      onActivate(await triggerDocument('Activate Automation trigger'), entrypointNodeId)
    ));
  }

  function deactivate() {
    const entrypointNodeId = requireEntrypointNodeId();
    return performMutation('deactivate', () => onDeactivate(document, entrypointNodeId));
  }

  function dismissActivationCredential() {
    onDismissActivationCredential(document.head.resourceId, requireEntrypointNodeId());
  }

  function startListening(ttlSeconds: number) {
    const entrypointNodeId = requireEntrypointNodeId();
    return performMutation('start-listening', async () => (
      onStartTestListener(
        await triggerDocument('Start Automation test listener'),
        entrypointNodeId,
        ttlSeconds,
      )
    ));
  }

  function cancelListening() {
    const entrypointNodeId = requireEntrypointNodeId();
    return performMutation('cancel-listening', () => (
      onCancelTestListener(document.head.resourceId, entrypointNodeId)
    ));
  }

  function submitTestEvent(payload: Record<string,unknown>) {
    const entrypointNodeId = requireEntrypointNodeId();
    return performMutation('submit-test-event', () => (
      onSubmitTestEvent(document.head.resourceId, entrypointNodeId, payload)
    ));
  }

  return {
    activate,
    activation,
    activationCredential,
    activationDraftMismatch,
    busy,
    cancelListening,
    deactivate,
    dismissActivationCredential,
    effectiveEntrypointNodeId,
    hasCallTrigger,
    runOnce,
    selectedEntrypoint,
    selectEntrypoint: setSelectedEntrypointNodeId,
    startListening,
    submitTestEvent,
    testListenerSession,
    triggerKind,
    triggerNodes,
  };
}
