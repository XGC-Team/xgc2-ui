// @vitest-environment jsdom

import { render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { workflowRuntimeDatasources } from '../../../shared/workflowRuntimeProtocol';
import type { AutomationPanelContext } from '../../../panels/types';
import type { PanelInstance } from '../experimentModel';
import { ExperimentPanelContent } from './ExperimentPanelContent';

const executionTargets=vi.hoisted(() => vi.fn(() => []));
vi.mock('../../execution/executionPublic',async () => ({
  ...await vi.importActual('../../execution/executionPublic'),useExecutionTargets:executionTargets,
}));

describe('ExperimentPanelContent v2 host boundary',() => {
  it('rejects an unregistered plugin',() => {
    render(<ExperimentPanelContent panel={panel('missing')} automation={automation()} experimentLifecycle={lifecycle()} />);
    expect(screen.getByText('Panel unavailable')).toBeInTheDocument();
  });
  it('subscribes dynamic service tiles to their target even before child workflow targets arrive',() => {
    executionTargets.mockClear();
    const value=panel('automation-workflow-control');
    render(<ExperimentPanelContent panel={value} executionTargetId="local" automation={automation()}
      experimentLifecycle={{ ...lifecycle(),activeRun:{ id:'root',workflowTargets:[] } } as never} />);
    expect(executionTargets).toHaveBeenCalledWith(['local']);
  });
  it('renders a plugin with resolved ports instead of passing host documents',() => {
    const value = panel('workflow-logs');
    value.portBindings = [{ portId:'workflow-traces',kind:'data',projection:workflowRuntimeDatasources.runLogs }];
    const { container } = render(<ExperimentPanelContent panel={value} automation={automation()} experimentLifecycle={lifecycle()} />);
    // The binding matches the registered manifest contract, so the port
    // resolves as connected with no host document behind it yet.
    expect(container.querySelector('[data-xgc-role="workflow-log-output"]')).toHaveTextContent('"targetId": "local"');
    expect(screen.queryByText(/Connect a workflow trace projection/i)).not.toBeInTheDocument();
  });
});

function panel(pluginId:string):PanelInstance {
  return { id:'panel',pluginId,title:'Panel',gridPos:{ x:0,y:0,w:6,h:4 },query:{},options:{},fieldConfig:{},portBindings:[] };
}
function automation():AutomationPanelContext['automation'] {
  return { targetId:'local',documents:[],catalog:[],runSummaries:[],runDetailsById:{},loading:false,error:'',
    runDocument:vi.fn(),runBoundAutomation:vi.fn(),stop:vi.fn(),stopRunSet:vi.fn(),loadRunDetail:vi.fn(),refreshExecutionHistory:vi.fn() } as unknown as AutomationPanelContext['automation'];
}
function lifecycle() {
  return { activeRun:undefined,runMode:'simulation',start:vi.fn(),stop:vi.fn() };
}
