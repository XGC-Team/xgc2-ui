// @vitest-environment jsdom

import { act,fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { RobotProjectionCard } from './RobotProjectionCard';
import {
  ROBOT_INSTRUMENT_DETAIL_HIDE_DELAY_MS,
  ROBOT_INSTRUMENT_DETAIL_SHOW_DELAY_MS,
  useRobotInstrumentDetailHover,
} from './useRobotInstrumentDetailHover';
import { ProductRouteVisibilityProvider } from '../../shared/routeReady';
import { ExperimentSurfaceVisibilityProvider } from '../../domains/experiment/experimentPublic';
import { checkRobotAssetReachability } from '../../domains/robot/robotAssetPublic';
import type * as RobotAssetPublic from '../../domains/robot/robotAssetPublic';

const listProjectionSpy = vi.hoisted(() => vi.fn());
const reachabilityProbeSpy = vi.hoisted(() => vi.fn());

vi.mock('./useRobotProjectionChannels',() => ({
  useRobotProjectionChannels:() => ({
    channels:{},healthChannel:undefined,health:{},status:{ online:false,operationalReady:false,status:'offline' },
    flight:false,mocapRotor:false,kindProjection:undefined,
    pose:{},poseChannel:undefined,mocap:undefined,localizationError:{},streamHealth:{},
    telemetryChannelIds:{ pose:'vrpn.position' },
  }),
}));
vi.mock('../../domains/robot/robotAssetPublic',async (importOriginal) => {
  const actual = await importOriginal<typeof RobotAssetPublic>();
  return {
    ...actual,
    useRobotAssetReachability:(probe: unknown) => { reachabilityProbeSpy(probe);return { reachabilityById:{},checkReachability:vi.fn() }; },
    checkRobotAssetReachability:vi.fn(async () => ({ reachable:true })),
  };
});
vi.mock('./RobotInstrumentProjection',() => ({
  RobotInstrumentProjection:() => <div title="Communication latency 12.0 ms">instrument</div>,
}));
vi.mock('./RobotListProjection',() => ({ RobotListProjection:(props: unknown) => {
  listProjectionSpy(props);
  return <div>list</div>;
} }));

describe('RobotProjectionCard selection',() => {
  it.each(['Communication latency 24.0 ms',''])('preserves a title updated during hover: %j', (latestTitle) => {
    vi.useFakeTimers();
    function Instrument({ title }: { title: string }) {
      const hover = useRobotInstrumentDetailHover({ robotId:'robot',content:'Current facts' });
      return <><div data-testid="instrument" {...hover.pointerHandlers}><span title={title}>Telemetry</span></div>{hover.portal}</>;
    }
    try {
      const view = render(<Instrument title="Communication latency 12.0 ms" />);
      const instrument = screen.getByTestId('instrument');
      fireEvent.pointerEnter(instrument);
      expect(instrument.querySelector('[title]')).toBeNull();
      act(() => vi.advanceTimersByTime(ROBOT_INSTRUMENT_DETAIL_SHOW_DELAY_MS));
      view.rerender(<Instrument title={latestTitle} />);
      fireEvent.pointerLeave(instrument);
      act(() => vi.advanceTimersByTime(ROBOT_INSTRUMENT_DETAIL_HIDE_DELAY_MS));
      expect(screen.queryByRole('tooltip')).toBeNull();
      expect(instrument.querySelector('span')).toHaveAttribute('title',latestTitle);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['route','dashboard'])('unmounts the body portal when its %s is parked', (scope) => {
    vi.useFakeTimers();
    const tree=(visible: boolean) => <ProductRouteVisibilityProvider visible={scope === 'route' ? visible : true}>
      <ExperimentSurfaceVisibilityProvider visible={scope === 'dashboard' ? visible : true}>
        <RobotProjectionCard targetId="local" assetTargetCoreId="local" robot={{ id:'robot',robotAssetId:'asset' } as never} selected={false} instrument onSelect={vi.fn()} />
      </ExperimentSurfaceVisibilityProvider>
    </ProductRouteVisibilityProvider>;
    const view=render(tree(true));
    fireEvent.pointerEnter(view.container.querySelector('[data-xgc-role="run-robot-card"]')!);
    act(() => vi.advanceTimersByTime(ROBOT_INSTRUMENT_DETAIL_SHOW_DELAY_MS));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    view.rerender(tree(false));
    expect(screen.queryByRole('tooltip')).toBeNull();
    view.rerender(tree(true));act(() => vi.advanceTimersByTime(ROBOT_INSTRUMENT_DETAIL_SHOW_DELAY_MS));
    expect(screen.queryByRole('tooltip')).toBeNull();
    vi.useRealTimers();
  });

  it('uses the asset catalog Core for Ping independently of the execution target', async () => {
    render(<RobotProjectionCard targetId="agent-runtime" assetTargetCoreId="catalog-core" robot={{ id:'robot',robotAssetId:'asset' } as never} selected={false} instrument onSelect={vi.fn()} />);
    const probe=reachabilityProbeSpy.mock.lastCall?.[0] as (id:string) => Promise<unknown>;
    await probe('asset');
    expect(checkRobotAssetReachability).toHaveBeenLastCalledWith('asset',{ targetCoreId:'catalog-core' });
  });

  it('keeps the card as the selection control without a per-instrument provider action',() => {
    const onSelect = vi.fn();
    const view = render(<RobotProjectionCard assetTargetCoreId="local"
      targetId="local" runId="main-run"
      robot={{ id:'scout-01',name:'Scout 01',kind:'scout_mini',hybridSource:'simulation',connectionState:'live' } as never}
      selected={false} instrument onSelect={onSelect}
    />);
    const selection = view.container.querySelector<HTMLElement>('[data-xgc-role="run-robot-card"]')!;
    expect(selection.getAttribute('role')).toBe('button');
    expect(view.container.querySelector('[data-xgc-role="robot-provider-restart"]')).toBeNull();
    expect(view.container.querySelector('.robot-instrument-card-shell')).toBeNull();
    expect(selection.parentElement).not.toHaveAttribute('data-xgc-provider-restart');

    fireEvent.keyDown(selection,{ key:'Enter' });
    expect(onSelect).toHaveBeenCalledWith('scout-01');
  });

  it('overlays the simulation mark only on hybrid-session instrument cards', () => {
    const robot = { id:'scout-04',name:'Scout 04',kind:'scout_mini',hybridSource:'simulation',connectionState:'live' } as never;
    const instrument = render(<RobotProjectionCard assetTargetCoreId="local"
      targetId="local" runMode="hybrid" robot={robot} selected={false} instrument onSelect={vi.fn()}
    />);
    expect(instrument.container.querySelector(
      '[data-xgc-role="run-robot-card"] > .robot-instrument-source-badge[data-xgc-id="scout-04"]',
    )?.textContent).toBe('(sim)');
    instrument.unmount();

    for (const runMode of ['simulation','physical','experiment'] as const) {
      const unified = render(<RobotProjectionCard assetTargetCoreId="local"
        targetId="local" runMode={runMode} robot={robot} selected={false} instrument onSelect={vi.fn()}
      />);
      expect(unified.container.querySelector(
        '[data-xgc-role="run-robot-card"] > .robot-instrument-source-badge',
      )).toBeNull();
      unified.unmount();
    }

    const list = render(<RobotProjectionCard assetTargetCoreId="local"
      targetId="local" runId="run-list" runMode="hybrid"
      robot={robot} selected={false} instrument={false} onSelect={vi.fn()}
    />);
    expect(list.container.querySelector(
      '[data-xgc-role="run-robot-card"] > .robot-instrument-source-badge',
    )).toBeNull();
    expect(listProjectionSpy.mock.lastCall?.[0]).not.toHaveProperty('runId');
    expect(listProjectionSpy.mock.lastCall?.[0]).not.toHaveProperty('hasRun');
  });

  it('portals known poses near the pointer without wrapping the selection host', () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    const view = render(<RobotProjectionCard assetTargetCoreId="local"
      targetId="local" runId="main-run"
      robot={{
        id:'px4-04',robotAssetId:'asset-px4-04',name:'UAV-04',kind:'px4_multirotor',
        hybridSource:'simulation',connectionState:'live',
        px4:{ managementIp:'192.168.51.11' },
      } as never}
      selected={false} instrument onSelect={onSelect}
    />);
    const card = view.container.querySelector<HTMLElement>('[data-xgc-role="run-robot-card"][data-xgc-id="px4-04"]')!;
    expect(card.getAttribute('role')).toBe('button');
    expect(card.parentElement).not.toHaveAttribute('data-xgc-role', 'tooltip-trigger');

    fireEvent.pointerEnter(card, { clientX: 80, clientY: 60 });
    expect(card.querySelector('[title]')).toBeNull();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => vi.advanceTimersByTime(ROBOT_INSTRUMENT_DETAIL_SHOW_DELAY_MS - 200));
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveAttribute('data-xgc-role', 'robot-instrument-detail-overlay');
    expect(tooltip).toHaveAttribute('data-xgc-portaled', 'true');
    expect(tooltip.style.left).toBe('92px');
    expect(tooltip.style.top).toBe('72px');
    expect(tooltip.querySelector('[data-xgc-role="robot-instrument-detail-row"][data-xgc-id="px4-04:ip"]')?.textContent)
      .toContain('192.168.51.11');
    expect(tooltip.querySelector('[data-xgc-role="robot-instrument-detail-ping"]')).not.toBeNull();
    expect(tooltip.querySelector('[data-xgc-role="robot-instrument-detail-ssh"]')).not.toBeNull();

    fireEvent.pointerDown(card, { button: 0 });
    expect(onSelect).toHaveBeenCalledWith('px4-04');

    fireEvent.pointerLeave(card);
    act(() => vi.advanceTimersByTime(ROBOT_INSTRUMENT_DETAIL_HIDE_DELAY_MS));
    expect(card.querySelector('[title="Communication latency 12.0 ms"]')).not.toBeNull();
    vi.useRealTimers();
  });
});
