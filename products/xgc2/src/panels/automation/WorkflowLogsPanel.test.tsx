// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe,expect,it } from 'vitest';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import type { PanelPluginContext } from '../types';
import { getPanelPlugin } from '../builtinPanels';
import { WorkflowLogsPanel } from './WorkflowLogsPanel';
import { workflowLogsPanelPlugin } from './workflowLogsManifest';

describe('WorkflowLogsPanel Data port',() => {
  it('keeps an unbound log panel quiet without exposing projection plumbing',() => {
    render(<WorkflowLogsPanel panel={panel()} context={context()} />);
    expect(document.querySelector('[data-xgc-role="workflow-logs"][data-xgc-id="logs"]')).toBeEmptyDOMElement();
  });

  it('renders only the value delivered by the explicit trace Data port',() => {
    render(<WorkflowLogsPanel panel={panel()} context={context({ invocationId:'run-1',lines:['ready'] })} />);
    expect(document.querySelector('[data-xgc-role="workflow-log-output"]')).toHaveTextContent('run-1');
    expect(document.querySelector('[data-xgc-role="workflow-log-output"]')).toHaveTextContent('ready');
  });

  it('freezes the read-only manifest contract',() => {
    expect(getPanelPlugin('workflow-logs')).toBe(workflowLogsPanelPlugin);
    expect(workflowLogsPanelPlugin.actionPorts).toBeUndefined();
    expect(workflowLogsPanelPlugin.dataPorts).toEqual([
      expect.objectContaining({ id:'workflow-traces',contract:'workflowruntime.run.logs',required:true }),
    ]);
  });
});

function panel():PanelInstance {
  return { id:'logs',pluginId:'workflow-logs',title:'Workflow logs',gridPos:{ x:0,y:0,w:7,h:4 },query:{},options:{},fieldConfig:{},portBindings:[] };
}

function context(value?:unknown):PanelPluginContext {
  return { ports:{ actions:{},data:value === undefined ? {} : { 'workflow-traces':{
    id:'workflow-traces',label:'Workflow traces',contract:'workflow.run.logs.v1',connected:true,value,trace:{},
  } },authoring:{},interactions:{} } };
}
