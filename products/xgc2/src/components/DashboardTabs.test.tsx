// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { DashboardTabs } from './DashboardTabs';

describe('DashboardTabs', () => {
  it('hides the close affordance when only one dashboard remains', () => {
    const onDelete = vi.fn();
    const { container } = renderTabs([{ id: 'gcs',name: 'GCS' }], onDelete);

    const tabs = container.querySelector('[data-xgc-role="experiment-dashboard-tabs"]');
    expect(tabs).toHaveClass('xgc-workspace-tabs');
    expect(tabs).not.toHaveClass('xgc-tab-strip');
    const tab = screen.getByRole('tab', { name: 'GCS' });
    expect(tab).toHaveClass('xgc-workspace-tab-select');
    expect(tab).toHaveAttribute('data-xgc-role', 'experiment-dashboard-tab-control');
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(tab.parentElement).toHaveAttribute('data-xgc-role', 'experiment-dashboard-tab');
    expect(tab.parentElement).toHaveAttribute('data-xgc-active', 'true');
    expect(screen.queryByTitle('Delete dashboard')).not.toBeInTheDocument();
    expect(screen.queryByTitle('At least one dashboard is required')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'GCS' }).parentElement).not.toHaveAttribute('draggable');
  });

  it('enables close controls when another dashboard exists', () => {
    const onDelete = vi.fn();
    renderTabs([{ id: 'gcs',name: 'GCS' },{ id: 'ops',name: 'Operations' }], onDelete);

    const close = screen.getAllByTitle('Delete dashboard')[0];
    fireEvent.click(close);
    expect(onDelete).toHaveBeenCalledWith('gcs');
  });

  it('reorders dashboards by drag and drop while editable', () => {
    const onReorder = vi.fn();
    render(<DashboardTabs
      dashboards={[{ id: 'gcs',name: 'GCS' },{ id: 'ops',name: 'Operations' },{ id: 'qa',name: 'QA' }]}
      activeDashboardId="gcs"
      onChange={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onCreate={vi.fn()}
      onReorder={onReorder}
      text={(value) => value}
    />);

    const gcs = screen.getByRole('tab', { name: 'GCS' }).parentElement!;
    const qa = screen.getByRole('tab', { name: 'QA' }).parentElement!;
    expect(gcs).toHaveAttribute('draggable', 'true');
    expect(qa).toHaveAttribute('draggable', 'true');

    const dataTransfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: vi.fn(),
      getData: (type: string) => (type === 'application/x-xgc-dashboard-tab-id' || type === 'text/plain' ? 'gcs' : ''),
    };

    fireEvent.dragStart(gcs, { dataTransfer });
    fireEvent.dragOver(qa, { dataTransfer });
    fireEvent.drop(qa, { dataTransfer });

    expect(onReorder).toHaveBeenCalledWith(['ops', 'qa', 'gcs']);
  });

  it('does not enable reorder when read-only or only one dashboard exists', () => {
    const onReorder = vi.fn();
    const { rerender } = render(<DashboardTabs
      dashboards={[{ id: 'gcs',name: 'GCS' },{ id: 'ops',name: 'Operations' }]}
      activeDashboardId="gcs"
      onChange={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onCreate={vi.fn()}
      onReorder={onReorder}
      readOnly
      text={(value) => value}
    />);

    expect(screen.getByRole('tab', { name: 'GCS' }).parentElement).not.toHaveAttribute('draggable', 'true');

    rerender(<DashboardTabs
      dashboards={[{ id: 'gcs',name: 'GCS' }]}
      activeDashboardId="gcs"
      onChange={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onCreate={vi.fn()}
      onReorder={onReorder}
      text={(value) => value}
    />);

    expect(screen.getByRole('tab', { name: 'GCS' }).parentElement).not.toHaveAttribute('draggable', 'true');
  });

  it('keeps the add control pinned outside the scrollable tab list', () => {
    const onCreate = vi.fn();
    const { container } = render(<DashboardTabs
      dashboards={[{ id: 'gcs',name: 'GCS' },{ id: 'ops',name: 'Operations' }]}
      activeDashboardId="gcs"
      onChange={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onCreate={onCreate}
      showCreate
      readOnly
      text={(value) => value}
    />);

    const tabs = container.querySelector('[data-xgc-role="experiment-dashboard-tabs"]')!;
    const scroll = container.querySelector('[data-xgc-role="experiment-dashboard-tabs-scroll"]')!;
    const add = container.querySelector('[data-xgc-role="experiment-dashboard-add"]')!;
    expect(scroll.contains(add)).toBe(false);
    expect(tabs.contains(add)).toBe(true);
    expect(screen.queryByTitle('Delete dashboard')).not.toBeInTheDocument();
    fireEvent.click(add);
    expect(onCreate).toHaveBeenCalledOnce();
  });
});

function renderTabs(dashboards: Array<{ id: string; name: string }>, onDelete: (id: string) => void) {
  return render(<DashboardTabs
    dashboards={dashboards}
    activeDashboardId="gcs"
    onChange={vi.fn()}
    onRename={vi.fn()}
    onDelete={onDelete}
    onCreate={vi.fn()}
    text={(value) => value}
  />);
}
