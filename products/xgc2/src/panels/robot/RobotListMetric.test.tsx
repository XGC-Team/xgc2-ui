// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe,expect,it } from 'vitest';
import { RobotListMetric,RobotListScalarValue,RobotListVectorValue } from './RobotListMetric';

describe('RobotListMetric', () => {
  it('keeps the current value and puts topic rate on the dt label row without a trend drawing', () => {
    const { container } = render(
      <dl>
        <RobotListMetric robotId="scout-01" slot="vrpn-pos" title="VRPN pos" unit="m" rate="50.0 Hz" role="robot-list-vector">
          <RobotListVectorValue value={{ x: 1.8,y: 0,z: 0.18 }} />
        </RobotListMetric>
        <RobotListMetric robotId="scout-01" slot="vrpn-spd" title="VRPN spd" rate="12.5 Hz" role="robot-list-scalar">
          <RobotListScalarValue value={-1.25} unit="m/s" />
        </RobotListMetric>
      </dl>,
    );

    expect(container.querySelectorAll('svg')).toHaveLength(0);
    expect(container.querySelectorAll('.robot-response-trend')).toHaveLength(0);

    const vector = container.querySelector('[data-xgc-role="robot-list-vector"]');
    expect(vector).toHaveAttribute('data-xgc-id', 'scout-01:vrpn-pos');
    const title = vector?.querySelector('dt [data-xgc-role="robot-list-metric-title"]');
    expect(title?.textContent).toBe('VRPN pos (m)');
    expect(title).toHaveAttribute('title', 'VRPN pos (m)');
    expect(title).toHaveAttribute('data-xgc-id', 'scout-01:vrpn-pos');
    expect(vector?.querySelector('dt [data-xgc-role="robot-list-metric-rate"]')?.textContent).toBe('50.0 Hz');
    expect(vector?.querySelector('dt [data-xgc-role="robot-list-metric-rate"]'))
      .toHaveAttribute('data-xgc-id', 'scout-01:vrpn-pos');
    expect(vector?.querySelector('[data-xgc-role="robot-list-metric-readout"]'))
      .toHaveAttribute('data-xgc-id', 'scout-01:vrpn-pos');
    expect(vector?.querySelector('dd .robot-list-metric-rate')).toBeNull();
    const axes = [...(vector?.querySelectorAll('[data-xgc-axis]') ?? [])];
    expect(axes.map((cell) => cell.getAttribute('data-xgc-axis'))).toEqual(['x', 'y', 'z']);
    expect(vector?.querySelector('.robot-metric-vector-axis-label')).toBeNull();
    expect(vector?.querySelector('[data-xgc-axis="x"]')).toHaveAttribute('aria-label', 'x 1.80');
    expect(vector?.querySelector('[data-xgc-axis="y"]')).toHaveAttribute('title', 'y: 0.00');
    expect(vector?.querySelector('[data-xgc-axis="x"] .robot-list-metric-digits')?.textContent).toBe('1.80');
    expect(vector?.querySelector('[data-xgc-axis="x"] .robot-metric-vector-int')?.textContent).toBe('1');
    expect(vector?.querySelector('[data-xgc-axis="x"] .robot-metric-vector-frac')?.textContent).toBe('80');
    expect(vector?.querySelector('[data-xgc-axis="y"] .robot-list-metric-digits')?.textContent).toBe('0.00');
    expect(vector?.querySelector('[data-xgc-axis="z"] .robot-list-metric-digits')?.textContent).toBe('0.18');
    expect(vector?.querySelector('[data-xgc-role="robot-list-metric-readout"]')?.textContent)
      .toBe('1.80 0.00 0.18');

    const scalar = container.querySelector('[data-xgc-role="robot-list-scalar"]');
    expect(scalar).toHaveAttribute('data-xgc-id', 'scout-01:vrpn-spd');
    expect(scalar?.querySelector('[data-xgc-role="robot-list-metric-title"]'))
      .toHaveAttribute('data-xgc-id', 'scout-01:vrpn-spd');
    expect(scalar?.querySelector('[data-xgc-role="robot-list-metric-rate"]'))
      .toHaveAttribute('data-xgc-id', 'scout-01:vrpn-spd');
    expect(scalar?.querySelector('[data-xgc-role="robot-list-metric-readout"]'))
      .toHaveAttribute('data-xgc-id', 'scout-01:vrpn-spd');
    expect(scalar?.querySelector('[data-xgc-role="robot-list-metric-title"]')?.textContent).toBe('VRPN spd');
    expect(scalar?.querySelector('dt [data-xgc-role="robot-list-metric-rate"]')?.textContent).toBe('12.5 Hz');
    expect(scalar?.querySelector('dd .robot-list-metric-rate')).toBeNull();
    expect(scalar?.querySelector('.robot-list-metric-sign')?.textContent).toBe('-');
    expect(scalar?.querySelector('.robot-list-metric-digits')?.textContent).toBe('1.25');
    expect(scalar?.querySelector('.robot-list-metric-unit')?.textContent).toBe(' m/s');
    expect(scalar?.querySelector('[data-xgc-role="robot-list-metric-readout"]')?.textContent).toMatch(/m\/s/);
    const titleIds = [...container.querySelectorAll('[data-xgc-role="robot-list-metric-title"]')]
      .map((node) => node.getAttribute('data-xgc-id'));
    expect(titleIds).toEqual(['scout-01:vrpn-pos', 'scout-01:vrpn-spd']);
    expect(new Set(titleIds).size).toBe(titleIds.length);
  });

  it('keeps the same sign/digits tracks when Battery vol is empty or numeric', () => {
    const empty = render(<RobotListScalarValue value={null} unit="V" digits={1} />);
    const emptyValue = empty.container.querySelector('.robot-list-metric-value');
    expect(emptyValue).toHaveAttribute('data-xgc-empty', 'true');
    expect(emptyValue?.querySelector('.robot-list-metric-sign')).not.toBeNull();
    expect(emptyValue?.querySelector('.robot-list-metric-digits')?.textContent).toBe('--');
    expect(emptyValue?.querySelector('.robot-list-metric-digits')).toHaveStyle({ minWidth: '4ch' });
    expect(emptyValue?.querySelector('.robot-list-metric-unit')?.textContent).toBe(' V');
    empty.unmount();

    const live = render(<RobotListScalarValue value={28.8} unit="V" digits={1} />);
    const liveValue = live.container.querySelector('.robot-list-metric-value');
    expect(liveValue?.getAttribute('data-xgc-empty')).toBeNull();
    expect(liveValue?.querySelector('.robot-list-metric-digits')?.textContent).toBe('28.8');
    expect(liveValue?.querySelector('.robot-list-metric-digits')).toHaveStyle({ minWidth: '4ch' });
    expect(liveValue?.querySelector('.robot-list-metric-unit')?.textContent).toBe(' V');
    live.unmount();
  });

  it('renders three fixed numeric tracks without visible axis letters', () => {
    const empty = render(<RobotListVectorValue value={{}} />);
    const emptyAxes = [...empty.container.querySelectorAll('[data-xgc-axis]')];
    expect(empty.container.querySelector('.robot-metric-vector-value')).toHaveAttribute('data-xgc-empty', 'true');
    expect(emptyAxes.map((cell) => cell.getAttribute('data-xgc-axis'))).toEqual(['x', 'y', 'z']);
    for (const cell of emptyAxes) {
      expect(cell.querySelector('.robot-metric-vector-axis-label')).toBeNull();
      expect(cell).toHaveAttribute('aria-label', `${cell.getAttribute('data-xgc-axis')} unavailable`);
      expect(cell).toHaveAttribute('title', `${cell.getAttribute('data-xgc-axis')}: unavailable`);
      expect(cell.querySelector('.robot-list-metric-sign')).toHaveAttribute('data-xgc-sign', 'none');
      expect(cell.querySelector('.robot-list-metric-digits')?.textContent).toBe('--');
      expect(cell.textContent).toBe('--');
    }
    expect(empty.container.querySelector('[data-xgc-role="robot-list-metric-readout"], .robot-metric-vector-value')?.textContent)
      .toBe('-- -- --');
    empty.unmount();

    const mixed = render(<RobotListVectorValue value={{ x: -123.45, y: 0, z: 1000.5 }} />);
    expect(mixed.container.querySelector('.robot-metric-vector-value')?.getAttribute('data-xgc-empty')).toBeNull();
    expect(mixed.container.querySelector('[data-xgc-axis="x"] .robot-list-metric-sign')).toHaveAttribute('data-xgc-sign', 'minus');
    expect(mixed.container.querySelector('[data-xgc-axis="x"] .robot-list-metric-digits')?.textContent).toBe('123.45');
    expect(mixed.container.querySelector('[data-xgc-axis="x"]')).toHaveAttribute('aria-label', 'x -123.45');
    expect(mixed.container.querySelector('[data-xgc-axis="y"] .robot-list-metric-sign')).toHaveAttribute('data-xgc-sign', 'none');
    expect(mixed.container.querySelector('[data-xgc-axis="y"] .robot-list-metric-digits')?.textContent).toBe('0.00');
    expect(mixed.container.querySelector('[data-xgc-axis="z"] .robot-list-metric-digits')?.textContent).toBe('1000.50');
    expect(mixed.container.querySelector('.robot-metric-vector-value')?.textContent).toBe('-123.45 0.00 1000.50');
    expect(mixed.container.querySelectorAll('.robot-metric-vector-axis-label')).toHaveLength(0);
    mixed.unmount();
  });

  it('omits plus and leading integer zeros while keeping two fraction digits and spaces', () => {
    const { container } = render(<RobotListVectorValue value={{ x: -0.6, y: -2.54, z: 0.05 }} />);
    expect(container.querySelector('.robot-metric-vector-value')?.textContent).toBe('-0.60 -2.54 0.05');
    expect(container.querySelector('.robot-metric-vector-value')?.textContent).not.toMatch(/\+/);
    expect(container.querySelector('[data-xgc-axis="x"] .robot-list-metric-sign')).toHaveAttribute('data-xgc-sign', 'minus');
    expect(container.querySelector('[data-xgc-axis="z"] .robot-list-metric-sign')).toHaveAttribute('data-xgc-sign', 'none');
    expect(container.querySelector('[data-xgc-axis="x"] .robot-list-metric-digits')?.textContent).toBe('0.60');
    expect(container.querySelector('[data-xgc-axis="x"] .robot-metric-vector-int')?.textContent).toBe('0');
    expect(container.querySelector('[data-xgc-axis="x"] .robot-metric-vector-frac')?.textContent).toBe('60');
    expect(container.querySelector('[data-xgc-axis="y"] .robot-list-metric-digits')?.textContent).toBe('2.54');
    expect(container.querySelector('[data-xgc-axis="z"] .robot-list-metric-digits')?.textContent).toBe('0.05');
    expect(container.querySelector('[data-xgc-axis="z"] .robot-metric-vector-frac')?.textContent).toBe('05');
  });

  it('places a real space between three equal axis hosts without spacing the minus from its digits', () => {
    const { container } = render(<RobotListVectorValue value={{ x: -0.6, y: 12.04, z: -0.004 }} />);
    const vector = container.querySelector('.robot-metric-vector-value');
    const gaps = [...(vector?.querySelectorAll('.robot-metric-vector-gap') ?? [])];
    expect(vector?.textContent).toBe('-0.60 12.04 -0.00');
    expect(vector?.textContent).not.toMatch(/-\s/);
    expect(gaps).toHaveLength(2);
    expect(gaps.every((node) => node.textContent === ' ')).toBe(true);
    expect(vector?.querySelector('[data-xgc-axis="x"]')?.textContent).toBe('-0.60');
    expect(vector?.querySelector('[data-xgc-axis="y"]')?.textContent).toBe('12.04');
    expect(vector?.querySelector('[data-xgc-axis="z"]')?.textContent).toBe('-0.00');
  });

  it('retains visible axis labels only for the non-list instrument presentation', () => {
    const instrument = render(<RobotListVectorValue value={{ x:1,y:2,z:3 }} showAxisLabels />);
    expect([...instrument.container.querySelectorAll('.robot-metric-vector-axis-label')]
      .map((node) => node.textContent)).toEqual(['x','y','z']);
    for (const label of instrument.container.querySelectorAll('.robot-metric-vector-axis-label')) {
      expect(label).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('puts value and frequency on separate readout and rate tracks', () => {
    const long = render(
      <dl>
        <RobotListMetric robotId="scout-01" slot="yaw" title="Yaw" rate="119.0 Hz" role="robot-list-yaw">
          <RobotListScalarValue value={-359.99} />
        </RobotListMetric>
        <RobotListMetric robotId="scout-01" slot="battery-vol" title="Battery vol" rate="-- Hz" role="robot-list-empty">
          <RobotListScalarValue value={null} digits={1} />
        </RobotListMetric>
      </dl>,
    );
    const yaw = long.container.querySelector('[data-xgc-role="robot-list-yaw"]');
    expect(yaw?.querySelector('[data-xgc-role="robot-list-metric-readout"] .robot-list-metric-digits')?.textContent)
      .toBe('359.99');
    expect(yaw?.querySelector('dt [data-xgc-role="robot-list-metric-rate"]')?.textContent).toBe('119.0 Hz');
    expect(yaw?.querySelector('dd [data-xgc-role="robot-list-metric-rate"]')).toBeNull();
    const empty = long.container.querySelector('[data-xgc-role="robot-list-empty"]');
    expect(empty?.querySelector('[data-xgc-role="robot-list-metric-readout"] .robot-list-metric-digits')?.textContent)
      .toBe('--');
    expect(empty?.querySelector('[data-xgc-role="robot-list-metric-rate"]')?.textContent).toBe('-- Hz');
    long.unmount();
  });
});
