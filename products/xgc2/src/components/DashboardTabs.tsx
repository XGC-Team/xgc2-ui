import { WorkspaceTabs } from '@xgc2/ui-react';
import { Plus,X } from 'lucide-react';
import type { LocalizedText } from '../shared/localization/localizedText';

type DashboardTabItem = {
  id: string;
  name: string;
};

export function DashboardTabs({
  dashboards,
  activeDashboardId,
  onChange,
  onRename,
  onDelete,
  onCreate,
  onReorder,
  readOnly,
  showCreate,
  text,
}: {
  dashboards: DashboardTabItem[];
  activeDashboardId: string;
  onChange: (id: string) => void;
  onRename: (id: string, name: string) => void | Promise<void>;
  onDelete: (id: string) => void;
  onCreate: () => void | Promise<void>;
  /** When set and editable, tabs can be drag-reordered. Receives the full id order. */
  onReorder?: (orderedIds: string[]) => void;
  /** When true, rename/delete/reorder are hidden. Create uses showCreate (defaults to !readOnly). */
  readOnly?: boolean;
  /** Explicit create affordance; defaults to !readOnly so existing callers keep working. */
  showCreate?: boolean;
  text: LocalizedText;
}) {
  const t = text;
  return <WorkspaceTabs
    ariaLabel={t('Experiment dashboards')}
    createDataXgcRole="experiment-dashboard-add"
    createIcon={<Plus size={14} aria-hidden="true" />}
    createLabel={t('Add dashboard')}
    dataXgcId="experiment-dashboard-tabs"
    dataXgcRole="experiment-dashboard-tabs"
    deleteIcon={<X size={12} aria-hidden="true" />}
    deleteLabel={(dashboard) => t('Delete dashboard {name}', { name: dashboard.label })}
    deleteTitle={t('Delete dashboard')}
    getTabTitle={(_, canReorder) => readOnly
      ? undefined
      : t(canReorder ? 'Drag to reorder · Double click to rename' : 'Double click to rename')}
    items={dashboards.map((dashboard) => ({
      id: dashboard.id,
      label: dashboard.name,
    }))}
    itemDataXgcRole="experiment-dashboard-tab"
    onCreate={onCreate}
    onDelete={onDelete}
    onRename={onRename}
    onReorder={onReorder}
    onValueChange={onChange}
    readOnly={readOnly}
    renameLabel={(dashboard) => t('Rename dashboard {name}', { name: dashboard.label })}
    showCreate={showCreate}
    tabDataXgcRole="experiment-dashboard-tab-control"
    value={activeDashboardId}
  />;
}
