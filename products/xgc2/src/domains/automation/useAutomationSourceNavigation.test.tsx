// @vitest-environment jsdom
import { act,cleanup,renderHook } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { getAutomationDocument } from './automationDocumentService';
import { openAutomationSourceLocation } from './automationNavigation';
import { useAutomationSourceNavigation } from './useAutomationSourceNavigation';
import type { AutomationDocument } from './automationDefinitionContracts';
import type { AutomationRunDetail } from './automationExecutionContracts';

vi.mock('./automationDocumentService', () => ({ getAutomationDocument: vi.fn() }));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAutomationDocument).mockResolvedValue(document());
});

describe('workflow source navigation', () => {
  it('resolves the exact run owner and keeps the requested node and occurrence', async () => {
    const calls: string[] = [];
    const options = {
      targetId: 'agent-a',loadRunDetail: vi.fn().mockResolvedValue(detail()),
      openDocument: vi.fn().mockImplementation(async () => { calls.push('open'); return document(); }),
      onOpenDocument: vi.fn().mockImplementation(() => { calls.push('location'); }),
    };
    const hook = renderHook(() => useAutomationSourceNavigation(options));
    await act(async () => {
      expect(await openAutomationSourceLocation({
        targetId: 'agent-a',runId: 'old-run',nodeId: 'notify',invocationId: 'occurrence-2',
      }, () => { calls.push('activate'); })).toBe(true);
    });
    expect(options.loadRunDetail).toHaveBeenCalledWith('old-run');
    expect(options.onOpenDocument).toHaveBeenCalledWith('workflow-a');
    expect(calls).toEqual(['location','open','activate']);
    expect(hook.result.current.sourceLocation).toEqual({
      targetId: 'agent-a',resourceId: 'workflow-a',runId: 'old-run',nodeId: 'notify',invocationId: 'occurrence-2',
    });
  });

  it.each([
    { nodeId: 'deleted' },
    { nodeId: 'notify',invocationId: 'another-occurrence' },
    { resourceId: 'wrong-workflow' },
  ])('rejects a source that does not belong to the verified run: %j', async (mismatch) => {
    const options = optionsForTarget('agent-a');
    renderHook(() => useAutomationSourceNavigation(options));
    const activate = vi.fn();
    await expect(openAutomationSourceLocation({ targetId: 'agent-a',runId: 'old-run',...mismatch }, activate)).resolves.toBe(false);
    expect(options.onOpenDocument).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });

  it('rejects a wrong-target response and an unavailable source without opening a catalog', async () => {
    const options = optionsForTarget('agent-a');
    options.loadRunDetail.mockResolvedValueOnce(detail('agent-b'));
    renderHook(() => useAutomationSourceNavigation(options));
    await expect(openAutomationSourceLocation({ targetId: 'agent-a',runId: 'old-run' }, vi.fn())).resolves.toBe(false);
    expect(getAutomationDocument).not.toHaveBeenCalled();
    vi.mocked(getAutomationDocument).mockRejectedValueOnce(new Error('not found'));
    await expect(openAutomationSourceLocation({ targetId: 'agent-a',resourceId: 'deleted' }, vi.fn())).resolves.toBe(false);
    expect(options.onOpenDocument).not.toHaveBeenCalled();
  });

  it('does not complete or navigate a source whose target changed during the read', async () => {
    let resolve!: (value: AutomationRunDetail) => void;
    const options = optionsForTarget('agent-a');
    options.loadRunDetail.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const hook = renderHook(({ targetId }) => useAutomationSourceNavigation({ ...options,targetId }), { initialProps: { targetId: 'agent-a' } });
    const activate = vi.fn();
    const pending = openAutomationSourceLocation({ targetId: 'agent-a',runId: 'old-run' }, activate);
    await act(async () => { await Promise.resolve(); });
    hook.rerender({ targetId: 'agent-b' });
    await expect(pending).resolves.toBe(false);
    await act(async () => { resolve(detail()); });
    expect(options.onOpenDocument).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });
});

function optionsForTarget(targetId: string) {
  return {
    targetId,loadRunDetail: vi.fn().mockResolvedValue(detail()),
    openDocument: vi.fn().mockResolvedValue(document()),onOpenDocument: vi.fn(),
  };
}
function document(): AutomationDocument {
  return { head: { resourceId: 'workflow-a' },spec: { metadata: { tags: [] },targetPolicy: { mode: 'inherit' },nodes: [{ id: 'notify' }] } } as unknown as AutomationDocument;
}
function detail(targetId = 'agent-a'): AutomationRunDetail {
  return { run: { id: 'old-run',targetId,automationResourceId: 'workflow-a' },
    snapshot: { automationSpec: { nodes: [{ id: 'notify' }] } },
    invocations: [{ id: 'occurrence-2',nodeId: 'notify' }],nodeSummaries: [],error: '',loading: false,
  } as unknown as AutomationRunDetail;
}
