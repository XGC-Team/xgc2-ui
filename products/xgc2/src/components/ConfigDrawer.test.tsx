// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { ControlButton } from './controls/ControlButton';
import { ConfigDrawer } from './ConfigDrawer';

describe('ConfigDrawer', () => {
  it('renders a right-side config drawer shell with actions and stable ids', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ConfigDrawer
        title="Edit file"
        subtitle="/tmp/demo.txt"
        actions={<ControlButton size="compact">Save</ControlButton>}
        className="file-editor-drawer"
        bodyClassName="file-editor-body"
        dataXgcRole="file-editor-drawer"
        dataXgcId="/tmp/demo.txt"
        closeLabel="Close editor"
        closeDataXgcRole="file-editor-close"
        closeDataXgcId="/tmp/demo.txt"
        onClose={onClose}
      >
        <textarea aria-label="File content" />
      </ConfigDrawer>,
    );

    expect(container.querySelector('.config-drawer.file-editor-drawer')).not.toBeNull();
    expect(container.querySelector('.config-drawer-body.file-editor-body')).not.toBeNull();
    expect(screen.getByRole('dialog', { name: 'Edit file' })).toHaveAttribute('data-xgc-role', 'file-editor-drawer');
    expect(screen.getByRole('dialog', { name: 'Edit file' })).toHaveAttribute('data-xgc-id', '/tmp/demo.txt');
    expect(screen.getByText('/tmp/demo.txt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close editor' })).toHaveAttribute('data-xgc-role', 'file-editor-close');
    expect(screen.getByRole('button', { name: 'Close editor' })).toHaveAttribute('data-xgc-id', '/tmp/demo.txt');

    fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render when closed', () => {
    const { container } = render(
      <ConfigDrawer title="Hidden" open={false} onClose={vi.fn()}>
        <span>Hidden body</span>
      </ConfigDrawer>,
    );

    expect(container.querySelector('.config-drawer')).toBeNull();
  });

  it('can omit the title row and close control for headerless drawers', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ConfigDrawer title="Configure experiment" hideHeader closeOnBackdrop onClose={onClose}>
        <button type="button">Save</button>
      </ConfigDrawer>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Configure experiment' });
    expect(dialog).toHaveAttribute('data-xgc-header', 'false');
    expect(dialog.querySelector('header')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close drawer' })).not.toBeInTheDocument();
    expect(container.querySelector('.config-drawer-body')).toHaveTextContent('Save');

    fireEvent.mouseDown(container.querySelector('.config-drawer-backdrop')!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('can keep the header while omitting the X when Cancel lives in actions', () => {
    const onClose = vi.fn();
    render(
      <ConfigDrawer
        title="Panel settings"
        showClose={false}
        closeOnBackdrop
        actions={({ requestClose }) => (
          <>
            <ControlButton size="compact" onClick={requestClose}>Cancel</ControlButton>
            <ControlButton size="compact" tone="primary">Save panel</ControlButton>
          </>
        )}
        onClose={onClose}
      >
        <span>Body</span>
      </ConfigDrawer>,
    );

    expect(screen.getByRole('dialog', { name: 'Panel settings' }).querySelector('header')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Close drawer' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('confirms discard with a change list when dirty right drawers close', async () => {
    const onClose = vi.fn();
    const { container } = render(
      <ConfigDrawer
        title="Edit settings"
        dirty
        discardChanges={['Name: A → B']}
        closeOnBackdrop
        showClose={false}
        actions={({ requestClose }) => (
          <ControlButton size="compact" onClick={requestClose}>Cancel</ControlButton>
        )}
        onClose={onClose}
      >
        <span>Body</span>
      </ConfigDrawer>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument();
    expect(container.ownerDocument.querySelector('[data-xgc-role="config-drawer-discard-changes"]')).toHaveTextContent('Name: A → B');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(container.querySelector('.config-drawer-backdrop')!);
    expect(await screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('optionally closes from the backdrop without closing from drawer content', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ConfigDrawer title="Resource settings" closeOnBackdrop onClose={onClose}>
        <button type="button">Inside</button>
      </ConfigDrawer>,
    );

    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(container.querySelector('.config-drawer-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('locks every dismiss path while a shared drawer is busy', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ConfigDrawer title="Saving" closeOnBackdrop dismissible={false} onClose={onClose}>
        <button type="button">Inside</button>
      </ConfigDrawer>,
    );

    expect(screen.getByRole('button', { name: 'Close drawer' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    fireEvent.mouseDown(container.querySelector('.config-drawer-backdrop')!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('owns keyboard focus, traps tab navigation, and closes from Escape', async () => {
    const onClose = vi.fn();
    render(
      <ConfigDrawer title="Keyboard drawer" onClose={onClose}>
        <input aria-label="First field" />
        <button type="button">Last action</button>
      </ConfigDrawer>,
    );

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'First field' })).toHaveFocus());
    const lastAction = screen.getByRole('button', { name: 'Last action' });
    lastAction.focus();
    fireEvent.keyDown(lastAction, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Close drawer' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Close drawer' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus to the trigger when the drawer closes', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open';
    document.body.append(trigger);
    trigger.focus();
    const { rerender } = render(
      <ConfigDrawer title="Focus restore" onClose={vi.fn()}>
        <input aria-label="Drawer field" />
      </ConfigDrawer>,
    );
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Drawer field' })).toHaveFocus());

    rerender(
      <ConfigDrawer title="Focus restore" open={false} onClose={vi.fn()}>
        <input aria-label="Drawer field" />
      </ConfigDrawer>,
    );

    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
