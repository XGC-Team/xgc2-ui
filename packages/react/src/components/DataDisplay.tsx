import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TableHTMLAttributes,
} from 'react';
import { classNames } from '../utils';
import { Button } from './Button';
import { Select } from './FormControls';

export type ToolbarProps = HTMLAttributes<HTMLDivElement>;

export function Toolbar({ className, ...props }: ToolbarProps) {
  return <div {...props} className={classNames('xgc-toolbar', className)} />;
}

type StatCardContentProps = {
  detail?: ReactNode;
  label: ReactNode;
  value: ReactNode;
};

export type StatCardProps = HTMLAttributes<HTMLElement> & StatCardContentProps;
export type StatCardButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & StatCardContentProps;

export function StatCard({ className, detail, label, value, ...props }: StatCardProps) {
  return (
    <article {...props} className={classNames('xgc-stat-card', className)}>
      <span className="xgc-stat-card-label">{label}</span>
      <strong className="xgc-stat-card-value">{value}</strong>
      {detail ? <span className="xgc-stat-card-detail">{detail}</span> : null}
    </article>
  );
}

/** Clickable statistic with the same surface contract and native button semantics. */
export function StatCardButton({ className, detail, label, value, ...props }: StatCardButtonProps) {
  const generatedId = useId();
  const ariaLabel = props['aria-label'];
  const ariaLabelledBy = props['aria-labelledby'];
  const labelId = `${generatedId}-label`;
  const valueId = `${generatedId}-value`;
  return (
    <button
      {...props}
      aria-labelledby={ariaLabel || ariaLabelledBy ? ariaLabelledBy : `${labelId} ${valueId}`}
      className={classNames('xgc-stat-card xgc-stat-card-button', className)}
      type="button"
    >
      <span className="xgc-stat-card-label" id={labelId}>{label}</span>
      <strong className="xgc-stat-card-value" id={valueId}>{value}</strong>
      {detail ? <span className="xgc-stat-card-detail">{detail}</span> : null}
    </button>
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

export type DataTableDataAttributes = {
  [key: `data-${string}`]: string | number | boolean | undefined;
};

export type DataTableCellProps = HTMLAttributes<HTMLTableCellElement> & DataTableDataAttributes;
export type DataTableRowProps = HTMLAttributes<HTMLTableRowElement> & DataTableDataAttributes;
export type DataTableTableProps = TableHTMLAttributes<HTMLTableElement> & DataTableDataAttributes;

export type DataTableColumn<Row> = {
  cell: (row: Row) => ReactNode;
  className?: string;
  cellProps?: DataTableCellProps | ((row: Row) => DataTableCellProps);
  header: ReactNode;
  headerClassName?: string;
  id: string;
  sortLabel?: string;
  sortable?: boolean;
  sortValue?: (row: Row) => Date | number | string | null | undefined;
};

export type DataTableSelection<Row> = {
  disabled?: boolean;
  getRowLabel?: (row: Row) => string;
  onChange: (selectedRowKeys: Set<string>) => void;
  rowHeaderLabel?: string;
  selectedRowKeys: ReadonlySet<string>;
};

export type SortableDataTableProps<Row> = Omit<DataTableProps, 'children' | 'empty'> & {
  /** Keep the table header outside the bounded vertical row viewport. */
  bodyScroll?: boolean;
  /** Accessible name for the keyboard-scrollable row viewport. */
  bodyScrollLabel?: string;
  columns: readonly DataTableColumn<Row>[];
  defaultSort?: DataTableSort;
  getRowProps?: (row: Row) => DataTableRowProps;
  manualSort?: boolean;
  onSortChange?: (sort: DataTableSort) => void;
  rowKey: (row: Row) => string;
  rows: readonly Row[];
  selection?: DataTableSelection<Row>;
  sort?: DataTableSort;
  tableProps?: DataTableTableProps;
};

function DataTableCheckbox({ indeterminate = false, onClick, ...props }: InputHTMLAttributes<HTMLInputElement> & { indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      {...props}
      ref={ref}
      type="checkbox"
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
    />
  );
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
  bodyScroll = false,
  bodyScrollLabel = 'Table rows',
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
  const [bodyColumnWidths, setBodyColumnWidths] = useState<number[]>([]);
  const bodyViewportRef = useRef<HTMLTableSectionElement>(null);
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

  useLayoutEffect(() => {
    if (!bodyScroll) {
      setBodyColumnWidths([]);
      return undefined;
    }
    const viewport = bodyViewportRef.current;
    if (!viewport) return undefined;
    const synchronizeColumns = () => {
      const firstRow = viewport.rows.item(0);
      const nextWidths = firstRow
        ? Array.from(firstRow.cells, (cell) => cell.getBoundingClientRect().width)
        : [];
      setBodyColumnWidths((current) => (
        current.length === nextWidths.length
        && current.every((width, index) => Math.abs(width - (nextWidths[index] ?? width)) < 0.25)
          ? current
          : nextWidths
      ));
    };
    synchronizeColumns();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(synchronizeColumns);
    observer.observe(viewport);
    const firstRow = viewport.rows.item(0);
    if (firstRow) observer.observe(firstRow);
    return () => observer.disconnect();
  }, [bodyScroll, columns, selection, visibleRows]);

  const toggleAll = () => {
    if (!selection) return;
    const next = new Set(selection.selectedRowKeys);
    if (allSelected) rows.forEach((row) => next.delete(rowKey(row)));
    else rows.forEach((row) => next.add(rowKey(row)));
    selection.onChange(next);
  };

  return (
    <DataTable
      {...props}
      data-body-scroll={bodyScroll || undefined}
      empty={!rows.length}
      emptyMessage={emptyMessage}
    >
      <table {...tableProps} className={classNames('xgc-sortable-data-table', tableProps?.className)}>
        <thead>
          <tr>
            {selection ? (
              <th
                className="xgc-data-table-selection"
                scope="col"
                style={bodyColumnWidths[0] === undefined ? undefined : { width: bodyColumnWidths[0] }}
              >
                <DataTableCheckbox
                  aria-label={selection.rowHeaderLabel ?? 'Select all rows'}
                  checked={allSelected}
                  disabled={selection.disabled}
                  indeterminate={someSelected}
                  onChange={toggleAll}
                />
              </th>
            ) : null}
            {columns.map((column, index) => {
              const direction = activeSort?.columnId === column.id ? activeSort.direction : undefined;
              return (
                <th
                  aria-sort={column.sortable ? direction ?? 'none' : undefined}
                  className={column.headerClassName}
                  key={column.id}
                  scope="col"
                  style={bodyColumnWidths[index + (selection ? 1 : 0)] === undefined
                    ? undefined
                    : { width: bodyColumnWidths[index + (selection ? 1 : 0)] }}
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
        <tbody
          aria-label={bodyScroll ? bodyScrollLabel : undefined}
          data-xgc-role="data-table-row-viewport"
          ref={bodyViewportRef}
          tabIndex={bodyScroll ? 0 : undefined}
        >
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
                  <td
                    className="xgc-data-table-selection"
                    style={bodyColumnWidths[0] === undefined ? undefined : { width: bodyColumnWidths[0] }}
                  >
                    <DataTableCheckbox
                      aria-label={selection.getRowLabel?.(row) ?? `Select row ${key}`}
                      checked={selected}
                      disabled={selection.disabled}
                      onChange={() => {
                        const next = new Set(selection.selectedRowKeys);
                        if (selected) next.delete(key);
                        else next.add(key);
                        selection.onChange(next);
                      }}
                    />
                  </td>
                ) : null}
                {columns.map((column, index) => (
                  (() => {
                    const cellProps = typeof column.cellProps === 'function'
                      ? column.cellProps(row)
                      : column.cellProps;
                    return (
                      <td
                        {...cellProps}
                        className={classNames(column.className, cellProps?.className)}
                        key={column.id}
                        style={{
                          ...cellProps?.style,
                          ...(bodyColumnWidths[index + (selection ? 1 : 0)] === undefined
                            ? undefined
                            : { width: bodyColumnWidths[index + (selection ? 1 : 0)] }),
                        }}
                      >
                        {column.cell(row)}
                      </td>
                    );
                  })()
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </DataTable>
  );
}

export type PaginationLabels = {
  next: string;
  page: string;
  pageSizeSuffix: string;
  previous: string;
  rowsPerPage: string;
  total: string;
};

export type PaginationProps = Omit<HTMLAttributes<HTMLElement>, 'onChange'> & {
  hidePageSize?: boolean;
  labels?: Partial<PaginationLabels>;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  page: number;
  pageSize: number;
  pageSizeOptions?: readonly number[];
  total: number;
};

const defaultPaginationLabels: PaginationLabels = {
  next: 'Next page',
  page: 'Page',
  pageSizeSuffix: '',
  previous: 'Previous page',
  rowsPerPage: 'Rows per page',
  total: 'Total',
};

export function Pagination({
  className,
  hidePageSize = false,
  labels,
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  pageSizeOptions = [20, 50, 100],
  total,
  ...props
}: PaginationProps) {
  const copy = { ...defaultPaginationLabels, ...labels };
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : pageSizeOptions[0] ?? 20;
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / safePageSize));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  return (
    <footer {...props} className={classNames('xgc-pagination', className)}>
      <span className="xgc-pagination-total">{copy.total} {Math.max(0, total)}</span>
      {hidePageSize ? null : (
        <Select
          aria-label={copy.rowsPerPage}
          uiSize="compact"
          value={String(safePageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value))}
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>{size}{copy.pageSizeSuffix ? ` ${copy.pageSizeSuffix}` : ''}</option>
          ))}
        </Select>
      )}
      <Button
        appearance="ghost"
        iconOnly
        uiSize="compact"
        aria-label={copy.previous}
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
      ><span aria-hidden="true">‹</span></Button>
      <strong aria-label={`${copy.page} ${currentPage} / ${totalPages}`}>{currentPage} / {totalPages}</strong>
      <Button
        appearance="ghost"
        iconOnly
        uiSize="compact"
        aria-label={copy.next}
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      ><span aria-hidden="true">›</span></Button>
    </footer>
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
  viewport?: 'compact' | 'default';
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
  viewport = 'default',
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
      data-viewport={viewport}
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
