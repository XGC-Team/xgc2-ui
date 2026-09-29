// @vitest-environment jsdom

import { act,render,screen,waitFor } from '@testing-library/react';
import { useEffect,useState } from 'react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { AutomationPanelContext } from '../../../panels/types';
import type * as AutomationPublicModule from '../../automation/automationPublic';
import type * as ExecutionPublicModule from '../../execution/executionPublic';
import * as http from '../../../api/http';
import type { ExperimentRunView,ExperimentSessionView } from '../experimentWorkflowModel';
import { newAutomationSpec } from '../../automation/automationPublic';
import { PanelAutomationRuntimeProvider } from './PanelAutomationRuntimeProvider';
import { panelAutomationRuntime,useDashboardRunSnapshot,type DashboardRunLifecycle } from './dashboardRunStore';
import type { ExperimentDashboardActions } from './useExperimentDashboardActions';

const mocks = vi.hoisted(() => ({
  useAutomationWorkspace:vi.fn(),
  observerMounts:[] as string[],
  observerUnmounts:[] as string[],
}));
vi.mock('../../automation/automationPublic',async (importOriginal) => ({
  ...await importOriginal<typeof AutomationPublicModule>(),
  useAutomationWorkspace:(targetId:string) => mocks.useAutomationWorkspace(targetId),
}));
vi.mock('../../execution/executionPublic',async (importOriginal) => ({
  ...await importOriginal<typeof ExecutionPublicModule>(),
  useExecutionEventChannel:() => ({ streamId:'stream-1',streamState:'connected',error:'' }),
}));

