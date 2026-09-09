import { beforeEach,describe,expect,it,vi } from 'vitest';
import { consumeRequestedHostFilePath,requestedHostFilePath,requestHostFilePath,subscribeRequestedHostFilePath } from './hostFileNavigation';

describe('host file navigation requests', () => {
  beforeEach(() => { consumeRequestedHostFilePath(); });

  it('notifies an already mounted subscriber and allows the same folder to be requested again', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRequestedHostFilePath(listener);
    requestHostFilePath(' /home/operator/recordings ');
    expect(requestedHostFilePath()).toBe('/home/operator/recordings');
    expect(listener).toHaveBeenCalledTimes(1);
    consumeRequestedHostFilePath('/home/operator/recordings');
    requestHostFilePath('/home/operator/recordings');
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    consumeRequestedHostFilePath();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('does not let an older consumer erase a newer folder request', () => {
    requestHostFilePath('/first');
    requestHostFilePath('/second');
    expect(consumeRequestedHostFilePath('/first')).toBe('');
    expect(requestedHostFilePath()).toBe('/second');
    expect(consumeRequestedHostFilePath('/second')).toBe('/second');
    expect(requestedHostFilePath()).toBe('');
  });
});
