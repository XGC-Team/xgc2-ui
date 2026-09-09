import { ListPageItemMain as FamilyListPageItemMain } from '@xgc2/ui-react';
import { useLayoutEffect, useRef, type ComponentProps } from 'react';

export {
  ListPage,
  ListPageFolderEmpty,
  ListPageHost,
  ListPageItemActions,
  ListPageItemMeta,
  ListPageRow,
  ListPageTag,
  ListPageTagButton,
  ListPageTagRow,
} from '@xgc2/ui-react';

export type {
  ListPageFolder,
  ListPageItemIcon,
  ListPageProps,
} from '@xgc2/ui-react';

type ListPageItemMainProps = ComponentProps<typeof FamilyListPageItemMain> & {
  dataXgcId?: string;
  /** Leaf role stamped onto `.xgc-list-row-open`. Requires `dataXgcId`. */
  titleRole?: string;
  /** Leaf role stamped onto `.xgc-list-item-subtitle`. Requires `dataXgcId`. */
  descriptionRole?: string;
};

function stampLeaf(host: HTMLElement, selector: string, role: string | undefined, id: string | undefined) {
  const leaf = host.querySelector<HTMLElement>(selector);
  if (!leaf) return;
  if (role && id) {
    leaf.setAttribute('data-xgc-role', role);
    leaf.setAttribute('data-xgc-id', id);
    return;
  }
  leaf.removeAttribute('data-xgc-role');
  leaf.removeAttribute('data-xgc-id');
}

/**
 * Family `ListPageItemMain` hardcodes `data-xgc-role="list-page-item-main"` and
 * does not spread unknown attributes onto that host. Do not fork `@xgc2/ui-react`.
 * Stamp `data-xgc-id` onto the family chrome after mount, and optionally stamp
 * title/description leaf roles so Marker can lock those controls instead of the
 * whole main cluster. The product wrapper is anonymous `display:contents` glue
 * (no role) so catalog grid layout stays intact.
 *
 * Family `ListPage` already accepts `dataXgcId` / `dataXgcRole` on the page
 * section. Inner `list-page-controls` / `list-page-items-scroll` hosts live in
 * ui-react and cannot receive ids from this file set.
 */
export function ListPageItemMain({
  dataXgcId,
  titleRole,
  descriptionRole,
  ...props
}: ListPageItemMainProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = hostRef.current?.querySelector<HTMLElement>('[data-xgc-role="list-page-item-main"]');
    if (!host) return;
    if (dataXgcId) host.setAttribute('data-xgc-id', dataXgcId);
    else host.removeAttribute('data-xgc-id');
    stampLeaf(host, ':scope .xgc-list-row-open', titleRole, dataXgcId);
    stampLeaf(host, ':scope .xgc-list-item-subtitle', descriptionRole, dataXgcId);
  }, [dataXgcId, descriptionRole, titleRole]);
  return (
    <div ref={hostRef} style={{ display: 'contents' }}>
      <FamilyListPageItemMain {...props} />
    </div>
  );
}
