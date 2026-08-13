import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FormSection, FormSectionSpan, InputActionControl, Vector3Control } from './CompoundControls';

describe('compound controls', () => {
  it('owns static form section hierarchy and full-width composition', () => {
    render(
      <FormSection title="Pose">
        <label>Position</label>
        <FormSectionSpan>Advanced</FormSectionSpan>
      </FormSection>,
    );
    expect(screen.getByRole('heading', { name: 'Pose', level: 3 })).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toHaveClass('xgc-form-section-span');
  });

  it('combines a shared input and accessible inset action', () => {
    const onValueChange = vi.fn();
    const onAction = vi.fn();
    render(
      <InputActionControl
        actionLabel="Browse"
        onAction={onAction}
        onValueChange={onValueChange}
        value="/tmp"
      />,
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '/var' } });
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    expect(onValueChange).toHaveBeenCalledWith('/var');
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('routes each vector axis through one typed callback', () => {
    const onValueChange = vi.fn();
    render(
      <Vector3Control
        axes={[
          { label: 'X', value: 1 },
          { label: 'Y', value: 2 },
          { label: 'Z', value: 3 },
        ]}
        onValueChange={onValueChange}
        unit="m"
      />,
    );
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Y (m)' }), { target: { value: '4.5' } });
    expect(onValueChange).toHaveBeenCalledWith(1, '4.5');
  });
});
