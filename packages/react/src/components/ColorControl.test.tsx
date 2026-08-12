import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ColorControl, XGC_COLOR_CONTROL_PRESETS } from './ColorControl';

describe('ColorControl', () => {
  it('owns the native picker, validated hex field, and shared presets', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ColorControl ariaLabel="Marker color" dataXgcRole="marker-color" onChange={onChange} value="#315fdc" />,
    );

    expect(container.querySelector('[data-xgc-role="marker-color"]')).toHaveClass('xgc-color-control');
    expect(screen.getByRole('textbox', { name: 'Marker color hex' })).toHaveValue('#315fdc');
    expect(screen.getAllByRole('option')).toHaveLength(XGC_COLOR_CONTROL_PRESETS.length);

    fireEvent.change(screen.getByRole('textbox', { name: 'Marker color hex' }), { target: { value: '#FFBF00' } });
    expect(onChange).toHaveBeenCalledWith('#ffbf00');
    fireEvent.click(screen.getByRole('option', { name: '#7ddc9a' }));
    expect(onChange).toHaveBeenCalledWith('#7ddc9a');
  });

  it('keeps invalid drafts local and restores the committed value on blur', () => {
    const onChange = vi.fn();
    render(<ColorControl ariaLabel="Grid color" onChange={onChange} value="#ffffff" />);
    const input = screen.getByRole('textbox', { name: 'Grid color hex' });
    fireEvent.change(input, { target: { value: '#fff' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(input).toHaveValue('#ffffff');
  });
});
