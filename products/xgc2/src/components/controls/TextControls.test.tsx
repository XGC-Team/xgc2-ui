// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { InputControl,SearchControl,TextareaControl } from './TextControls';

describe('text controls', () => {
  it('owns search structure, stable identity, and value callbacks', () => {
    const onChange = vi.fn();
    const { container } = render(
      <SearchControl value="" placeholder="Search resources" dataXgcRole="resource-search" onChange={onChange} />,
    );
    const identity = container.querySelector('[data-xgc-role="resource-search"]')!;
    const control = identity.closest('.xgc-input')!;
    const input = screen.getByRole('searchbox', { name: 'Search resources' });

    expect(control).toHaveClass('xgc-input', 'xgc-control', 'xgc-input-control', 'xgc-search-control');
    expect(identity).toHaveAttribute('data-xgc-control', 'search');
    expect(control.querySelector('svg')).not.toBeNull();
    fireEvent.change(input, { target: { value: 'flight' } });
    expect(onChange).toHaveBeenCalledWith('flight');
  });

  it('reuses the search input foundation without requiring an icon', () => {
    const onChange = vi.fn();
    const { container } = render(
      <InputControl aria-label="Name" value="Mission" onChange={onChange} />,
    );
    const identity = container.querySelector('[data-xgc-control="input"]')!;
    const control = identity.closest('.xgc-input')!;

    expect(control).toHaveClass('xgc-input', 'xgc-control', 'xgc-input-control');
    expect(control).not.toHaveClass('xgc-search-control');
    expect(control.querySelector('svg')).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Mission B' } });
    expect(onChange).toHaveBeenCalledWith('Mission B');
  });

  it('paints an inert right-aligned unit overlay inside the shared input skin', () => {
    const { container } = render(
      <InputControl aria-label="Step size" type="number" value={0.004} unit="s" onChange={vi.fn()} />,
    );
    const identity = container.querySelector('[data-xgc-control="input"]')!;
    const control = identity.closest('.xgc-input')!;
    const unit = control.querySelector('.xgc-input-unit');

    expect(identity).toHaveAttribute('data-xgc-unit', 'true');
    expect(unit).toHaveTextContent('s');
    expect(unit).toHaveAttribute('aria-hidden', 'true');
  });

  it('uses the same control skin and value callback for multiline input', () => {
    const onChange = vi.fn();
    const { container } = render(
      <TextareaControl aria-label="Description" value="Flight mission" onChange={onChange} />,
    );
    const control = container.querySelector('[data-xgc-control="textarea"]')!;

    expect(control).toHaveClass('xgc-control', 'xgc-textarea-control');
    expect(control.querySelector('textarea')).toHaveClass('xgc-textarea');
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), { target: { value: 'Updated mission' } });
    expect(onChange).toHaveBeenCalledWith('Updated mission');
  });

});
