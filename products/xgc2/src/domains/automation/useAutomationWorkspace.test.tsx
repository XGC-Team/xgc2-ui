// @vitest-environment jsdom

import { act,renderHook,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { ReactNode } from 'react';
import { HTTPError } from '../../api/http';
import { ProductRouteVisibilityProvider } from '../../shared/routeReady';
import { createEventCoalescer } from '../../shared/eventCoalescer';
import {
  SYSTEM_EXPERIMENT_RUNNER_AUTOMATION_RESOURCE_ID,
  workflowRuntimeActions,
  workflowRuntimeEvents,
} from '../../shared/workflowRuntimeProtocol';
import { useExecutionEventChannel,type ExecutionEvent,type ExecutionSnapshot } from '../execution/executionPublic';
import {
  commitAutomationDocument,
  createAutomationDocument,
  createAutomationNamespace,
  duplicateAutomationDocument,
  getAutomationDocument,
  listAutomationDocuments,
  listAutomationNamespaces,
} from './automationDocumentService';
import {
  cancelAutomationRun,
  getAutomationExecutionRelations,
  getAutomationRun,
  getAutomationRunSnapshot,
  listAutomationNodeExecutionSummaries,
  listAutomationNodeInvocations,
  startAutomationRun,
  stopAutomationRun,
  stopAutomationRunSet,
} from './automationRunService';
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
  listAutomationExecutionHistory,
  listAutomationIngressTransitions,
  retryAutomationExecutionIngress,
} from './automationExecutionHistoryService';
import { listAutomationNodeCatalog } from './automationCatalogService';
import {
  deleteMCPConnection,
  getMCPCatalog,
  listMCPConnections,
  putMCPConnection,
} from './automationMCPService';
import type { AutomationDocument } from './automationDefinitionContracts';
import type {
  AutomationActivation,
  AutomationTestListener,
} from './automationTriggerContracts';
import type {
  AutomationRun,
  AutomationRunSnapshot,
} from './automationRunContracts';
import type {
  AutomationExecutionRelations,
  AutomationNodeInvocation,
  AutomationNodeExecutionSummary,
  AutomationWaitRelation,
} from './automationExecutionContracts';
import { newAutomationNode,newAutomationSpec } from './automationSpecModel';
import { useAutomationWorkspace } from './useAutomationWorkspace';
import { useAutomationPageSelection } from './useAutomationPageSelection';
import { AutomationCommitConflict } from './automationErrorModel';
import type * as AutomationDocumentServiceModule from './automationDocumentService';
import type * as AutomationRunServiceModule from './automationRunService';
import type * as AutomationTriggerServiceModule from './automationTriggerService';
import type * as AutomationExecutionHistoryServiceModule from './automationExecutionHistoryService';
import type * as AutomationCatalogServiceModule from './automationCatalogService';
import type * as AutomationMCPServiceModule from './automationMCPService';
import type * as EventCoalescerModule from '../../shared/eventCoalescer';
import type * as ExecutionPublicModule from '../execution/executionPublic';
import { automationCatalogTraits } from './automationCatalogTestFixtures';
import { automationTriggerStateKey } from './automationTriggerState';
import type { AutomationExecutionHistoryEntry,AutomationExecutionIngressAudit,AutomationExecutionRunSummary,AutomationIngressTransition } from './automationHistoryTypes';

let executionEventListener: ((event: ExecutionEvent) => void) | undefined;
let executionStreamState: ExecutionSnapshot['streamState'];
let executionStreamId: string;

vi.mock('../execution/executionPublic', async (loadOriginal) => {
  const original = await loadOriginal<typeof ExecutionPublicModule>();
  return { ...original,useExecutionEventChannel: vi.fn() };
});

vi.mock('../../shared/eventCoalescer', async (loadOriginal) => {
  const original = await loadOriginal<typeof EventCoalescerModule>();
  return { ...original,createEventCoalescer: vi.fn(original.createEventCoalescer) };
});

vi.mock('./automationDocumentService', async (loadOriginal) => {
  const original = await loadOriginal<typeof AutomationDocumentServiceModule>();
  return {
    ...original,
    commitAutomationDocument: vi.fn(),
    createAutomationDocument: vi.fn(),
    createAutomationNamespace: vi.fn(),
    duplicateAutomationDocument: vi.fn(),
    getAutomationDocument: vi.fn(),
    listAutomationDocuments: vi.fn(),
    listAutomationNamespaces: vi.fn(),
  };
});

vi.mock('./automationRunService', async (loadOriginal) => {
  const original = await loadOriginal<typeof AutomationRunServiceModule>();
  return {
    ...original,
    cancelAutomationRun: vi.fn(),
    getAutomationExecutionRelations: vi.fn(),
    getAutomationRun: vi.fn(),
    getAutomationRunSnapshot: vi.fn(),
    listAutomationNodeExecutionSummaries: vi.fn(),
    listAutomationNodeInvocations: vi.fn(),
    startAutomationRun: vi.fn(),
    stopAutomationRun: vi.fn(),
    stopAutomationRunSet: vi.fn(),
  };
});

vi.mock('./automationTriggerService', async (loadOriginal) => {
  const original = await loadOriginal<typeof AutomationTriggerServiceModule>();
  return {
    ...original,
    cancelAutomationTestListener: vi.fn(),
    createAutomationTestListener: vi.fn(),
    enqueueAutomationRunOnce: vi.fn(),
    getAutomationActivation: vi.fn(),
    getAutomationTestListener: vi.fn(),
    listAutomationActivations: vi.fn(),
    putAutomationActivation: vi.fn(),
    submitAutomationTestEvent: vi.fn(),
  };
});

vi.mock('./automationExecutionHistoryService', async (loadOriginal) => {
  const original = await loadOriginal<typeof AutomationExecutionHistoryServiceModule>();
  return { ...original,listAutomationExecutionHistory: vi.fn(),listAutomationIngressTransitions: vi.fn(),retryAutomationExecutionIngress: vi.fn() };
});

vi.mock('./automationCatalogService', async (loadOriginal) => {
  const original = await loadOriginal<typeof AutomationCatalogServiceModule>();
  return { ...original,listAutomationNodeCatalog: vi.fn() };
});

vi.mock('./automationMCPService', async (loadOriginal) => {
  const original = await loadOriginal<typeof AutomationMCPServiceModule>();
  return { ...original,deleteMCPConnection: vi.fn(),getMCPCatalog: vi.fn(),listMCPConnections: vi.fn(),putMCPConnection: vi.fn() };
});

