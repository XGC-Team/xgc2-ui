// @vitest-environment jsdom

import { act,render,screen } from '@testing-library/react';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { SystemIOTrend } from './SystemIOTrend';

const points = [
  { time: '10:00:00',diskReadRate: 1024,diskWriteRate: 2048,networkRxRate: 4096,networkTxRate: 8192,load1: .25 },
  { time: '10:00:05',diskReadRate: 2048,diskWriteRate: 4096,networkRxRate: 8192,networkTxRate: 16384,load1: .5 },
];

describe('SystemIOTrend', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps axis typography at viewport scale and preserves geometry while parked', () => {
    let onResize: ResizeObserverCallback | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver',class {
      constructor(callback: ResizeObserverCallback) { onResize = callback; }
      observe() {}
      disconnect = disconnect;
    });
    const { container,unmount } = render(<SystemIOTrend kind="network" points={points} />);
    const svg = container.querySelector('svg')!;
    const resize = (width:number,height:number) => act(() => onResize?.([
      { target:svg,contentRect:{ width,height } } as unknown as ResizeObserverEntry,
    ],{} as ResizeObserver));

    resize(429,154);
    expect(svg).toHaveAttribute('viewBox','0 0 429 154');
    expect(svg.querySelector('clipPath rect')).toHaveAttribute('width','361');
    expect(svg.querySelector('clipPath rect')).toHaveAttribute('height','108');
    resize(0,0);
    expect(svg).toHaveAttribute('viewBox','0 0 429 154');
    resize(320,154);
    expect(svg).toHaveAttribute('viewBox','0 0 320 154');
    expect(svg.querySelectorAll('circle')).toHaveLength(4);
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('renders the five current metrics through lightweight SVG charts', () => {
    const { container } = render(<SystemIOTrend points={points} />);

    expect(screen.getByLabelText('Network throughput')).toBeInTheDocument();
    expect(screen.getByLabelText('Disk throughput')).toBeInTheDocument();
    expect(screen.getByLabelText('System load')).toBeInTheDocument();
    expect(container.querySelectorAll('polyline')).toHaveLength(5);
    expect(container.querySelectorAll('circle')).toHaveLength(10);
    expect(container.querySelector('title')?.textContent).toContain('10:00:00 · Net rx: 4.0 KB/s');
  });

  it('renders an empty chart without inventing measurements', () => {
    const { container } = render(<SystemIOTrend points={[]} />);

    expect(container.querySelectorAll('svg')).toHaveLength(3);
    expect(container.querySelectorAll('polyline')).toHaveLength(0);
    expect(container.querySelectorAll('circle')).toHaveLength(0);
  });

  it('renders a single chart when the domain asks for one kind', () => {
    const { container } = render(<SystemIOTrend kind="disk" points={points} />);

    expect(container.querySelector('.xgc-system-io-chart-grid')).toHaveAttribute('data-xgc-kind', 'disk');
    expect(screen.getByLabelText('Disk throughput')).toBeInTheDocument();
    expect(screen.queryByLabelText('Network throughput')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('System load')).not.toBeInTheDocument();
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });

  it('stamps chart, legend, and series leaves when the domain asks for markable hosts', () => {
    const { container } = render(
      <SystemIOTrend
        kind="network"
        points={points}
        chartRole="system-overview-trend-chart"
        legendRole="system-overview-trend-legend"
        seriesRole="system-overview-trend-series"
      />,
    );

    expect(container.querySelector('[data-xgc-role="system-overview-trend-chart"][data-xgc-id="network"]')).toHaveAttribute('aria-label', 'Network throughput');
    expect(container.querySelector('[data-xgc-role="system-overview-trend-legend"][data-xgc-id="network"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="system-overview-trend-series"][data-xgc-id="network:rx"]')).toHaveTextContent('Net rx');
    expect(container.querySelector('[data-xgc-role="system-overview-trend-series"][data-xgc-id="network:tx"]')).toHaveTextContent('Net tx');
    expect(container.querySelector('svg')).not.toHaveAttribute('data-xgc-role');
    expect(container.querySelector('polyline')).not.toHaveAttribute('data-xgc-role');
  });

  it('normalizes non-finite and negative samples before plotting', () => {
    const { container } = render(<SystemIOTrend points={[{
      ...points[0],
      networkRxRate: Number.NaN,
      networkTxRate: -1,
    }]} />);

    const networkCircles = container.querySelectorAll('[aria-label="Network throughput"] circle');
    expect(networkCircles).toHaveLength(2);
    expect(Array.from(networkCircles).every((circle) => circle.getAttribute('cy') === networkCircles[0]?.getAttribute('cy'))).toBe(true);
    expect(Array.from(networkCircles).every((circle) => circle.querySelector('title')?.textContent.endsWith('0 B/s'))).toBe(true);
  });
});
