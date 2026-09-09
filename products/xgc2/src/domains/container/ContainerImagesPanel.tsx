import {
  ArrowUpFromLine,
  Download,
  Ellipsis,
  Info,
  Search,
  Tags,
  Trash2,
} from 'lucide-react';
import { useRef,useState } from 'react';
import {
  Input,
  InputActionControl,
  Pagination,
  Panel,
  SortableDataTable,
  Toolbar,
  type DataTableColumn,
} from '@xgc2/ui-react';
import { ConfigDrawer,ConfigDrawerDismissButton } from '../../components/ConfigDrawer';
import { ControlButton } from '../../components/controls/ControlButton';
import { InputControl,TextareaControl } from '../../components/controls/TextControls';
import { FormField } from '../../components/FormPrimitives';
import { AutomationPathPicker } from '../automation/automationPublic';
import type { DockerImageInfo } from './containerModel';
import {
  IMAGE_PAGE_SIZE_OPTIONS,
  imageRef,
  shortImageId,
  type ImageSortDir,
  type ImageSortKey,
} from './containerImageViewModel';
import { containerTableRangeSummary } from './containerTableRangeSummary';
import type { ImageBuildDraft,ImageTagDraft } from './useContainerImages';

export function ContainerImagesPanel({
  images,
  total,
  page,
  pageSize,
  sortKey,
  sortDir,
  pullValue,
  query,
  busy,
  buildOpen,
  buildDraft,
  tagDraft,
  targetId = 'local',
  onPullValueChange,
  onQueryChange,
  onPull,
  onRemove,
  onRefresh,
  onPrune,
  onPruneBuildCache,
  onExport,
  onImport,
  onPush,
  onInspect,
  onToggleSort,
  onPageChange,
  onPageSizeChange,
  onBuildOpenChange,
  onBuildDraftChange,
  onBuild,
  onTagDraftChange,
  onTag,
}: {
  images: DockerImageInfo[];
  total: number;
  page: number;
  pageSize: number;
  sortKey: ImageSortKey;
  sortDir: ImageSortDir;
  pullValue: string;
  query: string;
  busy: boolean;
  buildOpen: boolean;
  buildDraft: ImageBuildDraft;
  tagDraft: ImageTagDraft | null;
  /** Execution host id for build-context path browsing. */
  targetId?: string;
  onPullValueChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onPull: () => void;
  onRemove: (name: string) => void;
  onRefresh: () => void;
  onPrune: (all: boolean) => void;
  onPruneBuildCache: () => void;
  onExport: (name: string) => void;
  onImport: (file: File) => void;
  onPush: (name: string) => void;
  onInspect: (name: string) => void;
  onToggleSort: (key: ImageSortKey) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onBuildOpenChange: (open: boolean) => void;
  onBuildDraftChange: (draft: ImageBuildDraft) => void;
  onBuild: () => void;
  onTagDraftChange: (draft: ImageTagDraft | null) => void;
  onTag: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [contextPickerOpen,setContextPickerOpen] = useState(false);
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize,total);

  return (
    <Panel bodyLayout="column" className="container-section" data-xgc-role="container-images" data-xgc-id="container-images" fill padding="none">
      <div className="container-section-content">
      <Toolbar className="container-table-toolbar container-table-toolbar-multi" data-xgc-role="container-image-toolbar" data-xgc-id="container-image-toolbar">
        <div className="container-toolbar-left container-inline-fields">
          <InputControl
            aria-label="Image name"
            className="container-inline-field container-inline-field-wide"
            placeholder="Image name, e.g. redis:7-alpine"
            value={pullValue}
            onChange={onPullValueChange}
          />
          <ControlButton className="container-toolbar-text-action" disabled={busy || !pullValue.trim()} tone="primary" onClick={onPull} dataXgcRole="container-image-pull" dataXgcId="container-image-pull">
            Pull
          </ControlButton>
          <ControlButton className="container-toolbar-text-action" disabled={busy} onClick={() => fileInputRef.current?.click()} dataXgcRole="container-image-import" dataXgcId="container-image-import">
            Import
          </ControlButton>
          <ControlButton className="container-toolbar-text-action" disabled={busy} onClick={() => onBuildOpenChange(true)} dataXgcRole="container-image-build" dataXgcId="container-image-build">
            Build
          </ControlButton>
          <ControlButton className="container-toolbar-text-action" disabled={busy} title="Remove dangling (untagged) images" onClick={() => onPrune(false)} dataXgcRole="container-image-prune-dangling" dataXgcId="container-image-prune-dangling">
            Prune dangling
          </ControlButton>
          <ControlButton className="container-toolbar-text-action" disabled={busy} title="Remove all unused images" onClick={() => onPrune(true)} dataXgcRole="container-image-prune-unused" dataXgcId="container-image-prune-unused">
            Prune unused
          </ControlButton>
          <ControlButton className="container-toolbar-text-action" disabled={busy} title="Clear Docker builder cache" onClick={onPruneBuildCache} dataXgcRole="container-image-prune-build-cache" dataXgcId="container-image-prune-build-cache">
            Prune build cache
          </ControlButton>
        </div>
        <div className="container-toolbar-right">
          <Input
            aria-label="Search images"
            className="container-search"
            icon={<Search size={14} aria-hidden="true" />}
            placeholder="Search images"
            type="search"
            value={query}
            onValueChange={onQueryChange}
          />
          <ControlButton className="container-toolbar-text-action" disabled={busy} onClick={onRefresh} dataXgcRole="container-image-refresh" dataXgcId="container-image-refresh">
            Refresh
          </ControlButton>
        </div>
      </Toolbar>

      <input
        ref={fileInputRef}
        accept=".tar,.tar.gz,.tgz,application/x-tar,application/gzip"
        className="container-hidden-file-input"
        data-xgc-role="container-image-import-input" data-xgc-id="container-image-import-input"
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onImport(file);
        }}
      />

      <div className="container-table-panel" data-xgc-role="container-image-table-panel" data-xgc-id="container-image-table-panel">
        <SortableDataTable
          className="container-data-table-shell"
          columns={[
            sortableColumn('id','ID',(image) => {
              const name = imageRef(image);
              return (
                <ControlButton
                  appearance="ghost"
                  className="container-row-open-button container-code-cell"
                  dataXgcRole="container-image-open"
                  dataXgcId={name}
                  disabled={busy || !name}
                  title={`Inspect ${name}`}
                  onClick={() => onInspect(name)}
                >
                  {shortImageId(image.id)}
                </ControlButton>
              );
            }),
            sortableColumn('status','Status',(image) => (
              <span className="container-image-status" data-xgc-status={image.inUse ? 'used' : 'unused'}>
                {image.inUse ? 'In use' : 'Unused'}
              </span>
            )),
            sortableColumn('repository','Repository',(image) => image.repository || '-'),
            sortableColumn('tag','Tag',(image) => (
              <span className="container-image-tag">{image.tag || '-'}</span>
            )),
            sortableColumn('size','Size',(image) => image.size),
            sortableColumn('created','Created',(image) => image.createdAt),
            {
              id: 'operation',
              header: 'Operation',
              cell: (image) => {
                const name = imageRef(image);
                const disabled = busy || !name;
                return (
                  <div className="container-actions">
                    <ControlButton
                      aria-label={`Push ${name}`}
                      dataXgcId={name}
                      dataXgcRole="container-image-push"
                      disabled={disabled}
                      iconOnly
                      size="compact"
                      title={`Push ${name}`}
                      onClick={() => onPush(name)}
                    >
                      <ArrowUpFromLine size={13} aria-hidden="true" />
                    </ControlButton>
                    <ControlButton
                      aria-label={`Export ${name}`}
                      dataXgcId={name}
                      dataXgcRole="container-image-export"
                      disabled={disabled}
                      iconOnly
                      size="compact"
                      title={`Export ${name}`}
                      onClick={() => onExport(name)}
                    >
                      <Download size={13} aria-hidden="true" />
                    </ControlButton>
                    <ControlButton
                      aria-label={`Tag ${name}`}
                      dataXgcId={name}
                      dataXgcRole="container-image-tag"
                      disabled={disabled}
                      iconOnly
                      size="compact"
                      title={`Tag ${name}`}
                      onClick={() => onTagDraftChange({ source: name,target: '' })}
                    >
                      <Tags size={13} aria-hidden="true" />
                    </ControlButton>
                    <ControlButton
                      aria-label={`Inspect ${name}`}
                      dataXgcId={name}
                      dataXgcRole="container-image-inspect"
                      disabled={disabled}
                      iconOnly
                      size="compact"
                      title={`Inspect ${name}`}
                      onClick={() => onInspect(name)}
                    >
                      <Info size={13} aria-hidden="true" />
                    </ControlButton>
                    <ControlButton
                      aria-label={`Remove ${name}`}
                      dataXgcId={name}
                      dataXgcRole="container-image-remove"
                      disabled={disabled}
                      iconOnly
                      size="compact"
                      tone="danger"
                      title={`Remove ${name}`}
                      onClick={() => onRemove(name)}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </ControlButton>
                  </div>
                );
              },
            },
          ]}
          emptyMessage="No images"
          getRowProps={(image) => ({
            'data-xgc-role': 'container-image-row',
            'data-xgc-id': `${image.repository}:${image.tag}:${image.id}`,
          })}
          manualSort
          onSortChange={({ columnId }) => onToggleSort(columnId as ImageSortKey)}
          rowKey={(image) => `${image.repository}:${image.tag}:${image.id}`}
          rows={images}
          sort={{ columnId: sortKey,direction: sortDir === 'asc' ? 'ascending' : 'descending' }}
          tableProps={{ className: 'container-data-table','data-xgc-role': 'container-data-table','data-xgc-id': 'container-data-table' }}
        />
        <Toolbar className="container-image-footer" data-xgc-role="container-image-pagination" data-xgc-id="container-image-pagination" aria-busy={busy || undefined}>
          <span className="container-image-footer-summary">{containerTableRangeSummary({
            total,
            rangeStart,
            rangeEnd,
            emptyLabel: '0 images',
          })}</span>
          <fieldset className="container-image-footer-pagination" disabled={busy}>
            <Pagination labels={{ pageSizeSuffix: '/ page',rowsPerPage: 'Images per page' }} page={page} pageSize={pageSize} pageSizeOptions={IMAGE_PAGE_SIZE_OPTIONS} total={total} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />
          </fieldset>
        </Toolbar>
      </div>

      {buildOpen && (
        <ConfigDrawer
          title="Build image"
          bodyClassName="container-form-body"
          dataXgcRole="container-image-build-drawer" dataXgcId="container-image-build-drawer"
          onClose={() => onBuildOpenChange(false)}
          closeOnBackdrop={!busy}
          dismissible={!busy}
          footer={(
            <>
              <ConfigDrawerDismissButton disabled={busy}>Cancel</ConfigDrawerDismissButton>
              <ControlButton disabled={busy || !buildDraft.name.trim()} tone="primary" onClick={onBuild} dataXgcRole="container-image-build-submit" dataXgcId="container-image-build-submit">Build</ControlButton>
            </>
          )}
        >
          <FormField label="Image name" htmlFor="container-image-build-name">
            <InputControl
              id="container-image-build-name"
              autoFocus
              placeholder="my-app:latest"
              value={buildDraft.name}
              onChange={(name) => onBuildDraftChange({ ...buildDraft,name })}
            />
          </FormField>
          <FormField
            label="Context path"
            description="Optional host directory. Empty builds from the Dockerfile content below in a temporary context."
            dataXgcRole="container-image-build-path-field" dataXgcId="container-image-build-path-field"
          >
            <InputActionControl
              aria-label="Build context path"
              dataXgcRole="container-image-build-path" dataXgcId="container-image-build-path"
              placeholder="/path/to/build/context"
              value={buildDraft.path}
              actionLabel="Browse context"
              actionIcon={<Ellipsis size={16} aria-hidden="true" />}
              actionDisabled={busy}
              onValueChange={(path) => onBuildDraftChange({ ...buildDraft,path })}
              onAction={() => setContextPickerOpen(true)}
            />
          </FormField>
          <FormField
            label="Dockerfile"
            description="Required when context path is empty. With a context path, leave empty to use context/Dockerfile."
          >
            <TextareaControl
              className="container-list-field"
              value={buildDraft.dockerfile}
              onChange={(dockerfile) => onBuildDraftChange({ ...buildDraft,dockerfile })}
            />
          </FormField>
        </ConfigDrawer>
      )}

      {contextPickerOpen && (
        <AutomationPathPicker
          targetId={targetId}
          kind="directory"
          value={buildDraft.path}
          onSelect={(path) => {
            onBuildDraftChange({ ...buildDraft,path });
            setContextPickerOpen(false);
          }}
          onClose={() => setContextPickerOpen(false)}
        />
      )}

      {tagDraft && (
        <ConfigDrawer
          title="Tag image"
          bodyClassName="container-form-body"
          dataXgcRole="container-image-tag-drawer" dataXgcId="container-image-tag-drawer"
          onClose={() => onTagDraftChange(null)}
          closeOnBackdrop={!busy}
          dismissible={!busy}
          footer={(
            <>
              <ConfigDrawerDismissButton disabled={busy}>Cancel</ConfigDrawerDismissButton>
              <ControlButton disabled={busy || !tagDraft.target.trim()} tone="primary" onClick={onTag} dataXgcRole="container-image-tag-submit" dataXgcId="container-image-tag-submit">Tag</ControlButton>
            </>
          )}
        >
          <FormField label="Source">
            <InputControl value={tagDraft.source} disabled onChange={() => undefined} />
          </FormField>
          <FormField label="New tag" htmlFor="container-image-tag-target">
            <InputControl
              id="container-image-tag-target"
              autoFocus
              placeholder="registry.example.com/app:1.0.0"
              value={tagDraft.target}
              onChange={(target) => onTagDraftChange({ ...tagDraft,target })}
            />
          </FormField>
        </ConfigDrawer>
      )}
      </div>
    </Panel>
  );
}

function sortableColumn(
  id: ImageSortKey,
  header: string,
  cell: DataTableColumn<DockerImageInfo>['cell'],
): DataTableColumn<DockerImageInfo> {
  return {
    id,
    className: id === 'id' ? 'container-code-cell' : undefined,
    header,
    sortable: true,
    cell,
  };
}
