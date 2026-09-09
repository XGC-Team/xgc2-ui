// @vitest-environment jsdom

import { act,renderHook,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { AutomationDocument } from './automationDefinitionContracts';
import { listAutomationDocuments,listAutomationNamespaces } from './automationDocumentService';
import { newAutomationSpec } from './automationSpecModel';
import { useAutomationDefinitionsCatalog } from './useAutomationDefinitionsCatalog';

vi.mock('./automationDocumentService',() => ({
  listAutomationDocuments:vi.fn(),listAutomationNamespaces:vi.fn(),
}));

describe('Automation definition refresh ordering',() => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listAutomationNamespaces).mockResolvedValue([]);
  });

  it('publishes the initial snapshot before an invalidation read that later fails',async () => {
    const initial=deferred<AutomationDocument[]>();
    const invalidated=deferred<AutomationDocument[]>();
    const first=[documentFixture(1)];
    vi.mocked(listAutomationDocuments)
      .mockReturnValueOnce(initial.promise).mockReturnValueOnce(invalidated.promise);
    const { result }=renderHook(() => useAutomationDefinitionsCatalog());
    let refresh:Promise<AutomationDocument[] | undefined>;
    act(() => { refresh=result.current.refreshDefinitions(); });
    expect(listAutomationDocuments).toHaveBeenCalledTimes(1);

    await act(async () => { initial.resolve(first); });
    await waitFor(() => expect(listAutomationDocuments).toHaveBeenCalledTimes(2));
    expect(result.current.documents).toEqual(first);
    expect(result.current.documentsLoading).toBe(true);

    await act(async () => {
      invalidated.reject(new Error('request timeout after 8000ms: /automations'));
      await refresh;
    });
    expect(result.current.documents).toEqual(first);
    expect(result.current.documentsError).toContain('request timeout');
    expect(result.current.documentsLoading).toBe(false);
    expect(result.current.documentsLoaded).toBe(false);
  });

  it('coalesces concurrent invalidations and returns the subsequent successful snapshot to each caller',async () => {
    const initial=deferred<AutomationDocument[]>();
    const invalidated=deferred<AutomationDocument[]>();
    const updated=[documentFixture(2)];
    vi.mocked(listAutomationDocuments)
      .mockReturnValueOnce(initial.promise).mockReturnValueOnce(invalidated.promise);
    const { result }=renderHook(() => useAutomationDefinitionsCatalog());
    const refreshes:Promise<AutomationDocument[] | undefined>[]=[];
    act(() => {
      refreshes.push(result.current.refreshDefinitions(),result.current.refreshDefinitions());
    });
    expect(listAutomationDocuments).toHaveBeenCalledTimes(1);
    await act(async () => { initial.resolve([documentFixture(1)]); });
    await waitFor(() => expect(listAutomationDocuments).toHaveBeenCalledTimes(2));
    await act(async () => {
      invalidated.resolve(updated);
      expect(await Promise.all(refreshes)).toEqual([updated,updated]);
    });
    expect(result.current.documents).toEqual(updated);
    expect(result.current.documentsLoaded).toBe(true);
    expect(result.current.documentsError).toBe('');
    expect(listAutomationDocuments).toHaveBeenCalledTimes(2);
  });

  it('drops a cancelled queued caller without cancelling a live invalidation',async () => {
    const initial=deferred<AutomationDocument[]>();
    const updated=[documentFixture(2)];
    vi.mocked(listAutomationDocuments)
      .mockReturnValueOnce(initial.promise).mockResolvedValueOnce(updated);
    const { result }=renderHook(() => useAutomationDefinitionsCatalog());
    const controller=new AbortController();
    let cancelled:Promise<AutomationDocument[] | undefined>;
    let live:Promise<AutomationDocument[] | undefined>;
    act(() => {
      cancelled=result.current.refreshDefinitions(controller.signal);
      live=result.current.refreshDefinitions();
      controller.abort();
    });
    await act(async () => {
      initial.resolve([documentFixture(1)]);
      expect(await cancelled).toBeUndefined();
      expect(await live).toEqual(updated);
    });
    expect(listAutomationDocuments).toHaveBeenCalledTimes(2);
    expect(result.current.documents).toEqual(updated);
  });
});

function deferred<T>() {
  let resolve!:(value:T) => void;
  let reject!:(error:Error) => void;
  const promise=new Promise<T>((resolveValue,rejectValue) => {
    resolve=resolveValue;reject=rejectValue;
  });
  return { promise,resolve,reject };
}

function documentFixture(version:number):AutomationDocument {
  const time='2026-09-07T00:00:00Z';
  return {
    head:{
      domain:'automation',resourceId:'workflow-a',namespaceId:'',name:'Workflow',description:'',tags:[],
      mainCommitId:`commit-${version}`,currentVersion:version,digest:'a'.repeat(64),revision:version,
      createdAt:time,updatedAt:time,
    },
    branch:{
      domain:'automation',resourceId:'workflow-a',name:'main',headCommitId:`commit-${version}`,
      headVersion:version,revision:version,createdAt:time,updatedAt:time,
    },
    spec:newAutomationSpec('Workflow'),
  };
}
