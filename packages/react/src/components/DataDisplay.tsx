import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TableHTMLAttributes,
} from 'react';
import { classNames } from '../utils';
import { Button } from './Button';

export type ToolbarProps = HTMLAttributes<HTMLDivElement>;

export function Toolbar({ className, ...props }: ToolbarProps) {
  return <div {...props} className={classNames('xgc-toolbar', className)} />;
}

export type StatCardProps = HTMLAttributes<HTMLElement> & {
  detail?: ReactNode;
  label: ReactNode;
  value: ReactNode;
};

export function StatCard({ className, detail, label, value, ...props }: StatCardProps) {
  return (
    <article {...props} className={classNames('xgc-stat-card', className)}>
      <span className="xgc-stat-card-label">{label}</span>
      <strong className="xgc-stat-card-value">{value}</strong>
      {detail ? <span className="xgc-stat-card-detail">{detail}</span> : null}
    </article>
  );
}

export type DataTableProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  empty?: boolean;
  emptyMessage?: ReactNode;
};

export function DataTable({
  children,
  className,
  empty = false,
  emptyMessage = 'No data',
  ...props
}: DataTableProps) {
  return (
    <div {...props} className={classNames('xgc-data-table', className)}>
      {empty ? <div className="xgc-data-table-empty">{emptyMessage}</div> : children}
    </div>
  );
}

export type DataTableSortDirection = 'ascending' | 'descending';

export type DataTableSort = {
  columnId: string;
  direction: DataTableSortDirection;
};

export type DataTableColumn<Row> = {
  cell: (row: Row) => ReactNode;
  className?: string;
  header: ReactNode;
  headerClassName?: string;
  id: string;
  sortLabel?: string;
  sortable?: boolean;
  sortValue?: (row: Row) => Date | number | string | null | undefined;
};

export type DataTableSelection<Row> = {
  getRowLabel?: (row: Row) => string;
  onChange: (selectedRowKeys: Set<string>) => void;
  rowHeaderLabel?: string;
  selectedRowKeys: ReadonlySet<string>;
};

export type SortableDataTableProps<Row> = Omit<DataTableProps, 'children' | 'empty'> & {
  columns: readonly DataTableColumn<Row>[];
  defaultSort?: DataTableSort;
  getRowProps?: (row: Row) => HTMLAttributes<HTMLTableRowElement>;
  manualSort?: boolean;
  onSortChange?: (sort: DataTableSort) => void;
  rowKey: (row: Row) => string;
  rows: readonly Row[];
  selection?: DataTableSelection<Row>;
  sort?: DataTableSort;
  tableProps?: TableHTMLAttributes<HTMLTableElement>;
};

