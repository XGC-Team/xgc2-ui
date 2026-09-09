// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { describe,expect,it } from 'vitest';
import { experimentRobotSimulationSourceMark } from '../../domains/experiment/experimentPublic';
import { RobotListProjection } from './RobotListProjection';
import type { RobotPanelItem } from './robotProjectionModel';
import type { RobotProjectionChannels } from './useRobotProjectionChannels';

describe('RobotListProjection', () => {
  it('uses three Scout header glyphs and left chassis text instead of a fourth icon', () => {
    const { container } = render(
      listCard(
        <RobotListProjection robot={scoutRobot()} projection={liveScoutProjection()} />,
        'scout-01',
      ),
    );
    expectListHeaderStatus(container);
    const header = container.querySelector(
      '[data-xgc-role="run-robot-card"][data-xgc-id="scout-01"] header',
    );
    const cluster = header?.querySelector('[data-xgc-role="robot-list-header-status"]');
    const chassisMode = header?.querySelector('[data-xgc-role="robot-list-header-chassis-mode"]');
    expect(header?.textContent).not.toContain('CAN');
    expect(header?.textContent).not.toContain('28.8 V');
    expect(chassisMode).toHaveClass('robot-list-header-word');
    expect(chassisMode?.textContent).toBe('CMD');
    expect(chassisMode).toHaveAttribute('data-xgc-tone', 'success');
    expect(header?.querySelector('[data-xgc-role="robot-network-indicator"]'))
      .toHaveAttribute('data-xgc-source', 'diagnostic.stream-health.channels[state.imu].sourceAgeMs');
    expect(header?.querySelector('[data-xgc-role="robot-network-indicator"]')?.getAttribute('aria-label'))
      .toBe('Communication freshness from last IMU receipt age 14 ms');
    expect(header?.querySelector('[data-xgc-role="robot-network-indicator"]')?.getAttribute('aria-label'))
      .not.toMatch(/round-trip|RTT/i);
    expect(header?.querySelector('[data-xgc-role="robot-power-indicator"]'))
      .toHaveAttribute('data-xgc-source', 'state.power.voltageV+percentageState+percentage');
    expect(header?.querySelector('[data-xgc-role="robot-power-indicator"]'))
      .toHaveAttribute('aria-label', 'Battery 95%; 28.8 V');
    expect(header?.querySelector('[data-xgc-role="robot-position-indicator"]'))
      .toHaveAttribute('data-xgc-source', 'state.health.positioning');
    expect(header?.querySelector('[data-xgc-role="robot-control-indicator"]')).toBeNull();
    expect([...cluster?.querySelectorAll('.robot-instrument-status-glyph') ?? []]
      .map((node) => node.getAttribute('data-xgc-tone')))
      .toEqual(['success','success','success']);
    expect(container.querySelector('[data-xgc-role="robot-ground-battery-voltage"] .robot-list-metric-digits')?.textContent)
      .toBe('28.8');
  });

  it('shows Scout RC as left header text with the UAV word font', () => {
    const projection = liveScoutProjection();
    const chassisChannel = liveChannel('state.chassis', {
      controlMode:'CONTROL_MODE_REMOTE',nativeControlMode:3,
    });
    const { container } = render(listCard(<RobotListProjection
      robot={scoutRobot()}
      projection={{
        ...projection,
        channels:{ ...projection.channels,'state.chassis':chassisChannel },
        chassis:chassisChannel.value,
      }}
    />));
    const chassisMode = container.querySelector('[data-xgc-role="robot-list-header-chassis-mode"]');
    expect(chassisMode).toHaveClass('robot-list-header-word');
    expect(chassisMode?.textContent).toBe('RC');
    expect(chassisMode).toHaveAttribute('data-xgc-tone','danger');
    expect(container.querySelector('[data-xgc-role="robot-control-indicator"]')).toBeNull();
    expectListHeaderStatus(container);
  });

  it('paints unseen Scout UART chassis text red instead of usable green', () => {
    const projection = liveScoutProjection();
    const chassisChannel = liveChannel('state.chassis', {
      controlMode:'CONTROL_MODE_COMMAND_UART',nativeControlMode:2,
    });
    const { container } = render(listCard(<RobotListProjection
      robot={scoutRobot()}
      projection={{
        ...projection,
        channels:{ ...projection.channels,'state.chassis':chassisChannel },
        chassis:chassisChannel.value,
      }}
    />));
    const chassisMode = container.querySelector('[data-xgc-role="robot-list-header-chassis-mode"]');
    expect(chassisMode?.textContent).toBe('UART');
    expect(chassisMode).toHaveAttribute('data-xgc-tone','danger');
    expect(chassisMode).not.toHaveAttribute('data-xgc-tone','success');
  });

  it('projects stale and absent Scout adapter truth honestly through the stable card selector', () => {
    const live = liveScoutProjection();
    const legacyHealth = liveChannel('state.health', {
      online:true,summary:'Scout chassis telemetry is healthy',
    });
    const stalePower = {
      ...live.channels['state.power']!,
      stale:true,
      value:{ percentageState:'PERCENTAGE_STATE_UNAVAILABLE',voltageV:28.8 },
    };
    const staleChassis = { ...live.channels['state.chassis']!,stale:true };
    const view = render(listCard(<RobotListProjection
      robot={scoutRobot()}
      projection={{
        ...live,
        channels:{
          ...live.channels,
          'state.power':stalePower,
          'state.health':legacyHealth,
          'state.chassis':staleChassis,
        },
        power:stalePower.value,
        healthChannel:legacyHealth,
        health:legacyHealth.value,
        chassis:staleChassis.value,
        streamHealth:{ channels:[
          { channelId:'state.imu',sourceAgeMs:1_200,stale:true },
          { channelId:'vrpn.position',sourceAgeMs:1_300,stale:true },
        ] },
      }}
    />,'scout-01'));
    const selector = '[data-xgc-role="run-robot-card"][data-xgc-id="scout-01"] header [data-xgc-role="robot-list-header-status"]';
    const staleCluster = view.container.querySelector(selector);
    expect([...staleCluster?.querySelectorAll('.robot-instrument-status-glyph') ?? []]
      .map((node) => node.getAttribute('data-xgc-tone')))
      .toEqual(['danger','neutral','neutral']);
    expect(staleCluster?.querySelector('[data-xgc-role="robot-network-indicator"]'))
      .toHaveAttribute(
        'aria-label',
        'Communication freshness from last IMU receipt age 1200 ms; stream stale',
      );
    expect(staleCluster?.querySelector('[data-xgc-role="robot-power-indicator"]'))
      .toHaveAttribute('aria-label', 'Battery status unavailable; stream stale');
    expect(staleCluster?.querySelector('[data-xgc-role="robot-position-indicator"]'))
      .toHaveAttribute('aria-label', 'VRPN position unavailable');
    expect(staleCluster?.querySelector('[data-xgc-role="robot-control-indicator"]')).toBeNull();
    expect(view.container.querySelector('[data-xgc-role="robot-list-header-chassis-mode"]')?.textContent)
      .toBe('CMD');

    const channels = { ...live.channels };
    delete channels['state.power'];
    delete channels['state.health'];
    delete channels['state.chassis'];
    view.rerender(listCard(<RobotListProjection
      robot={scoutRobot()}
      projection={{
        ...live,channels,imu:{},power:{},healthChannel:undefined,health:{},chassis:{},
        streamHealth:{ channels:[] },
      }}
    />,'scout-01'));
    const absentCluster = view.container.querySelector(selector);
    expect([...absentCluster?.querySelectorAll('.robot-instrument-status-glyph') ?? []]
      .map((node) => node.getAttribute('data-xgc-tone')))
      .toEqual(['neutral','neutral','neutral']);
    expect([...absentCluster?.querySelectorAll('.robot-instrument-status-glyph') ?? []]
      .map((node) => node.getAttribute('aria-label')))
      .toEqual([
        'Communication freshness unavailable',
        'VRPN position unavailable',
        'Battery status unavailable',
      ]);
    expect(absentCluster?.querySelector('[data-xgc-role="robot-control-indicator"]')).toBeNull();
    expect(view.container.querySelector('[data-xgc-role="robot-list-header-chassis-mode"]')?.textContent)
      .toBe('--');
  });

  it('keeps Mecanum IMU freshness and Battery vol without inventing chassis RC/command', () => {
    const { container } = render(
      <RobotListProjection robot={mecanumRobot()} projection={liveMecanumProjection()} />,
    );
    expectListHeaderStatus(container);
    expect(container.querySelector('header')?.textContent).not.toMatch(/UGV|28\.8 V/);
    expect(container.querySelector('[data-xgc-role="robot-network-indicator"]'))
      .toHaveAttribute('data-xgc-source', 'diagnostic.stream-health.channels[state.imu].sourceAgeMs');
    expect(container.querySelector('[data-xgc-role="robot-control-indicator"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-list-header-chassis-mode"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-ground-battery-voltage"] .robot-list-metric-digits')?.textContent)
      .toBe('28.8');
  });

  it('does not map leaked Scout chassis_state onto a Mecanum list card', () => {
    const { container } = render(
      <RobotListProjection robot={mecanumRobot()} projection={liveScoutProjection()} />,
    );
    expectListHeaderStatus(container);
    expect(container.querySelector('[data-xgc-role="robot-control-indicator"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-list-header-chassis-mode"]')).toBeNull();
  });

  it('keeps Mecanum VRPN unavailable muted before a Run instead of danger', () => {
    const { container } = render(
      <RobotListProjection
        robot={mecanumRobot()}
        projection={liveMecanumProjection()}
        healthTone="idle"
      />,
    );
    const position = container.querySelector(
      '[data-xgc-role="robot-position-indicator"][data-xgc-id="mecanum-01"]',
    );
    expect(position).toHaveAttribute('data-xgc-tone', 'muted');
    expect(position).not.toHaveAttribute('data-xgc-tone', 'danger');
    expect([...container.querySelectorAll('.robot-instrument-status-glyph')]
      .map((glyph) => glyph.getAttribute('data-xgc-tone')))
      .toEqual(['muted','muted','muted']);
  });

  it('uses Adapter timed-out positioning danger instead of Web online/pose inference', () => {
    const projection = liveScoutProjection();
    const healthChannel = liveChannel('state.health', {
      positioning: {
        state:'POSITIONING_STATE_TIMED_OUT',reason:'POSITIONING_REASON_VRPN_TIMEOUT',
        observedAgeMs:1_200,windowSpreadM:0,sampleCount:0,
      },
    });
    const { container } = render(
      <RobotListProjection
        robot={scoutRobot()}
        projection={{ ...projection,
          status: { online: false,operationalReady: false,status: 'offline' },
          poseChannel: liveChannel('vrpn.position'),
          channels: { ...projection.channels,'state.health':healthChannel },
          healthChannel,
          health: healthChannel.value,
        }}
      />,
    );
    expectListHeaderStatus(container);
    expect(container.querySelector('[data-xgc-role="robot-position-indicator"]'))
      .toHaveAttribute('data-xgc-tone', 'danger');
  });

  it('uses Adapter jittering positioning warning even when the VRPN channel is fresh', () => {
    const projection = liveScoutProjection();
    const healthChannel = liveChannel('state.health', {
      positioning: {
        state:'POSITIONING_STATE_JITTERING',
        reason:'POSITIONING_REASON_STATIONARY_JITTER_EXCEEDED',
        observedAgeMs:20,windowSpreadM:0.09,sampleCount:12,
      },
    });
    const { container } = render(
      <RobotListProjection
        robot={scoutRobot()}
        projection={{ ...projection,
          poseChannel: liveChannel('vrpn.position'),
          channels: { ...projection.channels,'state.health':healthChannel },
          healthChannel,
          health: healthChannel.value,
        }}
      />,
    );
    expectListHeaderStatus(container);
    expect(container.querySelector('[data-xgc-role="robot-position-indicator"]'))
      .toHaveAttribute('data-xgc-tone', 'warning');
  });

  it('uses Adapter positioning health on PX4 list headers, not mocap pose freshness', () => {
    const { container } = render(
      <RobotListProjection robot={flightRobot()} projection={liveFlightProjection()} />,
    );
    expectListHeaderStatus(container);
    expect(container.querySelector('[data-xgc-role="robot-network-indicator"]'))
      .toHaveAttribute('data-xgc-source', 'diagnostic.fcu-link.roundTripTimeMs');
    expect(container.querySelector('[data-xgc-role="robot-network-indicator"]'))
      .toHaveAttribute('aria-label', 'FCU round-trip time 18.0 ms');
    expect(container.querySelector('[data-xgc-role="robot-position-indicator"]'))
      .toHaveAttribute('data-xgc-source', 'state.health.positioning');
    expect(container.querySelector('[data-xgc-role="robot-position-indicator"]')?.getAttribute('aria-label'))
      .toContain('VRPN positioning active');
    expect(container.querySelector('[data-xgc-role="robot-position-indicator"]')?.getAttribute('aria-label'))
      .not.toMatch(/Positioning ready/);
    expect(container.querySelector('[data-xgc-role="robot-control-indicator"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-list-header-pos-err"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-list-header-flight-mode"]')?.textContent)
      .toBe('OFFBOARD');
    expect(container.querySelector('[data-xgc-role="robot-list-header-flight-mode"]'))
      .toHaveAttribute('data-xgc-tone','success');
    expect(container.querySelector('[data-xgc-role="robot-list-header-flight-armed"]')?.textContent)
      .toBe('ARMED');
    expect(container.querySelector('[data-xgc-role="robot-list-header-flight-armed"]'))
      .toHaveAttribute('data-xgc-tone','success');
    expect(container.querySelector('[data-xgc-role="robot-list-header-flight-stage"]')?.textContent)
      .toBe('GROUND');
    expect(container.querySelector('[data-xgc-role="robot-list-header-flight-stage"]'))
      .toHaveAttribute('data-xgc-id', 'fs150-01');
    expect(container.querySelector('.robot-list-flight-state > i')).toBeNull();
    expect(container.querySelector('.robot-list-flight-state')?.textContent)
      .not.toMatch(/·/);
    for (const role of [
      'robot-list-header-flight-mode',
      'robot-list-header-flight-armed',
      'robot-list-header-flight-stage',
    ]) {
      expect(container.querySelector(`[data-xgc-role="${role}"]`))
        .toHaveClass('robot-list-header-word');
    }
  });

  it('keeps list flight mode white when not OFFBOARD', () => {
    const { container } = render(
      <RobotListProjection
        robot={flightRobot()}
        projection={{
          ...liveFlightProjection(),
          flightState: { connected: true, mode: 'MANUAL', armed: true, landedState: 1 },
        }}
      />,
    );
    expect(container.querySelector('[data-xgc-role="robot-list-header-flight-mode"]')?.textContent)
      .toBe('MANUAL');
    expect(container.querySelector('[data-xgc-role="robot-list-header-flight-mode"]'))
      .toHaveAttribute('data-xgc-tone','normal');
    expect(container.querySelector('[data-xgc-role="robot-list-header-flight-armed"]'))
      .toHaveAttribute('data-xgc-tone','success');
    expect(container.querySelector('[data-xgc-role="robot-list-header-flight-armed"]')?.textContent)
      .toBe('ARMED');
    expect(container.querySelector('[data-xgc-role="robot-list-header-flight-stage"]')?.textContent)
      .toBe('GROUND');
  });

  it('keeps list DISARMED white', () => {
    const { container } = render(
      <RobotListProjection
        robot={flightRobot()}
        projection={{
          ...liveFlightProjection(),
          flightState: { connected: true, mode: 'OFFBOARD', armed: false, landedState: 1 },
        }}
      />,
    );
    expect(container.querySelector('[data-xgc-role="robot-list-header-flight-armed"]')?.textContent)
      .toBe('DISARMED');
    expect(container.querySelector('[data-xgc-role="robot-list-header-flight-armed"]')?.textContent)
      .not.toMatch(/未解锁/);
    expect(container.querySelector('[data-xgc-role="robot-list-header-flight-armed"]'))
      .toHaveAttribute('data-xgc-tone','normal');
    expect(container.querySelector('[data-xgc-role="robot-list-header-flight-mode"]'))
      .toHaveAttribute('data-xgc-tone','success');
  });

  it('never renders list POS ERR, even when localization error meters are present', () => {
    const withMeters = render(
      <RobotListProjection robot={flightRobot()} projection={liveFlightProjection()} />,
    );
    const missing = render(
      <RobotListProjection
        robot={flightRobot()}
        projection={{ ...liveFlightProjection(), localizationError: {} }}
      />,
    );
    const atFloor = render(
      <RobotListProjection
        robot={flightRobot()}
        projection={{ ...liveFlightProjection(), localizationError: { meters: 0.1 } }}
      />,
    );
    expect(withMeters.container.querySelector('[data-xgc-role="robot-list-header-pos-err"]')).toBeNull();
    expect(missing.container.querySelector('[data-xgc-role="robot-list-header-pos-err"]')).toBeNull();
    expect(atFloor.container.querySelector('[data-xgc-role="robot-list-header-pos-err"]')).toBeNull();
  });

  it('uses adapter IMU receipt age when a ground link channel has no latency measurement', () => {
    const projection = liveScoutProjection();
    const linkChannel = liveChannel('diagnostic.ground-link', { connected:true });
    const { container } = render(<RobotListProjection
      robot={scoutRobot()}
      projection={{
        ...projection,
        telemetryChannelIds:{ ...projection.telemetryChannelIds,link:'diagnostic.ground-link' },
        channels:{ ...projection.channels,'diagnostic.ground-link':linkChannel },
      }}
    />);
    expect(container.querySelector('[data-xgc-role="robot-network-indicator"]'))
      .toHaveAttribute('data-xgc-source', 'diagnostic.stream-health.channels[state.imu].sourceAgeMs');
    expect(container.querySelector('[data-xgc-role="robot-network-indicator"]')?.getAttribute('aria-label'))
      .toMatch(/last IMU receipt age \d+ ms/);
  });

  it('does not substitute IMU age for a PX4 link whose RTT is unavailable', () => {
    const projection = liveFlightProjection();
    const linkChannel = liveChannel('diagnostic.fcu-link', { connected:true });
    const imuChannel = liveChannel('state.imu', { linearAcceleration:{ x:0,y:0,z:9.81 } });
    const { container } = render(<RobotListProjection
      robot={flightRobot()}
      projection={{
        ...projection,
        channels:{
          ...projection.channels,
          'diagnostic.fcu-link':linkChannel,
          'state.imu':imuChannel,
        },
        fcuLink:linkChannel.value,
      }}
    />);
    const communication = container.querySelector('[data-xgc-role="robot-network-indicator"]');
    expect(communication).toHaveAttribute('aria-label', 'Communication link connected');
    expect(communication).toHaveAttribute('data-xgc-tone', 'info');
    expect(communication).toHaveAttribute('data-xgc-source', 'diagnostic.fcu-link.roundTripTimeMs');
    expect(communication?.getAttribute('aria-label')).not.toMatch(/IMU/);
  });

  it('keeps Scout physical list cards on numeric telemetry without trend drawings', () => {
    const { container } = render(
      <RobotListProjection robot={scoutRobot()} projection={liveScoutProjection()} />,
    );
    expectSharedListInstrument(container);
    expect(container.querySelector('[data-xgc-role="run-robot-source-badge"]')).toBeNull();
    expectCoordinateValues(container, { x: '1.80', y: '0.00', z: '0.18' });
    expectMetricRate(container, '.robot-metric-local-position', '50.0 Hz');
    expectMetricRate(container, '[data-xgc-role="robot-ground-vrpn-speed"]', '50.0 Hz');
    expect(container.querySelector('[data-xgc-role="robot-ground-vrpn-speed"] .robot-list-metric-digits')?.textContent)
      .toBe('0.21');
    expect(container.textContent).not.toMatch(/Connect|Reconnect/);
  });

  it.each([
    ['Scout',scoutRobot(),liveScoutProjection()],
    ['Mecanum',mecanumRobot(),liveMecanumProjection()],
  ] as const)('freezes %s ground metric order and raw source semantics', (_label,robot,projection) => {
    const { container } = render(<RobotListProjection robot={robot} projection={projection} />);
    const titles = [...container.querySelectorAll('dl > div > dt .robot-list-metric-title')]
      .map((node) => node.textContent);
    expect(titles).toEqual([
      'VRPN pos (m)','VRPN vel (m/s)','VRPN spd','VRPN acc (m/s²)',
      'CMD vel','CMD twist','Battery vol','Yaw',
    ]);
    expect(container.querySelector('[data-xgc-role="robot-ground-vrpn-speed"] [data-xgc-role="robot-list-metric-readout"]')?.textContent)
      .toMatch(/m\/s/);
    expect(container.querySelector('[data-xgc-role="robot-ground-command-velocity"] [data-xgc-role="robot-list-metric-readout"]')?.textContent)
      .toMatch(/m\/s/);
    expect(container.querySelector('[data-xgc-role="robot-ground-battery-voltage"] [data-xgc-role="robot-list-metric-readout"]')?.textContent)
      .toMatch(/V/);
    expect(container.querySelector('[data-xgc-role="robot-ground-command-velocity"] .robot-list-metric-digits')?.textContent)
      .toBe('0.32');
    expect(container.querySelector('[data-xgc-role="robot-ground-command-twist"] .robot-list-metric-sign')?.textContent)
      .toBe('-');
    expect(container.querySelector('[data-xgc-role="robot-ground-command-twist"] .robot-list-metric-digits')?.textContent)
      .toBe('0.18');
    expect(container.querySelector('[data-xgc-role="robot-ground-vrpn-acceleration"] [data-xgc-axis="x"] .robot-list-metric-digits')?.textContent)
      .toBe('0.12');
    expect(container.textContent).not.toMatch(/Lin err|Ang err|LINCMD|ANGCMD/);
  });

  it('renders an unpublished command as empty instead of fabricating zero motion', () => {
    const projection = liveScoutProjection();
    const channels = { ...projection.channels };
    const streamChannels = projection.streamHealth.channels as Array<Record<string,unknown>>;
    delete channels['command.velocity'];
    const { container } = render(<RobotListProjection
      robot={scoutRobot()}
      projection={{
        ...projection,
        channels,
        commandVelocityChannel:undefined,
        commandVelocity:{},
        streamHealth:{
          channels:streamChannels.filter(({ channelId }) => channelId!=='command.velocity'),
        },
      }}
    />);
    for (const role of ['robot-ground-command-velocity','robot-ground-command-twist']) {
      const metric = container.querySelector(`[data-xgc-role="${role}"]`);
      expect(metric?.querySelector('[data-xgc-role="robot-list-metric-rate"]')?.textContent).toBe('-- Hz');
      expect(metric?.querySelector('.robot-list-metric-digits')?.textContent).toBe('--');
    }
  });

  it('keeps VRPN acc empty when its real channel is missing even if IMU has acceleration', () => {
    const projection = liveScoutProjection();
    const channels = { ...projection.channels };
    delete channels['vrpn.acceleration'];
    const { container } = render(<RobotListProjection
      robot={scoutRobot()}
      projection={{
        ...projection,
        channels,
        imu:{ linearAcceleration:{ x:9.81,y:9.81,z:9.81 } },
      }}
    />);
    const acceleration = container.querySelector('[data-xgc-role="robot-ground-vrpn-acceleration"]');
    expect([...acceleration?.querySelectorAll('.robot-list-metric-digits') ?? []].map((node) => node.textContent))
      .toEqual(['--','--','--']);
    expect(acceleration?.textContent).not.toContain('9.81');
  });

  it('uses adapter stream-health IMU receipt age even when the sampled state.imu channel is absent', () => {
    const projection = liveScoutProjection();
    const channels = { ...projection.channels };
    delete channels['state.imu'];
    const { container } = render(<RobotListProjection
      robot={scoutRobot()}
      projection={{
        ...projection,
        channels,
        streamHealth:{ channels:[{
          channelId:'state.imu',sourceAgeMs:620,stale:false,
        }] },
      }}
    />);
    const communication = container.querySelector('[data-xgc-role="robot-network-indicator"]');
    expect(communication).toHaveAttribute(
      'data-xgc-source',
      'diagnostic.stream-health.channels[state.imu].sourceAgeMs',
    );
    expect(communication).toHaveAttribute(
      'aria-label',
      'Communication freshness from last IMU receipt age 620 ms',
    );
    expect(communication).toHaveAttribute('data-xgc-tone', 'warning');
    expect(communication?.getAttribute('aria-label')).not.toMatch(/RTT|round-trip/i);
  });

  it('keeps battery percentage unavailable when the Adapter does not provide it', () => {
    const projection = liveScoutProjection();
    const unavailablePower = liveChannel('state.power', {
      percentageState:'PERCENTAGE_STATE_UNAVAILABLE',percentage:95,voltageV:28.8,
    });
    const { container } = render(<RobotListProjection
      robot={scoutRobot()}
      projection={{
        ...projection,
        channels:{ ...projection.channels,'state.power':unavailablePower },
        power:unavailablePower.value,
      }}
    />);
    expect(container.querySelector('[data-xgc-role="robot-power-indicator"]'))
      .toHaveAttribute('aria-label', 'Battery 28.8 V; percentage unavailable');
    expect(container.querySelector('[data-xgc-role="robot-power-indicator"]'))
      .toHaveAttribute('data-xgc-tone', 'info');
    expect(container.querySelector('[data-xgc-role="robot-ground-battery-voltage"] .robot-list-metric-digits')?.textContent)
      .toBe('28.8');
  });

  it('does not infer semantic control mode from native raw values', () => {
    const projection = liveScoutProjection();
    const chassisChannel = liveChannel('state.chassis', {
      controlMode:'CONTROL_MODE_UNSPECIFIED',nativeControlMode:1,
    });
    const { container } = render(<RobotListProjection
      robot={scoutRobot()}
      projection={{
        ...projection,
        channels:{ ...projection.channels,'state.chassis':chassisChannel },
        chassis:chassisChannel.value,
      }}
    />);
    expect(container.querySelector('[data-xgc-role="robot-control-indicator"]')).toBeNull();
    const chassisMode = container.querySelector('[data-xgc-role="robot-list-header-chassis-mode"]');
    expect(chassisMode?.textContent).toBe('MODE 1');
    expect(chassisMode).toHaveAttribute('data-xgc-tone', 'normal');
    expect(chassisMode).toHaveClass('robot-list-header-word');
  });

  it('keeps Scout 03 identity left and the same direct trailing glyph track as other cards', () => {
    const { container } = render(<>
      <div data-xgc-id="first"><RobotListProjection robot={scoutRobot()} projection={liveScoutProjection()} /></div>
      <div data-xgc-id="third"><RobotListProjection
        robot={scoutRobot({ id:'scout-03',name:'Scout 03' })}
        projection={liveScoutProjection()}
      /></div>
    </>);
    for (const id of ['first','third']) {
      const header = container.querySelector(`[data-xgc-id="${id}"] header`);
      expect(header?.firstElementChild).toHaveClass('robot-card-identity');
      expect(header?.lastElementChild).toHaveAttribute('data-xgc-role', 'robot-list-header-trailing');
      expect(header?.querySelectorAll('.robot-instrument-status-glyph')).toHaveLength(3);
      expect(header?.querySelector('[data-xgc-role="robot-list-header-chassis-mode"]')?.textContent)
        .toBe('CMD');
    }
    expect(container.querySelector('[data-xgc-id="third"] .robot-card-identity strong')?.textContent)
      .toBe('Scout 03');
  });

  it('places the simulation mark beside the Scout name only in a hybrid Session', () => {
    const { container } = render(
      <RobotListProjection
        robot={scoutRobot({ id: 'scout-04', name: 'Scout 04', hybridSource: 'simulation' })}
        projection={liveScoutProjection()}
        showSimulationSourceMark
      />,
    );
    expectSharedListInstrument(container);
    const identity = container.querySelector('.robot-card-identity');
    const badge = identity?.querySelector('.robot-instrument-source-badge[data-xgc-id="scout-04"]');
    expect(badge?.textContent).toBe('(sim)');
    expect(identity?.querySelector('strong')?.textContent).toBe('Scout 04');
    expectCoordinateValues(container, { x: '1.80', y: '0.00', z: '0.18' });
  });

  it('reuses the same list metric structure for Mecanum and FS150 cards', () => {
    const mecanum = render(
      <RobotListProjection robot={mecanumRobot()} projection={liveScoutProjection()} />,
    );
    expectSharedListInstrument(mecanum.container);
    expectCoordinateValues(mecanum.container, { x: '1.80', y: '0.00', z: '0.18' });
    expectMetricRate(mecanum.container, '.robot-metric-local-position', '50.0 Hz');
    mecanum.unmount();

    const flight = render(
      <RobotListProjection robot={flightRobot()} projection={liveFlightProjection()} />,
    );
    expectSharedListInstrument(flight.container, { skipMask: true });
    expect(flight.container.querySelector('.robot-metric-vrpn-position [data-xgc-axis="x"] .robot-list-metric-digits')?.textContent)
      .toBe('2.10');
    expect(flight.container.querySelector('.robot-metric-local-position [data-xgc-axis="y"] .robot-list-metric-digits')?.textContent)
      .toBe('0.40');
    expectMetricRate(flight.container, '.robot-metric-local-position', '30.0 Hz');
    expect(flight.container.querySelector('[data-xgc-role="robot-flight-height"] .robot-list-metric-digits')?.textContent)
      .toBe('1.20');
    expect(flight.container.querySelector('[data-xgc-id="fs150-01:vrpn-spd"] .robot-list-metric-digits')?.textContent)
      .toBe('0.50');
    expect(flight.container.querySelector('[data-xgc-id="fs150-01:height"] [data-xgc-role="robot-list-metric-title"]')?.textContent)
      .toBe('VRPN height');
    expect(flight.container.querySelector('[data-xgc-id="fs150-01:vrpn-spd"] [data-xgc-role="robot-list-metric-title"]')?.textContent)
      .toBe('VRPN spd');
    expect(flight.container.querySelector('[data-xgc-role="robot-list-metric-readout"][data-xgc-id="fs150-01:height"]')?.textContent)
      .toMatch(/\sm\b/);
    expect(flight.container.querySelector('[data-xgc-role="robot-list-metric-readout"][data-xgc-id="fs150-01:vrpn-spd"]')?.textContent)
      .toMatch(/m\/s/);
    const flightTitles = [...flight.container.querySelectorAll('dl > div > dt .robot-list-metric-title')]
      .map((node) => node.textContent);
    expect(flightTitles).toEqual([
      'VRPN pos (m)','Local pos (m)','VRPN spd','VRPN height',
      'SP pos (m)','SP vel (m/s)','SP acc (m/s²)',
    ]);
    expect(flight.container.querySelector('[data-xgc-role="robot-list-setpoint-mask"]'))
      .toHaveAttribute('data-xgc-id', 'fs150-01:sp-mask');
    const maskFields = [...flight.container.querySelectorAll('[data-xgc-role="robot-list-setpoint-mask-field"]')];
    const maskLabels = [...flight.container.querySelectorAll('[data-xgc-role="robot-list-setpoint-mask-label"]')];
    expect(maskLabels.map((node) => node.getAttribute('data-xgc-id'))).toEqual([
      'fs150-01:sp-mask:p',
      'fs150-01:sp-mask:v',
      'fs150-01:sp-mask:a',
      'fs150-01:sp-mask:y',
      'fs150-01:sp-mask:yr',
    ]);
    expect(maskFields.map((node) => node.getAttribute('data-xgc-id'))).toEqual([
      'fs150-01:sp-mask:p',
      'fs150-01:sp-mask:v',
      'fs150-01:sp-mask:a',
      'fs150-01:sp-mask:y',
      'fs150-01:sp-mask:yr',
    ]);
    expect(maskFields).toHaveLength(5);
    expect(maskLabels).toHaveLength(5);
    const maskSeps = [...flight.container.querySelectorAll('.robot-setpoint-mask-sep')];
    expect(maskSeps).toHaveLength(4);
    expect(maskSeps.every((node) => node.textContent === '·' && node.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(maskSeps.every((node) => node.closest('dd.robot-setpoint-mask-states-row'))).toBeTruthy();
    expect(flight.container.querySelector('dd.robot-setpoint-mask-states-row')?.textContent)
      .toBe('–––·–––·–––·–·–');
    expect(flight.container.querySelectorAll('[data-xgc-role="robot-list-setpoint-mask-field"][data-xgc-id="fs150-01:sp-mask:yr"]'))
      .toHaveLength(1);
    expect(flight.container.querySelector('[data-xgc-role="robot-list-metric-readout"][data-xgc-id="fs150-01:sp-acc"]')?.textContent)
      .toBe('-- -- --');
    expect(flight.container.querySelector('[data-xgc-role="run-robot-source-badge"]')).toBeNull();
    flight.unmount();
  });

  it('does not fill VRPN height from MAVROS local z', () => {
    const base = liveFlightProjection();
    const mocap = liveChannel('state.mocap.pose', { position: { x: 2.1, y: 0.3 } });
    const { container } = render(
      <RobotListProjection
        robot={flightRobot()}
        projection={{
          ...base,
          mocap,
          channels: { ...base.channels, 'state.mocap.pose': mocap },
        }}
      />,
    );
    expect(container.querySelector('[data-xgc-role="robot-flight-height"] .robot-list-metric-digits')?.textContent)
      .toBe('--');
  });

  it('places the simulation mark beside the Mecanum name only in a hybrid Session', () => {
    const mecanumSim = render(
      <RobotListProjection
        robot={mecanumRobot({ hybridSource: 'simulation' })}
        projection={liveScoutProjection()}
        showSimulationSourceMark
      />,
    );
    expectSharedListInstrument(mecanumSim.container);
    expect(mecanumSim.container.querySelector(
      '.robot-card-identity .robot-instrument-source-badge[data-xgc-id="mecanum-01"]',
    )?.textContent).toBe('(sim)');
    mecanumSim.unmount();

    const flightSim = render(
      <RobotListProjection
        robot={flightRobot({ hybridSource: 'simulation' })}
        projection={liveFlightProjection()}
        showSimulationSourceMark
      />,
    );
    expectSharedListInstrument(flightSim.container, { skipMask: true });
    expect(flightSim.container.querySelector(
      '.robot-card-identity .robot-instrument-source-badge[data-xgc-id="fs150-01"]',
    )?.textContent).toBe('(sim)');
  });

  it('owns list separators on the metric dl for Scout, Mecanum, and PX4 cards', () => {
    for (const view of [
      render(listCard(<RobotListProjection robot={scoutRobot()} projection={liveScoutProjection()} />)),
      render(listCard(<RobotListProjection robot={mecanumRobot()} projection={liveScoutProjection()} />)),
      render(listCard(<RobotListProjection robot={flightRobot()} projection={liveFlightProjection()} />)),
    ]) {
      expectListSeparatorGrid(view.container);
      view.unmount();
    }
  });

  it('keeps identity and primary status in the list card topbar above the 4x2 body', () => {
    for (const view of [
      render(listCard(<RobotListProjection robot={scoutRobot()} projection={liveScoutProjection()} />)),
      render(listCard(<RobotListProjection robot={mecanumRobot()} projection={liveScoutProjection()} />)),
      render(listCard(<RobotListProjection robot={flightRobot()} projection={liveFlightProjection()} />)),
    ]) {
      expectListTopbar(view.container);
      view.unmount();
    }
  });

  it('renders Scout and Mecanum power directly from the current Adapter projection', () => {
    for (const robot of [scoutRobot(),mecanumRobot()]) {
      const { container,rerender,unmount }=render(
        listCard(<RobotListProjection robot={robot} projection={liveScoutProjection()} />),
      );
      const tile=() => container.querySelector('[data-xgc-role="robot-ground-battery-voltage"]');
      expect(tile()?.querySelector('.robot-list-metric-digits')?.textContent).toBe('28.8');
      expect(tile()?.querySelector('.robot-list-metric-rate')?.textContent).toBe('1.5 Hz');

      rerender(listCard(<RobotListProjection
        robot={robot}
        projection={liveScoutProjection({
          power:{},
          channels:{ 'state.power':liveChannel('state.power',{}) },
          streamHealth:{ channels:[{ channelId:'state.power',sourceRateHz:0,stale:false }] },
        })}
      />));
      expect(tile()?.querySelector('.robot-list-metric-digits')?.textContent).toBe('--');
      expect(tile()?.querySelector('.robot-list-metric-rate')?.textContent).toBe('-- Hz');
      unmount();
    }
  });

  it('omits list trailing when there is no progress and status is online/offline/limited', () => {
    for (const view of [
      render(listCard(<RobotListProjection robot={scoutRobot()} projection={liveScoutProjection()} />)),
      render(listCard(<RobotListProjection robot={mecanumRobot()} projection={liveScoutProjection()} />)),
      render(listCard(<RobotListProjection robot={flightRobot()} projection={liveFlightProjection()} />)),
    ]) {
      expect(view.container.querySelector('[data-xgc-role="robot-list-trailing"]')).toBeNull();
      expectListHeaderStatus(view.container);
      view.unmount();
    }
    const limited = render(listCard(
      <RobotListProjection
        robot={flightRobot()}
        projection={{
          ...liveFlightProjection(),
          status: { online: true,operationalReady: false,status: 'limited' },
        }}
      />,
    ));
    expect(limited.container.querySelector('[data-xgc-role="robot-list-trailing"]')).toBeNull();
    expect(limited.container.querySelector('.robot-status-text')).toBeNull();
    expectListHeaderStatus(limited.container);
    limited.unmount();
  });

  it.each([
    ['simulation','simulation',false],
    ['simulation','physical',false],
    ['physical','simulation',false],
    ['physical','physical',false],
    ['experiment','simulation',false],
    ['hybrid','simulation',true],
    ['hybrid','physical',false],
  ] as const)('shares Session runMode %s × authored %s source marks across Scout, Mecanum, and PX4', (
    runMode,hybridSource,visible,
  ) => {
    const show = experimentRobotSimulationSourceMark(runMode, hybridSource);
    expect(show).toBe(visible);
    for (const view of [
      render(<RobotListProjection
        robot={scoutRobot({ hybridSource })}
        projection={liveScoutProjection()}
        showSimulationSourceMark={show}
      />),
      render(<RobotListProjection
        robot={mecanumRobot({ hybridSource })}
        projection={liveScoutProjection()}
        showSimulationSourceMark={show}
      />),
      render(<RobotListProjection
        robot={flightRobot({ hybridSource })}
        projection={liveFlightProjection()}
        showSimulationSourceMark={show}
      />),
    ]) {
      const badge = view.container.querySelector('.robot-instrument-source-badge');
      expect(Boolean(badge)).toBe(visible);
      if (visible) {
        expect(view.container.querySelector('.robot-card-identity .robot-instrument-source-badge')?.textContent)
          .toBe('(sim)');
      }
      view.unmount();
    }
  });
});

function listCard(children: ReactNode, robotId?: string) {
  return (
    <div className="robot-instrument-grid" data-xgc-layout="list">
      <article
        className="robot-instrument-card"
        data-xgc-role="run-robot-card"
        data-xgc-id={robotId}
        data-xgc-presentation="list"
      >
        {children}
      </article>
    </div>
  );
}

function expectListSeparatorGrid(container: HTMLElement) {
  const card = container.querySelector('[data-xgc-role="run-robot-card"][data-xgc-presentation="list"]');
  const header = card?.querySelector(':scope > header');
  const metrics = card?.querySelector(':scope > dl');
  expect(card).not.toBeNull();
  expect(header).not.toBeNull();
  expect(metrics).not.toBeNull();
  expect(header?.nextElementSibling).toBe(metrics);
  const tiles = [...(metrics?.querySelectorAll(':scope > div') ?? [])];
  expect(tiles.length).toBeGreaterThanOrEqual(8);
  expect(header?.contains(metrics ?? null)).toBe(false);
}

function expectListTopbar(container: HTMLElement) {
  const card = container.querySelector('[data-xgc-role="run-robot-card"][data-xgc-presentation="list"]');
  const header = card?.querySelector(':scope > header');
  const metrics = card?.querySelector(':scope > dl');
  expect(card?.firstElementChild).toBe(header);
  expect(header?.nextElementSibling).toBe(metrics);
  expect(header?.querySelector('.robot-card-identity')).not.toBeNull();
  expect(header?.querySelector('[data-xgc-role="robot-list-header-status"]')).not.toBeNull();
  expect(metrics?.querySelector('.robot-card-identity')).toBeNull();
  expect(metrics?.querySelector('[data-xgc-role="robot-list-header-status"]')).toBeNull();
  expect(metrics?.querySelectorAll(':scope > div').length).toBeGreaterThanOrEqual(8);
  expectListHeaderStatus(container);
}

function expectListHeaderStatus(container: HTMLElement) {
  const header = container.querySelector('header');
  const identity = header?.querySelector('.robot-card-identity');
  const trailing = header?.querySelector('[data-xgc-role="robot-list-header-trailing"]');
  const cluster = header?.querySelector('[data-xgc-role="robot-list-header-status"]');
  expect(identity).toHaveAttribute('data-xgc-gap', 'sm');
  expect(cluster).toHaveClass('robot-list-header-status');
  expect(trailing?.parentElement).toBe(header);
  expect(cluster?.parentElement).toBe(trailing);
  const roles = [...(cluster?.querySelectorAll(':scope > .robot-instrument-status-glyph') ?? [])]
    .map((node) => node.getAttribute('data-xgc-role'));
  const expected = [
    'robot-network-indicator',
    'robot-position-indicator',
    'robot-power-indicator',
  ];
  expect(roles).toEqual(expected);
  expect(cluster?.querySelectorAll('svg')).toHaveLength(expected.length);
  expect(cluster?.querySelector('[data-xgc-role="robot-control-indicator"]')).toBeNull();
}

function expectSharedListInstrument(container: HTMLElement, options: { skipMask?: boolean } = {}) {
  expect(container.querySelectorAll('dl svg')).toHaveLength(0);
  expect(container.querySelectorAll('.robot-response-trend')).toHaveLength(0);
  const tiles = [...container.querySelectorAll('dl > div')];
  expect(tiles.length).toBeGreaterThan(0);
  for (const tile of tiles) {
    if (options.skipMask && tile.classList.contains('robot-metric-setpoint-mask')) continue;
    expect(tile.querySelector('dt')).not.toBeNull();
    expect(tile.querySelector('dd.robot-list-metric-body')).not.toBeNull();
  }
}

function expectCoordinateValues(
  container: HTMLElement,
  axes: { x: string; y: string; z: string },
) {
  const position = container.querySelector('.robot-metric-local-position');
  const order = ['x', 'y', 'z'] as const;
  const cells = [...(position?.querySelectorAll('[data-xgc-axis]') ?? [])];
  expect(cells.map((cell) => cell.getAttribute('data-xgc-axis'))).toEqual([...order]);
  for (const axis of order) {
    const cell = position?.querySelector(`[data-xgc-axis="${axis}"]`);
    expect(cell?.querySelector('.robot-metric-vector-axis-label')).toBeNull();
    expect(cell?.getAttribute('aria-label')).toMatch(new RegExp(`^${axis} `));
    expect(cell?.querySelector('.robot-list-metric-digits')?.textContent).toBe(axes[axis]);
  }
}

function expectMetricRate(container: HTMLElement, tileSelector: string, rate: string) {
  const tile = container.querySelector(tileSelector);
  expect(tile?.querySelector('dt [data-xgc-role="robot-list-metric-rate"]')?.textContent).toBe(rate);
  expect(tile?.querySelector('dd .robot-list-metric-rate')).toBeNull();
}

function mecanumRobot(overrides: Partial<RobotPanelItem> = {}): RobotPanelItem {
  return {
    ...scoutRobot(),
    id: 'mecanum-01',
    name: 'Mecanum 01',
    kind: 'mecanum_ugv',
    profileId: 'mecanum-ugv.ros1.v3',
    scout: undefined,
    mecanum: { mocapRigidBodyName: 'ugv1' },
    ...overrides,
  };
}

function flightRobot(overrides: Partial<RobotPanelItem> = {}): RobotPanelItem {
  return {
    ...scoutRobot(),
    id: 'fs150-01',
    name: 'FS150 01',
    kind: 'px4_multirotor',
    profileId: 'px4-multirotor.ros1.v1',
    scout: undefined,
    px4: { modelId: 'fs150', mavSystemId: 1, managementIp: '172.30.251.10', mocapRigidBodyName: 'fs150-1' },
    ...overrides,
  };
}

function scoutRobot(overrides: Partial<RobotPanelItem> = {}): RobotPanelItem {
  return {
    id: 'scout-01',
    robotAssetId: 'asset-scout-01',
    robotAssetCommitId: 'commit-1',
    robotAssetDigest: 'digest-1',
    name: 'Scout 01',
    kind: 'scout_mini',
    hybridSource: 'physical',
    profileId: 'scout-mini.ros1.v6',
    namespace: '/ugv1',
    scout: { managementAddress: '172.30.251.20' },
    operationContracts: [],
    connectionEpoch: 1,
    connectionState: 'live',
    connectionRevision: 1,
    online: true,
    operationalReady: true,
    status: 'online',
    channels: {},
    ...overrides,
  };
}

function liveChannel(channelId: string, value: Record<string,unknown> = {}) {
  const now = Date.now();
  return {
    channelId,
    sequence: 8,
    messageId: 8,
    observedAt: new Date(now - 20).toISOString(),
    sourceAgeMs: 20,
    staleAt: new Date(now + 980).toISOString(),
    stale: false,
    value,
  };
}

function liveScoutProjection(
  overrides: Partial<RobotProjectionChannels> = {},
): RobotProjectionChannels {
  const poseChannel = liveChannel('vrpn.position', {
    position: { x: 1.8,y: 0,z: 0.18 },
    orientation: { x: 0,y: 0,z: 0,w: 1 },
  });
  const velocityChannel = liveChannel('vrpn.velocity', {
    linear: { x: 0.21,y: -0.04,z: 0.01 },angular: { z: 0.03 },
  });
  const accelerationChannel = liveChannel('vrpn.acceleration', {
    linear: { x: 0.12,y: -0.05,z: 0.01 },
  });
  const commandVelocityChannel = liveChannel('command.velocity', {
    linear: { x: 0.32 },angular: { z: -0.18 },
  });
  const imuChannel = liveChannel('state.imu', {
    linearAcceleration: { x: 9.81,y: 0,z: 0 },
  });
  const chassisChannel = liveChannel('state.chassis', {
    controlMode: 'CONTROL_MODE_COMMAND_CAN',nativeControlMode: 1,
  });
  const healthChannel = liveChannel('state.health', {
    online: true,summary: 'healthy',faults: [],
    positioning: {
      state:'POSITIONING_STATE_STABLE',
      reason:'POSITIONING_REASON_STATIONARY_WINDOW_STABLE',
      observedAgeMs:20,windowSpreadM:0.004,sampleCount:12,
    },
  });
  return {
    status: { online: true,operationalReady: true,status: 'online' },
    flight: false,
    flightPresentation: 'fs150',
    telemetryChannelIds: {
      pose: 'vrpn.position',
      velocity: 'vrpn.velocity',
      speed: 'vrpn.speed',
      link: undefined,
      mocapPose: undefined,
      localizationError: undefined,
      setpoint: undefined,
    },
    mocapRotor: false,
    kindProjection: undefined,
    channels: {
      'vrpn.position': poseChannel,
      'vrpn.velocity': velocityChannel,
      'vrpn.speed': liveChannel('vrpn.speed', { metersPerSecond: 0 }),
      'vrpn.acceleration': accelerationChannel,
      'command.velocity': commandVelocityChannel,
      'state.imu': imuChannel,
      'state.power': liveChannel('state.power', {
        percentageState:'PERCENTAGE_STATE_AVAILABLE',percentage:95,voltageV:28.8,
      }),
      'state.health': healthChannel,
      'state.chassis': chassisChannel,
    },
    flightState: {},
    poseChannel,
    pose: poseChannel.value,
    velocity: velocityChannel.value,
    speed: { metersPerSecond: 0 },
    localizationError: {},
    commandVelocityChannel,
    commandVelocity: commandVelocityChannel.value,
    imu: imuChannel.value,
    power: { percentageState:'PERCENTAGE_STATE_AVAILABLE',percentage:95,voltageV:28.8 },
    healthChannel,
    health: healthChannel.value,
    chassis: chassisChannel.value,
    locomotion: {},
    joints: {},
    mocap: undefined,
    setpoint: undefined,
    fcuLink: {},
    streamHealth: { channels: [
      { channelId: 'vrpn.position',sourceRateHz: 50,sourceAgeMs:8,stale:false },
      { channelId: 'vrpn.speed',sourceRateHz: 50 },
      { channelId: 'vrpn.velocity',sourceRateHz: 50 },
      { channelId: 'vrpn.acceleration',sourceRateHz: 50 },
      { channelId: 'state.imu',sourceRateHz: 80,sourceAgeMs:14,stale:false },
      { channelId: 'state.power',sourceRateHz: 1.5 },
      { channelId: 'command.velocity',sourceRateHz: 20 },
    ] },
    ...overrides,
  };
}

function liveMecanumProjection(): RobotProjectionChannels {
  const projection = liveScoutProjection();
  const channels = { ...projection.channels };
  delete channels['state.chassis'];
  return {
    ...projection,
    channels,
    chassis: {},
  };
}

function liveFlightProjection(): RobotProjectionChannels {
  const poseChannel = liveChannel('state.pose', {
    position: { x: 0.5,y: 0.4,z: 1.1 },
    orientation: { x: 0,y: 0,z: 0,w: 1 },
  });
  const mocap = liveChannel('state.mocap.pose', {
    position: { x: 2.1,y: 0.3,z: 1.2 },
    orientation: { x: 0,y: 0,z: 0,w: 1 },
  });
  return liveScoutProjection({
    flight: true,
    flightPresentation: 'fs150',
    telemetryChannelIds: {
      pose: 'state.pose',
      velocity: 'state.velocity',
      speed: 'state.mocap.speed',
      link: 'diagnostic.fcu-link',
      mocapPose: 'state.mocap.pose',
      localizationError: 'state.localization.error',
      setpoint: 'setpoint.local',
    },
    channels: {
      'state.pose': poseChannel,
      'state.mocap.pose': mocap,
      'state.mocap.velocity': liveChannel('state.mocap.velocity', { linear: { x: 0.3, y: 0.4, z: 0 } }),
      'state.mocap.speed': liveChannel('state.mocap.speed', { metersPerSecond: 0.4 }),
      'state.power': liveChannel('state.power', {
        percentageState:'PERCENTAGE_STATE_AVAILABLE',percentage:80,voltageV:22.1,
      }),
      'diagnostic.fcu-link': liveChannel('diagnostic.fcu-link', { roundTripTimeMs: 18 }),
    },
    poseChannel,
    pose: poseChannel.value,
    mocap,
    speed: { metersPerSecond: 0.4 },
    localizationError: { meters: 0.458 },
    power: { percentageState:'PERCENTAGE_STATE_AVAILABLE',percentage:80,voltageV:22.1 },
    health: {
      positioning: {
        state:'POSITIONING_STATE_ACTIVE',
        reason:'POSITIONING_REASON_MOTION_DETECTED',
        observedAgeMs:8,windowSpreadM:0.01,sampleCount:5,
      },
    },
    flightState: { connected: true, mode: 'OFFBOARD', armed: true, landedState: 1 },
    fcuLink: { roundTripTimeMs: 18 },
    streamHealth: { channels: [
      { channelId: 'state.pose',sourceRateHz: 30 },
      { channelId: 'state.mocap.pose',sourceRateHz: 50 },
      { channelId: 'state.mocap.velocity',sourceRateHz: 50 },
      { channelId: 'state.mocap.speed',sourceRateHz: 50 },
      { channelId: 'setpoint.local',sourceRateHz: 10 },
    ] },
  });
}
