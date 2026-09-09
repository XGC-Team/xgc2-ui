// @vitest-environment jsdom

import { render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { AutomationPanelContext } from '../../../panels/types';
import { PanelAutomationRuntimeProvider } from './PanelAutomationRuntimeProvider';
import { usePanelAutomationRuntime } from './panelAutomationRuntimeContext';

const mocks = vi.hoisted(() => ({ useAutomationWorkspace:vi.fn() }));
vi.mock('../../automation/automationPublic',() => ({
  useAutomationWorkspace:(targetId:string) => mocks.useAutomationWorkspace(targetId),
}));

describe('PanelAutomationRuntimeProvider',() => {
  it('keeps the dashboard owner when the fallback repeats its target with a failed catalog',() => {
    const owner=runtime('local');
    const fallback={ ...runtime('local'),error:'catalog timed out' };
    function Probe() {
      const selected=usePanelAutomationRuntime('local',fallback);
      return <span>{selected===owner ? 'dashboard owner' : 'duplicate observer'}</span>;
    }
    render(<PanelAutomationRuntimeProvider targetIds={['local']} known={[owner,fallback]}><Probe /></PanelAutomationRuntimeProvider>);
    expect(screen.getByText('dashboard owner')).toBeInTheDocument();
  });

  it('opens one shared workspace per distinct additional Agent target',() => {
    const local = runtime('local');
    mocks.useAutomationWorkspace.mockImplementation((targetId:string) => runtime(targetId));
    render(<PanelAutomationRuntimeProvider
      targetIds={['agent-a','agent-a','local']}
      known={[local]}
    >
      <RuntimeTarget targetId="agent-a" fallback={local} />
      <RuntimeTarget targetId="agent-a" fallback={local} />
      <RuntimeTarget targetId="local" fallback={local} />
    </PanelAutomationRuntimeProvider>);

    expect(mocks.useAutomationWorkspace).toHaveBeenCalledTimes(1);
    expect(mocks.useAutomationWorkspace).toHaveBeenCalledWith('agent-a');
    expect(screen.getAllByText('agent-a')).toHaveLength(2);
    expect(screen.getByText('local')).toBeInTheDocument();
  });
});

function RuntimeTarget({ targetId,fallback }: {
  targetId:string;
  fallback:AutomationPanelContext['automation'];
}) {
  return <span>{usePanelAutomationRuntime(targetId,fallback).targetId}</span>;
}

function runtime(targetId:string):AutomationPanelContext['automation'] {
  return {
    targetId,documents:[],catalog:[],runSummaries:[],runDetailsById:{},loading:false,error:'',
    runDocument:vi.fn(),runBoundAutomation:vi.fn(),stop:vi.fn(),stopRunSet:vi.fn(),
    loadRunDetail:vi.fn(),retainRunDetail:vi.fn(() => vi.fn()),refreshExecutionHistory:vi.fn(),
  };
}
