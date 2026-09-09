// @vitest-environment jsdom
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { GroundStationContextInteraction } from '../domains/groundStationInteraction/groundStationInteractionPublic';
import { openAutomationSourceLocation } from '../domains/automation/automationPublic';
import { openExperimentSourceLocation } from '../domains/experiment/experimentPublic';
import { groundStationContextPage,openGroundStationContext,openGroundStationInteractionOrigin } from './groundStationContextNavigation';

vi.mock('../domains/automation/automationPublic', () => ({ openAutomationSourceLocation: vi.fn() }));
vi.mock('../domains/experiment/experimentPublic', () => ({ openExperimentSourceLocation: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(openAutomationSourceLocation).mockImplementation(async (_location, activate) => { activate(); return true; });
  vi.mocked(openExperimentSourceLocation).mockImplementation(async (_location, activate) => { activate(); return true; });
});

describe('ground-station context navigation', () => {
  it.each([['experiment','experiment'],['automation','automations'],['automation-run','automations']] as const)(
    'maps the implemented %s context to %s', (kind, page) => expect(groundStationContextPage(kind)).toBe(page),
  );

  it('passes a run to its domain owner and returns its actual acknowledgment', async () => {
    const navigate = vi.fn();
    const item = interaction();
    await expect(openGroundStationContext(item.payload.context, item, navigate, 'agent-a')).resolves.toBe(true);
    expect(openAutomationSourceLocation).toHaveBeenCalledWith({ targetId: 'agent-a',runId: 'run-7' }, expect.any(Function));
    expect(navigate).toHaveBeenCalledWith('automations');
    vi.mocked(openAutomationSourceLocation).mockResolvedValueOnce(false);
    await expect(openGroundStationContext(item.payload.context, item, navigate, 'agent-a')).resolves.toBe(false);
  });

  it.each(['robot','operation','log-stream','url'])('does not claim to open an unimplemented %s source', async (kind) => {
    const navigate = vi.fn();
    await expect(openGroundStationContext({ kind,id: 'missing',actionLabel: 'Open' }, interaction(), navigate, 'agent-a')).resolves.toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('rejects mismatched target scopes before either domain receives a request', async () => {
    await expect(openGroundStationInteractionOrigin(interaction(), vi.fn(), 'agent-b')).resolves.toBe(false);
    expect(openAutomationSourceLocation).not.toHaveBeenCalled();
    expect(openExperimentSourceLocation).not.toHaveBeenCalled();
  });

  it('prefers the owning Experiment activity dashboard and retains the full Core target key', async () => {
    const item = interaction();
    item.targetScope = 'local';
    item.origin = { type: 'automation',experimentId: 'exp-a',runId: 'run-7',nodeId: 'notify' };
    await expect(openGroundStationInteractionOrigin(item, vi.fn(), 'core:remote-core')).resolves.toBe(true);
    expect(openExperimentSourceLocation).toHaveBeenCalledWith({
      targetId: 'core:remote-core',resourceId: 'exp-a',preferActivity: true,
    }, expect.any(Function));
    expect(openAutomationSourceLocation).not.toHaveBeenCalled();
  });

  it('retains the exact node and occurrence when an independent workflow source is opened', async () => {
    const item = interaction();
    item.origin = { type: 'automation',ref: 'definition-a',runId: 'run-7',nodeId: 'notify',invocationId: 'occurrence-2' };
    await expect(openGroundStationInteractionOrigin(item, vi.fn(), 'agent-a')).resolves.toBe(true);
    expect(openAutomationSourceLocation).toHaveBeenCalledWith({
      targetId: 'agent-a',runId: 'run-7',nodeId: 'notify',invocationId: 'occurrence-2',
    }, expect.any(Function));
  });

  it('does not reinterpret a telemetry channel id as an Experiment id', async () => {
    await expect(openGroundStationContext({ kind: 'telemetry',id: 'imu',actionLabel: 'Inspect' }, interaction(), vi.fn(), 'agent-a')).resolves.toBe(false);
    expect(openExperimentSourceLocation).not.toHaveBeenCalled();
  });
});

function interaction(): GroundStationContextInteraction {
  return {
    schemaVersion: 1,id: 'interaction-1',targetScope: 'agent-a',revision: 1,status: 'open',kind: 'context',
    presentation: 'panel',responseMode: 'none',severity: 'info',title: 'View run',message: 'Inspect the run',
    payload: { context: { kind: 'automation-run',id: 'run-7',subview: 'history',actionLabel: 'View run' } },
    origin: { type: 'automation' },audience: { scope: 'all' },createdAt: '2026-07-15T00:00:00Z',updatedAt: '2026-07-15T00:00:00Z',
  };
}
