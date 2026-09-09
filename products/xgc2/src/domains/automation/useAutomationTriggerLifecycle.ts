import { useCallback,useEffect,useRef,useState } from 'react';
import { recordWithoutKey } from '../../shared/recordWithoutKey';
import type { AutomationDocument } from './automationDefinitionContracts';
import { messageOf } from './automationErrorModel';
import {
  isAutomationTriggerKind,
  type AutomationActivation,
  type AutomationActivationCredentialSession,
  type AutomationActivationResponse,
  type AutomationTestListenerSession,
  type AutomationTriggerEventReceipt,
} from './automationTriggerContracts';
import {
  cancelAutomationTestListener,
  createAutomationTestListener,
  enqueueAutomationRunOnce,
  getAutomationActivation,
  getAutomationTestListener,
  listAutomationActivations,
  putAutomationActivation,
  submitAutomationTestEvent,
} from './automationTriggerService';
import {
  automationEntrypointFact,
  automationTriggerStateKey,
  indexAutomationEntrypointFacts,
  withoutAutomationResourceFacts,
  type AutomationEntrypointFacts,
} from './automationTriggerState';
import { useAutomationTargetScope,type AutomationTargetScope } from './useAutomationTargetScope';

type TriggerLifecycleSnapshot = {
  scope: AutomationTargetScope;
  activations: AutomationEntrypointFacts<AutomationActivation>;
  activationCredentials: AutomationEntrypointFacts<AutomationActivationCredentialSession>;
  testListeners: AutomationEntrypointFacts<AutomationTestListenerSession>;
  error: string;
  loading: boolean;
};

