import type { ROSBagPlotPoint,ROSBagPlotSeries,ROSBagPlotTopic } from '../../domains/recording/recordingPublic';

export const ROSBAG_PLOT_PANEL_ID = 'rosbag-plot';
export const ROSBAG_FIELD_DRAG_TYPE = 'application/x-xgc-rosbag-field';

export type RosbagPlotPane = {
  id: string;
  seriesIds: string[];
};

export type RosbagPlotWorkspace = {
  bagId: string;
  panes: RosbagPlotPane[];
};

export type RosbagFieldDrag = {
  seriesId: string;
  topic: string;
  field: string;
};

export function emptyRosbagPlotWorkspace(bagId = ''): RosbagPlotWorkspace {
  return { bagId,panes: [] };
}

export function plottableTopics(topics: readonly ROSBagPlotTopic[] | undefined) {
  return (topics ?? []).filter((topic) => topic.fields.length > 0);
}

export function seriesIdForField(topic: string, field: string) {
  return `${topic}:${field}`;
}

export function parseFieldDrag(raw: string): RosbagFieldDrag | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('{')) {
    try {
      const value = JSON.parse(trimmed) as Partial<RosbagFieldDrag>;
      if (!value.seriesId || !value.topic || !value.field) return undefined;
      return { seriesId: value.seriesId,topic: value.topic,field: value.field };
    } catch {
      return undefined;
    }
  }
  const separator = trimmed.lastIndexOf(':');
  if (separator <= 0 || separator === trimmed.length - 1) return undefined;
  return {
    seriesId: trimmed,
    topic: trimmed.slice(0, separator),
    field: trimmed.slice(separator + 1),
  };
}

export function addSeriesToPane(
  workspace: RosbagPlotWorkspace,
  paneId: string,
  seriesId: string,
): RosbagPlotWorkspace {
  if (!seriesId) return workspace;
  return {
    ...workspace,
    panes: workspace.panes.map((pane) => (
      pane.id !== paneId || pane.seriesIds.includes(seriesId)
        ? pane
        : { ...pane,seriesIds: [...pane.seriesIds,seriesId] }
    )),
  };
}

export function dropFieldOnWorkspace(
  workspace: RosbagPlotWorkspace,
  seriesId: string,
  paneId?: string,
): RosbagPlotWorkspace {
  if (!seriesId) return workspace;
  if (paneId) return addSeriesToPane(workspace, paneId, seriesId);
  if (workspace.panes.some((pane) => pane.seriesIds.includes(seriesId) && pane.seriesIds.length === 1)) {
    return workspace;
  }
  return {
    ...workspace,
    panes: [...workspace.panes,{ id: nextPaneId(workspace.panes),seriesIds: [seriesId] }],
  };
}

export function removeSeriesFromPane(
  workspace: RosbagPlotWorkspace,
  paneId: string,
  seriesId: string,
): RosbagPlotWorkspace {
  return {
    ...workspace,
    panes: workspace.panes
      .map((pane) => pane.id !== paneId
        ? pane
        : { ...pane,seriesIds: pane.seriesIds.filter((id) => id !== seriesId) })
      .filter((pane) => pane.seriesIds.length > 0),
  };
}

export function seriesColorIndex(seriesId: string, orderedIds: readonly string[]) {
  const index = orderedIds.indexOf(seriesId);
  return index < 0 ? 0 : index % 6;
}

export type ChartGeometry = {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export const ROSBAG_CHART_GEOMETRY: ChartGeometry = {
  width: 640,
  height: 180,
  left: 52,
  right: 12,
  top: 10,
  bottom: 24,
};

export type ChartScale = {
  tMin: number;
  tMax: number;
  vMin: number;
  vMax: number;
};

export function chartScale(series: readonly ROSBagPlotSeries[], domain?: { tMin: number;tMax: number }): ChartScale {
  const points = series.flatMap((item) => item.points);
  const tMin = domain?.tMin ?? Math.min(0,...points.map((point) => point.t));
  const tMax = domain?.tMax ?? Math.max(tMin + 1e-6,...points.map((point) => point.t));
  let vMin = Math.min(...points.map((point) => point.v));
  let vMax = Math.max(...points.map((point) => point.v));
  if (!Number.isFinite(vMin) || !Number.isFinite(vMax)) {
    vMin = 0;
    vMax = 1;
  }
  if (vMin === vMax) {
    vMin -= 1;
    vMax += 1;
  }
  return { tMin,tMax: tMax <= tMin ? tMin + 1e-6 : tMax,vMin,vMax };
}

export function polylineForSeries(
  points: readonly ROSBagPlotPoint[],
  scale: ChartScale,
  geometry: ChartGeometry = ROSBAG_CHART_GEOMETRY,
) {
  const plotWidth = geometry.width - geometry.left - geometry.right;
  const plotHeight = geometry.height - geometry.top - geometry.bottom;
  const spanT = scale.tMax - scale.tMin;
  const spanV = scale.vMax - scale.vMin;
  return points.map((point) => {
    const x = geometry.left + ((point.t - scale.tMin) / spanT) * plotWidth;
    const y = geometry.top + (1 - (point.v - scale.vMin) / spanV) * plotHeight;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

export function nearestPoint(
  points: readonly ROSBagPlotPoint[],
  t: number,
): ROSBagPlotPoint | undefined {
  if (points.length === 0) return undefined;
  let best = points[0]!;
  let bestDistance = Math.abs(best.t - t);
  for (const point of points) {
    const distance = Math.abs(point.t - t);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}

function nextPaneId(panes: readonly RosbagPlotPane[]) {
  let index = panes.length + 1;
  const ids = new Set(panes.map((pane) => pane.id));
  let id = `plot-${index}`;
  while (ids.has(id)) {
    index += 1;
    id = `plot-${index}`;
  }
  return id;
}

export function experimentIdFromArtifactsPort(value: unknown) {
  if (!value || typeof value !== 'object') return '';
  const id = (value as { experimentResourceId?: unknown }).experimentResourceId;
  return typeof id === 'string' ? id : '';
}