describe('PanelAutomationRuntimeProvider',() => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.observerMounts.length=0;
    mocks.observerUnmounts.length=0;
  });

  it('keeps the dashboard owner when the fallback repeats its target with a failed catalog',() => {
    const owner=runtime('local');
    const fallback={ ...runtime('local'),error:'catalog timed out' };
    function Probe() {
      const selected=panelAutomationRuntime(useDashboardRunSnapshot(),'local','local');
      return <span>{selected===owner ? 'dashboard owner' : 'duplicate observer'}</span>;
    }
    render(<PanelAutomationRuntimeProvider targetIds={['local']} lifecycle={lifecycle(owner,fallback)}><Probe /></PanelAutomationRuntimeProvider>);
    expect(screen.getByText('dashboard owner')).toBeInTheDocument();
  });

  it('opens one shared workspace per distinct additional Agent target',() => {
    const local = runtime('local');
    mockWorkspaces();
    const { unmount }=render(<PanelAutomationRuntimeProvider
      targetIds={['agent-a','agent-a','local']}
      lifecycle={lifecycle(local,local)}
    >
      <RuntimeTarget targetId="agent-a" />
      <RuntimeTarget targetId="agent-a" />
      <RuntimeTarget targetId="local" />
    </PanelAutomationRuntimeProvider>);

    expect(mocks.observerMounts).toEqual(['agent-a']);
    expect(mocks.useAutomationWorkspace).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('agent-a')).toHaveLength(2);
    expect(screen.getByText('local')).toBeInTheDocument();
    unmount();
    expect(mocks.observerUnmounts).toEqual(['agent-a']);
  });

  it('discovers only the open Run/Session relation closure and preserves the child subtree',async() => {
    const local=runtime('local',{
      'dispatcher-succeeded':runDetail('dispatcher-succeeded',[
        childRelation('agent-a-child','agent-a','dispatcher-succeeded'),
      ]),
      'active-run-id':runDetail('active-run-id'),
      'unrelated-history':runDetail('unrelated-history',[
        childRelation('outside-child','outside-target','unrelated-history'),
      ]),
    });
    const agentA=runtime('agent-a',{
      'agent-a-child':runDetail('agent-a-child',[
        childRelation('agent-b-child','agent-b','agent-a-child'),
      ]),
    });
    const agentB=runtime('agent-b');
    mockWorkspaces(new Map([['agent-a',agentA],['agent-b',agentB]]));

    let probeMounts=0;
    let probeUnmounts=0;
    let latestAgentRuntime:AutomationPanelContext['automation']|undefined;
    function Probe() {
      const [identity]=useState(() => `probe-${++probeMounts}`);
      useEffect(() => () => { probeUnmounts+=1; },[]);
      latestAgentRuntime=panelAutomationRuntime(useDashboardRunSnapshot(),'agent-a','local');
      return <output data-testid="stable-probe">{identity}:{latestAgentRuntime.targetId}</output>;
    }

    const openActions={
      activeRuns:[runView('active-run-id','local','dispatcher-succeeded')],
      sessionViews:[sessionView('active','dispatcher-succeeded','succeeded')],
    } as unknown as ExperimentDashboardActions;
    const closedActions={
      activeRuns:[],
      sessionViews:[sessionView('succeeded','dispatcher-succeeded','succeeded')],
    } as unknown as ExperimentDashboardActions;
    const { rerender,unmount }=render(
      <PanelAutomationRuntimeProvider targetIds={[]} lifecycle={lifecycle(local,local,openActions)}>
        <Probe />
      </PanelAutomationRuntimeProvider>,
    );

    await screen.findByText('probe-1:agent-a');
    await waitFor(() => expect([...mocks.observerMounts].sort()).toEqual(['agent-a','agent-b']));
    expect(new Set(mocks.useAutomationWorkspace.mock.calls.map(([targetId]) => targetId)))
      .toEqual(new Set(['agent-a','agent-b']));
    expect(mocks.useAutomationWorkspace).toHaveBeenCalledTimes(2);
    expect(mocks.observerMounts.sort()).toEqual(['agent-a','agent-b']);
    expect(latestAgentRuntime?.stop).toBe(agentA.stop);
    expect(latestAgentRuntime?.runBoundAutomation).toBe(agentA.runBoundAutomation);
    expect(probeMounts).toBe(1);
    expect(probeUnmounts).toBe(0);

    rerender(
      <PanelAutomationRuntimeProvider targetIds={[]} lifecycle={lifecycle(local,local,closedActions)}>
        <Probe />
      </PanelAutomationRuntimeProvider>,
    );
    await screen.findByText('probe-1:local');
    await waitFor(() => expect([...mocks.observerUnmounts].sort()).toEqual(['agent-a','agent-b']));
    expect(mocks.observerMounts.sort()).toEqual(['agent-a','agent-b']);
    expect(probeMounts).toBe(1);
    expect(probeUnmounts).toBe(0);
    unmount();
    expect(probeUnmounts).toBe(1);
    expect(mocks.useAutomationWorkspace.mock.calls.some(([targetId]) => targetId==='outside-target')).toBe(false);
  });

  it('shares one exact bound definition across Panels without replacing target-owned runtime or commands',async () => {
    const local=runtime('local');
    const agent=runtime('agent-a');
    const known=[local,agent];
    let resolve!:(document:AutomationPublicModule.AutomationDocument) => void;
    const pending=new Promise<AutomationPublicModule.AutomationDocument>((done) => { resolve=done; });
    const read=vi.spyOn(http,'request').mockReturnValueOnce(pending);
    const observations:AutomationPanelContext['automation'][]=[];
    function RuntimeProbe({ targetId }:{ targetId:string }) {
      observations.push(panelAutomationRuntime(useDashboardRunSnapshot(),targetId,'dashboard'));
      return null;
    }
    const binding={ domain:'automation',resourceId:'camera',branch:'review' };
    const { unmount }=render(<PanelAutomationRuntimeProvider
      targetIds={['local','agent-a']} lifecycle={lifecycle(local,agent)} scopeKey="experiment-a"
      workflowRefs={[binding,binding]}
    >
      <RuntimeProbe targetId="local" /><RuntimeProbe targetId="agent-a" />
    </PanelAutomationRuntimeProvider>);
    expect(read).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith('/automations/camera?branch=review',{ signal:expect.any(AbortSignal) });
    expect(observations.slice(-2).map((value) => value.documents)).toEqual([[],[]]);
    const document:AutomationPublicModule.AutomationDocument={
      head:{ domain:'automation',resourceId:'camera',name:'Camera',tags:[],revision:2,currentVersion:2,
        digest:'digest',mainCommitId:'commit',createdAt:'t',updatedAt:'t' },
      branch:{ domain:'automation',resourceId:'camera',name:'review',revision:2,headVersion:2,
        headCommitId:'commit',createdAt:'t',updatedAt:'t' },
      spec:newAutomationSpec('Camera'),
    };
    await act(async () => resolve(document));
    observations.slice(-2).forEach((value,index) => {
      expect(value.documents).toEqual([document]);
      expect(value.targetId).toBe(known[index].targetId);
      expect(value.runDetailsById).toBe(known[index].runDetailsById);
      expect(value.stop).toBe(known[index].stop);
      expect(value.runBoundAutomation).toBe(known[index].runBoundAutomation);
    });
    unmount();
    read.mockRestore();
  });
});