describe('useAutomationWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAutomationRun).mockReset();
    vi.mocked(listAutomationDocuments).mockResolvedValue([documentFixture()]);
    vi.mocked(listAutomationActivations).mockResolvedValue([]);
    vi.mocked(listAutomationNamespaces).mockResolvedValue([]);
    vi.mocked(listAutomationNodeCatalog).mockResolvedValue([catalogEntry]);
    vi.mocked(listAutomationNodeInvocations).mockResolvedValue([]);
    vi.mocked(listAutomationNodeExecutionSummaries).mockResolvedValue([]);
    vi.mocked(getAutomationDocument).mockResolvedValue(documentFixture());
    vi.mocked(getAutomationRunSnapshot).mockResolvedValue(runSnapshotFixture());
    vi.mocked(getAutomationExecutionRelations).mockResolvedValue(emptyRelations());
    vi.mocked(listAutomationExecutionHistory).mockResolvedValue({ entries: [],complete: true });
    vi.mocked(listAutomationIngressTransitions).mockResolvedValue({ transitions: [],complete: true });
    vi.mocked(listMCPConnections).mockResolvedValue([]);
    vi.mocked(getAutomationActivation).mockResolvedValue(undefined);
    executionEventListener = undefined;
    executionStreamState = 'connected';
    executionStreamId = 'stream-1';
    vi.mocked(useExecutionEventChannel).mockImplementation((eventTargetId, listener) => {
      executionEventListener = listener;
      return {
        ...executionSnapshotFixture(eventTargetId),streamId: executionStreamId,
        streamState: executionStreamState,
      };
    });
  });

  it('loads typed documents, namespaces, trusted catalog and runtime facts independently', async () => {
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.documents).toHaveLength(1);
    expect(result.current.catalog).toEqual([catalogEntry]);
    expect(listAutomationDocuments).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
    expect(listAutomationNodeCatalog).toHaveBeenCalledWith('local', { signal: expect.any(AbortSignal) });
    expect(listAutomationExecutionHistory).not.toHaveBeenCalled();
  });

  it('exposes document absence only for a typed 404 and clears it for a failed retry', async () => {
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(getAutomationDocument).mockRejectedValueOnce(new HTTPError(404,'Not Found'));
    await act(async () => { await result.current.open('missing').catch(() => undefined); });
    expect(result.current.selectionNotFound).toBe(true);
    vi.mocked(getAutomationDocument).mockRejectedValueOnce(new Error('request timeout after 8000ms'));
    await act(async () => { await result.current.open('missing').catch(() => undefined); });
    expect(result.current.selectionNotFound).toBe(false);
    expect(result.current.selectionError).toContain('request timeout');
  });

  it('shares navigation and route selection reads in flight while allowing an explicit settled retry', async () => {
    const pending = deferred<AutomationDocument>();
    vi.mocked(getAutomationDocument).mockReturnValueOnce(pending.promise);
    const { result,rerender } = renderHook(({ resourceId }: { resourceId?: string }) => {
      const workspace = useAutomationWorkspace('local');
      useAutomationPageSelection({
        targetId:'local',resourceId,workspaceSelected:workspace.selected,
        selectionNotFound:workspace.selectionResourceId === resourceId && workspace.selectionNotFound,
        openDocument:workspace.open,closeDocument:workspace.close,
      });
      return workspace;
    },{ initialProps:{} });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let navigation!: ReturnType<typeof result.current.open>;
    act(() => { navigation = result.current.open('automation-a'); });
    rerender({ resourceId:'automation-a' });
    expect(getAutomationDocument).toHaveBeenCalledOnce();
    await act(async () => { pending.resolve(documentFixture());await navigation; });
    expect(result.current.selected?.head.resourceId).toBe('automation-a');
    vi.mocked(getAutomationDocument).mockRejectedValueOnce(new Error('Retry transport failure'));
    await act(async () => { await result.current.open('automation-a').catch(() => undefined); });
    expect(getAutomationDocument).toHaveBeenCalledTimes(2);
    expect(result.current.selectionError).toBe('Retry transport failure');
  });

  it('preserves an exact document while a missing catalog entry is revalidated', async () => {
    const document = documentFixture();
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.open('automation-a'); });
    await act(async () => { await result.current.refresh(); });
    expect(getAutomationDocument).toHaveBeenCalledOnce();
    const exact = deferred<AutomationDocument>();
    vi.mocked(listAutomationDocuments).mockResolvedValueOnce([]);
    vi.mocked(getAutomationDocument).mockReturnValueOnce(exact.promise);
    let refreshing!: ReturnType<typeof result.current.refresh>;
    act(() => { refreshing = result.current.refresh(); });
    await waitFor(() => expect(getAutomationDocument).toHaveBeenCalledTimes(2));
    expect(result.current.selected).toEqual(document);
    expect(result.current.selectionNotFound).toBe(false);
    await act(async () => { exact.resolve(document);await refreshing; });
    expect(result.current.documents).toEqual([]);
    expect(result.current.selected).toEqual(document);
  });

  it('does not reopen the previous document when a catalog refresh finishes during navigation', async () => {
    const catalog = deferred<AutomationDocument[]>();
    const destination = deferred<AutomationDocument>();
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.open('automation-a'); });
    vi.mocked(listAutomationDocuments).mockReturnValueOnce(catalog.promise);
    vi.mocked(getAutomationDocument).mockReturnValueOnce(destination.promise);
    let refreshing!:ReturnType<typeof result.current.refresh>;
    let navigating!:ReturnType<typeof result.current.open>;
    act(() => {
      refreshing = result.current.refresh();
      navigating = result.current.open('automation-b');
    });
    await act(async () => { catalog.resolve([]);await refreshing; });
    expect(getAutomationDocument).toHaveBeenCalledTimes(2);
    expect(result.current.selectionResourceId).toBe('automation-b');
    await act(async () => { destination.resolve(documentFixture({ resourceId:'automation-b' }));await navigating; });
    expect(result.current.selected?.head.resourceId).toBe('automation-b');
  });

  it('never reuses an aborted history request when the same resource is immediately refreshed', async () => {
    const abandoned = deferred<ReturnType<typeof historyPageFromRuns>>();
    const latest = runFixture({ id:'fresh-history' });
    vi.mocked(listAutomationExecutionHistory).mockReturnValueOnce(abandoned.promise)
      .mockResolvedValueOnce(historyPageFromRuns([latest]));
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const controller = new AbortController();
    let first!:ReturnType<typeof result.current.refreshExecutionHistory>;
    let second!:ReturnType<typeof result.current.refreshExecutionHistory>;
    act(() => {
      first = result.current.refreshExecutionHistory('automation-a',controller.signal);
      controller.abort();
      second = result.current.refreshExecutionHistory('automation-a');
    });
    expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(2);
    await act(async () => { await Promise.all([first,second]); });
    expect(result.current.runSummaries.map((run) => run.id)).toEqual(['fresh-history']);
    await act(async () => { abandoned.resolve(historyPageFromRuns([runFixture()])); });
    expect(result.current.runSummaries.map((run) => run.id)).toEqual(['fresh-history']);
  });

  it('bounds replay and stream recovery in the history owner and cancels the entire parked queue', async () => {
    let visible = true;
    const wrapper = ({ children }: { children:ReactNode }) => <ProductRouteVisibilityProvider visible={visible}>{children}</ProductRouteVisibilityProvider>;
    const { result,rerender } = renderHook(() => useAutomationWorkspace('local'),{ wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await Promise.all(['a','b','c','d'].map((id) => result.current.refreshExecutionHistory(id))); });
    const pending: Array<{ signal:AbortSignal;resolve:() => void }> = [];
    vi.mocked(listAutomationExecutionHistory).mockClear();
    vi.mocked(listAutomationExecutionHistory).mockImplementation((_target,{ signal }) => new Promise((resolve) => {
      pending.push({ signal:signal!,resolve:() => resolve({ entries:[],complete:true }) });
    }));
    executionStreamState = 'replaying';rerender();
    act(() => executionEventListener?.(executionEvent({ entityId:'replayed-run',seq:1 })));
    executionStreamState = 'connected';rerender();
    expect(pending).toHaveLength(2);
    visible = false;rerender();
    expect(pending.every(({ signal }) => signal.aborted)).toBe(true);
    await act(async () => { pending.forEach(({ resolve }) => resolve()); });
    expect(pending).toHaveLength(2);
    executionStreamId = 'stream-parked';rerender();
    await act(async () => { await Promise.resolve(); });
    expect(pending).toHaveLength(2);
    visible = true;rerender();
    expect(pending).toHaveLength(4);
    await act(async () => { pending[2]!.resolve(); });
    expect(pending).toHaveLength(5);
    await act(async () => { pending[3]!.resolve(); });
    expect(pending).toHaveLength(6);
    await act(async () => { pending[4]!.resolve();pending[5]!.resolve(); });
    expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(6);
  });

  it('joins a pre-replay history read then fetches one fresh snapshot for the coalesced invalidations', async () => {
    const { result,rerender } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.refreshExecutionHistory('automation-a'); });
    const old = deferred<ReturnType<typeof historyPageFromRuns>>();
    const fresh = runFixture({ id:'created-during-replay' });
    vi.mocked(listAutomationExecutionHistory).mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(historyPageFromRuns([fresh]));
    let reading!:ReturnType<typeof result.current.refreshExecutionHistory>;
    act(() => { reading = result.current.refreshExecutionHistory('automation-a'); });
    executionStreamState = 'replaying';rerender();
    act(() => {
      for (let index = 0;index < 80;index += 1) executionEventListener?.(executionEvent({ entityId:`replayed-${index}`,seq:1,offset:index + 1 }));
    });
    executionStreamState = 'connected';rerender();
    expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(2);
    await act(async () => { old.resolve(historyPageFromRuns([]));await reading; });
    await waitFor(() => expect(result.current.runSummaries.map((run) => run.id)).toEqual(['created-during-replay']));
    expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(3);
  });

  it('does not derive a replay trailing read after the waiting request is cancelled by parking', async () => {
    let visible = true;
    const wrapper = ({ children }: { children:ReactNode }) => <ProductRouteVisibilityProvider visible={visible}>{children}</ProductRouteVisibilityProvider>;
    const { result,rerender } = renderHook(() => useAutomationWorkspace('local'),{ wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.refreshExecutionHistory('automation-a'); });
    const old = deferred<ReturnType<typeof historyPageFromRuns>>();
    vi.mocked(listAutomationExecutionHistory).mockReturnValueOnce(old.promise);
    let reading!:ReturnType<typeof result.current.refreshExecutionHistory>;
    act(() => { reading = result.current.refreshExecutionHistory('automation-a'); });
    executionStreamState = 'replaying';rerender();
    act(() => executionEventListener?.(executionEvent({ entityId:'replayed-run',seq:1 })));
    executionStreamState = 'connected';rerender();
    visible = false;rerender();
    await act(async () => { old.resolve(historyPageFromRuns([]));await reading; });
    expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(2);
  });

  it('preserves a second replay boundary arriving after the first trailing snapshot has started', async () => {
    const { result,rerender } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.refreshExecutionHistory('automation-a'); });
    const old = deferred<ReturnType<typeof historyPageFromRuns>>();
    const trailing = deferred<ReturnType<typeof historyPageFromRuns>>();
    const latest = runFixture({ id:'created-during-second-replay' });
    vi.mocked(listAutomationExecutionHistory).mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(trailing.promise).mockResolvedValueOnce(historyPageFromRuns([latest]));
    let reading!:ReturnType<typeof result.current.refreshExecutionHistory>;
    act(() => { reading = result.current.refreshExecutionHistory('automation-a'); });
    const replayBoundary = (sequence:number) => {
      executionStreamState = 'replaying';rerender();
      act(() => {
        for (let index = 0;index < 20;index += 1) executionEventListener?.(executionEvent({ entityId:`replay-${index}`,seq:sequence,offset:sequence * 20 + index }));
      });
      executionStreamState = 'connected';rerender();
    };
    replayBoundary(1);
    await act(async () => { old.resolve(historyPageFromRuns([]));await reading; });
    await waitFor(() => expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(3));
    replayBoundary(2);
    expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(3);
    await act(async () => { trailing.resolve(historyPageFromRuns([])); });
    await waitFor(() => expect(result.current.runSummaries.map((run) => run.id)).toEqual(['created-during-second-replay']));
    expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(4);
  });

  it('preserves newer SSE runs across a late foreground first page and overlapping older pages', async () => {
    const original = runFixture({ status:'running',revision:1 });
    const created = runFixture({ id:'created-while-opening',status:'running',revision:1 });
    const older = runFixture({ id:'older-page-run' });
    const firstPage = deferred<ReturnType<typeof historyPageFromRuns>>();
    vi.mocked(listAutomationExecutionHistory).mockResolvedValueOnce(historyPageFromRuns([original]))
      .mockReturnValueOnce(firstPage.promise).mockResolvedValueOnce(historyPageFromRuns([original,older]));
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.refreshExecutionHistory('automation-a'); });
    let opening!:ReturnType<typeof result.current.open>;
    act(() => { opening = result.current.open('automation-a'); });
    await waitFor(() => expect(result.current.selected?.head.resourceId).toBe('automation-a'));
    act(() => {
      executionEventListener?.(executionEvent({ seq:3,type:workflowRuntimeEvents.runWaiting,payload:{ status:'waiting',revision:3 } }));
      executionEventListener?.(executionEvent({
        entityId:created.id,seq:1,offset:4,type:workflowRuntimeEvents.runRunning,
        payload:{ run:historyPageFromRuns([created]).entries[0]!.run },
      }));
    });
    expect(result.current.runSummaries).toContainEqual(expect.objectContaining({ id:created.id }));
    await act(async () => { firstPage.resolve(historyPageFromRuns([original],'older-cursor'));await opening; });
    expect(result.current.runSummaries).toContainEqual(expect.objectContaining({ id:original.id,status:'waiting',revision:3 }));
    expect(result.current.runSummaries).toContainEqual(expect.objectContaining({ id:created.id }));
    expect(result.current.hasMoreRuns).toBe(true);
    await act(async () => { await result.current.loadMoreRuns(); });
    expect(result.current.runSummaries).toHaveLength(3);
    expect(result.current.runSummaries).toContainEqual(expect.objectContaining({ id:original.id,revision:3 }));
    expect(result.current.hasMoreRuns).toBe(false);
  });

  it('rejects a previous stream pagination response even when the new stream reuses its cursor', async () => {
    const oldPage = deferred<ReturnType<typeof historyPageFromRuns>>();
    const currentPage = deferred<ReturnType<typeof historyPageFromRuns>>();
    const currentRun = runFixture({ id:'current-page-run' });
    const baseRun = runFixture({ id:'base-page-run' });
    vi.mocked(listAutomationExecutionHistory).mockResolvedValueOnce(historyPageFromRuns([baseRun],'same-cursor'))
      .mockReturnValueOnce(oldPage.promise).mockResolvedValueOnce(historyPageFromRuns([baseRun],'same-cursor'))
      .mockReturnValueOnce(currentPage.promise);
    const { result,rerender } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.open('automation-a'); });
    let oldReading!:ReturnType<typeof result.current.loadMoreRuns>;
    act(() => { oldReading = result.current.loadMoreRuns(); });
    executionStreamId = 'stream-after-pagination';rerender();
    await waitFor(() => expect(result.current.hasMoreRuns).toBe(true));
    let currentReading!:ReturnType<typeof result.current.loadMoreRuns>;
    act(() => { currentReading = result.current.loadMoreRuns(); });
    await act(async () => { oldPage.resolve(historyPageFromRuns([runFixture({ id:'stale-page-run' })]));await oldReading; });
    expect(result.current.runSummaries.map((run) => run.id)).toEqual([baseRun.id]);
    expect(result.current.runsLoadingMore).toBe(true);
    await act(async () => { currentPage.resolve(historyPageFromRuns([currentRun]));await currentReading; });
    expect(result.current.runSummaries.map((run) => run.id).sort()).toEqual([baseRun.id,currentRun.id].sort());
    expect(result.current.runsLoadingMore).toBe(false);
    expect(result.current.hasMoreRuns).toBe(false);
  });

  it('keeps successful definition resources when one refresh branch fails', async () => {
    const updatedDocument = documentFixture({ resourceId: 'automation-b' });
    const updatedCatalog = { ...catalogEntry,label: 'Updated manual trigger' };
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.activationsLoading).toBe(false));

    vi.mocked(listAutomationDocuments).mockResolvedValueOnce([updatedDocument]);
    vi.mocked(listAutomationNamespaces).mockRejectedValueOnce(new Error('namespace catalog unavailable'));
    vi.mocked(listAutomationNodeCatalog).mockResolvedValueOnce([updatedCatalog]);
    vi.mocked(listAutomationActivations).mockResolvedValueOnce([]);

    await act(async () => { await result.current.refresh(); });

    expect(result.current.documents).toEqual([updatedDocument]);
    expect(result.current.catalog).toEqual([updatedCatalog]);
    expect(result.current.documentsError).toBe('');
    expect(result.current.namespacesError).toBe('namespace catalog unavailable');
    expect(result.current.documentsLoading).toBe(false);
    expect(result.current.namespacesLoading).toBe(false);
    expect(result.current.catalogLoading).toBe(false);
  });

  it('keeps the target-scoped node catalog fenced from a late previous target response', async () => {
    const localCatalog = deferred<(typeof catalogEntry)[]>();
    const agentCatalog = [{ ...catalogEntry,label: 'Agent B manual trigger' }];
    vi.mocked(listAutomationNodeCatalog).mockImplementation((requestTargetId) => (
      requestTargetId === 'local' ? localCatalog.promise : Promise.resolve(agentCatalog)
    ));
    const { result,rerender } = renderHook(
      ({ targetId }) => useAutomationWorkspace(targetId),
      { initialProps: { targetId: 'local' } },
    );

    rerender({ targetId: 'agent-b' });
    await waitFor(() => expect(result.current.catalog).toEqual(agentCatalog));

    localCatalog.resolve([catalogEntry]);
    await act(async () => { await localCatalog.promise;await Promise.resolve(); });

    expect(result.current.catalog).toEqual(agentCatalog);
    expect(result.current.catalogLoading).toBe(false);
  });

  it('exposes an empty target-scoped first frame for both legs of an A to B to A switch', async () => {
    const document = documentFixture();
    const activation = activationFixture();
    const listener = listenerFixture();
    const connection = mcpConnectionFixture();
    const catalog = mcpCatalogFixture();
    const dead = ingressHistoryEntry('dead_letter', { revision: 3,attemptCount: 1 });
    const run = runFixture({ id: dead.runId });
    vi.mocked(listAutomationActivations).mockResolvedValueOnce([activation]);
    vi.mocked(getAutomationActivation).mockResolvedValue(activation);
    vi.mocked(listAutomationExecutionHistory).mockResolvedValueOnce({ entries: [dead],complete: true });
    vi.mocked(listMCPConnections).mockResolvedValueOnce([connection]);
    vi.mocked(getMCPCatalog).mockResolvedValueOnce(catalog);
    vi.mocked(putAutomationActivation).mockResolvedValueOnce({
      activation,credential: { publicId: 'public-a',token: 'production-secret' },
    });
    vi.mocked(createAutomationTestListener).mockResolvedValueOnce({
      listener,credential: { publicId: listener.publicId,token: 'listener-secret' },
    });
    vi.mocked(listAutomationIngressTransitions).mockResolvedValueOnce({
      transitions: [ingressTransition(dead, 1, 'accepted')],complete: true,
    });
    vi.mocked(getAutomationRun).mockResolvedValueOnce(run);
    const exposures: Array<{
      targetId: string;
      catalogCount: number;
      catalogLoading: boolean;
      selectedResourceId: string;
      selectionError: string;
      selectionLoading: boolean;
      activationCount: number;
      activationCredentialCount: number;
      listenerCount: number;
      activationsError: string;
      activationsLoading: boolean;
      mcpConnectionCount: number;
      mcpCatalogCount: number;
      mcpConnectionsLoading: boolean;
      historyCount: number;
      historyError: string;
      runDetailCount: number;
      retryingIngressCount: number;
      ingressRetryErrorCount: number;
      ingressLedgerCount: number;
      error: string;
    }> = [];
    const { result,rerender } = renderHook(
      ({ targetId }) => {
        const workspace = useAutomationWorkspace(targetId);
        exposures.push({
          targetId: workspace.targetId,
          catalogCount: workspace.catalog.length,
          catalogLoading: workspace.catalogLoading,
          selectedResourceId: workspace.selected?.head.resourceId ?? '',
          selectionError: workspace.selectionError,
          selectionLoading: workspace.selectionLoading,
          activationCount: Object.keys(workspace.activations).length,
          activationCredentialCount: Object.keys(workspace.activationCredentials).length,
          listenerCount: Object.keys(workspace.testListeners).length,
          activationsError: workspace.activationsError,
          activationsLoading: workspace.activationsLoading,
          mcpConnectionCount: workspace.mcpConnections.length,
          mcpCatalogCount: Object.keys(workspace.mcpCatalogs).length,
          mcpConnectionsLoading: workspace.mcpConnectionsLoading,
          historyCount: workspace.historyEntries.length,
          historyError: workspace.historyError,
          runDetailCount: Object.keys(workspace.runDetailsById).length,
          retryingIngressCount: workspace.retryingIngressEventIds.length,
          ingressRetryErrorCount: Object.keys(workspace.ingressRetryErrors).length,
          ingressLedgerCount: Object.keys(workspace.ingressTransitionLedgers).length,
          error: workspace.error,
        });
        return workspace;
      },
      { initialProps: { targetId: 'local' } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.activationsLoading).toBe(false));
    await act(async () => { await result.current.open(document.head.resourceId); });
    await act(async () => {
      await result.current.refreshMCPConnections();
      await result.current.activate(document, 'start');
      await result.current.startTestListener(document, 'start');
      await result.current.loadIngressTransitions(dead.id);
      await result.current.loadRunDetail(run.id);
    });

    vi.mocked(getAutomationDocument).mockRejectedValueOnce(new Error('selection unavailable'));
    await act(async () => { await result.current.open('missing').catch(() => undefined); });
    vi.mocked(startAutomationRun).mockResolvedValueOnce(runFixture({ id: 'run-runtime-error' }));
    vi.mocked(listAutomationExecutionHistory).mockRejectedValueOnce(new Error('runtime history unavailable'));
    await act(async () => { await result.current.runDocument(document); });
    await waitFor(() => expect(result.current.error).toBe('runtime history unavailable'));

    expect(result.current.catalog).not.toEqual([]);
    expect(result.current.selected?.head.resourceId).toBe(document.head.resourceId);
    expect(result.current.selectionError).toBe('selection unavailable');
    expect(result.current.selectionNotFound).toBe(false);
    expect(Object.keys(result.current.activationCredentials)).toHaveLength(1);
    expect(Object.keys(result.current.testListeners)).toHaveLength(1);
    expect(result.current.mcpConnections).toHaveLength(1);
    expect(result.current.historyEntries).toHaveLength(1);
    expect(Object.keys(result.current.runDetailsById).length).toBeGreaterThan(0);
    expect(Object.keys(result.current.ingressTransitionLedgers)).toHaveLength(1);

    const firstBIndex = exposures.length;
    rerender({ targetId: 'agent-b' });
    const firstB = exposures[firstBIndex];
    const firstA2Index = exposures.length;
    rerender({ targetId: 'local' });
    const firstA2 = exposures[firstA2Index];
    const emptyTargetFrame = {
      catalogCount: 0,
      catalogLoading: true,
      selectedResourceId: '',
      selectionError: '',
      selectionLoading: false,
      activationCount: 0,
      activationCredentialCount: 0,
      listenerCount: 0,
      activationsError: '',
      activationsLoading: true,
      mcpConnectionCount: 0,
      mcpCatalogCount: 0,
      mcpConnectionsLoading: false,
      historyCount: 0,
      historyError: '',
      runDetailCount: 0,
      retryingIngressCount: 0,
      ingressRetryErrorCount: 0,
      ingressLedgerCount: 0,
      error: '',
    };
    expect(firstB).toEqual({ targetId: 'agent-b',...emptyTargetFrame });
    expect(firstA2).toEqual({ targetId: 'local',...emptyTargetFrame });
    await waitFor(() => expect(result.current.catalogLoading).toBe(false));
    await waitFor(() => expect(result.current.activationsLoading).toBe(false));
  });

  it('binds selection loading and late document completion to one A to B to A epoch', async () => {
    const pendingDocument = deferred<AutomationDocument>();
    const exposures: Array<{
      targetId: string;
      selectedResourceId: string;
      selectionError: string;
      selectionLoading: boolean;
    }> = [];
    const { result,rerender } = renderHook(
      ({ targetId }) => {
        const workspace = useAutomationWorkspace(targetId);
        exposures.push({
          targetId: workspace.targetId,
          selectedResourceId: workspace.selected?.head.resourceId ?? '',
          selectionError: workspace.selectionError,
          selectionLoading: workspace.selectionLoading,
        });
        return workspace;
      },
      { initialProps: { targetId: 'local' } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(getAutomationDocument).mockReturnValueOnce(pendingDocument.promise);

    let opening!: ReturnType<typeof result.current.open>;
    act(() => { opening = result.current.open('automation-a'); });
    expect(result.current.selectionLoading).toBe(true);
    const firstBIndex = exposures.length;
    rerender({ targetId: 'agent-b' });
    const firstB = exposures[firstBIndex];
    const firstA2Index = exposures.length;
    rerender({ targetId: 'local' });
    const firstA2 = exposures[firstA2Index];

    pendingDocument.resolve(documentFixture());
    await act(async () => { await opening; });
    expect(firstB).toEqual({
      targetId: 'agent-b',selectedResourceId: '',selectionError: '',selectionLoading: false,
    });
    expect(firstA2).toEqual({
      targetId: 'local',selectedResourceId: '',selectionError: '',selectionLoading: false,
    });
    expect(result.current.selected).toBeNull();
    expect(result.current.selectionError).toBe('');
    expect(result.current.selectionLoading).toBe(false);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('fences late mutation successes from every target owner across A to B to A', async () => {
    const dead = ingressHistoryEntry('dead_letter', { revision: 3,attemptCount: 1 });
    vi.mocked(listAutomationExecutionHistory).mockResolvedValueOnce({ entries: [dead],complete: true });
    const { result,rerender } = renderHook(
      ({ targetId }) => useAutomationWorkspace(targetId),
      { initialProps: { targetId: 'local' } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.activationsLoading).toBe(false));
    await act(async () => { await result.current.open('automation-a'); });

    const pendingCatalog = deferred<(typeof catalogEntry)[]>();
    const pendingActivation = deferred<Awaited<ReturnType<typeof putAutomationActivation>>>();
    const pendingListener = deferred<Awaited<ReturnType<typeof createAutomationTestListener>>>();
    const pendingMCPSave = deferred<Awaited<ReturnType<typeof putMCPConnection>>>();
    const pendingMCPDelete = deferred<Awaited<ReturnType<typeof deleteMCPConnection>>>();
    const pendingMCPDiscovery = deferred<Awaited<ReturnType<typeof getMCPCatalog>>>();
    const pendingIngressRetry = deferred<Awaited<ReturnType<typeof retryAutomationExecutionIngress>>>();
    const pendingIngressLedger = deferred<Awaited<ReturnType<typeof listAutomationIngressTransitions>>>();
    const pendingStart = deferred<Awaited<ReturnType<typeof startAutomationRun>>>();
    const pendingStop = deferred<Awaited<ReturnType<typeof stopAutomationRun>>>();
    const pendingStopSet = deferred<Awaited<ReturnType<typeof stopAutomationRunSet>>>();
    const pendingDetailRun = deferred<Awaited<ReturnType<typeof getAutomationRun>>>();
    const listener = listenerFixture();
    const connection = mcpConnectionFixture();
    const started = runFixture({ id: 'run-start-late' });
    const stopped = runFixture({ id: 'run-stop-late',status: 'stopping',revision: 2 });
    const detailRun = runFixture({ id: 'run-detail-late' });
    const retried = { ...dead.ingress!,revision: 4,status: 'pending' as const };
    vi.mocked(listAutomationNodeCatalog).mockReturnValueOnce(pendingCatalog.promise);
    vi.mocked(putAutomationActivation).mockReturnValueOnce(pendingActivation.promise);
    vi.mocked(createAutomationTestListener).mockReturnValueOnce(pendingListener.promise);
    vi.mocked(putMCPConnection).mockReturnValueOnce(pendingMCPSave.promise);
    vi.mocked(deleteMCPConnection).mockReturnValueOnce(pendingMCPDelete.promise);
    vi.mocked(getMCPCatalog).mockReturnValueOnce(pendingMCPDiscovery.promise);
    vi.mocked(retryAutomationExecutionIngress).mockReturnValueOnce(pendingIngressRetry.promise);
    vi.mocked(listAutomationIngressTransitions).mockReturnValueOnce(pendingIngressLedger.promise);
    vi.mocked(startAutomationRun).mockReturnValueOnce(pendingStart.promise);
    vi.mocked(stopAutomationRun).mockReturnValueOnce(pendingStop.promise);
    vi.mocked(stopAutomationRunSet).mockReturnValueOnce(pendingStopSet.promise);
    vi.mocked(getAutomationRun).mockReturnValueOnce(pendingDetailRun.promise);

    let refreshRequest!: ReturnType<typeof result.current.refresh>;
    let activationRequest!: ReturnType<typeof result.current.activate>;
    let listenerRequest!: ReturnType<typeof result.current.startTestListener>;
    let mcpSaveRequest!: ReturnType<typeof result.current.saveMCPConnection>;
    let mcpDeleteRequest!: ReturnType<typeof result.current.removeMCPConnection>;
    let mcpDiscoveryRequest!: ReturnType<typeof result.current.discoverMCPCatalog>;
    let ingressRetryRequest!: ReturnType<typeof result.current.retryExecutionIngress>;
    let ingressLedgerRequest!: ReturnType<typeof result.current.loadIngressTransitions>;
    let startRequest!: ReturnType<typeof result.current.runDocument>;
    let stopRequest!: ReturnType<typeof result.current.stop>;
    let stopSetRequest!: ReturnType<typeof result.current.stopRunSet>;
    let detailRequest!: ReturnType<typeof result.current.loadRunDetail>;
    act(() => {
      refreshRequest = result.current.refresh();
      activationRequest = result.current.activate(documentFixture(), 'start');
      listenerRequest = result.current.startTestListener(documentFixture(), 'start');
      mcpSaveRequest = result.current.saveMCPConnection(connection.id, {
        name: connection.name,transport: connection.transport,endpoint: connection.endpoint,
        headerEnvironment: {},enabled: true,expectedRevision: 0,
      });
      mcpDeleteRequest = result.current.removeMCPConnection(connection);
      mcpDiscoveryRequest = result.current.discoverMCPCatalog(connection.id);
      ingressRetryRequest = result.current.retryExecutionIngress(dead.id);
      ingressLedgerRequest = result.current.loadIngressTransitions(dead.id);
      startRequest = result.current.runDocument(documentFixture());
      stopRequest = result.current.stop(runFixture({ id: 'run-stop-late' }));
      stopSetRequest = result.current.stopRunSet(runFixture({ id: 'run-set-late' }), {
        includeAnchor: true,includeDetached: true,
      });
      detailRequest = result.current.loadRunDetail(detailRun.id);
    });
    rerender({ targetId: 'agent-b' });
    rerender({ targetId: 'local' });

    await act(async () => {
      pendingCatalog.resolve([{ ...catalogEntry,label: 'stale A catalog' }]);
      pendingActivation.resolve({
        activation: activationFixture(),credential: { publicId: 'public-a',token: 'stale-secret' },
      });
      pendingListener.resolve({
        listener,credential: { publicId: listener.publicId,token: 'stale-listener-secret' },
      });
      pendingMCPSave.resolve(connection);
      pendingMCPDelete.resolve({ id: connection.id });
      pendingMCPDiscovery.resolve(mcpCatalogFixture());
      pendingIngressRetry.resolve(retried);
      pendingIngressLedger.resolve({
        transitions: [ingressTransition(dead, 1, 'accepted')],complete: true,
      });
      pendingStart.resolve(started);
      pendingStop.resolve(stopped);
      pendingStopSet.resolve({
        anchorRunId: 'run-set-late',
        outcomes: [],
        receipt: {
          commandId: 'command-stop-set-late',requestId: 'request-stop-set-late',
          idempotencyKey: 'request-stop-set-late',actor: 'operator',risk: 'moderate',
          target: 'run-set-late',action: workflowRuntimeActions.stopSet,status: 'accepted',
          createdAt: timestamp,
        },
      });
      pendingDetailRun.resolve(detailRun);
      await Promise.all([
        refreshRequest,activationRequest,listenerRequest,mcpSaveRequest,mcpDeleteRequest,
        mcpDiscoveryRequest,ingressRetryRequest,ingressLedgerRequest,startRequest,stopRequest,
        stopSetRequest,detailRequest,
      ]);
    });
    await waitFor(() => expect(result.current.catalogLoading).toBe(false));
    await waitFor(() => expect(result.current.activationsLoading).toBe(false));

    expect(result.current.targetId).toBe('local');
    expect(result.current.catalog).toEqual([catalogEntry]);
    expect(result.current.selected).toBeNull();
    expect(result.current.activations).toEqual({});
    expect(result.current.activationCredentials).toEqual({});
    expect(result.current.testListeners).toEqual({});
    expect(result.current.mcpConnections).toEqual([]);
    expect(result.current.mcpCatalogs).toEqual({});
    expect(result.current.historyEntries).toEqual([]);
    expect(result.current.runDetailsById).toEqual({});
    expect(result.current.retryingIngressEventIds).toEqual([]);
    expect(result.current.ingressRetryErrors).toEqual({});
    expect(result.current.ingressTransitionLedgers).toEqual({});
    expect(result.current.error).toBe('');
    expect(getMCPCatalog).toHaveBeenCalledTimes(1);
    expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(1);
  });

  it('fences late mutation rejections and background runtime failures from an old target epoch', async () => {
    const dead = ingressHistoryEntry('dead_letter', { revision: 3,attemptCount: 1 });
    vi.mocked(listAutomationExecutionHistory).mockResolvedValueOnce({ entries: [dead],complete: true });
    const { result,rerender } = renderHook(
      ({ targetId }) => useAutomationWorkspace(targetId),
      { initialProps: { targetId: 'local' } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.activationsLoading).toBe(false));
    await act(async () => { await result.current.open('automation-a'); });

    const lateHistoryFailure = deferred<Awaited<ReturnType<typeof listAutomationExecutionHistory>>>();
    vi.mocked(startAutomationRun).mockResolvedValueOnce(runFixture({ id: 'run-before-switch' }));
    vi.mocked(listAutomationExecutionHistory).mockReturnValueOnce(lateHistoryFailure.promise);
    await act(async () => { await result.current.runDocument(documentFixture()); });

    const rejectedActivation = deferred<Awaited<ReturnType<typeof putAutomationActivation>>>();
    const rejectedMCPSave = deferred<Awaited<ReturnType<typeof putMCPConnection>>>();
    const rejectedIngressRetry = deferred<Awaited<ReturnType<typeof retryAutomationExecutionIngress>>>();
    const rejectedIngressLedger = deferred<Awaited<ReturnType<typeof listAutomationIngressTransitions>>>();
    const rejectedStart = deferred<Awaited<ReturnType<typeof startAutomationRun>>>();
    const rejectedDocument = deferred<AutomationDocument>();
    vi.mocked(putAutomationActivation).mockReturnValueOnce(rejectedActivation.promise);
    vi.mocked(putMCPConnection).mockReturnValueOnce(rejectedMCPSave.promise);
    vi.mocked(retryAutomationExecutionIngress).mockReturnValueOnce(rejectedIngressRetry.promise);
    vi.mocked(listAutomationIngressTransitions).mockReturnValueOnce(rejectedIngressLedger.promise);
    vi.mocked(startAutomationRun).mockReturnValueOnce(rejectedStart.promise);
    vi.mocked(getAutomationDocument).mockReturnValueOnce(rejectedDocument.promise);

    const connection = mcpConnectionFixture();
    let activationRequest!: ReturnType<typeof result.current.activate>;
    let mcpSaveRequest!: ReturnType<typeof result.current.saveMCPConnection>;
    let ingressRetryRequest!: ReturnType<typeof result.current.retryExecutionIngress>;
    let ingressLedgerRequest!: ReturnType<typeof result.current.loadIngressTransitions>;
    let startRequest!: ReturnType<typeof result.current.runDocument>;
    let selectionRequest!: ReturnType<typeof result.current.open>;
    act(() => {
      activationRequest = result.current.activate(documentFixture(), 'start');
      mcpSaveRequest = result.current.saveMCPConnection(connection.id, {
        name: connection.name,transport: connection.transport,endpoint: connection.endpoint,
        headerEnvironment: {},enabled: true,expectedRevision: 0,
      });
      ingressRetryRequest = result.current.retryExecutionIngress(dead.id);
      ingressLedgerRequest = result.current.loadIngressTransitions(dead.id);
      startRequest = result.current.runDocument(documentFixture());
      selectionRequest = result.current.open('missing');
    });
    rerender({ targetId: 'agent-b' });
    rerender({ targetId: 'local' });

    await act(async () => {
      lateHistoryFailure.reject(new Error('late background history failure'));
      rejectedActivation.reject(new Error('late activation failure'));
      rejectedMCPSave.reject(new Error('late MCP save failure'));
      rejectedIngressRetry.reject(new Error('late ingress retry failure'));
      rejectedIngressLedger.reject(new Error('late ingress ledger failure'));
      rejectedStart.reject(new Error('late run start failure'));
      rejectedDocument.reject(new Error('late selection failure'));
      await Promise.allSettled([
        activationRequest,mcpSaveRequest,ingressRetryRequest,ingressLedgerRequest,
        startRequest,selectionRequest,lateHistoryFailure.promise,
      ]);
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.activationsLoading).toBe(false));

    expect(result.current.targetId).toBe('local');
    expect(result.current.selected).toBeNull();
    expect(result.current.selectionError).toBe('');
    expect(result.current.selectionLoading).toBe(false);
    expect(result.current.activations).toEqual({});
    expect(result.current.activationCredentials).toEqual({});
    expect(result.current.activationsError).toBe('');
    expect(result.current.mcpConnections).toEqual([]);
    expect(result.current.historyEntries).toEqual([]);
    expect(result.current.runDetailsById).toEqual({});
    expect(result.current.retryingIngressEventIds).toEqual([]);
    expect(result.current.ingressRetryErrors).toEqual({});
    expect(result.current.ingressTransitionLedgers).toEqual({});
    expect(result.current.error).toBe('');
  });

  it('indexes multiple activation rows for one resource without overwriting an entrypoint', async () => {
    const webhook = activationFixture({ entrypointNodeId: 'webhook-entry' });
    const schedule = activationFixture({
      entrypointNodeId: 'schedule-entry',triggerKind: 'trigger.schedule',scheduleId: 'schedule-entry',revision: 2,
    });
    vi.mocked(listAutomationActivations).mockResolvedValueOnce([webhook,schedule]);

    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.activations[automationTriggerStateKey('automation-a', 'webhook-entry')]).toEqual(webhook);
    expect(result.current.activations[automationTriggerStateKey('automation-a', 'schedule-entry')]).toEqual(schedule);
    expect(Object.values(result.current.activations)).toHaveLength(2);
  });

  it('owns MCP connection queries, catalog discovery, and mutations through the workspace runtime', async () => {
    const connection = mcpConnectionFixture();
    const catalog = mcpCatalogFixture();
    const updatedCatalog = { ...catalog,connectionRevision: 2,tools: [{ name: 'telemetry.updated' }] };
    vi.mocked(listMCPConnections).mockResolvedValueOnce([connection]);
    vi.mocked(getMCPCatalog).mockResolvedValueOnce(catalog).mockResolvedValueOnce(updatedCatalog);
    vi.mocked(putMCPConnection).mockResolvedValueOnce({ ...connection,name: 'Updated MCP',revision: 2 });
    vi.mocked(deleteMCPConnection).mockResolvedValueOnce({ id: connection.id });
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.refreshMCPConnections(); });
    expect(listMCPConnections).toHaveBeenCalledWith('local', { signal: undefined });
    expect(getMCPCatalog).toHaveBeenCalledWith('local', connection.id, { signal: undefined });
    expect(result.current.mcpConnections).toEqual([connection]);
    expect(result.current.mcpCatalogs[connection.id]).toEqual(catalog);

    await act(async () => {
      await result.current.saveMCPConnection(connection.id, {
        name: 'Updated MCP',transport: 'streamable-http',endpoint: connection.endpoint,
        headerEnvironment: {},enabled: true,expectedRevision: 1,
      });
    });
    expect(result.current.mcpConnections[0]).toMatchObject({ id: connection.id,name: 'Updated MCP',revision: 2 });
    expect(result.current.mcpCatalogs[connection.id]).toEqual(updatedCatalog);

    await act(async () => { await result.current.removeMCPConnection({ id: connection.id,revision: 2 }); });
    expect(deleteMCPConnection).toHaveBeenCalledWith('local', connection.id, 2);
    expect(result.current.mcpConnections).toEqual([]);
    expect(result.current.mcpCatalogs).toEqual({});
  });

  it('uses exact branch CAS and reloads authority on 409', async () => {
    const original = documentFixture();
    const latest = documentFixture({ commitId: 'commit-2',revision: 4 });
    vi.mocked(getAutomationDocument).mockResolvedValueOnce(original).mockResolvedValueOnce(latest);
    vi.mocked(commitAutomationDocument).mockRejectedValueOnce(new Error('409 Conflict: branch head revision conflict'));
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.open('automation-a'); });

    let conflict: unknown;
    const draft = structuredClone(original.spec);
    draft.metadata.description = 'Unsaved operator draft';
    await act(async () => {
      try {
        await result.current.commit(original, draft, 'Edit');
      } catch (cause) {
        conflict = cause;
      }
    });

    expect(commitAutomationDocument).toHaveBeenCalledWith('automation-a', 'main', expect.objectContaining({
      baseCommitId: 'commit-1',expectedBranchRevision: 2,expectedResourceRevision: 2,
    }));
    expect(getAutomationDocument).toHaveBeenNthCalledWith(1, 'automation-a');
    expect(getAutomationDocument).toHaveBeenNthCalledWith(2, 'automation-a');
    expect(conflict).toBeInstanceOf(AutomationCommitConflict);
    expect(result.current.selected?.branch.headCommitId).toBe('commit-2');
  });

  it('loads the production activation with the selected Automation', async () => {
    const document = documentFixture();
    const activation = activationFixture();
    vi.mocked(getAutomationDocument).mockResolvedValueOnce(document);
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.activationsLoading).toBe(false));
    vi.mocked(listAutomationActivations).mockResolvedValueOnce([activation]);

    await act(async () => { await result.current.open(document.head.resourceId); });

    expect(listAutomationActivations).toHaveBeenLastCalledWith('local', { signal: expect.any(AbortSignal) });
    expect(getAutomationActivation).not.toHaveBeenCalled();
    expect(result.current.activations[automationTriggerStateKey(document.head.resourceId, 'start')]).toEqual(activation);
  });

  it('opens a multi-trigger Automation through one target activation snapshot', async () => {
    const document = documentFixture();
    document.spec.nodes.push({ ...newAutomationNode('trigger.webhook'),id: 'webhook-entry' });
    const manual = activationFixture({ entrypointNodeId: 'start',triggerKind: 'trigger.manual' });
    const webhook = activationFixture({ entrypointNodeId: 'webhook-entry' });
    vi.mocked(getAutomationDocument).mockResolvedValueOnce(document);
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.activationsLoading).toBe(false));
    vi.mocked(listAutomationActivations).mockResolvedValueOnce([manual,webhook]);

    await act(async () => { await result.current.open(document.head.resourceId); });

    expect(listAutomationActivations).toHaveBeenCalledTimes(2);
    expect(getAutomationActivation).not.toHaveBeenCalled();
    expect(Object.values(result.current.activations)).toEqual(expect.arrayContaining([manual,webhook]));
  });

  it('activates the current commit with CAS and retains a production token only for its one response', async () => {
    const document = documentFixture();
    const first = activationFixture({ revision: 1 });
    const second = activationFixture({ revision: 2 });
    vi.mocked(putAutomationActivation)
      .mockResolvedValueOnce({ activation: first,credential: { publicId: 'public-a',token: 'secret-once' } })
      .mockResolvedValueOnce({ activation: second,credential: { publicId: 'public-a',token: '' } });
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.activate(document, 'start'); });
    expect(putAutomationActivation).toHaveBeenNthCalledWith(1, 'local', document.head.resourceId, {
      commitId: 'commit-1',entrypointNodeId: 'start',desiredState: 'active',expectedRevision: 0,
    });
    expect(result.current.activationCredentials[automationTriggerStateKey(document.head.resourceId, 'start')]).toEqual({
      resourceId: document.head.resourceId,entrypointNodeId: 'start',
      credential: { publicId: 'public-a',token: 'secret-once' },
    });

    await act(async () => { await result.current.activate(document, 'start'); });
    expect(putAutomationActivation).toHaveBeenNthCalledWith(2, 'local', document.head.resourceId, {
      commitId: 'commit-1',entrypointNodeId: 'start',desiredState: 'active',expectedRevision: 1,
    });
    expect(result.current.activationCredentials[automationTriggerStateKey(document.head.resourceId, 'start')]).toBeUndefined();
  });

  it('forgets the one-time production credential when its workspace closes', async () => {
    const document = documentFixture();
    vi.mocked(getAutomationDocument).mockResolvedValueOnce(document);
    vi.mocked(getAutomationActivation).mockResolvedValueOnce(undefined);
    vi.mocked(putAutomationActivation).mockResolvedValueOnce({
      activation: activationFixture(),credential: { publicId: 'public-a',token: 'secret-once' },
    });
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.open(document.head.resourceId); });
    await act(async () => { await result.current.activate(document, 'start'); });
    expect(result.current.activationCredentials[automationTriggerStateKey(document.head.resourceId, 'start')]?.credential.token).toBe('secret-once');

    act(() => result.current.close());

    expect(result.current.activationCredentials[automationTriggerStateKey(document.head.resourceId, 'start')]).toBeUndefined();
  });

  it('deactivates the pinned activation commit instead of a newer draft head', async () => {
    const document = documentFixture({ commitId: 'commit-2',revision: 3 });
    const active = activationFixture({ commitId: 'commit-1',revision: 7 });
    const inactive = activationFixture({ commitId: 'commit-1',revision: 8,desiredState: 'inactive',observedState: 'inactive' });
    vi.mocked(getAutomationDocument).mockResolvedValueOnce(document);
    vi.mocked(putAutomationActivation).mockResolvedValueOnce({ activation: inactive });
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.activationsLoading).toBe(false));
    vi.mocked(listAutomationActivations).mockResolvedValueOnce([active]);
    await act(async () => { await result.current.open(document.head.resourceId); });

    await act(async () => { await result.current.deactivate(document, 'start'); });

    expect(putAutomationActivation).toHaveBeenCalledWith('local', document.head.resourceId, {
      commitId: 'commit-1',entrypointNodeId: 'start',desiredState: 'inactive',expectedRevision: 7,
    });
    expect(result.current.activations[automationTriggerStateKey(document.head.resourceId, 'start')]).toEqual(inactive);
  });

  it('owns the test-listener credential through submit refresh and revision-based cancellation', async () => {
    const document = documentFixture();
    const listening = listenerFixture();
    const consumed = listenerFixture({ revision: 2,status: 'consumed' });
    const second = listenerFixture({ id: 'listener-b',publicId: 'test-public-b',revision: 1 });
    const cancelled = listenerFixture({ id: 'listener-b',publicId: 'test-public-b',revision: 2,status: 'cancelled' });
    vi.mocked(createAutomationTestListener)
      .mockResolvedValueOnce({ listener: listening,credential: { publicId: listening.publicId,token: 'test-token-a' } })
      .mockResolvedValueOnce({ listener: second,credential: { publicId: second.publicId,token: 'test-token-b' } });
    vi.mocked(submitAutomationTestEvent).mockResolvedValueOnce({ eventId: 'event-a',created: true });
    vi.mocked(getAutomationTestListener).mockResolvedValueOnce(consumed);
    vi.mocked(cancelAutomationTestListener).mockResolvedValueOnce(cancelled);
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.startTestListener(document, 'start', 90); });
    expect(createAutomationTestListener).toHaveBeenNthCalledWith(1, 'local', {
      resourceId: 'automation-a',commitId: 'commit-1',entrypointNodeId: 'start',ttlSeconds: 90,
    });
    await act(async () => { await result.current.submitTestEvent('automation-a', 'start', { message: 'hello' }); });
    expect(submitAutomationTestEvent).toHaveBeenCalledWith(
      listening.publicId,
      { publicId: listening.publicId,token: 'test-token-a' },
      { message: 'hello' },
    );
    expect(result.current.testListeners[automationTriggerStateKey('automation-a', 'start')]?.listener).toEqual(consumed);

    await act(async () => { await result.current.startTestListener(document, 'start'); });
    await act(async () => { await result.current.cancelTestListener('automation-a', 'start'); });
    expect(cancelAutomationTestListener).toHaveBeenCalledWith('local', second.id, second.revision);
    expect(result.current.testListeners[automationTriggerStateKey('automation-a', 'start')]?.listener).toEqual(cancelled);
  });

  it('keeps simultaneous test listeners for separate entrypoints on one Automation', async () => {
    const document = documentFixture();
    const webhook = listenerFixture({ id: 'listener-webhook',entrypointNodeId: 'webhook-entry',triggerKind: 'trigger.webhook' });
    const chat = listenerFixture({ id: 'listener-chat',entrypointNodeId: 'chat-entry',triggerKind: 'trigger.chat-message' });
    vi.mocked(createAutomationTestListener)
      .mockResolvedValueOnce({ listener: webhook,credential: { publicId: webhook.publicId,token: 'webhook-token' } })
      .mockResolvedValueOnce({ listener: chat,credential: { publicId: chat.publicId,token: 'chat-token' } });
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.startTestListener(document, 'webhook-entry');
      await result.current.startTestListener(document, 'chat-entry');
    });

    expect(result.current.testListeners[automationTriggerStateKey('automation-a', 'webhook-entry')]?.listener).toEqual(webhook);
    expect(result.current.testListeners[automationTriggerStateKey('automation-a', 'chat-entry')]?.listener).toEqual(chat);
    expect(Object.values(result.current.testListeners)).toHaveLength(2);
  });

  it('queues schedule Run once against the current committed head', async () => {
    const document = documentFixture({ commitId: 'commit-3',revision: 4 });
    vi.mocked(enqueueAutomationRunOnce).mockResolvedValueOnce({ eventId: 'event-run-once' });
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.runOnce(document, 'start'); });

    expect(enqueueAutomationRunOnce).toHaveBeenCalledWith('local', {
      resourceId: 'automation-a',commitId: 'commit-3',entrypointNodeId: 'start',
    });
  });

  it('clears activation and listener secrets when the execution target changes', async () => {
    const document = documentFixture();
    const listener = listenerFixture();
    vi.mocked(putAutomationActivation).mockResolvedValueOnce({
      activation: activationFixture(),credential: { publicId: 'public-a',token: 'production-secret' },
    });
    vi.mocked(createAutomationTestListener).mockResolvedValueOnce({
      listener,credential: { publicId: listener.publicId,token: 'listener-secret' },
    });
    const { result,rerender } = renderHook(
      ({ targetId }) => useAutomationWorkspace(targetId),
      { initialProps: { targetId: 'local' } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.activate(document, 'start');
      await result.current.startTestListener(document, 'start');
    });
    expect(result.current.activationCredentials[automationTriggerStateKey('automation-a', 'start')]?.credential.token).toBe('production-secret');
    expect(result.current.testListeners[automationTriggerStateKey('automation-a', 'start')]?.credential?.token).toBe('listener-secret');

    rerender({ targetId: 'agent-b' });

    await waitFor(() => expect(result.current.targetId).toBe('agent-b'));
    await waitFor(() => expect(result.current.activationCredentials).toEqual({}));
    expect(result.current.activations).toEqual({});
    expect(result.current.testListeners).toEqual({});
  });

  it('starts a document through its ConfigRef instead of a definition ID/version', async () => {
    const run = runFixture();
    vi.mocked(startAutomationRun).mockResolvedValue(run);
    vi.mocked(listAutomationExecutionHistory).mockResolvedValue(historyPageFromRuns([run]));
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.runDocument(documentFixture(), { mission: 'survey' }); });

    expect(startAutomationRun).toHaveBeenCalledWith('local', {
      actionId: 'run',
      automationRef: { domain: 'automation',resourceId: 'automation-a',branch: 'main' },
      parameters: { mission: 'survey' },reason: 'Run Automation definition',
    });
    expect(result.current.runDetailsById[run.id]?.run).toEqual(run);
    expect(listAutomationExecutionHistory).toHaveBeenCalledWith('local', {
      automationResourceId: run.automationResourceId,limit: 25,signal: expect.any(AbortSignal),
    });
    await waitFor(() => expect(result.current.historyEntries[0]?.run).toMatchObject({ id: run.id,revision: run.revision }));
  });

  it('forwards the selected public Action for an exact durable invocation', async () => {
    const run = runFixture();
    vi.mocked(startAutomationRun).mockResolvedValue(run);
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.runDocument(
        documentFixture(),
        { mission: 'survey' },
        'Run selected entrypoint',
        'controller',
        'run-b',
      );
    });

    expect(startAutomationRun).toHaveBeenCalledWith('local', {
      actionId: 'run-b',
      automationRef: { domain: 'automation',resourceId: 'automation-a',branch: 'main' },
      parameters: { mission: 'survey' },reason: 'Run selected entrypoint',
      throughNodeId: 'controller',
    });
  });

  it('starts an Experiment-bound Automation without transferring lifecycle ownership', async () => {
    const run = runFixture({
      sourceKind: 'experiment',
      sourceRef: {
        domain: 'experiment',resourceId: 'experiment-a',branch: 'main',commitId: 'experiment-commit',version: 1,digest: 'e'.repeat(64),
      },
    });
    vi.mocked(startAutomationRun).mockResolvedValue(run);
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.runBoundAutomation(
        { domain: 'automation',resourceId: 'automation-a',branch: 'main' },
        { mission: 'survey' },
        'Run Experiment configuration',
        '',
        'run',
      );
    });

    expect(startAutomationRun).toHaveBeenCalledWith('local', {
      actionId: 'run',
      automationRef: { domain: 'automation',resourceId: 'automation-a',branch: 'main' },
      parameters: { mission: 'survey' },reason: 'Run Experiment configuration',
    });
    expect(listAutomationExecutionHistory).toHaveBeenCalledWith('local', {
      automationResourceId: run.automationResourceId,limit: 25,signal: expect.any(AbortSignal),
    });
  });

  it('loads definition-scoped history beyond 1000 records without client-side eviction', async () => {
    const historical = completedRunFixtures();
    const older = Array.from({ length: 5 }, (_, index) => runFixture({
      id: `run-older-${index}`,status: 'succeeded',createdAt: `2026-07-13T00:00:0${index}Z`,
      startedAt: `2026-07-13T00:00:0${index}Z`,updatedAt: `2026-07-13T00:00:0${index}Z`,finishedAt: `2026-07-13T00:00:0${index}Z`,
    }));
    vi.mocked(listAutomationExecutionHistory)
      .mockResolvedValueOnce(historyPageFromRuns(historical, 'cursor-1'))
      .mockResolvedValueOnce(historyPageFromRuns(older));
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.open('automation-a'); });

    expect(result.current.historyEntries).toHaveLength(1_000);
    expect(result.current.hasMoreRuns).toBe(true);
    await act(async () => { await result.current.loadMoreRuns(); });

    expect(result.current.historyEntries).toHaveLength(1_005);
    expect(result.current.hasMoreRuns).toBe(false);
    expect(listAutomationExecutionHistory).toHaveBeenNthCalledWith(1, 'local', {
      automationResourceId: 'automation-a',limit: 25,signal: expect.any(AbortSignal),
    });
    expect(listAutomationExecutionHistory).toHaveBeenNthCalledWith(2, 'local', {
      automationResourceId: 'automation-a',cursor: 'cursor-1',limit: 25,
    });
  });

  it('does not let more than 1000 other workflows displace the selected workflow history', async () => {
    const wanted = runFixture({ id: 'wanted-run',definitionId: 'opaque-installed-definition' });
    const otherRuns = completedRunFixtures(1_001).map((run) => ({
      ...run,automationResourceId: 'another-workflow',definitionId: 'another-opaque-definition',
    }));
    vi.mocked(listAutomationExecutionHistory).mockImplementation(async (_targetId, options) => (
      historyPageFromRuns(options.automationResourceId === 'automation-a' ? [wanted] : otherRuns)
    ));

    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.open('automation-a'); });

    expect(result.current.historyEntries.map((entry) => entry.id)).toEqual([wanted.id]);
    expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(1);
    expect(listAutomationExecutionHistory).toHaveBeenCalledWith('local', {
      automationResourceId: 'automation-a',limit: 25,signal: expect.any(AbortSignal),
    });
  });

  it('retains a newly admitted active run in addition to a full terminal history page', async () => {
    const historical = completedRunFixtures();
    const active = runFixture({ id: 'run-active-new',status: 'accepted',startedAt: undefined });
    vi.mocked(listAutomationExecutionHistory)
      .mockResolvedValueOnce(historyPageFromRuns(historical))
      .mockResolvedValueOnce(historyPageFromRuns([active]));
    vi.mocked(startAutomationRun).mockResolvedValueOnce(active);
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.open('automation-a'); });
    await act(async () => { await result.current.runDocument(documentFixture()); });

    expect(result.current.historyEntries).toHaveLength(1_001);
    expect(result.current.runSummaries.some((run) => run.id === active.id)).toBe(true);
  });

  it('deduplicates overlapping keyset pages and preserves the loaded older-page cursor on first-page refresh', async () => {
    const newest = runFixture({ id: 'run-newest',createdAt: '2026-07-14T00:00:04Z' });
    const middle = runFixture({ id: 'run-middle',createdAt: '2026-07-14T00:00:03Z' });
    const older = runFixture({ id: 'run-older',createdAt: '2026-07-14T00:00:02Z' });
    const refreshed = runFixture({ id: 'run-refreshed',createdAt: '2026-07-14T00:00:05Z' });
    vi.mocked(listAutomationExecutionHistory)
      .mockResolvedValueOnce(historyPageFromRuns([newest,middle], 'cursor-1'))
      .mockResolvedValueOnce(historyPageFromRuns([middle,older], 'cursor-2'))
      .mockResolvedValueOnce(historyPageFromRuns([refreshed,newest], 'new-first-page-cursor'))
      .mockResolvedValueOnce(historyPageFromRuns([]));
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.open('automation-a'); });
    await act(async () => { await result.current.loadMoreRuns(); });
    expect(result.current.historyEntries.map((entry) => entry.id)).toEqual(['run-newest','run-middle','run-older']);

    await act(async () => { await result.current.refreshExecutionHistory(); });
    expect(result.current.historyEntries.map((entry) => entry.id)).toEqual([
      'run-refreshed','run-newest','run-middle','run-older',
    ]);
    await act(async () => { await result.current.loadMoreRuns(); });
    expect(listAutomationExecutionHistory).toHaveBeenLastCalledWith('local', {
      automationResourceId: 'automation-a',cursor: 'cursor-2',limit: 25,
    });
  });

  it('retries dead-letter ingress with exact CAS revision and updates the same history entry in place', async () => {
    const dead = ingressHistoryEntry('dead_letter', { revision: 7,attemptCount: 3 });
    const retried = { ...dead.ingress!,revision: 8,status: 'pending' as const };
    const retry = deferred<AutomationExecutionIngressAudit>();
    vi.mocked(listAutomationExecutionHistory)
      .mockResolvedValueOnce({ entries: [dead],complete: true })
      .mockResolvedValueOnce({ entries: [{ ...dead,ingress: retried }],complete: true });
    vi.mocked(retryAutomationExecutionIngress).mockReturnValueOnce(retry.promise);
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.open('automation-a'); });

    let retryPromise!: ReturnType<typeof result.current.retryExecutionIngress>;
    act(() => { retryPromise = result.current.retryExecutionIngress(dead.id); });
    expect(result.current.retryingIngressEventIds).toEqual([dead.ingress!.eventId]);
    expect(retryAutomationExecutionIngress).toHaveBeenCalledWith('local', dead.ingress!.eventId, 7);
    await act(async () => { retry.resolve(retried);await retryPromise; });

    expect(result.current.retryingIngressEventIds).toEqual([]);
    expect(result.current.historyEntries).toHaveLength(1);
    expect(result.current.historyEntries[0]).toMatchObject({ id: dead.id,phase: 'ingress',ingress: { revision: 8,status: 'pending' } });
  });

  it('loads and paginates the selected ingress transition ledger by append-only revision', async () => {
    const dead = ingressHistoryEntry('dead_letter', { revision: 3,attemptCount: 1 });
    vi.mocked(listAutomationExecutionHistory).mockResolvedValueOnce({ entries: [dead],complete: true });
    vi.mocked(listAutomationIngressTransitions)
      .mockResolvedValueOnce({
        transitions: [ingressTransition(dead, 1, 'accepted'),ingressTransition(dead, 2, 'claimed')],
        nextAfterRevision: 2,complete: true,
      })
      .mockResolvedValueOnce({
        transitions: [ingressTransition(dead, 3, 'dead_lettered')],complete: true,
      });
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.open('automation-a'); });

    const controller = new AbortController();
    await act(async () => { await result.current.loadIngressTransitions(dead.id, controller.signal); });
    expect(listAutomationIngressTransitions).toHaveBeenNthCalledWith(1, 'local', dead.runId, {
      automationResourceId: dead.automationResourceId,eventId: dead.ingress!.eventId,afterRevision: 0,signal: controller.signal,
    });
    expect(result.current.ingressTransitionLedgers[dead.id]).toMatchObject({
      eventId: dead.ingress!.eventId,nextAfterRevision: 2,loading: false,loadingMore: false,
      transitions: [{ revision: 1 },{ revision: 2 }],
    });

    await act(async () => { await result.current.loadMoreIngressTransitions(dead.id); });
    expect(listAutomationIngressTransitions).toHaveBeenNthCalledWith(2, 'local', dead.runId, {
      automationResourceId: dead.automationResourceId,eventId: dead.ingress!.eventId,afterRevision: 2,signal: undefined,
    });
    expect(result.current.ingressTransitionLedgers[dead.id].transitions.map((transition) => transition.revision))
      .toEqual([1,2,3]);
  });

  it('passes AbortSignal to an in-flight ingress transition read without recording an abort as ledger failure', async () => {
    const pending = ingressHistoryEntry('pending');
    vi.mocked(listAutomationExecutionHistory).mockResolvedValueOnce({ entries: [pending],complete: true });
    vi.mocked(listAutomationIngressTransitions).mockImplementationOnce((_targetId, _runId, options) => (
      new Promise((_, reject) => options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    ));
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.open('automation-a'); });
    const controller = new AbortController();
    let request!: ReturnType<typeof result.current.loadIngressTransitions>;
    act(() => { request = result.current.loadIngressTransitions(pending.id, controller.signal); });
    act(() => controller.abort());
    await act(async () => { await request.catch(() => undefined); });

    expect(result.current.ingressTransitionLedgers[pending.id]).toMatchObject({ loading: false,error: '' });
  });

  it('never GETs a Run while the same history identity upgrades from ingress to a Run summary', async () => {
    const pending = ingressHistoryEntry('pending');
    const run = runFixture({ id: pending.runId,status: 'running',createdAt: pending.acceptedAt });
    vi.mocked(listAutomationExecutionHistory)
      .mockResolvedValueOnce({ entries: [pending],complete: true })
      .mockResolvedValueOnce(historyPageFromRuns([run]));
    vi.mocked(getAutomationRun).mockResolvedValueOnce(run);
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.open('automation-a'); });

    act(() => executionEventListener?.(executionEvent({
      entityId:pending.runId,seq:2,payload:{ definitionId:'automation-a' },
    })));
    await waitFor(() => expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(2));
    expect(getAutomationRun).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.historyEntries[0]?.phase).toBe('run'));
    expect(result.current.historyEntries).toHaveLength(1);
  });

  it('refreshes visible history only when the browser page regains visibility and aborts that read on unmount', async () => {
    const originalVisibility = Object.getOwnPropertyDescriptor(globalThis.document, 'visibilityState');
    Object.defineProperty(globalThis.document, 'visibilityState', { configurable: true,value: 'hidden' });
    let visibilityRefreshSignal: AbortSignal | undefined;
    vi.mocked(listAutomationExecutionHistory)
      .mockResolvedValueOnce({ entries: [],complete: true })
      .mockImplementationOnce((_targetId, options) => {
        visibilityRefreshSignal = options.signal;
        return new Promise((_, reject) => options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      });
    const { result,unmount } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.open('automation-a'); });

    vi.useFakeTimers();
    try {
      act(() => result.current.setExecutionHistoryVisible('automation-a', true));
      await act(async () => { vi.advanceTimersByTime(6_000);await Promise.resolve(); });
      expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(1);

      Object.defineProperty(globalThis.document, 'visibilityState', { configurable: true,value: 'visible' });
      await act(async () => { globalThis.document.dispatchEvent(new Event('visibilitychange'));await Promise.resolve(); });
      expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(2);
      await act(async () => { vi.advanceTimersByTime(10_000);await Promise.resolve(); });
      expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(2);

      unmount();
      expect(visibilityRefreshSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
      if (originalVisibility) Object.defineProperty(globalThis.document, 'visibilityState', originalVisibility);
    }
  });

  it('fences late history from a previously opened resource', async () => {
    const firstDocument = deferred<AutomationDocument>();
    const firstHistory = deferred<ReturnType<typeof historyPageFromRuns>>();
    const secondRun = runFixture({ id: 'run-b',automationResourceId: 'automation-b',definitionId: 'automation-b' });
    vi.mocked(getAutomationDocument).mockImplementation((resourceId) => resourceId === 'automation-a'
      ? firstDocument.promise
      : Promise.resolve(documentFixture({ resourceId: 'automation-b' })));
    vi.mocked(listAutomationExecutionHistory).mockImplementation((_targetId, options) => options.automationResourceId === 'automation-a'
      ? firstHistory.promise
      : Promise.resolve(historyPageFromRuns([secondRun])));
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let firstOpen!: ReturnType<typeof result.current.open>;
    act(() => { firstOpen = result.current.open('automation-a'); });
    await act(async () => { await result.current.open('automation-b'); });
    firstDocument.resolve(documentFixture());
    firstHistory.resolve(historyPageFromRuns([runFixture({ id: 'run-a' })]));
    await act(async () => { await firstOpen; });

    expect(result.current.selected?.head.resourceId).toBe('automation-b');
    expect(result.current.historyEntries.map((entry) => entry.id)).toEqual(['run-b']);
  });

  it('opens the authoritative document when history and activation facts are unavailable', async () => {
    const document = documentFixture();
    vi.mocked(getAutomationDocument).mockResolvedValueOnce(document);
    vi.mocked(listAutomationExecutionHistory).mockRejectedValueOnce(new Error('history unavailable'));
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.activationsLoading).toBe(false));
    vi.mocked(listAutomationActivations).mockRejectedValueOnce(new Error('activation unavailable'));

    let opened: AutomationDocument | undefined;
    await act(async () => { opened = await result.current.open(document.head.resourceId); });

    expect(opened).toEqual(document);
    expect(result.current.selected).toEqual(document);
    expect(result.current.selectionError).toBe('');
    expect(result.current.historyError).toBe('history unavailable');
    expect(result.current.activationsError).toBe('activation unavailable');
    expect(result.current.error).toBe('');
  });

  it('does not restore a document response from the previous execution target', async () => {
    const staleDocument = deferred<AutomationDocument>();
    vi.mocked(getAutomationDocument).mockReturnValueOnce(staleDocument.promise);
    const { result,rerender } = renderHook(
      ({ targetId }) => useAutomationWorkspace(targetId),
      { initialProps: { targetId: 'local' } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    let staleOpen!: ReturnType<typeof result.current.open>;
    act(() => { staleOpen = result.current.open('automation-a'); });
    rerender({ targetId: 'agent-b' });
    staleDocument.resolve(documentFixture());
    await act(async () => { await staleOpen; });

    expect(result.current.targetId).toBe('agent-b');
    expect(result.current.selected).toBeNull();
    expect(listAutomationExecutionHistory).not.toHaveBeenCalled();
  });

  it('drops late activation facts after selecting a different document', async () => {
    const firstActivations = deferred<AutomationActivation[]>();
    const secondDocument = documentFixture({ resourceId: 'automation-b' });
    const secondActivation = activationFixture({ resourceId: 'automation-b' });
    vi.mocked(getAutomationDocument).mockImplementation((resourceId) => Promise.resolve(
      resourceId === 'automation-a' ? documentFixture() : secondDocument,
    ));
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.activationsLoading).toBe(false));
    vi.mocked(listAutomationActivations)
      .mockReturnValueOnce(firstActivations.promise)
      .mockResolvedValueOnce([secondActivation]);

    let firstOpen!: ReturnType<typeof result.current.open>;
    act(() => { firstOpen = result.current.open('automation-a'); });
    await waitFor(() => expect(result.current.selected?.head.resourceId).toBe('automation-a'));
    await act(async () => { await result.current.open('automation-b'); });

    firstActivations.resolve([activationFixture()]);
    await act(async () => { await firstOpen; });

    expect(result.current.selected?.head.resourceId).toBe('automation-b');
    expect(result.current.activations[automationTriggerStateKey('automation-a', 'start')]).toBeUndefined();
    expect(result.current.activations[automationTriggerStateKey('automation-b', 'start')]).toEqual(secondActivation);
  });

  it('rehydrates a Run summary from unified history after an execution event', async () => {
    const starting = runFixture({ status: 'accepted',startedAt: undefined });
    const active = runFixture({ status: 'running',revision: 2,updatedAt: '2026-07-14T00:00:01Z' });
    vi.mocked(listAutomationExecutionHistory)
      .mockResolvedValueOnce(historyPageFromRuns([starting]))
      .mockResolvedValueOnce(historyPageFromRuns([active]));
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.refreshExecutionHistory('automation-a'); });

    act(() => executionEventListener?.(executionEvent({
      type: workflowRuntimeEvents.runRunning,
      payload: { status: 'running',revision: 2 },
    })));

    await waitFor(() => expect(result.current.runSummaries[0]).toMatchObject({ id: active.id,status: 'running',revision: 2 }));
    expect(getAutomationRun).not.toHaveBeenCalled();
  });

  it('discovers different unknown Run events in one observed-history batch and ignores unrelated children', async () => {
    const discovered = runFixture({ id: 'run-external',status: 'running',revision: 2 });
    vi.mocked(listAutomationExecutionHistory)
      .mockResolvedValueOnce({ entries: [],complete: true })
      .mockResolvedValueOnce({ entries: [],complete: true })
      .mockResolvedValueOnce(historyPageFromRuns([discovered]))
      .mockResolvedValueOnce({ entries: [],complete: true });
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.refreshExecutionHistory('automation-a');
      await result.current.refreshExecutionHistory('automation-b');
    });

    act(() => {
      executionEventListener?.(executionEvent({
        entityId:discovered.id,seq:2,payload:{ definitionId:'automation-a' },
      }));
      for (let index = 0;index < 40;index += 1) {
        executionEventListener?.(executionEvent({
          entityId:`child-${index}`,seq:1,offset:index+3,
          payload:{ definitionId:'unobserved-child-automation' },
        }));
      }
    });

    await waitFor(() => expect(result.current.runSummaries).toContainEqual(
      expect.objectContaining({ id:discovered.id,status:'running',revision:2 }),
    ));
    expect(result.current.runSummaries.some((run) => run.id.startsWith('child-'))).toBe(false);
    expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(4);
    expect(createEventCoalescer).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    try {
      act(() => {
        for (let index = 0;index < 40;index += 1) {
          executionEventListener?.(executionEvent({
            entityId:`child-${index}`,seq:2,offset:index+50,
            payload:{ status:'waiting',revision:2 },
          }));
        }
      });
      await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    } finally {
      vi.useRealTimers();
    }
    expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(4);
  });

  it('inserts an unknown observed Run from lifecycle SSE without history reads and ignores an unobserved child', async () => {
    const observed=runFixture({ id:'run-sse-observed' });
    const child=runFixture({
      id:'run-sse-unobserved-child',automationResourceId:'child-automation',definitionId:'child-definition',
      sourceRef:{
        domain:'automation',resourceId:'child-automation',branch:'main',commitId:'child-commit',
        version:1,digest:'e'.repeat(64),
      },
      parentRunId:observed.id,rootRunId:observed.id,callNodeId:'call-child',depth:1,
    });
    const observedSummary=historyPageFromRuns([observed]).entries[0].run!;
    const childSummary=historyPageFromRuns([child]).entries[0].run!;
    const observedStorageSummary:AutomationExecutionRunSummary={ ...observedSummary };
    delete observedStorageSummary.sourceKind;
    delete observedStorageSummary.sourceRef;
    const childStorageSummary:AutomationExecutionRunSummary={ ...childSummary };
    delete childStorageSummary.sourceKind;
    delete childStorageSummary.sourceRef;
    const { result,unmount }=renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.refreshExecutionHistory('automation-a'); });
    expect(listAutomationExecutionHistory).toHaveBeenCalledOnce();

    vi.useFakeTimers();
    try {
      await act(async () => {
        executionEventListener?.(executionEvent({
          entityId:observed.id,seq:1,offset:1,payload:{ run:observedStorageSummary },
        }));
        await Promise.resolve();
      });
      expect(result.current.runSummaries).toEqual([{
        ...observedStorageSummary,
        acceptedAt:'2026-07-14T00:00:00.000000000Z',
        createdAt:'2026-07-14T00:00:00.000000000Z',
        startedAt:'2026-07-14T00:00:00.000000000Z',
        updatedAt:'2026-07-14T00:00:00.000000000Z',
      }]);

      // A transition event need not repeat definitionId at the payload root;
      // the complete Run summary still identifies an unobserved child exactly.
      act(() => executionEventListener?.(executionEvent({
        entityId:child.id,seq:1,offset:2,payload:{ run:childStorageSummary },
      })));
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });

      expect(result.current.runSummaries).toHaveLength(1);
      expect(result.current.runSummaries[0]).toMatchObject({
        id:observed.id,automationResourceId:'automation-a',definitionId:'automation-a',
        actionId:'run',configDigest:'a'.repeat(64),executionPlanDigest:'b'.repeat(64),
        registryDigest:'c'.repeat(64),status:'running',revision:1,
      });
      expect(listAutomationExecutionHistory).toHaveBeenCalledOnce();
      expect(createEventCoalescer).not.toHaveBeenCalled();
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it('retains History source enrichment when a known ordinary Run merges a storage lifecycle summary', async () => {
    const canonicalTimestamp='2026-07-14T00:00:00.000000000Z';
    const run=runFixture();
    const baseEntry=historyPageFromRuns([run]).entries[0];
    const currentSummary:AutomationExecutionRunSummary={
      ...baseEntry.run!,acceptedAt:canonicalTimestamp,createdAt:canonicalTimestamp,
      startedAt:canonicalTimestamp,updatedAt:canonicalTimestamp,
    };
    const currentEntry:AutomationExecutionHistoryEntry={
      ...baseEntry,acceptedAt:canonicalTimestamp,run:currentSummary,
    };
    vi.mocked(listAutomationExecutionHistory).mockResolvedValueOnce({
      entries:[currentEntry],complete:true,
    });
    const { result,unmount }=renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.refreshExecutionHistory('automation-a'); });

    const storageSummary:AutomationExecutionRunSummary={
      ...currentSummary,status:'waiting',revision:2,updatedAt:'2026-07-14T00:00:01Z',
    };
    delete storageSummary.sourceKind;
    delete storageSummary.sourceRef;
    vi.useFakeTimers();
    try {
      await act(async () => {
        executionEventListener?.(executionEvent({
          entityId:run.id,seq:1,offset:1,type:workflowRuntimeEvents.runWaiting,
          payload:{ run:storageSummary },createdAt:'2026-07-14T00:00:01Z',
        }));
        await Promise.resolve();
      });
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });

      expect(listAutomationExecutionHistory).toHaveBeenCalledOnce();
      expect(result.current.runSummaries[0]).toMatchObject({
        id:run.id,status:'waiting',revision:2,sourceKind:'automation',
        sourceRef:{ domain:'automation',resourceId:'automation-a' },
      });
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it('enriches an unknown System Experiment Runner once before direct lifecycle SSE merging', async () => {
    const canonicalTimestamp='2026-07-14T00:00:00.000000000Z';
    const run=runFixture({
      id:'run-external-system-experiment',
      automationResourceId:SYSTEM_EXPERIMENT_RUNNER_AUTOMATION_RESOURCE_ID,
      definitionId:'system-experiment-runner',actionId:'run',sourceKind:'experiment',
      sourceRef:{
        domain:'experiment',resourceId:'experiment-external',branch:'main',
        commitId:'experiment-commit',version:1,digest:'f'.repeat(64),
      },
    });
    const baseEntry=historyPageFromRuns([run]).entries[0];
    const enrichedSummary:AutomationExecutionRunSummary={
      ...baseEntry.run!,experimentSelector:{ runMode:'simulation' },
      acceptedAt:canonicalTimestamp,createdAt:canonicalTimestamp,
      startedAt:canonicalTimestamp,updatedAt:canonicalTimestamp,
    };
    const enrichedEntry:AutomationExecutionHistoryEntry={
      ...baseEntry,acceptedAt:canonicalTimestamp,run:enrichedSummary,
    };
    const storageSummary:AutomationExecutionRunSummary={ ...enrichedSummary };
    delete storageSummary.sourceKind;
    delete storageSummary.sourceRef;
    delete storageSummary.experimentSelector;
    let systemHistoryReads=0;
    vi.mocked(listAutomationExecutionHistory).mockImplementation((_targetId,options) => {
      if (options.automationResourceId!==SYSTEM_EXPERIMENT_RUNNER_AUTOMATION_RESOURCE_ID) {
        return Promise.resolve({ entries:[],complete:true });
      }
      systemHistoryReads+=1;
      return Promise.resolve(systemHistoryReads===1
        ? { entries:[],complete:true }
        : { entries:[enrichedEntry],complete:true });
    });
    const { result,unmount }=renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.refreshExecutionHistory(SYSTEM_EXPERIMENT_RUNNER_AUTOMATION_RESOURCE_ID);
      await result.current.refreshExecutionHistory('automation-a');
    });
    expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(2);

    vi.useFakeTimers();
    try {
      act(() => executionEventListener?.(executionEvent({
        entityId:run.id,seq:1,offset:1,payload:{ run:storageSummary },
      })));
      expect(result.current.runSummaries).toEqual([]);
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });

      expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(3);
      expect(systemHistoryReads).toBe(2);
      expect(listAutomationExecutionHistory).toHaveBeenLastCalledWith('local',{
        automationResourceId:SYSTEM_EXPERIMENT_RUNNER_AUTOMATION_RESOURCE_ID,limit:25,signal:expect.any(AbortSignal),
      });
      expect(result.current.runSummaries).toEqual([enrichedSummary]);

      const waitingStorageSummary:AutomationExecutionRunSummary={
        ...storageSummary,status:'waiting',revision:2,
        updatedAt:'2026-07-14T00:00:01Z',
      };
      await act(async () => {
        executionEventListener?.(executionEvent({
          entityId:run.id,seq:2,offset:2,type:workflowRuntimeEvents.runWaiting,
          payload:{ run:waitingStorageSummary },createdAt:'2026-07-14T00:00:01Z',
        }));
        await Promise.resolve();
      });
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });

      expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(3);
      expect(result.current.runSummaries[0]).toMatchObject({
        id:run.id,status:'waiting',revision:2,sourceKind:'experiment',
        sourceRef:{ domain:'experiment',resourceId:'experiment-external' },
        experimentSelector:{ runMode:'simulation' },
        updatedAt:'2026-07-14T00:00:01.000000000Z',
      });
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it('directly merges unknown System Experiment Runner children without History reads', async () => {
    const child=runFixture({
      id:'run-system-panel-child',
      automationResourceId:SYSTEM_EXPERIMENT_RUNNER_AUTOMATION_RESOURCE_ID,
      definitionId:'system-experiment-runner',actionId:'run-panel',
      parentRunId:'run-system-root',rootRunId:'run-system-root',callNodeId:'run-managed-panels',depth:1,
    });
    const runningStorageSummary:AutomationExecutionRunSummary={
      ...historyPageFromRuns([child]).entries[0].run!,
    };
    delete runningStorageSummary.sourceKind;
    delete runningStorageSummary.sourceRef;
    const { result,unmount }=renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.refreshExecutionHistory(SYSTEM_EXPERIMENT_RUNNER_AUTOMATION_RESOURCE_ID);
    });
    expect(listAutomationExecutionHistory).toHaveBeenCalledOnce();

    vi.useFakeTimers();
    try {
      await act(async () => {
        executionEventListener?.(executionEvent({
          entityId:child.id,seq:1,offset:1,payload:{ run:runningStorageSummary },
        }));
        executionEventListener?.(executionEvent({
          entityId:child.id,seq:2,offset:2,type:workflowRuntimeEvents.runWaiting,
          payload:{ run:{
            ...runningStorageSummary,status:'waiting',revision:2,updatedAt:'2026-07-14T00:00:01Z',
          } },createdAt:'2026-07-14T00:00:01Z',
        }));
        await Promise.resolve();
      });
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });

      expect(listAutomationExecutionHistory).toHaveBeenCalledOnce();
      expect(createEventCoalescer).not.toHaveBeenCalled();
      expect(result.current.runSummaries).toEqual([expect.objectContaining({
        id:child.id,automationResourceId:SYSTEM_EXPERIMENT_RUNNER_AUTOMATION_RESOURCE_ID,
        actionId:'run-panel',status:'waiting',revision:2,
        parentRunId:'run-system-root',rootRunId:'run-system-root',depth:1,
      })]);
      expect(result.current.runSummaries[0].sourceKind).toBeUndefined();
      expect(result.current.runSummaries[0].experimentSelector).toBeUndefined();
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it('defers replayed Run invalidations to one observed-history reconciliation without refreshing unrelated activations', async () => {
    const { result,rerender } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.refreshExecutionHistory('automation-a');
      await result.current.refreshExecutionHistory('automation-b');
    });
    executionStreamState = 'replaying';
    rerender();

    vi.useFakeTimers();
    try {
      act(() => {
        for (let index = 0;index < 80;index += 1) {
          executionEventListener?.(executionEvent({ entityId: `replayed-${index}`,seq: 1,offset: index + 1 }));
        }
        executionEventListener?.(executionEvent({
          entityId:'automation-a',seq:1,offset:81,
          type:workflowRuntimeEvents.definitionUpdated,payload:{ version:3,revision:5 },
        }));
      });
      await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    } finally {
      vi.useRealTimers();
    }
    expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(2);
    expect(listAutomationDocuments).toHaveBeenCalledOnce();
    expect(createEventCoalescer).not.toHaveBeenCalled();

    executionStreamState = 'connected';
    rerender();
    await waitFor(() => expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(listAutomationDocuments).toHaveBeenCalledTimes(2));
    expect(listAutomationActivations).toHaveBeenCalledOnce();
  });

  it('rejects a conflicting same-revision history refresh without crashing React or replacing the last good Run', async () => {
    const current = runFixture({ status: 'running',revision: 1 });
    const conflicting = runFixture({ status: 'waiting',revision: 1 });
    vi.mocked(listAutomationExecutionHistory)
      .mockResolvedValueOnce(historyPageFromRuns([current]))
      .mockResolvedValueOnce(historyPageFromRuns([conflicting]));
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.refreshExecutionHistory('automation-a'); });

    let failure: unknown;
    await act(async () => {
      try {
        await result.current.refreshExecutionHistory('automation-a');
      } catch (cause) {
        failure = cause;
      }
    });

    expect(failure).toEqual(expect.objectContaining({
      message: 'Automation execution Run revision 1 contains conflicting immutable facts.',
    }));
    expect(result.current.runSummaries).toEqual([expect.objectContaining({ id: current.id,status: 'running',revision: 1 })]);
  });

  it('merges lifecycle SSE directly and drops duplicate or out-of-order entity sequences', async () => {
    const run = runFixture();
    vi.mocked(listAutomationExecutionHistory).mockResolvedValue(historyPageFromRuns([run]));
    const { result,unmount } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.refreshExecutionHistory('automation-a'); });

    vi.useFakeTimers();
    try {
      act(() => executionEventListener?.(executionEvent({
        seq:7,offset:7,payload:{ status:'waiting',revision:2 },
      })));
      await act(async () => { vi.runAllTimers();await Promise.resolve(); });
      expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(1);
      expect(result.current.runSummaries[0]).toMatchObject({ status:'waiting',revision:2 });

      act(() => executionEventListener?.(executionEvent({
        seq:7,offset:8,payload:{ status:'failed',revision:3 },
      })));
      act(() => executionEventListener?.(executionEvent({
        seq:6,offset:9,payload:{ status:'failed',revision:3 },
      })));
      await act(async () => { vi.runAllTimers();await Promise.resolve(); });
      expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(1);
      expect(result.current.runSummaries[0]).toMatchObject({ status:'waiting',revision:2 });

      act(() => executionEventListener?.(executionEvent({
        seq:8,offset:10,type:workflowRuntimeEvents.runSucceeded,
        payload:{ status:'succeeded',revision:3 },
      })));
      await act(async () => { vi.runAllTimers();await Promise.resolve(); });
      expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(1);
      expect(result.current.runSummaries[0]).toMatchObject({ status:'succeeded',revision:3 });
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it('does not poll a waiting Run in connected or disconnected stream states and still reconciles its SSE event', async () => {
    const waiting = runFixture({ status: 'waiting' });
    const running = runFixture({
      status: 'running',revision: 2,updatedAt: '2026-07-14T00:00:02Z',
    });
    vi.mocked(listAutomationExecutionHistory)
      .mockResolvedValueOnce(historyPageFromRuns([waiting]))
      .mockResolvedValueOnce(historyPageFromRuns([running]));
    const { result,rerender,unmount } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.refreshExecutionHistory('automation-a'); });
    expect(result.current.runSummaries[0]).toMatchObject({ status: 'waiting',revision: 1 });

    vi.useFakeTimers();
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(1);

      executionStreamState = 'disconnected';
      rerender();
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(1);

      executionStreamState = 'connected';
      rerender();
      act(() => executionEventListener?.(executionEvent({
        seq: 2,type: workflowRuntimeEvents.runRunning,
        payload:{ status:'running',revision:2 },
      })));
      await act(async () => { await vi.advanceTimersByTimeAsync(40); });
      expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(1);
      expect(result.current.runSummaries[0]).toMatchObject({ status: 'running',revision: 2 });
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it('does not let an in-flight stale history read overwrite newer lifecycle SSE', async () => {
    const starting = runFixture({ status: 'accepted',startedAt: undefined });
    const firstRefresh = deferred<ReturnType<typeof historyPageFromRuns>>();
    vi.mocked(listAutomationExecutionHistory)
      .mockResolvedValueOnce(historyPageFromRuns([starting]))
      .mockReturnValueOnce(firstRefresh.promise);
    const { result,unmount } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.refreshExecutionHistory('automation-a'); });

    vi.useFakeTimers();
    try {
      let refresh!:ReturnType<typeof result.current.refreshExecutionHistory>;
      act(() => { refresh=result.current.refreshExecutionHistory('automation-a'); });
      expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(2);

      act(() => executionEventListener?.(executionEvent({
        seq:2,type:workflowRuntimeEvents.runRunning,payload:{ status:'running',revision:2 },
      })));
      act(() => executionEventListener?.(executionEvent({
        seq:3,type:workflowRuntimeEvents.runSucceeded,payload:{ status:'succeeded',revision:3 },
      })));
      expect(createEventCoalescer).not.toHaveBeenCalled();
      expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(2);
      expect(result.current.runSummaries[0]).toMatchObject({ status:'succeeded',revision:3 });

      await act(async () => { firstRefresh.resolve(historyPageFromRuns([starting]));await Promise.resolve(); });
      await act(async () => { await refresh; });
      expect(listAutomationExecutionHistory).toHaveBeenCalledTimes(2);
      expect(result.current.runSummaries[0]).toMatchObject({ status:'succeeded',revision:3 });
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it('coalesces Definition SSE into one authoritative catalog and open-document refresh', async () => {
    const initial = documentFixture();
    const updated = documentFixture({ commitId:'commit-2',revision:3 });
    const created = documentFixture({ resourceId:'automation-b' });
    updated.spec.metadata.name = 'Server update';
    vi.mocked(listAutomationDocuments).mockResolvedValueOnce([initial]);
    vi.mocked(getAutomationDocument).mockResolvedValueOnce(initial);
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.open('automation-a'); });
    expect(result.current.selected?.branch.headCommitId).toBe('commit-1');
    vi.mocked(listAutomationDocuments).mockResolvedValue([updated,created]);
    vi.mocked(getAutomationDocument).mockResolvedValue(updated);

    vi.useFakeTimers();
    try {
      act(() => {
        executionEventListener?.(executionEvent({
          entityId:'automation-a',seq:1,offset:1,
          type:workflowRuntimeEvents.definitionUpdated,payload:{ version:3,revision:5 },
        }));
        executionEventListener?.(executionEvent({
          entityId:'automation-b',seq:1,offset:2,
          type:workflowRuntimeEvents.definitionCreated,payload:{ version:1,revision:1 },
        }));
        executionEventListener?.(executionEvent({
          entityId:'automation-c',seq:1,offset:3,
          type:workflowRuntimeEvents.definitionDeleted,payload:{ revision:4 },
        }));
      });
      await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    } finally {
      vi.useRealTimers();
    }

    expect(listAutomationDocuments).toHaveBeenCalledTimes(2);
    expect(listAutomationNamespaces).toHaveBeenCalledTimes(2);
    expect(result.current.documents).toEqual([updated,created]);
    expect(result.current.selected?.branch.headCommitId).toBe('commit-2');
    expect(result.current.selected?.spec.metadata.name).toBe('Server update');
    expect(getAutomationRun).not.toHaveBeenCalled();
  });

  it('drops an open Automation only when an external Definition deletion is confirmed by its exact 404', async () => {
    const initial = documentFixture();
    vi.mocked(listAutomationDocuments).mockResolvedValueOnce([initial]);
    vi.mocked(getAutomationDocument).mockResolvedValueOnce(initial);
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.open('automation-a'); });
    vi.mocked(listAutomationDocuments).mockResolvedValue([]);
    vi.mocked(getAutomationDocument).mockRejectedValueOnce(new HTTPError(404,'Not Found'));

    vi.useFakeTimers();
    try {
      act(() => executionEventListener?.(executionEvent({
        entityId:'automation-a',type:workflowRuntimeEvents.definitionDeleted,
        payload:{ revision:3 },
      })));
      await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    } finally {
      vi.useRealTimers();
    }

    expect(result.current.documents).toEqual([]);
    expect(result.current.selected).toBeNull();
    expect(result.current.selectionNotFound).toBe(true);
  });

  it('refreshes Definition truth once when the execution stream identity changes', async () => {
    const updated = documentFixture({ commitId:'commit-2',revision:3 });
    vi.mocked(listAutomationDocuments)
      .mockResolvedValueOnce([documentFixture()])
      .mockResolvedValueOnce([updated]);
    const { result,rerender } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    executionStreamId = 'stream-2';
    rerender();

    await waitFor(() => expect(listAutomationDocuments).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.documents).toEqual([updated]));
  });

  it('refreshes an already-loaded run detail from occurrences after an event', async () => {
    const run = runFixture();
    const updatedRun = runFixture({ status: 'stopping',revision: 2,updatedAt: '2026-07-14T00:00:02Z' });
    const initialNode = nodeSummaryFixture();
    const updatedNode = nodeSummaryFixture({ status: 'succeeded',revision: 2,finishedAt: '2026-07-14T00:00:02Z' });
    const initialInvocation = nodeInvocationFixture(initialNode);
    const updatedInvocation = nodeInvocationFixture(updatedNode, { status: 'succeeded',revision: 2,finishedAt: '2026-07-14T00:00:02Z' });
    vi.mocked(getAutomationRun).mockResolvedValueOnce(run);
    vi.mocked(listAutomationNodeInvocations).mockResolvedValueOnce([initialInvocation]);
    vi.mocked(listAutomationNodeExecutionSummaries).mockResolvedValueOnce([initialNode]);
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.loadRunDetail(run.id); });
    expect(result.current.runDetailsById[run.id]).toMatchObject({
      invocations: [initialInvocation],nodeSummaries: [initialNode],loading: false,
    });

    vi.mocked(getAutomationRun).mockResolvedValueOnce(updatedRun);
    vi.mocked(listAutomationNodeInvocations).mockResolvedValueOnce([updatedInvocation]);
    vi.mocked(listAutomationNodeExecutionSummaries).mockResolvedValueOnce([updatedNode]);
    act(() => executionEventListener?.(executionEvent({
      type: workflowRuntimeEvents.invocationSucceeded,
      payload: { nodeId: updatedNode.nodeId,status: updatedNode.status,revision: updatedNode.revision },
    })));

    await waitFor(() => expect(result.current.runDetailsById[run.id]).toMatchObject({
      invocations: [updatedInvocation],nodeSummaries: [updatedNode],loading: false,error: '',
    }));
    expect(result.current.runDetailsById[run.id].run).toEqual(updatedRun);
    expect(listAutomationNodeInvocations).toHaveBeenCalledTimes(2);
    expect(listAutomationNodeExecutionSummaries).toHaveBeenCalledTimes(2);
    expect(getAutomationRunSnapshot).toHaveBeenCalledTimes(1);
  });

  it('refreshes an observed detail after lifecycle facts arrive without reloading catalog history',async () => {
    const running=runFixture({ status:'running',revision:1 });
    const waiting=runFixture({ status:'waiting',revision:2 });
    const node=nodeSummaryFixture({ status:'waiting',revision:2 });
    vi.mocked(getAutomationRun).mockResolvedValueOnce(running).mockResolvedValue(waiting);
    const { result }=renderHook(() => useAutomationWorkspace('local'));
    await act(async () => { await result.current.loadRunDetail(running.id); });
    vi.mocked(listAutomationNodeExecutionSummaries).mockResolvedValue([node]);
    act(() => executionEventListener?.(executionEvent({
      seq:2,type:workflowRuntimeEvents.runWaiting,payload:{ status:'waiting',revision:2 },
    })));
    expect(result.current.runDetailsById[running.id].run).toMatchObject({ status:'waiting',revision:2 });
    await waitFor(() => expect(result.current.runDetailsById[running.id].nodeSummaries).toEqual([node]));
    expect(getAutomationExecutionRelations).toHaveBeenCalledTimes(2);
    expect(listAutomationExecutionHistory).not.toHaveBeenCalled();
  });

  it('keeps invalidations received during a detail bundle and never regresses newer SSE run facts',async () => {
    const running=runFixture({ status:'running',revision:1 });
    const waiting=runFixture({ status:'waiting',revision:2 });
    const staleRead=deferred<AutomationRun>();
    const trailingRead=deferred<AutomationRun>();
    const finalNode=nodeSummaryFixture({ status:'waiting',revision:2 });
    vi.mocked(getAutomationRun).mockResolvedValueOnce(running)
      .mockReturnValueOnce(staleRead.promise).mockReturnValueOnce(trailingRead.promise)
      .mockResolvedValue(waiting);
    const { result,unmount }=renderHook(() => useAutomationWorkspace('local'));
    await act(async () => { await result.current.loadRunDetail(running.id); });
    vi.useFakeTimers();
    try {
      let initialRefresh!:ReturnType<typeof result.current.loadRunDetail>;
      act(() => { initialRefresh=result.current.loadRunDetail(running.id); });
      expect(getAutomationRun).toHaveBeenCalledTimes(2);
      act(() => executionEventListener?.(executionEvent({
        seq:2,type:workflowRuntimeEvents.invocationWaiting,payload:{ nodeId:'start' },
      })));
      await act(async () => { await vi.advanceTimersByTimeAsync(40); });
      expect(getAutomationRun).toHaveBeenCalledTimes(2);
      act(() => executionEventListener?.(executionEvent({
        seq:3,type:workflowRuntimeEvents.runWaiting,payload:{ status:'waiting',revision:2 },
      })));
      expect(result.current.runDetailsById[running.id].run?.revision).toBe(2);
      vi.mocked(listAutomationNodeExecutionSummaries).mockResolvedValue([finalNode]);
      await act(async () => { staleRead.resolve(running);await initialRefresh; });
      expect(result.current.runDetailsById[running.id].run?.revision).toBe(2);
      expect(getAutomationRun).toHaveBeenCalledTimes(3);
      act(() => executionEventListener?.(executionEvent({
        seq:4,type:workflowRuntimeEvents.invocationSucceeded,payload:{ nodeId:'start' },
      })));
      await act(async () => { await vi.advanceTimersByTimeAsync(40); });
      expect(getAutomationRun).toHaveBeenCalledTimes(3);
      await act(async () => { trailingRead.resolve(waiting);await Promise.resolve(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(40); });
      expect(result.current.runDetailsById[running.id]).toMatchObject({
        run:{ status:'waiting',revision:2 },nodeSummaries:[finalNode],loading:false,
      });
      const settledReads=vi.mocked(getAutomationRun).mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(getAutomationRun).toHaveBeenCalledTimes(settledReads);
      expect(settledReads).toBe(4);
      expect(listAutomationExecutionHistory).not.toHaveBeenCalled();
    } finally { unmount();vi.useRealTimers(); }
  });

  it('does not let a stale detail response regress occurrence or relation revisions', async () => {
    const run = runFixture();
    const currentNode = nodeSummaryFixture({ status: 'succeeded',revision: 3,finishedAt: '2026-07-14T00:00:03Z' });
    const staleNode = nodeSummaryFixture({ status: 'running',revision: 2 });
    const currentInvocation = nodeInvocationFixture(currentNode, {
      status: 'succeeded',revision: 3,finishedAt: '2026-07-14T00:00:03Z',
    });
    const staleInvocation = nodeInvocationFixture(staleNode, { status: 'running',revision: 2 });
    const currentWait = waitRelation(currentInvocation, { state: 'resumed',revision: 3,reason: 'runtime ready' });
    const staleWait = waitRelation(staleInvocation, { state: 'pending',revision: 2,reason: 'waiting for readiness' });
    vi.mocked(getAutomationRun).mockResolvedValue(run);
    vi.mocked(listAutomationNodeInvocations)
      .mockResolvedValueOnce([currentInvocation])
      .mockResolvedValueOnce([staleInvocation]);
    vi.mocked(listAutomationNodeExecutionSummaries)
      .mockResolvedValueOnce([currentNode])
      .mockResolvedValueOnce([staleNode]);
    vi.mocked(getAutomationExecutionRelations)
      .mockResolvedValueOnce({ ...emptyRelations(),waits: [currentWait] })
      .mockResolvedValueOnce({ ...emptyRelations(),waits: [staleWait] });
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.loadRunDetail(run.id); });
    await act(async () => { await result.current.loadRunDetail(run.id); });

    expect(result.current.runDetailsById[run.id]).toMatchObject({
      invocations: [currentInvocation],
      nodeSummaries: [currentNode],
      relations: { ...emptyRelations(),waits: [currentWait] },
      loading: false,
      error: '',
    });
  });

  it('coalesces three revision-keyed Panel hydration consumers into one detail bundle', async () => {
    const run = runFixture();
    const revisionTwo = runFixture({ revision:2,status:'waiting',updatedAt:'2026-07-14T00:00:02Z' });
    const node = nodeSummaryFixture();
    const invocation = nodeInvocationFixture(node);
    const firstRelations = deferred<AutomationExecutionRelations>();
    vi.mocked(getAutomationRun).mockResolvedValueOnce(run).mockResolvedValueOnce(revisionTwo);
    vi.mocked(listAutomationNodeInvocations).mockResolvedValue([invocation]);
    vi.mocked(listAutomationNodeExecutionSummaries).mockResolvedValue([node]);
    vi.mocked(getAutomationExecutionRelations)
      .mockReturnValueOnce(firstRelations.promise)
      .mockResolvedValueOnce(emptyRelations());
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let loads!: ReturnType<typeof result.current.loadRunDetail>[];
    act(() => {
      loads = [
        result.current.loadRunDetail(run.id,run.revision),
        result.current.loadRunDetail(run.id,run.revision),
        result.current.loadRunDetail(run.id,run.revision),
      ];
    });
    await waitFor(() => expect(getAutomationExecutionRelations).toHaveBeenCalledOnce());
    await act(async () => {
      firstRelations.resolve(emptyRelations());
      await Promise.all(loads);
    });
    expect(getAutomationRun).toHaveBeenCalledOnce();
    expect(listAutomationNodeInvocations).toHaveBeenCalledOnce();
    expect(listAutomationNodeExecutionSummaries).toHaveBeenCalledOnce();
    expect(getAutomationRunSnapshot).toHaveBeenCalledOnce();

    await act(async () => { await result.current.loadRunDetail(run.id,run.revision); });
    expect(getAutomationRun).toHaveBeenCalledOnce();

    await act(async () => { await result.current.loadRunDetail(run.id,revisionTwo.revision); });
    expect(getAutomationRun).toHaveBeenCalledTimes(2);
    expect(getAutomationExecutionRelations).toHaveBeenCalledTimes(2);
    expect(getAutomationRunSnapshot).toHaveBeenCalledOnce();
    expect(result.current.runDetailsById[run.id].run).toEqual(revisionTwo);
  });

  it('keeps ref-counted detail pins target-scoped and an old release cannot unpin the new scope',async () => {
    vi.mocked(getAutomationRun).mockImplementation(async (targetId,runId) => {
      const time=new Date(Date.UTC(2026,6,14,0,0,Number(runId.slice(-2)))).toISOString();
      return runFixture({
        id:runId,targetId,status:'succeeded',revision:1,
        createdAt:time,updatedAt:time,finishedAt:time,
      });
    });
    const { result,rerender }=renderHook(({ targetId }) => useAutomationWorkspace(targetId),{
      initialProps:{ targetId:'local' },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const releaseLocal=result.current.retainRunDetail('run-00');
    await act(async () => {
      await Promise.all(Array.from({ length:65 },(_,index) => (
        result.current.loadRunDetail(`run-${String(index).padStart(2,'0')}`)
      )));
    });
    expect(result.current.runDetailsById['run-00']).toBeDefined();

    rerender({ targetId:'agent/a' });
    await waitFor(() => expect(result.current.runDetailsById).toEqual({}));
    const releaseAgent=result.current.retainRunDetail('run-00');
    releaseLocal();
    await act(async () => {
      await Promise.all(Array.from({ length:65 },(_,index) => (
        result.current.loadRunDetail(`run-${String(index).padStart(2,'0')}`)
      )));
    });
    expect(result.current.runDetailsById['run-00']).toBeDefined();
    act(() => releaseAgent());
    expect(Object.keys(result.current.runDetailsById)).toHaveLength(64);
    expect(result.current.runDetailsById['run-00']).toBeUndefined();
  });

  it('keeps the last loaded occurrences and node summaries when a detail refresh fails', async () => {
    const run = runFixture();
    const node = nodeSummaryFixture();
    const invocation = nodeInvocationFixture(node);
    vi.mocked(getAutomationRun).mockResolvedValue(run);
    vi.mocked(listAutomationNodeInvocations)
      .mockResolvedValueOnce([invocation])
      .mockRejectedValueOnce(new Error('temporary occurrence read failure'));
    vi.mocked(listAutomationNodeExecutionSummaries).mockResolvedValue([node]);
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.loadRunDetail(run.id); });

    let refreshed: Awaited<ReturnType<typeof result.current.loadRunDetail>> | undefined;
    await act(async () => { refreshed = await result.current.loadRunDetail(run.id); });

    expect(refreshed).toEqual({
      run,
      invocations: [invocation],
      nodeSummaries: [node],
      relations: emptyRelations(),
      snapshot: runSnapshotFixture(),
      loading: false,
      error: 'temporary occurrence read failure',
    });
    expect(result.current.runDetailsById[run.id]).toEqual(refreshed);
  });

  it('loads a relation-linked Run by exact ID and merges it into the bounded Run cache', async () => {
    const parent = runFixture({ id: 'run-parent' });
    const child = runFixture({ id: 'run-child',parentRunId: parent.id,rootRunId: parent.id,revision: 2 });
    vi.mocked(getAutomationRun).mockResolvedValueOnce(child);
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let loaded: AutomationRun | undefined;
    await act(async () => { loaded = await result.current.loadRun(child.id); });

    expect(getAutomationRun).toHaveBeenCalledWith('local', child.id);
    expect(loaded).toEqual(child);
    expect(result.current.runDetailsById[child.id].run).toEqual(child);
  });

  it('refreshes a stale run revision and retries Stop with the authoritative fact', async () => {
    const stale = runFixture();
    const refreshed = runFixture({ revision: 2,updatedAt: '2026-07-14T00:00:01Z' });
    const stopping = runFixture({ status: 'stopping',revision: 3,updatedAt: '2026-07-14T00:00:02Z' });
    vi.mocked(getAutomationRun).mockResolvedValueOnce(refreshed);
    vi.mocked(stopAutomationRun)
      .mockRejectedValueOnce(new Error('409 Conflict: orchestration run revision conflict'))
      .mockResolvedValueOnce(stopping);
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let controlled: AutomationRun | undefined;
    await act(async () => { controlled = await result.current.stop(stale, 'Operator stop'); });

    expect(getAutomationRun).toHaveBeenCalledWith('local', stale.id);
    expect(stopAutomationRun).toHaveBeenNthCalledWith(1, 'local', stale, 'Operator stop');
    expect(stopAutomationRun).toHaveBeenNthCalledWith(2, 'local', refreshed, 'Operator stop');
    expect(controlled).toEqual(stopping);
  });

  it('submits one Core-owned run-set stop with a stable intent identity', async () => {
    const anchor = runFixture({ id: 'run-ros-control',revision: 7 });
    vi.mocked(stopAutomationRunSet).mockImplementationOnce(async (_targetId, anchorRunId, input) => ({
      anchorRunId,
      outcomes: [{ runId: 'run-roscore',priorStatus: 'running',accepted: true,alreadyTerminal: false,error: '' }],
      receipt: {
        commandId: 'command-stop-set',requestId: input.requestId,idempotencyKey: input.idempotencyKey,
        actor: 'operator',risk: 'moderate',target: anchorRunId,action: workflowRuntimeActions.stopSet,
        status: 'accepted',createdAt: '2026-07-21T00:00:00Z',
      },
    }));
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.stopRunSet(anchor, {
        includeAnchor: false,includeDetached: true,reason: 'Stop detached ROS services',
      });
    });

    expect(stopAutomationRunSet).toHaveBeenCalledTimes(1);
    const [targetId,anchorRunId,input] = vi.mocked(stopAutomationRunSet).mock.calls[0]!;
    expect(targetId).toBe('local');
    expect(anchorRunId).toBe(anchor.id);
    expect(input).toMatchObject({
      expectedRevision: 7,includeAnchor: false,includeDetached: true,reason: 'Stop detached ROS services',
    });
    expect(input.requestId).toBeTruthy();
    expect(input.idempotencyKey).toBe(input.requestId);
  });

  it('refreshes a stale run revision and retries stop-set with the authoritative fact', async () => {
    const stale = runFixture({ id: 'run-plan',revision: 2 });
    const refreshed = runFixture({ id: 'run-plan',revision: 3,updatedAt: '2026-07-14T00:00:01Z' });
    vi.mocked(getAutomationRun).mockResolvedValueOnce(refreshed);
    vi.mocked(stopAutomationRunSet)
      .mockRejectedValueOnce(new Error('409 Conflict: orchestration: revision conflict'))
      .mockImplementationOnce(async (_targetId, anchorRunId, input) => ({
        anchorRunId,
        outcomes: [{ runId: anchorRunId,priorStatus: 'waiting',accepted: true,alreadyTerminal: false,error: '' }],
        receipt: {
          commandId: 'command-stop-set-retry',requestId: input.requestId,idempotencyKey: input.idempotencyKey,
          actor: 'operator',risk: 'moderate',target: `orchestration-run:${anchorRunId}`,
          action: workflowRuntimeActions.stopSet,status: 'accepted',createdAt: '2026-07-21T00:00:00Z',
        },
      }));
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.stopRunSet(stale, {
        includeAnchor: true,includeDetached: false,reason: 'Stop Experiment Workflow and its owned workflow closure',
      });
    });

    expect(getAutomationRun).toHaveBeenCalledWith('local', stale.id);
    expect(stopAutomationRunSet).toHaveBeenCalledTimes(2);
    expect(vi.mocked(stopAutomationRunSet).mock.calls[0]![2]).toMatchObject({ expectedRevision: 2 });
    expect(vi.mocked(stopAutomationRunSet).mock.calls[1]![2]).toMatchObject({ expectedRevision: 3 });
  });

  it('bounds revision-conflict recovery at three Cancel action attempts', async () => {
    const stale = runFixture();
    const revisionTwo = runFixture({ revision: 2,updatedAt: '2026-07-14T00:00:01Z' });
    const revisionThree = runFixture({ revision: 3,updatedAt: '2026-07-14T00:00:02Z' });
    const conflict = new Error('409 Conflict: orchestration run revision conflict');
    vi.mocked(getAutomationRun).mockResolvedValueOnce(revisionTwo).mockResolvedValueOnce(revisionThree);
    vi.mocked(cancelAutomationRun).mockRejectedValue(conflict);
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let failure: unknown;
    await act(async () => {
      try {
        await result.current.cancel(stale, 'Operator cancel');
      } catch (cause) {
        failure = cause;
      }
    });

    expect(failure).toBe(conflict);
    expect(cancelAutomationRun).toHaveBeenCalledTimes(3);
    expect(vi.mocked(cancelAutomationRun).mock.calls.map(([,run]) => run.revision)).toEqual([1,2,3]);
    expect(getAutomationRun).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['stop','succeeded' as const],
    ['cancel','canceled' as const],
    ['stop','stopping' as const],
    ['cancel','stopping' as const],
  ])('returns and merges a refreshed %s run in %s without another action', async (action, status) => {
    const stale = runFixture();
    const latest = runFixture({ status,revision: 2,updatedAt: '2026-07-14T00:00:01Z' });
    const actionMock = action === 'stop' ? vi.mocked(stopAutomationRun) : vi.mocked(cancelAutomationRun);
    vi.mocked(getAutomationRun).mockResolvedValueOnce(latest);
    actionMock.mockRejectedValueOnce(new Error('409 Conflict: orchestration run revision conflict'));
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let controlled: AutomationRun | undefined;
    await act(async () => {
      controlled = action === 'stop'
        ? await result.current.stop(stale)
        : await result.current.cancel(stale);
    });

    expect(actionMock).toHaveBeenCalledTimes(1);
    expect(getAutomationRun).toHaveBeenCalledOnce();
    expect(controlled).toEqual(latest);
  });

  it('creates typed resources and namespaces', async () => {
    vi.mocked(createAutomationDocument).mockResolvedValue(documentFixture());
    vi.mocked(createAutomationNamespace).mockResolvedValue({
      domain: 'automation',namespaceId: 'missions',name: 'Missions',revision: 1,
      createdAt: timestamp,updatedAt: timestamp,
    });
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const spec = newAutomationSpec('Mission');
    await act(async () => {
      await result.current.create('missions', spec);
      await result.current.addNamespace('Missions');
      await result.current.refreshExecutionHistory();
    });
    expect(createAutomationDocument).toHaveBeenCalledWith(expect.objectContaining({
      namespaceId: 'missions',spec: expect.objectContaining({ metadata: expect.objectContaining({ name: 'Mission' }) }),
    }));
    expect(listAutomationExecutionHistory).toHaveBeenLastCalledWith('local', expect.objectContaining({
      automationResourceId: 'automation-a',
    }));
    expect(result.current.namespaces).toHaveLength(1);
  });

  it('duplicates a user workflow from its exact commit into the same folder with a unique copy name', async () => {
    const source = documentFixture();
    const existingCopy = documentFixture();
    existingCopy.head.resourceId = 'automation-copy-1';
    existingCopy.branch.resourceId = 'automation-copy-1';
    existingCopy.spec.metadata.name = 'Mission copy';
    const cloned = documentFixture();
    cloned.head.resourceId = 'automation-copy-2';
    cloned.branch.resourceId = 'automation-copy-2';
    cloned.spec.metadata.name = 'Mission copy 2';
    vi.mocked(listAutomationDocuments).mockResolvedValueOnce([source,existingCopy]);
    vi.mocked(duplicateAutomationDocument).mockResolvedValueOnce(cloned);
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.duplicate(source); });

    expect(duplicateAutomationDocument).toHaveBeenCalledWith('automation-a', expect.objectContaining({
      sourceCommitId: 'commit-1',targetNamespaceId: 'missions',name: 'Mission copy 2',expectedRevision: 2,
      reason: 'Duplicate Automation definition',requestId: expect.any(String),idempotencyKey: expect.any(String),
    }));
    expect(result.current.documents[0]).toEqual(cloned);
  });

  it('defaults a protected workflow duplicate to the user root', async () => {
    const source = documentFixture();
    source.head.system = true;
    vi.mocked(duplicateAutomationDocument).mockResolvedValueOnce(documentFixture());
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.duplicate(source); });

    expect(duplicateAutomationDocument).toHaveBeenCalledWith('automation-a', expect.objectContaining({
      targetNamespaceId: '',name: 'Mission copy',
    }));
  });

  it('preserves Chinese automation metadata and folder names outside ASCII mutation headers', async () => {
    vi.mocked(createAutomationDocument).mockResolvedValue(documentFixture());
    vi.mocked(createAutomationNamespace).mockResolvedValue({
      domain: 'automation',namespaceId: 'missions',name: '任务自动化',revision: 1,
      createdAt: timestamp,updatedAt: timestamp,
    });
    const { result } = renderHook(() => useAutomationWorkspace('local'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const spec = newAutomationSpec('自动起飞流程');
    spec.metadata.description = '中文自动化描述';
    spec.metadata.tags = ['起飞','安全检查'];

    await act(async () => {
      await result.current.create(undefined, spec);
      await result.current.addNamespace('任务自动化');
    });

    const input = vi.mocked(createAutomationDocument).mock.calls[0]?.[0];
    expect(input?.spec.metadata).toMatchObject({
      name: '自动起飞流程',description: '中文自动化描述',
    });
    expect(input?.spec.metadata.tags).toEqual(expect.arrayContaining(['起飞','安全检查']));
    expect(input?.spec.metadata.tags).toHaveLength(2);
    expect(input?.requestId).toMatch(/^[\x20-\x7e]+$/);
    expect(input?.requestId).not.toContain('自动起飞流程');
    expect(input?.idempotencyKey).toBe(input?.requestId);
    expect(createAutomationNamespace).toHaveBeenCalledWith(expect.objectContaining({
      name: '任务自动化',requestId: expect.stringMatching(/^[\x20-\x7e]+$/),
    }));
  });
});

