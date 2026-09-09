import type { PanelPluginDefinition } from '../../../panels/types';
import { DASHBOARD_COLUMNS } from '../../../shared/dashboardGeometry';
import { panelDashboardId } from '../../../shared/panelDashboard';
import type { GridPos } from '../../../types/common';
import { newPanelWorkflowBinding,panelWorkflowInstanceId,type PanelInstance } from '../experimentModel';
import { clampPanelSize,panelSizeConstraints,type PanelSizeConstraints } from './panelLayoutConstraints';

export function createPanelInstance(plugin: PanelPluginDefinition, panels: PanelInstance[], dashboardId: string, preferredGridPos?: GridPos): PanelInstance {
  const baseId = plugin.id.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  const ids = new Set(panels.map((panel) => panel.id));
  let index = panels.length + 1;
  let id = baseId;
  while (ids.has(id)) {
    id = `${baseId}-${index}`;
    index += 1;
  }
  const panelDefaults = plugin.defaultPanel ?? {};
  const dashboardPanels = panels.filter((panel) => panelDashboardId(panel) === dashboardId);
  const defaultGridPos = panelDefaults.gridPos ?? { x: 0, y: dashboardPanels.length * 4, w: 6, h: 4 };
  const declaredBindings = panelDefaults.portBindings ?? plugin.defaultPortBindings ?? [
    ...(plugin.dataPorts ?? []).map((port) => ({
      portId:port.id,kind:'data' as const,projection:port.contract,
    })),
    ...(plugin.authoringPorts ?? []).filter((port) => (
      port.target === 'experiment.robots' || port.target === 'experiment.localizationOffset'
    )).map((port) => ({
      portId:port.id,kind:'authoring' as const,target:port.target,
    })),
  ];
  return {
    id,
    pluginId: plugin.id,
    title: panelDefaults.title ?? plugin.name,
    gridPos: snapGridPos(preferredGridPos ?? defaultGridPos, dashboardPanels, panelSizeConstraints(plugin.layout)),
    query: panelDefaults.query ?? {},
    options: {
      ...(plugin.defaultOptions ?? {}),
      ...(panelDefaults.options ?? {}),
      dashboard: dashboardId,
      gridColumns: DASHBOARD_COLUMNS,
    },
    fieldConfig: panelDefaults.fieldConfig ?? {},
    portBindings: [
      ...declaredBindings.filter((binding) => binding.kind !== 'workflow'),
      newPanelWorkflowBinding(panelWorkflowInstanceId(id)),
    ],
  };
}

export function snapGridPos(
  target: GridPos,
  panels: PanelInstance[],
  constraints: PanelSizeConstraints = panelSizeConstraints(),
): GridPos {
  const next = clampPanelSize(target, constraints);
  while (panels.some((panel) => gridPositionsOverlap(next, panel.gridPos))) {
    next.y += 1;
  }
  return next;
}

export function layoutPanelsWithInsertedPanel(
  targetPanel: PanelInstance,
  targetGridPos: GridPos,
  dashboardPanels: PanelInstance[],
  constraints: PanelSizeConstraints = panelSizeConstraints(),
) {
  const layout = new Map<string, GridPos>();
  const inserted = clampPanelSize({
    x: targetGridPos.x,
    y: targetGridPos.y,
    w: targetPanel.gridPos.w,
    h: targetPanel.gridPos.h,
  }, constraints);
  const placed: Array<{ id: string; gridPos: GridPos }> = [{ id: targetPanel.id, gridPos: inserted }];
  layout.set(targetPanel.id, inserted);

  dashboardPanels
    .filter((panel) => panel.id !== targetPanel.id)
    .sort((a, b) => a.gridPos.y - b.gridPos.y || a.gridPos.x - b.gridPos.x)
    .forEach((panel) => {
      const next = { ...panel.gridPos };
      while (placed.some((item) => gridPositionsOverlap(next, item.gridPos))) {
        next.y += 1;
      }
      placed.push({ id: panel.id, gridPos: next });
      layout.set(panel.id, next);
    });

  return layout;
}

function gridPositionsOverlap(a: GridPos, b: GridPos) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
