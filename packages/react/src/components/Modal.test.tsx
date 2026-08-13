import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { Modal } from './Modal';

describe('Modal', () => {
  it('labels the dialog and closes from Escape or backdrop', () => {
    const onClose = vi.fn();
    const { rerender } = render(<Modal title="Delete run" onClose={onClose}>Body</Modal>);
    const dialog = screen.getByRole('dialog', { name: 'Delete run' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    const backdrop = dialog.parentElement!;
    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalledTimes(2);

    rerender(<Modal title="Delete run" onClose={onClose} closeOnBackdrop={false}>Body</Modal>);
    fireEvent.mouseDown(screen.getByRole('dialog', { name: 'Delete run' }).parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps keyboard focus inside the dialog', () => {
    render(
      <Modal
        title="Confirm"
        onClose={() => undefined}
        actions={<><Button>Cancel</Button><Button tone="primary">Confirm</Button></>}
      >
        Review the operation.
      </Modal>,
    );
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    confirm.focus();
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close dialog' }));
    const close = screen.getByRole('button', { name: 'Close dialog' });
    close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);
  });

  it('does not dismiss when a nested control consumes Escape', async () => {
    const onClose = vi.fn();
    render(
      <Modal title="Edit parameters" onClose={onClose}>
        <button onKeyDown={(event) => event.preventDefault()} type="button">Nested control</button>
      </Modal>,
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Nested control' }), { key: 'Escape' });
    await act(async () => { await Promise.resolve(); });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Edit parameters' })).toBeInTheDocument();
  });

  it('does not dismiss for Escape while an IME composition is active', async () => {
    const onClose = vi.fn();
    render(<Modal title="Edit parameters" onClose={onClose}><input aria-label="Parameter" /></Modal>);

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Parameter' }), { isComposing: true, key: 'Escape' });
    await act(async () => { await Promise.resolve(); });
    expect(onClose).not.toHaveBeenCalled();
  });
});
