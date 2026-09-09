// @vitest-environment jsdom

import { fireEvent,render } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { panelPrivateStateKey } from '../../../shared/panelPrivateState';
import { RobotInstrumentViewHeaderControl } from './robotInstrument';
import {
  defaultRobotInstrumentPageSizes,
  normalizeRobotInstrumentPageSize,
  normalizeRobotInstrumentPageSizes,
  normalizeRobotInstrumentViewMode,
  robotInstrumentPageSlice,
} from './robotInstrumentModel';

const scope = { experimentId: 'experiment-1',dashboardId: 'gcs',panelId: 'instruments-1' };
const viewKey = panelPrivateStateKey(scope, 'instrument.view');

function headerControl(overrides: Partial<typeof scope> = {}, editing = false) {
  return (
    <RobotInstrumentViewHeaderControl
      experimentId={overrides.experimentId ?? scope.experimentId}
      dashboardId={overrides.dashboardId ?? scope.dashboardId}
      panelId={overrides.panelId ?? scope.panelId}
      editing={editing}
    />
  );
}

describe('RobotInstrumentViewHeaderControl', () => {
  it('exposes stable responsive view buttons and publishes the selected mode', () => {
    window.localStorage.clear();
    const onPanelState = vi.fn();
    window.addEventListener('xgc-panel-state', onPanelState);
    const { container } = render(headerControl());
    expect(container.querySelector('[data-xgc-role="robot-instrument-view-switcher"]')).toHaveClass('xgc-panel-view-switcher');
    expect(container.querySelector('[data-xgc-role="robot-instrument-header-controls"]'))
      .toHaveAttribute('data-xgc-id', 'instruments-1');
    expect(container.querySelector('[data-xgc-role="robot-instrument-view-switcher"]'))
      .toHaveAttribute('data-xgc-id', 'instruments-1');
    // No second settings gear next to the panel frame config control.
    expect(container.querySelector('[data-xgc-role="robot-instrument-page-size-settings"]')).toBeNull();

    expect(container.querySelector('[data-xgc-role="robot-instrument-view"][data-xgc-id="double"]'))
      .toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('[data-xgc-role="robot-instrument-view"][data-xgc-id="list"]'))
      .toHaveAttribute('aria-pressed', 'false');

    for (const [id,label] of [['list','List'],['single','1 col'],['double','2 col'],['workflow','Workflow']] as const) {
      const button = container.querySelector<HTMLButtonElement>(
        `[data-xgc-role="robot-instrument-view"][data-xgc-id="${id}"]`,
      );
      expect(button).toHaveAccessibleName(label);
      expect(button?.querySelector('.xgc-panel-view-switcher-icon')).toHaveAttribute('aria-hidden', 'true');
      expect(button?.querySelector('.xgc-panel-view-switcher-label')).toHaveTextContent(label);
    }

    const single = container.querySelector<HTMLButtonElement>(
      '[data-xgc-role="robot-instrument-view"][data-xgc-id="single"]',
    )!;
    fireEvent.click(single);

    expect(single).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem(viewKey)).toBe('"single"');
    expect(onPanelState).toHaveBeenCalledTimes(1);
    expect((onPanelState.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ key: viewKey });
    window.removeEventListener('xgc-panel-state', onPanelState);
  });

  it('keeps every panel instance on its own view instead of one per experiment', () => {
    window.localStorage.clear();
    const left = render(headerControl({ panelId: 'instruments-1' }));
    const right = render(headerControl({ panelId: 'instruments-2' }));

    fireEvent.click(left.container.querySelector<HTMLButtonElement>(
      '[data-xgc-role="robot-instrument-view"][data-xgc-id="list"]',
    )!);

    expect(left.container.querySelector('[data-xgc-role="robot-instrument-view-switcher"]'))
      .toHaveAttribute('data-xgc-id', 'instruments-1');
    expect(right.container.querySelector('[data-xgc-role="robot-instrument-view-switcher"]'))
      .toHaveAttribute('data-xgc-id', 'instruments-2');
    expect(left.container.querySelector('[data-xgc-role="robot-instrument-view"][data-xgc-id="list"]'))
      .toHaveAttribute('aria-pressed', 'true');
    expect(right.container.querySelector('[data-xgc-role="robot-instrument-view"][data-xgc-id="list"]'))
      .toHaveAttribute('aria-pressed', 'false');
    expect(right.container.querySelector('[data-xgc-role="robot-instrument-view"][data-xgc-id="double"]'))
      .toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem(
      panelPrivateStateKey({ ...scope,panelId: 'instruments-2' }, 'instrument.view'),
    )).toBeNull();
  });

  it('accepts only current persisted view values and otherwise uses the double view', () => {
    window.localStorage.clear();
    window.localStorage.setItem(viewKey, JSON.stringify('list'));

    const persisted = render(headerControl());
    expect(persisted.container.querySelector('[data-xgc-role="robot-instrument-view"][data-xgc-id="list"]'))
      .toHaveAttribute('aria-pressed', 'true');
    persisted.unmount();

    window.localStorage.setItem(viewKey, JSON.stringify('obsolete'));

    const fallback = render(headerControl());
    expect(fallback.container.querySelector('[data-xgc-role="robot-instrument-view"][data-xgc-id="double"]'))
      .toHaveAttribute('aria-pressed', 'true');
  });

  it('does not mount a page-size gear in edit or run mode', () => {
    window.localStorage.clear();
    const editing = render(headerControl({}, true));
    expect(editing.container.querySelector('[data-xgc-role="robot-instrument-page-size-settings"]')).toBeNull();
    expect(editing.container.querySelector('[data-xgc-role="robot-instrument-page-size-menu"]')).toBeNull();
    editing.rerender(headerControl({}, false));
    expect(editing.container.querySelector('[data-xgc-role="robot-instrument-page-size-settings"]')).toBeNull();
  });
});

describe('robotInstrument page size model', () => {
  it('normalizes stored page sizes and view modes back onto the offered choices', () => {
    expect(normalizeRobotInstrumentPageSizes(undefined)).toEqual(defaultRobotInstrumentPageSizes);
    expect(normalizeRobotInstrumentPageSizes('nope')).toEqual(defaultRobotInstrumentPageSizes);
    expect(normalizeRobotInstrumentPageSize(7, 12)).toBe(6);
    expect(normalizeRobotInstrumentPageSize('nope', 12)).toBe(12);
    expect(normalizeRobotInstrumentPageSizes({ list: 4, single: 2, double: 8 }))
      .toEqual({ list: 4, single: 2, double: 8 });
    expect(normalizeRobotInstrumentViewMode('list')).toBe('list');
    expect(normalizeRobotInstrumentViewMode('obsolete')).toBe('double');
  });

  it('slices instruments by page size', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    expect(robotInstrumentPageSlice(items, 2, 0)).toEqual({
      items: ['a', 'b'], pageIndex: 0, pageCount: 3, pageSize: 2,
    });
    expect(robotInstrumentPageSlice(items, 2, 2)).toEqual({
      items: ['e'], pageIndex: 2, pageCount: 3, pageSize: 2,
    });
    expect(robotInstrumentPageSlice(items, 2, 9).pageIndex).toBe(2);
    expect(robotInstrumentPageSlice(items, undefined, 0).items).toEqual(items);
  });
});
