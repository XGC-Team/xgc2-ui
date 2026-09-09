// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe,expect,it } from 'vitest';
import { FlightRobotInstrument } from './FlightRobotInstrument';
import type { FlightRobotInstrumentTelemetry } from './flightInstrumentModel';
import {
  adapterPositioningStatus,
  listHeaderStatusItems,
  px4CommunicationStatus,
} from './RobotListHeaderStatusModel';

describe('FlightRobotInstrument', () => {
  it('shows the live mode and armed values without MODE or ARM prefixes', () => {
    const { container } = renderInstrument(telemetry({
      flight: { connected: true,armed: false,mode: 'MANUAL' },
    }));

    const rows = container.querySelectorAll('.robot-flight-bottom-status > span');
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toBe('MANUAL');
    expect(rows[1]?.textContent).toBe('--');
    expect(rows[2]?.textContent).toBe('DISARMED');
    expect(rows[0]).toHaveAttribute('title','MANUAL');
    expect(rows[0]).toHaveAttribute('data-xgc-tone','normal');
    expect(rows[2]).toHaveAttribute('title','DISARMED');
    expect(rows[2]).toHaveAttribute('data-xgc-tone','normal');
  });

  it('shows ARMED and a PX4 mode as the raw values', () => {
    const { container } = renderInstrument(telemetry({
      flight: { connected: true,armed: true,mode: 'OFFBOARD' },
    }));

    const rows = container.querySelectorAll('.robot-flight-bottom-status > span');
    expect(rows[0]?.textContent).toBe('OFFBOARD');
    expect(rows[1]?.textContent).toBe('--');
    expect(rows[2]?.textContent).toBe('ARMED');
    expect(rows[0]).toHaveAttribute('data-xgc-tone','success');
    expect(rows[2]).toHaveAttribute('data-xgc-tone','success');
  });

  it('keeps placeholders when flight state is unavailable', () => {
    const { container } = renderInstrument(telemetry({
      online: false,
      flight: {},
    }));

    const rows = container.querySelectorAll('.robot-flight-bottom-status > span');
    expect(rows[0]?.textContent).toBe('--');
    expect(rows[1]?.textContent).toBe('--');
    expect(rows[2]?.textContent).toBe('--');
  });

  it('keeps compact speed and altitude readouts when values are missing', () => {
    const { container } = renderInstrument(telemetry({
      online: false,
      pose: {},
      localVelocity: {},
      mocapSpeed: {},
    }));
    const readouts = [...container.querySelectorAll('[data-xgc-role="robot-flight-metric-ruler"]')];
    expect(readouts).toHaveLength(2);
    expect(readouts[0]?.getAttribute('data-xgc-id')).toBe('fs150-01:left');
    expect(readouts[0]?.getAttribute('data-xgc-side')).toBe('left');
    expect(readouts[0]?.textContent).toBe('--m/s');
    expect(readouts[1]?.getAttribute('data-xgc-id')).toBe('fs150-01:right');
    expect(readouts[1]?.getAttribute('data-xgc-side')).toBe('right');
    expect(readouts[1]?.textContent).toBe('--m');
    expect(container.querySelector('[data-xgc-role="robot-flight-metric-tape"]')).toBeNull();
    expect(container.querySelector('.robot-flight-climb-direction')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-flight-climb"]')?.textContent).toBe('-- m/s');
    expect(container.querySelector('[data-xgc-role="robot-flight-climb"]')?.textContent).not.toMatch(/--m\/s/);
  });

  it('shows live VRPN twist 2-norm and height without clipping them to a fixed range', () => {
    const { container } = renderInstrument(telemetry({
      mocapPose: { position: { z: 27.5 } },
      mocapVelocity: { linear: { x: 12,y: 5,z: 0 } },
      pose: { position: { z: 1 } },
      localVelocity: { linear: { x: 99,y: 99,z: 0.4 } },
    }));
    const readouts = [...container.querySelectorAll('[data-xgc-role="robot-flight-metric-ruler"]')];
    expect(readouts[0]?.textContent).toBe('13.0m/s');
    expect(readouts[0]).toHaveAttribute('data-xgc-source', 'state.mocap.velocity.linear');
    expect(readouts[0]).toHaveAttribute('title', 'VRPN twist linear speed (2-norm)');
    expect(readouts[1]?.textContent).toBe('27.5m');
    expect(readouts[1]).toHaveAttribute('data-xgc-source', 'state.mocap.pose.position.z');
    expect(readouts[1]).toHaveAttribute('title', 'VRPN height');
    expect(container.querySelector('[data-xgc-role="robot-flight-climb"]')?.textContent).toMatch(/0\.4 m\/s/);
    expect(container.querySelector('[data-xgc-role="robot-flight-climb"]')?.textContent).not.toMatch(/0\.4m\/s/);
  });

  it('keeps speed, altitude, climb and non-OFFBOARD mode as white neutral readouts', () => {
    const { container } = renderInstrument(telemetry({
      flight: { connected: true,armed: true,mode: 'MANUAL' },
      mocapPose: { position: { z: 1.2 } },
      mocapVelocity: { linear: { x: 1,y: 0,z: 0 } },
      localVelocity: { linear: { z: 0.4 } },
    }));
    const rulers = [...container.querySelectorAll('[data-xgc-role="robot-flight-metric-ruler"]')];
    expect(rulers.map((node) => node.getAttribute('data-xgc-tone'))).toEqual(['normal','normal']);
    const climb = container.querySelector('[data-xgc-role="robot-flight-climb"]');
    expect(climb).toHaveAttribute('data-xgc-tone','normal');
    expect(climb?.querySelector('.robot-flight-climb-direction')).toHaveAttribute('data-xgc-direction','up');
    expect(container.querySelector('[data-xgc-role="robot-flight-mode"]')).toHaveAttribute('data-xgc-tone','normal');
    expect(container.querySelector('[data-xgc-role="robot-flight-stage"]')).toHaveAttribute('data-xgc-tone','normal');
    expect(container.querySelector('[data-xgc-role="robot-flight-armed"]')).toHaveAttribute('data-xgc-tone','success');
    expect(container.querySelector('[data-xgc-role="robot-flight-heading"]')).toHaveAttribute('data-xgc-tone','normal');
  });

  it('paints OFFBOARD mode green on the UAV pedestal', () => {
    const offboard = renderInstrument(telemetry({
      flight: { connected: true,armed: true,mode: 'OFFBOARD' },
    }));
    expect(offboard.container.querySelector('[data-xgc-role="robot-flight-mode"]'))
      .toHaveAttribute('data-xgc-tone','success');
    expect(offboard.container.querySelector('[data-xgc-role="robot-flight-armed"]'))
      .toHaveAttribute('data-xgc-tone','success');
    offboard.unmount();
    const folded = renderInstrument(telemetry({
      flight: { connected: true,armed: false,mode: ' offboard ' },
    }));
    expect(folded.container.querySelector('[data-xgc-role="robot-flight-mode"]'))
      .toHaveAttribute('data-xgc-tone','success');
    expect(folded.container.querySelector('[data-xgc-role="robot-flight-armed"]'))
      .toHaveAttribute('data-xgc-tone','normal');
    folded.unmount();
    const missing = renderInstrument(telemetry({
      online: false,
      flight: {},
    }));
    expect(missing.container.querySelector('[data-xgc-role="robot-flight-mode"]'))
      .toHaveAttribute('data-xgc-tone','normal');
  });

  it('paints ARMED green and keeps DISARMED white on the UAV pedestal', () => {
    const armed = renderInstrument(telemetry({
      flight: { connected: true,armed: true,mode: 'MANUAL' },
    }));
    expect(armed.container.querySelector('[data-xgc-role="robot-flight-armed"]'))
      .toHaveAttribute('data-xgc-tone','success');
    expect(armed.container.querySelector('[data-xgc-role="robot-flight-stage"]'))
      .toHaveAttribute('data-xgc-tone','normal');
    armed.unmount();
    const locked = renderInstrument(telemetry({
      flight: { connected: true,armed: false,mode: 'MANUAL' },
    }));
    expect(locked.container.querySelector('[data-xgc-role="robot-flight-armed"]'))
      .toHaveAttribute('data-xgc-tone','normal');
    locked.unmount();
    const missing = renderInstrument(telemetry({
      online: false,
      flight: {},
    }));
    expect(missing.container.querySelector('[data-xgc-role="robot-flight-armed"]'))
      .toHaveAttribute('data-xgc-tone','normal');
  });

  it('omits the climb arrow inside the 0.1 m/s deadband', () => {
    const { container } = renderInstrument(telemetry({
      localVelocity: { linear: { z: 0.04 } },
    }));
    expect(container.querySelector('.robot-flight-climb-direction')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-flight-climb"]')?.textContent).toMatch(/0\.0/);
  });

  it('does not paint a minus on HUD VRPN height that rounds to 0.0', () => {
    const parked = renderInstrument(telemetry({
      mocapPose: { position: { z: -0.04 } },
    }));
    expect(parked.container.querySelector('[data-xgc-role="robot-flight-metric-ruler"][data-xgc-id="fs150-01:right"]')?.textContent)
      .toBe('0.0m');
    parked.unmount();
    const negative = renderInstrument(telemetry({
      mocapPose: { position: { z: -1.24 } },
    }));
    expect(negative.container.querySelector('[data-xgc-role="robot-flight-metric-ruler"][data-xgc-id="fs150-01:right"]')?.textContent)
      .toBe('-1.2m');
  });

  it('does not substitute MAVROS local pose or velocity onto FS150 rulers', () => {
    const { container } = renderInstrument(telemetry({
      mocapState: 'missing',
      mocapPose: {},
      mocapVelocity: {},
      pose: { position: { z: 27.5 } },
      localVelocity: { linear: { x: 12,y: 5,z: 0.4 } },
    }));
    const readouts = [...container.querySelectorAll('[data-xgc-role="robot-flight-metric-ruler"]')];
    expect(readouts[0]?.textContent).toBe('--m/s');
    expect(readouts[1]?.textContent).toBe('--m');
    expect(container.querySelector('[data-xgc-role="robot-flight-climb"]')?.textContent).toMatch(/0\.4 m\/s/);
    expect(container.querySelector('[data-xgc-role="robot-flight-climb"]')?.textContent).not.toMatch(/0\.4m\/s/);
  });

  it('renders the field-proven XGC1 four-frequency contract with Hz units', () => {
    const { container } = renderInstrument(telemetry({
      streamHealth:{ channels:[
        { channelId:'state.imu',sourceRateHz:8 },
        { channelId:'setpoint.local',sourceRateHz:3 },
        { channelId:'state.mocap.pose',sourceRateHz:50 },
        { channelId:'state.pose',sourceRateHz:9 },
      ] },
    }));
    expect([...container.querySelectorAll('.robot-flight-frequency-label-compact')]
      .map((node) => node.textContent)).toEqual(['IMU','SP','VRP','LP']);
    expect([...container.querySelectorAll('.robot-flight-frequency-label-full')]
      .map((node) => node.textContent)).toEqual(['IMU','SP RAW','RAW POS','LOCAL POS']);
    expect([...container.querySelectorAll('[data-xgc-role="robot-flight-frequency"]')]
      .map((node) => node.getAttribute('data-xgc-id')))
      .toEqual(['fs150-01:state.imu','fs150-01:setpoint.local','fs150-01:state.mocap.pose','fs150-01:state.pose']);
    expect([...container.querySelectorAll('.robot-flight-frequency-value-compact')]
      .map((value) => value.textContent)).toEqual(['8 Hz','3 Hz','50 Hz','9 Hz']);
    expect([...container.querySelectorAll('.robot-flight-frequency-value-full')]
      .map((value) => value.textContent))
      .toEqual(['8.0 Hz','3.0 Hz','50.0 Hz','9.0 Hz']);
    expect([...container.querySelectorAll('.robot-flight-frequency-list strong')]
      .map((value) => value.getAttribute('data-xgc-tone')))
      .toEqual(['danger','success','danger','danger']);
    expect(container.querySelector('[data-xgc-id="fs150-01:state.imu"]'))
      .toHaveAttribute('data-xgc-alarm-hz','10');
    expect(container.querySelector('[data-xgc-id="fs150-01:state.mocap.pose"]'))
      .toHaveAttribute('data-xgc-alarm-hz','100');
    expect(container.querySelector('[data-xgc-id="fs150-01:state.pose"]'))
      .toHaveAttribute('data-xgc-alarm-hz','15');
  });

  it('keeps missing XGC1 frequency values white and unit-bearing',() => {
    const { container } = renderInstrument(telemetry());
    expect([...container.querySelectorAll('.robot-flight-frequency-value-compact')]
      .map((value) => value.textContent)).toEqual(['-- Hz','-- Hz','-- Hz','-- Hz']);
    expect([...container.querySelectorAll('.robot-flight-frequency-value-full')]
      .map((value) => value.textContent))
      .toEqual(['-- Hz','-- Hz','-- Hz','-- Hz']);
    expect([...container.querySelectorAll('.robot-flight-frequency-value-compact')]
      .map((value) => value.textContent)).not.toContain('--Hz');
    expect([...container.querySelectorAll('.robot-flight-frequency-value-compact .robot-flight-frequency-unit')]
      .map((value) => value.textContent)).toEqual([' Hz',' Hz',' Hz',' Hz']);
    const values = [...container.querySelectorAll('.robot-flight-frequency-list strong')];
    expect(values.map((value) => value.getAttribute('data-xgc-tone')))
      .toEqual(['normal','normal','normal','normal']);
  });

  it('keeps a space before Hz on IMU compact and full rows', () => {
    const { container } = render(
      <FlightRobotInstrument robotId="px4-03" name="UAV-03" telemetry={telemetry()} />,
    );
    const imu = container.querySelector(
      '[data-xgc-role="robot-flight-frequency"][data-xgc-id="px4-03:state.imu"]',
    );
    expect(imu).toHaveAttribute('title','IMU -- Hz; alarm below 10 Hz');
    expect(imu?.querySelector('.robot-flight-frequency-value-compact')?.textContent).toBe('-- Hz');
    expect(imu?.querySelector('.robot-flight-frequency-value-full')?.textContent).toBe('-- Hz');
    expect(imu?.querySelector('.robot-flight-frequency-value-compact')?.textContent).not.toBe('--Hz');
  });

  it('keeps setpoint streams white at or below 2 Hz and green above', () => {
    const idle = render(<FlightRobotInstrument robotId="px4-03" name="UAV-03" telemetry={telemetry()} />);
    const sp = idle.container.querySelector(
      '[data-xgc-role="robot-flight-frequency"][data-xgc-id="px4-03:setpoint.local"]',
    );
    expect(sp).toHaveAttribute('data-xgc-stream','command');
    expect(sp).toHaveAttribute('data-xgc-active-hz','2');
    expect(sp).toHaveAttribute('title','SP -- Hz; green above 2 Hz');
    expect(sp?.querySelector('strong')).toHaveAttribute('data-xgc-tone','normal');
    idle.unmount();
    const slow = renderInstrument(telemetry({
      streamHealth:{ channels:[{ channelId:'setpoint.local',sourceRateHz:2 }] },
    }));
    expect(slow.container.querySelector('[data-xgc-id="fs150-01:setpoint.local"] strong'))
      .toHaveAttribute('data-xgc-tone','normal');
    const live = renderInstrument(telemetry({
      streamHealth:{ channels:[{ channelId:'setpoint.local',sourceRateHz:3 }] },
    }));
    expect(live.container.querySelector('[data-xgc-id="fs150-01:setpoint.local"] strong'))
      .toHaveAttribute('data-xgc-tone','success');
  });

  it('paints VRPN pose red strictly below 100 Hz and white at the floor', () => {
    const slow = renderInstrument(telemetry({
      streamHealth:{ channels:[{ channelId:'state.mocap.pose',sourceRateHz:99.9 }] },
    }));
    const vrp = slow.container.querySelector(
      '[data-xgc-role="robot-flight-frequency"][data-xgc-id="fs150-01:state.mocap.pose"]',
    );
    expect(vrp).toHaveAttribute('data-xgc-stream','sensor');
    expect(vrp).toHaveAttribute('data-xgc-alarm-hz','100');
    expect(vrp).toHaveAttribute('title','VRP 99.9 Hz; alarm below 100 Hz');
    expect(vrp?.querySelector('strong')).toHaveAttribute('data-xgc-tone','danger');
    slow.unmount();
    const live = renderInstrument(telemetry({
      streamHealth:{ channels:[{ channelId:'state.mocap.pose',sourceRateHz:100 }] },
    }));
    expect(live.container.querySelector('[data-xgc-id="fs150-01:state.mocap.pose"] strong'))
      .toHaveAttribute('data-xgc-tone','normal');
    const rotor = render(
      <FlightRobotInstrument
        robotId="px4-04"
        name="UAV-04"
        telemetry={telemetry({
          presentation: 'mocap_rotor',
          streamHealth:{ channels:[{ channelId:'state.pose',sourceRateHz:50 }] },
        })}
      />,
    );
    const pos = rotor.container.querySelector(
      '[data-xgc-role="robot-flight-frequency"][data-xgc-id="px4-04:state.pose"]',
    );
    expect(pos).toHaveAttribute('data-xgc-alarm-hz','100');
    expect(pos?.querySelector('strong')).toHaveAttribute('data-xgc-tone','danger');
  });

  it('paints local position red strictly below 15 Hz and white at the floor', () => {
    const slow = renderInstrument(telemetry({
      streamHealth:{ channels:[{ channelId:'state.pose',sourceRateHz:14.9 }] },
    }));
    const lp = slow.container.querySelector(
      '[data-xgc-role="robot-flight-frequency"][data-xgc-id="fs150-01:state.pose"]',
    );
    expect(lp).toHaveAttribute('data-xgc-stream','sensor');
    expect(lp).toHaveAttribute('data-xgc-alarm-hz','15');
    expect(lp).toHaveAttribute('title','LP 14.9 Hz; alarm below 15 Hz');
    expect(lp?.querySelector('strong')).toHaveAttribute('data-xgc-tone','danger');
    slow.unmount();
    const live = renderInstrument(telemetry({
      streamHealth:{ channels:[{ channelId:'state.pose',sourceRateHz:15 }] },
    }));
    expect(live.container.querySelector('[data-xgc-id="fs150-01:state.pose"] strong'))
      .toHaveAttribute('data-xgc-tone','normal');
  });

  it('paints IMU red strictly below 10 Hz and white at the floor', () => {
    const slow = renderInstrument(telemetry({
      streamHealth:{ channels:[{ channelId:'state.imu',sourceRateHz:9.9 }] },
    }));
    const imu = slow.container.querySelector(
      '[data-xgc-role="robot-flight-frequency"][data-xgc-id="fs150-01:state.imu"]',
    );
    expect(imu).toHaveAttribute('data-xgc-stream','sensor');
    expect(imu).toHaveAttribute('data-xgc-alarm-hz','10');
    expect(imu).toHaveAttribute('title','IMU 9.9 Hz; alarm below 10 Hz');
    expect(imu?.querySelector('strong')).toHaveAttribute('data-xgc-tone','danger');
    slow.unmount();
    const live = renderInstrument(telemetry({
      streamHealth:{ channels:[{ channelId:'state.imu',sourceRateHz:10 }] },
    }));
    expect(live.container.querySelector('[data-xgc-id="fs150-01:state.imu"] strong'))
      .toHaveAttribute('data-xgc-tone','normal');
    const rotor = render(
      <FlightRobotInstrument
        robotId="px4-04"
        name="UAV-04"
        telemetry={telemetry({
          presentation: 'mocap_rotor',
          streamHealth:{ channels:[{ channelId:'state.imu',sourceRateHz:5 }] },
        })}
      />,
    );
    const rotorImu = rotor.container.querySelector(
      '[data-xgc-role="robot-flight-frequency"][data-xgc-id="px4-04:state.imu"]',
    );
    expect(rotorImu).toHaveAttribute('data-xgc-alarm-hz','10');
    expect(rotorImu?.querySelector('strong')).toHaveAttribute('data-xgc-tone','danger');
  });

  it('keeps mocap rotor power frequency white', () => {
    const { container } = render(
      <FlightRobotInstrument
        robotId="px4-04"
        name="UAV-04"
        telemetry={telemetry({
          presentation: 'mocap_rotor',
          streamHealth:{ channels:[{ channelId:'state.power',sourceRateHz:0.4 }] },
        })}
      />,
    );
    const pwr = container.querySelector(
      '[data-xgc-role="robot-flight-frequency"][data-xgc-id="px4-04:state.power"]',
    );
    expect(pwr).toHaveAttribute('data-xgc-stream','informational');
    expect(pwr).not.toHaveAttribute('data-xgc-alarm-hz');
    expect(pwr).toHaveAttribute('title','PWR 0.4 Hz; no frequency alarm');
    expect(pwr?.querySelector('strong')).toHaveAttribute('data-xgc-tone','normal');
  });

  it('keeps all top status icons gray before a Run starts',() => {
    const { container } = renderInstrument(telemetry({
      online:false,healthTone:'idle',flight:{},poseFresh:false,power:{},fcuLink:{},
    }));
    expect([...container.querySelectorAll('.robot-instrument-status-glyph')]
      .map((glyph) => glyph.getAttribute('data-xgc-tone')))
      .toEqual(['muted','muted','muted']);
  });

  it('uses the same header glyph order as Ground HUD and list', () => {
    const { container } = renderInstrument(telemetry({ healthTone:'idle' }));
    expect(container.querySelector('[data-xgc-role="robot-instrument-status"]'))
      .toHaveAttribute('data-xgc-id', 'fs150-01');
    expect([...container.querySelectorAll('.robot-instrument-status-icons [data-xgc-role$="-indicator"]')]
      .map((glyph) => glyph.getAttribute('data-xgc-role')))
      .toEqual([
        'robot-network-indicator',
        'robot-position-indicator',
        'robot-power-indicator',
      ]);
  });

  it('shows Adapter-detected frozen positioning as a warning', () => {
    const { container } = renderInstrument(telemetry({
      health: { positioning: { state:'POSITIONING_STATE_FROZEN' } },
    }));
    const positioning = container.querySelector('[data-xgc-role="robot-position-indicator"]');

    expect(positioning).toHaveAttribute('data-xgc-tone','warning');
    expect(positioning).toHaveAttribute('aria-label','VRPN positioning frozen');
  });

  it('keeps ACTIVE positioning and battery on the same header contract as list', () => {
    const items = listHeaderStatusItems({
      communication: px4CommunicationStatus({ roundTripTimeMs: 18, connected: true }),
      battery: {
        percentage: 80,voltageV: 22.1,
        source: 'state.power.voltageV+percentageState+percentage',
      },
      position: adapterPositioningStatus({
        positioning: { state:'POSITIONING_STATE_ACTIVE' },
      }),
    });
    const { container } = renderInstrument(telemetry({
      flight: { connected: true,armed: false,mode: 'MANUAL' },
      fcuLink: { roundTripTimeMs: 18 },
      power: { percentage: 80,voltageV: 22.1 },
      health: { positioning: { state:'POSITIONING_STATE_ACTIVE' } },
    }));
    const positioning = container.querySelector('[data-xgc-role="robot-position-indicator"]');
    const battery = container.querySelector('[data-xgc-role="robot-power-indicator"]');
    expect(positioning?.getAttribute('aria-label')).toBe(items[1]?.label);
    expect(positioning).toHaveAttribute('data-xgc-tone', items[1]?.tone ?? '');
    expect(positioning?.getAttribute('aria-label')).toContain('VRPN positioning active');
    expect(positioning?.getAttribute('aria-label')).not.toMatch(/Positioning ready/);
    expect(battery?.getAttribute('aria-label')).toBe(items[2]?.label);
    expect(battery).toHaveAttribute('data-xgc-tone', items[2]?.tone ?? '');
    expect(battery?.querySelector('.robot-instrument-battery'))
      .toHaveAttribute('data-xgc-tone', items[2]?.tone ?? '');
  });

  it('puts flight stage on the pedestal and shows measured vision pose Hz on the right', () => {
    const { container } = renderInstrument(telemetry({
      flight:{ connected:true,armed:false,mode:'MANUAL',landedState:3 },
      pose:{ position:{ x:12.5,y:-3.25,z:4.75 } },
      localizationError:{ meters:0.123 },
      fcuLink:{ roundTripTimeMs:18.25 },
      power:{ voltageV:13.05 },
      streamHealth:{ channels:[
        { channelId:'state.vision.pose',sourceRateHz:28.4,outputRateHz:30 },
      ] },
    }));
    expect(container.querySelector('.robot-flight-hud-center')).not.toHaveTextContent('X12.5');
    const pedestal = [...container.querySelectorAll('.robot-flight-bottom-status > span')];
    expect(pedestal.map((row) => row.getAttribute('data-xgc-role')))
      .toEqual(['robot-flight-mode','robot-flight-stage','robot-flight-armed']);
    expect(pedestal.map((row) => row.textContent)).toEqual(['MANUAL','TO','DISARMED']);
    const rows = [...container.querySelectorAll('.robot-flight-status-list > span')];
    expect(rows.map((row) => row.querySelector('small')?.textContent))
      .toEqual(['VIS','ERR','RTT','VOLT']);
    expect(rows.map((row) => row.querySelector('strong')?.textContent))
      .toEqual(['28.4 Hz','12.3 cm','18 ms','13.1 V']);
    const vision = container.querySelector(
      '[data-xgc-role="robot-flight-vision-pose"][data-xgc-id="fs150-01:state.vision.pose"]',
    );
    expect(vision?.textContent).toBe('VIS28.4 Hz');
    expect(vision).toHaveAttribute('data-xgc-alarm-hz','10');
    expect(vision?.querySelector('strong')?.getAttribute('data-xgc-tone')).toBe('normal');
    expect(container.querySelector(
      '[data-xgc-role="robot-flight-stage"][data-xgc-id="fs150-01"]',
    )?.textContent).toBe('TO');
    expect(container.querySelector(
      '[data-xgc-role="robot-flight-position-error"][data-xgc-id="fs150-01"]',
    )?.textContent).toBe('ERR12.3 cm');
    expect(container.querySelector(
      '[data-xgc-role="robot-flight-position-error"][data-xgc-id="fs150-01"]',
    )).toHaveAttribute('data-xgc-alarm-cm','10');
    expect(container.querySelector(
      '[data-xgc-role="robot-flight-position-error"][data-xgc-id="fs150-01"] strong',
    )).toHaveAttribute('data-xgc-tone','danger');
    expect(container.querySelector(
      '[data-xgc-role="robot-flight-pitch-mark"][data-xgc-id="fs150-01:30"]',
    )).not.toBeNull();
    expect(container.querySelector(
      '[data-xgc-role="robot-flight-pitch-mark"][data-xgc-id="fs150-01:30"] .robot-flight-pitch-mark-hit',
    )).not.toBeNull();
    expect(container.querySelector(
      '[data-xgc-role="robot-flight-mode"][data-xgc-id="fs150-01"]',
    )?.textContent).toBe('MANUAL');
  });

  it('shows -- Hz for vision pose when Adapter has not measured a source rate', () => {
    const { container } = renderInstrument(telemetry());
    const vision = container.querySelector(
      '[data-xgc-role="robot-flight-vision-pose"][data-xgc-id="fs150-01:state.vision.pose"]',
    );
    expect(vision?.querySelector('strong')?.textContent).toBe('-- Hz');
    expect(vision?.querySelector('strong')?.getAttribute('data-xgc-tone')).toBe('normal');
  });

  it('puts mocap_rotor flight stage on the pedestal and keeps LNK/POS/VOLT', () => {
    const { container } = render(
      <FlightRobotInstrument
        robotId="px4-04"
        name="UAV-04"
        telemetry={telemetry({
          presentation: 'mocap_rotor',
          flight: { connected: true,armed: true,mode: 'OFFBOARD',landedState: 2 },
        })}
      />,
    );
    expect([...container.querySelectorAll('.robot-flight-bottom-status > span')]
      .map((row) => row.textContent)).toEqual(['OFFBOARD','AIR','ARMED']);
    expect(container.querySelector('[data-xgc-role="robot-flight-mode"]'))
      .toHaveAttribute('data-xgc-tone','success');
    expect(container.querySelector('[data-xgc-role="robot-flight-armed"]'))
      .toHaveAttribute('data-xgc-tone','success');
    expect([...container.querySelectorAll('.robot-flight-status-list small')]
      .map((node) => node.textContent)).toEqual(['LNK','POS','VOLT']);
    expect(container.querySelector('[data-xgc-role="robot-flight-vision-pose"]')).toBeNull();
    expect(container.querySelector(
      '[data-xgc-role="robot-flight-stage"][data-xgc-id="px4-04"]',
    )?.textContent).toBe('AIR');
  });

  it('shows MAVROS timesync RTT instead of Offboard input readiness', () => {
    const { container } = renderInstrument(telemetry({
      fcuLink:{ roundTripTimeMs:18.25 },
    }));
    const rtt = container.querySelector(
      '[data-xgc-role="robot-flight-round-trip-time"][data-xgc-id="fs150-01"]',
    );
    expect(rtt).toHaveTextContent('RTT18 ms');
    expect(rtt).toHaveAttribute('title','FCU round-trip time 18.3 ms; alarm above 15 ms');
    expect(rtt).toHaveAttribute('data-xgc-alarm-ms','15');
    expect(rtt?.querySelector('strong')).toHaveAttribute('data-xgc-tone','danger');
    expect([...container.querySelectorAll('.robot-flight-status-list small')]
      .map((node) => node.textContent)).not.toContain('OFF');
  });

  it('paints FCU round-trip time red strictly above 15 ms', () => {
    const atFloor = renderInstrument(telemetry({
      fcuLink:{ roundTripTimeMs:15 },
    }));
    const ok = atFloor.container.querySelector(
      '[data-xgc-role="robot-flight-round-trip-time"][data-xgc-id="fs150-01"]',
    );
    expect(ok).toHaveAttribute('data-xgc-alarm-ms','15');
    expect(ok?.querySelector('strong')).toHaveAttribute('data-xgc-tone','normal');
    expect(ok).toHaveAttribute('title','FCU round-trip time 15.0 ms; alarm above 15 ms');
    atFloor.unmount();
    const missing = renderInstrument(telemetry({ fcuLink:{} }));
    const empty = missing.container.querySelector(
      '[data-xgc-role="robot-flight-round-trip-time"][data-xgc-id="fs150-01"]',
    );
    expect(empty?.querySelector('strong')).toHaveAttribute('data-xgc-tone','normal');
    expect(empty).toHaveAttribute('title','FCU round-trip time unavailable');
    missing.unmount();
    const over = renderInstrument(telemetry({
      fcuLink:{ roundTripTimeMs:15.1 },
    }));
    expect(over.container.querySelector(
      '[data-xgc-role="robot-flight-round-trip-time"][data-xgc-id="fs150-01"] strong',
    )).toHaveAttribute('data-xgc-tone','danger');
  });

  it('paints VRPN–local position error red strictly above 10 cm', () => {
    const over = renderInstrument(telemetry({
      localizationError:{ meters:0.123 },
    }));
    const err = over.container.querySelector(
      '[data-xgc-role="robot-flight-position-error"][data-xgc-id="fs150-01"]',
    );
    expect(err).toHaveAttribute('data-xgc-alarm-cm','10');
    expect(err).toHaveAttribute('title','Position error 12.3 cm; alarm above 10 cm');
    expect(err?.querySelector('strong')).toHaveAttribute('data-xgc-tone','danger');
    over.unmount();
    const atFloor = renderInstrument(telemetry({
      localizationError:{ meters:0.1 },
    }));
    expect(atFloor.container.querySelector(
      '[data-xgc-role="robot-flight-position-error"][data-xgc-id="fs150-01"] strong',
    )).toHaveAttribute('data-xgc-tone','normal');
    atFloor.unmount();
    const missing = renderInstrument(telemetry({ localizationError:{} }));
    const empty = missing.container.querySelector(
      '[data-xgc-role="robot-flight-position-error"][data-xgc-id="fs150-01"]',
    );
    expect(empty?.textContent).toBe('ERR-- cm');
    expect(empty?.querySelector('strong')).toHaveAttribute('data-xgc-tone','normal');
  });

  it('treats MAVROS connected as a normal communication link even without timesync', () => {
    const { container } = renderInstrument(telemetry({
      linkFresh: false,
      flight: { connected: true,armed: false,mode: 'MANUAL' },
    }));
    const connection = container.querySelector('[data-xgc-role="robot-network-indicator"]');
    expect(connection?.getAttribute('data-xgc-tone')).not.toBe('danger');
    expect(connection?.getAttribute('data-xgc-tone')).toBe('info');
    expect(connection?.querySelector('.robot-instrument-connection-glyph')).not.toBeNull();
    expect(connection?.querySelector('.robot-instrument-connection-icon small')).toBeNull();
    expect(connection?.querySelector('.robot-instrument-wifi-icon')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-control-indicator"]')).toBeNull();
  });

  it('keeps battery percentage in the header and moves voltage into the lower panel', () => {
    const { container } = renderInstrument(telemetry({
      power: { percentage: 1,voltageV: 13.050001,currentA: 1 },
    }));

    const power = container.querySelector(
      '[data-xgc-role="robot-power-indicator"][data-xgc-id="fs150-01"]',
    );
    expect(power?.getAttribute('aria-label')).toBe('Battery 100%; 13.1 V');
    expect(power?.querySelector('.robot-instrument-power-details')).toBeNull();

    const voltage = container.querySelector(
      '[data-xgc-role="robot-flight-battery-voltage"][data-xgc-id="fs150-01"]',
    );
    expect(voltage?.textContent).toBe('VOLT13.1 V');
    expect(voltage?.getAttribute('title')).toBe('Battery voltage: 13.1 V');
    expect(container.textContent).not.toContain('1.0A');
  });

  it('shows an empty lower-panel voltage slot when power telemetry is unavailable', () => {
    const { container } = renderInstrument(telemetry({ power: {} }));
    const voltage = container.querySelector('[data-xgc-role="robot-flight-battery-voltage"]');

    expect(voltage?.textContent).toBe('VOLT-- V');
    expect(voltage?.getAttribute('title')).toBe('Battery voltage: --');
  });
});

function renderInstrument(value: FlightRobotInstrumentTelemetry) {
  return render(<FlightRobotInstrument robotId="fs150-01" name="FS150 01" telemetry={value} />);
}

function telemetry(overrides: Partial<FlightRobotInstrumentTelemetry> = {}): FlightRobotInstrumentTelemetry {
  return {
    presentation: 'fs150',
    online: true,
    linkFresh: true,
    poseFresh: true,
    mocapState: 'fresh',
    healthTone: 'healthy',
    flight: { connected: true,armed: false,mode: 'MANUAL' },
    pose: {},
    mocapPose: {},
    imu: {},
    localVelocity: {},
    mocapVelocity: {},
    mocapSpeed: {},
    localizationError: {},
    localSetpoint: {},
    localSetpointState: 'missing',
    power: {},
    streamHealth: {},
    fcuLink: {},
    ...overrides,
  };
}
