// @vitest-environment jsdom
import { act,cleanup,renderHook } from '@testing-library/react';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { definePanelPlugin } from '../../../panels/types';
import { newAutomationNode,newAutomationSpec,type AutomationDocument,type AutomationRun,type AutomationRunDetail,type AutomationSpec } from '../../automation/automationPublic';
import { newExperimentSpec,type ExperimentDocument,type PanelInstance } from '../experimentModel';
import { createPanelContext,type PanelContextActions } from './panelContextFactory';
import { automationRefsForPanels,createOfflineVideoActionPort,isClosedOfflineVideoWorkflow,offlineVideoRunDetailDemands } from './offlineVideoAction';
import { usePanelRunDetailDemand } from './panelRunDetailDemand';
import { testPanelExecution } from '../../../test/panelExecutionTestSupport';

const plugin=definePanelPlugin({ id:'scientific-gallery',name:'Analysis',category:'Operations',description:'',capabilities:['visualization','experiment','automation'] as const,
  actionPorts:[{ id:'render-video',label:'Render video',actionKinds:['command'] }],component:() => null });
const ticket={ experimentId:'experiment-a',videoJobId:'1'.repeat(32) };

function fixture() {
  const spec=newAutomationSpec('Offline video');
  spec.targetPolicy={ mode:'fixed',executionTargetId:'local' };
  spec.nodes=[{ ...newAutomationNode('trigger.manual',{},'Request',2),id:'manual' },
    { ...newAutomationNode('video.render-archive',{ experimentId:'pending',videoJobId:'0'.repeat(32) }),id:'render',
      parameterBindings:['experimentId','videoJobId'].map((name) => ({ target:`/${name}`,expression:`{{ $inputs["manual"].${name} }}`,language:'xgc-expression-v2' as const })) }];
  spec.edges=[{ id:'request-to-render',from:'manual',to:'render',condition:'success' }];
  spec.actions=[{ id:'render-video',version:1,label:'Render video',entryNodeId:'manual',kind:'command',
    inputSchema:{ fields:['experimentId','videoJobId'].map((name) => ({ name,kind:'string',required:true,string:{} })) },
    resultSchema:{ fields:[] },controls:['cancel'],requiredCapabilities:['recordings.read','recordings.write','operations.job.control'],projectionContracts:[],
    admission:{ concurrency:{ scope:'workflow',limit:1,onConflict:'reject',appliesTo:'all' } } }];
  const document:AutomationDocument={ head:{ domain:'automation',resourceId:'video-workflow',name:'Video',tags:[],mainCommitId:'commit-1',currentVersion:1,digest:'a'.repeat(64),revision:1,createdAt:'t',updatedAt:'t' },
    branch:{ domain:'automation',resourceId:'video-workflow',name:'main',headCommitId:'commit-1',headVersion:1,revision:1,createdAt:'t',updatedAt:'t' },spec };
  const experiment:ExperimentDocument={ head:{ ...document.head,domain:'experiment',resourceId:'experiment-a' },branch:{ ...document.branch,domain:'experiment',resourceId:'experiment-a' },spec:newExperimentSpec({ name:'Video archive',runModes:['simulation'] }) };
  experiment.spec.workflowInstances=[{ id:'offline-video-production-workflow',ref:{ domain:'automation',resourceId:'video-workflow',branch:'main' },actionPresets:[{ id:'render-video',actionId:'render-video',inputs:{},parameterBindings:[] }] }];
  const panel:PanelInstance={ id:'video-panel',pluginId:plugin.id,title:'Video',gridPos:{ x:0,y:0,w:30,h:16 },query:{},options:{},fieldConfig:{},portBindings:[
    { portId:'panel-workflow',kind:'workflow',workflowInstanceId:'offline-video-production-workflow',presetId:'render-video',managed:false,relation:'detached-observed',failurePolicy:'keep-experiment' },
    { portId:'render-video',kind:'action',presetId:'render-video' },
  ] };
  const pin={ domain:'automation' as const,resourceId:'video-workflow',branch:'main',commitId:'commit-1',version:1,digest:'a'.repeat(64) };
  const run:AutomationRun={ id:'render-run',rootRunId:'render-run',targetId:'local',automationResourceId:'video-workflow',actionId:'render-video',actionVersion:1,
    sourceKind:'automation',sourceRef:pin,automationRef:pin,parameters:ticket,status:'waiting',revision:3,createdAt:'2026-09-20T00:00:00Z',updatedAt:'t',
    definitionId:'video-workflow',definitionVersion:1,configDigest:'a'.repeat(64),executionPlanDigest:'b'.repeat(64),registryDigest:'c'.repeat(64),definitionDigest:'d'.repeat(64),
    executionModel:'orchestration-occurrence-v1',admissionMode:'limited',admissionScope:'all',depth:0,correlationId:'render-run',acceptedAt:'t' };
  const detail:AutomationRunDetail={ run,invocations:[],nodeSummaries:[],loading:false,error:'',snapshot:{ runId:run.id,targetId:'local',sourceKind:'automation',sourceRef:pin,automationRef:pin,
    assetContext:{ schemaVersion:1 },automationSpec:structuredClone(spec),definitionDigest:'b'.repeat(64),digest:'c'.repeat(64),createdAt:'t' } };
  const host:PanelContextActions={ experiment,automation:{ targetId:'local',documents:[document],catalog:[],runSummaries:[],runDetailsById:{},loading:false,error:'',
    runDocument:vi.fn(),runBoundAutomation:vi.fn().mockResolvedValue(run),stop:vi.fn(),cancel:vi.fn(),stopRunSet:vi.fn(),loadRunDetail:vi.fn().mockResolvedValue(detail),
    retainRunDetail:vi.fn(() => vi.fn()),retainRunObservation:vi.fn(() => vi.fn()),refreshExecutionHistory:vi.fn() },
    execution:testPanelExecution(),
    experimentLifecycle:{ runMode:'',start:vi.fn(),stop:vi.fn(),invokeAction:vi.fn(),stopAction:vi.fn() } };
  return { panel,host,document,run,detail,pin };
}

