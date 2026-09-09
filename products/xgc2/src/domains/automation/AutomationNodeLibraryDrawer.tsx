import { ArrowLeft,ChevronRight,Plus,Search,X } from 'lucide-react';
import { useEffect,useMemo,useState } from 'react';
import { ConfigDrawer } from '../../components/ConfigDrawer';
import { ControlButton } from '../../components/controls/ControlButton';
import { SearchControl } from '../../components/controls/TextControls';
import '../../styles/automation-node-library.css';
import { useAutomationCanvasText } from './automationCanvasMessages';
import type { AutomationNodeLibraryItem } from './automationDefinitionContracts';
import { automationNodeCategory,automationNodeIcon } from './automationNodeVisuals';
import {
  automationNodeLibraryPresentationFromComposition,
  type AutomationNodeWebComposition,
} from './nodes/automationNodeWebComposition';

export function AutomationNodeLibraryDrawer({ resourceId,dataXgcRole,dataXgcId,items,onAdd,onClose,nodeComposition }: {
  resourceId: string;
  dataXgcRole: 'automation-node-library';
  dataXgcId: string;
  items: AutomationNodeLibraryItem[];
  onAdd: (entry: AutomationNodeLibraryItem) => void;
  onClose: () => void;
  nodeComposition?: AutomationNodeWebComposition;
}) {
  const t = useAutomationCanvasText();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const normalizedSearch = search.trim().toLowerCase();
  const groups = useMemo(() => groupCatalogEntries(items), [items]);
  const matches = useMemo(() => normalizedSearch
    ? items.filter((entry) => catalogEntryMatches(entry, normalizedSearch)).sort(compareCatalogEntries)
    : [], [items,normalizedSearch]);
  const matchingGroups = useMemo(() => groupCatalogEntries(matches), [matches]);
  const selectedEntries = groups.get(category) ?? [];

  useEffect(() => {
    if (category && !groups.has(category)) setCategory('');
  }, [category,groups]);

  return (
    <ConfigDrawer
      title={t('Node library')}
      ariaLabel={t('Node library')}
      onClose={onClose}
      closeOnBackdrop
      closeLabel={t('Close node library')}
      closeDataXgcRole="automation-node-library-close"
      closeDataXgcId={resourceId}
      className="automation-node-library-drawer"
      bodyClassName="automation-node-library-body"
      dataXgcRole={dataXgcRole}
      dataXgcId={dataXgcId}
    >
      <div className="automation-library-search" data-xgc-role="automation-node-library-search" data-xgc-id={resourceId}>
        <SearchControl
          className="automation-library-search-input"
          value={search}
          placeholder={t('Search nodes')}
          ariaLabel={t('Search nodes')}
          dataXgcRole="automation-node-library-search-control"
          dataXgcId={resourceId}
          icon={<Search size={14} aria-hidden="true" />}
          onChange={setSearch}
        />
        {search && <ControlButton appearance="ghost" className="automation-library-search-clear" iconOnly size="compact" type="button" aria-label={t('Clear node search')} data-xgc-role="automation-node-library-search-clear" data-xgc-id={resourceId} onClick={() => setSearch('')}><X size={13} aria-hidden="true" /></ControlButton>}
      </div>
      <div className="automation-library-body">
        {normalizedSearch ? (
          <section className="automation-library-search-results" data-xgc-role="automation-node-catalog-search-results" data-xgc-id={normalizedSearch}>
            <div className="automation-library-section-title">
              <strong>{t('Search results')}</strong>
              <span>{nodeCountLabel(matches.length)}</span>
            </div>
            {[...matchingGroups.entries()].map(([group, entries]) => (
              <section className="automation-library-result-group" key={group} data-xgc-role="automation-node-catalog-search-group" data-xgc-id={group}>
                <div className="automation-library-result-group-title"><CatalogIcon category={group} id={group} representative={entries[0]} compact nodeComposition={nodeComposition} /><strong data-xgc-role="automation-node-catalog-category-label" data-xgc-id={group}>{catalogCategoryLabel(group)}</strong><span>{entries.length}</span></div>
                <div className="automation-library-node-list">{entries.map((entry) => <NodeCatalogButton key={entry.id} entry={entry} onAdd={onAdd} nodeComposition={nodeComposition} />)}</div>
              </section>
            ))}
            {matches.length === 0 && <LibraryEmpty id="search" title={t('No nodes found')} body={t('Try a node name, category, or capability.')} />}
          </section>
        ) : category ? (
          <section className="automation-library-category-level" data-xgc-role="automation-node-catalog-current" data-xgc-id={category}>
            <div className="automation-library-level-header">
              <ControlButton appearance="ghost" iconOnly type="button" aria-label={t('Back to categories')} data-xgc-role="automation-node-catalog-back" data-xgc-id={category} onClick={() => setCategory('')}><ArrowLeft size={16} aria-hidden="true" /></ControlButton>
              <span className="automation-library-level-copy"><strong data-xgc-role="automation-node-catalog-category-label" data-xgc-id={category}>{catalogCategoryLabel(category)}</strong><small data-xgc-role="automation-node-catalog-category-description" data-xgc-id={category}>{catalogCategoryDescription(category, selectedEntries[0], nodeComposition)}</small></span>
              <span className="automation-library-level-count">{selectedEntries.length}</span>
            </div>
            <div className="automation-library-node-list">{selectedEntries.map((entry) => <NodeCatalogButton key={entry.id} entry={entry} onAdd={onAdd} nodeComposition={nodeComposition} />)}</div>
          </section>
        ) : (
          <div className="automation-library-categories" data-xgc-role="automation-node-catalog-categories" data-xgc-id={resourceId}>
            {[...groups.entries()].map(([group, entries]) => (
              <ControlButton appearance="ghost" className="automation-library-category" type="button" key={group} data-xgc-role="automation-node-catalog-category" data-xgc-id={group} onClick={() => setCategory(group)}>
                <CatalogIcon category={group} id={group} representative={entries[0]} nodeComposition={nodeComposition} />
                <span className="automation-library-category-copy"><strong data-xgc-role="automation-node-catalog-category-label" data-xgc-id={group}>{catalogCategoryLabel(group)}</strong><small data-xgc-role="automation-node-catalog-category-description" data-xgc-id={group}>{catalogCategoryDescription(group, entries[0], nodeComposition)}</small></span>
                <span className="automation-library-category-meta" data-xgc-role="automation-node-catalog-meta" data-xgc-id={group}><small>{entries.length}</small><ChevronRight size={16} aria-hidden="true" /></span>
              </ControlButton>
            ))}
            {groups.size === 0 && <LibraryEmpty id="all" title={t('No nodes available')} body={t('The trusted node catalog is empty.')} />}
          </div>
        )}
      </div>
    </ConfigDrawer>
  );
}

