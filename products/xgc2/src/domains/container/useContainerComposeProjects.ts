import { useCallback,useState } from 'react';
import type { ApiTargetOptions } from '../../api/http';
import {
  createContainerComposeProject,
  getContainerComposeConfig,
  listContainerComposeProjects,
  operateContainerComposeProject,
} from './containerService';
import {
  composeProjectConfigPath,
  type ContainerComposeOperation,
  type DockerComposeProject,
} from './containerModel';
import { createComposeDraft } from './containerViewModel';
import { containerErrorMessage,useContainerResourceState } from './useContainerResourceState';

export function useContainerComposeProjects(target?: ApiTargetOptions,onMutation?: () => Promise<unknown> | unknown) {
  const [draft,setDraft] = useState(createComposeDraft);
  const [configBusy,setConfigBusy] = useState(false);
  const [configView,setConfigView] = useState<{ title: string;path: string;content: string } | null>(null);
  const load = useCallback(() => listContainerComposeProjects(target),[target]);
  const { value: projects,busy,error,output,refresh,execute,clearOutput } = useContainerResourceState<DockerComposeProject[]>({
    initialValue: [],
    load,
    loadFailure: 'Failed to load Compose projects.',
    afterMutation: onMutation,
  });

  const create = useCallback(() => execute(
    () => createContainerComposeProject(draft,target),
    'Compose project created',
  ),[draft,execute,target]);

  const operate = useCallback((
    project: DockerComposeProject,
    operation: ContainerComposeOperation,
    force = false,
  ) => execute(
    () => operateContainerComposeProject({
      name: project.name,
      path: composeProjectConfigPath(project),
      operation,
      force,
    },target),
    `${operation} completed`,
  ),[execute,target]);

  const showConfig = useCallback(async (project: DockerComposeProject) => {
    const path = composeProjectConfigPath(project);
    // Always open the drawer immediately so the click is never a silent no-op.
    setConfigView({
      title: project.name || 'Compose project',
      path,
      content: path ? 'Loading compose YAML…' : 'No config file path is available for this project.',
    });
    if (!path) return;

    setConfigBusy(true);
    try {
      const next = await getContainerComposeConfig(path, target);
      setConfigView({
        title: project.name || 'Compose project',
        path: next.path || path,
        content: next.content || '(empty file)',
      });
    } catch (cause) {
      setConfigView({
        title: project.name || 'Compose project',
        path,
        content: containerErrorMessage(cause, 'Failed to load compose config.'),
      });
    } finally {
      setConfigBusy(false);
    }
  }, [target]);

  const closeConfig = useCallback(() => setConfigView(null), []);

  return {
    projects,
    // Keep table ops usable while YAML loads; only mark compose-global busy for mutations/list.
    busy,
    configBusy,
    error,
    output,
    configView,
    draft,
    refresh,
    create,
    operate,
    showConfig,
    closeConfig,
    closeOutput: clearOutput,
    setDraft,
  };
}
