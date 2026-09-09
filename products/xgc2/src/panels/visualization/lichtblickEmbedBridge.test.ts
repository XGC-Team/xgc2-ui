import { describe,expect,it } from 'vitest';
import {
  LICHTBLICK_EMBED_CHANNEL,
  LICHTBLICK_EMBED_SURFACES,
  LICHTBLICK_EMBED_VERSION,
  isLichtblickEmbedReadyMessage,
  lichtblickEmbedToggleSurfaceMessage,
} from './lichtblickEmbedBridge';

describe('lichtblickEmbedBridge', () => {
  const ready = {
    channel: LICHTBLICK_EMBED_CHANNEL,
    version: LICHTBLICK_EMBED_VERSION,
    sender: 'lichtblick',
    type: 'ready',
    capabilities: [...LICHTBLICK_EMBED_SURFACES],
    visibleSurfaces: [],
  };

  it('accepts only the versioned ready envelope and whitelisted capabilities', () => {
    expect(isLichtblickEmbedReadyMessage(ready)).toBe(true);
    expect(isLichtblickEmbedReadyMessage({ ...ready,version: 1 })).toBe(false);
    expect(isLichtblickEmbedReadyMessage({ ...ready,sender: 'xgc2' })).toBe(false);
    expect(isLichtblickEmbedReadyMessage({ ...ready,capabilities: ['extensions'] })).toBe(false);
    expect(isLichtblickEmbedReadyMessage({
      ...ready,
      capabilities: ['topics','topics'],
    })).toBe(false);
    expect(isLichtblickEmbedReadyMessage({ ...ready,extra: true })).toBe(false);
    expect(isLichtblickEmbedReadyMessage(Object.assign(Object.create(null), ready))).toBe(false);
    expect(isLichtblickEmbedReadyMessage([])).toBe(false);
    expect(isLichtblickEmbedReadyMessage({ ...ready,visibleSurfaces:['topics','topics'] })).toBe(false);
    expect(isLichtblickEmbedReadyMessage({ ...ready,capabilities:['topics'],visibleSurfaces:['variables'] })).toBe(false);
    expect(isLichtblickEmbedReadyMessage({ ...ready,visibleSurfaces:['topics','variables'] })).toBe(true);
    expect(isLichtblickEmbedReadyMessage({ ...ready,visibleSurfaces:['3d-tools'] })).toBe(true);
  });

  it('builds an exact whitelisted host command', () => {
    expect(lichtblickEmbedToggleSurfaceMessage('panel-controls')).toEqual({
      channel: LICHTBLICK_EMBED_CHANNEL,
      version: LICHTBLICK_EMBED_VERSION,
      sender: 'xgc2',
      type: 'toggle-surface',
      surface: 'panel-controls',
    });
    expect(lichtblickEmbedToggleSurfaceMessage('3d-tools')).toEqual({
      channel: LICHTBLICK_EMBED_CHANNEL,
      version: LICHTBLICK_EMBED_VERSION,
      sender: 'xgc2',
      type: 'toggle-surface',
      surface: '3d-tools',
    });
  });
});
