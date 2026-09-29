// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RobotInstrumentDetail } from './RobotInstrumentDetail';

const projection = {
  flight: false,
  mocapRotor: false,
  kindProjection: undefined,
  pose: {},
  poseChannel: undefined,
  mocap: undefined,
  localizationError: {},
  streamHealth: {},
  telemetryChannelIds: { pose: 'vrpn.position' },
} as never;

describe('RobotInstrumentDetail actions', () => {
  it('reuses the asset reachability icon and an SSH icon instead of Ping/SSH text', () => {
    const onPing = vi.fn();
    const onSsh = vi.fn();
    const { container } = render(
      <RobotInstrumentDetail
        robotId="scout-01"
        robot={{
          id: 'scout-01',
          robotAssetId: 'asset-scout-01',
          scout: { managementAddress: '192.168.51.201' },
        } as never}
        projection={projection}
        ping={{
          status: 'unreachable',
          result: {
            address: '192.168.51.201',
            reachable: false,
            latencyMs: 0,
            detail: 'no reply',
            checkedAt: '2026-09-10T00:00:00Z',
          },
        }}
        onPing={onPing}
        onSsh={onSsh}
      />,
    );
    const ping = container.querySelector<HTMLButtonElement>(
      '[data-xgc-role="robot-instrument-detail-ping"][data-xgc-id="scout-01"]',
    )!;
    const ssh = container.querySelector<HTMLButtonElement>(
      '[data-xgc-role="robot-instrument-detail-ssh"][data-xgc-id="scout-01"]',
    )!;
    expect(ping).toHaveAttribute('data-xgc-icon-only', 'true');
    expect(ping).toHaveClass('robot-asset-reachability');
    expect(ping).toHaveAttribute('data-xgc-state', 'danger');
    expect(ping).toHaveAttribute('data-xgc-check-state', 'unreachable');
    expect(ping.textContent).not.toMatch(/Ping/i);
    expect(ssh).toHaveAttribute('data-xgc-icon-only', 'true');
    expect(ssh).toHaveAttribute('aria-label', 'SSH');
    expect(ssh.textContent).not.toMatch(/SSH/);
    ping.click();
    ssh.click();
    expect(onPing).toHaveBeenCalledOnce();
    expect(onSsh).toHaveBeenCalledOnce();
  });
});
