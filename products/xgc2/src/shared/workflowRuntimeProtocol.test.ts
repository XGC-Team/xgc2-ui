import { describe,expect,it } from 'vitest';
import {
  isWorkflowRuntimeDefinitionEvent,
  isWorkflowRuntimeRunLifecycleEvent,
  isWorkflowRuntimeRunEvent,
  workflowRuntimeActions,
  workflowRuntimeDatasources,
  workflowRuntimeEvents,
  WORKFLOW_RUNTIME_PROTOCOL_NAMESPACE,
} from './workflowRuntimeProtocol';

describe('Workflow Runtime protocol vocabulary', () => {
  it('owns one namespace for every action, event, and datasource', () => {
    const values = [
      ...Object.values(workflowRuntimeActions),
      ...Object.values(workflowRuntimeEvents),
      ...Object.values(workflowRuntimeDatasources),
    ];
    expect(values.every((value) => value.startsWith(WORKFLOW_RUNTIME_PROTOCOL_NAMESPACE))).toBe(true);
    expect(new Set(values).size).toBe(values.length);
  });

  it('admits only current run-scoped event values', () => {
    expect(isWorkflowRuntimeRunEvent(workflowRuntimeEvents.runRunning)).toBe(true);
    expect(isWorkflowRuntimeRunEvent(workflowRuntimeEvents.invocationSucceeded)).toBe(true);
    expect(isWorkflowRuntimeRunEvent(workflowRuntimeEvents.definitionUpdated)).toBe(false);
    expect(isWorkflowRuntimeRunEvent(workflowRuntimeEvents.executionClosureInstalled)).toBe(false);
    expect(isWorkflowRuntimeRunEvent('retired.run-running')).toBe(false);
    expect(isWorkflowRuntimeRunEvent(`${WORKFLOW_RUNTIME_PROTOCOL_NAMESPACE}unknown`)).toBe(false);
  });

  it('identifies only authoritative Definition invalidations', () => {
    expect(isWorkflowRuntimeDefinitionEvent(workflowRuntimeEvents.definitionCreated)).toBe(true);
    expect(isWorkflowRuntimeDefinitionEvent(workflowRuntimeEvents.definitionUpdated)).toBe(true);
    expect(isWorkflowRuntimeDefinitionEvent(workflowRuntimeEvents.definitionDeleted)).toBe(true);
    expect(isWorkflowRuntimeDefinitionEvent(workflowRuntimeEvents.executionClosureInstalled)).toBe(true);
    expect(isWorkflowRuntimeDefinitionEvent(workflowRuntimeEvents.runRunning)).toBe(false);
    expect(isWorkflowRuntimeDefinitionEvent('retired.definition-updated')).toBe(false);
  });

  it('distinguishes Run lifecycle boundaries from node and invocation activity', () => {
    expect(isWorkflowRuntimeRunLifecycleEvent(workflowRuntimeEvents.runRunning)).toBe(true);
    expect(isWorkflowRuntimeRunLifecycleEvent(workflowRuntimeEvents.runSucceeded)).toBe(true);
    expect(isWorkflowRuntimeRunLifecycleEvent(workflowRuntimeEvents.queuedRunCanceled)).toBe(true);
    expect(isWorkflowRuntimeRunLifecycleEvent(workflowRuntimeEvents.invocationWaiting)).toBe(false);
    expect(isWorkflowRuntimeRunLifecycleEvent(workflowRuntimeEvents.invocationSucceeded)).toBe(false);
    expect(isWorkflowRuntimeRunLifecycleEvent(workflowRuntimeEvents.nodeSkipped)).toBe(false);
    expect(isWorkflowRuntimeRunLifecycleEvent(workflowRuntimeEvents.definitionUpdated)).toBe(false);
  });
});
