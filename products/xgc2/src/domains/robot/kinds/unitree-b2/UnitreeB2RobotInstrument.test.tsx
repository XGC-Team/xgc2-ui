// @vitest-environment jsdom

import { render,screen } from '@testing-library/react';
import { describe,expect,it } from 'vitest';
import { UnitreeB2RobotInstrument } from './UnitreeB2RobotInstrument';
import type { B2RobotInstrumentTelemetry } from './instrumentModel';

describe('UnitreeB2RobotInstrument', () => {
  it('renders the frozen B2 semantics as live operator readouts', () => {
    const { container } = renderInstrument(telemetry());

    expect(screen.getByLabelText('B2 streams live')).toHaveTextContent('LIVE');
    expect(container.querySelector('.robot-b2-identity small')).toHaveTextContent('STANDING · HOLD');
    expect(screen.getByText('12 joints')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="robot-b2-instrument"]')).toHaveAttribute(
      'data-xgc-stream-state',
      'live',
    );
  });

  it('makes partial stream expiry explicit and returns to live without remounting', () => {
    const view = renderInstrument(telemetry());

    view.rerender(<UnitreeB2RobotInstrument
      robotId="b2-01"
      name="B2 01"
      telemetry={telemetry({
        poseFresh: false,
        speedStale: true,
        powerStale: true,
        locomotionStale: true,
        jointsStale: true,
      })}
    />);

    expect(screen.getByLabelText('B2 streams stale')).toHaveTextContent('STALE');
    expect(screen.getByText('POSE STALE')).toBeInTheDocument();
    expect(screen.getByText('ODOM SPEED STALE')).toBeInTheDocument();
    expect(screen.getByText('BMS STALE')).toBeInTheDocument();
    expect(view.container.querySelector('.robot-b2-identity small')).toHaveTextContent('LOCOMOTION STALE');
    expect(screen.getByText('12j STALE')).toBeInTheDocument();

    view.rerender(<UnitreeB2RobotInstrument robotId="b2-01" name="B2 01" telemetry={telemetry()} />);
    expect(screen.getByLabelText('B2 streams live')).toHaveTextContent('LIVE');
    expect(screen.queryByText(/STALE/)).toBeNull();
  });

  it('renders an offline adapter separately from a stale channel', () => {
    const { container } = renderInstrument(telemetry({ online: false,healthTone: 'unavailable' }));

    expect(screen.getByLabelText('B2 streams offline')).toHaveTextContent('OFF');
    expect(container.querySelector('[data-xgc-role="robot-b2-instrument"]')).toHaveAttribute(
      'data-xgc-stream-state',
      'offline',
    );
  });
});

function renderInstrument(value: B2RobotInstrumentTelemetry) {
  return render(<UnitreeB2RobotInstrument robotId="b2-01" name="B2 01" telemetry={value} />);
}

function telemetry(overrides: Partial<B2RobotInstrumentTelemetry> = {}): B2RobotInstrumentTelemetry {
  return {
    online: true,
    operationalReady: true,
    connectionState: 'live',
    poseFresh: true,
    velocityStale: false,
    speedStale: false,
    powerStale: false,
    locomotionStale: false,
    healthTone: 'healthy',
    pose: {
      position: { x: 1.2,y: -0.3,z: 0.55 },
      orientation: { x: 0,y: 0,z: 0,w: 1 },
    },
    velocity: { linear: { x: 0.4,y: 0,z: 0 },angular: { z: 0.1 } },
    speed: { metersPerSecond: 0.4 },
    power: { percentage: 72,voltageV: 48.1,currentA: -1.4 },
    health: { online: true,summary: 'ok',faults: [] },
    locomotion: { mode: 'standing',motionEnabled: false,commandStale: false },
    joints: { name: Array.from({ length: 12 },(_, index) => `joint_${index}`) },
    jointsStale: false,
    streamHealth: { channels: [
      { channelId: 'state.pose',sourceRateHz: 15 },
      { channelId: 'state.speed',sourceRateHz: 15 },
      { channelId: 'state.power',sourceRateHz: 2 },
    ] },
    link: { roundTripTimeMs: 8.5 },
    ...overrides,
  };
}
