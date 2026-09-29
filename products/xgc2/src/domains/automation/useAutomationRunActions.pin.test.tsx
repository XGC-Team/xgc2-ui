// @vitest-environment jsdom
import { cleanup,renderHook } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import type { ConfigRef,PinnedConfigRef } from '../../shared/configResource';
import type { AutomationRun } from './automationRunContracts';
import { cancelAutomationRun,startAutomationRun,stopAutomationRun } from './automationRunService';
import { useAutomationRunActions } from './useAutomationRunActions';

vi.mock('./automationRunService', () => ({
  cancelAutomationRun: vi.fn(),getAutomationRun: vi.fn(),startAutomationRun: vi.fn(),
  stopAutomationRun: vi.fn(),stopAutomationRunSet: vi.fn(),
}));

afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());

const automationRef: ConfigRef = { domain: 'automation',resourceId: 'video-render',branch: 'main' };

describe('bound Automation source and control transport', () => {
  it('passes the complete expected source pin together with Experiment ownership', async () => {
    const options = actionOptions();
    const run = runFixture();
    const expectedAutomationRef: PinnedConfigRef = {
      ...automationRef,commitId: 'render-commit',version: 2,digest: 'e'.repeat(64),
    };
    const experimentRef: ConfigRef = { domain: 'experiment',resourceId: 'experiment-a',branch: 'main' };
    vi.mocked(startAutomationRun).mockResolvedValueOnce(run);
    const { result } = renderHook(() => useAutomationRunActions(options));

    await expect(result.current.runBoundAutomation(
      automationRef,{ bag: 'capture.bag' },'Render selected source','','render',
      { experimentRef,expectedAutomationRef,panelAction:{ panelId:'control',portId:'capture' } },
    )).resolves.toBe(run);

    expect(startAutomationRun).toHaveBeenCalledWith('local', {
      actionId: 'render',automationRef,parameters: { bag: 'capture.bag' },reason: 'Render selected source',
      experimentRef,expectedAutomationRef,panelAction:{ panelId:'control',portId:'capture' },
    });
    expect(options.cacheExactRun).toHaveBeenCalledWith(run);
    expect(options.refreshExecutionHistory).toHaveBeenCalledWith('video-render');
  });

  it('keeps ordinary bound starts free of an invented expected source', async () => {
    vi.mocked(startAutomationRun).mockResolvedValueOnce(runFixture());
    const { result } = renderHook(() => useAutomationRunActions(actionOptions()));

    await result.current.runBoundAutomation(automationRef,{},'Ordinary start','node-a','run');

    expect(startAutomationRun).toHaveBeenCalledWith('local', {
      actionId: 'run',automationRef,parameters: {},reason: 'Ordinary start',throughNodeId: 'node-a',
    });
  });

  it('cancels the exact active Run through its revision instead of invoking stop', async () => {
    const options = actionOptions();
    const run = runFixture();
    const canceled = { ...run,status: 'canceled' as const,revision: 5 };
    vi.mocked(cancelAutomationRun).mockResolvedValueOnce(canceled);
    const { result } = renderHook(() => useAutomationRunActions(options));

    await expect(result.current.cancel(run,'Cancel render')).resolves.toBe(canceled);

    expect(cancelAutomationRun).toHaveBeenCalledWith('local',run,'Cancel render');
    expect(stopAutomationRun).not.toHaveBeenCalled();
    expect(options.cacheExactRun).toHaveBeenCalledWith(canceled,true);
  });
});

function actionOptions() {
  return {
    targetId: 'local',cacheExactRun: vi.fn(),refreshExecutionHistory: vi.fn().mockResolvedValue([]),
    refreshObservedExecutionHistories: vi.fn().mockResolvedValue(undefined),setError: vi.fn(),
  };
}

function runFixture(): AutomationRun {
  return {
    id: 'render-run',targetId: 'local',automationResourceId: 'video-render',
    status: 'running',revision: 4,parameters: {},
  } as AutomationRun;
}
