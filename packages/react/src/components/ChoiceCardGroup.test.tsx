import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChoiceCardGroup } from './ChoiceCardGroup';

describe('ChoiceCardGroup', () => {
  it('uses complete card selection and moves through enabled choices with arrow keys', () => {
    const onValueChange = vi.fn();
    render(
      <ChoiceCardGroup
        ariaLabel="Layout"
        onValueChange={onValueChange}
        options={[
          { value: 'single', label: 'Single', content: <span>preview</span> },
          { value: 'disabled', label: 'Disabled', disabled: true },
          { value: 'row', label: 'Side by side' },
        ]}
        value="single"
      />,
    );

    const selected = screen.getByRole('radio', { name: 'Single' });
    expect(selected).toHaveAttribute('aria-checked', 'true');
    expect(selected).toHaveAttribute('data-xgc-selected', 'true');
    fireEvent.keyDown(selected, { key: 'ArrowRight' });
    expect(onValueChange).toHaveBeenCalledWith('row');
    expect(screen.getByRole('radio', { name: 'Side by side' })).toHaveFocus();
  });
});
