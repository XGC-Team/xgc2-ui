// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GroundStationDraftPersistence, emptyGroundStationComposerDraft, groundStationComposerDraftKey, readGroundStationComposerDraft } from './groundStationComposerDraft';

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => vi.useRealTimers());
const draft = (text: string) => ({ ...emptyGroundStationComposerDraft(), text, updatedAt: 1 });

describe('ground station composer persistence', () => {
  it('uses the experiment and draft identity in the versioned key', () => {
    expect(groundStationComposerDraftKey('exp', 'draft')).toBe('xgc.ground-station.composer-drafts.v1.exp.draft');
  });
  it('debounces for 300 ms after the most recent edit', () => {
    const key = groundStationComposerDraftKey('exp', 'draft');
    const writer = new GroundStationDraftPersistence(localStorage, key);
    writer.schedule(draft('first'));
    vi.advanceTimersByTime(250);
    writer.schedule(draft('second'));
    vi.advanceTimersByTime(299);
    expect(localStorage.getItem(key)).toBeNull();
    vi.advanceTimersByTime(1);
    expect(readGroundStationComposerDraft(localStorage, key).text).toBe('second');
  });
  it('flushes immediately and preserves attachment/context slots', () => {
    const value = { ...draft('unsent'), attachments: [{ id: 'attachment-ref' }], context: [{ id: 'context-ref' }] };
    const writer = new GroundStationDraftPersistence(localStorage, 'key');
    writer.schedule(value);
    writer.flush();
    expect(readGroundStationComposerDraft(localStorage, 'key')).toEqual(value);
  });
  it('does not resurrect a cleared draft from a pending timer', () => {
    const writer = new GroundStationDraftPersistence(localStorage, 'key');
    writer.schedule(draft('sent'));
    writer.clear();
    vi.runAllTimers();
    expect(localStorage.getItem('key')).toBeNull();
  });
  it('rejects corrupt storage without crashing the editor', () => {
    localStorage.setItem('key', '{bad json');
    expect(readGroundStationComposerDraft(localStorage, 'key')).toEqual(emptyGroundStationComposerDraft());
  });
  it('retains its buffer after a quota error for a later flush', () => {
    const onError = vi.fn();
    const storage = { setItem: vi.fn().mockImplementationOnce(() => { throw new Error('Quota exceeded'); }), removeItem: vi.fn() };
    const writer = new GroundStationDraftPersistence(storage, 'key', onError);
    writer.schedule(draft('keep me'));
    writer.flush();
    expect(onError).toHaveBeenLastCalledWith('Quota exceeded');
    writer.flush();
    expect(storage.setItem).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenLastCalledWith('');
  });
});
