import { StrictMode, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';
import { ActionMenu, Popover } from './Popover';
import { SelectMenu } from './SelectMenu';

function NestedSelectPopover() {
  const [open, setOpen] = useState(true);

  return (
    <Popover
      ariaLabel="Parameters"
      onOpenChange={setOpen}
      open={open}
      trigger={<button type="button">Edit parameters</button>}
    >
      <SelectMenu
        ariaLabel="Execution mode"
        onValueChange={() => undefined}
        options={[
          { label: 'Automatic', value: 'automatic' },
          { label: 'Manual', value: 'manual' },
        ]}
        value="automatic"
      />
    </Popover>
  );
}

function PopoverInModal() {
  const [modalOpen, setModalOpen] = useState(true);
  const [popoverOpen, setPopoverOpen] = useState(true);

  return modalOpen ? (
    <Modal onClose={() => setModalOpen(false)} title="Container">
      <Popover
        ariaLabel="Parameters"
        onOpenChange={setPopoverOpen}
        open={popoverOpen}
        trigger={<button type="button">Edit parameters</button>}
      >
        <button type="button">Inside parameters</button>
      </Popover>
    </Modal>
  ) : null;
}

function PopoverTabInModal() {
  const [popoverOpen, setPopoverOpen] = useState(true);

  return (
    <Modal onClose={() => undefined} title="Container">
      <Popover
        ariaLabel="Parameters"
        onOpenChange={setPopoverOpen}
        open={popoverOpen}
        trigger={<button type="button">Edit parameters</button>}
      >
        <button type="button">First parameter</button>
        <button type="button">Second parameter</button>
      </Popover>
    </Modal>
  );
}

function ThreeLevelOverlays({ dismissible = true }: { dismissible?: boolean }) {
  const [modalOpen, setModalOpen] = useState(true);
  const [popoverOpen, setPopoverOpen] = useState(true);

  return modalOpen ? (
    <Modal dismissible={dismissible} onClose={() => setModalOpen(false)} title="Container">
      <Popover
        ariaLabel="Parameters"
        onOpenChange={setPopoverOpen}
        open={popoverOpen}
        trigger={<button type="button">Edit parameters</button>}
      >
        <SelectMenu
          ariaLabel="Execution mode"
          onValueChange={() => undefined}
          options={[
            { label: 'Automatic', value: 'automatic' },
            { label: 'Manual', value: 'manual' },
          ]}
          value="automatic"
        />
      </Popover>
    </Modal>
  ) : null;
}

function StandalonePopover({ name }: { name: string }) {
  const [open, setOpen] = useState(true);
  return (
    <Popover
      ariaLabel={`${name} surface`}
      onOpenChange={setOpen}
      open={open}
      trigger={<button type="button">{name} trigger</button>}
    >
      <button type="button">{name} content</button>
    </Popover>
  );
}

describe('Popover', () => {
  it('portals a labelled dialog and closes it with Escape', async () => {
    const onOpenChange = vi.fn();
    render(
      <Popover
        ariaLabel="Parameters"
        onOpenChange={onOpenChange}
        open
        trigger={<button type="button">Edit</button>}
      >
        <button type="button">Inside</button>
      </Popover>,
    );
    expect(screen.getByRole('dialog', { name: 'Parameters' })).toHaveAttribute('data-xgc-overlay-root', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('lets a nested listbox consume Escape before closing its dialog', () => {
    render(<NestedSelectPopover />);
    const outerTrigger = screen.getByRole('button', { name: 'Edit parameters' });
    const innerTrigger = screen.getByRole('button', { name: 'Execution mode' });

    fireEvent.click(innerTrigger);
    const listbox = screen.getByRole('listbox', { name: 'Execution mode' });
    expect(screen.getByRole('option', { name: 'Automatic' })).toHaveFocus();

    fireEvent.keyDown(listbox, { key: 'Escape' });
    expect(screen.queryByRole('listbox', { name: 'Execution mode' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Parameters' })).toBeInTheDocument();
    expect(innerTrigger).toHaveFocus();

    fireEvent.keyDown(innerTrigger, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Parameters' })).not.toBeInTheDocument();
    expect(outerTrigger).toHaveFocus();
  });

  it('dismisses exactly one level per Escape across a three-level overlay stack', async () => {
    render(<ThreeLevelOverlays />);
    const outerTrigger = screen.getByRole('button', { name: 'Edit parameters' });
    const innerTrigger = screen.getByRole('button', { name: 'Execution mode' });
    fireEvent.click(innerTrigger);

    fireEvent.keyDown(screen.getByRole('listbox', { name: 'Execution mode' }), { key: 'Escape' });
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('listbox', { name: 'Execution mode' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Parameters' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Container' })).toBeInTheDocument();
    expect(innerTrigger).toHaveFocus();

    fireEvent.keyDown(innerTrigger, { key: 'Escape' });
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('dialog', { name: 'Parameters' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Container' })).toBeInTheDocument();
    expect(outerTrigger).toHaveFocus();

    fireEvent.keyDown(outerTrigger, { key: 'Escape' });
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('dialog', { name: 'Container' })).not.toBeInTheDocument();
  });

  it('dismisses before its containing modal', async () => {
    render(<PopoverInModal />);
    const trigger = screen.getByRole('button', { name: 'Edit parameters' });

    fireEvent.keyDown(screen.getByRole('button', { name: 'Inside parameters' }), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Parameters' })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Container' })).toBeInTheDocument());
    expect(trigger).toHaveFocus();

    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Container' })).not.toBeInTheDocument();
  });

  it('does not cancel native Tab traversal inside a portaled popover owned by its modal', () => {
    render(<PopoverTabInModal />);
    const first = screen.getByRole('button', { name: 'First parameter' });
    const second = screen.getByRole('button', { name: 'Second parameter' });

    first.focus();
    expect(fireEvent.keyDown(first, { key: 'Tab' })).toBe(true);
    expect(first).toHaveFocus();
    second.focus();
    expect(fireEvent.keyDown(second, { key: 'Tab', shiftKey: true })).toBe(true);
    expect(second).toHaveFocus();
  });

  it('keeps a nondismissible modal registered as the owner of its portaled child', async () => {
    render(<ThreeLevelOverlays dismissible={false} />);
    const outerTrigger = screen.getByRole('button', { name: 'Edit parameters' });
    const innerTrigger = screen.getByRole('button', { name: 'Execution mode' });

    expect(fireEvent.keyDown(innerTrigger, { key: 'Tab' })).toBe(true);
    fireEvent.keyDown(innerTrigger, { key: 'Escape' });
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('dialog', { name: 'Parameters' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Container' })).toBeInTheDocument();
    expect(outerTrigger).toHaveFocus();

    fireEvent.keyDown(outerTrigger, { key: 'Escape' });
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('dialog', { name: 'Container' })).toBeInTheDocument();
  });

  it('cleans up and preserves topmost order across StrictMode and separate React roots', async () => {
    const firstRoot = render(<StandalonePopover name="First" />);
    const secondRoot = render(<StrictMode><StandalonePopover name="Second" /></StrictMode>);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Second surface' })).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'First surface' })).toBeInTheDocument();

    secondRoot.unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'First surface' })).not.toBeInTheDocument());
    firstRoot.unmount();
  });

  it('owns menuitem semantics, arrow navigation, and selection close', () => {
    const selectCopy = vi.fn();
    render(
      <ActionMenu
        ariaLabel="More actions"
        items={[
          { id: 'copy', label: 'Copy', onSelect: selectCopy },
          { id: 'delete', label: 'Delete', onSelect: vi.fn(), tone: 'danger' },
        ]}
        open
        trigger="⋯"
      />,
    );
    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0]!, { key: 'ArrowDown' });
    expect(items[1]).toHaveFocus();
    fireEvent.click(items[0]!);
    expect(selectCopy).toHaveBeenCalledOnce();
  });
});
