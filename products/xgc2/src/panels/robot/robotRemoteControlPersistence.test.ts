// @vitest-environment jsdom

import { beforeEach,describe,expect,it } from 'vitest';
import {
  clearPersistedRemoteControllers,
  patchPersistedRemoteController,
  persistPressed,
  readPersistedRemoteController,
  readPersistedRemoteControllers,
  remoteControlStorageKey,
  syncPersistedRemoteControllers,
} from './robotRemoteControlPersistence';

const experimentId = 'experiment-a';
const panelId = 'robot-control';
const key = remoteControlStorageKey(experimentId, panelId);

describe('robot remote control persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('names the experiment and panel in the storage key', () => {
    expect(key).toBe('xgc.experiment.experiment-a.panel.robot-control.remote-control.v1');
    expect(remoteControlStorageKey('  ','')).toBe('xgc.experiment.default.panel.default.remote-control.v1');
  });

  it('round-trips open controllers and drops them when the list is empty', () => {
    syncPersistedRemoteControllers(experimentId, panelId, [
      { id: 'window-1', robots: [{ id: 'scout-01', name: 'scout-01' }] },
    ]);
    patchPersistedRemoteController(experimentId, panelId, 'window-1', {
      gear: 2,
      pressed: ['forward','left','forward'],
      origin: { left: 40, top: 80 },
    });
    expect(readPersistedRemoteController(experimentId, panelId, 'window-1')).toEqual({
      id: 'window-1',
      robots: [{ id: 'scout-01', name: 'scout-01' }],
      gear: 2,
      pressed: ['forward','left'],
      origin: { left: 40, top: 80 },
    });
    syncPersistedRemoteControllers(experimentId, panelId, []);
    expect(window.localStorage.getItem(key)).toBeNull();
    expect(readPersistedRemoteControllers(experimentId, panelId)).toEqual([]);
  });

  it('keeps view state for a still-open controller and forgets a closed one', () => {
    syncPersistedRemoteControllers(experimentId, panelId, [
      { id: 'window-1', robots: [{ id: 'scout-01', name: 'scout-01' }] },
      { id: 'window-2', robots: [{ id: 'px4-01', name: 'px4-01' }] },
    ]);
    patchPersistedRemoteController(experimentId, panelId, 'window-1', { pressed: ['forward'] });
    patchPersistedRemoteController(experimentId, panelId, 'window-2', { gear: 3, pressed: ['yaw-left'] });
    syncPersistedRemoteControllers(experimentId, panelId, [
      { id: 'window-2', robots: [{ id: 'px4-01', name: 'PX4 1' }] },
    ]);
    expect(readPersistedRemoteControllers(experimentId, panelId)).toEqual([
      {
        id: 'window-2',
        robots: [{ id: 'px4-01', name: 'PX4 1' }],
        gear: 3,
        pressed: ['yaw-left'],
        origin: null,
      },
    ]);
  });

  it('ignores malformed storage instead of restoring a fake controller', () => {
    window.localStorage.setItem(key, '{');
    expect(readPersistedRemoteControllers(experimentId, panelId)).toEqual([]);
    window.localStorage.setItem(key, JSON.stringify({ v: 2, controllers: [{ id: 'window-1' }] }));
    expect(readPersistedRemoteControllers(experimentId, panelId)).toEqual([]);
    window.localStorage.setItem(key, JSON.stringify({
      v: 1,
      controllers: [{ id: 'window-1', robots: [], gear: 1, pressed: [], origin: null }],
    }));
    expect(readPersistedRemoteControllers(experimentId, panelId)).toEqual([]);
  });

  it('does not persist against an empty experiment or panel identity', () => {
    syncPersistedRemoteControllers('', panelId, [
      { id: 'window-1', robots: [{ id: 'scout-01', name: 'scout-01' }] },
    ]);
    expect(window.localStorage.getItem(remoteControlStorageKey('', panelId))).toBeNull();
    expect(readPersistedRemoteControllers('', panelId)).toEqual([]);
  });

  it('clears the stored controllers for an experiment panel', () => {
    syncPersistedRemoteControllers(experimentId, panelId, [
      { id: 'window-1', robots: [{ id: 'scout-01', name: 'scout-01' }] },
    ]);
    clearPersistedRemoteControllers(experimentId, panelId);
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it('canonicalizes pressed directions in axis order', () => {
    expect(persistPressed(['yaw-right','forward','left','forward'])).toEqual([
      'forward','left','yaw-right',
    ]);
  });
});
