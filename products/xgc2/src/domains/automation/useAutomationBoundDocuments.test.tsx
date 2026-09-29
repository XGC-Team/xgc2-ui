// @vitest-environment jsdom

import { act,renderHook,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { HTTPError } from '../../api/http';
import { workflowRuntimeEvents } from '../../shared/workflowRuntimeProtocol';
import { useExecutionEventChannel,type ExecutionEvent,type ExecutionStreamState } from '../execution/executionPublic';
import type * as AutomationDocumentServiceModule from './automationDocumentService';
import type * as ExecutionPublicModule from '../execution/executionPublic';
import type { ConfigRef } from '../../shared/configResource';
import type { AutomationDocument } from './automationDefinitionContracts';
import { getAutomationDocument } from './automationDocumentService';
import { newAutomationSpec } from './automationSpecModel';
import { useAutomationBoundDocuments } from './useAutomationBoundDocuments';

vi.mock('./automationDocumentService',async (importOriginal) => ({
  ...await importOriginal<typeof AutomationDocumentServiceModule>(),getAutomationDocument:vi.fn(),
}));
vi.mock('../execution/executionPublic',async (importOriginal) => ({
  ...await importOriginal<typeof ExecutionPublicModule>(),useExecutionEventChannel:vi.fn(),
}));
let listener:((event:ExecutionEvent) => void)|undefined;
let streamState:ExecutionStreamState='connected';
let streamId='stream-1';
const read=vi.mocked(getAutomationDocument);

describe('useAutomationBoundDocuments',() => {
  beforeEach(() => {
    read.mockReset();listener=undefined;streamState='connected';streamId='stream-1';
    vi.mocked(useExecutionEventChannel).mockImplementation((targetId,onEvent) => {
      expect(targetId).toBe('local');listener=onEvent;return { streamState,streamId,error:'' };
    });
  });

  it('recovers only missing exact bindings with two reads at most, sharing repeated Panel refs',async () => {
    const pending=new Map(['a','b','c'].map((id) => [id,deferred<AutomationDocument>()]));
    read.mockImplementation((id) => pending.get(id)!.promise);
    const refs=[ref('a'),ref('a'),ref('b','review'),ref('c'),ref('known')];
    const { result }=renderHook(() => useAutomationBoundDocuments({
      scopeKey:'experiment/target-a',refs,documents:[document('known')],
    }));
    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenNthCalledWith(2,'b',{ branch:'review',signal:expect.any(AbortSignal) });
    expect(result.current.map((item) => item.head.resourceId)).toEqual(['known']);
    await act(async () => { pending.get('a')!.resolve(document('a')); });
    expect(read).toHaveBeenCalledTimes(3);
    await act(async () => {
      pending.get('b')!.resolve(document('b','review'));
      pending.get('c')!.resolve(document('c'));
    });
    expect(result.current.map((item) => item.head.resourceId).sort()).toEqual(['a','b','c','known']);
  });

  it('aborts a previous target scope and rejects its late response even after returning to that target',async () => {
    const old=deferred<AutomationDocument>();
    const other=deferred<AutomationDocument>();
    const returned=deferred<AutomationDocument>();
    read.mockReturnValueOnce(old.promise).mockReturnValueOnce(other.promise).mockReturnValueOnce(returned.promise);
    const { result,rerender,unmount }=renderHook(({ scopeKey }) => useAutomationBoundDocuments({
      scopeKey,refs:[ref('a')],documents:[],
    }),{ initialProps:{ scopeKey:'target-a' } });
    const oldSignal=read.mock.calls[0][1]!.signal!;
    rerender({ scopeKey:'target-b' });
    expect(oldSignal.aborted).toBe(true);
    rerender({ scopeKey:'target-a' });
    await act(async () => old.resolve(document('a','main',9)));
    expect(result.current).toEqual([]);
    await act(async () => returned.resolve(document('a','main',2)));
    expect(result.current[0].branch.revision).toBe(2);
    unmount();
    expect(read.mock.calls[2][1]!.signal!.aborted).toBe(true);
  });

  it('preserves a newer observed catalog revision across an older exact response and incomplete catalog',async () => {
    const old=deferred<AutomationDocument>();
    read.mockReturnValue(old.promise);
    const { result,rerender }=renderHook(({ documents }) => useAutomationBoundDocuments({
      scopeKey:'scope',refs:[ref('a')],documents,
    }),{ initialProps:{ documents:[] as AutomationDocument[] } });
    const latest=document('a','main',5);
    rerender({ documents:[latest] });
    await act(async () => old.resolve(document('a','main',2)));
    expect(result.current[0]).toBe(latest);
    rerender({ documents:[] });
    expect(result.current[0]).toBe(latest);
    rerender({ documents:[document('a','main',1)] });
    expect(result.current[0]).toBe(latest);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('does not expose a response for the wrong resource or branch as a resolved schema',async () => {
    read.mockResolvedValueOnce(document('a','other')).mockResolvedValueOnce(document('wrong'));
    const { result }=renderHook(() => useAutomationBoundDocuments({
      scopeKey:'scope',refs:[ref('a'),ref('b')],documents:[],
    }));
    await act(async () => undefined);
    expect(result.current).toEqual([]);
  });

  it('retries failed reads on focus without re-reading retained schemas',async () => {
    read.mockRejectedValueOnce(new Error('request timeout')).mockResolvedValue(document('a'));
    const { result }=renderHook(() => useAutomationBoundDocuments({
      scopeKey:'scope',refs:[ref('a'),ref('b')],documents:[document('b')],
    }));
    await act(async () => undefined);
    expect(result.current.map((item) => item.head.resourceId)).toEqual(['b']);
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(read.mock.calls.map(([id]) => id)).toEqual(['a','a']);
    // Clicking back from an embedded viewer focuses the window again; retained
    // schemas follow definition events, so focus alone reads nothing more.
    for (let index=0;index<5;index+=1) {
      await act(async () => { window.dispatchEvent(new Event('focus')); });
    }
    expect(read).toHaveBeenCalledTimes(2);
    await act(async () => emit('b'));
    expect(read.mock.calls.map(([id]) => id)).toEqual(['a','a','b']);
  });

  it('retries a response for another resource on focus as a failed read',async () => {
    read.mockResolvedValueOnce(document('wrong')).mockResolvedValueOnce(document('a'));
    const { result }=renderHook(() => useAutomationBoundDocuments({
      scopeKey:'scope',refs:[ref('a')],documents:[],
    }));
    await act(async () => undefined);
    expect(result.current).toEqual([]);
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(result.current).toHaveLength(1));
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('parks missing reads while hidden, cancels pending reads on leave, and restores on return',async () => {
    const first=deferred<AutomationDocument>();
    read.mockReturnValueOnce(first.promise).mockResolvedValueOnce(document('a'));
    const { result,rerender }=renderHook(({ enabled }) => useAutomationBoundDocuments({
      scopeKey:'scope',refs:[ref('a')],documents:[],enabled,
    }),{ initialProps:{ enabled:false } });
    expect(read).not.toHaveBeenCalled();
    rerender({ enabled:true });
    expect(read).toHaveBeenCalledOnce();
    rerender({ enabled:false });
    expect(read.mock.calls[0][1]!.signal!.aborted).toBe(true);
    await act(async () => first.resolve(document('a','main',9)));
    expect(result.current).toEqual([]);
    rerender({ enabled:true });
    await waitFor(() => expect(result.current[0]?.branch.revision).toBe(1));
  });

  it('starts a new exact read when the visible binding changes branch',async () => {
    read.mockResolvedValueOnce(document('a')).mockResolvedValueOnce(document('a','review'));
    const { result,rerender }=renderHook(({ branch }) => useAutomationBoundDocuments({
      scopeKey:'scope',refs:[ref('a',branch)],documents:[],
    }),{ initialProps:{ branch:'main' } });
    await waitFor(() => expect(result.current[0]?.branch.name).toBe('main'));
    rerender({ branch:'review' });
    expect(result.current).toEqual([]);
    await waitFor(() => expect(result.current[0]?.branch.name).toBe('review'));
  });

  it('treats a missing catalog row as an invalidation and only exact 404 revokes its schema',async () => {
    const latest=document('a');
    read.mockRejectedValue(new HTTPError(404,'Not Found'));
    const { result,rerender }=renderHook(({ documents }) => useAutomationBoundDocuments({
      scopeKey:'scope',refs:[ref('a')],documents,
    }),{ initialProps:{ documents:[latest] } });
    expect(read).not.toHaveBeenCalled();
    rerender({ documents:[] });
    expect(result.current).toEqual([latest]);
    await waitFor(() => expect(result.current).toEqual([]));
    rerender({ documents:[latest] });
    expect(result.current).toEqual([]);
    await act(async () => undefined);
    expect(result.current).toEqual([]);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('retains known schema on transport failure and admits it again only after an exact success',async () => {
    const known=document('a');
    read.mockRejectedValueOnce(new Error('404 was mentioned in a transport failure'))
      .mockRejectedValueOnce(new HTTPError(404,'Not Found')).mockResolvedValueOnce(document('a','main',2));
    const { result }=renderHook(() => useAutomationBoundDocuments({ scopeKey:'scope',refs:[ref('a')],documents:[known] }));
    await act(async () => emit('a'));
    expect(result.current).toEqual([known]);
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(result.current).toEqual([]);
    await act(async () => emit('a',workflowRuntimeEvents.definitionCreated));
    expect(result.current[0]?.branch.revision).toBe(2);
  });

  it('coalesces invalidations during an old read into one fresh trailing read and rejects its stale 404',async () => {
    const old=deferred<AutomationDocument>();
    const fresh=deferred<AutomationDocument>();
    read.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const known=document('a');
    const { result }=renderHook(() => useAutomationBoundDocuments({ scopeKey:'scope',refs:[ref('a')],documents:[known] }));
    act(() => { for (let index=0;index<20;index+=1) emit('a'); });
    expect(read).toHaveBeenCalledOnce();
    await act(async () => old.reject(new HTTPError(404,'Not Found')));
    expect(result.current).toEqual([known]);
    expect(read).toHaveBeenCalledTimes(2);
    await act(async () => fresh.resolve(document('a','main',3)));
    expect(result.current[0]?.branch.revision).toBe(3);
  });

  it('revalidates catalog branch revisions and prevents an old exact read from replacing newer observations',async () => {
    const old=deferred<AutomationDocument>();
    const fresh=deferred<AutomationDocument>();
    read.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const { result,rerender }=renderHook(({ documents }) => useAutomationBoundDocuments({
      scopeKey:'scope',refs:[ref('a')],documents,
    }),{ initialProps:{ documents:[] as AutomationDocument[] } });
    const newer=document('a','main',5);
    rerender({ documents:[newer] });
    await act(async () => old.resolve(document('a','main',1)));
    expect(result.current[0]).toBe(newer);
    expect(read).toHaveBeenCalledTimes(2);
    await act(async () => fresh.resolve(document('a','main',6)));
    expect(result.current[0]?.branch.revision).toBe(6);
  });

  it('keeps two active reads across stream reset and lets queued bindings precede trailing reads',async () => {
    const pending=Array.from({ length:5 },() => deferred<AutomationDocument>());
    let started=0;
    read.mockImplementation(() => pending[started++].promise);
    const { rerender }=renderHook(() => useAutomationBoundDocuments({ scopeKey:'scope',refs:[ref('a'),ref('b'),ref('c')],documents:[] }));
    expect(read.mock.calls.map(([id]) => id)).toEqual(['a','b']);
    streamId='stream-2';rerender();
    expect(read).toHaveBeenCalledTimes(2);
    await act(async () => pending[0].resolve(document('a')));
    expect(read.mock.calls.map(([id]) => id)).toEqual(['a','b','c']);
    await act(async () => pending[1].resolve(document('b')));
    expect(read.mock.calls.map(([id]) => id)).toEqual(['a','b','c','a']);
    await act(async () => pending[2].resolve(document('c')));
    expect(read.mock.calls.map(([id]) => id)).toEqual(['a','b','c','a','b']);
    await act(async () => { pending[3].resolve(document('a'));pending[4].resolve(document('b')); });
  });

  it('defers repeated replay events to one boundary read of the bound resource only',async () => {
    read.mockResolvedValue(document('a','main',2));
    const { result,rerender }=renderHook(() => useAutomationBoundDocuments({ scopeKey:'scope',refs:[ref('a')],documents:[document('a')] }));
    streamState='replaying';rerender();
    act(() => { for (let index=0;index<80;index+=1) emit('a');emit('unbound'); });
    expect(read).not.toHaveBeenCalled();
    streamState='connected';rerender();
    await waitFor(() => expect(result.current[0]?.branch.revision).toBe(2));
    expect(read).toHaveBeenCalledOnce();
  });

  it.each([false,true])('joins an old read before replay recovery, without following cancelled work (park=%s)',async (park) => {
    const old=deferred<AutomationDocument>();
    read.mockReturnValueOnce(old.promise).mockResolvedValueOnce(document('a','main',2));
    const { result,rerender }=renderHook(({ enabled }) => useAutomationBoundDocuments({
      scopeKey:'scope',refs:[ref('a')],documents:[],enabled,
    }),{ initialProps:{ enabled:true } });
    streamState='replaying';rerender({ enabled:true });
    act(() => emit('a'));
    streamState='connected';rerender({ enabled:true });
    expect(read).toHaveBeenCalledOnce();
    if (park) rerender({ enabled:false });
    await act(async () => old.resolve(document('a','main',9)));
    expect(read).toHaveBeenCalledTimes(park ? 1 : 2);
    if (park) expect(result.current).toEqual([]);
    else expect(result.current[0]?.branch.revision).toBe(2);
  });


  it('revokes only the exact missing branch while keeping another branch of the same resource',async () => {
    const main=document('a');
    const review=document('a','review');
    read.mockImplementation((_id,options) => options?.branch==='review'
      ? Promise.reject(new HTTPError(404,'Not Found')) : Promise.resolve(main));
    const { result }=renderHook(() => useAutomationBoundDocuments({
      scopeKey:'scope',refs:[ref('a'),ref('a','review')],documents:[main,review],
    }));
    await act(async () => emit('a'));
    expect(result.current).toEqual([main]);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('parks browser-hidden reads and revalidates retained bindings after visibility returns',async () => {
    let state:DocumentVisibilityState='visible';
    const visibility=vi.spyOn(window.document,'visibilityState','get').mockImplementation(() => state);
    const old=deferred<AutomationDocument>();
    read.mockReturnValueOnce(old.promise).mockResolvedValueOnce(document('a','main',2));
    const { result,unmount }=renderHook(() => useAutomationBoundDocuments({ scopeKey:'scope',refs:[ref('a')],documents:[] }));
    try {
      act(() => { state='hidden';window.document.dispatchEvent(new Event('visibilitychange')); });
      expect(read.mock.calls[0][1]?.signal?.aborted).toBe(true);
      await act(async () => { emit('a');old.resolve(document('a','main',9)); });
      expect(read).toHaveBeenCalledOnce();
      expect(result.current).toEqual([]);
      await act(async () => { state='visible';window.document.dispatchEvent(new Event('visibilitychange')); });
      expect(read).toHaveBeenCalledTimes(2);
      expect(result.current[0]?.branch.revision).toBe(2);
    } finally { unmount();visibility.mockRestore(); }
  });

  it('does not let a second invalidation boundary join a trailing read that already started',async () => {
    const reads=Array.from({ length:3 },() => deferred<AutomationDocument>());
    let cursor=0;
    read.mockImplementation(() => reads[cursor++].promise);
    const { result }=renderHook(() => useAutomationBoundDocuments({ scopeKey:'scope',refs:[ref('a')],documents:[] }));
    act(() => emit('a'));
    await act(async () => reads[0].resolve(document('a','main',1)));
    expect(read).toHaveBeenCalledTimes(2);
    act(() => { for (let index=0;index<30;index+=1) emit('a'); });
    await act(async () => reads[1].resolve(document('a','main',2)));
    expect(result.current).toEqual([]);
    expect(read).toHaveBeenCalledTimes(3);
    await act(async () => reads[2].resolve(document('a','main',3)));
    expect(result.current[0]?.branch.revision).toBe(3);
  });


  it('does not resurrect a confirmed missing global schema when the consumer scope changes',async () => {
    const recovery=deferred<AutomationDocument>();
    read.mockRejectedValueOnce(new HTTPError(404,'Not Found')).mockReturnValueOnce(recovery.promise);
    const known=document('a');
    const { result,rerender }=renderHook(({ scopeKey }) => useAutomationBoundDocuments({
      scopeKey,refs:[ref('a')],documents:[known],
    }),{ initialProps:{ scopeKey:'experiment-a' } });
    await act(async () => emit('a'));
    expect(result.current).toEqual([]);
    rerender({ scopeKey:'experiment-b' });
    expect(result.current).toEqual([]);
    await act(async () => recovery.resolve(document('a','main',2)));
    expect(result.current[0]?.branch.revision).toBe(2);
  });


  it('revalidates bound schemas when a closure event identifies a digest instead of a resource',async () => {
    read.mockImplementation((id) => Promise.resolve(document(id,'main',2)));
    const { result }=renderHook(() => useAutomationBoundDocuments({
      scopeKey:'scope',refs:[ref('a'),ref('b')],documents:[document('a'),document('b')],
    }));
    await act(async () => emit('closure-digest',workflowRuntimeEvents.executionClosureInstalled));
    expect(read.mock.calls.map(([id]) => id)).toEqual(['a','b']);
    expect(result.current.map((value) => value.branch.revision)).toEqual([2,2]);
  });


  it('does not spend a missing-read slot on an already known branch of the same resource',async () => {
    const a=deferred<AutomationDocument>();
    const b=deferred<AutomationDocument>();
    read.mockImplementation((id) => id==='a' ? a.promise : b.promise);
    renderHook(() => useAutomationBoundDocuments({
      scopeKey:'scope',refs:[ref('a'),ref('a','review'),ref('b')],documents:[document('a','review')],
    }));
    expect(read.mock.calls.map(([id,options]) => [id,options?.branch])).toEqual([['a','main'],['b','main']]);
    await act(async () => { a.resolve(document('a'));b.resolve(document('b')); });
    expect(read).toHaveBeenCalledTimes(2);
  });

});

function ref(resourceId:string,branch='main'):ConfigRef { return { domain:'automation',resourceId,branch }; }
function document(resourceId:string,branch='main',revision=1):AutomationDocument {
  return {
    head:{ domain:'automation',resourceId,name:resourceId,tags:[],mainCommitId:`commit-${revision}`,
      currentVersion:revision,digest:'digest',revision,createdAt:'t',updatedAt:'t' },
    branch:{ domain:'automation',resourceId,name:branch,headCommitId:`commit-${revision}`,headVersion:revision,
      revision,createdAt:'t',updatedAt:'t' },
    spec:newAutomationSpec(resourceId),
  };
}
function deferred<T>() {
  let resolve!:(value:T) => void;
  let reject!:(cause:unknown) => void;
  const promise=new Promise<T>((done,fail) => { resolve=done;reject=fail; });
  return { promise,resolve,reject };
}

function emit(resourceId:string,type:string=workflowRuntimeEvents.definitionUpdated) {
  listener?.({ offset:1,entityType:'orchestration',entityId:resourceId,seq:1,type,level:'info',payload:{},createdAt:'t' });
}
