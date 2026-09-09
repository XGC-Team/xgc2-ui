// @vitest-environment jsdom

import { act,fireEvent,render,renderHook,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { ConfigAssetCatalogControls } from './ConfigAssetCatalogControls';
import { ConfigAssetCatalogRowTags } from './ConfigAssetCatalogRowTags';
import { ConfigAssetFolderTitle } from './ConfigAssetFolderTitle';
import { useConfigAssetCatalogView } from './useConfigAssetCatalogView';

const text = {
  allTags: 'All tags',
  folderView: 'Folder view',
  listView: 'List view',
  recentlyUpdated: 'Recently updated',
  oldestUpdated: 'Oldest updated',
  nameAscending: 'Name A-Z',
  filterByTag: 'Filter assets by tag',
  sort: 'Sort assets',
};

describe('config asset catalog interaction owners', () => {
  it('owns the shared tag, view and sort control contract', () => {
    const onTagFilterChange = vi.fn();
    const onViewModeChange = vi.fn();
    const onSortModeChange = vi.fn();
    const { container } = render(
      <ConfigAssetCatalogControls
        tags={['flight']}
        tagFilter="all"
        viewMode="folder"
        sortMode="updated-desc"
        rolePrefix="test"
        text={text}
        onTagFilterChange={onTagFilterChange}
        onViewModeChange={onViewModeChange}
        onSortModeChange={onSortModeChange}
      />,
    );

    const folderView = container.querySelector('[data-xgc-role="test-folder-view"]')!;
    const listView = container.querySelector('[data-xgc-role="test-list-view"]')!;
    expect(folderView).toHaveAttribute('data-xgc-active', 'true');
    expect(folderView).toHaveAttribute('data-xgc-size', 'default');
    expect(listView).toHaveAttribute('data-xgc-size', 'default');
    const tagFilter = container.querySelector('[data-xgc-role="test-tag-filter"]')!;
    const sort = container.querySelector('[data-xgc-role="test-sort"]')!;
    expect(sort).toHaveAttribute('data-xgc-size', 'default');
    expect(tagFilter).toHaveClass('config-asset-catalog-tag-filter');
    expect(sort).toHaveClass('config-asset-catalog-sort');
    expect(tagFilter).toHaveAttribute('data-xgc-compact', 'true');
    expect(sort).toHaveAttribute('data-xgc-compact', 'true');
    expect(tagFilter).toHaveAttribute('data-xgc-menu-align', 'start');
    expect(container.querySelector('[data-xgc-role="test-protected-visibility-toggle"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(onViewModeChange).toHaveBeenCalledWith('list');
    fireEvent.click(screen.getByRole('button', { name: 'Filter assets by tag' }));
    fireEvent.click(screen.getByRole('option', { name: 'flight' }));
    expect(onTagFilterChange).toHaveBeenCalledWith('flight');
    fireEvent.click(screen.getByRole('button', { name: 'Sort assets' }));
    fireEvent.click(screen.getByRole('option', { name: 'Name A-Z' }));
    expect(onSortModeChange).toHaveBeenCalledWith('name-asc');
  });

  it('offers an opt-in single control that toggles between folder and list modes',() => {
    const onViewModeChange = vi.fn();
    const view = render(
      <ConfigAssetCatalogControls
        tags={[]}
        tagFilter="all"
        viewMode="folder"
        sortMode="updated-desc"
        rolePrefix="test"
        text={text}
        singleViewToggle
        onTagFilterChange={vi.fn()}
        onViewModeChange={onViewModeChange}
        onSortModeChange={vi.fn()}
      />,
    );
    const toggle = view.container.querySelector('[data-xgc-role="test-view-toggle"]');
    expect(toggle).toHaveAccessibleName('List view');
    expect(toggle).toHaveAttribute('data-xgc-mode','folder');
    expect(view.container.querySelector('[data-xgc-role="test-folder-view"]')).toBeNull();
    expect(view.container.querySelector('[data-xgc-role="test-list-view"]')).toBeNull();
    fireEvent.click(toggle!);
    expect(onViewModeChange).toHaveBeenCalledWith('list');

    view.rerender(
      <ConfigAssetCatalogControls
        tags={[]}
        tagFilter="all"
        viewMode="list"
        sortMode="updated-desc"
        rolePrefix="test"
        text={text}
        singleViewToggle
        onTagFilterChange={vi.fn()}
        onViewModeChange={onViewModeChange}
        onSortModeChange={vi.fn()}
      />,
    );
    expect(toggle).toHaveAccessibleName('Folder view');
    expect(toggle).toHaveAttribute('data-xgc-mode','list');
  });

  it('keeps the create action inside the same responsive catalog control group', () => {
    const onCreate = vi.fn();
    const { container } = render(
      <ConfigAssetCatalogControls
        tags={[]}
        tagFilter="all"
        viewMode="folder"
        sortMode="updated-desc"
        rolePrefix="test"
        text={text}
        createLabel="New"
        createRole="test-create"
        onCreate={onCreate}
        onTagFilterChange={vi.fn()}
        onViewModeChange={vi.fn()}
        onSortModeChange={vi.fn()}
      />,
    );

    const group = container.querySelector('.config-asset-catalog-controls');
    const create = screen.getByRole('button', { name: 'New' });
    expect(group).toContainElement(create);
    fireEvent.click(create);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('owns catalog row tags as the same filter chips as the toolbar', () => {
    const onTagFilterChange = vi.fn();
    const onHostClick = vi.fn();
    const { container } = render(
      <div onClick={onHostClick}>
        <ConfigAssetCatalogRowTags
          tags={['flight']}
          tagFilter="all"
          resourceId="asset-1"
          rolePrefix="test"
          filterLabel={(tag) => `Filter by ${tag}`}
          showAllLabel="Show all tags"
          onTagFilterChange={onTagFilterChange}
        />
      </div>,
    );

    const chip = container.querySelector('[data-xgc-role="test-row-tag"][data-xgc-id="asset-1:flight"]')!;
    expect(chip.tagName).toBe('BUTTON');
    expect(chip).toHaveClass('xgc-list-tag');
    expect(chip).toHaveAttribute('data-xgc-variant', 'default');
    expect(chip).toHaveAccessibleName('Filter by flight');
    fireEvent.click(chip);
    expect(onTagFilterChange).toHaveBeenCalledWith('flight');
    expect(onHostClick).not.toHaveBeenCalled();
  });

  it('clears the selected catalog row tag back to all tags', () => {
    const onTagFilterChange = vi.fn();
    const { container } = render(
      <ConfigAssetCatalogRowTags
        tags={['flight']}
        tagFilter="flight"
        resourceId="asset-1"
        rolePrefix="test"
        filterLabel={(tag) => `Filter by ${tag}`}
        showAllLabel="Show all tags"
        onTagFilterChange={onTagFilterChange}
      />,
    );
    const chip = container.querySelector('[data-xgc-role="test-row-tag"][data-xgc-id="asset-1:flight"]')!;
    expect(chip).toHaveAttribute('data-xgc-variant', 'primary');
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(chip);
    expect(onTagFilterChange).toHaveBeenCalledWith('all');
  });

  it('owns inline authoring chips and the add-tag control for editable catalog rows', () => {
    const onRemoveTag = vi.fn();
    const onEditTags = vi.fn();
    const onTagFilterChange = vi.fn();
    const onHostClick = vi.fn();
    const { container } = render(
      <div onClick={onHostClick}>
        <ConfigAssetCatalogRowTags
          tags={['flight']}
          tagFilter="all"
          resourceId="asset-1"
          rolePrefix="test"
          filterLabel={(tag) => `Filter by ${tag}`}
          showAllLabel="Show all tags"
          onTagFilterChange={onTagFilterChange}
          editable
          onRemoveTag={onRemoveTag}
          onEditTags={onEditTags}
          editLabel="Edit tags"
          removeLabel={(tag) => `Remove ${tag}`}
        />
      </div>,
    );
    const chip = container.querySelector('[data-xgc-role="test-row-tag"][data-xgc-id="asset-1:flight"]')!;
    expect(chip).toHaveAccessibleName('Remove flight');
    fireEvent.click(chip);
    expect(onRemoveTag).toHaveBeenCalledWith('flight');
    expect(onTagFilterChange).not.toHaveBeenCalled();
    expect(onHostClick).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector('[data-xgc-role="test-edit-tags"][data-xgc-id="asset-1"]')!);
    expect(onEditTags).toHaveBeenCalledOnce();
    expect(onHostClick).not.toHaveBeenCalled();
  });

  it('owns inline namespace rename without duplicate blur commits', () => {
    const onRename = vi.fn();
    render(
      <ConfigAssetFolderTitle
        title="User scripts / Lab"
        itemCount={2}
        collapsed={false}
        namespace={{ namespaceId: 'lab',name: 'Lab' }}
        onRename={onRename}
      />,
    );

    fireEvent.doubleClick(screen.getByText('User scripts / Lab'));
    const input = screen.getByRole('textbox', { name: 'Folder name' });
    fireEvent.change(input, { target: { value: 'Flight lab' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ namespaceId: 'lab' }), 'Flight lab');
  });

  it('owns catalog browsing state and stable folder toggling', () => {
    const { result } = renderHook(() => useConfigAssetCatalogView());
    act(() => {
      result.current.setSearch('flight');
      result.current.setTagFilter('lab');
      result.current.setViewMode('list');
      result.current.setSortMode('name-asc');
      result.current.toggleFolder('lab');
    });
    expect(result.current).toMatchObject({
      search: 'flight',
      tagFilter: 'lab',
      viewMode: 'list',
      sortMode: 'name-asc',
      hideSystem: true,
      hideTemplates: false,
      collapsedFolders: ['lab'],
    });
    act(() => result.current.toggleFolder('lab'));
    expect(result.current.collapsedFolders).toEqual([]);
  });

  it('owns hide-system defaults and list toolbar visibility toggles at default size', () => {
    const onHideSystem = vi.fn();
    const onHideTemplates = vi.fn();
    const { result } = renderHook(() => useConfigAssetCatalogView({ hideSystem: true }));
    expect(result.current.hideSystem).toBe(true);
    expect(result.current.hideTemplates).toBe(false);

    const { container } = render(
      <ConfigAssetCatalogControls
        tags={[]}
        tagFilter="all"
        viewMode="folder"
        sortMode="updated-desc"
        rolePrefix="test"
        text={text}
        protectedVisibility={{
          system: {
            hidden: true,
            showLabel: 'Show system items',
            hideLabel: 'Hide system items',
            onChange: onHideSystem,
          },
          templates: {
            hidden: false,
            showLabel: 'Show templates',
            hideLabel: 'Hide templates',
            onChange: onHideTemplates,
          },
        }}
        onTagFilterChange={vi.fn()}
        onViewModeChange={vi.fn()}
        onSortModeChange={vi.fn()}
      />,
    );

    const viewControls = container.querySelector('.config-asset-catalog-view-controls')!;
    const systemToggle = container.querySelector<HTMLButtonElement>('[data-xgc-role="test-protected-visibility-toggle"][data-xgc-id="system"]')!;
    const templateToggle = container.querySelector<HTMLButtonElement>('[data-xgc-role="test-protected-visibility-toggle"][data-xgc-id="templates"]')!;
    const folderView = container.querySelector('[data-xgc-role="test-folder-view"]')!;
    expect(viewControls.firstElementChild).toBe(systemToggle);
    expect(systemToggle.nextElementSibling).toBe(templateToggle);
    expect(templateToggle.nextElementSibling).toBe(folderView);
    for (const control of [systemToggle, templateToggle, folderView]) {
      expect(control).toHaveAttribute('data-xgc-size', 'default');
      expect(control).toHaveAttribute('data-xgc-icon-only', 'true');
    }
    expect(systemToggle).toHaveAccessibleName('Show system items');
    expect(systemToggle).toHaveAttribute('aria-pressed', 'true');
    expect(templateToggle).toHaveAccessibleName('Hide templates');
    expect(templateToggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(systemToggle);
    expect(onHideSystem).toHaveBeenCalledWith(false);
    fireEvent.click(templateToggle);
    expect(onHideTemplates).toHaveBeenCalledWith(true);
  });
});
