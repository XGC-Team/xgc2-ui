import { useEffect,useMemo,useState } from 'react';
import { getPanelPlugin } from '../../../panels/builtinPanels';
import type { PanelPluginDefinition } from '../../../panels/types';
import type { GridPos } from '../../../types/common';
import type {
  ExperimentDashboard,
  ExperimentDocument,
  ExperimentWorkflowInstance,
  PanelInstance,
} from '../experimentModel';
import { newSystemPanelWorkflowInstance,panelFromEditor,panelToEditor } from '../experimentModel';
import { experimentWithDashboards } from './experimentDashboardDocument';
import { createPanelInstance,layoutPanelsWithInsertedPanel } from './dashboardModel';
import { panelSizeConstraints } from './panelLayoutConstraints';

export function useExperimentDashboardPanels({
  activeDraft,
  editing,
  dashboards,
  selectedDashboard,
  updateDraft,
  reportError,
}: {
  activeDraft?: ExperimentDocument;
  editing: boolean;
  dashboards: ExperimentDashboard[];
  selectedDashboard: ExperimentDashboard;
  updateDraft: (draft: ExperimentDocument) => void;
  reportError: (message: string) => void;
}) {
  const [selectedPanelId,setSelectedPanelId] = useState('');
  const [configPanelId,setConfigPanelId] = useState<string | null>(null);
  const [libraryOpen,setLibraryOpen] = useState(false);
  const items = useMemo(
    () => selectedDashboard.panels.map(panelToEditor),
    [selectedDashboard.panels],
  );
  const configCandidate = useMemo(
    () => dashboards.flatMap((dashboard) => dashboard.panels).find((panel) => panel.id === configPanelId),
    [configPanelId,dashboards],
  );
  const configTarget = useMemo(
    () => editing && configCandidate ? panelToEditor(configCandidate) : undefined,
    [configCandidate,editing],
  );

  useEffect(() => {
    if (!editing) setLibraryOpen(false);
  }, [editing]);

  useEffect(() => {
    if (editing) return;
    setConfigPanelId(null);
  }, [editing]);

  function replace(nextDashboards: ExperimentDashboard[]) {
    if (!activeDraft) return;
    updateDraft(experimentWithDashboards(activeDraft, nextDashboards));
  }

  function saveConfig(nextPanel: PanelInstance,workflowInstances?: ExperimentWorkflowInstance[]) {
    if (!editing || !activeDraft) return;
    const plugin = getPanelPlugin(nextPanel.pluginId);
    if (!plugin) {
      reportError(`Panel plugin "${nextPanel.pluginId}" is not registered. Remove this panel before saving the dashboard.`);
      return;
    }
    const nextDashboards = dashboards.map((dashboard) => ({
      ...dashboard,
      panels: dashboard.panels.map((panel) => panel.id === nextPanel.id ? panelFromEditor(nextPanel) : panel),
    }));
    try {
      const document = experimentWithDashboards({
        ...activeDraft,
        spec: {
          ...activeDraft.spec,
          workflowInstances: workflowInstances ?? activeDraft.spec.workflowInstances,
        },
      }, nextDashboards);
      updateDraft(document);
    } catch (cause) {
      reportError(cause instanceof Error ? cause.message : String(cause));
      return;
    }
    setConfigPanelId(null);
  }

  function move(panelId: string, gridPos: GridPos) {
    if (!editing) return;
    const target = items.find((panel) => panel.id === panelId);
    if (!target) return;
    const layout = layoutPanelsWithInsertedPanel(target, gridPos, items,
      panelSizeConstraints(getPanelPlugin(target.pluginId)?.layout));
    replace(dashboards.map((dashboard) => dashboard.id !== selectedDashboard.id ? dashboard : {
      ...dashboard,
      panels: dashboard.panels.map((panel) => layout.has(panel.id) ? { ...panel,grid: layout.get(panel.id)! } : panel),
    }));
    setSelectedPanelId(panelId);
  }

  function updateLayout(positions: Record<string,GridPos>) {
    if (!editing) return;
    replace(dashboards.map((dashboard) => dashboard.id !== selectedDashboard.id ? dashboard : {
      ...dashboard,
      panels: dashboard.panels.map((panel) => positions[panel.id] ? {
        ...panel,
        grid: positions[panel.id],
        view: { ...panel.view,options: { ...panel.view.options,gridColumns: 30 } },
      } : panel),
    }));
  }

  function add(plugin: PanelPluginDefinition, gridPos?: GridPos) {
    if (!editing || !activeDraft) return;
    const maximum = plugin.maxInstancesPerDashboard;
    if (maximum !== undefined && items.filter((panel) => panel.pluginId === plugin.id).length >= maximum) {
      reportError(`${plugin.name} is limited to ${maximum} instance${maximum === 1 ? '' : 's'} per dashboard.`);
      return;
    }
    const panel = createPanelInstance(plugin, items, selectedDashboard.id, gridPos);
    const nextDashboards = dashboards.map((dashboard) => dashboard.id !== selectedDashboard.id ? dashboard : {
      ...dashboard,
      panels: [...dashboard.panels,panelFromEditor(panel)],
    });
    const systemWorkflow = newSystemPanelWorkflowInstance(panel.id);
    updateDraft(experimentWithDashboards({
      ...activeDraft,
      spec:{
        ...activeDraft.spec,
        workflowInstances:activeDraft.spec.workflowInstances.some((instance) => instance.id === systemWorkflow.id)
          ? activeDraft.spec.workflowInstances
          : [...activeDraft.spec.workflowInstances,systemWorkflow].sort((left,right) => left.id.localeCompare(right.id)),
      },
    },nextDashboards));
    setSelectedPanelId(panel.id);
    setLibraryOpen(false);
    if (plugin.configureOnCreate) setConfigPanelId(panel.id);
  }

  function remove(panelId: string) {
    if (!editing) return;
    replace(dashboards.map((dashboard) => ({
      ...dashboard,
      panels: dashboard.panels.filter((panel) => panel.id !== panelId),
    })));
    if (selectedPanelId === panelId) setSelectedPanelId('');
    if (configPanelId === panelId) setConfigPanelId(null);
  }

  function openConfig(panelId: string) {
    if (!editing) return;
    const panel = dashboards.flatMap((dashboard) => dashboard.panels).find((candidate) => candidate.id === panelId);
    if (panel) setConfigPanelId(panelId);
  }

  return {
    items,
    selectedPanelId,
    select: setSelectedPanelId,
    configTarget,
    openConfig,
    closeConfig: () => setConfigPanelId(null),
    libraryOpen,
    openLibrary: () => { if (editing) setLibraryOpen(true); },
    closeLibrary: () => setLibraryOpen(false),
    saveConfig,
    move,
    updateLayout,
    add,
    remove,
  };
}
