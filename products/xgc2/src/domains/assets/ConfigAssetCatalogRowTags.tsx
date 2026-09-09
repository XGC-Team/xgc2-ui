import { X } from 'lucide-react';
import { ListPageTagButton } from '../../components/ListPage';
import './config-asset-catalog-row-tags.css';

export function ConfigAssetCatalogRowTags({
  tags,
  tagFilter,
  resourceId,
  rolePrefix,
  filterLabel,
  showAllLabel,
  onTagFilterChange,
  editable = false,
  onRemoveTag,
  onEditTags,
  editLabel,
  removeLabel,
}: {
  tags: readonly string[];
  tagFilter: string;
  resourceId: string;
  rolePrefix: string;
  filterLabel: (tag: string) => string;
  showAllLabel: string;
  onTagFilterChange: (value: string) => void;
  editable?: boolean;
  onRemoveTag?: (tag: string) => void;
  onEditTags?: () => void;
  editLabel?: string;
  removeLabel?: (tag: string) => string;
}) {
  return (
    <>
      {tags.map((tag) => {
        if (editable) {
          const label = removeLabel?.(tag) ?? tag;
          return (
            <ListPageTagButton
              key={tag}
              title={label}
              aria-label={label}
              data-xgc-role={`${rolePrefix}-row-tag`}
              data-xgc-id={`${resourceId}:${tag}`}
              onClick={(event) => {
                event.stopPropagation();
                onRemoveTag?.(tag);
              }}
            >
              <span>{tag}</span><X size={12} />
            </ListPageTagButton>
          );
        }
        const selected = tagFilter === tag;
        const label = selected ? showAllLabel : filterLabel(tag);
        return (
          <ListPageTagButton
            key={tag}
            variant={selected ? 'primary' : 'default'}
            aria-pressed={selected}
            title={label}
            aria-label={label}
            data-xgc-role={`${rolePrefix}-row-tag`}
            data-xgc-id={`${resourceId}:${tag}`}
            onClick={(event) => {
              event.stopPropagation();
              onTagFilterChange(selected ? 'all' : tag);
            }}
          >
            {tag}
          </ListPageTagButton>
        );
      })}
      {editable ? (
        <ListPageTagButton
          variant="edit"
          className="config-asset-catalog-edit-tags"
          data-xgc-role={`${rolePrefix}-edit-tags`}
          data-xgc-id={resourceId}
          title={editLabel}
          aria-label={editLabel}
          onClick={(event) => {
            event.stopPropagation();
            onEditTags?.();
          }}
        >
          +
        </ListPageTagButton>
      ) : null}
    </>
  );
}