const timestamp = '2026-07-14T00:00:00Z';
const catalogEntry = { kind: 'trigger.manual',typeVersion: 1,label: 'Manual trigger',category: 'Trigger',traits: automationCatalogTraits('trigger.manual'),parameterSchema: { type: 'object',properties: {} } };

function documentFixture(overrides: { commitId?: string;revision?: number;resourceId?: string } = {}): AutomationDocument {
  const commitId = overrides.commitId ?? 'commit-1';
  const revision = overrides.revision ?? 2;
  const resourceId = overrides.resourceId ?? 'automation-a';
  const spec = newAutomationSpec('Mission');
  spec.nodes = [newAutomationNode('trigger.manual')];
  spec.nodes[0].id = 'start';
  spec.actions[0].entryNodeId = 'start';
  return {
    head: {
      domain: 'automation',resourceId,namespaceId: 'missions',name: 'Mission',description: '',tags: [],
      mainCommitId: commitId,currentVersion: revision,digest: 'a'.repeat(64),revision,createdAt: timestamp,updatedAt: timestamp,
    },
    branch: {
      domain: 'automation',resourceId,name: 'main',headCommitId: commitId,headVersion: revision,
      revision,createdAt: timestamp,updatedAt: timestamp,
    },
    spec,
  };
}

