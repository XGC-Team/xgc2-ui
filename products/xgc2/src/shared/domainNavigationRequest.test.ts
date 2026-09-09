// @vitest-environment jsdom
import { afterEach,describe,expect,it,vi } from 'vitest';
import { createDomainNavigationRequest } from './domainNavigationRequest';

afterEach(() => vi.useRealTimers());

describe('domain source navigation acknowledgments', () => {
  it('opens a cold route once and waits for its consumer to accept the destination', async () => {
    const navigation = createDomainNavigationRequest<string>();
    const activate = vi.fn();
    const result = navigation.open('record-a', activate);
    expect(activate).toHaveBeenCalledTimes(1);
    const unregister = navigation.register(async (request) => {
      expect(request.destination).toBe('record-a');
      request.activate();
      return true;
    });
    await expect(result).resolves.toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
    unregister();
  });

  it('lets the mounted owner reject before changing page', async () => {
    const navigation = createDomainNavigationRequest<string>();
    const unregister = navigation.register(async () => false);
    const activate = vi.fn();
    await expect(navigation.open('missing', activate)).resolves.toBe(false);
    expect(activate).not.toHaveBeenCalled();
    unregister();
  });

  it('cancels a superseded read so it cannot activate the old source later', async () => {
    const navigation = createDomainNavigationRequest<string>();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const unregister = navigation.register(async (request) => {
      if (request.destination === 'old') await blocked;
      request.activate();
      return !request.signal.aborted;
    });
    const oldActivate = vi.fn();
    const first = navigation.open('old', oldActivate);
    await Promise.resolve();
    await expect(navigation.open('new', vi.fn())).resolves.toBe(true);
    await expect(first).resolves.toBe(false);
    release();
    await Promise.resolve();
    expect(oldActivate).not.toHaveBeenCalled();
    unregister();
  });

  it('releases failed lazy routes and unmounted consumers without claiming success', async () => {
    vi.useFakeTimers();
    const navigation = createDomainNavigationRequest<string>();
    const result = navigation.open('cold', vi.fn());
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(result).resolves.toBe(false);
    const unregister = navigation.register(async () => new Promise(() => {}));
    const mounted = navigation.open('mounted', vi.fn());
    unregister();
    await expect(mounted).resolves.toBe(false);
  });
});
