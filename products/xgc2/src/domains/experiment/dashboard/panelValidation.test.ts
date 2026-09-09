import { describe,expect,it } from 'vitest';
import { definePanelPlugin } from '../../../panels/types';
import type { PanelInstance } from '../experimentModel';
import { validatePanelInstance } from './panelValidation';

const plugin = definePanelPlugin({
  id:'ports',name:'Ports',category:'Custom',description:'',capabilities:[] as const,
  actionPorts:[{ id:'start',label:'Start',required:true }],
  dataPorts:[{ id:'state',label:'State',contract:'state.v1',required:true }],
  authoringPorts:[{ id:'robots',label:'Robots',target:'experiment.robots' }],
  optionSchema:{ compact:{ type:'boolean' } },component:() => null,
});

describe('Panel v4 validation',() => {
  it('accepts exact typed port bindings',() => {
    expect(validatePanelInstance(panel(),plugin)).toEqual({ valid:true });
  });
  it('requires every required manifest port',() => {
    const value = panel();value.portBindings = value.portBindings.filter((binding) => binding.portId !== 'start');
    expect(validatePanelInstance(value,plugin).error).toContain('Required action port "start"');
  });
  it('requires exactly one Panel Workflow and keeps detached failures non-fatal',() => {
    const missing = panel();missing.portBindings = missing.portBindings.filter((binding) => binding.kind !== 'workflow');
    expect(validatePanelInstance(missing,plugin).error).toContain('exactly one Panel Workflow');
    const detached = panel();
    const workflow = detached.portBindings.find((binding) => binding.kind === 'workflow')!;
    workflow.failurePolicy = 'stop-experiment';
    expect(validatePanelInstance(detached,plugin).error).toContain('cannot stop the Experiment');
  });
  it('rejects duplicate, undeclared, and wrong-kind bindings',() => {
    const duplicate = panel();duplicate.portBindings.push({ ...duplicate.portBindings[1]! });
    expect(validatePanelInstance(duplicate,plugin).error).toContain('more than once');
    const unknown = panel();unknown.portBindings.push({ portId:'secret',kind:'data',projection:'secret.v1' });
    expect(validatePanelInstance(unknown,plugin).error).toContain('not declared');
    const wrong = panel();wrong.portBindings[1] = { portId:'start',kind:'data',projection:'state.v1' };
    expect(validatePanelInstance(wrong,plugin).error).toContain('requires a action binding');
  });
  it('accepts only explicit dynamic Action bindings for a dynamic plugin',() => {
    const dynamicPlugin = definePanelPlugin({
      id:'dynamic',name:'Dynamic',category:'Custom',description:'',capabilities:[] as const,
      dynamicActionPorts:{ source:'panel-action-bindings' },
      dataPorts:[{ id:'state',label:'State',contract:'state.v1',required:true }],
      component:() => null,
    });
    const dynamic = panel();
    dynamic.pluginId = 'dynamic';
    dynamic.portBindings = dynamic.portBindings.filter((binding) => binding.portId !== 'start' && binding.portId !== 'robots');
    dynamic.portBindings.push({ portId:'formation',kind:'action',presetId:'default' });
    expect(validatePanelInstance(dynamic,dynamicPlugin)).toEqual({ valid:true });
    const fixed = { ...dynamic, portBindings:[...dynamic.portBindings,{ portId:'undeclared',kind:'interaction' as const,channel:'x',contract:'x.v1' }] };
    expect(validatePanelInstance(fixed,dynamicPlugin).error).toContain('not declared');
  });
  it('keeps options view-only and schema checked',() => {
    const value = panel();value.options = { compact:true,workflowId:'hidden-discovery' };
    expect(validatePanelInstance(value,plugin).error).toContain('Unknown options key "workflowId"');
  });
});

function panel():PanelInstance {
  return { id:'panel',pluginId:'ports',title:'Ports',gridPos:{ x:0,y:0,w:4,h:4 },query:{},options:{ compact:true },fieldConfig:{},portBindings:[
    { portId:'panel-workflow',kind:'workflow',workflowInstanceId:'worker',presetId:'run',managed:true,relation:'detached-observed',failurePolicy:'keep-experiment' },
    { portId:'start',kind:'action',presetId:'default' },
    { portId:'state',kind:'data',projection:'state.v1' },
    { portId:'robots',kind:'authoring',target:'experiment.robots' },
  ] };
}