export function useAutomationTriggerLifecycle(targetId: string) {
  const targetScopeRef = useAutomationTargetScope(targetId);
  const targetScope = targetScopeRef.current;
  const [snapshot,setSnapshot] = useState<TriggerLifecycleSnapshot>(() => emptyTriggerLifecycle(targetScope));
  const snapshotRef = useRef(snapshot);
  const activationQueryGenerationRef = useRef(0);

  const replaceSnapshot = useCallback((
    requestScope: AutomationTargetScope,
    update: (current: TriggerLifecycleSnapshot) => TriggerLifecycleSnapshot,
  ) => {
    if (targetScopeRef.current !== requestScope) return false;
    const current = snapshotRef.current.scope === requestScope
      ? snapshotRef.current
      : emptyTriggerLifecycle(requestScope);
    const next = update(current);
    snapshotRef.current = next;
    setSnapshot(next);
    return true;
  }, [targetScopeRef]);

  const refreshActivations = useCallback(async (signal?: AbortSignal) => {
    const requestScope = targetScope;
    if (targetScopeRef.current !== requestScope) return;
    const generation = activationQueryGenerationRef.current + 1;
    activationQueryGenerationRef.current = generation;
    replaceSnapshot(requestScope, (current) => ({ ...current,error: '',loading: true }));
    try {
      const facts = await listAutomationActivations(requestScope.targetId, { signal });
      if (signal?.aborted
        || targetScopeRef.current !== requestScope
        || activationQueryGenerationRef.current !== generation) return;
      replaceSnapshot(requestScope, (current) => ({
        ...current,activations: indexAutomationEntrypointFacts(facts),error: '',loading: false,
      }));
    } catch (cause) {
      if (!signal?.aborted
        && targetScopeRef.current === requestScope
        && activationQueryGenerationRef.current === generation) {
        replaceSnapshot(requestScope, (current) => ({ ...current,error: messageOf(cause),loading: false }));
      }
    } finally {
      if (targetScopeRef.current === requestScope && activationQueryGenerationRef.current === generation) {
        replaceSnapshot(requestScope, (current) => current.loading ? { ...current,loading: false } : current);
      }
    }
  }, [replaceSnapshot,targetScope,targetScopeRef]);

  useEffect(() => {
    const controller = new AbortController();
    activationQueryGenerationRef.current += 1;
    replaceSnapshot(targetScope, () => emptyTriggerLifecycle(targetScope));
    void refreshActivations(controller.signal);
    return () => controller.abort();
  }, [refreshActivations,replaceSnapshot,targetScope]);

  const refreshResourceActivations = useCallback(async (document: AutomationDocument, signal?: AbortSignal) => {
    const requestScope = targetScope;
    if (targetScopeRef.current !== requestScope) return [];
    const resourceId = document.head.resourceId;
    const entrypointNodeIds = new Set(document.spec.nodes
      .filter((node) => isAutomationTriggerKind(node.kind))
      .map((node) => node.id));
    const generation = activationQueryGenerationRef.current + 1;
    activationQueryGenerationRef.current = generation;
    replaceSnapshot(requestScope, (current) => ({ ...current,error: '',loading: false }));
    try {
      const snapshot = await listAutomationActivations(requestScope.targetId, { signal });
      if (signal?.aborted
        || targetScopeRef.current !== requestScope
        || activationQueryGenerationRef.current !== generation) return [];
      const facts = snapshot.filter((activation) => (
        activation.resourceId === resourceId && entrypointNodeIds.has(activation.entrypointNodeId)
      ));
      replaceSnapshot(requestScope, (current) => ({
        ...current,
        activations: replaceAutomationResourceFacts(current.activations, resourceId, facts),
      }));
      return facts;
    } catch (cause) {
      if (!signal?.aborted
        && targetScopeRef.current === requestScope
        && activationQueryGenerationRef.current === generation) {
        replaceSnapshot(requestScope, (current) => ({ ...current,error: messageOf(cause) }));
      }
      throw cause;
    }
  }, [replaceSnapshot,targetScope,targetScopeRef]);

  const dismissResourceActivationCredentials = useCallback((resourceId: string) => {
    replaceSnapshot(targetScope, (current) => ({
      ...current,
      activationCredentials: withoutAutomationResourceFacts(current.activationCredentials, resourceId),
    }));
  }, [replaceSnapshot,targetScope]);

  const clearTriggerResource = useCallback((resourceId: string) => {
    replaceSnapshot(targetScope, (current) => ({
      ...current,
      activations: replaceAutomationResourceFacts(current.activations, resourceId, []),
      activationCredentials: withoutAutomationResourceFacts(current.activationCredentials, resourceId),
      testListeners: replaceAutomationResourceFacts(current.testListeners, resourceId, []),
    }));
  }, [replaceSnapshot,targetScope]);

  const activate = useCallback(async (
    document: AutomationDocument,
    entrypointNodeId: string,
  ): Promise<AutomationActivationResponse> => {
    const requestScope = targetScope;
    assertCurrentTargetScope(targetScopeRef, requestScope);
    const resourceId = document.head.resourceId;
    const current = scopedSnapshot(snapshotRef, requestScope);
    const activation = automationEntrypointFact(current.activations, resourceId, entrypointNodeId);
    replaceSnapshot(requestScope, (state) => ({
      ...state,
      activationCredentials: omitEntrypointFact(state.activationCredentials, resourceId, entrypointNodeId),
    }));
    const response = await putAutomationActivation(requestScope.targetId, resourceId, {
      commitId: document.branch.headCommitId,
      entrypointNodeId,
      desiredState: 'active',
      expectedRevision: activation?.revision ?? 0,
    });
    assertEntrypointResponse(response.activation, resourceId, entrypointNodeId, 'activation');
    replaceSnapshot(requestScope, (state) => ({
      ...state,
      activations: replaceEntrypointFact(state.activations, response.activation),
      activationCredentials: response.credential?.token
        ? {
          ...state.activationCredentials,
          [automationTriggerStateKey(resourceId, entrypointNodeId)]: {
            resourceId,entrypointNodeId,credential: response.credential,
          },
        }
        : omitEntrypointFact(state.activationCredentials, resourceId, entrypointNodeId),
    }));
    return response;
  }, [replaceSnapshot,targetScope,targetScopeRef]);

  const deactivate = useCallback(async (
    document: AutomationDocument,
    entrypointNodeId: string,
  ): Promise<AutomationActivationResponse> => {
    const requestScope = targetScope;
    assertCurrentTargetScope(targetScopeRef, requestScope);
    const resourceId = document.head.resourceId;
    const cached = automationEntrypointFact(
      scopedSnapshot(snapshotRef, requestScope).activations,
      resourceId,
      entrypointNodeId,
    );
    const current = cached
      ?? await getAutomationActivation(requestScope.targetId, resourceId, entrypointNodeId);
    assertCurrentTargetScope(targetScopeRef, requestScope);
    if (!current) throw new Error('This Automation is not activated.');
    const response = await putAutomationActivation(requestScope.targetId, resourceId, {
      commitId: current.pinnedRef.commitId,
      entrypointNodeId,
      desiredState: 'inactive',
      expectedRevision: current.revision,
    });
    assertEntrypointResponse(response.activation, resourceId, entrypointNodeId, 'activation');
    replaceSnapshot(requestScope, (state) => ({
      ...state,
      activations: replaceEntrypointFact(state.activations, response.activation),
      activationCredentials: omitEntrypointFact(state.activationCredentials, resourceId, entrypointNodeId),
    }));
    return response;
  }, [replaceSnapshot,targetScope,targetScopeRef]);

  const dismissActivationCredential = useCallback((resourceId: string, entrypointNodeId: string) => {
    replaceSnapshot(targetScope, (current) => ({
      ...current,
      activationCredentials: omitEntrypointFact(current.activationCredentials, resourceId, entrypointNodeId),
    }));
  }, [replaceSnapshot,targetScope]);

  const startTestListener = useCallback(async (
    document: AutomationDocument,
    entrypointNodeId: string,
    ttlSeconds?: number,
  ): Promise<AutomationTestListenerSession> => {
    const requestScope = targetScope;
    assertCurrentTargetScope(targetScopeRef, requestScope);
    const resourceId = document.head.resourceId;
    const response = await createAutomationTestListener(requestScope.targetId, {
      resourceId,
      commitId: document.branch.headCommitId,
      entrypointNodeId,
      ...(ttlSeconds === undefined ? {} : { ttlSeconds }),
    });
    assertEntrypointResponse(response.listener, resourceId, entrypointNodeId, 'test listener');
    const session = { resourceId,entrypointNodeId,listener: response.listener,credential: response.credential };
    replaceSnapshot(requestScope, (current) => ({
      ...current,testListeners: replaceEntrypointFact(current.testListeners, session),
    }));
    return session;
  }, [replaceSnapshot,targetScope,targetScopeRef]);

  const cancelTestListener = useCallback(async (resourceId: string, entrypointNodeId: string) => {
    const requestScope = targetScope;
    assertCurrentTargetScope(targetScopeRef, requestScope);
    const session = automationEntrypointFact(
      scopedSnapshot(snapshotRef, requestScope).testListeners,
      resourceId,
      entrypointNodeId,
    );
    if (!session) throw new Error('There is no test listener to cancel.');
    const listener = await cancelAutomationTestListener(
      requestScope.targetId,
      session.listener.id,
      session.listener.revision,
    );
    assertEntrypointResponse(listener, resourceId, entrypointNodeId, 'test listener');
    const cancelled = { ...session,listener };
    replaceSnapshot(requestScope, (current) => ({
      ...current,testListeners: replaceEntrypointFact(current.testListeners, cancelled),
    }));
    return cancelled;
  }, [replaceSnapshot,targetScope,targetScopeRef]);

  const submitTestEvent = useCallback(async (
    resourceId: string,
    entrypointNodeId: string,
    payload: Record<string,unknown>,
  ): Promise<AutomationTriggerEventReceipt> => {
    const requestScope = targetScope;
    assertCurrentTargetScope(targetScopeRef, requestScope);
    const session = automationEntrypointFact(
      scopedSnapshot(snapshotRef, requestScope).testListeners,
      resourceId,
      entrypointNodeId,
    );
    if (!session?.credential?.token) throw new Error('Start a test listener before submitting an event.');
    const receipt = await submitAutomationTestEvent(session.listener.publicId, session.credential, payload);
    if (targetScopeRef.current !== requestScope) return receipt;
    try {
      const listener = await getAutomationTestListener(requestScope.targetId, session.listener.id);
      assertEntrypointResponse(listener, resourceId, entrypointNodeId, 'test listener');
      const refreshed = { ...session,listener };
      replaceSnapshot(requestScope, (current) => ({
        ...current,testListeners: replaceEntrypointFact(current.testListeners, refreshed),
      }));
    } catch {
      // The accepted event remains authoritative when the status refresh fails.
    }
    return receipt;
  }, [replaceSnapshot,targetScope,targetScopeRef]);

  const runOnce = useCallback((document: AutomationDocument, entrypointNodeId: string) => {
    const requestScope = targetScope;
    assertCurrentTargetScope(targetScopeRef, requestScope);
    return enqueueAutomationRunOnce(requestScope.targetId, {
      resourceId: document.head.resourceId,
      commitId: document.branch.headCommitId,
      entrypointNodeId,
    });
  }, [targetScope,targetScopeRef]);

  const active = snapshot.scope === targetScope ? snapshot : emptyTriggerLifecycle(targetScope);
  return {
    activations: active.activations,
    activationsError: active.error,
    activationsLoading: active.loading,
    activationCredentials: active.activationCredentials,
    testListeners: active.testListeners,
    refreshActivations,
    refreshResourceActivations,
    dismissResourceActivationCredentials,
    clearTriggerResource,
    activate,
    deactivate,
    dismissActivationCredential,
    startTestListener,
    cancelTestListener,
    submitTestEvent,
    runOnce,
  };
}

