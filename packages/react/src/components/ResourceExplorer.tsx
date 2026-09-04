import {
  useMemo,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { classNames } from '../utils';
import './ResourceExplorer.css';

export type ResourceExplorerNode = {
  children?: readonly ResourceExplorerNode[];
  description?: ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
  id: string;
  label: ReactNode;
  trailing?: ReactNode;
};

export type ResourceExplorerProps = Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> & {
  ariaLabel: string;
  defaultExpandedIds?: readonly string[];
  expandedIds?: readonly string[];
  nodes: readonly ResourceExplorerNode[];
  onActivate?: (node: ResourceExplorerNode) => void;
  onExpandedIdsChange?: (ids: string[]) => void;
  onSelectedIdChange: (id: string) => void;
  selectedId?: string;
};

type VisibleNode = {
  level: number;
  node: ResourceExplorerNode;
  parentId?: string;
};

export function ResourceExplorer({
  ariaLabel,
  className,
  defaultExpandedIds = [],
  expandedIds,
  nodes,
  onActivate,
  onExpandedIdsChange,
  onKeyDown,
  onSelectedIdChange,
  selectedId,
  ...props
}: ResourceExplorerProps) {
  const [internalExpanded, setInternalExpanded] = useState(() => [...defaultExpandedIds]);
  const resolvedExpanded = expandedIds ?? internalExpanded;
  const expandedSet = useMemo(() => new Set(resolvedExpanded), [resolvedExpanded]);
  const visible = useMemo(() => flattenVisible(nodes, expandedSet), [expandedSet, nodes]);
  const enabled = visible.filter(({ node }) => !node.disabled);
  const fallbackId = enabled[0]?.node.id;
  const focusId = selectedId && enabled.some(({ node }) => node.id === selectedId)
    ? selectedId
    : fallbackId;

  const setExpanded = (next: Set<string>) => {
    const ids = [...next];
    if (expandedIds === undefined) setInternalExpanded(ids);
    onExpandedIdsChange?.(ids);
  };
  const toggle = (id: string, force?: boolean) => {
    const next = new Set(expandedSet);
    const shouldExpand = force ?? !next.has(id);
    if (shouldExpand) next.add(id);
    else next.delete(id);
    setExpanded(next);
  };
  const focusRow = (root: HTMLElement, id: string) => {
    queueMicrotask(() => {
      root.querySelector<HTMLElement>(`[data-xgc-resource-id="${cssEscape(id)}"]`)?.focus();
    });
  };
  const selectAndFocus = (root: HTMLElement, entry: VisibleNode | undefined) => {
    if (!entry || entry.node.disabled) return;
    onSelectedIdChange(entry.node.id);
    focusRow(root, entry.node.id);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    const target = event.target instanceof HTMLElement
      ? event.target.closest<HTMLElement>('[role="treeitem"]')
      : null;
    const currentId = target?.dataset.xgcResourceId ?? focusId;
    const currentIndex = enabled.findIndex(({ node }) => node.id === currentId);
    const current = enabled[currentIndex];
    if (!current) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = Math.max(0, Math.min(enabled.length - 1, currentIndex + direction));
      selectAndFocus(event.currentTarget, enabled[nextIndex]);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      selectAndFocus(event.currentTarget, event.key === 'Home' ? enabled[0] : enabled.at(-1));
      return;
    }
    if (event.key === 'ArrowRight') {
      const children = current.node.children ?? [];
      if (!children.length) return;
      event.preventDefault();
      if (!expandedSet.has(current.node.id)) {
        toggle(current.node.id, true);
      } else {
        selectAndFocus(event.currentTarget, enabled.find(({ node }) => node.id === children[0]?.id));
      }
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (current.node.children?.length && expandedSet.has(current.node.id)) {
        toggle(current.node.id, false);
      } else if (current.parentId) {
        selectAndFocus(event.currentTarget, enabled.find(({ node }) => node.id === current.parentId));
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      onSelectedIdChange(current.node.id);
      onActivate?.(current.node);
    }
  };

  return (
    <div
      {...props}
      aria-label={ariaLabel}
      className={classNames('xgc-resource-explorer', className)}
      onKeyDown={handleKeyDown}
      role="tree"
    >
      {visible.map(({ level, node }) => {
        const hasChildren = Boolean(node.children?.length);
        const expanded = hasChildren && expandedSet.has(node.id);
        const selected = node.id === selectedId;
        const rowStyle = { '--xgc-resource-level': level } as CSSProperties;
        return (
          <button
            aria-disabled={node.disabled || undefined}
            aria-expanded={hasChildren ? expanded : undefined}
            aria-level={level}
            aria-selected={selected}
            className="xgc-resource-explorer-item"
            data-xgc-resource-id={node.id}
            disabled={node.disabled}
            key={node.id}
            onClick={() => onSelectedIdChange(node.id)}
            onDoubleClick={() => onActivate?.(node)}
            role="treeitem"
            style={rowStyle}
            tabIndex={node.id === focusId ? 0 : -1}
            type="button"
          >
            <span
              aria-hidden="true"
              className="xgc-resource-explorer-disclosure"
              data-visible={hasChildren || undefined}
              onClick={(event) => {
                if (!hasChildren) return;
                event.stopPropagation();
                toggle(node.id);
              }}
            >
              <svg viewBox="0 0 12 12"><path d="m4 2 4 4-4 4" /></svg>
            </span>
            {node.icon ? <span className="xgc-resource-explorer-icon" aria-hidden="true">{node.icon}</span> : null}
            <span className="xgc-resource-explorer-copy">
              <span className="xgc-resource-explorer-label">{node.label}</span>
              {node.description ? <span className="xgc-resource-explorer-description">{node.description}</span> : null}
            </span>
            {node.trailing ? <span className="xgc-resource-explorer-trailing">{node.trailing}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function flattenVisible(
  nodes: readonly ResourceExplorerNode[],
  expanded: ReadonlySet<string>,
  level = 1,
  parentId?: string,
): VisibleNode[] {
  const flattened: VisibleNode[] = [];
  for (const node of nodes) {
    flattened.push({ level, node, parentId });
    if (node.children?.length && expanded.has(node.id)) {
      flattened.push(...flattenVisible(node.children, expanded, level + 1, node.id));
    }
  }
  return flattened;
}

function cssEscape(value: string) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}
