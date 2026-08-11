import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Input } from './Input';

describe('Input', () => {
  it('supports native change and value-only callbacks', () => {
    const onChange = vi.fn();
    const onValueChange = vi.fn();
    render(<Input aria-label="Name" onChange={onChange} onValueChange={onValueChange} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'robot-1' } });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onValueChange).toHaveBeenCalledWith('robot-1');
  });

  it('does not emit value changes for readonly fields', () => {
    const onValueChange = vi.fn();
    render(<Input aria-label="ID" readOnly value="fixed" onValueChange={onValueChange} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'ID' }), { target: { value: 'changed' } });
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