describe('dashboard automation refs',() => {
  it('loads the closed render workflow when the gallery binds render-video beside its plot workflow',() => {
    const panel: PanelInstance = {
      id: 'scientific-gallery',pluginId: 'scientific-gallery',title: 'Analysis',gridPos: { x: 0,y: 0,w: 30,h: 16 },
      query: {},options: {},fieldConfig: {},portBindings: [
        { portId: 'panel-workflow',kind: 'workflow',workflowInstanceId: 'gallery-plot',presetId: 'plot',managed: false,relation: 'detached-observed',failurePolicy: 'keep-experiment' },
        { portId: 'render-video',kind: 'action',presetId: 'render-video' },
      ],
    };
    const plot = { domain: 'automation' as const,resourceId: 'plot-workflow',branch: 'main' };
    const video = { domain: 'automation' as const,resourceId: 'video-workflow',branch: 'main' };
    expect(automationRefsForPanels([
      { id: 'gallery-plot',ref: plot,actionPresets: [] },
      { id: 'offline-video-production-workflow',ref: video,actionPresets: [] },
      { id: 'unused',ref: { domain: 'automation',resourceId: 'other',branch: 'main' },actionPresets: [] },
    ],[panel])).toEqual([plot,video]);
  });
});

describe('Analysis gallery video action',() => {
  afterEach(cleanup);
  it('uses the exact checked workflow pin through the gallery without any Session action or runMode',async () => {
    const f=fixture();
    const port=createPanelContext(plugin,f.panel,{},f.host).ports.actions['render-video']!;
    expect(port.connected).toBe(true);
    expect(await port.invoke(ticket,'Archive render')).toEqual({ id:f.run.id,status:'waiting',revision:3 });
    expect(f.host.automation.runBoundAutomation).toHaveBeenCalledExactlyOnceWith(
      { domain:'automation',resourceId:'video-workflow',branch:'main' },ticket,'Archive render','','render-video',{ expectedAutomationRef:f.pin });
        expect(f.host.experimentLifecycle.invokeAction).not.toHaveBeenCalled();
        expect(f.host.experimentLifecycle.start).not.toHaveBeenCalled();
    });

  it('keeps the same command and detached binding on every other plugin in the normal Session path',async () => {
    const f=fixture();
    const other={ ...plugin,id:'other-panel' };
    f.panel.pluginId=other.id;
    vi.mocked(f.host.experimentLifecycle.invokeAction!).mockResolvedValue({ id:'session-command',status:'waiting',revision:1 });
    const port=createPanelContext(other,f.panel,{},f.host).ports.actions['render-video']!;
    await port.invoke(ticket);
    expect(f.host.experimentLifecycle.invokeAction).toHaveBeenCalledWith(f.panel.id,'render-video',ticket,expect.any(String));
    expect(f.host.automation.runBoundAutomation).not.toHaveBeenCalled();
  });

  const unsafe:Array<[string,(spec:AutomationSpec) => void]>=[
    ['control effect',(spec) => { spec.nodes[1]!.kind='robot.motion'; }],
    ['extra node',(spec) => { spec.nodes.push(newAutomationNode('process.run-bash')); }],
    ['remote target',(spec) => { spec.targetPolicy={ mode:'fixed',executionTargetId:'agent/a' }; }],
    ['inherited target',(spec) => { spec.targetPolicy={ mode:'inherit',executionTargetId:'' }; }],
    ['different action',(spec) => { spec.actions[0]!.id='control'; }],
    ['different trigger',(spec) => { spec.nodes[0]!.typeVersion=1; }],
    ['changed expression',(spec) => { spec.nodes[1]!.parameterBindings![0]!.expression='{{ "another-experiment" }}'; }],
    ['extra binding',(spec) => { spec.nodes[1]!.parameterBindings!.push({ target:'/other',expression:'{}',language:'xgc-expression-v2' }); }],
    ['different parameter',(spec) => { spec.nodes[1]!.parameters.experimentId='other'; }],
    ['failure edge',(spec) => { spec.edges[0]!.condition='failure'; }],
    ['replacement admission',(spec) => { spec.actions[0]!.admission.concurrency!.onConflict='replace'; }],
    ['service',(spec) => { spec.actions[0]!.kind='service'; }],
  ];
  it.each(unsafe)('rejects %s without falling back to System Runner',async (_name,mutate) => {
    const f=fixture();mutate(f.document.spec);
    expect(isClosedOfflineVideoWorkflow(f.document.spec)).toBe(false);
    const port=createPanelContext(plugin,f.panel,{},f.host).ports.actions['render-video']!;
    expect(port.connected).toBe(false);
    await expect(port.invoke(ticket)).rejects.toThrow('published');
    expect(f.host.automation.runBoundAutomation).not.toHaveBeenCalled();
    expect(f.host.experimentLifecycle.invokeAction).not.toHaveBeenCalled();
  });

  it.each(['preset','owner','head','branch','duplicate'] as const)('rejects mismatched %s binding identity',async (kind) => {
    const f=fixture();
    if (kind==='preset') f.host.experiment!.spec.workflowInstances[0]!.actionPresets[0]!.inputs={ videoJobId:'2'.repeat(32) };
    if (kind==='owner') f.host.experiment!.spec.workflowInstances[0]!.ref.resourceId='foreign';
    if (kind==='head') f.document.head.mainCommitId='moved';
    if (kind==='branch') f.document.branch.name='other';
    if (kind==='duplicate') f.panel.portBindings.push(f.panel.portBindings.find((binding) => binding.portId==='render-video')!);
    const port=createOfflineVideoActionPort(f.panel,f.host);
    await expect(port.invoke(ticket)).rejects.toThrow(/published|not loaded|Connect a dedicated/);
    expect(f.host.automation.runBoundAutomation).not.toHaveBeenCalled();
  });

  it.each([{ ...ticket,experimentId:'other' },{ ...ticket,videoJobId:'bad' },{ ...ticket,path:'/tmp/bag' }])('rejects noncanonical ticket inputs %j',async (parameters) => {
    const f=fixture();
    await expect(createOfflineVideoActionPort(f.panel,f.host).invoke(parameters)).rejects.toThrow('exact Experiment');
    expect(f.host.automation.runBoundAutomation).not.toHaveBeenCalled();
  });

  it('propagates expected-pin rejection without weaker retry or a Session fallback',async () => {
    const f=fixture();vi.mocked(f.host.automation.runBoundAutomation).mockRejectedValue(new Error('409 expectedAutomationRef'));
    await expect(createOfflineVideoActionPort(f.panel,f.host).invoke(ticket)).rejects.toThrow('409');
    expect(f.host.automation.runBoundAutomation).toHaveBeenCalledTimes(1);
    expect(f.host.experimentLifecycle.invokeAction).not.toHaveBeenCalled();
  });

  it('observes summary candidates but claims only a frozen video Run belonging to this Experiment',() => {
    const f=fixture();f.host.automation.runSummaries=[f.run,{ ...f.run,id:'foreign',rootRunId:'foreign',automationResourceId:'other' }];
    expect(offlineVideoRunDetailDemands(f.panel,f.host)).toEqual([{ id:f.run.id,targetId:'local',revision:3,frozenSnapshot:true }]);
    expect(createOfflineVideoActionPort(f.panel,f.host).activeInvocation).toBeUndefined();
    f.host.automation.runDetailsById[f.run.id]=f.detail;
    expect(createOfflineVideoActionPort(f.panel,f.host).activeInvocation?.id).toBe(f.run.id);
    f.run.parameters={ ...ticket,experimentId:'another-experiment' };
    expect(createOfflineVideoActionPort(f.panel,f.host).activeInvocation).toBeUndefined();
  });

  it('recovers an independent active Run after refresh through the existing detail retain and enables exact cancellation',async () => {
    const f=fixture();f.host.automation.runSummaries=[f.run];
    const release=vi.fn();vi.mocked(f.host.automation.retainRunObservation).mockReturnValue(release);
    vi.mocked(f.host.automation.loadRunDetail).mockImplementation(async () => {
      f.host.automation.runDetailsById[f.run.id]=f.detail;
      return f.detail;
    });
    const { result,rerender,unmount }=renderHook(() => {
      usePanelRunDetailDemand({ demands:offlineVideoRunDetailDemands(f.panel,f.host),automation:f.host.automation });
      return createPanelContext(plugin,f.panel,{},f.host).ports.actions['render-video']!;
    });
    await act(async () => undefined);
    rerender();
    expect(f.host.automation.loadRunDetail).toHaveBeenCalledExactlyOnceWith(f.run.id);
    expect(f.host.automation.retainRunObservation).toHaveBeenCalledExactlyOnceWith(f.run.id);
    expect(result.current.activeInvocation?.id).toBe(f.run.id);
    await result.current.control(result.current.activeInvocation!,'cancel');
    expect(f.host.automation.cancel).toHaveBeenCalledWith(f.run,expect.any(String));
    unmount();expect(release).toHaveBeenCalledOnce();
  });

  it('honors a newer terminal summary rather than reviving stale active detail',() => {
    const f=fixture();f.host.automation.runDetailsById[f.run.id]=f.detail;
    f.host.automation.runSummaries=[{ ...f.run,revision:4,status:'failed' }];
    const port=createOfflineVideoActionPort(f.panel,f.host);
    expect(port.activeInvocation).toBeUndefined();
    expect(port.latestInvocation).toEqual({ id:f.run.id,status:'failed',revision:4 });
  });

  it('cancels the accepted immutable Run after its authoring head changes, never the Experiment',async () => {
    const f=fixture();f.document.head.mainCommitId=f.document.branch.headCommitId='commit-2';
    f.document.spec.nodes[1]!.kind='process.run-bash';
    const port=createOfflineVideoActionPort(f.panel,f.host);
    expect(port.connected).toBe(false);
    await port.control({ id:f.run.id,status:'waiting',revision:3 },'cancel','Cancel render');
    expect(f.host.automation.cancel).toHaveBeenCalledExactlyOnceWith(f.run,'Cancel render');
    expect(f.host.automation.stop).not.toHaveBeenCalled();
    expect(f.host.experimentLifecycle.stopAction).not.toHaveBeenCalled();
    expect(f.host.experimentLifecycle.stop).not.toHaveBeenCalled();
  });

  it.each(['experiment','snapshot','source','child','target','id'] as const)('refuses cancel when %s proof differs',async (kind) => {
    const f=fixture();
    if (kind==='experiment') f.run.parameters={ ...ticket,experimentId:'other' };
    if (kind==='snapshot') f.detail.snapshot!.automationSpec.nodes[1]!.kind='process.run-bash';
    if (kind==='source') f.run.sourceKind='experiment';
    if (kind==='child') f.run.parentRunId='other-root';
    if (kind==='target') f.run.targetId='agent/a';
    if (kind==='id') f.run.id=f.run.rootRunId='other';
    await expect(createOfflineVideoActionPort(f.panel,f.host).control({ id:'render-run',status:'waiting',revision:3 },'cancel')).rejects.toThrow('not this Experiment');
    expect(f.host.automation.cancel).not.toHaveBeenCalled();
  });
});
