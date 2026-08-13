import { act, renderHook } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { TextPromptDialogProps } from '../components/TextPromptDialog';
import { useTextPromptDialog } from './useTextPromptDialog';

function currentDialog(dialog: ReactElement | null): ReactElement<TextPromptDialogProps> {
  if (!dialog) throw new Error('Expected an active text prompt dialog');
  return dialog as ReactElement<TextPromptDialogProps>;
}

describe('useTextPromptDialog', () => {
  it('binds settlement callbacks to one queue identity and ignores stale or duplicate callbacks', async () => {
    const { result } = renderHook(() => useTextPromptDialog());
    let firstPromise!: Promise<string | null>;
    let secondPromise!: Promise<string | null>;
    act(() => {
      firstPromise = result.current.prompt({ label: 'Name', title: 'First' });
      secondPromise = result.current.prompt({ label: 'Name', title: 'Second' });
    });

    const firstDialog = currentDialog(result.current.dialog);
    expect(firstDialog.props.request.title).toBe('First');
    act(() => {
      firstDialog.props.onSubmit('alpha');
      firstDialog.props.onCancel();
    });
    await expect(firstPromise).resolves.toBe('alpha');

    const secondDialog = currentDialog(result.current.dialog);
    expect(secondDialog.props.request.title).toBe('Second');
    const secondSettled = vi.fn();
    void secondPromise.then(secondSettled);
    act(() => firstDialog.props.onSubmit('stale-value'));
    await Promise.resolve();
    expect(secondSettled).not.toHaveBeenCalled();

    act(() => {
      secondDialog.props.onSubmit('bravo');
      secondDialog.props.onSubmit('duplicate-value');
    });
    await expect(secondPromise).resolves.toBe('bravo');
    expect(result.current.dialog).toBeNull();
  });

  it('settles the active request and every queued request exactly once on unmount', async () => {
    const { result, unmount } = renderHook(() => useTextPromptDialog());
    const settled = [vi.fn(), vi.fn(), vi.fn()];
    let promises!: Promise<string | null>[];
    act(() => {
      promises = ['One', 'Two', 'Three'].map((title, index) => {
        const promise = result.current.prompt({ label: 'Value', title });
        void promise.then(settled[index]);
        return promise;
      });
    });

    unmount();
    await expect(Promise.all(promises)).resolves.toEqual([null, null, null]);
    expect(settled.map((callback) => callback.mock.calls)).toEqual([[[null]], [[null]], [[null]]]);
    await expect(result.current.prompt({ label: 'Value', title: 'After unmount' })).resolves.toBeNull();
  });
});
