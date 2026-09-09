// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe,expect,it,vi } from 'vitest';
import { productWebComposition } from '../../../../profiles/core-dev';
import {
  ProductWebCompositionProvider,
  type ProductWebComposition,
} from '../../../shared/productWebComposition';
import type { ExperimentDocument } from '../experimentModel';
import { ExperimentListPage } from './ExperimentListPage';

function renderWithComposition(ui: ReactElement, composition: ProductWebComposition = productWebComposition) {
  return render(
    <ProductWebCompositionProvider composition={composition}>
      {ui}
    </ProductWebCompositionProvider>,
  );
}

describe('ExperimentListPage', () => {
  it('renders configuration identity selectors and archives through the stable resource ID', () => {
    const onDelete = vi.fn();
    const onTagFilterChange = vi.fn();
    const onViewModeChange = vi.fn();
    const onHideSystemChange = vi.fn();
    const onHideTemplatesChange = vi.fn();
    const { container } = renderPage({ onDelete,onTagFilterChange,onViewModeChange,onHideSystemChange,onHideTemplatesChange });
    expect(container.querySelector('[data-xgc-role="experiment-row"][data-xgc-id="exp-1"]')).toHaveTextContent('Experiment A');
    expect(container.querySelector('[data-xgc-role="list-page-item-main"][data-xgc-id="exp-1"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-row-open"][data-xgc-id="exp-1"]')).toHaveTextContent('Experiment A');
    expect(container.querySelector('[data-xgc-role="experiment-row-description"][data-xgc-id="exp-1"]')).toHaveTextContent('Typed experiment');
    expect(container.querySelectorAll('[data-xgc-role="list-page-item-main"][data-xgc-id="exp-1"]')).toHaveLength(1);
    expect(container.querySelector('[data-xgc-role="experiment-row"]')).toHaveClass('xgc-list-row');
    expect(container.querySelector('[data-xgc-role="experiment-row"]')).toHaveAttribute('data-xgc-layout', 'catalog');
    expect(container.querySelector('[data-xgc-role="experiment-row"]')).not.toHaveAttribute('data-xgc-selected');
    expect(container.querySelector('[data-xgc-role="experiment-row"]')).not.toHaveAttribute('data-xgc-running');
    expect(container.querySelector('[data-xgc-role="experiment-row"] .xgc-list-item-title-icon')).toHaveAttribute('width', '15');
    expect(container.querySelector('[data-xgc-role="experiment-history"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-row"][data-xgc-id="exp-1"]')).not.toHaveTextContent('main · v1');
    expect(screen.queryByRole('heading', { name: 'Experiments' })).not.toBeInTheDocument();
    expect(screen.queryByText('Create and manage experiments for simulation, flight tests, mission validation, and robot control.')).not.toBeInTheDocument();
    expect(container.querySelector('.xgc-list-heading')).toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-create"]')?.closest('.xgc-list-controls')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-tag-filter"]')).toHaveClass('xgc-select-control');
    expect(container.querySelector('[data-xgc-role="experiment-search"]')).toHaveClass('xgc-input', 'xgc-list-search');
    expect(container.querySelector('[data-xgc-role="experiment-search"]')?.querySelector(':scope > input')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-search"] > input')).not.toHaveClass('xgc-input');
    expect(container.querySelector('[data-xgc-role="experiment-tag-filter"]')).toHaveAttribute('data-xgc-control', 'select');
    const viewToggle = container.querySelector('[data-xgc-role="experiment-view-toggle"]')!;
    expect(viewToggle).toHaveAttribute('data-xgc-control', 'button');
    expect(viewToggle).toHaveAttribute('data-xgc-icon-only', 'true');
    expect(viewToggle).toHaveAttribute('data-xgc-mode', 'list');
    expect(viewToggle).toHaveAttribute('data-xgc-id', 'list');
    expect(viewToggle).toHaveAccessibleName('Folder view');
    expect(viewToggle).toHaveAttribute('title', 'Folder view');
    expect(container.querySelector('[data-xgc-role="experiment-folder-view"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-list-view"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-sort"]')).toHaveAttribute('data-xgc-control', 'select');
    expect(container.querySelector('[data-xgc-role="experiment-create"]')).toHaveClass('xgc-button');
    for (const role of ['experiment-tag-filter', 'experiment-view-toggle', 'experiment-sort']) {
      expect(container.querySelector(`[data-xgc-role="${role}"]`)).toHaveAttribute('data-xgc-size', 'default');
    }
    expect(container.querySelector('[data-xgc-role="experiment-search"]')).toHaveAttribute('data-size', 'default');
    expect(container.querySelector('[data-xgc-role="experiment-create"]')).toHaveAttribute('data-size', 'default');
    const systemToggle = container.querySelector('[data-xgc-role="experiment-protected-visibility-toggle"][data-xgc-id="system"]')!;
    const templateToggle = container.querySelector('[data-xgc-role="experiment-protected-visibility-toggle"][data-xgc-id="templates"]')!;
    expect(systemToggle).toHaveAccessibleName('Show system experiments');
    expect(templateToggle).toHaveAccessibleName('Hide template experiments');
    expect(systemToggle.nextElementSibling).toBe(templateToggle);
    expect(templateToggle.nextElementSibling).toBe(viewToggle);
    fireEvent.click(systemToggle);
    fireEvent.click(templateToggle);
    expect(onHideSystemChange).toHaveBeenCalledWith(false);
    expect(onHideTemplatesChange).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Filter experiments by tag' }));
    fireEvent.click(screen.getByRole('option', { name: 'tag-a' }));
    expect(onTagFilterChange).toHaveBeenCalledWith('tag-a');
    fireEvent.click(container.querySelector('[data-xgc-role="experiment-row-tag"][data-xgc-id="exp-1:tag-a"]')!);
    expect(onTagFilterChange).toHaveBeenLastCalledWith('tag-a');
    fireEvent.click(viewToggle);
    expect(onViewModeChange).toHaveBeenCalledWith('folder');
    expect(container.querySelector('[data-xgc-role="experiment-sort"]')).toHaveClass('xgc-select-control');
    expect(screen.getByPlaceholderText('Search experiments and folders')).toBeInTheDocument();
    fireEvent.click(container.querySelector('[data-xgc-role="experiment-delete"][data-xgc-id="exp-1"]')!);
    expect(onDelete).toHaveBeenCalledWith('exp-1');
    expect(container.querySelector('[data-xgc-role="experiment-activate"]')).toBeNull();
  });

  it('renders backend namespaces as folders instead of consuming the first tag', () => {
    const { container } = renderPage({ viewMode: 'folder' });
    const userFolder = container.querySelector('[data-xgc-role="experiment-folder"][data-xgc-id="user"]')!;
    expect([...container.querySelectorAll('[data-xgc-role="experiment-folder"]')].map((folder) => folder.getAttribute('data-xgc-id'))).toEqual([
      'templates','user','lab',
    ]);
    expect(container.querySelector('[data-xgc-role="experiment-folder"][data-xgc-id="system"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-folder"][data-xgc-id="templates"]')).toHaveTextContent('Templates');
    expect(userFolder).toHaveTextContent('User experiments');
    expect(container.querySelector('[data-xgc-role="experiment-folder-delete"][data-xgc-id="user"]')).toBeNull();
    fireEvent.doubleClick(userFolder.querySelector('.experiment-list-folder-name')!);
    expect(userFolder.querySelector('.xgc-list-folder-name-input')).toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-folder"][data-xgc-id="lab"]')).toHaveTextContent('User experiments / Lab');
    expect(container.querySelector('[data-xgc-role="experiment-folder"][data-xgc-id="lab"]')).toHaveTextContent('Experiment A');
    expect(container.querySelector('[data-xgc-role="experiment-folder-delete"][data-xgc-id="lab"]')).toHaveAttribute('title', 'Only empty folders can be archived');
  });

  it('filters canonical protected identities without treating user tags or names as protection', () => {
    const system = experiment('system', 'System regression');
    system.head.system = true;
    const template = experiment('template', 'Flight template');
    template.head.system = true;
    template.spec.tags = ['template'];
    const user = experiment('user', 'System template named by user');
    user.spec.tags = ['system','template'];
    const props = { experiments:[system,template,user],hideSystem:true,hideTemplates:true,viewMode:'list' as const };
    const { container,unmount } = renderPage(props);
    expect(container.querySelector('[data-xgc-role="experiment-row"][data-xgc-id="system"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-row"][data-xgc-id="template"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-row"][data-xgc-id="user"]')).toHaveAttribute('data-xgc-protection', 'user');
    unmount();

    const visible = renderPage({ ...props,hideSystem:false,hideTemplates:false,viewMode:'folder' });
    const systemRow = visible.container.querySelector('[data-xgc-role="experiment-row"][data-xgc-id="system"]')!;
    const templateRow = visible.container.querySelector('[data-xgc-role="experiment-row"][data-xgc-id="template"]')!;
    expect(systemRow.closest('[data-xgc-role="experiment-folder"]')).toHaveAttribute('data-xgc-id', 'system');
    expect(templateRow.closest('[data-xgc-role="experiment-folder"]')).toHaveAttribute('data-xgc-id', 'templates');
    expect(systemRow).toHaveAttribute('data-xgc-protection', 'system');
    expect(templateRow).toHaveAttribute('data-xgc-protection', 'template');
    for (const row of [systemRow,templateRow]) {
      expect(row).not.toHaveAttribute('draggable', 'true');
      expect(row.querySelector('[data-xgc-role="experiment-edit-tags"]')).toBeNull();
      expect(row.querySelector('[data-xgc-role="experiment-delete"]')).toBeDisabled();
      expect(row.querySelector('[data-xgc-role="experiment-duplicate"]')).toBeEnabled();
    }
    expect(systemRow.querySelector('[data-xgc-role="experiment-settings"]')).toBeDisabled();
    expect(templateRow.querySelector('[data-xgc-role="experiment-settings"]')).toBeEnabled();
  });

  it('keeps ordinary Experiment authoring controls available without a client-side Session fence', () => {
    const onOpen = vi.fn();
    const onConfigure = vi.fn();
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    const { container } = renderPage({
      onOpen,onConfigure,onDuplicate,onDelete,viewMode: 'folder',
    });
    const row = container.querySelector<HTMLElement>('[data-xgc-role="experiment-row"][data-xgc-id="exp-1"]')!;
    expect(row).not.toHaveAttribute('data-xgc-session-active');
    expect(row).not.toHaveAttribute('data-xgc-readonly');
    expect(row).toHaveAttribute('draggable', 'true');
    expect(row.querySelector('[data-xgc-role="experiment-edit-tags"]')).not.toBeNull();
    expect(row.querySelector('[data-xgc-role="experiment-row-tags"][data-xgc-id="exp-1"]')).not.toBeNull();
    const tagChip = row.querySelector('[data-xgc-role="experiment-row-tag"][data-xgc-id="exp-1:tag-a"]');
    expect(tagChip).toHaveClass('xgc-list-tag');
    expect(tagChip?.tagName).toBe('BUTTON');
    expect(tagChip).toHaveAttribute('data-xgc-variant', 'default');
    expect(tagChip).toHaveAccessibleName('Remove tag-a');
    expect(row.querySelector('[data-xgc-role="experiment-meta"]')).not.toBeNull();
    expect(row.querySelector('[data-xgc-role="experiment-settings"]')).not.toBeDisabled();
    expect(row.querySelector('[data-xgc-role="experiment-duplicate"]')).not.toBeDisabled();
    expect(row.querySelector('[data-xgc-role="experiment-delete"]')).not.toBeDisabled();
    fireEvent.click(row.querySelector('[data-xgc-role="experiment-settings"]')!);
    fireEvent.click(row.querySelector('[data-xgc-role="experiment-delete"]')!);
    fireEvent.click(row.querySelector('[data-xgc-role="experiment-duplicate"]')!);
    expect(onConfigure).toHaveBeenCalledWith(expect.objectContaining({ head: expect.objectContaining({ resourceId: 'exp-1' }) }));
    expect(onDelete).toHaveBeenCalledWith('exp-1');
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    fireEvent.click(row.querySelector('.xgc-list-row-open')!);
    expect(onOpen).toHaveBeenCalledWith('exp-1');
  });

  it('edits Experiment tags inline instead of using row chips as a filter', () => {
    const onOpen = vi.fn();
    const onEditTags = vi.fn();
    const onUpdateTags = vi.fn();
    const onTagFilterChange = vi.fn();
    const { container } = renderPage({ onOpen,onEditTags,onUpdateTags,onTagFilterChange });
    const chip = container.querySelector<HTMLButtonElement>('[data-xgc-role="experiment-row-tag"][data-xgc-id="exp-1:tag-a"]')!;
    expect(container.querySelector('[data-xgc-role="experiment-edit-tags"][data-xgc-id="exp-1"]')).not.toBeNull();
    fireEvent.click(chip);
    expect(onUpdateTags).toHaveBeenCalledWith(expect.objectContaining({
      head: expect.objectContaining({ resourceId: 'exp-1' }),
    }), []);
    expect(onTagFilterChange).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector('[data-xgc-role="experiment-edit-tags"][data-xgc-id="exp-1"]')!);
    expect(onEditTags).toHaveBeenCalledWith(expect.objectContaining({
      head: expect.objectContaining({ resourceId: 'exp-1' }),
    }));
  });

  it('marks a running Experiment row with a glow and does not add start/stop controls', () => {
    const running = experiment('exp-run', 'Running experiment');
    const idle = experiment('exp-idle', 'Idle experiment');
    const { container } = renderPage({
      experiments: [running, idle],
      selectedExperimentId: 'exp-idle',
      runningExperimentIds: new Set(['exp-run']),
    });
    const runningRow = container.querySelector<HTMLElement>('[data-xgc-role="experiment-row"][data-xgc-running="true"]')!;
    const idleRow = container.querySelector<HTMLElement>('[data-xgc-role="experiment-row"]:not([data-xgc-running])')!;

    expect(runningRow).toHaveClass('xgc-list-row');
    expect(runningRow).toHaveAttribute('data-xgc-layout', 'catalog');
    expect(runningRow).toHaveAttribute('data-xgc-running', 'true');
    expect(runningRow).not.toHaveAttribute('data-xgc-selected');
    expect(idleRow).not.toHaveAttribute('data-xgc-running');
    expect(idleRow).not.toHaveAttribute('data-xgc-selected');
    expect(screen.getByRole('button', { name: 'Open experiment Idle experiment' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Open running experiment Running experiment' })).not.toHaveAttribute('aria-current');
    expect(runningRow.querySelector('[data-xgc-role="experiment-settings"]')).not.toBeNull();
    expect(runningRow.querySelector('[data-xgc-role="experiment-duplicate"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-start"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-stop"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-activate"]')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Run$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Stop$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open running experiment Running experiment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open experiment Idle experiment' })).toBeInTheDocument();
  });

  it('does not paint last-opened catalog chrome unless the Experiment is running', () => {
    const running = experiment('exp-run', 'Running experiment');
    const { container } = renderPage({
      experiments: [running],
      selectedExperimentId: 'exp-run',
      runningExperimentIds: new Set(['exp-run']),
    });
    const row = container.querySelector<HTMLElement>('[data-xgc-role="experiment-row"][data-xgc-running="true"]')!;
    expect(row).toHaveClass('xgc-list-row');
    expect(row).toHaveAttribute('data-xgc-layout', 'catalog');
    expect(row).not.toHaveAttribute('data-xgc-selected');
    expect(screen.getByRole('button', { name: 'Open running experiment Running experiment' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the create action in the toolbar of the empty flat catalog', () => {
    const onCreate = vi.fn();
    const { container } = renderPage({ experiments: [],namespaces: [],viewMode: 'list',onCreate });

    const empty = container.querySelector<HTMLElement>('.xgc-list-empty')!;
    expect(empty).toHaveTextContent('No matching experiments');
    expect(empty.querySelector('button')).toBeNull();
    fireEvent.click(container.querySelector('[data-xgc-role="experiment-create"]')!);
    expect(onCreate).toHaveBeenCalledOnce();
  });
});

function renderPage(
  overrides: Partial<Parameters<typeof ExperimentListPage>[0]> = {},
  composition: ProductWebComposition = productWebComposition,
) {
  return renderWithComposition(
    <ExperimentListPage
      experiments={[experiment()]}
      namespaces={[{ domain: 'experiment',namespaceId: 'lab',name: 'Lab',revision: 1,createdAt: '',updatedAt: '' }]}
      selectedExperimentId="exp-1"
      search=""
      tagFilter="all"
      viewMode="list"
      sortMode="updated-desc"
      hideSystem
      hideTemplates={false}
      onSearchChange={vi.fn()}
      onTagFilterChange={vi.fn()}
      onViewModeChange={vi.fn()}
      onSortModeChange={vi.fn()}
      onHideSystemChange={vi.fn()}
      onHideTemplatesChange={vi.fn()}
      onCreate={vi.fn()}
      onOpen={vi.fn()}
      onEditTags={vi.fn()}
      onUpdateTags={vi.fn()}
      collapsedFolders={[]}
      onToggleFolder={vi.fn()}
      onMoveToNamespace={vi.fn()}
      onRenameNamespace={vi.fn()}
      onDeleteNamespace={vi.fn()}
      onConfigure={vi.fn()}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
      {...overrides}
    />,
    composition,
  );
}

function experiment(resourceId = 'exp-1', name = 'Experiment A', namespaceId = 'lab'): ExperimentDocument {
  return {
    head: { domain: 'experiment',resourceId,namespaceId,name,tags: ['tag-a'],mainCommitId: 'c1',currentVersion: 1,digest: 'd',revision: 1,createdAt: '',updatedAt: '2026-07-14T00:00:00Z' },
    branch: { domain: 'experiment',resourceId,name: 'main',headCommitId: 'c1',headVersion: 1,revision: 1,createdAt: '',updatedAt: '' },
    spec: { schemaVersion: 15,name,description: 'Typed experiment',tags: ['tag-a'],runModes: ['simulation','physical'],localizationOffset:{ x:0,y:0,z:0 },dashboards: [{ id: 'gcs',name: 'GCS',description: '',panels: [] }],
      robots: [],workflowInstances: [] },
  };
}