function RuntimeTarget({ targetId }: { targetId:string }) {
  return <span>{panelAutomationRuntime(useDashboardRunSnapshot(),targetId,'dashboard').targetId}</span>;
}

function lifecycle(
  automation:AutomationPanelContext['automation'],
  localAutomation:AutomationPanelContext['automation'],
  actions:ExperimentDashboardActions={} as ExperimentDashboardActions,
):DashboardRunLifecycle {
  return { actions,automation,localAutomation };
}

function runtime(
  targetId:string,
  runDetailsById:AutomationPanelContext['automation']['runDetailsById']={},
):AutomationPanelContext['automation'] {
  return {
    targetId,documents:[],catalog:[],runSummaries:[],runDetailsById,loading:false,error:'',
    runDocument:vi.fn(),runBoundAutomation:vi.fn(),stop:vi.fn(),cancel:vi.fn(),stopRunSet:vi.fn(),
    loadRunDetail:vi.fn(),retainRunDetail:vi.fn(() => vi.fn()),retainRunObservation:vi.fn(() => vi.fn()),refreshExecutionHistory:vi.fn(),
  };
}

function mockWorkspaces(workspaces:ReadonlyMap<string,AutomationPanelContext['automation']>=new Map()) {
  mocks.useAutomationWorkspace.mockImplementation((targetId:string) => {
    useEffect(() => {
      mocks.observerMounts.push(targetId);
      return () => { mocks.observerUnmounts.push(targetId); };
    },[targetId]);
    return workspaces.get(targetId) ?? runtime(targetId);
  });
}

function runDetail(
  runId:string,
  childRuns:AutomationPublicModule.AutomationChildRunRelation[]=[],
):AutomationPublicModule.AutomationRunDetail {
  return {
    invocations:[],nodeSummaries:[],
    relations:{runId,childRuns,childRunGroups:[],childRunGroupMembers:[],waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[]},
    loading:false,error:'',
  };
}

function childRelation(
  childRunId:string,targetId:string,parentRunId:string,
):AutomationPublicModule.AutomationChildRunRelation {
  return {
    id:`relation-${parentRunId}-${childRunId}`,targetId,rootRunId:'dispatcher-succeeded',parentRunId,
    parentInvocationId:`invoke-${parentRunId}`,callNodeId:'run-child',ordinal:0,childRunId,ownerRunId:parentRunId,
    childDefinitionId:'child-automation',childDefinitionVersion:1,childConfigDigest:'config',
    childExecutionPlanDigest:'plan',childRegistryDigest:'registry',childDefinitionDigest:'definition',
    triggerNodeId:'entry',relation:'supervised',waitPolicy:'wait',cancelPolicy:'retain',resultPolicy:'discard',
    createdAt:'t',updatedAt:'t',boundAt:'t',runStatus:'running',runRevision:1,revision:1,
  } as AutomationPublicModule.AutomationChildRunRelation;
}

function runView(id:string,targetId:string,rootRunId:string):ExperimentRunView {
  return { id,targetId,rootRunId } as ExperimentRunView;
}

function sessionView(
  state:ExperimentSessionView['session']['state'],ownerId:string,memberStatus:ExperimentSessionView['members'][number]['status'],
):ExperimentSessionView {
  return {
    session:{id:'session-1',targetId:'local',experimentResourceId:'experiment-a',state,mode:'full',runMode:'simulation',revision:1},
    members:[{id:'workflow-run-member',targetId:'local',sessionId:'session-1',bindingId:'workflow',kind:'workflow_run',ownerId,status:memberStatus,revision:1}],
  };
}
