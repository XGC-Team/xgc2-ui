import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SelectMenu } from './SelectMenu';

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
});
