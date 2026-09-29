// @vitest-environment jsdom
import { ProductRouteVisibilityProvider } from '../../../shared/routeReady';
import type { ReactNode } from 'react';
import { cleanup,renderHook } from '@testing-library/react';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { definePanelPlugin } from '../../../panels/types';
import { newAutomationSpec,type AutomationDocument,type AutomationRun,type AutomationRunDetail } from '../../automation/automationPublic';
import { newExperimentSpec,type ExperimentDocument,type PanelInstance } from '../experimentModel';
import { createPanelContext,type PanelContextActions } from './panelContextFactory';
import { standalonePanelRunDetailDemands,standalonePanelHistoryResources,useStandalonePanelActionHistory } from './standalonePanelAction';
import { usePanelRunDetailDemand } from './panelRunDetailDemand';
import { testPanelExecution } from '../../../test/panelExecutionTestSupport';

const plugin=definePanelPlugin({ id:'ordinary-control',name:'Controls',category:'Operations',description:'',capabilities:['experiment'] as const,
  actionPorts:[{ id:'capture',label:'Capture' }],component:() => null });
function fixture() {
  const head={ domain:'automation',resourceId:'worker',name:'Worker',tags:[],mainCommitId:'commit-1',currentVersion:1,digest:'a'.repeat(64),revision:1,createdAt:'t',updatedAt:'t' };
  const branch={ domain:'automation',resourceId:'worker',name:'main',headCommitId:'commit-1',headVersion:1,revision:1,createdAt:'t',updatedAt:'t' };
  const spec=newAutomationSpec('Worker');
  spec.actions[0]!.kind='service';spec.actions[0]!.controls=['stop','cancel','restart'];
  const document:AutomationDocument={ head,branch,spec };
  const experiment:ExperimentDocument={ head:{ ...head,domain:'experiment',resourceId:'experiment-a' },branch:{ ...branch,domain:'experiment',resourceId:'experiment-a' },spec:newExperimentSpec({ name:'Experiment',runModes:['simulation','physical'] }) };
  experiment.spec.workflowInstances=[{ id:'owner',ref:{ domain:'automation',resourceId:'worker',branch:'main' },
    actionPresets:[{ id:'primary',actionId:'run',inputs:{},parameterBindings:[] },
      { id:'capture',actionId:'run',inputs:{ directory:'preset-default' },parameterBindings:[{ target:'/world',expression:'{{ $run.parameters.world }}',language:'xgc-expression-v2' }] }] }];
  const panel:PanelInstance={ id:'controls',pluginId:plugin.id,title:'Controls',gridPos:{ x:0,y:0,w:6,h:4 },query:{},options:{},fieldConfig:{},portBindings:[
    { portId:'panel-workflow',kind:'workflow',workflowInstanceId:'owner',presetId:'primary',managed:true,relation:'supervised',failurePolicy:'keep-experiment' },
    { portId:'capture',kind:'action',presetId:'capture',executionMode:'standalone' },
  ] };
  const pin={ domain:'automation' as const,resourceId:'worker',branch:'main',commitId:'commit-1',version:1,digest:'a'.repeat(64) };
  const sourceRef={ ...pin,domain:'experiment' as const,resourceId:'experiment-a' };
  const run:AutomationRun={ id:'independent',rootRunId:'independent',targetId:'local',automationResourceId:'worker',actionId:'run',actionVersion:1,
    sourceKind:'experiment',sourceRef,automationRef:pin,parameters:{ runMode:'simulation' },status:'waiting',revision:3,
    panelAction:{ panelId:'controls',portId:'capture',workflowInstanceId:'owner',presetId:'capture',executionMode:'standalone',runMode:'simulation' },
    createdAt:'2026-09-20T00:00:00Z',updatedAt:'2026-09-20T00:00:01Z',definitionId:'worker',definitionVersion:1,
    configDigest:'a'.repeat(64),executionPlanDigest:'b'.repeat(64),registryDigest:'c'.repeat(64),definitionDigest:'d'.repeat(64),
    executionModel:'orchestration-occurrence-v1',admissionMode:'parallel',admissionScope:'all',depth:0,correlationId:'independent',acceptedAt:'2026-09-20T00:00:00Z' };
  const detail:AutomationRunDetail={ run,invocations:[],nodeSummaries:[],loading:false,error:'',snapshot:{ runId:run.id,targetId:'local',sourceKind:'experiment',sourceRef,automationRef:pin,
    assetContext:{ schemaVersion:1 },automationSpec:structuredClone(spec),definitionDigest:'d'.repeat(64),digest:'e'.repeat(64),createdAt:'t' } };
  const host:PanelContextActions={ experiment,automation:{ targetId:'local',documents:[document],catalog:[],runSummaries:[],runDetailsById:{},loading:false,error:'',
    runDocument:vi.fn(),runBoundAutomation:vi.fn().mockResolvedValue(run),stop:vi.fn(),cancel:vi.fn(),stopRunSet:vi.fn(),loadRunDetail:vi.fn().mockResolvedValue(detail),
    retainRunDetail:vi.fn(() => vi.fn()),retainRunObservation:vi.fn(() => vi.fn()),refreshExecutionHistory:vi.fn() },
    execution:testPanelExecution(),
    experimentLifecycle:{ runMode:'simulation',start:vi.fn(),stop:vi.fn(),invokeAction:vi.fn(),stopAction:vi.fn() } };
  return { panel,host,document,run,detail,pin,port:() => createPanelContext(plugin,panel,{},host).ports.actions.capture! };
}
afterEach(cleanup);
describe('generic standalone Panel Action',() => {
  it('exposes stable bound identity without optional Data ports or Run metadata',() => {
    const f=fixture();
    const before=f.port().invocationScope;
    expect(before).toEqual({ targetId:'local',experimentResourceId:'experiment-a',experimentBranch:'main',
      panelId:'controls',portId:'capture',workflowInstanceId:'owner',presetId:'capture' });
    expect(createPanelContext(plugin,f.panel,{},f.host).ports.data).toEqual({});
    f.host.experiment!.head.mainCommitId='new-commit';f.host.experiment!.head.revision++;
    f.host.experimentLifecycle.runMode='physical';
    expect(f.port().invocationScope).toEqual(before);
    f.host.experiment!.head.resourceId='experiment-b';f.host.experiment!.branch.name='new-branch';
    f.host.automation.targetId='another-target';f.panel.id='another-panel';
    const owner=f.panel.portBindings[0]!;const binding=f.panel.portBindings[1]!;
    if (owner.kind!=='workflow' || binding.kind!=='action') throw Error('fixture');
    owner.workflowInstanceId='another-owner';binding.presetId='another-preset';
    expect(f.port().invocationScope).toEqual({ targetId:'another-target',experimentResourceId:'experiment-b',experimentBranch:'new-branch',
      panelId:'another-panel',portId:'capture',workflowInstanceId:'another-owner',presetId:'another-preset' });
    expect(before!.experimentResourceId).toBe('experiment-a');
    expect(f.host.automation.runBoundAutomation).not.toHaveBeenCalled();
  });
  it('passes overrides, frozen source CAS and explicit selector to manual execution without a Session',async () => {
    const f=fixture();
    expect(f.port().executionMode).toBe('standalone');
    await expect(f.port().invoke({ world:'empty' },'Capture')).resolves.toEqual({ id:f.run.id,status:'waiting',revision:3 });
    expect(f.host.automation.runBoundAutomation).toHaveBeenCalledExactlyOnceWith(
      { domain:'automation',resourceId:'worker',branch:'main' },{ world:'empty',runMode:'simulation' },'Capture','','run',{
        experimentRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main' },expectedAutomationRef:f.pin,panelAction:{ panelId:'controls',portId:'capture' },
      });
    expect(f.host.experimentLifecycle.start).not.toHaveBeenCalled();
    expect(f.host.experimentLifecycle.invokeAction).not.toHaveBeenCalled();
    expect(f.port().action?.controls).not.toContain('restart');
  });
  it('keeps mode omission in the existing Session route and refuses standalone primary',async () => {
    const f=fixture();const binding=f.panel.portBindings[1]!;if (binding.kind!=='action') throw Error('fixture');
    delete binding.executionMode;await f.port().invoke({});
    expect(f.host.experimentLifecycle.invokeAction).toHaveBeenCalled();expect(f.host.automation.runBoundAutomation).not.toHaveBeenCalled();
    binding.executionMode='standalone';binding.presetId='primary';await expect(f.port().invoke()).rejects.toThrow('primary workflow');
  });
  it('observes exactly the owner workflow instance history as the standalone discovery source',() => {
    const f=fixture();
    expect(standalonePanelHistoryResources(f.panel,f.host)).toEqual(['worker']);
    const { unmount }=renderHook(() => useStandalonePanelActionHistory(f.panel,f.host,true));
    expect(f.host.automation.refreshExecutionHistory).toHaveBeenCalledExactlyOnceWith('worker');
    unmount();
    const binding=f.panel.portBindings[1]!;if (binding.kind!=='action') throw Error('fixture');
    delete binding.executionMode;
    expect(standalonePanelHistoryResources(f.panel,f.host)).toEqual([]);
    renderHook(() => useStandalonePanelActionHistory(f.panel,f.host,true));
    renderHook(() => useStandalonePanelActionHistory(f.panel,f.host,false));
    expect(f.host.automation.refreshExecutionHistory).toHaveBeenCalledTimes(1);
  });
  it('discovers standalone Runs when a parked route becomes visible',() => {
    const f=fixture();let visible=false;
    const wrapper=({ children }:{ children:ReactNode }) => <ProductRouteVisibilityProvider visible={visible}>{children}</ProductRouteVisibilityProvider>;
    const { rerender }=renderHook(() => useStandalonePanelActionHistory(f.panel,f.host,true),{ wrapper });
    expect(f.host.automation.refreshExecutionHistory).not.toHaveBeenCalled();
    visible=true;rerender();
    expect(f.host.automation.refreshExecutionHistory).toHaveBeenCalledExactlyOnceWith('worker');
    visible=false;rerender();
    expect(f.host.automation.refreshExecutionHistory).toHaveBeenCalledTimes(1);
    visible=true;rerender();
    expect(f.host.automation.refreshExecutionHistory).toHaveBeenCalledTimes(2);
  });
  it('does not claim a same-Action Run or a Run with forged parameter selectors',() => {
    const f=fixture();const { panelAction:_metadata,...legacy }=f.run;
    f.host.automation.runSummaries=[legacy,{ ...legacy,id:'parameters-only',parameters:{ panelAction:f.run.panelAction } } as AutomationRun];
    expect(f.port().activeInvocation).toBeUndefined();expect(f.port().latestInvocation).toBeUndefined();
    expect(standalonePanelRunDetailDemands(f.panel,f.host)).toEqual([]);
  });
  it.each(['port','panel','owner','preset','experiment','target','child'] as const)('rejects foreign %s receipts and control before any Stop effect',async (kind) => {
    const f=fixture();
    if (kind==='port') f.run.panelAction!.portId='foreign';
    if (kind==='panel') f.run.panelAction!.panelId='foreign';
    if (kind==='owner') f.run.panelAction!.workflowInstanceId='foreign';
    if (kind==='preset') f.run.panelAction!.presetId='foreign';
    if (kind==='experiment') f.run.sourceRef.resourceId='foreign';
    if (kind==='target') f.run.targetId='foreign';
    if (kind==='child') f.run.parentRunId='parent';
    await expect(f.port().invoke()).rejects.toThrow('identity mismatch');
    await expect(f.port().control({ id:f.run.id,revision:3,status:'waiting' },'stop')).rejects.toThrow('does not belong');
    expect(f.host.automation.stopRunSet).not.toHaveBeenCalled();
  });
  it('restores exact roots before detail load and never overwrites terminal revision with stale detail',() => {
    const f=fixture();f.host.automation.runSummaries=[f.run];
    expect(f.port().activeInvocation?.id).toBe(f.run.id);
    const release=vi.fn();vi.mocked(f.host.automation.retainRunObservation).mockReturnValue(release);
    const { unmount }=renderHook(() => usePanelRunDetailDemand({ demands:standalonePanelRunDetailDemands(f.panel,f.host),automation:f.host.automation }));
    expect(f.host.automation.retainRunObservation).toHaveBeenCalledExactlyOnceWith(f.run.id);
    f.host.automation.runDetailsById={ [f.run.id]:f.detail };
    f.host.automation.runSummaries=[{ ...f.run,status:'stopped',revision:4 }];
    expect(f.port().activeInvocation).toBeUndefined();expect(f.port().latestInvocation?.status).toBe('stopped');
    unmount();expect(release).toHaveBeenCalledTimes(1);
  });
  it('controls accepted old commits and modes using their frozen action, never Total Stop or current authoring controls',async () => {
    const f=fixture();f.host.automation.runSummaries=[f.run];
    f.host.automation.runDetailsById={ [f.run.id]:f.detail };
    f.host.experiment!.head.mainCommitId='edited';f.host.experimentLifecycle.runMode='physical';f.document.spec.actions[0]!.controls=[];
    expect(f.port().activeInvocation?.id).toBe(f.run.id);
    expect(f.port().action?.controls).toContain('stop');
    await f.port().control({ id:f.run.id,status:'waiting',revision:3 },'stop','Stop exact');
    expect(f.host.automation.stopRunSet).toHaveBeenCalledExactlyOnceWith(f.run,{ includeAnchor:true,includeDetached:true,reason:'Stop exact' });
    expect(f.host.experimentLifecycle.stop).not.toHaveBeenCalled();expect(f.host.experimentLifecycle.stopAction).not.toHaveBeenCalled();
    await expect(f.port().control({ id:f.run.id,status:'waiting',revision:3 },'restart')).rejects.toThrow('Stop or Cancel');
    expect(f.host.automation.runBoundAutomation).not.toHaveBeenCalled();
  });
  it('does not choose a latest Run when more than one exact invocation remains active',async () => {
    const f=fixture();f.host.automation.runSummaries=[f.run,{ ...f.run,id:'second',rootRunId:'second',createdAt:'2026-09-20T00:00:02Z' }];
    expect(f.port().activeInvocation).toBeUndefined();expect(f.port().latestInvocation).toBeUndefined();
    await expect(f.port().invoke()).rejects.toThrow('Multiple independent runs');
    expect(standalonePanelRunDetailDemands(f.panel,f.host).map(({ id }) => id).sort()).toEqual(['independent','second']);
    expect(f.host.automation.runBoundAutomation).not.toHaveBeenCalled();
  });
  it('uses Cancel and refuses missing snapshot or changed expected mode without inventing cleanup completion',async () => {
    const f=fixture();await f.port().control({ id:f.run.id,status:'waiting',revision:3 },'cancel');
    expect(f.host.automation.cancel).toHaveBeenCalledWith(f.run,expect.any(String));
    delete f.detail.snapshot;await expect(f.port().control({ id:f.run.id,status:'waiting',revision:3 },'stop')).rejects.toThrow('source is unavailable');
    await expect(f.port().invoke({ runMode:'physical' })).rejects.toThrow('run mode');
    expect(f.host.automation.stopRunSet).not.toHaveBeenCalled();expect(f.host.automation.runBoundAutomation).not.toHaveBeenCalled();
  });
});
