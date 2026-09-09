// @vitest-environment jsdom

import { render,screen } from '@testing-library/react';
import { describe,expect,it } from 'vitest';
import type { RobotKindPanelChannel,RobotKindPanelRenderProps } from '../../robotAssetKindComposition';
import { unitreeB2RobotAssetKindContribution } from './contribution';

describe('Unitree B2 panel projection contribution', () => {
  it('owns both instrument and list renderers behind the composed leaf', () => {
    const projection = unitreeB2RobotAssetKindContribution.panelProjection!;
    const RenderInstrument = projection.RenderInstrument;
    const RenderList = projection.RenderList;
    const props = renderProps();

    const instrument = render(<RenderInstrument {...props} />);
    expect(instrument.container.querySelector('[data-xgc-role="robot-b2-instrument"]'))
      .not.toBeNull();
    instrument.unmount();

    const list = render(<RenderList {...props} />);
    expect(list.container.querySelector('[data-xgc-role="robot-list-b2-state"]'))
      .not.toBeNull();
    expect(screen.getByText('Odom pos (m)')).toBeTruthy();
    expect(screen.getByText('Battery I')).toBeTruthy();
    expect(screen.getByText('Odom spd')).toBeTruthy();
    expect(screen.getByText('Battery vol')).toBeTruthy();
    expect(screen.getByText('Yaw')).toBeTruthy();
    expect(screen.getByText('Yaw rate')).toBeTruthy();
    expect(screen.getAllByText('TROTTING').length).toBeGreaterThan(0);
  });

  it('shares the list metric structure without trend drawings for physical and sim B2 cards', () => {
    const projection = unitreeB2RobotAssetKindContribution.panelProjection!;
    const RenderList = projection.RenderList;
    const physical = render(<RenderList {...renderProps()} />);
    expectSharedB2List(physical.container);
    expect(physical.container.querySelector('[data-xgc-role="run-robot-source-badge"]')).toBeNull();
    expect(physical.container.querySelector('.robot-metric-local-position [data-xgc-axis="x"] .robot-list-metric-digits')?.textContent)
      .toBe('1.00');
    expect(physical.container.querySelector('.robot-metric-local-position [data-xgc-axis="y"] .robot-list-metric-digits')?.textContent)
      .toBe('2.00');
    expect(physical.container.querySelector('.robot-metric-local-position [data-xgc-axis="z"] .robot-list-metric-digits')?.textContent)
      .toBe('0.55');
    expect(physical.container.querySelector('.robot-metric-local-position dt .robot-list-metric-rate')?.textContent)
      .toBe('50.0 Hz');
    expect(physical.container.querySelector('.robot-metric-local-position dd .robot-list-metric-rate')).toBeNull();
    physical.unmount();

    const simulationSession = render(<RenderList {...renderProps({ hybridSource: 'simulation' })} />);
    expect(simulationSession.container.querySelector('[data-xgc-role="run-robot-source-badge"]')).toBeNull();
    simulationSession.unmount();

    const sim = render(<RenderList {...renderProps({ hybridSource: 'simulation' }, true)} />);
    expectSharedB2List(sim.container);
    expect(sim.container.querySelector(
      '.robot-card-identity .robot-instrument-source-badge',
    )?.textContent).toBe('(sim)');
  });

  it('owns list separators on the metric dl', () => {
    const projection = unitreeB2RobotAssetKindContribution.panelProjection!;
    const RenderList = projection.RenderList;
    const { container } = render(
      <div className="robot-instrument-grid" data-xgc-layout="list">
        <article className="robot-instrument-card" data-xgc-role="run-robot-card" data-xgc-presentation="list">
          <RenderList {...renderProps()} />
        </article>
      </div>,
    );
    const card = container.querySelector('[data-xgc-role="run-robot-card"][data-xgc-presentation="list"]');
    const header = card?.querySelector(':scope > header');
    const metrics = card?.querySelector(':scope > dl');
    expect(card?.firstElementChild).toBe(header);
    expect(header?.nextElementSibling).toBe(metrics);
    expect(header?.querySelector('.robot-card-identity')).not.toBeNull();
    expect(header?.querySelector('[data-xgc-role="robot-list-header-status"]')).not.toBeNull();
    expect(metrics?.querySelector('.robot-card-identity')).toBeNull();
    expect(metrics?.querySelectorAll(':scope > div').length).toBeGreaterThan(0);
    expect(header?.querySelector('[data-xgc-role="robot-list-trailing"]')).toBeNull();
    expectListHeaderStatus(container);
  });

  it('renders Battery vol and rate directly from the current Adapter projection', () => {
    const RenderList = unitreeB2RobotAssetKindContribution.panelProjection!.RenderList;
    const { container,rerender } = render(<RenderList {...renderProps()} />);
    const tile = () => container.querySelector('[data-xgc-role="robot-b2-battery-voltage"]');
    expect(tile()?.querySelector('.robot-list-metric-digits')?.textContent).toBe('52.0');
    expect(tile()?.querySelector('.robot-list-metric-rate')?.textContent).toBe('5.0 Hz');

    const gap = {
      ...renderProps(),
      channels:{
        ...renderProps().channels,
        'diagnostic.stream-health':channel('diagnostic.stream-health',{
          channels:[{ channelId:'state.power',sourceRateHz:0,stale:false }],
        }),
        'state.power':channel('state.power',{}),
      },
    } satisfies RobotKindPanelRenderProps;
    rerender(<RenderList {...gap} />);
    expect(tile()?.querySelector('.robot-list-metric-digits')?.textContent).toBe('--');
    expect(tile()?.querySelector('.robot-list-metric-rate')?.textContent).toBe('-- Hz');
  });

  it('renders Battery vol unavailable when the B2 disconnects or loses its power channel', () => {
    const RenderList = unitreeB2RobotAssetKindContribution.panelProjection!.RenderList;
    const { container,rerender } = render(<RenderList {...renderProps()} />);
    const tile = () => container.querySelector('[data-xgc-role="robot-b2-battery-voltage"]');
    expect(tile()?.querySelector('.robot-list-metric-digits')?.textContent).toBe('52.0');
    expect(tile()?.querySelector('.robot-list-metric-rate')?.textContent).toBe('5.0 Hz');

    const disconnected = renderProps({ connectionState:'closed' });
    rerender(<RenderList {...{
      ...disconnected,
      status:{ online:false,operationalReady:false,status:'offline' },
    }} />);
    expect(tile()?.querySelector('.robot-list-metric-digits')?.textContent).toBe('--');
    expect(tile()?.querySelector('.robot-list-metric-rate')?.textContent).toBe('-- Hz');

    rerender(<RenderList {...renderProps()} />);
    expect(tile()?.querySelector('.robot-list-metric-digits')?.textContent).toBe('52.0');

    const withoutPower = renderProps();
    const { ['state.power']:_removedPower,...channelsWithoutPower } = withoutPower.channels;
    rerender(<RenderList {...withoutPower} channels={channelsWithoutPower} />);
    expect(tile()?.querySelector('.robot-list-metric-digits')?.textContent).toBe('--');
    expect(tile()?.querySelector('.robot-list-metric-rate')?.textContent).toBe('-- Hz');
  });

  it('uses B2 channel freshness for header states without local-fleet semantic fields', () => {
    const RenderList = unitreeB2RobotAssetKindContribution.panelProjection!.RenderList;
    const props = renderProps();
    const { container } = render(<RenderList {...{
      ...props,
      channels:{
        ...props.channels,
        'state.pose':{ ...props.channels['state.pose']!,stale:true },
        'state.locomotion':channel('state.locomotion',{
          mode:'trotting',motionEnabled:true,commandStale:true,
        }),
        'diagnostic.link':{ ...props.channels['diagnostic.link']!,stale:true },
      },
    }} />);

    expect(container.querySelector('[data-xgc-role="robot-network-indicator"]'))
      .toHaveAttribute('title', 'B2 forwarder link stale');
    expect(container.querySelector('[data-xgc-role="robot-network-indicator"]'))
      .toHaveAttribute('data-xgc-tone', 'danger');
    expect(container.querySelector('[data-xgc-role="robot-position-indicator"]'))
      .toHaveAttribute('title', 'B2 odometry stale');
    expect(container.querySelector('[data-xgc-role="robot-position-indicator"]'))
      .toHaveAttribute('data-xgc-tone', 'danger');
    expect(container.querySelector('[data-xgc-role="robot-control-indicator"]')).toBeNull();
  });
});

