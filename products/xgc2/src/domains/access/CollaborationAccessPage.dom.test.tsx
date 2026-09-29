// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CollaborationAccessPage } from './CollaborationAccessPage';
import type { AccessCatalog, AccessEntry, AccessEntryIssued } from './accessTypes';
import type * as UseAccessEntriesModule from './useAccessEntries';

const hooks = vi.hoisted(() => ({
  create: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  rotate: vi.fn(),
  revoke: vi.fn(),
  refresh: vi.fn(),
  clearActionError: vi.fn(),
  clearCreateError: vi.fn(),
  state: {
    entries: [] as AccessEntry[],
    loading: false,
    error: '' as const,
    actionError: null as null,
    createError: '' as const,
    busyId: '',
  },
}));
vi.mock('./useAccessEntries', async (importOriginal) => ({
  // Participant reads stay real and go through the mocked accessService below.
  ...await importOriginal<typeof UseAccessEntriesModule>(),
  useAccessEntries: () => ({
    ...hooks.state,
    refresh: hooks.refresh,
    clearActionError: hooks.clearActionError,
    clearCreateError: hooks.clearCreateError,
    create: hooks.create,
    start: hooks.start,
    stop: hooks.stop,
    rotate: hooks.rotate,
    revoke: hooks.revoke,
  }),
}));

const api = vi.hoisted(() => ({
  listExperiments: vi.fn(),
  listRobotAssets: vi.fn(),
  getAccessCatalog: vi.fn(),
  listAccessEntryParticipants: vi.fn(),
  revokeAccessEntryParticipant: vi.fn(),
}));
vi.mock('../experiment/experimentPublic', () => ({
  listExperiments: api.listExperiments,
  experimentRobotRoleLabel: ({ id }: { id: string }) => {
    const match = /^([a-z][a-z0-9-]*)-(\d+)$/.exec(id);
    if (!match) return id;
    const role = { px4: 'UAV', ugv: 'UGV', scout: 'UGV', mecanum: 'UGV' }[match[1]!];
    return role ? `${role}-${match[2]!.padStart(2, '0')}` : id;
  },
}));
vi.mock('../robot/robotAssetPublic', () => ({ listRobotAssets: api.listRobotAssets }));
vi.mock('./accessService', () => ({
  getAccessCatalog: api.getAccessCatalog,
  listAccessEntryParticipants: api.listAccessEntryParticipants,
  revokeAccessEntryParticipant: api.revokeAccessEntryParticipant,
  isAccessCatalogSessionMissing: (cause: unknown) => (
    typeof cause === 'object' && cause !== null && (cause as { status?: number }).status === 409
  ),
}));

const EXPERIMENT = {
  head: { resourceId: 'experiment-1' },
  spec: { name: 'LAN experiment', robots: [{ id: 'ugv-1', ref: { resourceId: 'asset-1' } }] },
};
const ASSET = { head: { resourceId: 'asset-1' }, spec: { name: 'Test Rover' } };

function catalog(modules: AccessCatalog['modules']): AccessCatalog {
  return {
    contractVersion: 1,
    experimentId: 'experiment-1',
    sessionId: 'session-1',
    modules,
    unsupportedPanels: [],
  };
}

const CAMERA_MODULE = {
  moduleId: 'experiment.camera',
  title: 'Camera view',
  viewContractVersion: 1,
  resources: [{
    title: 'Gazebo world camera',
    surface: { kind: 'experiment-panel', experimentId: 'experiment-1', sessionId: 'session-1', panelId: 'panel-1' },
    available: true,
    actions: [
      { id: 'surface.read', label: 'Open the shared page and see its status', required: true, available: true },
      { id: 'camera.live', label: 'Watch the live view', required: false, available: true },
      { id: 'camera.snapshot', label: 'Capture the current image', required: false, available: true },
    ],
  }],
} satisfies AccessCatalog['modules'][number];

const REMOTE_MODULE = {
  moduleId: 'experiment.remote-control',
  title: 'Robot remote',
  viewContractVersion: 1,
  resources: [{
    title: 'UGV-01 — Test Rover',
    surface: {
      kind: 'remote-controller', experimentId: 'experiment-1', sessionId: 'session-1',
      controllerId: 'controller-1', robotIds: ['ugv-1'],
    },
    available: true,
    actions: [
      { id: 'surface.read', label: 'Open the shared page and see its status', required: true, available: true },
      { id: 'remote.motion', label: 'Drive the selected robots', required: false, available: true },
    ],
  }],
} satisfies AccessCatalog['modules'][number];

