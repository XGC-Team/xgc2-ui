import { useId,useLayoutEffect,useMemo,useRef,useState } from 'react';
import type { SystemTrendPoint } from '../shared/systemTrend';
import './SystemIOTrend.css';

type TrendSeries = {
  id: string;
  name: string;
  values: number[];
};

const VIEWBOX_WIDTH = 480;
const VIEWBOX_HEIGHT = 240;
const PLOT_LEFT = 56;
const PLOT_RIGHT = 12;
const PLOT_TOP = 16;
const PLOT_BOTTOM = 30;
const GRID_STEPS = 3;

export type SystemIOTrendKind = 'network' | 'disk' | 'load';

export function SystemIOTrend({
  points,
  kind,
  chartRole,
  legendRole,
  seriesRole,
}: {
  points: SystemTrendPoint[];
  /** Omit to render all three charts (tests / standalone). Domain pages pass one kind per panel. */
  kind?: SystemIOTrendKind;
  chartRole?: string;
  legendRole?: string;
  seriesRole?: string;
}) {
  const networkSeries = useMemo(() => [
    trendSeries('rx','Net rx',points.map((point) => point.networkRxRate)),
    trendSeries('tx','Net tx',points.map((point) => point.networkTxRate)),
  ],[points]);
  const diskSeries = useMemo(() => [
    trendSeries('read','Disk read',points.map((point) => point.diskReadRate)),
    trendSeries('write','Disk write',points.map((point) => point.diskWriteRate)),
  ],[points]);
  const loadSeries = useMemo(() => [
    trendSeries('1m','Load 1m',points.map((point) => point.load1)),
  ],[points]);
  const charts = [
    { kind: 'network' as const,label: 'Network throughput',series: networkSeries,valueFormatter: formatRate,axisFormatter: formatCompactRateAxis },
    { kind: 'disk' as const,label: 'Disk throughput',series: diskSeries,valueFormatter: formatRate,axisFormatter: formatCompactRateAxis },
    { kind: 'load' as const,label: 'System load',series: loadSeries,valueFormatter: formatPlain,axisFormatter: formatPlain },
  ].filter((chart) => !kind || chart.kind === kind);

  return (
    <div className="xgc-system-io-chart-grid" data-xgc-kind={kind ?? 'all'}>
      {charts.map((chart) => (
        <TrendChart
          key={chart.kind}
          kind={chart.kind}
          label={chart.label}
          points={points}
          series={chart.series}
          valueFormatter={chart.valueFormatter}
          axisFormatter={chart.axisFormatter}
          chartRole={chartRole}
          legendRole={legendRole}
          seriesRole={seriesRole}
        />
      ))}
    </div>
  );
}

