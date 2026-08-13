import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionMenu, Popover } from './Popover';

describe('Popover', () => {
  it('portals a labelled dialog and closes it with Escape', () => {
    const onOpenChange = vi.fn();
    render(
      <Popover
        ariaLabel="Parameters"
        onOpenChange={onOpenChange}
        open
        trigger={<button type="button">Edit</button>}
      >
        <button type="button">Inside</button>
      </Popover>,
    );
    expect(screen.getByRole('dialog', { name: 'Parameters' })).toHaveAttribute('data-xgc-overlay-root', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('owns menuitem semantics, arrow navigation, and selection close', () => {
    const selectCopy = vi.fn();
    render(
      <ActionMenu
        ariaLabel="More actions"
        items={[
          { id: 'copy', label: 'Copy', onSelect: selectCopy },
          { id: 'delete', label: 'Delete', onSelect: vi.fn(), tone: 'danger' },
        ]}
        open
        trigger="⋯"
      />,
    );
    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0]!, { key: 'ArrowDown' });
    expect(items[1]).toHaveFocus();
    fireEvent.click(items[0]!);
    expect(selectCopy).toHaveBeenCalledOnce();
  });
});
