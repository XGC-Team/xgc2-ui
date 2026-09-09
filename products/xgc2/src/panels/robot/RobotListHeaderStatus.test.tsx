// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe,expect,it } from 'vitest';
import { RobotListHeaderStatus } from './RobotListHeaderStatus';
import {
  LIST_HEADER_IMU_AGE_DANGER_MS,
  LIST_HEADER_IMU_AGE_WARNING_MS,
  imuAgeCommunicationStatus,
  listHeaderStatusItems,
} from './RobotListHeaderStatusModel';

const CORE_GLYPH_ROLES = [
  'robot-network-indicator',
  'robot-position-indicator',
  'robot-power-indicator',
];

describe('RobotListHeaderStatus', () => {
  it('renders three shared glyphs in communication, positioning, battery order', () => {
    const { container } = render(
      <RobotListHeaderStatus
        robotId="scout-03"
        items={listHeaderStatusItems({
          communication: {
            measurement: 'rtt',milliseconds: 18,
            source: 'diagnostic.fcu-link.roundTripTimeMs',
          },
          battery: {
            percentage: 0.82,voltageV:28.8,
            source: 'state.power.voltageV+percentageState+percentage',
          },
          position: {
            state: 'POSITIONING_STATE_STABLE',
            reason: 'POSITIONING_REASON_STATIONARY_WINDOW_STABLE',
            observedAgeMs: 20,windowSpreadM: 0.004,sampleCount: 12,
            source: 'state.health.positioning',
          },
        })}
      />,
    );
    const cluster = container.querySelector('[data-xgc-role="robot-list-header-status"]');
    expect(container.querySelector('[data-xgc-role="robot-list-header-trailing"]'))
      .toHaveAttribute('data-xgc-id', 'scout-03');
    expect(cluster).toHaveAttribute('data-xgc-id', 'scout-03');
    const glyphs = [...cluster?.querySelectorAll('.robot-instrument-status-glyph') ?? []];
    expect(glyphs.map((node) => node.getAttribute('data-xgc-role'))).toEqual(CORE_GLYPH_ROLES);
    expect(glyphs.map((node) => node.getAttribute('data-xgc-source'))).toEqual([
      'diagnostic.fcu-link.roundTripTimeMs',
      'state.health.positioning',
      'state.power.voltageV+percentageState+percentage',
    ]);
    expect(cluster?.querySelector('[data-xgc-role="robot-network-indicator"]'))
      .toHaveAttribute('aria-label', 'FCU round-trip time 18.0 ms');
    expect(cluster?.querySelector(
      '[data-xgc-role="robot-network-indicator"] .robot-instrument-connection-glyph',
    )).not.toBeNull();
    expect(cluster?.querySelector(
      '[data-xgc-role="robot-network-indicator"] .robot-instrument-connection-icon small',
    )).toBeNull();
    expect(cluster?.querySelector('.robot-instrument-wifi-icon')).toBeNull();
    expect(cluster?.querySelector('[data-xgc-role="robot-power-indicator"]'))
      .toHaveAttribute('title', 'Battery 82%; 28.8 V');
    expect(cluster?.querySelector('[data-xgc-role="robot-position-indicator"]')?.getAttribute('aria-label'))
      .toContain('VRPN positioning stable');
    expect(cluster?.querySelector('[data-xgc-role="robot-control-indicator"]')).toBeNull();
    expect(glyphs.map((node) => node.getAttribute('data-xgc-tone')))
      .toEqual(['success','success','success']);
    expect(cluster?.querySelectorAll('svg')).toHaveLength(3);
  });

  it('keeps communication, power, and position glyphs neutral and omits control when mode is missing', () => {
    const { container } = render(<RobotListHeaderStatus robotId="scout-01" items={listHeaderStatusItems({})} />);
    const glyphs = [...container.querySelectorAll('.robot-instrument-status-glyph')];
    expect(glyphs.map((node) => node.getAttribute('data-xgc-role'))).toEqual(CORE_GLYPH_ROLES);
    expect(glyphs.map((node) => node.getAttribute('data-xgc-tone')))
      .toEqual(['neutral','neutral','neutral']);
    expect(container.querySelector('[data-xgc-role="robot-network-indicator"]'))
      .toHaveAttribute('aria-label', 'Communication freshness unavailable');
    expect(container.querySelector('[data-xgc-role="robot-power-indicator"]'))
      .toHaveAttribute('aria-label', 'Battery status unavailable');
    expect(container.querySelector('[data-xgc-role="robot-control-indicator"]')).toBeNull();
  });

  it('maps adapter IMU receipt age with explicit warning and danger thresholds', () => {
    const fresh = imuAgeCommunicationStatus(
      { sourceAgeMs:100,stale:false },
      'diagnostic.stream-health.channels[state.imu].sourceAgeMs',
    )!;
    const warning = imuAgeCommunicationStatus({ sourceAgeMs:LIST_HEADER_IMU_AGE_WARNING_MS })!;
    const danger = imuAgeCommunicationStatus({ sourceAgeMs:LIST_HEADER_IMU_AGE_DANGER_MS })!;
    const stale = imuAgeCommunicationStatus({ sourceAgeMs:10,stale:true })!;
    const staleWithoutAge = imuAgeCommunicationStatus({ stale:true })!;

    expect(fresh).toMatchObject({
      measurement:'imu-age',milliseconds:100,
      source:'diagnostic.stream-health.channels[state.imu].sourceAgeMs',
    });
    expect(listHeaderStatusItems({ communication:fresh })[0]).toMatchObject({
      tone:'success',label:'Communication freshness from last IMU receipt age 100 ms',
    });
    expect(listHeaderStatusItems({ communication:warning })[0]?.tone).toBe('warning');
    expect(listHeaderStatusItems({ communication:danger })[0]?.tone).toBe('danger');
    expect(listHeaderStatusItems({ communication:stale })[0]?.tone).toBe('danger');
    expect(listHeaderStatusItems({ communication:staleWithoutAge })[0]).toMatchObject({
      tone:'danger',active:false,label:'Communication freshness from IMU age unavailable; stream stale',
    });
    expect(listHeaderStatusItems({ communication:fresh })[0]?.label).not.toMatch(/round-trip|RTT/i);
    expect(imuAgeCommunicationStatus(undefined)).toBeUndefined();
  });

  it('maps adapter positioning states without deriving health from Web pose freshness', () => {
    const stable = listHeaderStatusItems({ position:{
      state:'POSITIONING_STATE_STABLE',
      reason:'POSITIONING_REASON_STATIONARY_WINDOW_STABLE',
      observedAgeMs:20,windowSpreadM:0.003,sampleCount:12,
      source:'state.health.positioning',
    } })[1]!;
    expect(stable.tone).toBe('success');
    expect(stable.label).toContain('stationary window stable');
    expect(stable.label).toContain('age 20 ms');
    expect(stable.label).toContain('spread 0.003 m');
    expect(stable.label).toContain('12 samples');

    for (const state of ['POSITIONING_STATE_WARMING_UP','POSITIONING_STATE_JITTERING','POSITIONING_STATE_FROZEN']) {
      expect(listHeaderStatusItems({ position:{ state } })[1]?.tone).toBe('warning');
    }
    expect(listHeaderStatusItems({ position:{ state:'POSITIONING_STATE_ACTIVE' } })[1]).toMatchObject({
      tone:'success',active:true,
    });
    expect(listHeaderStatusItems({ position:{ state:'POSITIONING_STATE_ACTIVE' } })[1]?.label)
      .toContain('VRPN positioning active');
    expect(listHeaderStatusItems({ position:{ state:'POSITIONING_STATE_TIMED_OUT' } })[1]?.tone)
      .toBe('danger');
    expect(listHeaderStatusItems({ position:{ state:'POSITIONING_STATE_STABLE',stale:true } })[1]?.tone)
      .toBe('danger');
    expect(listHeaderStatusItems({ position:{ state:'POSITIONING_STATE_UNSPECIFIED' } })[1]).toMatchObject({
      tone:'neutral',active:false,label:'VRPN positioning unavailable',
    });
  });

  it('mutes header glyphs before a Run instead of painting missing VRPN as danger', () => {
    const items = listHeaderStatusItems({
      idle: true,
      communication: imuAgeCommunicationStatus({ sourceAgeMs: 2_000,stale: true }),
      battery: { percentage: 0.1,stale: true },
      position: { available: false,stale: true },
    });
    expect(items.map((item) => item.tone)).toEqual(['muted','muted','muted']);
    expect(items[1]).toMatchObject({
      role: 'robot-position-indicator',
      label: 'VRPN position unavailable',
    });
    expect(listHeaderStatusItems({
      position: { available: false,stale: true },
    })[1]?.tone).toBe('danger');
  });

  it('colors the battery glyph from displayed SoC and ignores stream stale', () => {
    const items = listHeaderStatusItems({
      communication: {
        measurement:'rtt',milliseconds:180,source:'diagnostic.fcu-link.roundTripTimeMs',
      },
      battery: { percentage:40,source:'state.power.percentageState+percentage' },
      position: { state:'POSITIONING_STATE_JITTERING',source:'state.health.positioning' },
    });
    expect(items.map((item) => item.tone)).toEqual(['danger','warning','danger']);
    expect(listHeaderStatusItems({ battery:{ percentage:95 } })[2]?.tone).toBe('success');
    expect(listHeaderStatusItems({ battery:{ percentage:1,stale:true } })[2]?.tone).toBe('success');
    expect(listHeaderStatusItems({ battery:{ percentage:51 } })[2]?.tone).toBe('warning');
    expect(listHeaderStatusItems({ battery:{ percentage:50 } })[2]?.tone).toBe('danger');
    expect(listHeaderStatusItems({ battery:{ percentage:52 } })[2]?.tone).toBe('info');
    expect(listHeaderStatusItems({
      communication:{ measurement:'rtt',milliseconds:null,connected:true,source:'diagnostic.fcu-link.roundTripTimeMs' },
    })[0]).toMatchObject({
      tone:'info',active:true,label:'Communication link connected',
    });
    expect(listHeaderStatusItems({ battery:{ voltageV:28.8 } })[2]).toMatchObject({
      tone:'info',active:true,label:'Battery 28.8 V; percentage unavailable',
    });
    expect(listHeaderStatusItems({
      battery:{ voltageV:28.8,stale:true },
      position:{ state:'POSITIONING_STATE_STABLE',stale:true },
    }).slice(1).map((item) => ({ tone:item.tone,label:item.label }))).toEqual([
      { tone:'danger',label:'VRPN positioning stable; stream stale' },
      { tone:'info',label:'Battery 28.8 V; percentage unavailable; stream stale' },
    ]);
  });
});
