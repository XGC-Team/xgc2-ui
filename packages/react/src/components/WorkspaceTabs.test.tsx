import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceTabs } from './WorkspaceTabs';

const items = [
  { id: 'gcs', label: 'GCS' },
  { id: 'ops', label: 'Operations' },
  { id: 'qa', label: 'QA' },
];

describe('WorkspaceTabs', () => {
  it('selects and keyboard-navigates accessible tabs', () => {
    const onValueChange = vi.fn();
    render(<WorkspaceTabs ariaLabel="Dashboards" items={items} value="gcs" onValueChange={onValueChange} />);

    const gcs = screen.getByRole('tab', { name: 'GCS' });
    const ops = screen.getByRole('tab', { name: 'Operations' });
    expect(gcs).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(gcs, { key: 'ArrowRight' });
    expect(onValueChange).toHaveBeenCalledWith('ops');
    expect(ops).toHaveFocus();
  });

  it('owns rename, delete, and create interactions', () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    const onCreate = vi.fn();
    render(
      <WorkspaceTabs
        ariaLabel="Dashboards"
        createLabel="Add dashboard"
        deleteLabel={(item) => `Delete ${item.label}`}
        items={items}
        onCreate={onCreate}
        onDelete={onDelete}
        onRename={onRename}
        onValueChange={vi.fn()}
        value="gcs"
      />,
    );

    fireEvent.doubleClick(screen.getByRole('tab', { name: 'GCS' }));
    const editor = screen.getByRole('textbox', { name: 'Rename GCS' });
    fireEvent.change(editor, { target: { value: 'Flight' } });
    fireEvent.keyDown(editor, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith('gcs', 'Flight');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Operations' }));
    expect(onDelete).toHaveBeenCalledWith('ops');
    fireEvent.click(screen.getByRole('button', { name: 'Add dashboard' }));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('reorders tabs and keeps creation outside the scroll region', () => {
    const onReorder = vi.fn();
    const { container } = render(
      <WorkspaceTabs
        ariaLabel="Dashboards"
        createDataXgcRole="dashboard-add"
        items={items}
        onCreate={vi.fn()}
        onReorder={onReorder}
        onValueChange={vi.fn()}
        value="gcs"
      />,
    );
    const gcs = screen.getByRole('tab', { name: 'GCS' }).parentElement!;
    const qa = screen.getByRole('tab', { name: 'QA' }).parentElement!;
    const dataTransfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      getData: (type: string) => type.includes('workspace-tab') || type === 'text/plain' ? 'gcs' : '',
      setData: vi.fn(),
    };

    fireEvent.dragStart(gcs, { dataTransfer });
    fireEvent.dragOver(qa, { dataTransfer });
    fireEvent.drop(qa, { dataTransfer });
    expect(onReorder).toHaveBeenCalledWith(['ops', 'qa', 'gcs']);
    const scroll = container.querySelector('.xgc-workspace-tabs-scroll')!;
    const add = container.querySelector('[data-xgc-role="dashboard-add"]')!;
    expect(scroll.contains(add)).toBe(false);
  });

  it('hides destructive and editing affordances in constrained modes', () => {
    const onDelete = vi.fn();
    const { rerender } = render(
      <WorkspaceTabs
        ariaLabel="Dashboards"
        items={[items[0]!]}
        onDelete={onDelete}
        onRename={vi.fn()}
        onValueChange={vi.fn()}
        value="gcs"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Delete workspace' })).not.toBeInTheDocument();

    rerender(
      <WorkspaceTabs
        ariaLabel="Dashboards"
        items={items}
        onCreate={vi.fn()}
        onDelete={onDelete}
        onRename={vi.fn()}
        onValueChange={vi.fn()}
        readOnly
        value="gcs"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Delete workspace' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add workspace' })).not.toBeInTheDocument();
  });
});
