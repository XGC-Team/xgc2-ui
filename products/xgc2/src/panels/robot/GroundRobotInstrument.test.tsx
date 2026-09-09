// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe,expect,it } from 'vitest';
import { GroundRobotInstrument } from './GroundRobotInstrument';
import type { GroundRobotInstrumentTelemetry } from './groundInstrumentModel';
import { adapterPositioningStatus, listHeaderStatusItems } from './RobotListHeaderStatusModel';

function telemetry(overrides: Partial<GroundRobotInstrumentTelemetry> = {}): GroundRobotInstrumentTelemetry {
  return {
    online: true,
    operationalReady: true,
    connectionState: 'live',
    poseFresh: true,
    healthTone: 'healthy',
    pose: { position: { x: 1,y: 2,z: 0 },orientation: { x: 0,y: 0,z: 0,w: 1 } },
    velocity: { linear: { x: 0,y: 0 },angular: { z: 0 } },
    commandVelocity: { linear: { x: 0 },angular: { z: 0 } },
    speed: { metersPerSecond: 0 },
    power: {
      percentageState:'PERCENTAGE_STATE_AVAILABLE',percentage:0.88,voltageV:12.348,
    },
    chassis: { controlMode: 'CONTROL_MODE_COMMAND_CAN',nativeControlMode: 1 },
    health: { summary: 'nominal' },
    streamHealth: { channels: [
      { channelId: 'state.imu',sourceRateHz: 20,sourceAgeMs: 40,stale: false },
      { channelId: 'state.power',sourceRateHz: 1.67 },
      { channelId: 'vrpn.position',sourceRateHz: 20 },
      { channelId: 'command.velocity',sourceRateHz: 10 },
    ] },
    ...overrides,
  };
}

