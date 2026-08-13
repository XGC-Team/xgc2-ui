import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TextPromptDialog } from './TextPromptDialog';

describe('TextPromptDialog', () => {
  it('trims ordinary text and submits from the keyboard', () => {
    const onSubmit = vi.fn();
    render(
      <TextPromptDialog
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        request={{ initialValue: ' robot-1 ', label: 'Name', title: 'Rename' }}
      />,
    );
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name' }), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('robot-1');
  });

  it('preserves intentional password whitespace', () => {
    const onSubmit = vi.fn();
    render(
      <TextPromptDialog
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        request={{ initialValue: ' secret ', inputType: 'password', label: 'Secret', title: 'Authenticate' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onSubmit).toHaveBeenCalledWith(' secret ');
    expect(document.querySelector('[data-xgc-role="text-prompt-dialog"]')).toBeInTheDocument();
  });
});
