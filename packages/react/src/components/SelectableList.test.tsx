import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SelectableList, SelectableListItem } from './SelectableList';

describe('SelectableList', () => {
  it('owns listbox selection semantics and keyboard navigation', () => {
    const selectSecond = vi.fn();
    render(
      <SelectableList aria-label="Documents">
        <SelectableListItem selected title="One" />
        <SelectableListItem onClick={selectSecond} title="Two" meta="Markdown" />
      </SelectableList>,
    );
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(options[0]!, { key: 'ArrowDown' });
    expect(selectSecond).toHaveBeenCalledOnce();
    expect(options[1]).toHaveFocus();
  });

  it('keeps an unselected list reachable with one roving tab stop', () => {
    render(
      <SelectableList aria-label="New documents">
        <SelectableListItem title="First" />
        <SelectableListItem title="Second" />
      </SelectableList>,
    );
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('tabindex', '0');
    expect(options[1]).toHaveAttribute('tabindex', '-1');
  });
});