function DataTableCheckbox({ indeterminate = false, ...props }: InputHTMLAttributes<HTMLInputElement> & { indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input {...props} ref={ref} type="checkbox" />;
}

function compareDataTableValues(
  left: Date | number | string | null | undefined,
  right: Date | number | string | null | undefined,
): number {
  if (left == null) return right == null ? 0 : 1;
  if (right == null) return -1;
  const normalizedLeft = left instanceof Date ? left.getTime() : left;
  const normalizedRight = right instanceof Date ? right.getTime() : right;
  if (typeof normalizedLeft === 'number' && typeof normalizedRight === 'number') {
    return normalizedLeft - normalizedRight;
  }
  return String(normalizedLeft).localeCompare(String(normalizedRight), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export function SortableDataTable<Row>({
  columns,
  defaultSort,
  emptyMessage,
  getRowProps,
  manualSort = false,
  onSortChange,
  rowKey,
  rows,
  selection,
  sort,
  tableProps,
  ...props
}: SortableDataTableProps<Row>) {
  const [internalSort, setInternalSort] = useState<DataTableSort | undefined>(defaultSort);
  const activeSort = sort ?? internalSort;
  const activeColumn = activeSort ? columns.find((column) => column.id === activeSort.columnId) : undefined;
  const visibleRows = useMemo(() => {
    if (manualSort || !activeSort || !activeColumn?.sortable || !activeColumn.sortValue) return [...rows];
    const direction = activeSort.direction === 'ascending' ? 1 : -1;
    return rows
      .map((row, index) => ({ index, row }))
      .sort((left, right) => (
        compareDataTableValues(activeColumn.sortValue?.(left.row), activeColumn.sortValue?.(right.row)) * direction
        || left.index - right.index
      ))
      .map(({ row }) => row);
  }, [activeColumn, activeSort, manualSort, rows]);

  const changeSort = (column: DataTableColumn<Row>) => {
    if (!column.sortable) return;
    const next: DataTableSort = {
      columnId: column.id,
      direction: activeSort?.columnId === column.id && activeSort.direction === 'ascending'
        ? 'descending'
        : 'ascending',
    };
    if (sort === undefined) setInternalSort(next);
    onSortChange?.(next);
  };

  const selectedOnPage = selection
    ? rows.filter((row) => selection.selectedRowKeys.has(rowKey(row))).length
    : 0;
  const allSelected = Boolean(selection && rows.length && selectedOnPage === rows.length);
  const someSelected = Boolean(selection && selectedOnPage > 0 && !allSelected);

  const toggleAll = () => {
    if (!selection) return;
    const next = new Set(selection.selectedRowKeys);
    if (allSelected) rows.forEach((row) => next.delete(rowKey(row)));
    else rows.forEach((row) => next.add(rowKey(row)));
    selection.onChange(next);
  };

  return (
    <DataTable {...props} empty={!rows.length} emptyMessage={emptyMessage}>
      <table {...tableProps} className={classNames('xgc-sortable-data-table', tableProps?.className)}>
        <thead>
          <tr>
            {selection ? (
              <th className="xgc-data-table-selection" scope="col">
                <DataTableCheckbox
                  aria-label={selection.rowHeaderLabel ?? 'Select all rows'}
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={toggleAll}
                />
              </th>
            ) : null}
            {columns.map((column) => {
              const direction = activeSort?.columnId === column.id ? activeSort.direction : undefined;
              return (
                <th
                  aria-sort={column.sortable ? direction ?? 'none' : undefined}
                  className={column.headerClassName}
                  key={column.id}
                  scope="col"
                >
                  {column.sortable ? (
                    <button
                      aria-label={`Sort by ${column.sortLabel ?? (typeof column.header === 'string' ? column.header : column.id)}`}
                      className="xgc-data-table-sort"
                      onClick={() => changeSort(column)}
                      type="button"
                    >
                      <span>{column.header}</span>
                      <span aria-hidden="true" className="xgc-data-table-sort-indicator">
                        {direction === 'ascending' ? '↑' : direction === 'descending' ? '↓' : '↕'}
                      </span>
                    </button>
                  ) : column.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => {
            const key = rowKey(row);
            const selected = selection?.selectedRowKeys.has(key) ?? false;
            const rowProps = getRowProps?.(row);
            return (
              <tr
                {...rowProps}
                aria-selected={selection ? selected : rowProps?.['aria-selected']}
                data-selected={selected || undefined}
                key={key}
              >
                {selection ? (
                  <td className="xgc-data-table-selection">
                    <DataTableCheckbox
                      aria-label={selection.getRowLabel?.(row) ?? `Select row ${key}`}
                      checked={selected}
                      onChange={() => {
                        const next = new Set(selection.selectedRowKeys);
                        if (selected) next.delete(key);
                        else next.add(key);
                        selection.onChange(next);
                      }}
                    />
                  </td>
                ) : null}
                {columns.map((column) => (
                  <td className={column.className} key={column.id}>{column.cell(row)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </DataTable>
  );
}

export type CodeBlockProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  content: string;
  copyLabel?: string;
  copySuccessLabel?: string;
  copyable?: boolean;
  label?: ReactNode;
  language?: 'bash' | 'json' | 'shell' | 'text';
  terminal?: boolean;
};

type SyntaxKind = 'comment' | 'keyword' | 'number' | 'string' | 'variable';

const shellPattern = /(#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\$\{[^}\n]+\}|\$[A-Za-z_][A-Za-z0-9_]*|--?[A-Za-z0-9][\w-]*|\b(?:apt-get|apt|bun|cd|curl|docker|echo|export|git|install|npm|pnpm|purge|remove|rm|sudo|systemctl|update|upgrade)\b|\b\d+(?:\.\d+)?\b)/g;
const jsonPattern = /("(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|\b(?:false|null|true)\b|-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)/gi;

function syntaxKind(token: string, language: 'bash' | 'json' | 'shell'): SyntaxKind {
  if (language === 'json') {
    if (token.startsWith('"')) return 'string';
    if (/^(?:false|null|true)$/i.test(token)) return 'keyword';
    return 'number';
  }
  if (token.startsWith('#')) return 'comment';
  if (token.startsWith('"') || token.startsWith("'")) return 'string';
  if (token.startsWith('$')) return 'variable';
  if (/^-?\d/.test(token)) return 'number';
  return 'keyword';
}

export function highlightCode(content: string, language: 'bash' | 'json' | 'shell'): ReactNode[] {
  const pattern = language === 'json' ? jsonPattern : shellPattern;
  pattern.lastIndex = 0;
  const output: ReactNode[] = [];
  let cursor = 0;
  for (const match of content.matchAll(pattern)) {
    const index = match.index ?? cursor;
    if (index > cursor) output.push(content.slice(cursor, index));
    output.push(
      <span className={`xgc-syntax-${syntaxKind(match[0], language)}`} key={`${index}-${match[0]}`}>
        {match[0]}
      </span>,
    );
    cursor = index + match[0].length;
  }
  if (cursor < content.length) output.push(content.slice(cursor));
  return output;
}

export function CodeBlock({
  className,
  content,
  copyLabel = 'Copy',
  copySuccessLabel = 'Copied',
  copyable = true,
  label,
  language = 'text',
  terminal = false,
  ...props
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!content || !navigator.clipboard) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return (
    <section
      {...props}
      className={classNames('xgc-code-block', className)}
      data-terminal={terminal || undefined}
    >
      {label || copyable ? (
        <header className="xgc-code-block-header">
          {label ? <strong>{label}</strong> : <span />}
          {copyable ? (
            <Button appearance="ghost" uiSize="compact" disabled={!content} onClick={() => void copy()}>
              {copied ? copySuccessLabel : copyLabel}
            </Button>
          ) : null}
        </header>
      ) : null}
      <pre><code data-language={language}>{language === 'text' ? content : highlightCode(content, language)}</code></pre>
    </section>
  );
}
