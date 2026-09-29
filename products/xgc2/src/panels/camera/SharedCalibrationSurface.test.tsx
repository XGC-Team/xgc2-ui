// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedSurfaceClient, SharedSurfaceProjection } from '../../shared/sharedSurface';
import { SharedCalibrationSurface } from './SharedCalibrationSurface';

vi.mock('../../domains/execution/executionPublic', () => {
  throw new Error('Scoped calibration must not load station execution stores');
});

const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();

const STATE_ENDPOINT = 'calibration.state';
const IMAGE_ENDPOINT = 'calibration.image';

function projection(overrides: Partial<SharedSurfaceProjection> = {}): SharedSurfaceProjection {
  return {
    contractVersion: 1, moduleId: 'experiment.calibration-readonly', viewContractVersion: 1,
    entryId: 'entry-cal', name: 'Lab calibration', expiresAt: '2030-01-01T00:00:00Z',
    actions: ['surface.read', 'calibration.state.read', 'calibration.image.read'],
    surface: { kind: 'experiment-panel', experimentId: 'experiment-a', sessionId: 'run-a', panelId: 'panel-a' },
    panel: { id: 'panel-a', pluginId: 'camera-intrinsic-calibration', title: 'Camera calibration' },
    endpoints: [
      { id: STATE_ENDPOINT, method: 'GET', path: '/api/access/entry/calibration/state', protocol: 'http', action: 'calibration.state.read' },
      { id: IMAGE_ENDPOINT, method: 'GET', path: '/api/access/entry/calibration/image.jpg', protocol: 'http', action: 'calibration.image.read' },
    ],
    ...overrides,
  };
}

function stateBody(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'intrinsic', phase: 'collecting', session_revision: 3, collection_revision: 5, samples: 7,
    goodenough: true, image_ready: true, result_restored: false, ...overrides,
  };
}

function imageResponse() {
  return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/jpeg' } });
}

function client() {
  return { request: vi.fn<SharedSurfaceClient['request']>() };
}

function mockDefaults(transport: ReturnType<typeof client>, stateOverrides: Record<string, unknown> = {}) {
  transport.request.mockImplementation(async (endpointId: string) => {
    if (endpointId === STATE_ENDPOINT) return Response.json(stateBody(stateOverrides));
    if (endpointId === IMAGE_ENDPOINT) return imageResponse();
    throw new Error(`unexpected request ${endpointId}`);
  });
}