function LibraryEmpty({ id,title,body }: { id: string;title: string;body: string }) {
  return <div className="automation-library-empty" data-xgc-role="automation-node-catalog-empty" data-xgc-id={id}><Search size={22} aria-hidden="true" /><strong>{title}</strong><span>{body}</span></div>;
}

function NodeCatalogButton({ entry,onAdd,nodeComposition }: {
  entry: AutomationNodeLibraryItem;
  onAdd: (entry: AutomationNodeLibraryItem) => void;
  nodeComposition?: AutomationNodeWebComposition;
}) {
  const t = useAutomationCanvasText();
  const category = catalogCategoryKey(entry);
  return (
    <ControlButton
      appearance="ghost"
      className="automation-library-node"
      data-xgc-category={automationNodeCategory(category)}
      type="button"
      draggable
      aria-label={t('Add {name}', { name: entry.label })}
      data-xgc-role="automation-node-catalog-item"
      data-xgc-id={entry.id}
      onClick={() => onAdd(entry)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('text/xgc-automation-node-library-item', entry.id);
      }}
    >
      <CatalogIcon entry={entry} category={category} id={entry.id} nodeComposition={nodeComposition} />
      <span className="automation-library-node-copy">
        <strong data-xgc-role="automation-node-catalog-label" data-xgc-id={entry.id}>{entry.label}</strong>
        <small className="automation-library-node-description" data-xgc-role="automation-node-catalog-description" data-xgc-id={entry.id}>{entry.description ?? `Add this ${catalogCategoryLabel(category).toLowerCase()} node.`}</small>
      </span>
      <span className="automation-library-node-add" aria-hidden="true"><Plus size={15} /></span>
    </ControlButton>
  );
}