function entry(overrides: Partial<AccessEntry> = {}): AccessEntry {
  return {
    id: 'entry-1',
    grantId: 'grant-1',
    name: 'Front camera',
    listenHost: '0.0.0.0',
    requestedPort: 0,
    boundPort: 9410,
    status: 'running',
    moduleId: 'experiment.camera',
    viewContractVersion: 1,
    surface: { kind: 'experiment-panel', experimentId: 'experiment-1', panelId: 'panel-1' },
    capabilities: [],
    actions: ['surface.read', 'camera.live'],
    advertisedHosts: ['192.168.1.9'],
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    entryPath: '/access-entry',
    ...overrides,
  };
}

function issued(overrides: Partial<AccessEntryIssued> = {}): AccessEntryIssued {
  return {
    entry: entry(),
    bootstrapToken: 'bootstrap-token',
    bootstrapExpiresAt: new Date(Date.now() + 120_000).toISOString(),
    ...overrides,
  };
}

async function renderPage() {
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(<CollaborationAccessPage language="en-US" />);
  });
  return view;
}

async function openDrawer(container: HTMLElement) {
  const trigger = container.querySelector('[data-xgc-role="access-entry-create"]');
  expect(trigger).not.toBeNull();
  fireEvent.click(trigger as Element);
  return screen.findByRole('dialog', { name: 'New share' });
}

beforeEach(() => {
  api.listExperiments.mockResolvedValue([EXPERIMENT]);
  api.listRobotAssets.mockResolvedValue([ASSET]);
  api.getAccessCatalog.mockResolvedValue(catalog([CAMERA_MODULE, REMOTE_MODULE]));
  api.listAccessEntryParticipants.mockResolvedValue([]);
  api.revokeAccessEntryParticipant.mockResolvedValue(undefined);
  hooks.create.mockResolvedValue(undefined);
  hooks.start.mockResolvedValue(undefined);
  hooks.stop.mockResolvedValue(undefined);
  hooks.rotate.mockResolvedValue(undefined);
  hooks.revoke.mockResolvedValue(undefined);
  hooks.state.entries = [];
  hooks.state.busyId = '';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('creates a camera share from the frozen catalog with human labels only', async () => {
  const { container } = await renderPage();
  const drawer = await openDrawer(container);
  const submit = within(drawer).getByRole('button', { name: 'New share' });
  const cancel = within(drawer).getByRole('button', { name: 'Cancel' });
  expect(submit.closest('.xgc-drawer-header')).not.toBeNull();
  expect(cancel.closest('.xgc-drawer-header')).not.toBeNull();
  expect(submit.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(drawer.querySelector('.xgc-drawer-footer')).toBeNull();

  await within(drawer).findByText('Open the shared page and see its status (always included)');
  expect(within(drawer).getByRole('checkbox', { name: 'Watch the live view' })).toBeChecked();
  expect(within(drawer).queryByText(/surface\.read|camera\.live|camera\.snapshot/)).toBeNull();
  expect(within(drawer).queryByText(/experiment\.camera|experiment\.remote-control/)).toBeNull();
  expect(within(drawer).queryByText(/0\.0\.0\.0/)).toBeNull();

  fireEvent.change(within(drawer).getByRole('textbox', { name: 'Name' }), { target: { value: 'Review camera' } });
  fireEvent.click(submit);
  await waitFor(() => expect(hooks.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    name: 'Review camera',
    listenHost: '0.0.0.0',
    port: 0,
    moduleId: 'experiment.camera',
    actions: ['surface.read', 'camera.live', 'camera.snapshot'],
    surface: {
      kind: 'experiment-panel',
      experimentId: 'experiment-1',
      sessionId: 'session-1',
      panelId: 'panel-1',
    },
    expiresAt: expect.any(String),
  })));
});

it('creates a remote-controller share with the server-issued surface verbatim', async () => {
  api.getAccessCatalog.mockResolvedValue(catalog([REMOTE_MODULE, CAMERA_MODULE]));
  const { container } = await renderPage();
  const drawer = await openDrawer(container);
  await within(drawer).findByRole('checkbox', { name: 'Drive the selected robots' });
  expect(within(drawer).getByText('UGV-01 — Test Rover')).toBeTruthy();

  fireEvent.change(within(drawer).getByRole('textbox', { name: 'Name' }), { target: { value: 'LAN controller' } });
  fireEvent.click(within(drawer).getByRole('button', { name: 'New share' }));
  await waitFor(() => expect(hooks.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    name: 'LAN controller',
    moduleId: 'experiment.remote-control',
    actions: ['surface.read', 'remote.motion'],
    surface: {
      kind: 'remote-controller',
      experimentId: 'experiment-1',
      sessionId: 'session-1',
      controllerId: 'controller-1',
      robotIds: ['ugv-1'],
    },
  })));
});

