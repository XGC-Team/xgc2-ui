import {
  SortableDataTable as FamilySortableDataTable,
  type SortableDataTableProps,
} from '@xgc2/ui-react';
import { useLayoutEffect, useRef } from 'react';

export type { SortableDataTableProps };

type MarkableTableProps = {
  'data-xgc-id'?: string;
  dataXgcId?: string;
};

/**
 * Family SortableDataTable always hangs `data-xgc-role="data-table-row-viewport"`
 * on tbody and never stamps `data-xgc-id`. Parked System tabs keep several of
 * those tbodies in the DOM, so Marker emits a role-only selector. Stamp the
 * table entity id onto the viewport; do not wait for a new ui-react tarball.
 * Wrapper is anonymous `display:contents` glue with no role (V13).
 */
export function SortableDataTable<Row>(props: SortableDataTableProps<Row>) {
  const hostRef = useRef<HTMLDivElement>(null);
  const markable = props as SortableDataTableProps<Row> & MarkableTableProps;
  const viewportId = String(markable.dataXgcId ?? markable['data-xgc-id'] ?? 'data-table-row-viewport');
  useLayoutEffect(() => {
    const viewport = hostRef.current?.querySelector<HTMLElement>('[data-xgc-role="data-table-row-viewport"]');
    if (!viewport) return;
    viewport.setAttribute('data-xgc-id', viewportId);
  }, [viewportId, props.rows, props.bodyScroll, props.emptyMode]);
  return (
    <div ref={hostRef} style={{ display: 'contents' }}>
      <FamilySortableDataTable {...props} />
    </div>
  );
}
