// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { AutomationNumericInput } from './AutomationNumericInput';

describe('AutomationNumericInput', () => {
  it('keeps an empty replacement draft without coercing it to zero', () => {
    const onValueChange = vi.fn();
    const view = render(<AutomationNumericInput value={20} onValueChange={onValueChange} ariaLabel="Rate" />);
    const input = screen.getByRole('spinbutton', { name: 'Rate' });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    expect(input).toHaveValue(null);
    expect(onValueChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '12.5' } });
    expect(input).toHaveValue(12.5);
    expect(onValueChange).toHaveBeenLastCalledWith(12.5);
    view.rerender(<AutomationNumericInput value={12.5} onValueChange={onValueChange} ariaLabel="Rate" />);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(input).toHaveValue(12.5);
  });

  it('commits an optional empty value only on blur', () => {
    const onEmpty = vi.fn();
    render(<AutomationNumericInput value={3} integer onValueChange={vi.fn()} onEmpty={onEmpty} ariaLabel="Optional count" />);
    const input = screen.getByRole('spinbutton', { name: 'Optional count' });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    expect(onEmpty).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onEmpty).toHaveBeenCalledOnce();
  });
});