beforeEach(() => {
  createObjectURL.mockReset().mockReturnValue('blob:detection-a');
  revokeObjectURL.mockReset();
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = revokeObjectURL;
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SharedCalibrationSurface', () => {
  it('grants both endpoints: reads state into facts, fetches the detection image, and issues no write or foreign requests', async () => {
    const transport = client();
    mockDefaults(transport);
    render(<SharedCalibrationSurface projection={projection()} client={transport} />);
    await screen.findByText('7');
    await screen.findAllByText('Collecting samples');
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledOnce());
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:detection-a');
    expect(transport.request.mock.calls.map((call) => call[0])).toEqual([STATE_ENDPOINT, IMAGE_ENDPOINT]);
    const ids = transport.request.mock.calls.map((call) => call[0]);
    expect(ids).toContain(STATE_ENDPOINT);
    expect(ids).toContain(IMAGE_ENDPOINT);
    expect(new Set(ids).size).toBeLessThanOrEqual(2);
    for (const call of transport.request.mock.calls) {
      expect(call[1]).not.toHaveProperty('body');
    }
  });

  it('image-only grant reads the image independently and never requests state', async () => {
    const transport = client();
    mockDefaults(transport);
    render(<SharedCalibrationSurface projection={projection({
      actions: ['surface.read', 'calibration.image.read'],
      endpoints: [{ id: IMAGE_ENDPOINT, method: 'GET', path: '/api/access/entry/calibration/image.jpg', protocol: 'http', action: 'calibration.image.read' }],
    })} client={transport} />);
    await screen.findByText('This entry does not include the calibration state.');
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledOnce());
    expect(transport.request.mock.calls.map((call) => call[0])).toEqual([IMAGE_ENDPOINT]);
    expect(screen.queryByText('Samples')).toBeNull();
  });

  it('state-only grant reads state, never requests the image, and shows no detection card', async () => {
    const transport = client();
    mockDefaults(transport);
    render(<SharedCalibrationSurface projection={projection({
      actions: ['surface.read', 'calibration.state.read'],
      endpoints: [{ id: STATE_ENDPOINT, method: 'GET', path: '/api/access/entry/calibration/state', protocol: 'http', action: 'calibration.state.read' }],
    })} client={transport} />);
    await screen.findByText('7');
    expect(transport.request.mock.calls.map((call) => call[0])).toEqual([STATE_ENDPOINT]);
    expect(document.querySelector('[data-xgc-role="camera-intrinsic-annotated-view"]')).toBeNull();
    expect(screen.queryByText('Waiting for a detection result')).toBeNull();
  });

  it('requests nothing when the entry carries no calibration endpoints', async () => {
    const transport = client();
    mockDefaults(transport);
    render(<SharedCalibrationSurface projection={projection({ endpoints: [], actions: ['surface.read'] })} client={transport} />);
    await screen.findByText('This entry does not include the calibration state.');
    expect(transport.request).not.toHaveBeenCalled();
  });

  it('ignores endpoints whose action is not projected, even when listed', async () => {
    const transport = client();
    mockDefaults(transport);
    render(<SharedCalibrationSurface projection={projection({ actions: ['surface.read'] })} client={transport} />);
    await screen.findByText('This entry does not include the calibration state.');
    expect(transport.request).not.toHaveBeenCalled();
    cleanup();
    render(<SharedCalibrationSurface projection={projection({
      endpoints: [
        { id: STATE_ENDPOINT, method: 'GET', path: '/x', protocol: 'http', action: 'camera.snapshot' },
        { id: IMAGE_ENDPOINT, method: 'GET', path: '/y', protocol: 'http', action: 'camera.snapshot' },
      ],
    })} client={transport} />);
    await screen.findByText('This entry does not include the calibration state.');
    expect(transport.request).not.toHaveBeenCalled();
  });

  it('refuses a foreign module or surface without any request', async () => {
    const transport = client();
    mockDefaults(transport);
    render(<SharedCalibrationSurface projection={projection({ moduleId: 'experiment.camera' })} client={transport} />);
    await screen.findByText('This entry is not a readable calibration surface.');
    expect(transport.request).not.toHaveBeenCalled();
    cleanup();
    render(<SharedCalibrationSurface projection={projection({ surface: { kind: 'remote-controller', sessionId: 'run-a', controllerId: 'c', robotIds: ['r1'] } })} client={transport} />);
    await screen.findByText('This entry is not a readable calibration surface.');
    expect(transport.request).not.toHaveBeenCalled();
  });

  it('never requests the image when the state says no display is ready, including Saved without one', async () => {
    const transport = client();
    mockDefaults(transport, { phase: 'saved', image_ready: false, result_restored: true });
    render(<SharedCalibrationSurface projection={projection()} client={transport} />);
    await screen.findAllByText('Saved');
    expect(transport.request.mock.calls.map((call) => call[0])).toEqual([STATE_ENDPOINT]);
    expect(screen.queryByRole('img')).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('treats a 503 detection image as a normal empty state and writes no error', async () => {
    const transport = client();
    transport.request.mockImplementation(async (endpointId: string) => {
      if (endpointId === STATE_ENDPOINT) return Response.json(stateBody({ phase: 'saved', image_ready: true, result_restored: true }));
      if (endpointId === IMAGE_ENDPOINT) throw Object.assign(new Error('503 Service Unavailable'), { status: 503 });
      throw new Error(`unexpected request ${endpointId}`);
    });
    render(<SharedCalibrationSurface projection={projection()} client={transport} />);
    await screen.findAllByText('Saved');
    await waitFor(() => expect(transport.request.mock.calls.map((call) => call[0])).toContain(IMAGE_ENDPOINT));
    await screen.findByText('Waiting for a detection result');
    expect(screen.queryByText('Detection image is unavailable.')).toBeNull();
    expect(screen.queryByText('Calibration state could not be loaded.')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('rejects a non-image blob instead of displaying it', async () => {
    const transport = client();
    transport.request.mockImplementation(async (endpointId: string) => {
      if (endpointId === STATE_ENDPOINT) return Response.json(stateBody());
      if (endpointId === IMAGE_ENDPOINT) return new Response('{"not":"an image"}', { headers: { 'Content-Type': 'application/json' } });
      throw new Error(`unexpected request ${endpointId}`);
    });
    render(<SharedCalibrationSurface projection={projection()} client={transport} />);
    await screen.findByText('Detection image is unavailable.');
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows a localized error for malformed state and keeps the raw protocol message out of the page', async () => {
    const transport = client();
    transport.request.mockImplementation(async (endpointId: string) => {
      if (endpointId === STATE_ENDPOINT) return Response.json({ bogus: true });
      if (endpointId === IMAGE_ENDPOINT) return imageResponse();
      throw new Error(`unexpected request ${endpointId}`);
    });
    render(<SharedCalibrationSurface projection={projection()} client={transport} />);
    await screen.findByText('Calibration state could not be loaded.');
    expect(screen.queryByText(/bogus/)).toBeNull();
    expect(screen.queryByText(/Protocol error/)).toBeNull();
  });

  it('creates no object URL when unmounted before the image answer lands', async () => {
    const transport = client();
    let answerImage: ((response: Response) => void) | undefined;
    transport.request.mockImplementation(async (endpointId: string) => {
      if (endpointId === STATE_ENDPOINT) return Response.json(stateBody());
      if (endpointId === IMAGE_ENDPOINT) return new Promise<Response>((resolve) => { answerImage = resolve; });
      throw new Error(`unexpected request ${endpointId}`);
    });
    const view = render(<SharedCalibrationSurface projection={projection()} client={transport} />);
    await waitFor(() => expect(transport.request.mock.calls.map((call) => call[0])).toContain(IMAGE_ENDPOINT));
    view.unmount();
    await act(async () => { answerImage!(imageResponse()); });
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('revokes the displayed object URL on unmount', async () => {
    const transport = client();
    mockDefaults(transport);
    const view = render(<SharedCalibrationSurface projection={projection()} client={transport} />);
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledOnce());
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:detection-a');
  });
});

const imageOnlyProjection = () => projection({
  actions: ['surface.read', 'calibration.image.read'],
  endpoints: [{ id: IMAGE_ENDPOINT, method: 'GET', path: '/api/access/entry/calibration/image.jpg', protocol: 'http', action: 'calibration.image.read' }],
});

describe('Shared calibration resource and lifetime boundaries', () => {
  it.each([
    { panel: undefined },
    { panel: { id: 'another-panel', pluginId: 'camera-intrinsic-calibration' } },
    { panel: { id: 'panel-a', pluginId: 'lichtblick' } },
    { surface: { kind: 'experiment-panel', experimentId: 'experiment-a', panelId: 'panel-a' } },
    { surface: { kind: 'experiment-panel', experimentId: ' experiment-a ', sessionId: 'run-a', panelId: 'panel-a' } },
    { actions: ['calibration.state.read', 'calibration.image.read'] },
    { viewContractVersion: 2 },
  ])('rejects incomplete or mismatched owner projection %#', async (overrides) => {
    const transport = client();
    mockDefaults(transport);
    render(<SharedCalibrationSurface projection={projection(overrides)} client={transport} />);
    await screen.findByText('This entry is not a readable calibration surface.');
    expect(transport.request).not.toHaveBeenCalled();
  });

  it.each(['method', 'protocol', 'path', 'action', 'duplicate'] as const)('does not use a %s-mismatched endpoint', (which) => {
    const transport = client();
    const source = projection();
    // Both actions remain in the grant. Endpoint shape still has to match.
    const state = { ...source.endpoints[0] };
    if (which === 'method') state.method = 'POST';
    if (which === 'protocol') state.protocol = 'sse';
    if (which === 'path') state.path = '/api/access/entry/media/snapshot.jpg';
    if (which === 'action') state.action = 'camera.snapshot';
    const selected = which === 'duplicate' ? [state, { ...state }] : [state];
    render(<SharedCalibrationSurface projection={projection({ endpoints: selected })} client={transport} />);
    expect(transport.request).not.toHaveBeenCalled();
  });

  it.each(['session_revision', 'collection_revision', 'samples'])('rejects negative and unsafe %s without fetching an image', async (field) => {
    for (const value of [-1, Number.MAX_SAFE_INTEGER + 1]) {
      const transport = client();
      mockDefaults(transport, { [field]: value });
      render(<SharedCalibrationSurface projection={projection()} client={transport} />);
      await screen.findByText('Calibration state could not be loaded.');
      expect(transport.request.mock.calls.map((call) => call[0])).toEqual([STATE_ENDPOINT]);
      expect(screen.queryByText(String(value))).toBeNull();
      cleanup();
    }
  });

  it('accepts zero and safe upper-bound counters', async () => {
    const transport = client();
    mockDefaults(transport, { samples: Number.MAX_SAFE_INTEGER, session_revision: 0, collection_revision: 0, image_ready: false });
    render(<SharedCalibrationSurface projection={projection()} client={transport} />);
    await screen.findByText(String(Number.MAX_SAFE_INTEGER));
    expect(screen.queryByText('Calibration state could not be loaded.')).toBeNull();
    expect(transport.request.mock.calls.map((call) => call[0])).toEqual([STATE_ENDPOINT]);
  });

  it('waits for a delayed authorized state before deciding whether to fetch an image', async () => {
    const transport = client();
    let answerState!: (response: Response) => void;
    transport.request.mockImplementation(async () => new Promise<Response>((resolve) => { answerState = resolve; }));
    render(<SharedCalibrationSurface projection={projection()} client={transport} />);
    expect(transport.request.mock.calls.map((call) => call[0])).toEqual([STATE_ENDPOINT]);
    await act(async () => { answerState(Response.json(stateBody({ phase: 'saved', image_ready: false }))); });
    await screen.findAllByText('Saved');
    expect(transport.request.mock.calls.map((call) => call[0])).toEqual([STATE_ENDPOINT]);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('refreshes through state first and clears the previous image when Saved has no display', async () => {
    const transport = client();
    let saved = false;
    transport.request.mockImplementation(async (id) => id === STATE_ENDPOINT
      ? Response.json(stateBody(saved ? { phase: 'saved', image_ready: false } : {})) : imageResponse());
    render(<SharedCalibrationSurface projection={projection()} client={transport} />);
    await screen.findByRole('img');
    saved = true;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findAllByText('Saved');
    expect(screen.queryByRole('img')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:detection-a');
    expect(transport.request.mock.calls.map((call) => call[0])).toEqual([STATE_ENDPOINT, IMAGE_ENDPOINT, STATE_ENDPOINT]);
  });

  it('treats image-only 503 as unavailable without reading state or exposing the error', async () => {
    const transport = client();
    transport.request.mockRejectedValue(Object.assign(new Error('/private/saved/checkpoint 98240ce9'), { status: 503 }));
    render(<SharedCalibrationSurface projection={imageOnlyProjection()} client={transport} />);
    await act(async () => undefined);
    expect(transport.request.mock.calls.map((call) => call[0])).toEqual([IMAGE_ENDPOINT]);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText('Detection image is unavailable.')).toBeNull();
    expect(screen.queryByText(/private|98240ce9/)).toBeNull();
  });

  it.each(['image/svg+xml', 'image/png', ''])('rejects a response outside the JPEG contract (%s)', async (type) => {
    const transport = client();
    transport.request.mockResolvedValue(new Response(new Uint8Array([1]), { headers: { 'Content-Type': type } }));
    render(<SharedCalibrationSurface projection={imageOnlyProjection()} client={transport} />);
    await screen.findByText('Detection image is unavailable.');
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('aborts the prior image when only the Experiment identity changes and discards its late reply', async () => {
    const transport = client();
    let answerOld!: (response: Response) => void;
    transport.request.mockImplementationOnce(async () => new Promise<Response>((resolve) => { answerOld = resolve; }))
      .mockResolvedValue(imageResponse());
    const original = imageOnlyProjection();
    const view = render(<SharedCalibrationSurface projection={original} client={transport} />);
    const firstSignal = transport.request.mock.calls[0][1]?.signal;
    view.rerender(<SharedCalibrationSurface projection={{ ...original,
      surface: { kind: 'experiment-panel', experimentId: 'experiment-b', sessionId: 'run-a', panelId: 'panel-a' },
    }} client={transport} />);
    expect(firstSignal?.aborted).toBe(true);
    await screen.findByRole('img');
    await act(async () => { answerOld(imageResponse()); });
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(transport.request).toHaveBeenCalledTimes(2);
  });

  it('aborts a pending state on permission removal and does not restore facts from its late JSON', async () => {
    const transport = client();
    let answerJSON!: (value: unknown) => void;
    const response = Response.json({});
    vi.spyOn(response, 'json').mockImplementation(async () => new Promise((resolve) => { answerJSON = resolve; }));
    transport.request.mockResolvedValue(response);
    const view = render(<SharedCalibrationSurface projection={projection()} client={transport} />);
    await waitFor(() => expect(response.json).toHaveBeenCalledOnce());
    const signal = transport.request.mock.calls[0][1]?.signal;
    view.rerender(<SharedCalibrationSurface projection={projection({ actions: ['surface.read'], endpoints: [] })} client={transport} />);
    expect(signal?.aborted).toBe(true);
    await act(async () => { answerJSON(stateBody()); });
    expect(screen.queryByText('7')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(transport.request.mock.calls.map((call) => call[0])).toEqual([STATE_ENDPOINT]);
  });

  it('revokes an existing image as soon as image permission is removed', async () => {
    const transport = client();
    mockDefaults(transport);
    const view = render(<SharedCalibrationSurface projection={imageOnlyProjection()} client={transport} />);
    await screen.findByRole('img');
    const signal = transport.request.mock.calls[0][1]?.signal;
    view.rerender(<SharedCalibrationSurface projection={projection({ actions: ['surface.read'], endpoints: [] })} client={transport} />);
    expect(signal?.aborted).toBe(true);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:detection-a');
    expect(screen.queryByRole('img')).toBeNull();
    expect(document.querySelector('[data-xgc-role="camera-intrinsic-annotated-view"]')).toBeNull();
  });
});
