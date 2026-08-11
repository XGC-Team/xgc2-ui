import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FormField, SegmentedControl, Select } from './FormControls';

describe('form controls', () => {
  it('connects a nested select with its field label', () => {
    const onValueChange = vi.fn();
    render(
      <FormField label="Language">
        <Select value="zh" onValueChange={onValueChange}>
          <option value="zh">Chinese</option>
          <option value="en">English</option>
        </Select>
      </FormField>,
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), { target: { value: 'en' } });
    expect(onValueChange).toHaveBeenCalledWith('en');
  });

  it('exposes segmented choices as pressed buttons', () => {
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        ariaLabel="Theme"
        value="light"
        options={[{ label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }]}
        onValueChange={onValueChange}
      />,
    );
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(onValueChange).toHaveBeenCalledWith('dark');
  });
});
