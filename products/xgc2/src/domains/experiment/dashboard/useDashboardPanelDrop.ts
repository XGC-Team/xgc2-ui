import type { DragEvent } from 'react';
import { availablePanelPlugins } from '../../../panels/builtinPanels';
import type { PanelPluginDefinition } from '../../../panels/types';
import type { GridPos } from '../../../types/common';
import type { PanelInstance } from '../experimentModel';
import {
  DASHBOARD_COLUMNS,
  DASHBOARD_ROW_PITCH,
  dashboardColumnPitch,
} from '../../../shared/dashboardGeometry';

const PANEL_PLUGIN_MIME = 'application/x-xgc-panel-plugin';
const PANEL_INSTANCE_MIME = 'application/x-xgc-panel-id';

export type DashboardPanelDropIntent =
  | { kind: 'move-panel'; panelId: string }
  | { kind: 'add-plugin'; plugin: PanelPluginDefinition };

export function readDashboardPanelDropIntent(dataTransfer: Pick<DataTransfer,'getData'>): DashboardPanelDropIntent | null {
  const panelId = dataTransfer.getData(PANEL_INSTANCE_MIME).trim();
  if (panelId) return { kind: 'move-panel',panelId };
  const pluginId = dataTransfer.getData(PANEL_PLUGIN_MIME).trim();
  const plugin = availablePanelPlugins.find((candidate) => candidate.id === pluginId);
  return plugin ? { kind: 'add-plugin',plugin } : null;
}

export function dashboardPanelDropEffect(types: readonly string[]) {
  if (types.includes(PANEL_INSTANCE_MIME)) return 'move' as const;
  if (types.includes(PANEL_PLUGIN_MIME)) return 'copy' as const;
  return null;
}

export function gridPosFromDashboardDrop(event: DragEvent<HTMLDivElement>, defaultGridPos?: GridPos): GridPos {
  const rect = event.currentTarget.getBoundingClientRect();
  const width = defaultGridPos?.w ?? 6;
  const height = defaultGridPos?.h ?? 4;
  const columnPitch = dashboardColumnPitch(rect.width);
  const x = clampGridValue(Math.floor((event.clientX - rect.left) / columnPitch), 0, DASHBOARD_COLUMNS - width);
  const y = Math.max(0, Math.floor((event.clientY - rect.top + event.currentTarget.scrollTop) / DASHBOARD_ROW_PITCH));
  return { x,y,w: width,h: height };
}

export function useDashboardPanelDrop({
  enabled,
  panels,
  movePanel,
  addPanel,
}: {
  enabled: boolean;
  panels: PanelInstance[];
  movePanel: (panelId: string, gridPos: GridPos) => void;
  addPanel: (plugin: PanelPluginDefinition, gridPos?: GridPos) => void;
}) {
  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!enabled) return;
    const dropEffect = dashboardPanelDropEffect(Array.from(event.dataTransfer.types));
    if (!dropEffect) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = dropEffect;
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (!enabled) return;
    const intent = readDashboardPanelDropIntent(event.dataTransfer);
    if (!intent) return;
    if (intent.kind === 'move-panel') {
      const panel = panels.find((candidate) => candidate.id === intent.panelId);
      if (!panel) return;
      event.preventDefault();
      movePanel(panel.id, gridPosFromDashboardDrop(event, panel.gridPos));
      return;
    }
    event.preventDefault();
    addPanel(
      intent.plugin,
      gridPosFromDashboardDrop(event, intent.plugin.defaultPanel?.gridPos),
    );
  }

  return { onDragOver,onDrop };
}

function clampGridValue(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
