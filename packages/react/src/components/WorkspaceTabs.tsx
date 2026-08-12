import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { classNames } from '../utils';
import { Button } from './Button';
import { Input } from './Input';

const WORKSPACE_TAB_MIME = 'application/x-xgc-workspace-tab-id';

export type WorkspaceTabItem = {
  disabled?: boolean;
  icon?: ReactNode;
  id: string;
  label: string;
  prefix?: ReactNode;
};

export type WorkspaceTabsProps = {
  ariaLabel: string;
  className?: string;
  createDataXgcRole?: string;
  createIcon?: ReactNode;
  createLabel?: string;
  dataXgcId?: string;
  dataXgcRole?: string;
  deleteIcon?: ReactNode;
  deleteDataXgcRole?: string;
  deleteLabel?: (item: WorkspaceTabItem) => string;
  deleteTitle?: string;
  getTabTitle?: (item: WorkspaceTabItem, canReorder: boolean) => string | undefined;
  items: readonly WorkspaceTabItem[];
  itemDataXgcRole?: string;
  minimumItems?: number;
  onCreate?: () => void | Promise<void>;
  onDelete?: (id: string) => void;
  onRename?: (id: string, label: string) => void | Promise<void>;
  onReorder?: (orderedIds: string[]) => void;
  onValueChange: (id: string) => void;
  readOnly?: boolean;
  renameLabel?: (item: WorkspaceTabItem) => string;
  showCreate?: boolean;
  tabDataXgcRole?: string;
  value: string;
};

