// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { SelectControl } from './SelectControl';

describe('select control', () => {
  it('owns listbox structure while exposing options and callbacks as parameters', () => {
    const onChange = vi.fn();
    const onOpen = vi.fn();
    const { container } = render(
      <SelectControl
        compact
        fill
        menuPlacement="above"
        value="recent"
        options={[{ value: 'recent',label: 'Recent',group: 'Order' },{ value: 'name',label: 'Name',group: 'Order' }]}
        onChange={onChange}
        onOpen={onOpen}
        icon={<span aria-hidden="true">S</span>}
        ariaLabel="Sort resources"
        dataXgcRole="resource-sort"
      />,
    );
    const control = container.querySelector('[data-xgc-role="resource-sort"]')!;
    const trigger = screen.getByRole('button', { name: 'Sort resources' });

    expect(control).toHaveClass('xgc-control', 'xgc-select-control');
    expect(control).toHaveAttribute('data-xgc-id', 'resource-sort');
    expect(trigger).toHaveAttribute('data-xgc-role', 'resource-sort-trigger');
    expect(trigger).toHaveAttribute('data-xgc-id', 'resource-sort');
    expect(control).toContainElement(trigger);
    expect(control).toHaveAttribute('data-xgc-compact', 'true');
    expect(control).toHaveAttribute('data-xgc-control', 'select');
    expect(control).toHaveAttribute('data-xgc-fill', 'true');
    expect(control).toHaveAttribute('data-xgc-menu-placement', 'above');
    fireEvent.click(screen.getByRole('button', { name: 'Sort resources' }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.getByRole('group', { name: 'Order' })).toBeInTheDocument();
    const listbox = screen.getByRole('listbox', { name: 'Sort resources' });
    expect(listbox).toHaveClass('xgc-select-menu');
    // Portaled out of overflow:hidden ancestors (e.g. topbar) so the menu can open vertically.
    expect(listbox).toHaveAttribute('data-xgc-portaled', 'true');
    expect(listbox.parentElement).toBe(document.body);
    expect(listbox).toHaveStyle({ zIndex: 'var(--z-portaled-control)' });
    fireEvent.click(screen.getByRole('option', { name: 'Name' }));
    expect(onChange).toHaveBeenCalledWith('name');
  });

  it('flips a below menu above the trigger when the viewport has no room underneath', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 });
    const onChange = vi.fn();
    const { container } = render(
      <div style={{ position: 'fixed', top: 360, left: 20 }}>
        <SelectControl
          value="10"
          options={[
            { value: '10', label: '10 / page' },
            { value: '20', label: '20 / page' },
            { value: '50', label: '50 / page' },
            { value: '100', label: '100 / page' },
          ]}
          onChange={onChange}
          ariaLabel="Rows per page"
          dataXgcRole="footer-page-size"
        />
      </div>,
    );
    const root = container.querySelector('[data-xgc-role="footer-page-size"]') as HTMLElement;
    root.getBoundingClientRect = () => ({
      x: 20,
      y: 360,
      top: 360,
      bottom: 392,
      left: 20,
      right: 180,
      width: 160,
      height: 32,
      toJSON: () => ({}),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Rows per page' }));
    const listbox = screen.getByRole('listbox', { name: 'Rows per page' });
    // Prefer above: only ~8px below the trigger, ample room above.
    expect(listbox).toHaveAttribute('data-xgc-menu-placement', 'above');
    expect(listbox.style.bottom).not.toBe('');
    expect(listbox.style.top).toBe('auto');
    // Clamped so the portaled panel stays inside the viewport.
    expect(Number.parseFloat(listbox.style.maxHeight)).toBeLessThanOrEqual(360);
    fireEvent.click(screen.getByRole('option', { name: '50 / page' }));
    expect(onChange).toHaveBeenCalledWith('50');
  });
});
