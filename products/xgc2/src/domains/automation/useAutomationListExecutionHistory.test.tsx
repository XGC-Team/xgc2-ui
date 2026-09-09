// @vitest-environment jsdom

import { act,renderHook,waitFor } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { AutomationDocument } from './automationDefinitionContracts';
import { useAutomationListExecutionHistory } from './useAutomationListExecutionHistory';

describe('Automation catalog background history', () => {
  it('observes every catalog resource through the owner and cancels that observation when parked', async () => {
    const pending: Array<{ resolve: () => void; reject: () => void; signal?: AbortSignal }> = [];
    const refresh = vi.fn((_id: string,signal?: AbortSignal) => new Promise<void>((resolve,reject) => {
      pending.push({ resolve,reject: () => reject(new Error('history unavailable')),signal });
    }));
    const documents = ['a','b','c','d'].map((resourceId) => ({ head: { resourceId } }) as AutomationDocument);
    const { rerender } = renderHook(({ visible }) => useAutomationListExecutionHistory({
      visible,documents,runSummaries: [],refreshExecutionHistory: refresh,
    }),{ initialProps: { visible: true } });
    expect(refresh.mock.calls.map(([id]) => id)).toEqual(['a','b','c','d']);
    await act(async () => pending[0]!.reject());
    rerender({ visible: false });
    expect(pending.every((request) => request.signal?.aborted)).toBe(true);
    await act(async () => { pending.slice(1).forEach((request) => request.resolve()); });
    expect(refresh.mock.calls.map(([id]) => id)).toEqual(['a','b','c','d']);
  });

  it('cancels a hidden browser observation and supplies a fresh signal when visible again', async () => {
    const refresh = vi.fn((_id: string,_signal?: AbortSignal) => Promise.resolve());
    const documents = [{ head:{ resourceId:'a' } }] as AutomationDocument[];
    const visibility = Object.getOwnPropertyDescriptor(document,'visibilityState');
    const { unmount } = renderHook(() => useAutomationListExecutionHistory({
      visible:true,documents,runSummaries:[],refreshExecutionHistory:refresh,
    }));
    try {
      const originalSignal = refresh.mock.calls[0]![1]!;
      Object.defineProperty(document,'visibilityState',{ configurable:true,value:'hidden' });
      act(() => document.dispatchEvent(new Event('visibilitychange')));
      expect(originalSignal.aborted).toBe(true);
      expect(refresh).toHaveBeenCalledOnce();
      Object.defineProperty(document,'visibilityState',{ configurable:true,value:'visible' });
      act(() => document.dispatchEvent(new Event('visibilitychange')));
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
      expect(refresh.mock.calls[1]![1]).not.toBe(originalSignal);
      expect(refresh.mock.calls[1]![1]!.aborted).toBe(false);
    } finally {
      unmount();
      if (visibility) Object.defineProperty(document,'visibilityState',visibility);
      else Reflect.deleteProperty(document,'visibilityState');
    }
  });
});
