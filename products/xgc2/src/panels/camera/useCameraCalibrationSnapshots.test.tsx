// @vitest-environment jsdom

import { act,render } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { useCameraCalibrationImageSnapshot } from './useCameraCalibrationImageSnapshot';
import { useCameraCalibrationStateSnapshot } from './useCameraCalibrationStateSnapshot';

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,value: vi.fn(() => 'blob:camera-session'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true,value: vi.fn() });
});

describe('camera calibration event snapshots', () => {
  it('never exposes state owned by the previous session during an identity transition render', () => {
    const renders: Array<{ sessionKey: string;state: string | undefined }> = [];
    let updateState: (next: string | undefined) => void = () => undefined;
    const load = vi.fn(async () => 'loaded');

    function Probe({ sessionKey }: { sessionKey: string }) {
      const snapshot = useCameraCalibrationStateSnapshot({ sessionKey,enabled: false,revision: 0,load });
      updateState = (next) => { snapshot.setState(next); };
      renders.push({ sessionKey,state: snapshot.state });
      return null;
    }

    const view = render(<Probe sessionKey="session-a" />);
    act(() => updateState('state-a'));
    renders.length = 0;
    view.rerender(<Probe sessionKey="session-b" />);

    expect(renders.filter((entry) => entry.sessionKey === 'session-b'))
      .toEqual(expect.arrayContaining([{ sessionKey: 'session-b',state: undefined }]));
    expect(renders.some((entry) => entry.sessionKey === 'session-b' && entry.state === 'state-a')).toBe(false);
  });

  it('never exposes an object URL owned by the previous session during an identity transition render', async () => {
    const renders: Array<{ sessionKey: string;imageUrl: string }> = [];
    let refresh: () => Promise<void> = async () => undefined;
    const load = vi.fn(async () => new Blob(['frame']));

    function Probe({ sessionKey }: { sessionKey: string }) {
      const snapshot = useCameraCalibrationImageSnapshot({ sessionKey,load });
      refresh = snapshot.refresh;
      renders.push({ sessionKey,imageUrl: snapshot.imageUrl });
      return null;
    }

    const view = render(<Probe sessionKey="session-a" />);
    await act(async () => { await refresh(); });
    expect(renders.at(-1)).toEqual({ sessionKey: 'session-a',imageUrl: 'blob:camera-session' });
    renders.length = 0;
    view.rerender(<Probe sessionKey="session-b" />);

    expect(renders.filter((entry) => entry.sessionKey === 'session-b'))
      .toEqual(expect.arrayContaining([{ sessionKey: 'session-b',imageUrl: '' }]));
    expect(renders.some((entry) => entry.sessionKey === 'session-b' && entry.imageUrl === 'blob:camera-session'))
      .toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:camera-session');
  });

  it('keeps a detection image request alive and coalesces newer frame refreshes', async () => {
    const first = deferred<Blob>();
    const latest = deferred<Blob>();
    const signals: AbortSignal[] = [];
    const load = vi.fn((signal: AbortSignal) => {
      signals.push(signal);
      return signals.length === 1 ? first.promise : latest.promise;
    });
    const imageUrls = ['blob:first-detection','blob:latest-detection'];
    vi.mocked(URL.createObjectURL).mockImplementation(() => imageUrls.shift() ?? 'blob:unexpected');
    let refresh: () => Promise<void> = async () => undefined;
    let imageUrl = '';

    function Probe() {
      const snapshot = useCameraCalibrationImageSnapshot({ sessionKey:'session-a',load });
      refresh = snapshot.refresh;
      imageUrl = snapshot.imageUrl;
      return null;
    }

    render(<Probe />);
    act(() => { void refresh(); });
    await act(async () => { await Promise.resolve(); });
    expect(load).toHaveBeenCalledTimes(1);
    act(() => { void refresh();void refresh(); });
    expect(signals[0]?.aborted).toBe(false);

    await act(async () => { first.resolve(new Blob(['first'])); });
    expect(imageUrl).toBe('blob:first-detection');
    expect(load).toHaveBeenCalledTimes(2);
    expect(signals[0]?.aborted).toBe(false);

    await act(async () => { latest.resolve(new Blob(['latest'])); });
    expect(imageUrl).toBe('blob:latest-detection');
    expect(load).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first-detection');
  });

  it('aborts an annotated image request without surfacing teardown 409 errors', async () => {
    const pending = deferred<Blob>();
    let signal:AbortSignal | undefined;
    let refresh:() => Promise<void> = async () => undefined;
    let error = '';
    const load = vi.fn((nextSignal:AbortSignal) => {
      signal = nextSignal;
      return pending.promise;
    });

    function Probe({ enabled }:{ enabled:boolean }) {
      const snapshot = useCameraCalibrationImageSnapshot({
        sessionKey:'session-a',load,enabled,
      });
      refresh = snapshot.refresh;
      error = snapshot.error;
      return null;
    }

    const view = render(<Probe enabled />);
    act(() => { void refresh(); });
    await act(async () => { await Promise.resolve(); });
    expect(signal?.aborted).toBe(false);
    view.rerender(<Probe enabled={false} />);
    expect(signal?.aborted).toBe(true);
    await act(async () => { pending.reject(
      new Error('409 Conflict: trusted WebUI is not running and ready'),
    ); });
    expect(error).toBe('');
  });

  it('does not surface a live 409 when trusted WebUI is already gone', async () => {
    let error = '';
    let refresh:() => Promise<void> = async () => undefined;
    const load = vi.fn(async () => {
      throw new Error('409 Conflict: trusted WebUI is not running and ready');
    });

    function Probe() {
      const snapshot = useCameraCalibrationImageSnapshot({
        sessionKey:'session-a',load,enabled:true,
      });
      refresh = snapshot.refresh;
      error = snapshot.error;
      return null;
    }

    render(<Probe />);
    await act(async () => { await refresh(); });
    expect(error).toBe('');
  });

  it('does not surface a state 409 when trusted WebUI is already gone', async () => {
    let error = '';
    const load = vi.fn(async () => {
      throw new Error('409 Conflict: trusted WebUI is not running and ready');
    });

    function Probe() {
      const snapshot = useCameraCalibrationStateSnapshot({
        sessionKey:'session-a',enabled:true,revision:1,load,
      });
      error = snapshot.error;
      return null;
    }

    render(<Probe />);
    await act(async () => { await Promise.resolve(); });
    expect(error).toBe('');
  });

  it('reads state only on initial mount and execution revision changes', async () => {
    const load = vi.fn(async () => 'loaded');

    function Probe({ revision }: { revision: number }) {
      useCameraCalibrationStateSnapshot({ sessionKey:'session-a',enabled:true,revision,load });
      return null;
    }

    const view = render(<Probe revision={1} />);
    await act(async () => { await Promise.resolve(); });
    expect(load).toHaveBeenCalledTimes(1);
    view.rerender(<Probe revision={1} />);
    await act(async () => { await Promise.resolve(); });
    expect(load).toHaveBeenCalledTimes(1);
    view.rerender(<Probe revision={2} />);
    await act(async () => { await Promise.resolve(); });
    expect(load).toHaveBeenCalledTimes(2);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause:unknown) => void;
  const promise = new Promise<T>((onResolve,onReject) => {
    resolve = onResolve;reject = onReject;
  });
  return { promise,resolve,reject };
}
