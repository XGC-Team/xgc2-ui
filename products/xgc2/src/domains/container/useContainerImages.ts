import { useCallback,useEffect,useMemo,useState } from 'react';
import { useConfirmationDialog } from '@xgc2/ui-react';
import type { ApiTargetOptions } from '../../api/http';
import {
  buildContainerImage,
  inspectContainerImage,
  listContainerImages,
  loadContainerImage,
  pruneContainerBuildCache,
  pruneContainerImages,
  pullContainerImage,
  pushContainerImage,
  removeContainerImages,
  saveContainerImage,
  tagContainerImage,
} from './containerService';
import type { DockerImageInfo } from './containerModel';
import {
  filterImages,
  IMAGE_PAGE_SIZE_OPTIONS,
  imageRef,
  nextSortDir,
  paginateImages,
  sortImages,
  type ImageSortDir,
  type ImageSortKey,
} from './containerImageViewModel';
import { useContainerResourceState } from './useContainerResourceState';

export type ImageBuildDraft = {
  name: string;
  dockerfile: string;
  path: string;
};

export type ImageTagDraft = {
  source: string;
  target: string;
};

export function createImageBuildDraft(): ImageBuildDraft {
  return {
    name: '',
    dockerfile: 'FROM alpine:latest\nCMD ["sh"]\n',
    path: '',
  };
}