function activationFixture(
  overrides: Partial<AutomationActivation> & { commitId?: string } = {},
): AutomationActivation {
  const { commitId = 'commit-1',...activationOverrides } = overrides;
  return {
    resourceId: 'automation-a',revision: 1,desiredState: 'active',observedState: 'active',
    pinnedRef: {
      domain: 'automation',resourceId: 'automation-a',branch: 'main',commitId,version: 2,digest: 'a'.repeat(64),
    },
    targetId: 'local',entrypointNodeId: 'start',triggerKind: 'trigger.webhook',triggerVersion: 1,
    publicId: 'public-a',requiredCapabilities: [],reachability: 'reachable',lastObservedAt: timestamp,createdAt: timestamp,updatedAt: timestamp,
    ...activationOverrides,
  };
}

function listenerFixture(overrides: Partial<AutomationTestListener> = {}): AutomationTestListener {
  return {
    id: 'listener-a',resourceId: 'automation-a',revision: 1,status: 'listening',
    pinnedRef: {
      domain: 'automation',resourceId: 'automation-a',branch: 'main',commitId: 'commit-1',version: 2,digest: 'a'.repeat(64),
    },
    targetId: 'local',entrypointNodeId: 'start',triggerKind: 'trigger.chat-message',triggerVersion: 1,
    oneShot: false,publicId: 'test-public-a',
    expiresAt: '2026-07-18T12:00:00Z',createdAt: timestamp,updatedAt: timestamp,
    ...overrides,
  };
}

