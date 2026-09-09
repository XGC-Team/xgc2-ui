import { useCallback,useEffect,useMemo,useState } from 'react';
import { useConfirmationDialog } from '@xgc2/ui-react';
import type { ApiTargetOptions } from '../../api/http';
import {
  connectContainerNetwork,
  createContainerNetwork,
  disconnectContainerNetwork,
  inspectContainerNetwork,
  listContainerNetworkInterfaces,
  listContainerNetworks,
  listContainers,
  pruneContainerNetworks,
  removeContainerNetworks,
} from './containerService';
import type { DockerNetworkInfo } from './containerModel';
import {
  createNetworkDraft,
  filterDockerNetworks,
  isSystemDockerNetwork,
  networkCreateDisabledReason,
  networkCreateRequestFromDraft,
  paginateItems,
  parseContainerListField,
  type NetworkCreateDraft,
} from './containerViewModel';
import type { NetworkConnectDraft,NetworkContainerOption } from './NetworkInspectSummary';
import { containerErrorMessage,useContainerResourceState } from './useContainerResourceState';

const defaultPageSize = 20;

export function useContainerNetworks(target?: ApiTargetOptions,onMutation?: () => Promise<unknown> | unknown) {
  const { confirm,dialog: confirmationDialog } = useConfirmationDialog();
  const [draft,setDraft] = useState<NetworkCreateDraft>(createNetworkDraft);
  const [drawerOpen,setDrawerOpen] = useState(false);
  const [query,setQuery] = useState('');
  const [page,setPage] = useState(1);
  const [pageSize,setPageSize] = useState(defaultPageSize);
  const [selectedNames,setSelectedNames] = useState<string[]>([]);
  const [inspectName,setInspectName] = useState('');
  const [inspectContent,setInspectContent] = useState('');
  const [parentInterfaces,setParentInterfaces] = useState<string[]>([]);
  const [containerOptions,setContainerOptions] = useState<NetworkContainerOption[]>([]);
  const load = useCallback(() => listContainerNetworks(target),[target]);
  const {
    value: networks,
    busy,
    error,
    output,
    refresh,
    execute,
    clearOutput,
  } = useContainerResourceState<DockerNetworkInfo[]>({
    initialValue: [],
    load,
    loadFailure: 'Failed to load networks.',
    afterMutation: onMutation,
  });

  useEffect(() => {
    let cancelled = false;
    void listContainerNetworkInterfaces(target)
      .then((items) => {
        if (!cancelled) setParentInterfaces(items);
      })
      .catch(() => {
        if (!cancelled) setParentInterfaces([]);
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

  const filtered = useMemo(() => filterDockerNetworks(networks, query), [networks,query]);
  const pageView = useMemo(() => paginateItems(filtered, page, pageSize), [filtered,page,pageSize]);

  useEffect(() => {
    if (pageView.page !== page) setPage(pageView.page);
  }, [page,pageView.page]);

  const create = useCallback(async () => {
    const reason = networkCreateDisabledReason(draft);
    if (reason) return false;
    const created = await execute(
      () => createContainerNetwork(networkCreateRequestFromDraft(draft), target),
      'Network created',
      'Failed to create network',
    );
    if (created) {
      setDrawerOpen(false);
      setDraft(createNetworkDraft());
    }
    return created;
  }, [draft,execute,target]);

  const remove = useCallback(async (names: string[]) => {
    const targets = names
      .map((name) => name.trim())
      .filter((name) => name && !isSystemDockerNetwork(name));
    if (targets.length === 0) return false;
    if (!await confirm({
      title: targets.length === 1 ? 'Remove network' : 'Remove networks',
      message: targets.length === 1
        ? `Remove network ${targets[0]}? Containers must be disconnected first.`
        : `Remove ${targets.length} networks? Containers must be disconnected first.`,
      confirmLabel: 'Remove',
    })) return false;
    const removed = await execute(
      () => removeContainerNetworks(targets, target),
      targets.length === 1 ? 'Network removed' : 'Networks removed',
      'Failed to remove network(s)',
    );
    if (removed) {
      setSelectedNames((current) => current.filter((name) => !targets.includes(name)));
    }
    return removed;
  }, [confirm,execute,target]);

  const prune = useCallback(async () => {
    if (!await confirm({
      title: 'Prune unused networks',
      message: 'Remove all unused Docker networks that are not referenced by any container?',
      confirmLabel: 'Prune',
    })) return false;
    return execute(() => pruneContainerNetworks(target), 'Networks pruned', 'Failed to prune networks');
  }, [confirm,execute,target]);

  const refreshInspect = useCallback(async (networkName: string) => {
    try {
      const result = await inspectContainerNetwork(networkName, target);
      setInspectContent(result.content);
      return true;
    } catch (cause) {
      setInspectContent(containerErrorMessage(cause, 'Inspect failed'));
      return false;
    }
  }, [target]);

  const loadContainerOptions = useCallback(async () => {
    try {
      const items = await listContainers(target);
      setContainerOptions(items.map((item) => {
        const name = (item.names || item.name || item.id).replace(/^\//, '');
        return { value: item.id || name, label: name };
      }));
    } catch {
      setContainerOptions([]);
    }
  }, [target]);

  const showInspect = useCallback(async (network: DockerNetworkInfo) => {
    setInspectName(network.name);
    setInspectContent('Loading inspect...');
    await Promise.all([refreshInspect(network.name), loadContainerOptions()]);
  }, [loadContainerOptions,refreshInspect]);

  const closeInspect = useCallback(() => {
    setInspectName('');
    setInspectContent('');
  }, []);

  const connect = useCallback(async (draft: NetworkConnectDraft) => {
    const networkName = inspectName.trim();
    const container = draft.container.trim();
    if (!networkName || !container) return false;
    const connected = await execute(
      () => connectContainerNetwork(networkName, {
        container,
        ipv4: draft.ipv4.trim(),
        ipv6: draft.ipv6.trim(),
        aliases: parseContainerListField(draft.aliases),
      }, target),
      'Container connected',
      'Failed to connect container',
    );
    if (connected) {
      await Promise.all([refreshInspect(networkName), loadContainerOptions()]);
    }
    return connected;
  }, [execute,inspectName,loadContainerOptions,refreshInspect,target]);

  const disconnect = useCallback(async (container: string) => {
    const networkName = inspectName.trim();
    const targetContainer = container.trim();
    if (!networkName || !targetContainer) return false;
    if (!await confirm({
      title: 'Disconnect container',
      message: `Disconnect ${targetContainer} from network ${networkName}?`,
      confirmLabel: 'Disconnect',
    })) return false;
    const disconnected = await execute(
      () => disconnectContainerNetwork(networkName, { container: targetContainer }, target),
      'Container disconnected',
      'Failed to disconnect container',
    );
    if (disconnected) {
      await Promise.all([refreshInspect(networkName), loadContainerOptions()]);
    }
    return disconnected;
  }, [confirm,execute,inspectName,loadContainerOptions,refreshInspect,target]);

  const openCreate = useCallback(() => {
    setDrawerOpen(true);
    void listContainerNetworkInterfaces(target)
      .then(setParentInterfaces)
      .catch(() => setParentInterfaces([]));
  }, [target]);

  const toggleSelected = useCallback((name: string, checked: boolean) => {
    setSelectedNames((current) => {
      if (checked) return current.includes(name) ? current : [...current, name];
      return current.filter((item) => item !== name);
    });
  }, []);

  const toggleSelectAllVisible = useCallback((checked: boolean) => {
    const visibleSelectable = pageView.items
      .filter((network) => !network.isSystem && !isSystemDockerNetwork(network.name))
      .map((network) => network.name);
    setSelectedNames((current) => {
      if (!checked) return current.filter((name) => !visibleSelectable.includes(name));
      const next = new Set(current);
      for (const name of visibleSelectable) next.add(name);
      return Array.from(next);
    });
  }, [pageView.items]);

  const setQuerySafe = useCallback((value: string) => {
    setQuery(value);
    setPage(1);
  }, []);

  const setPageSizeSafe = useCallback((value: number) => {
    setPageSize(value);
    setPage(1);
  }, []);

  return {
    networks: pageView.items,
    total: pageView.total,
    page: pageView.page,
    pageSize: pageView.pageSize,
    pages: pageView.pages,
    selectedNames,
    busy,
    error,
    output,
    draft,
    drawerOpen,
    query,
    inspectName,
    inspectContent,
    parentInterfaces,
    containerOptions,
    confirmationDialog,
    refresh,
    create,
    remove,
    prune,
    connect,
    disconnect,
    showInspect,
    closeInspect,
    closeOutput: clearOutput,
    setDraft,
    setDrawerOpen,
    openCreate,
    setQuery: setQuerySafe,
    setPage,
    setPageSize: setPageSizeSafe,
    toggleSelected,
    toggleSelectAllVisible,
  };
}
