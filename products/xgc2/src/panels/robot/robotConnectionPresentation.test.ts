import { describe,expect,it } from 'vitest';
import {
  b2CoreSubscriptionReady,
  CONNECTION_RELEASE_DETAIL,
  CONNECTION_ROLLBACK_DETAIL_PREFIX,
  groundCoreSubscriptionReady,
  px4CoreSubscriptionReady,
  robotConnectionLifecycleKind,
  robotConnectionPresentation,
} from './robotConnectionPresentation';

describe('robotConnectionPresentation', () => {
  it('classifies A1 ConnectionLifecycleKindOf rows without inferring stop from closed', () => {
    expect(robotConnectionLifecycleKind({ connectionState: '' })).toBe('idle');
    expect(robotConnectionLifecycleKind({ connectionState: 'inactive' })).toBe('idle');
    expect(robotConnectionLifecycleKind({ connectionState: 'opening' })).toBe('opening');
    expect(robotConnectionLifecycleKind({ connectionState: 'live' })).toBe('live');
    expect(robotConnectionLifecycleKind({
      connectionState: 'revoked',
      connectionDetail: CONNECTION_RELEASE_DETAIL,
    })).toBe('user-stop');
    expect(robotConnectionLifecycleKind({
      connectionState: 'revoked',
      connectionDetail: `${CONNECTION_ROLLBACK_DETAIL_PREFIX}source invalid`,
    })).toBe('rollback');
    expect(robotConnectionLifecycleKind({
      connectionState: 'closed',
      connectionDetail: 'robot telemetry source closed',
    })).toBe('source-loss');
    expect(robotConnectionLifecycleKind({
      connectionState: 'revoked',
      connectionDetail: 'recovering missing telemetry route',
    })).toBe('unknown');
  });

  it('treats no run, idle, and user-stop as disconnected', () => {
    expect(robotConnectionPresentation({ hasRun: false,connectionState: 'live',coreReady: true }))
      .toBe('disconnected');
    expect(robotConnectionPresentation({ connectionState: 'inactive',coreReady: true }))
      .toBe('disconnected');
    expect(robotConnectionPresentation({
      connectionState: 'revoked',
      connectionDetail: CONNECTION_RELEASE_DETAIL,
      coreReady: true,
    })).toBe('disconnected');
  });

  it('treats completed source-loss the same as never connected', () => {
    expect(robotConnectionPresentation({ connectionState: 'closed',coreReady: true }))
      .toBe('disconnected');
    expect(robotConnectionPresentation({
      connectionState: 'closed',
      connectionDetail: 'robot telemetry source closed',
      coreReady: false,
    })).toBe('disconnected');
  });

  it('treats opening, rollback, and unknown revoked as recovering', () => {
    expect(robotConnectionPresentation({ connectionState: 'opening',coreReady: false }))
      .toBe('recovering');
    expect(robotConnectionPresentation({ connectionState: 'opening',coreReady: true }))
      .toBe('recovering');
    expect(robotConnectionPresentation({
      connectionState: 'revoked',
      connectionDetail: `${CONNECTION_ROLLBACK_DETAIL_PREFIX}source invalid`,
      coreReady: true,
    })).toBe('recovering');
    expect(robotConnectionPresentation({
      connectionState: 'revoked',
      connectionDetail: 'recovering missing telemetry route',
      coreReady: false,
    })).toBe('recovering');
    expect(robotConnectionPresentation({ connectionState: 'live',coreReady: false }))
      .toBe('recovering');
    expect(robotConnectionPresentation({ connectionState: 'live',coreReady: true }))
      .toBe('connected');
  });

  it('does not treat RTT as PX4 core readiness', () => {
    expect(px4CoreSubscriptionReady({
      flight: { connected: true },
      streamHealth: { channels: [{ channelId: 'diagnostic.fcu-link',sourceAgeMs: 0,stale: false }] },
    })).toBe(false);
    expect(px4CoreSubscriptionReady({
      flight: { connected: true },
      streamHealth: { channels: [{ channelId: 'state.imu',stale: false }] },
    })).toBe(true);
    expect(px4CoreSubscriptionReady({
      flight: { connected: false },
      streamHealth: { channels: [{ channelId: 'state.imu',stale: false }] },
    })).toBe(false);
  });

  it('uses IMU freshness for ground and link presence for B2', () => {
    expect(groundCoreSubscriptionReady({
      channels: [{ channelId: 'state.imu',sourceAgeMs: 40,stale: false }],
    })).toBe(true);
    expect(groundCoreSubscriptionReady({
      channels: [{ channelId: 'state.imu',stale: true }],
    })).toBe(false);
    expect(groundCoreSubscriptionReady({})).toBe(false);
    expect(groundCoreSubscriptionReady({
      channels: [
        { channelId: 'state.imu',sourceAgeMs: 40,stale: false },
        { channelId: 'state.controller',stale: true },
      ],
    })).toBe(true);
    expect(px4CoreSubscriptionReady({
      flight: { connected: true },
      streamHealth: { channels: [
        { channelId: 'state.imu',stale: false },
        { channelId: 'state.controller',stale: true },
      ] },
    })).toBe(true);
    expect(b2CoreSubscriptionReady({ stale: false })).toBe(true);
    expect(b2CoreSubscriptionReady({ stale: true })).toBe(false);
    expect(b2CoreSubscriptionReady(undefined)).toBe(false);
  });
});