function mcpConnectionFixture() {
  return {
    id: 'uav-local',name: 'UAV local MCP',transport: 'streamable-http' as const,
    endpoint: 'https://mcp.example.test/stream',headerEnvironment: {},enabled: true,revision: 1,
    createdAt: timestamp,updatedAt: timestamp,
  };
}

function mcpCatalogFixture() {
  return {
    connectionId: 'uav-local',connectionRevision: 1,tools: [{ name: 'telemetry.read' }],
    resources: [],resourceTemplates: [],prompts: [],digest: 'f'.repeat(64),observedAt: timestamp,
  };
}

function runFixture(overrides: Partial<AutomationRun> = {}): AutomationRun {
  return {
    id: 'run-1',targetId: 'local',automationResourceId: 'automation-a',definitionId: 'automation-a',definitionVersion: 2,actionId:'run',actionVersion:1,
    definitionDigest: 'd'.repeat(64),
    sourceKind: 'automation',sourceRef: { domain: 'automation',resourceId: 'automation-a',branch: 'main',commitId: 'commit-1',version: 2,digest: 'd'.repeat(64) },
    status: 'running',revision: 1,parameters: { mission: 'survey' },admissionMode: 'limited',admissionScope: 'root',
    admissionKey: 'definition:definition-a',admissionLimit: 1,admissionOnConflict: 'queue',
    createdAt: timestamp,startedAt: timestamp,updatedAt: timestamp,
    ...overrides,
    configDigest: overrides.configDigest ?? 'a'.repeat(64),executionPlanDigest: overrides.executionPlanDigest ?? 'b'.repeat(64),registryDigest: overrides.registryDigest ?? 'c'.repeat(64),
    acceptedAt: overrides.acceptedAt ?? timestamp,
    rootRunId: overrides.rootRunId ?? overrides.id ?? 'run-1',depth: overrides.depth ?? 0,
    correlationId: overrides.correlationId ?? overrides.rootRunId ?? overrides.id ?? 'run-1',
    executionModel: 'orchestration-occurrence-v1',
  };
}

