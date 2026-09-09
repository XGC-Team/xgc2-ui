// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { Workflow } from 'lucide-react';
import { describe,expect,it,vi } from 'vitest';
import { SelectControl } from './controls/SelectControl';
import { ListPage,ListPageHost,ListPageItemMain,ListPageTag,type ListPageFolder } from './ListPage';

type Item = { id: string; label: string };

const folders: Array<ListPageFolder<Item>> = [
  { id: 'system', title: 'System', isSystem: true, items: [] },
  { id: 'readonly', title: 'Readonly', readOnly: true, items: [] },
  { id: 'custom', title: 'Custom', items: [] },
];

describe('ListPage', () => {
  it('owns one catalog item structure, icon size, and opening callback', () => {
    const onOpen = vi.fn();
    const onRowClick = vi.fn();
    const { container } = render(
      <div onClick={onRowClick}>
        <ListPageItemMain title="Resource A" description=" " icon={Workflow} openLabel="Open resource A" onOpen={onOpen}>
          <ListPageTag>flight</ListPageTag>
        </ListPageItemMain>
      </div>,
    );

    const main = container.querySelector('[data-xgc-role="list-page-item-main"]');
    expect(main?.children).toHaveLength(3);
    expect(main?.querySelector('.xgc-list-item-title-icon')).toHaveAttribute('width', '15');
    expect(main?.querySelector('.xgc-list-item-title-icon')).toHaveAttribute('height', '15');
    expect(main?.querySelector('.xgc-list-item-title strong')).toHaveTextContent('Resource A');
    expect(main?.querySelector('.xgc-list-item-subtitle')).toHaveTextContent('No description');
    expect(main?.querySelector('.xgc-list-tag-row')).toHaveTextContent('flight');
    fireEvent.click(screen.getByRole('button', { name: 'Open resource A' }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('stamps dataXgcId onto the family list-page-item-main host', () => {
    const { container } = render(
      <ListPageItemMain
        dataXgcId="resource-a"
        title="Resource A"
        icon={Workflow}
        openLabel="Open resource A"
        onOpen={() => undefined}
      />,
    );
    expect(container.querySelector('[data-xgc-role="list-page-item-main"]')).toHaveAttribute('data-xgc-id', 'resource-a');
  });

  it('stamps unique title and description leaf roles onto catalog row chrome', () => {
    const { container } = render(
      <ListPageItemMain
        dataXgcId="resource-a"
        titleRole="resource-row-open"
        descriptionRole="resource-row-description"
        title="Resource A"
        description="Records one copy of the encoded camera stream"
        icon={Workflow}
        openLabel="Open resource A"
        onOpen={() => undefined}
      />,
    );
    const main = container.querySelector('[data-xgc-role="list-page-item-main"]');
    const title = container.querySelector('[data-xgc-role="resource-row-open"]');
    const description = container.querySelector('[data-xgc-role="resource-row-description"]');
    expect(main).toHaveAttribute('data-xgc-id', 'resource-a');
    expect(title).toHaveClass('xgc-list-row-open');
    expect(title).toHaveAttribute('data-xgc-id', 'resource-a');
    expect(description).toHaveClass('xgc-list-item-subtitle');
    expect(description).toHaveAttribute('data-xgc-id', 'resource-a');
    expect(description).toHaveTextContent('Records one copy of the encoded camera stream');
    expect(container.querySelectorAll('[data-xgc-role="resource-row-open"][data-xgc-id="resource-a"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-xgc-role="list-page-item-main"][data-xgc-id="resource-a"]')).toHaveLength(1);
  });

  it('uses a themed listbox for list filters instead of a native select popup', () => {
    const onChange = vi.fn();
    const { container } = render(
      <SelectControl
        compact
        value="recent"
        options={[{ value: 'recent',label: 'Recently updated' },{ value: 'oldest',label: 'Oldest updated' }]}
        onChange={onChange}
        icon={<span aria-hidden="true">S</span>}
        ariaLabel="Sort resources"
        dataXgcRole="resource-sort"
      />,
    );

    const root = container.querySelector('[data-xgc-role="resource-sort"]');
    const trigger = screen.getByRole('button', { name: 'Sort resources' });
    expect(root).toHaveClass('xgc-control', 'xgc-select-control');
    expect(root).toHaveAttribute('data-xgc-compact', 'true');
    expect(root).toHaveAttribute('data-xgc-control', 'select');
    expect(root).toHaveAttribute('data-xgc-size', 'default');
    expect(root).toHaveAttribute('data-value', 'recent');
    expect(root?.querySelector('select')).toBeNull();
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox', { name: 'Sort resources' })).toHaveClass('xgc-select-menu');
    expect(screen.getByRole('option', { name: 'Recently updated' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(screen.getByRole('option', { name: 'Recently updated' }), { key: 'Escape' });
    expect(screen.queryByRole('listbox', { name: 'Sort resources' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox', { name: 'Sort resources' })).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: 'Oldest updated' }));
    expect(onChange).toHaveBeenCalledWith('oldest');
    expect(screen.queryByRole('listbox', { name: 'Sort resources' })).not.toBeInTheDocument();
  });

  it('places the create action after the list controls without a heading slot', () => {
    const onCreate = vi.fn();
    const { container } = render(
      <ListPage
        createLabel="New"
        onCreate={onCreate}
        controls={<button type="button">Recently updated</button>}
        folders={[]}
        renderItem={(item: Item) => <div>{item.label}</div>}
        emptyTitle="No items"
      />,
    );

    const controls = container.querySelector('.xgc-list-controls')!;
    const create = screen.getByRole('button', { name: 'New' });
    expect(container.querySelector('.xgc-list-heading')).toBeNull();
    expect(controls).toContainElement(screen.getByRole('button', { name: 'Recently updated' }));
    expect(controls.lastElementChild).toBe(create);
    fireEvent.click(create);
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('supports a quiet text-only empty state without changing the illustrated default', () => {
    const { container } = render(
      <ListPage
        folders={[]}
        renderItem={(item: Item) => <div>{item.label}</div>}
        emptyTitle="No hosts yet"
        emptyDescription="Use New to add an SSH host."
      />,
    );

    const empty = container.querySelector('.xgc-list-empty');
    expect(empty).toHaveAttribute('data-appearance','plain');
    expect(empty?.querySelector('.xgc-empty-state-title')).toHaveTextContent('No hosts yet');
    expect(empty?.querySelector('.xgc-empty-state-description')).toHaveTextContent('Use New to add an SSH host.');
    expect(empty?.querySelector('.xgc-list-empty-mark')).toBeNull();
  });

  it('separates persistent controls from the independently scrollable item region', () => {
    const { container } = render(
      <ListPageHost>
        <ListPage
          createLabel="New"
          onCreate={vi.fn()}
          search={{ value: '',placeholder: 'Search resources',onChange: vi.fn() }}
          controls={<button type="button">All tags</button>}
          folders={[{ id: 'custom',title: 'Custom',items: [{ id: 'one',label: 'One' }] }]}
          renderItem={(item: Item) => <div>{item.label}</div>}
          emptyTitle="No items"
        />
      </ListPageHost>,
    );

    const controls = container.querySelector('[data-xgc-role="list-page-controls"]')!;
    const items = container.querySelector('[data-xgc-role="list-page-items-scroll"]')!;
    const searchInput = screen.getByPlaceholderText('Search resources');
    expect(controls.querySelector('.xgc-list-search')).toHaveClass('xgc-input');
    expect(controls.querySelector('.xgc-list-search')).toHaveAttribute('data-size', 'default');
    expect(searchInput).toHaveAttribute('type', 'search');
    expect(controls).toContainElement(searchInput);
    expect(controls).toContainElement(screen.getByRole('button', { name: 'All tags' }));
    const create = screen.getByRole('button', { name: 'New' });
    expect(create).toHaveClass('xgc-button');
    expect(create).toHaveAttribute('data-size', 'default');
    expect(controls).toContainElement(create);
    expect(items).toHaveTextContent('Custom');
    expect(items).toHaveTextContent('One');
    expect(items).not.toContainElement(searchInput);
  });

  it('does not move items into system or readOnly folders', () => {
    const onMove = vi.fn();
    render(
      <ListPage
        title="Items"
        folders={folders}
        drag={{
          mimeType: 'application/x-test-item',
          getItemId: (item) => item.id,
          onMove,
        }}
        renderItem={(item) => <div>{item.label}</div>}
        emptyTitle="No items"
      />,
    );

    dropOnFolder('System');
    dropOnFolder('Readonly');
    expect(onMove).not.toHaveBeenCalled();

    dropOnFolder('Custom');
    expect(onMove).toHaveBeenCalledWith('item-1', 'custom');
  });

  it('does not let getFolderProps override protected drop handling', () => {
    const onMove = vi.fn();
    const bypass = vi.fn();
    render(
      <ListPage
        title="Items"
        folders={folders}
        getFolderProps={() => ({
          onDrop: bypass,
          onDragOver: bypass,
        } as never)}
        drag={{
          mimeType: 'application/x-test-item',
          getItemId: (item) => item.id,
          onMove,
        }}
        renderItem={(item) => <div>{item.label}</div>}
        emptyTitle="No items"
      />,
    );

    dragOverFolder('System');
    dropOnFolder('System');

    expect(bypass).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });

  it('does not make items from system or readOnly folders draggable', () => {
    const onMove = vi.fn();
    render(
      <ListPage
        title="Items"
        folders={[
          { id: 'system', title: 'System', isSystem: true, items: [{ id: 's1', label: 'System item' }] },
          { id: 'readonly', title: 'Readonly', readOnly: true, items: [{ id: 'r1', label: 'Readonly item' }] },
          { id: 'custom', title: 'Custom', items: [{ id: 'c1', label: 'Custom item' }] },
        ]}
        drag={{
          mimeType: 'application/x-test-item',
          getItemId: (item) => item.id,
          onMove,
        }}
        renderItem={(item, dragProps) => (
          <div data-testid={item.id} {...dragProps}>
            {item.label}
          </div>
        )}
        emptyTitle="No items"
      />,
    );

    expect(screen.getByTestId('s1')).not.toHaveAttribute('draggable');
    expect(screen.getByTestId('r1')).not.toHaveAttribute('draggable');
    expect(screen.getByTestId('c1')).toHaveAttribute('draggable', 'true');
  });

  it('reads drag payload from the configured mime type', () => {
    const onMove = vi.fn();
    const getData = vi.fn((type: string) => (type === 'application/x-test-item' ? 'item-1' : ''));
    render(
      <ListPage
        title="Items"
        folders={folders}
        drag={{
          mimeType: 'application/x-test-item',
          getItemId: (item) => item.id,
          onMove,
        }}
        renderItem={(item) => <div>{item.label}</div>}
        emptyTitle="No items"
      />,
    );

    dropOnFolder('Custom', getData);

    expect(getData).toHaveBeenCalledWith('application/x-test-item');
    expect(onMove).toHaveBeenCalledWith('item-1', 'custom');
  });
});

function dropOnFolder(title: string, getData: (type: string) => string = () => 'item-1') {
  const folder = screen.getByText(title).closest('section');
  if (!folder) throw new Error(`missing folder ${title}`);
  fireEvent.drop(folder, {
    dataTransfer: {
      getData,
    },
  });
}

function dragOverFolder(title: string) {
  const folder = screen.getByText(title).closest('section');
  if (!folder) throw new Error(`missing folder ${title}`);
  fireEvent.dragOver(folder, {
    dataTransfer: {
      dropEffect: 'move',
    },
  });
}
