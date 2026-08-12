import type {
  ButtonHTMLAttributes,
  ComponentType,
  DragEvent,
  HTMLAttributes,
  ReactNode,
} from 'react';
import { classNames } from '../utils';
import { Button } from './Button';
import { EmptyState } from './Feedback';
import { Input } from './Input';

export type ListPageFolder<T> = {
  id: string;
  isSystem?: boolean;
  items: T[];
  readOnly?: boolean;
  title: string;
};

export type ListPageItemIcon = ComponentType<{
  'aria-hidden'?: boolean;
  className?: string;
  size?: number | string;
}>;

type FolderProps = Omit<HTMLAttributes<HTMLElement>, 'onDrop' | 'onDragOver'> & {
  [key: `data-${string}`]: boolean | number | string | undefined;
};

export type ListPageProps<T> = {
  collapsedFolders?: string[];
  controls?: ReactNode;
  createLabel?: string;
  createRole?: string;
  dataXgcId?: string;
  dataXgcRole?: string;
  drag?: {
    getItemId: (item: T) => string;
    mimeType: string;
    onMove: (itemId: string, folderId: string) => void;
  };
  emptyActionLabel?: string;
  emptyAppearance?: 'illustrated' | 'plain';
  emptyDescription?: string;
  emptyTitle: string;
  folders: Array<ListPageFolder<T>>;
  getFolderProps?: (folder: ListPageFolder<T>) => FolderProps;
  listClassName?: string;
  onCreate?: () => void;
  onToggleFolder?: (folderId: string) => void;
  renderFolderActions?: (folder: ListPageFolder<T>) => ReactNode;
  renderFolderEmpty?: (folder: ListPageFolder<T>) => ReactNode;
  renderFolderTitle?: (folder: ListPageFolder<T>, collapsed: boolean) => ReactNode;
  renderItem: (item: T, dragProps: HTMLAttributes<HTMLElement>) => ReactNode;
  search?: {
    onChange: (value: string) => void;
    placeholder: string;
    role?: string;
    value: string;
  };
  showFolderHeaders?: boolean;
  title?: string;
};

export function ListPageItemMain({
  children,
  current = false,
  description,
  icon: Icon,
  onOpen,
  openLabel,
  tagRowClassName,
  tagRowId,
  tagRowRole,
  title,
}: {
  children?: ReactNode;
  current?: boolean;
  description?: string;
  icon: ListPageItemIcon;
  onOpen: () => void;
  openLabel: string;
  tagRowClassName?: string;
  tagRowId?: string;
  tagRowRole?: string;
  title: string;
}) {
  return (
    <div className="xgc-list-item-main" data-xgc-role="list-page-item-main">
      <div className="xgc-list-item-title">
        <button
          aria-current={current ? 'page' : undefined}
          aria-label={openLabel}
          className="xgc-list-row-open"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          type="button"
        >
          <Icon aria-hidden className="xgc-list-item-title-icon" size={15} />
          <strong>{title}</strong>
        </button>
      </div>
      <span className="xgc-list-item-subtitle">{description?.trim() || 'No description'}</span>
      <ListPageTagRow
        className={classNames('xgc-list-item-tags', tagRowClassName)}
        data-xgc-id={tagRowId}
        data-xgc-role={tagRowRole}
      >
        {children}
      </ListPageTagRow>
    </div>
  );
}

export function ListPageHost({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={classNames('xgc-list-page-host', className)} />;
}

export function ListPageRow({
  as = 'article',
  className,
  layout = 'catalog',
  selected = false,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: 'article' | 'div';
  layout?: 'catalog' | 'compact';
  selected?: boolean;
}) {
  const Element = as;
  return (
    <Element
      {...props}
      className={classNames('xgc-list-row', className)}
      data-xgc-layout={layout}
      data-xgc-selected={selected || undefined}
    />
  );
}

export function ListPageItemMeta({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={classNames('xgc-list-item-meta', className)} />;
}

export function ListPageItemActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={classNames('xgc-list-item-actions', className)} />;
}

export function ListPageTagRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={classNames('xgc-list-tag-row', className)} />;
}