function completedRunFixtures(count = 1_000) {
  const start = Date.parse(timestamp);
  return Array.from({ length: count }, (_, index) => {
    const updatedAt = new Date(start + (index + 1) * 1_000).toISOString();
    return runFixture({
      id: `run-history-${index}`,status: 'succeeded',createdAt: updatedAt,startedAt: updatedAt,updatedAt,finishedAt: updatedAt,
    });
  });
}

function historyPageFromRuns(runs: AutomationRun[], nextCursor?: string) {
  const entries: AutomationExecutionHistoryEntry[] = runs.map((run) => {
    const summary: AutomationExecutionRunSummary = {
      id: run.id,targetId: run.targetId,automationResourceId: run.automationResourceId,
      definitionId: run.definitionId,definitionVersion: run.definitionVersion,
      actionId:run.actionId,actionVersion:run.actionVersion,
      configDigest: run.configDigest,executionPlanDigest: run.executionPlanDigest,registryDigest: run.registryDigest,definitionDigest: run.definitionDigest,
      executionModel: run.executionModel,sourceKind: run.sourceKind,sourceRef: run.sourceRef,status: run.status,revision: run.revision,
      ...(run.parentRunId ? { parentRunId: run.parentRunId } : {}),...(run.rootRunId ? { rootRunId: run.rootRunId } : {}),
      ...(run.callNodeId ? { callNodeId: run.callNodeId } : {}),...(run.throughNodeId ? { throughNodeId: run.throughNodeId } : {}),
      ...(run.depth === undefined ? {} : { depth: run.depth }),admissionMode: run.admissionMode,admissionScope: run.admissionScope,
      ...(run.admissionLimit === undefined ? {} : { admissionLimit: run.admissionLimit }),
      ...(run.admissionOnConflict ? { admissionOnConflict: run.admissionOnConflict } : {}),
      ...(run.replacesRunId ? { replacesRunId: run.replacesRunId } : {}),
      ...(run.triggerInvocation ? { triggerInvocation: run.triggerInvocation } : {}),
      acceptedAt: run.createdAt,createdAt: run.createdAt,...(run.startedAt ? { startedAt: run.startedAt } : {}),
      updatedAt: run.updatedAt,...(run.finishedAt ? { finishedAt: run.finishedAt } : {}),
    };
    return { id: run.id,runId: run.id,targetId: run.targetId,automationResourceId: run.automationResourceId,acceptedAt: run.createdAt,phase: 'run',run: summary };
  });
  return { entries,complete: true,...(nextCursor ? { nextCursor } : {}) };
}

