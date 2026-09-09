// @vitest-environment jsdom

import { act,renderHook } from '@testing-library/react';
import { describe,expect,it } from 'vitest';
import {
  dismissLocalGroundStationNotification,
  publishLocalGroundStationNotification,
  useLocalGroundStationNotifications,
} from './localGroundStationNotifications';
import { groundStationNotificationHidden,hideGroundStationNotification,useGroundStationAttention } from './groundStationAttention';

describe('local ground-station notifications', () => {
  it('delivers a recurring error after its previous occurrence was hidden and evicted from bounded history', () => {
    const targetId = `target-${crypto.randomUUID()}`;
    const input = { targetId,title: 'Host settings',message: 'Could not save',dedupeKey: 'settings-error' };
    const first = publishLocalGroundStationNotification(input)!;
    hideGroundStationNotification(first, targetId);
    for (let index = 0; index < 33; index += 1) publishLocalGroundStationNotification({ ...input,dedupeKey: `other-${index}` });
    const recurring = publishLocalGroundStationNotification(input)!;
    const receipts = renderHook(useGroundStationAttention);
    expect(recurring.id).not.toBe(first.id);
    expect(groundStationNotificationHidden(recurring, receipts.result.current, targetId)).toBe(false);
  });
  it('publishes, deduplicates, and dismisses panel errors through the shared toast inventory', () => {
    const targetId = `target-${crypto.randomUUID()}`;
    const view = renderHook(() => useLocalGroundStationNotifications(targetId));
    expect(view.result.current).toEqual([]);

    act(() => {
      publishLocalGroundStationNotification({
        targetId,title: 'Robot instruments',message: 'first failure',source: 'instrument-panel',dedupeKey: 'panel-state',
      });
      publishLocalGroundStationNotification({
        targetId,title: 'Robot instruments',message: 'latest failure',source: 'instrument-panel',dedupeKey: 'panel-state',
      });
    });

    expect(view.result.current).toHaveLength(1);
    expect(view.result.current[0]).toMatchObject({
      title: 'Robot instruments',message: 'latest failure',severity: 'error',presentation: 'toast',
    });
    act(() => dismissLocalGroundStationNotification(targetId, view.result.current[0]!.id));
    expect(view.result.current).toEqual([]);
  });
});