export function WorkspaceTabs({
  ariaLabel,
  className,
  createDataXgcRole,
  createIcon = <span aria-hidden="true">+</span>,
  createLabel = 'Add workspace',
  dataXgcId,
  dataXgcRole = 'workspace-tabs',
  deleteIcon = <span aria-hidden="true">×</span>,
  deleteDataXgcRole,
  deleteLabel = () => 'Delete workspace',
  deleteTitle,
  getTabTitle,
  items,
  itemDataXgcRole,
  minimumItems = 1,
  onCreate,
  onDelete,
  onRename,
  onReorder,
  onValueChange,
  readOnly = false,
  renameLabel = (item) => `Rename ${item.label}`,
  showCreate,
  tabDataXgcRole,
  value,
}: WorkspaceTabsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const canCreate = Boolean(onCreate) && (showCreate ?? !readOnly);
  const canDelete = Boolean(onDelete) && !readOnly && items.length > minimumItems;
  const canRename = Boolean(onRename) && !readOnly;
  const canReorder = Boolean(onReorder) && !readOnly && items.length > 1;

  const startRename = (item: WorkspaceTabItem) => {
    if (!canRename || item.disabled) return;
    setEditingId(item.id);
    setDraftLabel(item.label);
  };

  const commitRename = () => {
    const id = editingId;
    if (!id) return;
    setEditingId(null);
    void onRename?.(id, draftLabel);
  };

  const clearDrag = () => {
    setDraggingId(null);
    setDropTargetId(null);
  };

  const applyReorder = (fromId: string, toId: string) => {
    if (!onReorder || fromId === toId) return;
    const fromIndex = items.findIndex((item) => item.id === fromId);
    const toIndex = items.findIndex((item) => item.id === toId);
    if (fromIndex < 0 || toIndex < 0) return;
    const orderedIds = items.map((item) => item.id);
    const [moved] = orderedIds.splice(fromIndex, 1);
    if (!moved) return;
    orderedIds.splice(toIndex, 0, moved);
    onReorder(orderedIds);
  };

  const moveFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (!(event.target instanceof HTMLElement) || event.target.getAttribute('role') !== 'tab') return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const enabled = items.filter((item) => !item.disabled);
    if (!enabled.length) return;
    const current = Math.max(0, enabled.findIndex((item) => item.id === value));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? enabled.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length;
    const next = enabled[nextIndex];
    if (!next) return;
    event.preventDefault();
    onValueChange(next.id);
    Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      .find((tab) => tab.dataset.tabValue === next.id)
      ?.focus();
  };

  return (
    <nav
      aria-label={ariaLabel}
      className={classNames('xgc-workspace-tabs', className)}
      data-xgc-id={dataXgcId}
      data-xgc-role={dataXgcRole}
      onKeyDown={moveFocus}
      role="tablist"
    >
      <div className="xgc-workspace-tabs-scroll" data-xgc-role={`${dataXgcRole}-scroll`}>
        {items.map((item) => {
          if (editingId === item.id) {
            return (
              <Input
                aria-label={renameLabel(item)}
                autoFocus
                className="xgc-workspace-tab-input"
                key={item.id}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Enter') commitRename();
                  if (event.key === 'Escape') setEditingId(null);
                }}
                onValueChange={setDraftLabel}
                uiSize="compact"
                value={draftLabel}
              />
            );
          }
          const selected = value === item.id;
          return (
            <div
              className="xgc-workspace-tab"
              data-xgc-active={selected || undefined}
              data-xgc-dragging={draggingId === item.id || undefined}
              data-xgc-drop-target={dropTargetId === item.id && draggingId !== item.id || undefined}
              data-xgc-id={item.id}
              data-xgc-role={itemDataXgcRole}
              draggable={canReorder && !item.disabled || undefined}
              key={item.id}
              onDragEnd={clearDrag}
              onDragLeave={() => {
                if (dropTargetId === item.id) setDropTargetId(null);
              }}
              onDragOver={(event) => {
                if (!canReorder || !draggingId || draggingId === item.id || item.disabled) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                if (dropTargetId !== item.id) setDropTargetId(item.id);
              }}
              onDragStart={(event) => {
                if (!canReorder || item.disabled) return;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData(WORKSPACE_TAB_MIME, item.id);
                event.dataTransfer.setData('text/plain', item.id);
                setDraggingId(item.id);
              }}
              onDrop={(event) => {
                if (!canReorder || item.disabled) return;
                event.preventDefault();
                const fromId = event.dataTransfer.getData(WORKSPACE_TAB_MIME)
                  || event.dataTransfer.getData('text/plain')
                  || draggingId;
                if (fromId) applyReorder(fromId, item.id);
                clearDrag();
              }}
            >
              <button
                aria-selected={selected}
                className="xgc-workspace-tab-select"
                data-xgc-id={item.id}
                data-xgc-role={tabDataXgcRole}
                data-tab-value={item.id}
                disabled={item.disabled}
                onClick={() => onValueChange(item.id)}
                onDoubleClick={() => startRename(item)}
                role="tab"
                tabIndex={selected ? 0 : -1}
                title={getTabTitle?.(item, canReorder)}
                type="button"
              >
                {item.prefix ? <span className="xgc-workspace-tab-prefix">{item.prefix}</span> : null}
                {item.icon ? <span className="xgc-workspace-tab-icon" aria-hidden="true">{item.icon}</span> : null}
                <span className="xgc-workspace-tab-label">{item.label}</span>
              </button>
              {canDelete ? (
                <Button
                  appearance="ghost"
                  aria-label={deleteLabel(item)}
                  className="xgc-workspace-tab-delete"
                  data-xgc-id={item.id}
                  data-xgc-role={deleteDataXgcRole}
                  draggable={false}
                  iconOnly
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete?.(item.id);
                  }}
                  onDoubleClick={(event) => event.stopPropagation()}
                  onDragStart={(event) => event.preventDefault()}
                  title={deleteTitle ?? deleteLabel(item)}
                  tone="danger"
                  uiSize="compact"
                >
                  {deleteIcon}
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
      {canCreate ? (
        <Button
          appearance="ghost"
          aria-label={createLabel}
          className="xgc-workspace-tab-add"
          data-xgc-role={createDataXgcRole}
          iconOnly
          onClick={() => void onCreate?.()}
          title={createLabel}
        >
          {createIcon}
        </Button>
      ) : null}
    </nav>
  );
}
