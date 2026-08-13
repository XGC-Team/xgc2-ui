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
    expect(options.map((option) => option.tabIndex)).toEqual([-1, 0]);
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

  it('normalizes conflicting selection and explicit tab indexes to one enabled tab stop', () => {
    render(
      <SelectableList aria-label="Conflicting documents">
        <SelectableListItem disabled selected tabIndex={0} title="Disabled selected" />
        <SelectableListItem selected title="Selected one" />
        <SelectableListItem selected title="Selected two" />
        <SelectableListItem tabIndex={0} title="Explicit enabled" />
        <SelectableListItem tabIndex={0} title="Second explicit enabled" />
      </SelectableList>,
    );

    const options = screen.getAllByRole('option');
    expect(options.map((option) => option.tabIndex)).toEqual([-1, -1, -1, 0, -1]);
  });

  it('never promotes a disabled explicit tab stop and falls back to the first enabled option', () => {
    render(
      <SelectableList aria-label="Fail-safe documents">
        <SelectableListItem disabled tabIndex={0} title="Disabled explicit" />
        <SelectableListItem title="Enabled fallback" />
        <SelectableListItem title="Another option" />
      </SelectableList>,
    );

    const options = screen.getAllByRole('option');
    expect(options.map((option) => option.tabIndex)).toEqual([-1, 0, -1]);
  });
});