function expectListHeaderStatus(container: HTMLElement) {
  const header = container.querySelector('header');
  const identity = header?.querySelector('.robot-card-identity');
  const cluster = header?.querySelector('[data-xgc-role="robot-list-header-status"]');
  expect(identity).toHaveAttribute('data-xgc-gap', 'sm');
  expect(cluster).toHaveClass('robot-list-header-status');
  const items = [...(cluster?.querySelectorAll(':scope > .robot-instrument-status-glyph') ?? [])];
  expect(items.map((node) => node.getAttribute('data-xgc-role'))).toEqual([
    'robot-network-indicator',
    'robot-position-indicator',
    'robot-power-indicator',
  ]);
  expect(cluster?.querySelectorAll('svg')).toHaveLength(3);
  expect(cluster?.querySelector('[data-xgc-role="robot-control-indicator"]')).toBeNull();
  expect(cluster?.querySelector('[data-xgc-role="robot-network-indicator"]'))
    .toHaveAttribute('data-xgc-source', 'diagnostic.link.sourceAgeMs');
  expect(cluster?.querySelector('[data-xgc-role="robot-network-indicator"]'))
    .toHaveAttribute('title', 'B2 forwarder heartbeat age 4 ms');
  expect(cluster?.querySelector('[data-xgc-role="robot-power-indicator"]'))
    .toHaveAttribute('data-xgc-source', 'state.power.percentage');
  expect(cluster?.querySelector('[data-xgc-role="robot-power-indicator"]'))
    .toHaveAttribute('title', 'Battery 80%');
  expect(cluster?.querySelector('[data-xgc-role="robot-position-indicator"]'))
    .toHaveAttribute('data-xgc-source', 'state.pose');
  expect(cluster?.querySelector('[data-xgc-role="robot-position-indicator"]'))
    .toHaveAttribute('title', 'B2 odometry fresh');
}

