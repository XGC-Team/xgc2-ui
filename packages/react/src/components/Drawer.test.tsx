// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { Drawer } from './Drawer';

describe('Drawer', () => {
  it('owns a tokenized header, independently scrolling body, actions, and close behavior', () => {
    const onClose = vi.fn();
    render(
      <Drawer
        actions={<Button uiSize="compact">Save</Button>}
        bodyClassName="editor-body"
        description="/tmp/demo.txt"
        onClose={onClose}
        title="Edit file"
        width="wide"
      ><textarea aria-label="File content" /></Drawer>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Edit file' });
    expect(dialog).toHaveAttribute('data-width', 'wide');
    expect(dialog.querySelector('.xgc-drawer-body')).toHaveClass('editor-body');
    expect(dialog.querySelector('.xgc-drawer-header')).toHaveTextContent('Edit file');
    expect(dialog.querySelector('.xgc-drawer-header')).not.toHaveTextContent('/tmp/demo.txt');
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('guards every dismiss path when the drawer has unsaved changes', async () => {
    const onClose = vi.fn();
    render(
      <Drawer
        actions={({ requestClose }) => <Button onClick={requestClose}>Cancel</Button>}
        closeOnBackdrop
        dirty
        discardChanges={['Name: A → B']}
        onClose={onClose}
        showClose={false}
        title="Edit settings"
      ><span>Body</span></Drawer>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' })).toHaveTextContent('Name: A → B');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Edit settings' }), { key: 'Escape' });
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('restores focus after closing', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const { rerender } = render(
      <Drawer onClose={vi.fn()} title="Focus drawer"><input aria-label="First field" /></Drawer>,
    );
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'First field' })).toHaveFocus());
    rerender(<Drawer onClose={vi.fn()} open={false} title="Focus drawer"><span /></Drawer>);
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it('supports an accessible headerless workflow without retaining title chrome', () => {
    render(<Drawer hideHeader onClose={vi.fn()} title="Configure experiment"><button type="button">Save</button></Drawer>);
    const dialog = screen.getByRole('dialog', { name: 'Configure experiment' });
    expect(dialog).toHaveAttribute('data-header', 'false');
    expect(dialog.querySelector('.xgc-drawer-header')).toBeNull();
  });
});