describe('GroundRobotInstrument', () => {
  it('reuses the flight HUD shell with Scout identity, header battery, and Adapter voltage', () => {
    const { container } = render(
      <GroundRobotInstrument robotId="scout-01" name="Scout 01" telemetry={telemetry()} />,
    );
    const face = container.querySelector('[data-xgc-role="robot-ground-instrument"]');
    expect(face).toHaveClass('robot-flight-instrument');
    expect(container.querySelector('.robot-ground-identity')?.textContent).toBe('Scout 01');
    expect(container.querySelector('[data-xgc-role="robot-ground-kind-glyph"]')).toBeNull();
    expect(container.querySelector('.robot-flight-instrument-header small')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-power-indicator"]')?.getAttribute('title'))
      .toMatch(/Battery 88%/);
    expect(container.querySelector('[data-xgc-role="robot-ground-power"] strong')?.textContent)
      .toBe('12.3 V');
    expect(container.querySelector('[data-xgc-role="robot-ground-power"] strong')?.textContent)
      .not.toMatch(/%/);
    expect(container.querySelector('[data-xgc-role="robot-ground-power"] small')?.textContent).toBe('VOLT');
    expect(container.querySelector('[data-xgc-role="robot-ground-power-rate"]')?.textContent)
      .toMatch(/1\.7 Hz/);
    expect(container.querySelector('[data-xgc-role="robot-ground-imu"]')?.textContent).toMatch(/IMU/);
    expect(container.querySelector('[data-xgc-role="robot-ground-imu-rate"]')?.textContent)
      .toMatch(/20/);
    expect(container.querySelector('[data-xgc-role="robot-network-indicator"]')?.getAttribute('title'))
      .toMatch(/40 ms/);
    expect(container.textContent).not.toMatch(/STAT|BRIDGE|XYZ/);
  });

  it('keeps cmd_vel streams white at or below 2 Hz and green above', () => {
    const idle = render(
      <GroundRobotInstrument
        robotId="mecanum-02"
        name="Mecanum 02"
        chassisChrome="none"
        telemetry={telemetry({
          chassis: {},
          streamHealth: { channels: [
            { channelId: 'state.imu',sourceRateHz: 20,sourceAgeMs: 40,stale: false },
            { channelId: 'state.power',sourceRateHz: 1 },
            { channelId: 'command.velocity',sourceRateHz: 0 },
          ] },
        })}
      />,
    );
    const cmd = idle.container.querySelector(
      '[data-xgc-role="robot-flight-frequency"][data-xgc-id="mecanum-02:command.velocity"]',
    );
    expect(cmd).toHaveAttribute('data-xgc-stream','command');
    expect(cmd).toHaveAttribute('data-xgc-active-hz','2');
    expect(cmd).toHaveAttribute('title','CMD -- Hz; green above 2 Hz');
    expect(cmd?.querySelector('strong')).toHaveAttribute('data-xgc-tone','normal');
    idle.unmount();
    const slow = render(
      <GroundRobotInstrument
        robotId="mecanum-02"
        name="Mecanum 02"
        chassisChrome="none"
        telemetry={telemetry({
          chassis: {},
          streamHealth: { channels: [
            { channelId: 'state.imu',sourceRateHz: 20,sourceAgeMs: 40,stale: false },
            { channelId: 'state.power',sourceRateHz: 1 },
            { channelId: 'command.velocity',sourceRateHz: 2 },
          ] },
        })}
      />,
    );
    expect(slow.container.querySelector(
      '[data-xgc-role="robot-flight-frequency"][data-xgc-id="mecanum-02:command.velocity"] strong',
    )).toHaveAttribute('data-xgc-tone','normal');
    slow.unmount();
    const live = render(
      <GroundRobotInstrument
        robotId="mecanum-02"
        name="Mecanum 02"
        chassisChrome="none"
        telemetry={telemetry({ chassis: {} })}
      />,
    );
    expect(live.container.querySelector(
      '[data-xgc-role="robot-flight-frequency"][data-xgc-id="mecanum-02:command.velocity"] strong',
    )).toHaveAttribute('data-xgc-tone','success');
  });

  it('paints Ground VRPN pose red strictly below 100 Hz', () => {
    const slow = render(
      <GroundRobotInstrument
        robotId="mecanum-02"
        name="Mecanum 02"
        chassisChrome="none"
        telemetry={telemetry({ chassis: {} })}
      />,
    );
    const vrp = slow.container.querySelector(
      '[data-xgc-role="robot-flight-frequency"][data-xgc-id="mecanum-02:vrpn.position"]',
    );
    expect(vrp).toHaveAttribute('data-xgc-stream','sensor');
    expect(vrp).toHaveAttribute('data-xgc-alarm-hz','100');
    expect(vrp).toHaveAttribute('title','VRP 20.0 Hz; alarm below 100 Hz');
    expect(vrp?.querySelector('strong')).toHaveAttribute('data-xgc-tone','danger');
    slow.unmount();
    const live = render(
      <GroundRobotInstrument
        robotId="scout-01"
        name="Scout 01"
        telemetry={telemetry({
          streamHealth: { channels: [
            { channelId: 'state.imu',sourceRateHz: 20,sourceAgeMs: 40,stale: false },
            { channelId: 'state.power',sourceRateHz: 1 },
            { channelId: 'vrpn.position',sourceRateHz: 100 },
            { channelId: 'command.velocity',sourceRateHz: 10 },
          ] },
        })}
      />,
    );
    expect(live.container.querySelector(
      '[data-xgc-role="robot-flight-frequency"][data-xgc-id="scout-01:vrpn.position"] strong',
    )).toHaveAttribute('data-xgc-tone','normal');
  });

  it('paints Ground IMU red strictly below 10 Hz', () => {
    const slow = render(
      <GroundRobotInstrument
        robotId="mecanum-02"
        name="Mecanum 02"
        chassisChrome="none"
        telemetry={telemetry({
          chassis: {},
          streamHealth: { channels: [
            { channelId: 'state.imu',sourceRateHz: 9.9,sourceAgeMs: 40,stale: false },
            { channelId: 'state.power',sourceRateHz: 1 },
            { channelId: 'vrpn.position',sourceRateHz: 100 },
            { channelId: 'command.velocity',sourceRateHz: 10 },
          ] },
        })}
      />,
    );
    const imu = slow.container.querySelector(
      '[data-xgc-role="robot-ground-imu"][data-xgc-id="mecanum-02:state.imu"]',
    );
    expect(imu).toHaveAttribute('data-xgc-stream','sensor');
    expect(imu).toHaveAttribute('data-xgc-alarm-hz','10');
    expect(imu).toHaveAttribute('title','IMU 9.9 Hz; alarm below 10 Hz');
    expect(imu?.querySelector('strong')).toHaveAttribute('data-xgc-tone','danger');
    slow.unmount();
    const live = render(
      <GroundRobotInstrument
        robotId="scout-01"
        name="Scout 01"
        telemetry={telemetry({
          streamHealth: { channels: [
            { channelId: 'state.imu',sourceRateHz: 10,sourceAgeMs: 40,stale: false },
            { channelId: 'state.power',sourceRateHz: 1 },
            { channelId: 'vrpn.position',sourceRateHz: 100 },
            { channelId: 'command.velocity',sourceRateHz: 10 },
          ] },
        })}
      />,
    );
    expect(live.container.querySelector(
      '[data-xgc-role="robot-ground-imu"][data-xgc-id="scout-01:state.imu"] strong',
    )).toHaveAttribute('data-xgc-tone','normal');
  });

  it('keeps battery frequency white and unlabeled as a sensor alarm', () => {
    const slow = render(
      <GroundRobotInstrument
        robotId="mecanum-02"
        name="Mecanum 02"
        chassisChrome="none"
        telemetry={telemetry({
          chassis: {},
          streamHealth: { channels: [
            { channelId: 'state.imu',sourceRateHz: 20,sourceAgeMs: 40,stale: false },
            { channelId: 'state.power',sourceRateHz: 0.4 },
            { channelId: 'vrpn.position',sourceRateHz: 100 },
            { channelId: 'command.velocity',sourceRateHz: 10 },
          ] },
        })}
      />,
    );
    const bat = slow.container.querySelector(
      '[data-xgc-role="robot-flight-frequency"][data-xgc-id="mecanum-02:state.power"]',
    );
    expect(bat).toHaveAttribute('data-xgc-stream','informational');
    expect(bat).not.toHaveAttribute('data-xgc-alarm-hz');
    expect(bat).toHaveAttribute('title','BAT 0.4 Hz; no frequency alarm');
    expect(bat?.querySelector('strong')).toHaveAttribute('data-xgc-tone','normal');
    slow.unmount();

    const fast = render(
      <GroundRobotInstrument
        robotId="mecanum-02"
        name="Mecanum 02"
        chassisChrome="none"
        telemetry={telemetry({
          chassis: {},
          streamHealth: { channels: [
            { channelId: 'state.power',sourceRateHz: 10 },
          ] },
        })}
      />,
    );
    expect(fast.container.querySelector(
      '[data-xgc-role="robot-flight-frequency"][data-xgc-id="mecanum-02:state.power"] strong',
    )).toHaveAttribute('data-xgc-tone','normal');
    fast.unmount();
  });

  it('keeps Mecanum off chassis mode and still shows PowerVoltage without a fake MODE', () => {
    const { container } = render(
      <GroundRobotInstrument
        robotId="mecanum-01"
        name="Mecanum 01"
        kindLabel="Mecanum UGV"
        chassisChrome="none"
        telemetry={telemetry({ chassis: {},health: {} })}
      />,
    );
    expect(container.querySelector('.robot-ground-identity')?.textContent).toBe('Mecanum 01');
    expect(container.querySelector('.robot-ground-identity')?.textContent).not.toMatch(/UGV|MECANUM|CAN/);
    expect(container.querySelector('[data-xgc-role="robot-control-indicator"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-ground-chassis-mode"]')).toBeNull();
    expect(container.querySelector('[data-xgc-pedestal="none"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-ground-power"] strong')?.textContent)
      .toBe('12.3 V');
    expect(container.querySelector('[data-xgc-chassis="none"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-ground-kind-glyph"]')).toBeNull();
  });

  it('does not adopt a leaked Scout chassis_state on Mecanum HUD chrome', () => {
    const { container } = render(
      <GroundRobotInstrument
        robotId="mecanum-01"
        name="Mecanum 01"
        chassisChrome="none"
        telemetry={telemetry({
          chassis: { controlMode: 'CONTROL_MODE_REMOTE',nativeControlMode: 0 },
        })}
      />,
    );
    expect(container.querySelector('[data-xgc-role="robot-control-indicator"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-ground-chassis-mode"]')).toBeNull();
    expect(container.textContent).not.toMatch(/\bRC\b/);
  });

  it('paints Scout chassis mode red for remote and green for program control', () => {
    const command = render(
      <GroundRobotInstrument
        robotId="scout-01"
        name="Scout 01"
        telemetry={telemetry()}
      />,
    );
    const commandMode = command.container.querySelector('[data-xgc-role="robot-ground-chassis-mode"] span');
    expect(commandMode?.textContent).toBe('CMD');
    expect(commandMode?.textContent).not.toBe('CAN');
    expect(commandMode).toHaveAttribute('data-xgc-tone','success');
    command.unmount();

    const remote = render(
      <GroundRobotInstrument
        robotId="scout-02"
        name="Scout 02"
        telemetry={telemetry({
          chassis: { controlMode: 'CONTROL_MODE_REMOTE',nativeControlMode: 0 },
        })}
      />,
    );
    const remoteMode = remote.container.querySelector('[data-xgc-role="robot-ground-chassis-mode"] span');
    expect(remoteMode?.textContent).toBe('RC');
    expect(remoteMode).toHaveAttribute('data-xgc-tone','danger');
    remote.unmount();

    const uart = render(
      <GroundRobotInstrument
        robotId="scout-03"
        name="Scout 03"
        telemetry={telemetry({
          chassis: { controlMode: 'CONTROL_MODE_COMMAND_UART',nativeControlMode: 2 },
        })}
      />,
    );
    const uartMode = uart.container.querySelector('[data-xgc-role="robot-ground-chassis-mode"] span');
    expect(uartMode?.textContent).toBe('UART');
    expect(uartMode).toHaveAttribute('data-xgc-tone','danger');
    uart.unmount();

    const unknown = render(
      <GroundRobotInstrument
        robotId="scout-04"
        name="Scout 04"
        telemetry={telemetry({ chassis: { nativeControlMode: 3 } })}
      />,
    );
    const unknownMode = unknown.container.querySelector('[data-xgc-role="robot-ground-chassis-mode"] span');
    expect(unknownMode?.textContent).toBe('MODE 3');
    expect(unknownMode).toHaveAttribute('data-xgc-tone','normal');
    unknown.unmount();
  });

  it('puts signed current in the voltage tooltip, not the HUD value', () => {
    const { container } = render(
      <GroundRobotInstrument
        robotId="scout-01"
        name="Scout 01"
        telemetry={telemetry({ power: {
          percentageState:'PERCENTAGE_STATE_AVAILABLE',percentage:0.88,
          voltage_v:12.348,current_a:-2.4,
        } })}
      />,
    );
    const power = container.querySelector(
      '[data-xgc-role="robot-ground-power"][data-xgc-id="scout-01"]',
    );
    expect(power?.querySelector('strong')?.textContent).toBe('12.3 V');
    expect(power?.getAttribute('title')).toMatch(/-2\.4 A/);
    expect(power?.getAttribute('data-xgc-voltage-v')).toBe('12.348');
    expect(power?.getAttribute('data-xgc-current-a')).toBe('-2.4');
  });

  it('maps ground HUD slots onto the flight chrome without Scheme A tiles', () => {
    const scout = render(
      <GroundRobotInstrument robotId="scout-01" name="Scout 01" telemetry={telemetry()} />,
    );
    const face = scout.container.querySelector('[data-xgc-role="robot-ground-instrument"]')!;
    expect(face.querySelector('[data-xgc-role="robot-ground-heading"]')?.textContent).toMatch(/°|--/);
    expect(face.querySelector('[data-xgc-role="robot-ground-heading"]'))
      .toHaveAttribute('data-xgc-id', 'scout-01');
    expect(face.querySelector('[data-xgc-role="robot-ground-yaw-compass"]')).not.toBeNull();
    expect(face.querySelector('[data-xgc-role="robot-ground-hud"]')).not.toBeNull();
    expect(face.querySelector('[data-xgc-role="robot-flight-metric-ruler"][data-xgc-id="scout-01:left"]')?.textContent)
      .toMatch(/m\/s/);
    expect(face.querySelector('[data-xgc-role="robot-flight-metric-ruler"][data-xgc-id="scout-01:right"]')?.textContent)
      .toMatch(/m$/);
    expect(face.querySelector('[data-xgc-role="robot-ground-linear-speed"]')).toBeNull();
    expect(face.querySelector('[data-xgc-role="robot-ground-angular-rate"]')).toBeNull();
    expect(face.querySelector('[data-xgc-role="robot-ground-instrument-command-linear"]')?.textContent)
      .not.toMatch(/CMD\./);
    expect(face.querySelector('[data-xgc-role="robot-ground-instrument-command-linear"]'))
      .toHaveAttribute('data-xgc-id', 'scout-01');
    expect(face.querySelector('[data-xgc-role="robot-flight-pitch-mark"][data-xgc-id="scout-01:30"]')).not.toBeNull();
    expect(face.querySelector('[data-xgc-role="robot-ground-hud"]'))
      .toHaveAttribute('data-xgc-id', 'scout-01');
    expect(face.querySelector('[data-xgc-role="robot-ground-instrument-command-linear"] small')?.textContent)
      .toBe('Vx');
    expect(face.querySelector('[data-xgc-role="robot-ground-instrument-command-angular"] small')?.textContent)
      .toBe('ω');
    expect([...face.querySelectorAll('.robot-flight-status-list > span')]
      .map((row) => row.querySelector('small')?.textContent))
      .toEqual(['Vx','ω','VOLT']);
    expect(face.querySelector('[data-xgc-role="robot-ground-instrument-command-linear"] strong')?.textContent)
      .toMatch(/m\/s/);
    expect(face.querySelector('[data-xgc-role="robot-ground-instrument-command-angular"] strong')?.textContent)
      .toMatch(/rad\/s/);
    expect(face.querySelector('.robot-flight-hud-center')).toBeNull();
    expect(face.querySelector('[data-xgc-role="robot-ground-imu"]'))
      .toHaveAttribute('data-xgc-source', 'diagnostic.stream-health.channels[state.imu].sourceAgeMs');
    expect(face.querySelector('[data-xgc-role="robot-ground-bridge"]')).toBeNull();
    expect(face.querySelector('[data-xgc-role="robot-ground-position"]')).toBeNull();
    expect(face.querySelector('[data-xgc-role="robot-ground-power"]')).not.toBeNull();
    expect(face.querySelector('[data-xgc-role="robot-network-indicator"]'))
      .toHaveAttribute('data-xgc-source', 'diagnostic.stream-health.channels[state.imu].sourceAgeMs');
    expect([...face.querySelectorAll('.robot-instrument-status-icons [data-xgc-role$="-indicator"]')]
      .map((glyph) => glyph.getAttribute('data-xgc-role')))
      .toEqual([
        'robot-network-indicator',
        'robot-position-indicator',
        'robot-power-indicator',
      ]);
    expect(face.querySelector('[data-xgc-role="robot-position-indicator"]'))
      .toHaveAttribute('aria-label', 'VRPN position unavailable');
    expect(face.querySelector('[data-xgc-role="robot-position-indicator"]')?.getAttribute('aria-label'))
      .not.toMatch(/Positioning ready/);
    expect(face.querySelector('[data-xgc-role="robot-power-indicator"]')).not.toBeNull();
    expect(face.querySelector('[data-xgc-role="robot-control-indicator"]')).toBeNull();
    expect(face.querySelector('[data-xgc-role="robot-ground-chassis-mode"]')?.textContent).toMatch(/CMD/);
    expect(face.querySelector('[data-xgc-role="robot-flight-metric-ruler"][data-xgc-id="scout-01:left"]'))
      .toHaveAttribute('data-xgc-tone','normal');
    expect(face.querySelector('[data-xgc-role="robot-flight-metric-ruler"][data-xgc-id="scout-01:right"]'))
      .toHaveAttribute('data-xgc-tone','normal');
    expect(face.querySelector('[data-xgc-role="robot-ground-heading"]'))
      .toHaveAttribute('data-xgc-tone','normal');
    expect(face.querySelector('[data-xgc-role="robot-ground-chassis-mode"] span'))
      .toHaveAttribute('data-xgc-tone','success');
    expect(face.querySelector('[data-xgc-role="robot-ground-instrument-command-linear"] strong'))
      .toHaveAttribute('data-xgc-tone','normal');
    expect(face.querySelector('[data-xgc-role="robot-ground-instrument-command-angular"] strong'))
      .toHaveAttribute('data-xgc-tone','normal');
    expect(face).toHaveAttribute('data-xgc-pedestal', 'chassis');
    expect(face.querySelector('.robot-flight-instrument-header [data-xgc-role="robot-instrument-status"]')).not.toBeNull();
    expect(face.querySelectorAll('[data-xgc-role="robot-instrument-status"]')).toHaveLength(1);
    expect(face.querySelector('[data-xgc-role="robot-ground-link"]')).toBeNull();
    expect(face.querySelector('.robot-ground-chassis-visual')).toBeNull();
    expect(face).toHaveAttribute('data-xgc-chassis', 'scout');
    expect(face.textContent).toMatch(/CMD/);
    expect(face.textContent).toMatch(/BAT/);
    expect(scout.container.textContent).not.toMatch(/Connect|Reconnect/);
    scout.unmount();
  });

  it('keeps header positioning and battery on the same Adapter contract as list', () => {
    const health = {
      summary: 'nominal',
      positioning: { state: 'POSITIONING_STATE_STABLE' },
    };
    const items = listHeaderStatusItems({
      communication: {
        measurement: 'imu-age',
        milliseconds: 40,
        source: 'diagnostic.stream-health.channels[state.imu].sourceAgeMs',
      },
      battery: {
        percentage: 88,
        voltageV: 12.348,
        source: 'state.power.voltageV+percentageState+percentage',
      },
      position: adapterPositioningStatus(health),
    });
    const { container } = render(
      <GroundRobotInstrument robotId="scout-01" name="Scout 01" telemetry={telemetry({ health })} />,
    );
    const positioning = container.querySelector('[data-xgc-role="robot-position-indicator"]');
    const battery = container.querySelector('[data-xgc-role="robot-power-indicator"]');
    expect(positioning?.getAttribute('aria-label')).toBe(items[1]?.label);
    expect(positioning).toHaveAttribute('data-xgc-tone', items[1]?.tone ?? '');
    expect(positioning?.getAttribute('aria-label')).toContain('VRPN positioning stable');
    expect(positioning?.getAttribute('aria-label')).not.toMatch(/Positioning ready/);
    expect(battery?.getAttribute('aria-label')).toBe(items[2]?.label);
    expect(battery).toHaveAttribute('data-xgc-tone', items[2]?.tone ?? '');
    expect(battery?.querySelector('.robot-instrument-battery'))
      .toHaveAttribute('data-xgc-tone', items[2]?.tone ?? '');
  });

  it('keeps the same telemetry contract under single and double board wrappers', () => {
    for (const layout of ['single', 'double'] as const) {
      const scout = render(
        <div className="robot-instrument-grid" data-xgc-layout={layout}>
          <GroundRobotInstrument robotId="scout-01" name="Scout 01" telemetry={telemetry()} />
        </div>,
      );
      const face = scout.container.querySelector('[data-xgc-role="robot-ground-instrument"]');
      expect(face).toHaveClass('robot-flight-instrument');
      expect(face?.querySelector('[data-xgc-role="robot-ground-heading"]')?.textContent)
        .toMatch(/°|--/);
      expect(face?.querySelector('[data-xgc-role="robot-flight-metric-ruler"][data-xgc-id="scout-01:left"]'))
        .not.toBeNull();
      expect(face?.querySelector('[data-xgc-role="robot-flight-metric-ruler"][data-xgc-id="scout-01:right"]'))
        .not.toBeNull();
      expect(face?.querySelector('[data-xgc-role="robot-ground-instrument-command-linear"] small')?.textContent)
        .toBe('Vx');
      expect(face?.querySelector('[data-xgc-role="robot-ground-instrument-command-angular"] small')?.textContent)
        .toBe('ω');
      expect([...face?.querySelectorAll('.robot-flight-status-list > span') ?? []]
        .map((row) => row.querySelector('small')?.textContent))
        .toEqual(['Vx','ω','VOLT']);
      expect(face?.querySelector('[data-xgc-role="robot-control-indicator"]')).toBeNull();
      expect(face?.querySelector('[data-xgc-role="robot-ground-chassis-mode"]')?.textContent)
        .toMatch(/CMD/);
      expect(face?.querySelector('[data-xgc-role="robot-ground-power"]')).not.toBeNull();
      expect(face?.querySelector('.robot-flight-instrument-header [data-xgc-role="robot-instrument-status"]')).not.toBeNull();
      expect(face?.querySelectorAll('[data-xgc-role="robot-instrument-status"]')).toHaveLength(1);
      expect(face?.querySelector('[data-xgc-role="robot-ground-link"]')).toBeNull();
      expect(scout.container.textContent).not.toMatch(/Connect|Reconnect/);
      scout.unmount();

      const mecanum = render(
        <div className="robot-instrument-grid" data-xgc-layout={layout}>
          <GroundRobotInstrument
            robotId="mecanum-01"
            name="Mecanum 01"
            kindLabel="Mecanum UGV"
            chassisChrome="none"
            telemetry={telemetry({ chassis: {} })}
          />
        </div>,
      );
      const mecanumFace = mecanum.container.querySelector('[data-xgc-role="robot-ground-instrument"]');
      expect(mecanumFace).toHaveAttribute('data-xgc-chassis', 'none');
      expect(mecanumFace).toHaveAttribute('data-xgc-pedestal', 'none');
      expect(mecanumFace?.querySelector('.robot-ground-identity')?.textContent).toBe('Mecanum 01');
      expect(mecanumFace?.querySelector('[data-xgc-role="robot-control-indicator"]')).toBeNull();
      expect(mecanumFace?.querySelector('[data-xgc-role="robot-ground-chassis-mode"]')).toBeNull();
      expect(mecanumFace?.querySelector('[data-xgc-role="robot-ground-instrument-command-linear"]')).not.toBeNull();
      expect(mecanumFace?.querySelector('[data-xgc-role="robot-ground-instrument-command-linear"] small')?.textContent)
        .toBe('Vx');
      expect(mecanumFace?.querySelector('[data-xgc-role="robot-ground-instrument-command-lateral"]')?.textContent)
        .toMatch(/Vy/);
      expect(mecanumFace?.querySelector('[data-xgc-role="robot-ground-instrument-command-lateral"] small')?.textContent)
        .toBe('Vy');
      expect(mecanumFace?.querySelector('[data-xgc-role="robot-ground-instrument-command-angular"]')).not.toBeNull();
      expect(mecanumFace?.querySelector('[data-xgc-role="robot-ground-instrument-command-angular"] small')?.textContent)
        .toBe('ω');
      expect([...mecanumFace?.querySelectorAll('.robot-flight-status-list > span') ?? []]
        .map((row) => row.querySelector('small')?.textContent))
        .toEqual(['Vx','Vy','ω','VOLT']);
      expect(mecanumFace).not.toHaveAttribute('data-xgc-linear');
      expect(mecanumFace?.querySelector('[data-xgc-role="robot-flight-metric-ruler"][data-xgc-id="mecanum-01:left"]')?.textContent)
        .toMatch(/m\/s/);
      expect(mecanumFace?.querySelector('[data-xgc-role="robot-flight-metric-ruler"][data-xgc-id="mecanum-01:right"]')?.textContent)
        .toMatch(/m$/);
      expect(mecanumFace?.querySelector('[data-xgc-role="robot-ground-linear-speed"]')).toBeNull();
      expect(mecanumFace?.querySelector('[data-xgc-role="robot-ground-linear-speed-x"]')).toBeNull();
      expect(mecanumFace?.querySelector('[data-xgc-role="robot-ground-linear-speed-y"]')).toBeNull();
      mecanum.unmount();
    }
  });

  it('uses the flight attitude/yaw HUD without chassis glyphs or inner grey tiles', () => {
    const { container } = render(
      <div style={{ width: 848,height: 214 }}>
        <GroundRobotInstrument robotId="scout-01" name="Scout 01" telemetry={telemetry()} />
      </div>,
    );
    const face = container.querySelector<HTMLElement>('[data-xgc-role="robot-ground-instrument"]')!;
    expect(face.querySelector('.robot-ground-heading-dial')).toBeNull();
    expect(face.querySelector('[data-xgc-role="robot-ground-health"]')).toBeNull();
    expect(face.querySelector('.robot-ground-chassis-visual')).toBeNull();
    expect(face.querySelector('[data-xgc-role="robot-ground-kind-glyph"]')).toBeNull();
    expect(face.querySelector('[data-xgc-role="robot-ground-hud"]')).not.toBeNull();
    expect(face.querySelector('.robot-flight-instrument-attitude')).not.toBeNull();
    expect(face.querySelector('.robot-flight-yaw-compass')).not.toBeNull();
    expect(face.querySelector('[data-xgc-role="robot-ground-heading"]')?.textContent).toMatch(/°|--/);
    expect(face.querySelector('.robot-ground-instrument-body')).toBeNull();
    expect(face.querySelector('[data-xgc-role="robot-ground-instrument-command-linear"]')).not.toBeNull();
    expect(face.querySelector('[data-xgc-role="robot-ground-chassis-mode"]')).not.toBeNull();
  });

  it('keeps one semantic board under single 848 and double 420 frames', () => {
    for (const size of [{ w: 848,h: 214 },{ w: 420,h: 214 }] as const) {
      const view = render(
        <div style={{ width: size.w,height: size.h }}>
          <GroundRobotInstrument robotId="scout-01" name="Scout 01" telemetry={telemetry()} />
        </div>,
      );
      const face = view.container.querySelector<HTMLElement>('[data-xgc-role="robot-ground-instrument"]')!;
      expect(face.querySelectorAll('.robot-flight-metric-ruler')).toHaveLength(2);
      expect(face.querySelector('.robot-ground-heading-dial')).toBeNull();
      expect(face.querySelector('[data-xgc-role="robot-flight-metric-ruler"][data-xgc-id="scout-01:left"]'))
        .not.toBeNull();
      expect(face.querySelector('[data-xgc-role="robot-flight-metric-ruler"][data-xgc-id="scout-01:right"]'))
        .not.toBeNull();
      expect(face.querySelector('[data-xgc-role="robot-ground-instrument-command-angular"]')).not.toBeNull();
      expect(face.querySelector('[data-xgc-role="robot-ground-chassis-mode"]')?.textContent)
        .toMatch(/CMD/);
      expect(face.querySelector('.robot-flight-instrument-header [data-xgc-role="robot-instrument-status"]')).not.toBeNull();
      expect(face.querySelector('[data-xgc-role="robot-ground-link"]')).toBeNull();
      expect(view.container.textContent).not.toMatch(/Connect|Reconnect/);
      view.unmount();
    }
  });

  it('shows signed command velocities and omits missing STAT without charts', () => {
    const longTelemetry = telemetry({
      pose: {
        position: { x: -12345.67,y: 9876.54,z: -0.12 },
        orientation: { x: 0,y: 0,z: 0,w: 1 },
      },
      speed: { metersPerSecond: 99 },
      velocity: { linear: { x: -123.4,y: 0 },angular: { z: 87.65 } },
      commandVelocity: { linear: { x: -76.54 },angular: { z: -9.87 } },
      streamHealth: { channels: [
        { channelId: 'vrpn.position',sourceRateHz: 59.94 },
        { channelId: 'vrpn.speed',sourceRateHz: 29.97 },
        { channelId: 'state.imu',sourceRateHz: 123.45,sourceAgeMs: 8,stale: false },
        { channelId: 'state.power',sourceRateHz: 0.98 },
        { channelId: 'command.velocity',sourceRateHz: 10 },
      ] },
    });
    for (const frame of [
      { layout: 'single',width: 848,skin: 'dark' },
      { layout: 'double',width: 420,skin: 'light' },
      { layout: 'single',width: 176,skin: 'dark' },
    ] as const) {
      const view = render(
        <div data-skin={frame.skin} style={{ width: frame.width,height: 214 }}>
          <div className="robot-instrument-grid" data-xgc-layout={frame.layout}>
            <GroundRobotInstrument robotId="scout-long" name="Scout Long" telemetry={longTelemetry} />
          </div>
        </div>,
      );
      const face = view.container.querySelector<HTMLElement>('[data-xgc-role="robot-ground-instrument"]')!;
      expect(face.querySelectorAll('.robot-response-trend')).toHaveLength(0);
      expect(face.querySelectorAll('.robot-response-trend circle')).toHaveLength(0);
      expect(face.textContent).not.toMatch(/STAT/);
      expect(face.querySelector('.robot-flight-hud-center')).toBeNull();

      const commandLinear = face.querySelector<HTMLElement>(
        '[data-xgc-role="robot-ground-instrument-command-linear"]',
      )!;
      const commandAngular = face.querySelector<HTMLElement>(
        '[data-xgc-role="robot-ground-instrument-command-angular"]',
      )!;
      expect(commandLinear.querySelector('small')?.textContent).toBe('Vx');
      expect(commandLinear.textContent).not.toMatch(/CMD\./);
      expect(commandLinear.textContent).toMatch(/m\/s/);
      expect(commandAngular.querySelector('small')?.textContent).toBe('ω');
      expect(commandAngular.textContent).toMatch(/rad\/s/);
      expect(commandLinear.textContent).toMatch(/-76\.5 m\/s/);
      expect(commandLinear.textContent).not.toMatch(/-76\.54/);
      expect(commandAngular.textContent).toMatch(/-9\.9 rad\/s/);
      expect(commandAngular.textContent).not.toMatch(/-9\.87/);
      expect(face.querySelector('[data-xgc-role="robot-ground-instrument-command-lateral"]')).toBeNull();
      expect(face.querySelector('[data-xgc-role="robot-ground-linear-speed-x"]')).toBeNull();
      expect(face.querySelector('[data-xgc-role="robot-ground-chassis-mode"]')?.textContent)
        .toMatch(/CMD/);
      expect(face.querySelector('[data-xgc-role="robot-flight-metric-ruler"][data-xgc-id="scout-long:left"]')?.textContent)
        .toMatch(/123\.4m\/s/);
      expect(face.querySelector('[data-xgc-role="robot-flight-metric-ruler"][data-xgc-id="scout-long:right"]')?.textContent)
        .toMatch(/-0\.1m/);
      expect(face.querySelector('[data-xgc-role="robot-ground-linear-speed"]')).toBeNull();
      expect(face.querySelector('[data-xgc-role="robot-ground-angular-rate"]')).toBeNull();
      expect(face.querySelector('[data-xgc-role="robot-ground-imu-rate"]')?.textContent)
        .toMatch(/123\.5 Hz/);
      expect(face.querySelector('[data-xgc-role="robot-ground-power-rate"]')?.textContent)
        .toMatch(/1\.0 Hz/);
      expect(face.textContent).not.toMatch(/Connect|Reconnect|Restart/);
      view.unmount();
    }
  });

  it('never shows STAT frequency even when Adapter health rate is present', () => {
    const { container } = render(
      <GroundRobotInstrument
        robotId="scout-02"
        name="Scout 02"
        telemetry={telemetry({
          streamHealth: { channels: [
            { channelId: 'state.imu',sourceRateHz: 20,sourceAgeMs: 40,stale: false },
            { channelId: 'state.power',sourceRateHz: 1.67 },
            { channelId: 'command.velocity',sourceRateHz: 10 },
            { channelId: 'state.health',sourceRateHz: 1 },
          ] },
        })}
      />,
    );
    expect(container.textContent).not.toMatch(/STAT/);
    expect(container.querySelector('[data-xgc-role="robot-flight-frequency"][data-xgc-id="scout-02:state.health"]'))
      .toBeNull();
  });

  it('keeps VOLT / Vx / ω slots when Adapter command velocity is missing', () => {
    const { container } = render(
      <GroundRobotInstrument
        robotId="scout-empty"
        name="Scout Empty"
        telemetry={telemetry({
          velocity: {},
          commandVelocity: {},
          speed: {},
          power: { percentageState:'PERCENTAGE_STATE_UNAVAILABLE' },
          streamHealth: { channels: [
            { channelId: 'state.imu',sourceRateHz: 20,sourceAgeMs: 40,stale: false },
          ] },
        })}
      />,
    );
    expect(container.querySelector('[data-xgc-role="robot-ground-power"]')?.textContent)
      .toMatch(/VOLT/);
    expect(container.querySelector('[data-xgc-role="robot-ground-power"]')?.textContent)
      .toMatch(/-- V/);
    expect([...container.querySelectorAll('.robot-flight-status-list > span')]
      .map((row) => row.querySelector('small')?.textContent))
      .toEqual(['Vx','ω','VOLT']);
    expect(container.querySelector('[data-xgc-role="robot-ground-instrument-command-linear"] small')?.textContent)
      .toBe('Vx');
    expect(container.querySelector('[data-xgc-role="robot-ground-instrument-command-linear"]')?.textContent)
      .toMatch(/-- m\/s/);
    expect(container.querySelector('[data-xgc-role="robot-ground-instrument-command-angular"] small')?.textContent)
      .toBe('ω');
    expect(container.querySelector('[data-xgc-role="robot-ground-instrument-command-angular"]')?.textContent)
      .toMatch(/-- rad\/s/);
    expect(container.querySelector('[data-xgc-role="robot-ground-instrument-command-lateral"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="robot-ground-chassis-mode"]')?.textContent)
      .toMatch(/CMD|--/);
    expect(container.textContent).toMatch(/BAT/);
  });

  it('keeps identical Scout and Mecanum detail fields across light and dark skins', () => {
    for (const skin of ['light','dark'] as const) {
      const view = render(
        <div data-skin={skin}>
          <GroundRobotInstrument
            robotId={`mecanum-${skin}`}
            name="Mecanum 01"
            kindLabel="Mecanum UGV"
            chassisChrome="none"
            telemetry={telemetry({ chassis: {} })}
          />
        </div>,
      );
      const face = view.container.querySelector<HTMLElement>('[data-xgc-role="robot-ground-instrument"]')!;
      expect(face.closest(`[data-skin="${skin}"]`)).not.toBeNull();
      expect(face).toHaveAttribute('data-xgc-chassis', 'none');
      expect(face).toHaveClass('robot-flight-instrument');
      expect(face.querySelectorAll('[style*="color"]')).toHaveLength(0);
      expect(face.querySelectorAll('.robot-response-trend')).toHaveLength(0);
      view.unmount();
    }
  });

  it('shares the flight HUD skeleton while preserving Scout chassis and Mecanum absence', () => {
    const scout = render(
      <GroundRobotInstrument robotId="scout-01" name="Scout 01" telemetry={telemetry()} />,
    );
    const scoutFace = scout.container.querySelector<HTMLElement>('[data-xgc-role="robot-ground-instrument"]')!;
    expect(scoutFace.querySelector('[data-xgc-role="robot-ground-kind-glyph"]')).toBeNull();
    expect(scoutFace.querySelector('[data-xgc-role="robot-ground-hud"]')).not.toBeNull();
    expect(scoutFace.querySelector('[data-xgc-role="robot-control-indicator"]')).toBeNull();
    expect(scoutFace.querySelector('[data-xgc-role="robot-ground-chassis-mode"]')?.textContent)
      .toMatch(/CMD/);
    expect(scoutFace).toHaveAttribute('data-xgc-pedestal', 'chassis');
    expect(scoutFace.querySelector('[data-xgc-role="robot-ground-imu"]')?.textContent)
      .toMatch(/IMU/);
    expect(scoutFace.querySelector('.robot-instrument-status-icons')).not.toBeNull();
    expect(scoutFace.querySelectorAll('.robot-instrument-status-icons [data-xgc-role$="-indicator"]'))
      .toHaveLength(3);
    scout.unmount();

    const mecanum = render(
      <GroundRobotInstrument
        robotId="mecanum-01"
        name="Mecanum 01"
        kindLabel="Mecanum UGV"
        chassisChrome="none"
        telemetry={telemetry({ chassis: {} })}
      />,
    );
    const mecanumFace = mecanum.container.querySelector<HTMLElement>('[data-xgc-role="robot-ground-instrument"]')!;
    expect(mecanumFace.querySelector('[data-xgc-role="robot-ground-kind-glyph"]')).toBeNull();
    expect(mecanumFace.querySelector('[data-xgc-role="robot-ground-hud"]')).not.toBeNull();
    expect(mecanumFace.querySelector('[data-xgc-role="robot-control-indicator"]')).toBeNull();
    expect(mecanumFace.querySelector('[data-xgc-role="robot-ground-chassis-mode"]')).toBeNull();
    expect(mecanumFace).toHaveAttribute('data-xgc-pedestal', 'none');
    expect(mecanumFace.querySelector('.robot-instrument-status-icons')).not.toBeNull();
    expect(mecanumFace.querySelectorAll('.robot-instrument-status-icons [data-xgc-role$="-indicator"]'))
      .toHaveLength(3);
    expect(mecanumFace).not.toHaveAttribute('data-xgc-linear');
    mecanum.unmount();
  });

  it('unifies Scout and Mecanum HUD rulers on VRPN 2-norm and height, and keeps Mecanum CMD Vy', () => {
    const holonomicTelemetry = telemetry({
      chassis: {},
      pose: { position: { x: 1,y: 2,z: -0.12 },orientation: { x: 0,y: 0,z: 0,w: 1 } },
      velocity: { linear: { x: 1.2,y: -0.4 },angular: { z: 0.05 } },
      commandVelocity: { linear: { x: 0.8,y: -0.3 },angular: { z: 0.1 } },
    });
    const scout = render(
      <GroundRobotInstrument robotId="scout-01" name="Scout 01" telemetry={holonomicTelemetry} />,
    );
    const scoutFace = scout.container.querySelector<HTMLElement>('[data-xgc-role="robot-ground-instrument"]')!;
    expect(scoutFace).not.toHaveAttribute('data-xgc-linear');
    expect(scoutFace.querySelector('[data-xgc-role="robot-flight-metric-ruler"][data-xgc-id="scout-01:left"]')?.textContent)
      .toBe('1.3m/s');
    expect(scoutFace.querySelector('[data-xgc-role="robot-flight-metric-ruler"][data-xgc-id="scout-01:right"]')?.textContent)
      .toBe('-0.1m');
    expect(scoutFace.querySelector('[data-xgc-role="robot-ground-linear-speed"]')).toBeNull();
    expect(scoutFace.querySelector('[data-xgc-role="robot-ground-linear-speed-x"]')).toBeNull();
    expect(scoutFace.querySelector('[data-xgc-role="robot-ground-linear-speed-y"]')).toBeNull();
    expect(scoutFace.querySelector('[data-xgc-role="robot-ground-instrument-command-lateral"]')).toBeNull();
    scout.unmount();

    const mecanum = render(
      <GroundRobotInstrument
        robotId="mecanum-01"
        name="Mecanum 01"
        chassisChrome="none"
        telemetry={holonomicTelemetry}
      />,
    );
    const face = mecanum.container.querySelector<HTMLElement>('[data-xgc-role="robot-ground-instrument"]')!;
    expect(face).not.toHaveAttribute('data-xgc-linear');
    expect(face).toHaveAttribute('data-linear-speed', '1.26');
    expect(face).not.toHaveAttribute('data-lateral-speed');
    expect(face.querySelector('[data-xgc-role="robot-flight-metric-ruler"][data-xgc-id="mecanum-01:left"]')?.textContent)
      .toBe('1.3m/s');
    expect(face.querySelector('[data-xgc-role="robot-flight-metric-ruler"][data-xgc-id="mecanum-01:left"]'))
      .toHaveAttribute('data-xgc-source', 'vrpn.velocity.linear');
    expect(face.querySelector('[data-xgc-role="robot-flight-metric-ruler"][data-xgc-id="mecanum-01:right"]')?.textContent)
      .toBe('-0.1m');
    expect(face.querySelector('[data-xgc-role="robot-flight-metric-ruler"][data-xgc-id="mecanum-01:right"]'))
      .toHaveAttribute('data-xgc-source', 'vrpn.position.position.z');
    expect(face.querySelector('[data-xgc-role="robot-ground-linear-speed"]')).toBeNull();
    expect(face.querySelector('[data-xgc-role="robot-ground-linear-speed-x"]')).toBeNull();
    expect(face.querySelector('[data-xgc-role="robot-ground-linear-speed-y"]')).toBeNull();
    expect(face.querySelector('[data-xgc-role="robot-ground-instrument-command-linear"]')?.textContent)
      .toMatch(/\+0\.8 m\/s/);
    expect(face.querySelector('[data-xgc-role="robot-ground-instrument-command-linear"]')?.textContent)
      .not.toMatch(/\+0\.80/);
    expect(face.querySelector('[data-xgc-role="robot-ground-instrument-command-lateral"]')?.textContent)
      .toMatch(/Vy/);
    expect(face.querySelector('[data-xgc-role="robot-ground-instrument-command-lateral"]')?.textContent)
      .toMatch(/-0\.3 m\/s/);
    expect(face.querySelector('[data-xgc-role="robot-ground-instrument-command-lateral"]')?.textContent)
      .not.toMatch(/-0\.30/);
    expect(face.querySelector('[data-xgc-role="robot-ground-instrument-command-angular"]')?.textContent)
      .toMatch(/\+0\.1 rad\/s/);
    expect(face.querySelector('[data-xgc-role="robot-ground-instrument-command-angular"]')?.textContent)
      .not.toMatch(/\+0\.10/);
    expect(face.querySelectorAll('.robot-flight-metric-ruler')).toHaveLength(2);
    mecanum.unmount();

    const empty = render(
      <GroundRobotInstrument
        robotId="mecanum-empty"
        name="Mecanum Empty"
        chassisChrome="none"
        telemetry={telemetry({
          chassis: {},
          pose: {},
          velocity: {},
          commandVelocity: {},
          speed: {},
          power: { percentageState:'PERCENTAGE_STATE_UNAVAILABLE' },
        })}
      />,
    );
    expect(empty.container.querySelector('[data-xgc-role="robot-flight-metric-ruler"][data-xgc-id="mecanum-empty:left"]')?.textContent)
      .toBe('--m/s');
    expect(empty.container.querySelector('[data-xgc-role="robot-flight-metric-ruler"][data-xgc-id="mecanum-empty:right"]')?.textContent)
      .toBe('--m');
    expect(empty.container.querySelector('[data-xgc-role="robot-ground-instrument-command-lateral"]')?.textContent)
      .toMatch(/-- m\/s/);
    empty.unmount();
  });

  it('does not paint a minus on HUD VRPN height that rounds to 0.0', () => {
    const parked = render(
      <GroundRobotInstrument
        robotId="mecanum-01"
        name="Mecanum 01"
        chassisChrome="none"
        telemetry={telemetry({
          chassis: {},
          pose: { position: { x: 1,y: 2,z: -0.04 },orientation: { x: 0,y: 0,z: 0,w: 1 } },
        })}
      />,
    );
    expect(parked.container.querySelector('[data-xgc-role="robot-flight-metric-ruler"][data-xgc-id="mecanum-01:right"]')?.textContent)
      .toBe('0.0m');
    parked.unmount();
    const negative = render(
      <GroundRobotInstrument
        robotId="mecanum-01"
        name="Mecanum 01"
        chassisChrome="none"
        telemetry={telemetry({
          chassis: {},
          pose: { position: { x: 1,y: 2,z: -0.14 },orientation: { x: 0,y: 0,z: 0,w: 1 } },
        })}
      />,
    );
    expect(negative.container.querySelector('[data-xgc-role="robot-flight-metric-ruler"][data-xgc-id="mecanum-01:right"]')?.textContent)
      .toBe('-0.1m');
  });

  it('keeps header glyphs muted before a Run instead of painting missing VRPN red', () => {
    const { container } = render(
      <GroundRobotInstrument
        robotId="mecanum-01"
        name="Mecanum 01"
        chassisChrome="none"
        telemetry={telemetry({
          online: false,
          operationalReady: false,
          connectionState: 'idle',
          poseFresh: false,
          healthTone: 'idle',
          pose: {},
          velocity: {},
          commandVelocity: {},
          speed: {},
          power: {},
          chassis: {},
          health: {},
          streamHealth: { channels: [] },
        })}
      />,
    );
    const glyphs = [...container.querySelectorAll('.robot-instrument-status-glyph')];
    expect(glyphs.map((glyph) => glyph.getAttribute('data-xgc-tone')))
      .toEqual(['muted','muted','muted']);
    expect(container.querySelector('[data-xgc-role="robot-position-indicator"][data-xgc-id="mecanum-01"]'))
      .toHaveAttribute('aria-label', 'VRPN position unavailable');
    expect(container.querySelector('[data-xgc-role="robot-position-indicator"]'))
      .not.toHaveAttribute('data-xgc-tone', 'danger');
    expect(container.querySelector('[data-xgc-role="robot-ground-instrument-command-linear"]')?.textContent)
      .toMatch(/Vx/);
    expect(container.querySelector('[data-xgc-role="robot-ground-instrument-command-lateral"]')?.textContent)
      .toMatch(/Vy/);
    expect(container.querySelector('[data-xgc-role="robot-ground-instrument-command-angular"]')?.textContent)
      .toMatch(/ω/);
  });

  it('keeps battery percentage unavailable without Web estimation and keeps IMU connection on the icon', () => {
    const { container } = render(
      <GroundRobotInstrument
        robotId="scout-missing"
        name="Scout Missing"
        telemetry={telemetry({
          power: { percentageState:'PERCENTAGE_STATE_UNAVAILABLE',percentage:0.95,voltageV:11.1 },
          streamHealth: { channels: [
            { channelId: 'state.imu',sourceRateHz: 0 },
            { channelId: 'state.power',sourceRateHz: 1 },
          ] },
        })}
      />,
    );
    expect(container.querySelector('[data-xgc-role="robot-power-indicator"]')?.getAttribute('title'))
      .toBe('Battery 11.1 V; percentage unavailable');
    expect(container.querySelector('[data-xgc-role="robot-ground-power"] strong')?.textContent)
      .toBe('11.1 V');
    expect(container.querySelector(
      '[data-xgc-role="robot-ground-imu"] .robot-flight-frequency-value-compact',
    )?.textContent).toBe('-- Hz');
  });
});