function emptyTriggerLifecycle(scope: AutomationTargetScope): TriggerLifecycleSnapshot {
  return {
    scope,activations: {},activationCredentials: {},testListeners: {},error: '',loading: true,
  };
}

function scopedSnapshot(
  reference: { current: TriggerLifecycleSnapshot },
  scope: AutomationTargetScope,
) {
  return reference.current.scope === scope ? reference.current : emptyTriggerLifecycle(scope);
}

function replaceEntrypointFact<T extends { resourceId: string;entrypointNodeId: string }>(
  items: AutomationEntrypointFacts<T>,
  fact: T,
) {
  return { ...items,[automationTriggerStateKey(fact.resourceId, fact.entrypointNodeId)]: fact };
}

function replaceAutomationResourceFacts<T extends { resourceId: string;entrypointNodeId: string }>(
  items: AutomationEntrypointFacts<T>,
  resourceId: string,
  facts: readonly T[],
) {
  return {
    ...withoutAutomationResourceFacts(items, resourceId),
    ...indexAutomationEntrypointFacts(facts),
  };
}

function omitEntrypointFact<T extends { resourceId: string;entrypointNodeId: string }>(
  items: AutomationEntrypointFacts<T>,
  resourceId: string,
  entrypointNodeId: string,
) {
  return recordWithoutKey(items, automationTriggerStateKey(resourceId, entrypointNodeId));
}

function assertCurrentTargetScope(
  reference: { current: AutomationTargetScope },
  scope: AutomationTargetScope,
) {
  if (reference.current !== scope) throw new Error('Automation execution target changed.');
}

function assertEntrypointResponse(
  response: { resourceId: string;entrypointNodeId: string },
  resourceId: string,
  entrypointNodeId: string,
  label: string,
) {
  if (response.resourceId === resourceId && response.entrypointNodeId === entrypointNodeId) return;
  throw new Error(`Automation ${label} response does not match the requested entrypoint.`);
}