function expectSharedB2List(container: HTMLElement) {
  expectListHeaderStatus(container);
  expect(container.querySelectorAll('dl svg')).toHaveLength(0);
  expect(container.querySelectorAll('.robot-response-trend')).toHaveLength(0);
  const tiles = [...container.querySelectorAll('dl > div')];
  expect(tiles.length).toBeGreaterThan(0);
  for (const tile of tiles) {
    expect(tile.querySelector('dt')).not.toBeNull();
    expect(tile.querySelector('dd.robot-list-metric-body')).not.toBeNull();
  }
  const titles = [...container.querySelectorAll('dl > div > dt .robot-list-metric-title')]
    .map((node) => node.textContent);
  expect(titles).toEqual([
    'Odom pos (m)','Odom spd','Battery vol','Battery I',
    'Yaw','Yaw rate','Mode',
  ]);
  expect(container.querySelector('[data-xgc-role="robot-b2-odom-speed"] [data-xgc-role="robot-list-metric-readout"]')?.textContent)
    .toMatch(/m\/s/);
}

function renderProps(
  robotOverrides: Partial<RobotKindPanelRenderProps['robot']> = {},
  showSimulationSourceMark = false,
): RobotKindPanelRenderProps {
  return {
    robot:{ id:'b2-01',name:'B2 01',connectionState:'live',...robotOverrides },
    showSimulationSourceMark,
    status:{ online:true,operationalReady:true,status:'online' },
    healthTone:'healthy',
    channels:{
      'state.pose':channel('state.pose',{
        position:{ x:1,y:2,z:0.55 },
        orientation:{ x:0,y:0,z:0,w:1 },
      }),
      'state.velocity':channel('state.velocity',{
        linear:{ x:0.5,y:0,z:0 },angular:{ x:0,y:0,z:0.1 },
      }),
      'state.speed':channel('state.speed',{ metersPerSecond:0.5 }),
      'state.power':channel('state.power',{ percentage:0.8,voltageV:52,currentA:-2 }),
      'state.health':channel('state.health',{ online:true,summary:'ok',faults:[] }),
      'state.locomotion':channel('state.locomotion',{ mode:'trotting',motionEnabled:true }),
      'state.joints':channel('state.joints',{ name:Array.from({ length:12 },(_,index) => `joint-${index}`) }),
      'diagnostic.link':channel('diagnostic.link',{
        channelId:'forwarder_hb',sourceRateHz:1,outputRateHz:1,
        droppedSamples:0,sourceAgeMs:4,stale:false,
      }),
      'diagnostic.stream-health':channel('diagnostic.stream-health',{
        channels:[
          { channelId:'state.pose',sourceRateHz:50 },
          { channelId:'state.speed',sourceRateHz:50 },
          { channelId:'state.power',sourceRateHz:5 },
        ],
      }),
    },
  };
}

function channel(
  channelId:string,
  value:Record<string,unknown>,
): RobotKindPanelChannel {
  return {
    channelId,
    sequence:1,
    observedAt:'2026-08-22T00:00:00Z',
    stale:false,
    value,
  };
}
