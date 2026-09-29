// @vitest-environment jsdom

import { renderHook,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { useExperimentAgentViewCapture } from './useExperimentAgentViewCapture';

const mocks = vi.hoisted(() => ({
  poll: vi.fn(),
  fulfill: vi.fn(),
  capture: vi.fn(),
  retry: vi.fn(),
}));

vi.mock('./experimentAgentViewService', () => ({
  pollExperimentAgentViewJob: mocks.poll,
  fulfillExperimentAgentViewJob: mocks.fulfill,
  waitForExperimentAgentViewRetry: mocks.retry,
}));
vi.mock('./agentViewCapture', () => ({
  captureExperimentPanel: mocks.capture,
  captureErrorCode: () => 'panel_not_visible',
}));

describe('useExperimentAgentViewCapture', () => {
  beforeEach(() => {
    mocks.poll.mockReset();
    mocks.fulfill.mockReset();
    mocks.capture.mockReset();
    mocks.retry.mockReset().mockResolvedValue(undefined);
  });

  it('captures a panel job and posts the JPEG', async () => {
    mocks.poll.mockResolvedValueOnce({ job: { id: 'job-1', panelId: 'instruments', pluginId: 'robot-instruments-grid', view: 'panel' }, delegated: true });
    mocks.poll.mockImplementation(() => new Promise(() => undefined));
    mocks.capture.mockResolvedValue({ jpegBase64: 'abc', width: 32, height: 16, kind: 'panel' });
    mocks.fulfill.mockResolvedValue(undefined);
    const view = renderHook(() => useExperimentAgentViewCapture('experiment-a'));
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledWith('instruments', 'panel', 'robot-instruments-grid', { signal: expect.any(AbortSignal) }));
    await waitFor(() => expect(mocks.fulfill).toHaveBeenCalledWith('experiment-a', 'job-1', {
      jpegBase64: 'abc', width: 32, height: 16, kind: 'panel',
    }));
    view.unmount();
  });

  it('posts a capture error when the panel is not visible', async () => {
    mocks.poll.mockResolvedValueOnce({ job: { id: 'job-2', panelId: 'missing', pluginId: 'robot-instruments-grid', view: 'panel' }, delegated: true });
    mocks.poll.mockImplementation(() => new Promise(() => undefined));
    mocks.capture.mockRejectedValue(new Error('missing'));
    mocks.fulfill.mockResolvedValue(undefined);
    const view = renderHook(() => useExperimentAgentViewCapture('experiment-a'));
    await waitFor(() => expect(mocks.fulfill).toHaveBeenCalledWith('experiment-a', 'job-2', { code: 'panel_not_visible' }));
    await waitFor(() => expect(mocks.retry).toHaveBeenCalledWith(750));
    view.unmount();
  });

  it('does not report a transport failure as a panel capture failure', async () => {
    mocks.poll.mockResolvedValueOnce({ job: { id: 'job-3', panelId: 'instruments', pluginId: 'robot-instruments-grid', view: 'panel' }, delegated: true });
    mocks.poll.mockImplementation(() => new Promise(() => undefined));
    const shot = { jpegBase64: 'abc', width: 32, height: 16, kind: 'panel' };
    mocks.capture.mockResolvedValue(shot);
    mocks.fulfill.mockRejectedValue(new Error('request disconnected'));
    const view = renderHook(() => useExperimentAgentViewCapture('experiment-a'));
    await waitFor(() => expect(mocks.retry).toHaveBeenCalledWith(750));
    expect(mocks.fulfill).toHaveBeenCalledTimes(1);
    expect(mocks.fulfill).toHaveBeenCalledWith('experiment-a', 'job-3', shot);
    view.unmount();
  });

  it('stays idle without a live delegation instead of holding a request', async () => {
    mocks.poll.mockResolvedValueOnce({ job: null, delegated: false });
    mocks.poll.mockImplementation(() => new Promise(() => undefined));
    const view = renderHook(() => useExperimentAgentViewCapture('experiment-a'));
    await waitFor(() => expect(mocks.retry).toHaveBeenCalledWith(5000));
    await waitFor(() => expect(mocks.poll).toHaveBeenCalledTimes(2));
    expect(mocks.capture).not.toHaveBeenCalled();
    view.unmount();
  });

  it('parks again at once while a delegation is live', async () => {
    mocks.poll.mockResolvedValueOnce({ job: null, delegated: true });
    mocks.poll.mockImplementation(() => new Promise(() => undefined));
    const view = renderHook(() => useExperimentAgentViewCapture('experiment-a'));
    await waitFor(() => expect(mocks.poll).toHaveBeenCalledTimes(2));
    expect(mocks.retry).not.toHaveBeenCalled();
    view.unmount();
  });
});
