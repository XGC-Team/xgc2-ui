// @vitest-environment jsdom
import { cleanup,renderHook } from '@testing-library/react';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { useAutomationWorkspaceRuns } from './useAutomationWorkspaceRuns';
import { newAutomationSpec } from './automationSpecModel';
import type { AutomationRun } from './automationRunContracts';
import type { AutomationExecutionHistoryEntry } from './automationHistoryTypes';

afterEach(cleanup);

describe('source run selection beyond the catalog history page', () => {
  it('selects a verified older run without requesting or inventing another history page', () => {
    const exact = run('old-run', '2026-01-01T00:00:00Z');
    const latest = run('new-run', '2026-09-06T00:00:00Z');
    const setWorkspaceView = vi.fn();
    const options = {
      resourceId: 'workflow-a',draft: newAutomationSpec('Workflow'),processInstances: [],
      historyEntries: [entry(latest)],preferredRunId: exact.id,
      runDetailsById: { [exact.id]: { run: exact,invocations: [],nodeSummaries: [],loading: false,error: '' } },
      workspaceView: 'executions' as const,setWorkspaceView,
      onRefreshRun: vi.fn().mockResolvedValue(undefined),onRetainRunDetail: vi.fn(() => vi.fn()),onError: vi.fn(),
    };
    const hook = renderHook(() => useAutomationWorkspaceRuns(options));
    expect(hook.result.current.definitionHistoryEntries.map((item) => item.runId)).toEqual(['new-run','old-run']);
    expect(hook.result.current.selectedRun?.id).toBe('old-run');
    expect(hook.result.current.selectedRunDetail?.run).toBe(exact);
    expect(setWorkspaceView).toHaveBeenCalledWith('executions');
    expect(options.historyEntries).toHaveLength(1);
  });

  it('resolves a run to its real ingress history identity without generating a duplicate row', () => {
    const exact = run('run-a', '2026-01-01T00:00:00Z');
    const observed = { ...entry(exact),id: 'ingress-event-a' };
    const options = {
      resourceId: 'workflow-a',draft: newAutomationSpec('Workflow'),processInstances: [],
      historyEntries: [observed],preferredRunId: exact.id,
      runDetailsById: { [exact.id]: { run: exact,invocations: [],nodeSummaries: [],loading: false,error: '' } },
      workspaceView: 'executions' as const,setWorkspaceView: vi.fn(),
      onRefreshRun: vi.fn().mockResolvedValue(undefined),onRetainRunDetail: vi.fn(() => vi.fn()),onError: vi.fn(),
    };
    const hook = renderHook(() => useAutomationWorkspaceRuns(options));
    expect(hook.result.current.definitionHistoryEntries).toHaveLength(1);
    expect(hook.result.current.selectedHistoryEntry?.id).toBe('ingress-event-a');
    expect(hook.result.current.selectedRun?.id).toBe('run-a');
  });
});

function run(id: string, acceptedAt: string): AutomationRun {
  return { id,targetId: 'agent-a',automationResourceId: 'workflow-a',acceptedAt,createdAt: acceptedAt,status: 'succeeded',revision: 1 } as AutomationRun;
}
function entry(run: AutomationRun): AutomationExecutionHistoryEntry {
  return { id: run.id,runId: run.id,targetId: run.targetId,automationResourceId: run.automationResourceId,acceptedAt: run.acceptedAt,phase: 'run',run };
}
