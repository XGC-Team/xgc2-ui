import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ListPage, ListPageHost, ListPageItemMain, ListPageTag, type ListPageFolder } from './ListPage';

type Item = { id: string; label: string };

const folders: Array<ListPageFolder<Item>> = [
  { id: 'system', title: 'System', isSystem: true, items: [] },
  { id: 'readonly', title: 'Readonly', readOnly: true, items: [] },
  { id: 'custom', title: 'Custom', items: [] },
];

function ItemIcon(props: { className?: string; size?: number | string; 'aria-hidden'?: boolean }) {
  const { size, ...rest } = props;
  return <svg {...rest} data-testid="item-icon" height={size} width={size} />;
}

describe('ListPage', () => {
  it('owns the catalog item structure and isolates its open action', () => {
    const onOpen = vi.fn();
    const onRowClick = vi.fn();
    const { container } = render(
      <div onClick={onRowClick}>
        <ListPageItemMain description=" " icon={ItemIcon} onOpen={onOpen} openLabel="Open resource A" title="Resource A">
          <ListPageTag>flight</ListPageTag>
        </ListPageItemMain>
      </div>,
    );
    expect(container.querySelector('[data-xgc-role="list-page-item-main"]')?.children).toHaveLength(3);
    expect(screen.getByTestId('item-icon')).toHaveAttribute('width', '15');
    expect(screen.getByText('No description')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open resource A' }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('keeps controls fixed above the independently scrollable resource region', () => {
    const onCreate = vi.fn();
    const { container } = render(
      <ListPageHost>
        <ListPage
          controls={<button type="button">All tags</button>}
          createLabel="New"
          emptyTitle="No items"
          folders={[{ id: 'custom', title: 'Custom', items: [{ id: 'one', label: 'One' }] }]}
          onCreate={onCreate}
          renderItem={(item) => <div>{item.label}</div>}
          search={{ onChange: vi.fn(), placeholder: 'Search resources', value: '' }}
        />
      </ListPageHost>,
    );
    const controls = container.querySelector('[data-xgc-role="list-page-controls"]')!;
    const items = container.querySelector('[data-xgc-role="list-page-items-scroll"]')!;
    expect(controls).toContainElement(screen.getByPlaceholderText('Search resources'));
    expect(controls).toContainElement(screen.getByRole('button', { name: 'New' }));
    expect(items).not.toContainElement(screen.getByPlaceholderText('Search resources'));
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('uses the shared empty-state presentation without a decorative fake status mark', () => {
    const { container } = render(
      <ListPage emptyAppearance="plain" emptyDescription="Create one to begin." emptyTitle="No hosts" folders={[]} renderItem={() => null} />,
    );
    expect(container.querySelector('.xgc-list-empty')).toHaveClass('xgc-empty-state');
    expect(container.querySelector('.xgc-list-empty')).toHaveAttribute('data-appearance', 'plain');
    expect(screen.getByText('Create one to begin.')).toBeInTheDocument();
  });

  it('protects system and read-only folders from drops', () => {
    const onMove = vi.fn();
    render(
      <ListPage
        drag={{ getItemId: (item) => item.id, mimeType: 'application/x-item', onMove }}
        emptyTitle="No items"
        folders={folders}
        renderItem={(item) => <div>{item.label}</div>}
      />,
    );
    dropOnFolder('System');
    dropOnFolder('Readonly');
    expect(onMove).not.toHaveBeenCalled();
    dropOnFolder('Custom');
    expect(onMove).toHaveBeenCalledWith('item-1', 'custom');
  });

  it('only makes resources from writable folders draggable', () => {
    render(
      <ListPage
        drag={{ getItemId: (item) => item.id, mimeType: 'application/x-item', onMove: vi.fn() }}
        emptyTitle="No items"
        folders={[
          { id: 'system', title: 'System', isSystem: true, items: [{ id: 's1', label: 'System item' }] },
          { id: 'custom', title: 'Custom', items: [{ id: 'c1', label: 'Custom item' }] },
        ]}
        renderItem={(item, dragProps) => <div data-testid={item.id} {...dragProps}>{item.label}</div>}
      />,
    );
    expect(screen.getByTestId('s1')).not.toHaveAttribute('draggable');
    expect(screen.getByTestId('c1')).toHaveAttribute('draggable', 'true');
  });
});

function dropOnFolder(title: string) {
  const folder = screen.getByText(title).closest('section');
  if (!folder) throw new Error(`missing folder ${title}`);
  fireEvent.drop(folder, { dataTransfer: { getData: () => 'item-1' } });
}