function ingressHistoryEntry(
  status: 'pending' | 'claimed' | 'dispatched' | 'dead_letter' | 'abandoned',
  overrides: Partial<AutomationExecutionIngressAudit> = {},
): AutomationExecutionHistoryEntry {
  const acceptedAt = '2026-07-14T00:00:00Z';
  const runId = overrides.runId ?? 'run-ingress';
  return {
    id: runId,runId,targetId: 'local',automationResourceId: 'automation-a',acceptedAt,phase: 'ingress',
    ingress: {
      eventId: 'event-ingress',revision: 1,sourceKind: 'webhook',entrypointNodeId: 'start',
      triggerKind: 'trigger.webhook',attemptCount: 0,occurredAt: acceptedAt,receivedAt: acceptedAt,runId,
      ...overrides,status,
    },
  };
}

function ingressTransition(
  entry: AutomationExecutionHistoryEntry,
  revision: number,
  kind: AutomationIngressTransition['kind'],
): AutomationIngressTransition {
  if (kind === 'accepted') {
    return {
      eventId: entry.ingress!.eventId,revision,kind,toStatus: 'pending',attemptCount: 0,
      actor: 'source_adapter',occurredAt: entry.acceptedAt,
    };
  }
  if (kind === 'claimed') {
    return {
      eventId: entry.ingress!.eventId,revision,kind,fromStatus: 'pending',toStatus: 'claimed',attemptCount: 1,
      actor: 'dispatcher',occurredAt: entry.acceptedAt,
    };
  }
  return {
    eventId: entry.ingress!.eventId,revision,kind,fromStatus: 'claimed',toStatus: 'dead_letter',attemptCount: 1,
    failureCode: 'dispatch_failed',actor: 'dispatcher',occurredAt: entry.acceptedAt,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((complete, fail) => { resolve = complete;reject = fail; });
  return { promise,resolve,reject };
}

function runSnapshotFixture(): AutomationRunSnapshot {
  const sourceRef = {
    domain: 'automation' as const,resourceId: 'automation-a',branch: 'main',commitId: 'commit-1',version: 2,digest: 'd'.repeat(64),
  };
  return {
    runId: 'run-1',targetId: 'local',sourceKind: 'automation',sourceRef,automationRef: sourceRef,
    assetContext: { schemaVersion: 1 },
    automationSpec: documentFixture().spec,definitionDigest: 'd'.repeat(64),digest: 'e'.repeat(64),createdAt: timestamp,
  };
}

function executionEvent(overrides: Partial<ExecutionEvent> = {}): ExecutionEvent {
  return {
    offset: 1,
    entityType: 'orchestration',
    entityId: 'run-1',
    seq: 1,
    type: workflowRuntimeEvents.runRunning,
    level: 'info',
    payload: {},
    createdAt: timestamp,
    ...overrides,
  };
}

function executionSnapshotFixture(targetId: string): ExecutionSnapshot {
  return {
    targetId,
    processDefinitions: [],
    processInstances: [],
    processInstancesTruncated: false,
    jobs: [],
    events: [],
    streamId: 'stream-1',
    lastOffset: 0,
    streamState: 'connected',
    loading: false,
    error: '',
  };
}

function emptyRelations(runId = 'run-1') {
  return { runId,childRuns: [],childRunGroups: [],childRunGroupMembers: [],waits: [],effects: [],runtimeGroups: [],runtimes: [],resources: [] };
}

function waitRelation(
  invocation: AutomationNodeInvocation,
  overrides: Partial<AutomationWaitRelation> = {},
): AutomationWaitRelation {
  return {
    id: 'wait-1',generation: 1,type: 'runtime',subjectId: 'process-1',runId: invocation.runId,
    invocationId: invocation.id,attemptId: invocation.attempts[0].id,state: 'pending',
    createdAt: invocation.createdAt,updatedAt: invocation.updatedAt,revision: 1,
    ...overrides,
  };
}

function nodeSummaryFixture(overrides: Partial<AutomationNodeExecutionSummary> = {}): AutomationNodeExecutionSummary {
  const status = overrides.status ?? 'running';
  const active = status === 'running' || status === 'waiting' || status === 'compensating';
  return {
    runId: 'run-1',
    nodeId: 'start',
    kind: 'trigger.manual',
    status,
    latestInvocationId: `${overrides.runId ?? 'run-1'}:${overrides.nodeId ?? 'start'}:invocation-1`,
    attemptCount: 1,
    occurrenceCount: 1,
    activeOccurrenceCount: active ? 1 : 0,
    completedOccurrenceCount: active || status === 'pending' ? 0 : 1,
    failedOccurrenceCount: status === 'failed' ? 1 : 0,
    updatedAt: timestamp,
    revision: 1,
    ...overrides,
  };
}

function nodeInvocationFixture(
  nodeSummary: AutomationNodeExecutionSummary,
  overrides: Partial<AutomationNodeInvocation> = {},
): AutomationNodeInvocation {
  const invocationId = `${nodeSummary.runId}:${nodeSummary.nodeId}:invocation-1`;
  const attemptId = `${invocationId}:attempt-1`;
  const status = nodeSummary.status === 'succeeded' ? 'succeeded' : 'running';
  return {
    id: invocationId,
    runId: nodeSummary.runId,
    nodeId: nodeSummary.nodeId,
    kind: nodeSummary.kind,
    status,
    compensationStatus: 'none',
    activeAttemptId: status === 'running' ? attemptId : undefined,
    createdAt: nodeSummary.startedAt ?? nodeSummary.updatedAt,
    updatedAt: nodeSummary.updatedAt,
    revision: nodeSummary.revision,
    attempts: [{
      id: attemptId,
      runId: nodeSummary.runId,
      invocationId,
      phase: 'execution',
      number: 1,
      status,
      createdAt: nodeSummary.startedAt ?? nodeSummary.updatedAt,
      ...(nodeSummary.startedAt ? { startedAt: nodeSummary.startedAt } : {}),
      ...(nodeSummary.finishedAt ? { finishedAt: nodeSummary.finishedAt } : {}),
      updatedAt: nodeSummary.updatedAt,
      revision: nodeSummary.revision,
    }],
    inputRefs: [],
    outputRefs: [],
    ...(nodeSummary.startedAt ? { startedAt: nodeSummary.startedAt } : {}),
    ...(nodeSummary.finishedAt ? { finishedAt: nodeSummary.finishedAt } : {}),
    ...overrides,
  };
}
