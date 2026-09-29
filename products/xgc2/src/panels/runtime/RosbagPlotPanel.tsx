import { memo,useCallback,useEffect,useMemo,useRef,useState,type DragEvent,type PointerEvent } from 'react';
import { Button,EmptyState,Notice } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { SelectControl } from '../../components/controls/SelectControl';
import {
  getROSBagRecordingPlot,
  listROSBagRecordings,
  type ROSBagPlotSeries,
  type ROSBagPlotTopic,
  type ROSBagRecording,
  type ROSBagRecordingPlot,
} from '../../domains/recording/recordingPublic';
import type { PanelPluginProps } from '../types';
import '../../styles/rosbag-plot.css';
import {
  ROSBAG_CHART_GEOMETRY,
  ROSBAG_FIELD_DRAG_TYPE,
  addSeriesToPane,
  chartScale,
  dropFieldOnWorkspace,
  emptyRosbagPlotWorkspace,
  experimentIdFromArtifactsPort,
  nearestPoint,
  parseFieldDrag,
  plottableTopics,
  polylineForSeries,
  removeSeriesFromPane,
  seriesColorIndex,
  seriesIdForField,
  type RosbagPlotPane,
  type RosbagPlotWorkspace,
} from './rosbagPlotPanelModel';
import { useRuntimePanelText } from './runtimeMessages';

