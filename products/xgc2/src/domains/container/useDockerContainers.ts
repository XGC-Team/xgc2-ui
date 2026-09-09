import { useCallback,useState } from 'react';
import { useConfirmationDialog } from '@xgc2/ui-react';
import type { ApiTargetOptions } from '../../api/http';
import {
  createContainer as createContainerRequest,
  getContainerLogs,
  inspectContainer,
  listContainers,
  operateContainer as operateContainerRequest,
} from './containerService';
import type { ContainerOperation,DockerContainerInfo } from './containerModel';
import {
  containerDisplayName,
  createContainerDraft,
  parseContainerListField,
  type ContainerStateFilter,
} from './containerViewModel';
import { containerErrorMessage,useContainerResourceState } from './useContainerResourceState';

export function useDockerContainers(target?: ApiTargetOptions,onMutation?: () => Promise<unknown> | unknown) {
  const { confirm,dialog: confirmationDialog } = useConfirmationDialog();
  const [draft,setDraft] = useState(createContainerDraft);
  const [drawerOpen,setDrawerOpen] = useState(false);
  const [query,setQuery] = useState('');
  const [stateFilter,setStateFilter] = useState<ContainerStateFilter>('all');
  const [selectedContainer,setSelectedContainer] = useState<DockerContainerInfo | null>(null);
  const [detail,setDetail] = useState('');
  const [detailKind,setDetailKind] = useState<'logs' | 'inspect' | null>(null);
  const load = useCallback(() => listContainers(target),[target]);
  const {
    value: containers,
    busy,
    error,
    output: commandOutput,
    refresh,
    execute,
    clearOutput,
  } = useContainerResourceState<DockerContainerInfo[]>({
    initialValue: [],
    load,
    loadFailure: 'Failed to load containers.',
    afterMutation: onMutation,
  });

  const prepareCommand = useCallback(() => {
    setSelectedContainer(null);
    setDetail('');
    setDetailKind(null);
  },[]);

  const create = useCallback(async () => {
    prepareCommand();
    const created = await execute(
      () => createContainerRequest({
        ...draft,
        ports: parseContainerListField(draft.ports),
        env: parseContainerListField(draft.env),
        volumes: parseContainerListField(draft.volumes),
      },target),
      'Container created',
    );
    if (created) setDrawerOpen(false);
    return created;
  },[draft,execute,prepareCommand,target]);

  const operate = useCallback(async (
    container: DockerContainerInfo,
    operation: ContainerOperation,
    force = false,
  ) => {
    const destructive = operation === 'stop' || operation === 'kill' || operation === 'remove';
    if (destructive && !await confirm({
      title: `${operation[0]?.toUpperCase() ?? ''}${operation.slice(1)} container`,
      message: `Confirm ${operation} ${containerDisplayName(container)}?`,
      confirmLabel: operation,
    })) return false;
    prepareCommand();
    return execute(
      () => operateContainerRequest(container.id,operation,force,target),
      `${operation} completed`,
      `${operation} failed`,
    );
  },[confirm,execute,prepareCommand,target]);

  const showInspect = useCallback(async (container: DockerContainerInfo) => {
    clearOutput();
    setSelectedContainer(container);
    setDetailKind('inspect');
    setDetail('Loading inspect...');
    try {
      const result = await inspectContainer(container.id,target);
      setDetail(result.content);
    } catch (inspectError) {
      setDetail(containerErrorMessage(inspectError,'Inspect failed'));
    }
  },[clearOutput,target]);

  const showLogs = useCallback(async (container: DockerContainerInfo) => {
    clearOutput();
    setSelectedContainer(container);
    setDetailKind('logs');
    setDetail('Loading logs...');
    try {
      const result = await getContainerLogs(container.id,200,target);
      setDetail(result.content || 'No logs.');
    } catch (logsError) {
      setDetail(containerErrorMessage(logsError,'Logs failed'));
    }
  },[clearOutput,target]);

  const closeDetail = useCallback(() => {
    setDetail('');
    setDetailKind(null);
    clearOutput();
  },[clearOutput]);

  return {
    containers,
    busy,
    error,
    output: detail || commandOutput,
    detailKind: detail ? detailKind : (commandOutput ? 'output' as const : null),
    selectedContainer,
    draft,
    drawerOpen,
    query,
    stateFilter,
    confirmationDialog,
    refresh,
    create,
    operate,
    showInspect,
    showLogs,
    closeDetail,
    setDraft,
    setDrawerOpen,
    setQuery,
    setStateFilter,
  };
}
