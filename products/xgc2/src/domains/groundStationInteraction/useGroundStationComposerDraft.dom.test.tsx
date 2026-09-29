// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GroundStationChatStore } from './GroundStationChatStore';
import { useGroundStationComposerDraft } from './useGroundStationComposerDraft';
import { groundStationComposerDraftKey } from './groundStationComposerDraft';

function wrapper({ children }: { children: ReactNode }) {
  return <GroundStationChatStore canonicalMessages={[]} optimisticMessages={[]} pendingDecisions={[]}>{children}</GroundStationChatStore>;
}
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('useGroundStationComposerDraft', () => {
  it('flushes beforeunload and restores text after a remount', () => {
    const first = renderHook(() => useGroundStationComposerDraft('exp', 'draft'), { wrapper });
    act(() => first.result.current.setText('survives refresh'));
    act(() => window.dispatchEvent(new Event('beforeunload')));
    first.unmount();
    const second = renderHook(() => useGroundStationComposerDraft('exp', 'draft'), { wrapper });
    expect(second.result.current.text).toBe('survives refresh');
  });
  it('flushes the outgoing key and isolates experiments and conversations', () => {
    const hook = renderHook(({ exp, id }) => useGroundStationComposerDraft(exp, id), { wrapper, initialProps: { exp: 'a', id: 'one' } });
    act(() => hook.result.current.setText('a-one'));
    hook.rerender({ exp: 'a', id: 'two' });
    expect(hook.result.current.text).toBe('');
    act(() => hook.result.current.setText('a-two'));
    hook.rerender({ exp: 'b', id: 'one' });
    expect(hook.result.current.text).toBe('');
    hook.rerender({ exp: 'a', id: 'one' });
    expect(hook.result.current.text).toBe('a-one');
  });
  it('clears only the successfully sent snapshot, never newer input', () => {
    const hook = renderHook(() => useGroundStationComposerDraft('exp', 'draft'), { wrapper });
    act(() => hook.result.current.setText('sent'));
    const sent = hook.result.current.snapshot;
    act(() => hook.result.current.setText('typed while sending'));
    act(() => { expect(hook.result.current.clearIfUnchanged(sent)).toBe(false); });
    expect(hook.result.current.text).toBe('typed while sending');
    const newer = hook.result.current.snapshot;
    act(() => { expect(hook.result.current.clearIfUnchanged(newer)).toBe(true); });
    act(() => vi.runAllTimers());
    expect(localStorage.getItem(groundStationComposerDraftKey('exp', 'draft'))).toBeNull();
  });
  it('an old send completion cannot clear the newly selected conversation', () => {
    const hook = renderHook(({ id }) => useGroundStationComposerDraft('exp', id), { wrapper, initialProps: { id: 'one' } });
    act(() => hook.result.current.setText('first'));
    const previous = hook.result.current;
    hook.rerender({ id: 'two' });
    act(() => hook.result.current.setText('second'));
    act(() => previous.clearIfUnchanged(previous.snapshot));
    expect(hook.result.current.text).toBe('second');
    expect(localStorage.getItem(groundStationComposerDraftKey('exp', 'one'))).toBeNull();
  });
  it('promotes a new-session draft and clears the actual destination only after acknowledgement', () => {
    const hook = renderHook(({ id }) => useGroundStationComposerDraft('exp', id), { wrapper, initialProps: { id: 'new:exp' } });
    act(() => hook.result.current.setText('queued text'));
    const sender = hook.result.current;
    act(() => sender.promoteTo('connected-session'));
    hook.rerender({ id: 'connected-session' });
    expect(hook.result.current.text).toBe('queued text');
    expect(localStorage.getItem(groundStationComposerDraftKey('exp', 'new:exp'))).toBeNull();
    act(() => sender.clearIfUnchanged(sender.snapshot));
    expect(hook.result.current.text).toBe('');
    act(() => vi.runAllTimers());
    expect(localStorage.getItem(groundStationComposerDraftKey('exp', 'connected-session'))).toBeNull();
  });
  it('does not erase text typed after a draft was promoted', () => {
    const hook = renderHook(({ id }) => useGroundStationComposerDraft('exp', id), { wrapper, initialProps: { id: 'new:exp' } });
    act(() => hook.result.current.setText('sent'));
    const sender = hook.result.current;
    act(() => sender.promoteTo('connected-session'));
    hook.rerender({ id: 'connected-session' });
    act(() => hook.result.current.setText('next message'));
    act(() => { expect(sender.clearIfUnchanged(sender.snapshot)).toBe(false); });
    expect(hook.result.current.text).toBe('next message');
  });

});
