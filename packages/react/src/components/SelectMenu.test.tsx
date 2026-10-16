import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectMenu } from './SelectMenu';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SelectMenu', () => {
  it('portals grouped options and reports selection', () => {
    const onOpen = vi.fn();
    const onValueChange = vi.fn();
    const { container } = render(
      <SelectMenu
        ariaLabel="Sort resources"
        dataXgcRole="resource-sort"
        fill
        menuPlacement="above"
        onOpen={onOpen}
        onValueChange={onValueChange}
        options={[
          { group: 'Order', label: 'Recent', value: 'recent' },
          { group: 'Order', label: 'Name', value: 'name' },
        ]}
        value="recent"
      />,
    );

    expect(container.querySelector('[data-xgc-role="resource-sort"]')).toHaveAttribute('data-xgc-control', 'select');
    fireEvent.click(screen.getByRole('button', { name: 'Sort resources' }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.getByRole('group', { name: 'Order' })).toBeInTheDocument();
    expect(screen.getByRole('listbox', { name: 'Sort resources' }).parentElement).toBe(document.body);
    fireEvent.click(screen.getByRole('option', { name: 'Name' }));
    expect(onValueChange).toHaveBeenCalledWith('name');
  });

  it('flips above when the preferred space below is too small', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 });
    const { container } = render(
      <SelectMenu
        ariaLabel="Rows per page"
        onValueChange={() => undefined}
        options={[{ label: '10 / page', value: '10' }, { label: '50 / page', value: '50' }]}
        value="10"
      />,
    );
    const root = container.querySelector('.xgc-select-control') as HTMLElement;
    root.getBoundingClientRect = () => ({
      bottom: 392, height: 32, left: 20, right: 180, top: 360, width: 160, x: 20, y: 360, toJSON: () => ({}),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Rows per page' }));
    expect(screen.getByRole('listbox', { name: 'Rows per page' })).toHaveAttribute('data-xgc-menu-placement', 'above');
  });

  it('closes from the current blur frame when focus has left', () => {
    const queued = queueAnimationFrames();
    const { container } = render(<RowsPerPageMenu />);
    const trigger = screen.getByRole('button', { name: 'Rows per page' });
    const root = container.querySelector('.xgc-select-control') as HTMLElement;
    fireEvent.click(trigger);
    const option = screen.getByRole('option', { name: '10 / page' });

    fireEvent.blur(root, { relatedTarget: option });
    expect(queued).toHaveLength(0);

    (document.activeElement as HTMLElement).blur();
    expect(queued).toHaveLength(1);
    act(() => { queued[0]!(0); });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the newer blur frame when an older callback runs', () => {
    const queued = queueAnimationFrames();
    const cancel = vi.mocked(window.cancelAnimationFrame);
    const { container, unmount } = render(<RowsPerPageMenu />);
    const trigger = screen.getByRole('button', { name: 'Rows per page' });
    const root = container.querySelector('.xgc-select-control') as HTMLElement;
    fireEvent.click(trigger);

    fireEvent.blur(root);
    fireEvent.blur(root);
    expect(cancel).toHaveBeenCalledWith(1);
    const stale = queued[0]!;
    cancel.mockClear();
    act(() => { stale(0); });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    unmount();
    expect(cancel).toHaveBeenCalledWith(2);
  });
});

function RowsPerPageMenu() {
  return (
    <SelectMenu
      ariaLabel="Rows per page"
      onValueChange={() => undefined}
      options={[{ label: '10 / page', value: '10' }, { label: '50 / page', value: '50' }]}
      value="10"
    />
  );
}

function queueAnimationFrames() {
  const queued: FrameRequestCallback[] = [];
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
    queued.push(callback);
    return queued.length;
  });
  return queued;
}