function TrendChart({
  kind,
  label,
  points,
  series,
  valueFormatter,
  axisFormatter,
  chartRole,
  legendRole,
  seriesRole,
}: {
  kind: SystemIOTrendKind;
  label: string;
  points: SystemTrendPoint[];
  series: TrendSeries[];
  valueFormatter: (value: number) => string;
  axisFormatter: (value: number) => string;
  chartRole?: string;
  legendRole?: string;
  seriesRole?: string;
}) {
  const clipPathId = `xgc-trend-${useId().replaceAll(':','')}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewport,setViewport] = useState({ width:VIEWBOX_WIDTH,height:VIEWBOX_HEIGHT });
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = ({ width,height }: { width:number;height:number }) => {
      // A parked page has no layout. Keep its last geometry until it is visible.
      if (width <= PLOT_LEFT + PLOT_RIGHT || height <= PLOT_TOP + PLOT_BOTTOM) return;
      setViewport((current) => current.width === width && current.height === height ? current : { width,height });
    };
    measure(svg.getBoundingClientRect());
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((item) => item.target === svg);
      if (entry) measure(entry.contentRect);
    });
    observer.observe(svg);
    return () => observer.disconnect();
  },[]);
  const maximum = trendMaximum(series);
  const plotWidth = viewport.width - PLOT_LEFT - PLOT_RIGHT;
  const plotHeight = viewport.height - PLOT_TOP - PLOT_BOTTOM;
  const x = (index: number) => PLOT_LEFT + (points.length <= 1 ? plotWidth / 2 : index * plotWidth / (points.length - 1));
  const y = (value: number) => PLOT_TOP + plotHeight - Math.max(0,Math.min(1,value / maximum)) * plotHeight;
  const timeLabels = trendTimeLabels(points);

  return (
    <figure
      className="xgc-system-io-chart"
      aria-label={label}
      {...(chartRole ? { 'data-xgc-role': chartRole,'data-xgc-id': kind } : {})}
    >
      <figcaption
        className="xgc-system-io-chart-legend"
        {...(legendRole ? { 'data-xgc-role': legendRole,'data-xgc-id': kind } : {})}
      >
        {series.map((item,index) => (
          <span
            key={item.id}
            {...(seriesRole ? { 'data-xgc-role': seriesRole,'data-xgc-id': `${kind}:${item.id}` } : {})}
          >
            <i data-series={index} />{item.name}
          </span>
        ))}
      </figcaption>
      <svg ref={svgRef} viewBox={`0 0 ${viewport.width} ${viewport.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <clipPath id={clipPathId}>
            <rect x={PLOT_LEFT} y={PLOT_TOP} width={plotWidth} height={plotHeight} />
          </clipPath>
        </defs>
        {Array.from({ length: GRID_STEPS + 1 },(_,index) => {
          const ratio = index / GRID_STEPS;
          const gridY = PLOT_TOP + ratio * plotHeight;
          const value = maximum * (1 - ratio);
          return (
            <g key={index} className="xgc-system-io-chart-gridline" data-axis={index === GRID_STEPS ? 'true' : undefined}>
              <line x1={PLOT_LEFT} x2={viewport.width - PLOT_RIGHT} y1={gridY} y2={gridY} />
              <text x={PLOT_LEFT - 6} y={gridY + 4}>{axisFormatter(value)}</text>
            </g>
          );
        })}
        <g clipPath={`url(#${clipPathId})`}>
          {series.map((item,seriesIndex) => (
            <g key={item.id} className="xgc-system-io-chart-series" data-series={seriesIndex}>
              {item.values.length > 1 && <polyline points={polylinePoints(item.values,x,y)} />}
              {item.values.map((value,index) => (
                <circle key={index} cx={x(index)} cy={y(value)} r={item.values.length === 1 ? 3 : 7} data-visible={item.values.length === 1 ? 'true' : undefined}>
                  <title>{`${points[index]?.time ?? ''} · ${item.name}: ${valueFormatter(value)}`}</title>
                </circle>
              ))}
            </g>
          ))}
        </g>
        {timeLabels.map(({ index,label: timeLabel }) => (
          <text key={`${index}:${timeLabel}`} className="xgc-system-io-chart-time"
            textAnchor={points.length <= 1 ? 'middle' : index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
            x={x(index)} y={viewport.height - 8}>{timeLabel}</text>
        ))}
      </svg>
    </figure>
  );
}

function trendSeries(id: string,name: string,values: number[]): TrendSeries {
  return { id,name,values: values.map((value) => Number.isFinite(value) && value > 0 ? value : 0) };
}

function trendMaximum(series: TrendSeries[]) {
  const maximum = Math.max(0,...series.flatMap((item) => item.values));
  return maximum > 0 ? maximum * 1.1 : 1;
}

function polylinePoints(values: number[],x: (index: number) => number,y: (value: number) => number) {
  return values.map((value,index) => `${x(index)},${y(value)}`).join(' ');
}

function trendTimeLabels(points: SystemTrendPoint[]) {
  if (points.length === 0) return [];
  const indexes = new Set([0,Math.floor((points.length - 1) / 2),points.length - 1]);
  return Array.from(indexes,(index) => ({ index,label: points[index]?.time ?? '' }));
}

function formatPlain(value: number) {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(2);
}

function formatCompactRateAxis(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B/s';
  if (value >= 1024 ** 3) return `${trimUnitValue(value / 1024 ** 3)} GB/s`;
  if (value >= 1024 ** 2) return `${trimUnitValue(value / 1024 ** 2)} MB/s`;
  if (value >= 1024) return `${trimUnitValue(value / 1024)} KB/s`;
  return `${value.toFixed(0)} B/s`;
}

function trimUnitValue(value: number) {
  return value >= 10 ? value.toFixed(0) : value.toFixed(1);
}

function formatRate(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B/s';
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB/s`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB/s`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB/s`;
  return `${value.toFixed(0)} B/s`;
}
