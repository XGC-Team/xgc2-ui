import { useCallback,useEffect,useMemo,useState } from 'react';
import { useConfirmationDialog } from '@xgc2/ui-react';
import type { ApiTargetOptions } from '../../api/http';
import {
  createContainerVolume,
  inspectContainerVolume,
  listContainerVolumes,
  pruneContainerVolumes,
  removeContainerVolume,
  removeContainerVolumes,
} from './containerService';
import type { DockerVolumeInfo } from './containerModel';
import {
  createVolumeDraft,
  filterDockerVolumes,
  paginateItems,
  volumeDraftIsValid,
  volumeDraftToCreateBody,
  type VolumeDraft,
} from './containerViewModel';
import { containerErrorMessage,useContainerResourceState } from './useContainerResourceState';

const defaultPageSize = 20;

export function useContainerVolumes(target?: ApiTargetOptions,onMutation?: () => Promise<unknown> | unknown) {
  const [draft,setDraft] = useState<VolumeDraft>(createVolumeDraft);
  const [drawerOpen,setDrawerOpen] = useState(false);
  const [query,setQuery] = useState('');
  const [page,setPage] = useState(1);
  const [pageSize,setPageSize] = useState(defaultPageSize);
  const [selected,setSelected] = useState<string[]>([]);
  const [inspectContent,setInspectContent] = useState('');
  const [inspectName,setInspectName] = useState('');
  const [createError,setCreateError] = useState('');
  const { confirm,dialog: confirmationDialog } = useConfirmationDialog();
  const load = useCallback(() => listContainerVolumes(target),[target]);
  const { value: volumes,busy,error,output,refresh,execute,clearOutput } = useContainerResourceState<DockerVolumeInfo[]>({
    initialValue: [],
    load,
    loadFailure: 'Failed to load volumes.',
    afterMutation: onMutation,
  });

  const filteredVolumes = useMemo(() => filterDockerVolumes(volumes,query),[volumes,query]);
  const pageView = useMemo(() => paginateItems(filteredVolumes, page, pageSize), [filteredVolumes,page,pageSize]);

  useEffect(() => {
    if (pageView.page !== page) setPage(pageView.page);
  }, [page,pageView.page]);

  const create = useCallback(async () => {
    setCreateError('');
    if (!volumeDraftIsValid(draft)) {
      setCreateError(draft.nfsEnabled
        ? 'NFS volumes require a name, NFS address, and remote mount path.'
        : 'Volume name is required.');
      return false;
    }
    const created = await execute(
      () => createContainerVolume(volumeDraftToCreateBody(draft),target),
      'Volume created',
    );
    if (created) {
      setDrawerOpen(false);
      setDraft(createVolumeDraft());
      setCreateError('');
    }
    return created;
  },[draft,execute,target]);

  const remove = useCallback(async (name: string) => {
    const volume = volumes.find((item) => item.name === name);
    if (volume?.inUse) {
      if (!await confirm({
        title: 'Volume is in use',
        message: `${name} is mounted by ${volume.links ?? 'one or more'} container link(s). Force remove with docker volume rm --force?`,
        confirmLabel: 'Force remove',
        tone: 'danger',
      })) return false;
      const removed = await execute(
        () => removeContainerVolume(name,{ ...target,force: true }),
        'Volume removed',
        'Volume remove failed',
      );
      if (removed) setSelected((current) => current.filter((item) => item !== name));
      return removed;
    }
    if (!await confirm({
      title: 'Remove volume',
      message: `Delete volume ${name}? This cannot be undone.`,
      confirmLabel: 'Remove',
      tone: 'danger',
    })) return false;
    const removed = await execute(
      () => removeContainerVolume(name,target),
      'Volume removed',
      'Volume remove failed',
    );
    if (removed) setSelected((current) => current.filter((item) => item !== name));
    return removed;
  },[confirm,execute,target,volumes]);

  const removeSelected = useCallback(async () => {
    if (selected.length === 0) return false;
    const inUseNames = selected.filter((name) => volumes.find((item) => item.name === name)?.inUse);
    const force = inUseNames.length > 0;
    if (!await confirm({
      title: force ? 'Remove volumes (some in use)' : 'Remove volumes',
      message: force
        ? `Delete ${selected.length} volume(s)? In use: ${inUseNames.join(', ')}. Force (docker volume rm --force) will be used.`
        : `Delete ${selected.length} volume(s)? This cannot be undone.`,
      confirmLabel: force ? 'Force remove' : 'Remove',
      tone: 'danger',
    })) return false;
    const accepted = await execute(
      () => removeContainerVolumes(selected, force, target),
      'Volumes removed',
      'Volume remove failed',
    );
    if (accepted) setSelected([]);
    return accepted;
  },[confirm,execute,selected,target,volumes]);

  const prune = useCallback(async () => {
    if (!await confirm({
      title: 'Prune unused volumes',
      message: 'Remove all unused local volumes? Volumes in use by containers are kept.',
      confirmLabel: 'Prune',
      tone: 'danger',
    })) return false;
    return execute(
      () => pruneContainerVolumes(target),
      'Unused volumes pruned',
    );
  },[confirm,execute,target]);

  const showInspect = useCallback(async (name: string) => {
    setInspectName(name);
    setInspectContent('Loading inspect...');
    try {
      const result = await inspectContainerVolume(name,target);
      setInspectContent(result.content);
    } catch (cause) {
      setInspectContent(containerErrorMessage(cause,'Inspect failed'));
    }
  },[target]);

  const closeInspect = useCallback(() => {
    setInspectName('');
    setInspectContent('');
  },[]);

  const toggleSelected = useCallback((name: string, checked: boolean) => {
    setSelected((current) => {
      if (checked) return current.includes(name) ? current : [...current,name];
      return current.filter((item) => item !== name);
    });
  },[]);

  const toggleSelectAllVisible = useCallback((checked: boolean) => {
    const visible = pageView.items.map((volume) => volume.name);
    setSelected((current) => {
      if (!checked) return current.filter((name) => !visible.includes(name));
      const next = new Set(current);
      for (const name of visible) next.add(name);
      return Array.from(next);
    });
  },[pageView.items]);

  const setQuerySafe = useCallback((value: string) => {
    setQuery(value);
    setPage(1);
  },[]);

  const setPageSizeSafe = useCallback((value: number) => {
    setPageSize(value);
    setPage(1);
  },[]);

  return {
    volumes: pageView.items,
    allVolumes: volumes,
    total: pageView.total,
    page: pageView.page,
    pageSize: pageView.pageSize,
    pages: pageView.pages,
    busy,
    error,
    output,
    draft,
    drawerOpen,
    query,
    selected,
    inspectName,
    inspectContent,
    createError,
    confirmationDialog,
    refresh,
    create,
    remove,
    removeSelected,
    prune,
    showInspect,
    closeInspect,
    closeOutput: clearOutput,
    setDraft,
    setDrawerOpen,
    setQuery: setQuerySafe,
    setPage,
    setPageSize: setPageSizeSafe,
    setCreateError,
    toggleSelected,
    toggleSelectAllVisible,
  };
}
