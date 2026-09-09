import type { ExperimentDocument } from '../experimentModel';
import { getPanelPlugin } from '../../../panels/builtinPanels';
import { useDashboardEditSession } from './useDashboardEditSession';
import { useDashboardPanelDrop } from './useDashboardPanelDrop';
import { useExperimentDashboardCollection } from './useExperimentDashboardCollection';
import { useExperimentDashboardPanels } from './useExperimentDashboardPanels';

export function useExperimentDashboardEditor({
  selectedExperiment,
  saveExperimentDraft,
  selectedDashboardId,
  onSelectedDashboardIdChange,
}: {
  selectedExperiment?: ExperimentDocument;
  saveExperimentDraft: (experiment: ExperimentDocument, reason?: string) => Promise<ExperimentDocument>;
  selectedDashboardId?: string;
  onSelectedDashboardIdChange?: (id: string) => void;
}) {
  const session = useDashboardEditSession({
    selectedExperiment,
    saveExperimentDraft: (experiment, reason) => {
      const unknownPanel = experiment.spec.dashboards
        .flatMap((dashboard) => dashboard.panels)
        .find((panel) => !getPanelPlugin(panel.pluginId));
      if (unknownPanel) {
        return Promise.reject(new Error(
          `Panel "${unknownPanel.id}" uses unregistered plugin "${unknownPanel.pluginId}". Remove it before saving the dashboard.`,
        ));
      }
      return saveExperimentDraft(experiment, reason);
    },
  });
  const dashboards = useExperimentDashboardCollection({
    visibleExperiment: session.visibleExperiment,
    activeDraft: session.activeDraft,
    editing: session.editing,
    updateDraft: session.updateDraft,
    selectedDashboardId,
    onSelectedDashboardIdChange,
  });
  const panels = useExperimentDashboardPanels({
    activeDraft: session.activeDraft,
    editing: session.editing,
    dashboards: dashboards.items,
    selectedDashboard: dashboards.selected,
    updateDraft: session.updateDraft,
    reportError: session.reportError,
  });
  const drop = useDashboardPanelDrop({
    enabled: session.editing,
    panels: panels.items,
    movePanel: panels.move,
    addPanel: panels.add,
  });

  return { session,dashboards,panels,drop };
}