export function useContainerImages(target?: ApiTargetOptions,onMutation?: () => Promise<unknown> | unknown) {
  const [pullValue,setPullValue] = useState('');
  const [query,setQuery] = useState('');
  const [sortKey,setSortKey] = useState<ImageSortKey>('repository');
  const [sortDir,setSortDir] = useState<ImageSortDir>('asc');
  const [page,setPage] = useState(1);
  const [pageSize,setPageSize] = useState<number>(IMAGE_PAGE_SIZE_OPTIONS[1]);
  const [buildOpen,setBuildOpen] = useState(false);
  const [buildDraft,setBuildDraft] = useState(createImageBuildDraft);
  const [tagDraft,setTagDraft] = useState<ImageTagDraft | null>(null);
  const [inspectContent,setInspectContent] = useState('');
  const [inspectTitle,setInspectTitle] = useState('');
  const { confirm,dialog: confirmationDialog } = useConfirmationDialog();

  const load = useCallback(() => listContainerImages(target),[target]);
  const { value: images,busy,error,output,refresh,execute,clearOutput } = useContainerResourceState<DockerImageInfo[]>({
    initialValue: [],
    load,
    loadFailure: 'Failed to load images.',
    afterMutation: onMutation,
  });

  const prepared = useMemo(() => {
    const filtered = filterImages(images,query);
    const sorted = sortImages(filtered,sortKey,sortDir);
    return paginateImages(sorted,page,pageSize);
  },[images,page,pageSize,query,sortDir,sortKey]);

  useEffect(() => {
    if (prepared.page !== page) setPage(prepared.page);
  },[page,prepared.page]);

  const pull = useCallback(() => {
    const image = pullValue.trim();
    if (!image) return Promise.resolve(false);
    return execute(
      () => pullContainerImage(image,target),
      'Image pulled',
    );
  },[execute,pullValue,target]);

  const remove = useCallback(async (name: string) => {
    const image = images.find((item) => imageRef(item) === name || item.id === name);
    const inUse = Boolean(image?.inUse);
    if (!await confirm({
      title: inUse ? 'Image is in use' : 'Remove image',
      message: inUse
        ? `${name} is referenced by one or more containers. Force remove it anyway?`
        : `Delete image ${name}? This cannot be undone.`,
      confirmLabel: inUse ? 'Force remove' : 'Remove',
      tone: 'danger',
    })) return false;
    return execute(
      () => removeContainerImages([name],inUse,target),
      'Image removed',
      'Image remove failed',
    );
  },[confirm,execute,images,target]);

  const prune = useCallback(async (all: boolean) => {
    // Copy matches network/volume prune confirms: plain operator language, no CLI flags.
    if (!await confirm({
      title: all ? 'Prune unused images' : 'Prune dangling images',
      message: all
        ? 'Remove all unused images? Images still used by containers are kept.'
        : 'Remove dangling (untagged) images? Only untagged layers not referenced by any image are removed.',
      confirmLabel: 'Prune',
      tone: 'danger',
    })) return false;
    return execute(
      () => pruneContainerImages(all,target),
      all ? 'Unused images pruned' : 'Dangling images pruned',
    );
  },[confirm,execute,target]);

  const pruneBuildCache = useCallback(async () => {
    if (!await confirm({
      title: 'Prune build cache',
      message: 'Clear the Docker builder cache? This frees disk space but may slow the next build.',
      confirmLabel: 'Prune',
      tone: 'danger',
    })) return false;
    return execute(
      () => pruneContainerBuildCache(target),
      'Build cache pruned',
    );
  },[confirm,execute,target]);

  const exportImage = useCallback((name: string) => execute(async () => {
    const blob = await saveContainerImage(name,target);
    downloadBlob(blob,exportFilename(name));
    return { output: `Exported ${name}` };
  },'Image exported'),[execute,target]);

  const importImage = useCallback((file: File) => execute(
    () => loadContainerImage(file,target),
    'Image imported',
  ),[execute,target]);

  const tag = useCallback(() => {
    if (!tagDraft) return Promise.resolve(false);
    const source = tagDraft.source.trim();
    const targetRef = tagDraft.target.trim();
    if (!source || !targetRef) return Promise.resolve(false);
    return execute(
      () => tagContainerImage(source,targetRef,target),
      'Image tagged',
    ).then((ok) => {
      if (ok) setTagDraft(null);
      return ok;
    });
  },[execute,tagDraft,target]);

  const push = useCallback((name: string) => execute(
    () => pushContainerImage(name,target),
    'Image pushed',
  ),[execute,target]);

  const build = useCallback(() => {
    const name = buildDraft.name.trim();
    const path = buildDraft.path.trim();
    const dockerfile = buildDraft.dockerfile;
    if (!name) return Promise.resolve(false);
    if (!path && !dockerfile.trim()) return Promise.resolve(false);
    return execute(
      () => buildContainerImage({
        name,
        dockerfile: dockerfile.trim() ? dockerfile : undefined,
        path: path || undefined,
      },target),
      'Image built',
    ).then((ok) => {
      if (ok) {
        setBuildOpen(false);
        setBuildDraft(createImageBuildDraft());
      }
      return ok;
    });
  },[buildDraft,execute,target]);

  const inspect = useCallback(async (name: string) => {
    setInspectTitle(name);
    setInspectContent('Loading image inspect...');
    try {
      const result = await inspectContainerImage(name,target);
      setInspectContent(result.content || 'No inspect data.');
    } catch (cause) {
      setInspectContent(cause instanceof Error ? cause.message : String(cause));
    }
  },[target]);

  const closeInspect = useCallback(() => {
    setInspectContent('');
    setInspectTitle('');
  },[]);

  const toggleSort = useCallback((key: ImageSortKey) => {
    setSortDir((dir) => nextSortDir(sortKey,key,dir));
    setSortKey(key);
    setPage(1);
  },[sortKey]);

  const changeQuery = useCallback((value: string) => {
    setQuery(value);
    setPage(1);
  },[]);

  const changePageSize = useCallback((value: number) => {
    setPageSize(value);
    setPage(1);
  },[]);

  return {
    images: prepared.rows,
    total: prepared.total,
    page: prepared.page,
    pageCount: prepared.pageCount,
    pageSize,
    sortKey,
    sortDir,
    busy,
    error,
    output,
    inspectContent,
    inspectTitle,
    pullValue,
    query,
    buildOpen,
    buildDraft,
    tagDraft,
    confirmationDialog,
    refresh,
    pull,
    remove,
    prune,
    pruneBuildCache,
    exportImage,
    importImage,
    tag,
    push,
    build,
    inspect,
    closeInspect,
    closeOutput: clearOutput,
    setPullValue,
    setQuery: changeQuery,
    setPage,
    setPageSize: changePageSize,
    toggleSort,
    setBuildOpen,
    setBuildDraft,
    setTagDraft,
  };
}

function exportFilename(name: string): string {
  const base = name.replace(/[/:]/g, '_').replace(/^[._-]+|[._-]+$/g, '') || 'image';
  return `${base}.tar`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