export function ListPageTag({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={classNames('xgc-list-tag', className)} data-xgc-variant="static" />;
}

export function ListPageTagButton({
  className,
  type = 'button',
  variant = 'default',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'edit' | 'primary' }) {
  return (
    <button
      {...props}
      className={classNames('xgc-list-tag', className)}
      data-xgc-variant={variant}
      type={type}
    />
  );
}

export function ListPageFolderEmpty({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={classNames('xgc-list-folder-empty', className)} />;
}

export function ListPage<T>({
  collapsedFolders,
  controls,
  createLabel,
  createRole,
  dataXgcId,
  dataXgcRole,
  drag,
  emptyActionLabel,
  emptyAppearance = 'illustrated',
  emptyDescription,
  emptyTitle,
  folders,
  getFolderProps,
  listClassName,
  onCreate,
  onToggleFolder,
  renderFolderActions,
  renderFolderEmpty,
  renderFolderTitle,
  renderItem,
  search,
  showFolderHeaders = true,
  title,
}: ListPageProps<T>) {
  return (
    <section className="xgc-list-page" data-xgc-id={dataXgcId} data-xgc-role={dataXgcRole}>
      <div className="xgc-list-control-shell" data-xgc-role="list-page-controls">
        {title ? <div className="xgc-list-heading"><h1>{title}</h1></div> : null}
        {search ? (
          <Input
            className="xgc-list-search"
            containerProps={{ 'data-xgc-role': search.role }}
            onValueChange={search.onChange}
            placeholder={search.placeholder}
            type="search"
            value={search.value}
          />
        ) : null}
        {controls || createLabel && onCreate ? (
          <div className="xgc-list-controls">
            {controls}
            {createLabel && onCreate ? (
              <Button data-xgc-role={createRole} onClick={onCreate} tone="primary">
                <PlusIcon />
                {createLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={classNames('xgc-list-shell', listClassName)} data-xgc-role="list-page-items-scroll">
        {folders.length > 0 ? folders.map((folder) => {
          const collapsed = collapsedFolders?.includes(folder.id) ?? false;
          const dropAllowed = canDropInto(folder);
          const dropProps = drag ? {
            onDragOver: (event: DragEvent<HTMLElement>) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = dropAllowed ? 'move' : 'none';
            },
            onDrop: (event: DragEvent<HTMLElement>) => {
              event.preventDefault();
              if (!dropAllowed) return;
              const itemId = event.dataTransfer.getData(drag.mimeType);
              if (itemId) drag.onMove(itemId, folder.id);
            },
          } : {};
          if (!showFolderHeaders) {
            return (
              <div className="xgc-list-folder-items" key={folder.id}>
                {folder.items.map((item) => renderItem(item, createDragProps(item, folder)))}
              </div>
            );
          }
          return (
            <section
              {...(getFolderProps?.(folder) ?? {})}
              className="xgc-list-folder"
              data-xgc-collapsed={collapsed || undefined}
              key={folder.id}
              {...dropProps}
            >
              <div className="xgc-list-folder-header">
                <button className="xgc-list-folder-title" onClick={() => onToggleFolder?.(folder.id)} type="button">
                  {renderFolderTitle ? renderFolderTitle(folder, collapsed) : (
                    <>
                      <ChevronIcon collapsed={collapsed} />
                      <strong>{folder.title}</strong>
                      <span>{folder.items.length}</span>
                    </>
                  )}
                </button>
                {renderFolderActions?.(folder)}
              </div>
              {!collapsed ? (
                <div className="xgc-list-folder-items">
                  {folder.items.length > 0
                    ? folder.items.map((item) => renderItem(item, createDragProps(item, folder)))
                    : renderFolderEmpty?.(folder) ?? <ListPageFolderEmpty>No items</ListPageFolderEmpty>}
                </div>
              ) : null}
            </section>
          );
        }) : (
          <EmptyState
            actions={emptyActionLabel && onCreate ? (
              <Button onClick={onCreate} tone="primary"><PlusIcon />{emptyActionLabel}</Button>
            ) : undefined}
            appearance={emptyAppearance === 'plain' ? 'plain' : 'surface'}
            className="xgc-list-empty"
            description={emptyDescription}
            title={emptyTitle}
          />
        )}
      </div>
    </section>
  );

  function createDragProps(item: T, folder: ListPageFolder<T>): HTMLAttributes<HTMLElement> {
    if (!drag || !canDragFrom(folder)) return {};
    return {
      draggable: true,
      onDragStart: (event) => {
        event.dataTransfer.setData(drag.mimeType, drag.getItemId(item));
        event.dataTransfer.effectAllowed = 'move';
      },
    };
  }
}

function canDropInto<T>(folder: ListPageFolder<T>) {
  return !folder.readOnly && !folder.isSystem;
}

function canDragFrom<T>(folder: ListPageFolder<T>) {
  return !folder.readOnly && !folder.isSystem;
}

function PlusIcon() {
  return <svg aria-hidden="true" fill="none" height="15" viewBox="0 0 16 16" width="15"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" /></svg>;
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      aria-hidden="true"
      data-xgc-collapsed={collapsed || undefined}
      fill="none"
      height="14"
      viewBox="0 0 16 16"
      width="14"
    >
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}