function CatalogIcon({ category,id,entry,representative,compact = false,nodeComposition }: {
  category: string;
  id: string;
  entry?: AutomationNodeLibraryItem;
  /** Category headers use the group's representative entry for exact contribution lookup. */
  representative?: AutomationNodeLibraryItem;
  compact?: boolean;
  nodeComposition?: AutomationNodeWebComposition;
}) {
  const source = entry ?? representative;
  const iconKind = source?.id.startsWith('process-preset:') ? source.id : source?.runtimeKind ?? '';
  const typeVersion = source?.runtimeTypeVersion ?? 0;
  const normalizedCategory = automationNodeCategory(category);
  const Icon = automationNodeIcon(iconKind, normalizedCategory, typeVersion, nodeComposition);
  return <span className="automation-library-catalog-icon" data-xgc-category={normalizedCategory} data-xgc-density={compact ? 'compact' : 'regular'} data-xgc-id={id} aria-hidden="true"><Icon size={compact ? 15 : 20} strokeWidth={1.75} /></span>;
}

function catalogCategoryKey(entry: AutomationNodeLibraryItem) {
  return String(entry.category ?? '').trim().toLowerCase() || 'other';
}

function catalogCategoryLabel(category: string) {
  if (category === 'control') return 'Flow control';
  if (category === 'ros1') return 'ROS1';
  if (category === 'parameter') return 'Parameters';
  if (category === 'ground-station') return 'Ground station';
  return category.replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function catalogCategoryDescription(
  category: string,
  representative?: AutomationNodeLibraryItem,
  nodeComposition?: AutomationNodeWebComposition,
) {
  // Leaf-owned category copy wins when the group's representative has an exact contribution.
  if (representative && nodeComposition) {
    const composed = automationNodeLibraryPresentationFromComposition(
      nodeComposition, representative.runtimeKind, representative.runtimeTypeVersion,
    );
    if (composed?.categoryDescription?.trim()) return composed.categoryDescription;
  }
  // Generic host descriptions only — product leaves such as Media own their category copy.
  const descriptions: Record<string,string> = {
    trigger: 'Start from a manual action or external event',process: 'Launch a trusted managed process',
    control: 'Branch, wait, or control execution',action: 'Perform a trusted robot or system action',
    'ground-station': 'Read panel context, notify operators, or request a decision in the ground station',
    adapter: 'Use capabilities provided by installed Adapter applications',ros1: 'Start processes and use ROS1 tools',
    perception: 'Calibrate and operate trusted perception processes',
    simulation: 'Run robot and environment simulations',visualization: 'Open visualization and monitoring tools',
    advanced: 'Run trusted commands and scripts',other: 'More Automation building blocks',
  };
  return descriptions[category] ?? `Browse ${catalogCategoryLabel(category).toLowerCase()} nodes`;
}

function groupCatalogEntries(entries: AutomationNodeLibraryItem[]) {
  const groups = new Map<string,AutomationNodeLibraryItem[]>();
  entries.forEach((entry) => {
    const category = catalogCategoryKey(entry);
    groups.set(category, [...(groups.get(category) ?? []),entry]);
  });
  groups.forEach((items, category) => groups.set(category, [...items].sort(compareCatalogEntries)));
  return new Map([...groups].sort(([left], [right]) => compareCatalogCategories(left, right)));
}

function compareCatalogCategories(left: string, right: string) {
  if (left === 'trigger') return right === 'trigger' ? 0 : -1;
  if (right === 'trigger') return 1;
  return catalogCategoryLabel(left).localeCompare(catalogCategoryLabel(right));
}

function compareCatalogEntries(left: AutomationNodeLibraryItem, right: AutomationNodeLibraryItem) {
  return left.label.localeCompare(right.label) || left.id.localeCompare(right.id);
}

function catalogEntryMatches(entry: AutomationNodeLibraryItem, search: string) {
  return [entry.label,entry.description,entry.id,entry.runtimeKind,entry.category,catalogCategoryLabel(catalogCategoryKey(entry)),...entry.keywords]
    .some((value) => String(value ?? '').toLowerCase().includes(search));
}

function nodeCountLabel(count: number) {
  return `${count} node${count === 1 ? '' : 's'}`;
}