export function RosbagPlotPanel({ panel,context }: PanelPluginProps<readonly ['visualization','experiment']>) {
  const t = useRuntimePanelText();
  const artifacts = context.ports.data['recording-artifacts'];
  const experimentId = experimentIdFromArtifactsPort(artifacts?.value);
  const [bags,setBags] = useState<ROSBagRecording[]>([]);
  const [bagsError,setBagsError] = useState('');
  const [workspace,setWorkspace] = useState<RosbagPlotWorkspace>(emptyRosbagPlotWorkspace());
  const [catalog,setCatalog] = useState<ROSBagRecordingPlot>();
  const [catalogError,setCatalogError] = useState('');
  const [seriesById,setSeriesById] = useState<Record<string,ROSBagPlotSeries>>({});
  const [collapsed,setCollapsed] = useState<string[]>([]);
  const [hover,setHoverState] = useState<{ paneId: string;t: number }>();

  // Pointer moves arrive per event; commit at most one hover update per frame.
  const hoverFrameRef = useRef<number | undefined>(undefined);
  const pendingHoverRef = useRef<{ paneId: string;t: number } | undefined>(undefined);
  const setHover = useCallback((next: { paneId: string;t: number } | undefined) => {
    pendingHoverRef.current = next;
    if (hoverFrameRef.current !== undefined) return;
    hoverFrameRef.current = requestAnimationFrame(() => {
      hoverFrameRef.current = undefined;
      setHoverState(pendingHoverRef.current);
    });
  }, []);
  useEffect(() => () => {
    if (hoverFrameRef.current !== undefined) cancelAnimationFrame(hoverFrameRef.current);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    listROSBagRecordings(experimentId ? { experimentId } : {}, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        setBags(page.items);
        setBagsError('');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setBagsError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => controller.abort();
  }, [experimentId]);

  useEffect(() => {
    if (!workspace.bagId) {
      setCatalog(undefined);
      setCatalogError('');
      return;
    }
    const controller = new AbortController();
    getROSBagRecordingPlot(workspace.bagId, [], controller.signal)
      .then((plot) => {
        if (controller.signal.aborted) return;
        setCatalog(plot);
        setCatalogError('');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setCatalogError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => controller.abort();
  }, [workspace.bagId]);

  const wanted = useMemo(
    () => [...new Set(workspace.panes.flatMap((pane) => pane.seriesIds))],
    [workspace.panes],
  );

  useEffect(() => {
    if (!workspace.bagId || wanted.length === 0) return;
    const missing = wanted.filter((id) => !seriesById[id]);
    if (missing.length === 0) return;
    const controller = new AbortController();
    getROSBagRecordingPlot(workspace.bagId, missing, controller.signal)
      .then((plot) => {
        if (controller.signal.aborted) return;
        setSeriesById((current) => {
          const next = { ...current };
          for (const series of plot.series ?? []) next[series.id] = series;
          return next;
        });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [seriesById,wanted,workspace.bagId]);

  const topics = plottableTopics(catalog?.topics);
  const handleDropOnPane = useCallback((paneId: string, seriesId: string) => {
    setWorkspace((current) => addSeriesToPane(current, paneId, seriesId));
  }, []);
  const handleRemoveSeries = useCallback((paneId: string, seriesId: string) => {
    setWorkspace((current) => removeSeriesFromPane(current, paneId, seriesId));
  }, []);
  const selectBag = (bagId: string) => {
    setWorkspace(emptyRosbagPlotWorkspace(bagId));
    setSeriesById({});
    setCollapsed([]);
    setHover(undefined);
  };

  return (
    <section className="rosbag-plot" data-xgc-role="rosbag-plot" data-xgc-id={panel.id}>
      <aside className="rosbag-plot-sidebar">
        <SelectControl
          ariaLabel={t('Recorded bag')}
          dataXgcRole="rosbag-plot-bag"
          dataXgcId={panel.id}
          fill
          placeholder={t('Select a rosbag')}
          value={workspace.bagId}
          options={bags.map((bag) => ({ value: bag.id,label: bag.name }))}
          onChange={selectBag}
        />
        {!artifacts?.connected && (
          <p className="rosbag-plot-hint">{t('Showing every bag in the archive. Connect Recording artifacts to limit this Experiment.')}</p>
        )}
        {bagsError && <Notice tone="danger" density="compact">{bagsError}</Notice>}
        {catalogError && <Notice tone="danger" density="compact">{catalogError}</Notice>}
        {workspace.bagId && topics.length === 0 && !catalogError && (
          <p className="rosbag-plot-hint">{t('No plottable scalar fields in this bag.')}</p>
        )}
        <TopicTree
          topics={topics}
          collapsed={collapsed}
          panelId={panel.id}
          onToggle={(name) => setCollapsed((current) => (
            current.includes(name) ? current.filter((id) => id !== name) : [...current,name]
          ))}
        />
      </aside>
      <div
        className="rosbag-plot-stage"
        data-xgc-role="rosbag-plot-stage"
        data-xgc-id={panel.id}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          const drag = readFieldDrag(event);
          if (!drag) return;
          event.preventDefault();
          setWorkspace((current) => dropFieldOnWorkspace(current, drag.seriesId));
        }}
      >
        {workspace.panes.length === 0 ? (
          <EmptyState
            appearance="plain"
            fill
            title={t('Drop a field to plot')}
            description={t('Open a bag, expand a topic, and drag a field onto this canvas. Drop onto an existing plot to overlay curves.')}
            data-xgc-role="rosbag-plot-empty"
            data-xgc-id={panel.id}
          />
        ) : workspace.panes.map((pane) => (
          <PlotPane
            key={pane.id}
            pane={pane}
            seriesById={seriesById}
            hoverT={hover?.paneId === pane.id ? hover.t : undefined}
            onDropSeries={handleDropOnPane}
            onHover={setHover}
            onRemoveSeries={handleRemoveSeries}
          />
        ))}
      </div>
    </section>
  );
}

const PlotPane = memo(function PlotPane({
  pane,
  seriesById,
  hoverT,
  onDropSeries,
  onHover,
  onRemoveSeries,
}: {
  pane: RosbagPlotPane;
  seriesById: Record<string,ROSBagPlotSeries>;
  hoverT: number | undefined;
  onDropSeries: (paneId: string, seriesId: string) => void;
  onHover: (next: { paneId: string;t: number } | undefined) => void;
  onRemoveSeries: (paneId: string, seriesId: string) => void;
}) {
  const t = useRuntimePanelText();
  const series = useMemo(
    () => pane.seriesIds.map((id) => seriesById[id]).filter(Boolean) as ROSBagPlotSeries[],
    [pane.seriesIds, seriesById],
  );
  const scale = useMemo(() => chartScale(series), [series]);
  const lines = useMemo(
    () => series.map((item) => ({ id: item.id,points: polylineForSeries(item.points, scale) })),
    [series, scale],
  );
  const readout = useMemo(() => {
    if (hoverT === undefined) return undefined;
    return pane.seriesIds.map((id) => {
      const seriesItem = seriesById[id];
      const point = seriesItem ? nearestPoint(seriesItem.points, hoverT) : undefined;
      return `${id}=${point ? formatTick(point.v) : '—'}`;
    }).join(' · ');
  }, [hoverT, pane.seriesIds, seriesById]);

  return (
    <article
      className="rosbag-plot-pane"
      data-xgc-role="rosbag-plot-pane"
      data-xgc-id={pane.id}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        const drag = readFieldDrag(event);
        if (!drag) return;
        event.preventDefault();
        event.stopPropagation();
        onDropSeries(pane.id, drag.seriesId);
      }}
    >
      <header className="rosbag-plot-legend">
        {pane.seriesIds.map((id) => (
          <span key={id} data-series={seriesColorIndex(id, pane.seriesIds)}>
            {id}
            <ControlButton
              size="compact"
              appearance="ghost"
              aria-label={t('Remove {name}',{ name:id })}
              dataXgcRole="rosbag-plot-remove"
              dataXgcId={id}
              onClick={() => onRemoveSeries(pane.id, id)}
            >×</ControlButton>
          </span>
        ))}
      </header>
      <svg
        className="rosbag-plot-chart"
        viewBox={`0 0 ${ROSBAG_CHART_GEOMETRY.width} ${ROSBAG_CHART_GEOMETRY.height}`}
        preserveAspectRatio="none"
        aria-label={t('Rosbag time series')}
        onPointerMove={(event) => onHover({ paneId: pane.id,t: timeAtPointer(event, scale) })}
        onPointerLeave={() => onHover(undefined)}
      >
        <rect
          className="rosbag-plot-plot-area"
          x={ROSBAG_CHART_GEOMETRY.left}
          y={ROSBAG_CHART_GEOMETRY.top}
          width={ROSBAG_CHART_GEOMETRY.width - ROSBAG_CHART_GEOMETRY.left - ROSBAG_CHART_GEOMETRY.right}
          height={ROSBAG_CHART_GEOMETRY.height - ROSBAG_CHART_GEOMETRY.top - ROSBAG_CHART_GEOMETRY.bottom}
        />
        {lines.map((line) => (
          <polyline
            key={line.id}
            className="rosbag-plot-line"
            data-series={seriesColorIndex(line.id, pane.seriesIds)}
            fill="none"
            points={line.points}
          />
        ))}
        <text className="rosbag-plot-axis" x={8} y={16}>{formatTick(scale.vMax)}</text>
        <text className="rosbag-plot-axis" x={8} y={ROSBAG_CHART_GEOMETRY.height - 28}>{formatTick(scale.vMin)}</text>
        <text className="rosbag-plot-axis" x={ROSBAG_CHART_GEOMETRY.left} y={ROSBAG_CHART_GEOMETRY.height - 6}>
          {formatTick(scale.tMin)}s
        </text>
        <text
          className="rosbag-plot-axis"
          x={ROSBAG_CHART_GEOMETRY.width - 48}
          y={ROSBAG_CHART_GEOMETRY.height - 6}
        >
          {formatTick(scale.tMax)}s
        </text>
      </svg>
      {readout !== undefined && (
        <p className="rosbag-plot-readout" data-xgc-role="rosbag-plot-readout" data-xgc-id={pane.id}>
          {readout}
        </p>
      )}
    </article>
  );
});

function TopicTree({
  topics,
  collapsed,
  panelId,
  onToggle,
}: {
  topics: ROSBagPlotTopic[];
  collapsed: string[];
  panelId: string;
  onToggle: (name: string) => void;
}) {
  return (
    <ul className="rosbag-plot-tree" data-xgc-role="rosbag-plot-tree" data-xgc-id={panelId}>
      {topics.map((topic) => {
        const isCollapsed = collapsed.includes(topic.name);
        return (
          <li key={topic.name} data-xgc-role="rosbag-plot-topic" data-xgc-id={`${panelId}:${topic.name}`}>
            <Button
              appearance="ghost"
              type="button"
              className="rosbag-plot-topic-toggle"
              data-xgc-role="rosbag-plot-topic-toggle"
              data-xgc-id={`${panelId}:${topic.name}`}
              aria-expanded={!isCollapsed}
              onClick={() => onToggle(topic.name)}
            >
              <span>{topic.name}</span>
              <small>{topic.messageCount}</small>
            </Button>
            {isCollapsed ? null : (
              <ul className="rosbag-plot-fields">
                {topic.fields.map((field) => {
                  const seriesId = seriesIdForField(topic.name, field);
                  return (
                    <li key={field}>
                      <Button
                        appearance="ghost"
                        type="button"
                        className="rosbag-plot-field"
                        draggable
                        data-xgc-role="rosbag-plot-field"
                        data-xgc-id={`${panelId}:${seriesId}`}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'copy';
                          event.dataTransfer.setData(ROSBAG_FIELD_DRAG_TYPE, JSON.stringify({
                            seriesId,topic: topic.name,field,
                          }));
                          event.dataTransfer.setData('text/plain', seriesId);
                        }}
                      >
                        {field}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function readFieldDrag(event: DragEvent) {
  return parseFieldDrag(
    event.dataTransfer.getData(ROSBAG_FIELD_DRAG_TYPE) || event.dataTransfer.getData('text/plain'),
  );
}

function timeAtPointer(event: PointerEvent<SVGSVGElement>, scale: ReturnType<typeof chartScale>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const plotLeft = bounds.width * (ROSBAG_CHART_GEOMETRY.left / ROSBAG_CHART_GEOMETRY.width);
  const plotRight = bounds.width * (1 - ROSBAG_CHART_GEOMETRY.right / ROSBAG_CHART_GEOMETRY.width);
  const ratio = Math.max(0, Math.min(1, (x - plotLeft) / Math.max(1, plotRight - plotLeft)));
  return scale.tMin + ratio * (scale.tMax - scale.tMin);
}

function formatTick(value: number) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
}
