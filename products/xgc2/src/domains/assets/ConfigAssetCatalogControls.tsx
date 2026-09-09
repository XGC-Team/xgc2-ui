import { ArrowDownUp,Folder,List,Plus,Tag } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { SelectControl } from '../../components/controls/SelectControl';
import type { ConfigAssetSortMode,ConfigAssetViewMode } from './configAssetCatalog';
import './config-asset-catalog-controls.css';

export type ConfigAssetCatalogControlText = {
  allTags: string;
  folderView: string;
  listView: string;
  recentlyUpdated: string;
  oldestUpdated: string;
  nameAscending: string;
  filterByTag: string;
  sort: string;
};

export type ConfigAssetProtectedVisibilityToggle = {
  hidden: boolean;
  hideLabel: string;
  showLabel: string;
  onChange: (hidden: boolean) => void;
};

export type ConfigAssetProtectedVisibility = {
  system?: ConfigAssetProtectedVisibilityToggle;
  templates?: ConfigAssetProtectedVisibilityToggle;
};

export function ConfigAssetCatalogControls({
  tags,
  tagFilter,
  viewMode,
  sortMode,
  rolePrefix,
  text,
  viewControlsBefore,
  singleViewToggle = false,
  protectedVisibility,
  createLabel,
  createRole,
  onCreate,
  onTagFilterChange,
  onViewModeChange,
  onSortModeChange,
}: {
  tags: readonly string[];
  tagFilter: string;
  viewMode: ConfigAssetViewMode;
  sortMode: ConfigAssetSortMode;
  rolePrefix: string;
  text: ConfigAssetCatalogControlText;
  viewControlsBefore?: ReactNode;
  singleViewToggle?: boolean;
  protectedVisibility?: ConfigAssetProtectedVisibility;
  createLabel?: string;
  createRole?: string;
  onCreate?: () => void;
  onTagFilterChange: (value: string) => void;
  onViewModeChange: (value: ConfigAssetViewMode) => void;
  onSortModeChange: (value: ConfigAssetSortMode) => void;
}) {
  return (
    <div className="config-asset-catalog-controls">
      <SelectControl
        className="config-asset-catalog-tag-filter"
        compact
        menuAlign="start"
        value={tagFilter}
        options={[{ value: 'all',label: text.allTags },...tags.map((tag) => ({ value: tag,label: tag }))]}
        onChange={onTagFilterChange}
        icon={<Tag size={15} />}
        ariaLabel={text.filterByTag}
        dataXgcRole={`${rolePrefix}-tag-filter`} dataXgcId={`${rolePrefix}-tag-filter`}
      />
      <div className="config-asset-catalog-view-controls">
        {protectedVisibility?.system ? (
          <ProtectedCatalogVisibilityButton
            rolePrefix={rolePrefix}
            id="system"
            letter="S"
            toggle={protectedVisibility.system}
          />
        ) : null}
        {protectedVisibility?.templates ? (
          <ProtectedCatalogVisibilityButton
            rolePrefix={rolePrefix}
            id="templates"
            letter="T"
            toggle={protectedVisibility.templates}
          />
        ) : null}
        {viewControlsBefore}
        {singleViewToggle ? (
          <ControlButton
            iconOnly
            aria-label={viewMode === 'folder' ? text.listView : text.folderView}
            data-xgc-mode={viewMode}
            dataXgcRole={`${rolePrefix}-view-toggle`}
            dataXgcId={viewMode}
            title={viewMode === 'folder' ? text.listView : text.folderView}
            onClick={() => onViewModeChange(viewMode === 'folder' ? 'list' : 'folder')}
          >{viewMode === 'folder' ? <Folder size={15} /> : <List size={15} />}</ControlButton>
        ) : (
          <>
            <ControlButton
              iconOnly
              aria-label={text.folderView}
              aria-pressed={viewMode === 'folder'}
              data-xgc-active={viewMode === 'folder' ? 'true' : undefined}
              dataXgcRole={`${rolePrefix}-folder-view`} dataXgcId={`${rolePrefix}-folder-view`}
              title={text.folderView}
              onClick={() => onViewModeChange('folder')}
            ><Folder size={15} /></ControlButton>
            <ControlButton
              iconOnly
              aria-label={text.listView}
              aria-pressed={viewMode === 'list'}
              data-xgc-active={viewMode === 'list' ? 'true' : undefined}
              dataXgcRole={`${rolePrefix}-list-view`} dataXgcId={`${rolePrefix}-list-view`}
              title={text.listView}
              onClick={() => onViewModeChange('list')}
            ><List size={15} /></ControlButton>
          </>
        )}
        <SelectControl
          className="config-asset-catalog-sort"
          compact
          value={sortMode}
          options={[
            { value: 'updated-desc',label: text.recentlyUpdated },
            { value: 'updated-asc',label: text.oldestUpdated },
            { value: 'name-asc',label: text.nameAscending },
          ]}
          onChange={(value) => onSortModeChange(value as ConfigAssetSortMode)}
          icon={<ArrowDownUp size={15} />}
          ariaLabel={text.sort}
          dataXgcRole={`${rolePrefix}-sort`} dataXgcId={`${rolePrefix}-sort`}
        />
      </div>
      {createLabel && onCreate ? (
        <Button data-xgc-role={createRole} data-xgc-id={createRole} onClick={onCreate} tone="primary">
          <Plus aria-hidden="true" />
          {createLabel}
        </Button>
      ) : null}
    </div>
  );
}

function ProtectedCatalogVisibilityButton({
  rolePrefix,
  id,
  letter,
  toggle,
}: {
  rolePrefix: string;
  id: 'system' | 'templates';
  letter: 'S' | 'T';
  toggle: ConfigAssetProtectedVisibilityToggle;
}) {
  const label = toggle.hidden ? toggle.showLabel : toggle.hideLabel;
  return (
    <ControlButton
      iconOnly
      type="button"
      aria-label={label}
      aria-pressed={toggle.hidden}
      data-xgc-active={toggle.hidden ? 'true' : undefined}
      dataXgcRole={`${rolePrefix}-protected-visibility-toggle`}
      dataXgcId={id}
      title={label}
      onClick={() => toggle.onChange(!toggle.hidden)}
    >
      <ProtectedCatalogVisibilityIcon id={id} letter={letter} hidden={toggle.hidden} />
    </ControlButton>
  );
}

function ProtectedCatalogVisibilityIcon({
  id,
  letter,
  hidden,
}: {
  id: 'system' | 'templates';
  letter: 'S' | 'T';
  hidden: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      className="protected-catalog-visibility-icon"
      data-xgc-id={id}
      viewBox="0 0 18 18"
      width="18"
      height="18"
    >
      <text x="9" y="13.5" textAnchor="middle" fontSize="13.5" fontWeight="800" fill="currentColor">{letter}</text>
      {hidden && (
        <line
          className="protected-catalog-visibility-hidden-mark"
          x1="2"
          y1="2"
          x2="16"
          y2="16"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