it('binds the first experiment when the drawer opens before the experiment list arrives', async () => {
  let resolveExperiments: (documents: unknown[]) => void = () => undefined;
  api.listExperiments.mockImplementation(() => new Promise((resolve) => {
    resolveExperiments = resolve;
  }));
  const { container } = await renderPage();
  const drawer = await openDrawer(container);
  expect(within(drawer).getByRole('button', { name: 'New share' })).toBeDisabled();
  await act(async () => {
    resolveExperiments([EXPERIMENT]);
  });
  await within(drawer).findByText('Open the shared page and see its status (always included)');
  expect(api.getAccessCatalog).toHaveBeenCalledWith('experiment-1');
  expect(within(drawer).getByRole('button', { name: 'New share' })).toBeEnabled();
});

it('dismisses the share drawer through its standard header Cancel action', async () => {
  const { container } = await renderPage();
  const drawer = await openDrawer(container);
  fireEvent.click(within(drawer).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(hooks.create).not.toHaveBeenCalled();
});

it('explains and blocks creation when the experiment is not ready', async () => {
  api.getAccessCatalog.mockRejectedValue({ status: 409 });
  const { container } = await renderPage();
  const drawer = await openDrawer(container);
  await within(drawer).findByText(/not ready yet/);
  expect(within(drawer).getByRole('button', { name: 'New share' })).toBeDisabled();
  expect(within(drawer).queryByText(/not running|needs the experiment running/i)).toBeNull();
});

it('offers a retry when the catalog cannot be loaded', async () => {
  api.getAccessCatalog.mockRejectedValueOnce(new Error('network down'));
  const { container } = await renderPage();
  const drawer = await openDrawer(container);
  await within(drawer).findByText(/Could not load the shareable functions/);
  fireEvent.click(within(drawer).getByRole('button', { name: 'Retry' }));
  await within(drawer).findByText('Open the shared page and see its status (always included)');
  expect(api.getAccessCatalog.mock.calls.length).toBeGreaterThanOrEqual(2);
});

it('blocks creation when every resource of the function is unavailable', async () => {
  api.getAccessCatalog.mockResolvedValue(catalog([{
    ...CAMERA_MODULE,
    resources: [{
      ...CAMERA_MODULE.resources[0]!,
      available: false,
      reason: 'camera source is not ready',
    }],
  }]));
  const { container } = await renderPage();
  const drawer = await openDrawer(container);
  await within(drawer).findByText(/no supported resource that can be shared/);
  expect(within(drawer).getByText(/camera source is not ready/)).toBeTruthy();
  expect(within(drawer).getByRole('button', { name: 'New share' })).toBeDisabled();
});

it('blocks creation when a required permission of the resource is unavailable', async () => {
  api.getAccessCatalog.mockResolvedValue(catalog([{
    ...CAMERA_MODULE,
    resources: [{
      ...CAMERA_MODULE.resources[0]!,
      actions: [
        { id: 'surface.read', label: 'Open the shared page and see its status', required: true, available: false },
        { id: 'camera.live', label: 'Watch the live view', required: false, available: true },
      ],
    }],
  }]));
  const { container } = await renderPage();
  const drawer = await openDrawer(container);
  await within(drawer).findByText(/required permission of this resource is not available/);
  expect(within(drawer).getByRole('button', { name: 'New share' })).toBeDisabled();
});

it('renders human names instead of internal identifiers in the list and detail', async () => {
  hooks.state.entries = [entry()];
  const { container } = await renderPage();
  const row = container.querySelector('[data-xgc-role="access-entry-row"][data-xgc-id="entry-1"]') as HTMLElement;
  expect(row).not.toBeNull();
  expect(within(row).getByRole('button', { name: /Front camera/ })).toBeTruthy();
  expect(within(row).getByText(/Camera view · LAN experiment/)).toBeTruthy();
  fireEvent.click(within(row).getByRole('button', { name: /Front camera/ }));
  const detail = container.querySelector('[data-xgc-role="access-entry-detail"]') as HTMLElement;
  expect(detail).not.toBeNull();
  await within(detail).findByText('Gazebo world camera');
  expect(within(detail).getByText('LAN experiment')).toBeTruthy();
  expect(within(detail).getByText('Automatic · 9410')).toBeTruthy();
  expect(within(detail).getByText('Access link')).toBeTruthy();
  expect(within(detail).getByText('What recipients can do')).toBeTruthy();
  expect(within(detail).getByText(/Open the shared page and see its status/)).toBeTruthy();
  expect(within(detail).getByText('Watch the live view')).toBeTruthy();
  expect(within(detail).queryByText(/surface\.read|camera\.live/)).toBeNull();
  expect(within(detail).queryByText(/experiment-1|panel-1|grant-1/)).toBeNull();
  expect(within(detail).queryByText(/0\.0\.0\.0/)).toBeNull();
});

it('shows the asset catalog list with one New share when nothing is shared', async () => {
  const { container } = await renderPage();
  const catalog = container.querySelector('[data-xgc-role="access-entry-list"][data-xgc-id="access-entry-list"]');
  expect(catalog?.classList.contains('xgc-list-page')).toBe(true);
  const controls = catalog?.querySelector('[data-xgc-role="list-page-controls"]');
  expect(controls).not.toBeNull();
  const search = container.querySelector('[data-xgc-role="access-entry-search"]');
  expect(search).toHaveClass('xgc-input', 'xgc-list-search');
  expect(search?.querySelector('input')).toHaveAttribute('placeholder', 'Search shares');
  expect(container.querySelector('[data-xgc-role="access-entry-kind-filter"][data-xgc-id="access-entry-kind-filter"]')).toHaveClass('xgc-select-control');
  expect(container.querySelector('[data-xgc-role="access-entry-kind-filter-trigger"][data-xgc-id="access-entry-kind-filter"]')).toHaveAccessibleName('Filter shares by function');
  expect(container.querySelector('[data-xgc-role="access-entry-sort"][data-xgc-id="access-entry-sort"]')).toHaveClass('xgc-select-control');
  await screen.findByText('Nothing shared yet.');
  expect(screen.getByText(/Create a share to send one function/)).toBeTruthy();
  expect(container.querySelector('[data-xgc-role="access-entry-detail"]')).toBeNull();
  expect(container.querySelector('[data-xgc-role="access-entry-empty-create"]')).toBeNull();
  const create = container.querySelector('[data-xgc-role="access-entry-create"][data-xgc-id="access-entry-create"]');
  expect(create).not.toBeNull();
  expect(controls?.contains(create as Node)).toBe(true);
  expect(container.querySelectorAll('[data-xgc-role="access-entry-create"]')).toHaveLength(1);
});

it('filters and sorts the catalog the way other asset lists do, then opens the share in place', async () => {
  hooks.state.entries = [
    entry({ id: 'entry-remote', name: 'Yard remote', moduleId: 'experiment.remote-control', surface: {
      kind: 'remote-controller', experimentId: 'experiment-1', sessionId: 'session-1', controllerId: 'controller-1', robotIds: ['ugv-1'],
    }, actions: ['surface.read', 'remote.motion'], expiresAt: '2026-09-23T00:00:00Z' }),
    entry({ id: 'entry-camera', name: 'Front camera', expiresAt: '2026-09-30T00:00:00Z' }),
  ];
  const { container } = await renderPage();
  const names = () => [...container.querySelectorAll('[data-xgc-role="access-entry-row"]')].map((row) => row.getAttribute('data-xgc-id'));
  expect(names()).toEqual(['entry-camera', 'entry-remote']);
  fireEvent.change(container.querySelector('[data-xgc-role="access-entry-search"] input') as HTMLInputElement, { target: { value: 'yard' } });
  expect(names()).toEqual(['entry-remote']);
  fireEvent.change(container.querySelector('[data-xgc-role="access-entry-search"] input') as HTMLInputElement, { target: { value: 'no-such-share' } });
  expect(names()).toEqual([]);
  expect(screen.getByText('No matching shares.')).toBeTruthy();
  fireEvent.change(container.querySelector('[data-xgc-role="access-entry-search"] input') as HTMLInputElement, { target: { value: '' } });
  fireEvent.click(container.querySelector('[data-xgc-role="access-entry-kind-filter-trigger"]') as HTMLElement);
  fireEvent.click(await screen.findByRole('option', { name: 'Robot remote' }));
  expect(names()).toEqual(['entry-remote']);
  fireEvent.click(container.querySelector('[data-xgc-role="access-entry-row-open"]') as HTMLElement);
  expect(container.querySelector('[data-xgc-role="access-entry-list"]')).toBeNull();
  const detail = container.querySelector('[data-xgc-role="access-entry-detail"][data-xgc-id="entry-remote"]') as HTMLElement;
  expect(detail).not.toBeNull();
  fireEvent.click(within(detail).getByRole('button', { name: 'Back to the list' }));
  expect(container.querySelector('[data-xgc-role="access-entry-list"]')).not.toBeNull();
  expect(names()).toEqual(['entry-remote']);
});

it('keeps stop and revoke available but blocks start for undescribable permissions', async () => {
  hooks.state.entries = [entry({
    status: 'stopped',
    actions: ['surface.read', 'camera.live', 'future.action'],
  })];
  const { container } = await renderPage();
  fireEvent.click(await screen.findByRole('button', { name: /Front camera/ }));
  const detail = container.querySelector('[data-xgc-role="access-entry-detail"]') as HTMLElement;
  await within(detail).findByText(/permissions this version cannot describe/);
  expect(within(detail).queryByRole('button', { name: /Start/ })).toBeNull();
  expect(within(detail).queryByRole('button', { name: /Generate new link/ })).toBeNull();
  expect(within(detail).getByRole('button', { name: /Revoke/ })).toBeTruthy();
  expect(within(detail).queryByText(/future\.action/)).toBeNull();
});

it('labels read-only calibration shares by their module', async () => {
  hooks.state.entries = [entry({
    moduleId: 'experiment.calibration-readonly',
    actions: ['surface.read', 'calibration.state.read', 'calibration.image.read'],
  })];
  const { container } = await renderPage();
  const row = container.querySelector('[data-xgc-role="access-entry-row"][data-xgc-id="entry-1"]') as HTMLElement;
  expect(row).not.toBeNull();
  expect(within(row).getByText(/Calibration \(read-only\)/)).toBeTruthy();
  fireEvent.click(within(row).getByRole('button', { name: /Front camera/ }));
  const detail = container.querySelector('[data-xgc-role="access-entry-detail"]') as HTMLElement;
  await within(detail).findByText('View the calibration state');
  expect(within(detail).getByText('View the calibration image')).toBeTruthy();
  expect(within(detail).queryByText(/calibration\.state\.read|calibration\.image\.read/)).toBeNull();
});

it('hides an expired bootstrap link and asks for a fresh one', async () => {
  hooks.state.entries = [entry()];
  hooks.rotate.mockResolvedValue(issued({
    bootstrapExpiresAt: new Date(Date.now() - 1_000).toISOString(),
  }));
  const { container } = await renderPage();
  fireEvent.click(await screen.findByRole('button', { name: /Front camera/ }));
  const detail = container.querySelector('[data-xgc-role="access-entry-detail"]') as HTMLElement;
  fireEvent.click(await within(detail).findByRole('button', { name: /Generate new link/ }));
  await within(detail).findByText(/link credential has expired/);
  expect(within(detail).queryByRole('button', { name: /Copy link/ })).toBeNull();
});

it('shows a fresh access link after generating one', async () => {
  hooks.state.entries = [entry()];
  hooks.rotate.mockResolvedValue(issued());
  const { container } = await renderPage();
  fireEvent.click(await screen.findByRole('button', { name: /Front camera/ }));
  const detail = container.querySelector('[data-xgc-role="access-entry-detail"]') as HTMLElement;
  fireEvent.click(await within(detail).findByRole('button', { name: /Generate new link/ }));
  const url = await within(detail).findByText(/192\.168\.1\.9:9410/);
  expect(url.textContent).toContain('bootstrap-token');
  expect(within(detail).getByRole('button', { name: /Copy link/ })).toBeTruthy();
});

it('names visitors by ordinal and can remove one without showing session identity', async () => {
  hooks.state.entries = [entry()];
  api.listAccessEntryParticipants.mockResolvedValue([{
    id: 'session-uuid-should-stay-hidden',
    name: 'Front camera',
    status: 'active',
    createdAt: '2026-09-20T12:00:00Z',
    lastSeenAt: '2026-09-20T12:01:00Z',
    expiresAt: '2026-09-20T13:00:00Z',
    mediaSessions: 1,
    cleanupPending: false,
    holdingControl: true,
  }]);
  const { container } = await renderPage();
  fireEvent.click(await screen.findByRole('button', { name: /Front camera/ }));
  const detail = container.querySelector('[data-xgc-role="access-entry-detail"]') as HTMLElement;
  await within(detail).findByText('Visitor 1');
  expect(within(detail).getByText('Controlling')).toBeTruthy();
  expect(within(detail).queryByText(/session-uuid-should-stay-hidden/)).toBeNull();
  fireEvent.click(within(detail).getByRole('button', { name: 'Remove' }));
  await waitFor(() => expect(api.revokeAccessEntryParticipant).toHaveBeenCalledExactlyOnceWith(
    'entry-1',
    'session-uuid-should-stay-hidden',
  ));
});
