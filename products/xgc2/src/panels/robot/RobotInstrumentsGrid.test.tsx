// @vitest-environment jsdom

import { fireEvent,render } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { RobotInstrumentsGrid } from './RobotInstrumentsGrid';
import { resolveRobotInstrumentRoster } from './robotProjectionModel';
import { robotAssetKindCompositionWithUnitreeB2 } from '../../../test-fixtures/robot-kinds/with-unitree-b2';

const compositionRef = vi.hoisted(() => ({ current:undefined as unknown }));
const useRunRobots = vi.hoisted(() => vi.fn(() => ({
  operations:[],streamState:'idle' as const,loaded:false,loading:false,error:'',
})));
const useRobotSelection = vi.hoisted(() => vi.fn((): [string[],() => void] => [[],vi.fn()]));
const useUgvChassisHold = vi.hoisted(() => vi.fn((): [boolean,() => void] => [false,vi.fn()]));
const useRobotInstrumentBoard = vi.hoisted(() => vi.fn(() => ({
  viewMode:'workflow',pageIndex:0,pageCount:1,pageSize:1,pagedRobotIds:[] as string[],boardRowHeight:0,
  panelRef:{ current:null },boardRef:{ current:null },selectionBoxRef:{ current:null },
  setPageIndex:vi.fn(),toggleRobot:vi.fn(),beginBoxSelection:vi.fn(),moveBoxSelection:vi.fn(),
  finishBoxSelection:vi.fn(),clearSelectionBox:vi.fn(),
})));

vi.mock('../../domains/robot/robotPublic',() => ({
  useRobotText: () => (text: string,values?: Readonly<Record<string,string | number>>) => (
    values
      ? text.replace(/\{(\w+)\}/g,(match,key: string) => String(values[key] ?? match))
      : text
  ),
  useRunRobots,
  useRobotSelection,
  useUgvChassisHold,
}));
vi.mock('../../domains/robot/robotAssetPublic',async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRobotAssetKindComposition:() => compositionRef.current,
}));
vi.mock('./useRobotInstrumentBoard',() => ({
  useRobotInstrumentBoard,
}));
vi.mock('./RobotSimulationWorkflow',() => ({
  RobotSimulationWorkflow:() => <div data-testid="robot-workflow" />,
}));
vi.mock('./RobotProjectionCard',() => ({
  RobotProjectionCard:({ robot,selected,chassisHold,onSelect }:{
    robot:{ id:string };selected:boolean;chassisHold?:boolean;onSelect:(id:string) => void;
  }) => (
    <article data-xgc-role="run-robot-card" data-xgc-id={robot.id} aria-pressed={selected}
      data-xgc-chassis-hold={chassisHold ? 'true' : undefined}
      onClick={() => onSelect(robot.id)} />
  ),
}));

describe('RobotInstrumentsGrid projection ownership',() => {
  beforeEach(() => {
    useRunRobots.mockClear();
    useRobotSelection.mockReset();
    useRobotSelection.mockReturnValue([[],vi.fn()]);
    useUgvChassisHold.mockReset();
    useUgvChassisHold.mockReturnValue([false,vi.fn()]);
    useRobotInstrumentBoard.mockReset();
    useRobotInstrumentBoard.mockReturnValue({
      viewMode:'workflow',pageIndex:0,pageCount:1,pageSize:1,pagedRobotIds:[],boardRowHeight:0,
      panelRef:{ current:null },boardRef:{ current:null },selectionBoxRef:{ current:null },
      setPageIndex:vi.fn(),toggleRobot:vi.fn(),beginBoxSelection:vi.fn(),moveBoxSelection:vi.fn(),
      finishBoxSelection:vi.fn(),clearSelectionBox:vi.fn(),
    });
  });

  it('observes the exact Session workflow owner which aggregates its connection slots',() => {
    render(<RobotInstrumentsGrid
      panel={{ id:'robot-instruments',options:{ typeFilter:'all' } } as never}
      context={{
        executionTargetId:'local',ports:{
          actions:{
            'robot-simulation':{
              id:'robot-simulation',label:'Robot simulation',connected:true,disabledReason:'',defaults:{},
              activeInvocation:{ id:'panel-robot-runtime-run',status:'running',revision:3 },
              invoke:vi.fn(),control:vi.fn(),trace:{
                automationResourceId:'robot-runtime',workflowInstanceId:'robot-runtime',
              },
            },
          },
          data:{
            'robot-runtime':{
              id:'robot-runtime',label:'Experiment runtime',contract:'experiment.runtime.v1',connected:true,
              value:{
                targetId:'local',activeRun:{ id:'experiment-root-run',targetId:'local' },
                activeRuns:[{ id:'experiment-root-run',targetId:'local' }],
                sessionViews:[{ session:{ id:'session-1',targetId:'local',experimentResourceId:'experiment-1',
                  state:'active',mode:'full',runMode:'simulation',revision:1 },members:[{
                  id:'member-1',targetId:'local',sessionId:'session-1',bindingId:'robot-runtime',kind:'workflow_run',
                  ownerId:'panel-robot-runtime-run',status:'running',revision:1,
                }] }],processInstances:[],documents:[],catalog:[],runSummaries:[],runDetailsById:{},loading:false,error:'',
              },trace:{ projection:'experiment.runtime.v1' },
            },
            robots:{ id:'robots',label:'Robots',contract:'experiment.robots.v1',connected:false,value:undefined,trace:{} },
            'robot-assets':{ id:'robot-assets',label:'Robot assets',contract:'robot.assets.v1',connected:true,
              value:{ assets:[],loading:false,error:'' },trace:{} },
          },
          authoring:{},interactions:{},
        },
      } as never}
    />);

    expect(useRunRobots).toHaveBeenCalledWith('local','panel-robot-runtime-run');
    expect(useRunRobots).not.toHaveBeenCalledWith('local','experiment-root-run');
  });

  it('does not probe a Panel child until its exact Session root is resolved',() => {
    render(<RobotInstrumentsGrid
      panel={{ id:'robot-instruments',options:{ typeFilter:'all' } } as never}
      context={{ executionTargetId:'local',ports:{
        actions:{ 'robot-simulation':{
          id:'robot-simulation',label:'Robot simulation',connected:true,disabledReason:'',defaults:{},
          activeInvocation:{ id:'panel-child',status:'running',revision:1 },
          invoke:vi.fn(),control:vi.fn(),trace:{
            automationResourceId:'robot-runtime',workflowInstanceId:'robot-runtime',
          },
        } },
        data:{
          'robot-runtime':{ id:'robot-runtime',label:'Experiment runtime',contract:'experiment.runtime.v1',connected:true,
            value:{ targetId:'local',activeRun:{ id:'session-root',targetId:'local' },activeRuns:[{ id:'session-root',targetId:'local' }],
              processInstances:[],documents:[],catalog:[],runSummaries:[],runDetailsById:{},loading:false,error:'' },
            trace:{ projection:'experiment.runtime.v1' } },
          robots:{ id:'robots',label:'Robots',contract:'experiment.robots.v1',connected:false,value:undefined,trace:{} },
          'robot-assets':{ id:'robot-assets',label:'Robot assets',contract:'robot.assets.v1',connected:true,
            value:{ assets:[],loading:false,error:'' },trace:{} },
        },authoring:{},interactions:{},
      } } as never}
    />);

    expect(useRunRobots).toHaveBeenCalledWith('local',undefined);
    expect(useRunRobots).not.toHaveBeenCalledWith('local','panel-child');
  });

  it('withdraws the projection transport as soon as the Session starts stopping',() => {
    render(<RobotInstrumentsGrid
      panel={{ id:'robot-instruments',options:{ typeFilter:'all' } } as never}
      context={{ executionTargetId:'local',ports:{
        actions:{ 'robot-simulation':{
          id:'robot-simulation',label:'Robot simulation',connected:true,disabledReason:'',defaults:{},
          activeInvocation:{ id:'panel-child',status:'stopping',revision:4 },
          invoke:vi.fn(),control:vi.fn(),trace:{
            automationResourceId:'robot-runtime',workflowInstanceId:'robot-runtime',
          },
        } },
        data:{
          'robot-runtime':{ id:'robot-runtime',label:'Experiment runtime',contract:'experiment.runtime.v1',connected:true,
            value:{ targetId:'local',sessionViews:[{
              session:{ id:'session-1',targetId:'local',state:'stopping' },members:[{
                id:'member-1',targetId:'local',sessionId:'session-1',bindingId:'robot-runtime',kind:'workflow_run',
                ownerId:'panel-child',status:'stopping',revision:4,
              }],
            }],processInstances:[],documents:[],catalog:[],runSummaries:[],runDetailsById:{},loading:false,error:'' },
            trace:{ projection:'experiment.runtime.v1' } },
          robots:{ id:'robots',label:'Robots',contract:'experiment.robots.v1',connected:false,value:undefined,trace:{} },
          'robot-assets':{ id:'robot-assets',label:'Robot assets',contract:'robot.assets.v1',connected:true,
            value:{ assets:[],loading:false,error:'' },trace:{} },
        },authoring:{},interactions:{},
      } } as never}
    />);

    expect(useRunRobots).toHaveBeenCalledWith('local',undefined);
    expect(useRunRobots).not.toHaveBeenCalledWith('local','panel-child');
  });

  it('keeps card selection without a provider-restart control in the content',() => {
    const toggleRobot = vi.fn();
    useRunRobots.mockReturnValue({
      projection:{ robots:[{
        id:'scout-01',name:'Scout 01',kind:'scout_mini',hybridSource:'simulation',connectionState:'live',
      }] },
      operations:[],streamState:'idle',loaded:true,loading:false,error:'',
    } as never);
    useRobotSelection.mockReturnValue([['scout-01'],vi.fn()]);
    useRobotInstrumentBoard.mockReturnValue({
      viewMode:'list',pageIndex:0,pageCount:1,pageSize:1,pagedRobotIds:['scout-01'],boardRowHeight:0,
      panelRef:{ current:null },boardRef:{ current:null },selectionBoxRef:{ current:null },
      setPageIndex:vi.fn(),toggleRobot,beginBoxSelection:vi.fn(),moveBoxSelection:vi.fn(),
      finishBoxSelection:vi.fn(),clearSelectionBox:vi.fn(),
    });
    const { container } = render(<RobotInstrumentsGrid
      panel={{ id:'robot-instruments',options:{ typeFilter:'all' } } as never}
      context={{
        executionTargetId:'local',ports:{
          actions:{
            'robot-simulation':{
              id:'robot-simulation',label:'Robot simulation',connected:true,disabledReason:'',defaults:{},
              invoke:vi.fn(),control:vi.fn(),trace:{ automationResourceId:'robot-runtime' },
            },
          },
          data:{
            'robot-runtime':{
              id:'robot-runtime',label:'Experiment runtime',contract:'experiment.runtime.v1',connected:true,
              value:{ targetId:'local',activeRun:{ id:'experiment-root-run' },processInstances:[],documents:[],
                catalog:[],runSummaries:[],runDetailsById:{},loading:false,error:'' },
              trace:{ projection:'experiment.runtime.v1' },
            },
            robots:{ id:'robots',label:'Robots',contract:'experiment.robots.v1',connected:false,value:undefined,trace:{} },
            'robot-assets':{ id:'robot-assets',label:'Robot assets',contract:'robot.assets.v1',connected:true,
              value:{ assets:[],loading:false,error:'' },trace:{} },
          },
          authoring:{},interactions:{},
        },
      } as never}
    />);
    const card = container.querySelector<HTMLElement>('[data-xgc-role="run-robot-card"][data-xgc-id="scout-01"]');
    expect(card).toHaveAttribute('aria-pressed','true');
    expect(container.querySelectorAll('[data-xgc-role="robot-provider-restart"]')).toHaveLength(0);
    fireEvent.click(card!);
    expect(toggleRobot).toHaveBeenCalledWith('scout-01');
  });

  it('marks only UGV cards while chassis hold is latched',() => {
    useRunRobots.mockReturnValue({
      projection:{ robots:[
        { id:'scout-01',name:'Scout 01',kind:'scout_mini',hybridSource:'simulation',connectionState:'live' },
        { id:'px4-01',name:'UAV 01',kind:'px4_multirotor',px4:{},hybridSource:'simulation',connectionState:'live' },
      ] },
      operations:[],streamState:'idle',loaded:true,loading:false,error:'',
    } as never);
    useUgvChassisHold.mockReturnValue([true,vi.fn()]);
    useRobotInstrumentBoard.mockReturnValue({
      viewMode:'list',pageIndex:0,pageCount:1,pageSize:2,pagedRobotIds:['scout-01','px4-01'],boardRowHeight:0,
      panelRef:{ current:null },boardRef:{ current:null },selectionBoxRef:{ current:null },
      setPageIndex:vi.fn(),toggleRobot:vi.fn(),beginBoxSelection:vi.fn(),moveBoxSelection:vi.fn(),
      finishBoxSelection:vi.fn(),clearSelectionBox:vi.fn(),
    });
    const { container } = render(<RobotInstrumentsGrid
      panel={{ id:'robot-instruments',options:{ typeFilter:'all' } } as never}
      context={{
        executionTargetId:'local',sharedStateScope:'experiment',ports:{
          actions:{
            'robot-simulation':{
              id:'robot-simulation',label:'Robot simulation',connected:true,disabledReason:'',defaults:{},
              invoke:vi.fn(),control:vi.fn(),trace:{ automationResourceId:'robot-runtime' },
            },
          },
          data:{
            'robot-runtime':{
              id:'robot-runtime',label:'Experiment runtime',contract:'experiment.runtime.v1',connected:true,
              value:{ targetId:'local',activeRun:{ id:'experiment-root-run' },processInstances:[],documents:[],
                catalog:[],runSummaries:[],runDetailsById:{},loading:false,error:'' },
              trace:{ projection:'experiment.runtime.v1' },
            },
            robots:{ id:'robots',label:'Robots',contract:'experiment.robots.v1',connected:false,value:undefined,trace:{} },
            'robot-assets':{ id:'robot-assets',label:'Robot assets',contract:'robot.assets.v1',connected:true,
              value:{ assets:[],loading:false,error:'' },trace:{} },
          },
          authoring:{},interactions:{},
        },
      } as never}
    />);
    expect(container.querySelector('[data-xgc-role="run-robot-card"][data-xgc-id="scout-01"]'))
      .toHaveAttribute('data-xgc-chassis-hold','true');
    expect(container.querySelector('[data-xgc-role="run-robot-card"][data-xgc-id="px4-01"]'))
      .not.toHaveAttribute('data-xgc-chassis-hold');
  });

compositionRef.current = robotAssetKindCompositionWithUnitreeB2;

describe('resolveRobotInstrumentRoster',() => {
  const staticA = { id:'scout-01',name:'Scout A' };
  const staticB = { id:'px4-01',name:'PX4 B' };

  it('keeps pending/empty runtime from deleting static cards (no No-matching)',() => {
    expect(resolveRobotInstrumentRoster([staticA,staticB],[]))
      .toEqual([staticA,staticB]);
    expect(resolveRobotInstrumentRoster([staticA,staticB],undefined))
      .toEqual([staticA,staticB]);
  });

  it('overrides matched ids with runtime data and keeps static order/set',() => {
    const runtime = [
      { id:'px4-01',name:'PX4 B live' },
      { id:'ghost-99',name:'unknown runtime-only robot' },
    ];
    const merged = resolveRobotInstrumentRoster([staticA,staticB],runtime);
    expect(merged).toHaveLength(2);                       // unknown id dropped
    expect(merged.map((robot) => robot.id)).toEqual(['scout-01','px4-01']);
    expect((merged[1] as { name:string }).name).toBe('PX4 B');       // frozen slot label
    expect((merged[0] as { name:string }).name).toBe('Scout A');     // untouched
  });

  it('keeps the four-Scout frozen roster while connection slots report progressively',() => {
    const frozen = [1,2,3,4].map((ordinal) => ({
      id:`scout-0${ordinal}`,
      name:`Scout 0${ordinal}`,
      connectionState:'inactive',
      online:false,
      channels:{},
    }));
    const partial = [{
      ...frozen[2]!,
      connectionState:'live',
      online:true,
      channels:{ 'vrpn.position':{ value:{ position:{ x:0,y:3,z:0.18 } } } },
    },{
      ...frozen[0]!,
      connectionState:'live',
      online:true,
      channels:{ 'vrpn.position':{ value:{ position:{ x:0,y:0,z:0.18 } } } },
    }];

    const merged=resolveRobotInstrumentRoster(frozen,partial);

    expect(merged.map((robot) => robot.id)).toEqual([
      'scout-01','scout-02','scout-03','scout-04',
    ]);
    expect(merged.map((robot) => [robot.connectionState,robot.online])).toEqual([
      ['live',true],['inactive',false],['live',true],['inactive',false],
    ]);
    expect(merged[0]?.channels).toEqual(partial[1]?.channels);
    expect(merged[2]?.channels).toEqual(partial[0]?.channels);
  });

  it('falls back to the runtime projection when the frozen roster is empty',() => {
    const runtime = [{ id:'runtime-only-1',name:'R1' }];
    expect(resolveRobotInstrumentRoster([],runtime)).toEqual(runtime);
    expect(resolveRobotInstrumentRoster([],undefined)).toEqual([]);
  });
});
});

describe('RobotInstrumentsGrid frozen-roster rendering',() => {
  const b2Asset = {
    head: {
      domain:'robot',resourceId:'robot-b2',name:'B2 01',tags:[],mainCommitId:'b2-c1',
      currentVersion:1,digest:'b2',revision:1,createdAt:'',updatedAt:'',
    },
    branch: {
      domain:'robot',resourceId:'robot-b2',name:'main',headCommitId:'b2-c1',
      headVersion:1,revision:1,createdAt:'',updatedAt:'',
    },
    spec: {
      name:'B2 01',description:'',tags:[],kind:'unitree_b2',profileId:'unitree.b2.v1',
      unitreeB2:{
        serialNumber:'b2-01.lab.local',robotAddress:'b2-01.lab.local',
        rosDomainId:42,sshUsername:'thor',sshPassword:'1',
      },
    },
  };
  const experimentDoc = {
    head:{ resourceId:'exp-1' },branch:{ name:'main' },
    spec:{ robots:[{
      id:'b2-01',
      ref:{ domain:'robot',resourceId:'robot-b2',branch:'main' },
      namespace:'/b21',hybridSource:'physical',runtimeParameters:{},
      initialPose:{ x:0,y:0,z:0,yaw:0 },unitreeB2:{},
    }] },
  };

  function gridContext(options:{
    projectionRobots?:unknown[];
    assetsValue?:{ assets:unknown[];loading:boolean;error:string };
    robotsValue?:unknown;
    pagedRobotIds:string[];
    viewMode?:'list'|'workflow';
  }) {
    return {
      executionTargetId:'local',ports:{
        actions:{ 'robot-simulation':{
          id:'robot-simulation',label:'Robot simulation',connected:true,disabledReason:'',
          defaults:{},invoke:vi.fn(),control:vi.fn(),trace:{ automationResourceId:'robot-runtime' },
        } },
        data:{
          'robot-runtime':{
            id:'robot-runtime',label:'Experiment runtime',contract:'experiment.runtime.v1',connected:true,
            value:{
              targetId:'local',activeRun:{ id:'experiment-root-run' },
              processInstances:[],documents:[],catalog:[],runSummaries:[],
              runDetailsById:{},loading:false,error:'',
            },
            trace:{ projection:'experiment.runtime.v1' },
          },
          robots:{ id:'robots',label:'Robots',contract:'experiment.robots.v1',
            connected:true,value:options.robotsValue ?? experimentDoc,trace:{} },
          'robot-assets':{ id:'robot-assets',label:'Robot assets',contract:'robot.assets.v1',
            connected:true,value:options.assetsValue
              ?? { assets:[b2Asset],loading:false,error:'' },trace:{} },
        },
        authoring:{},interactions:{},
      },
    };
  }

  it('keeps the frozen-roster card while the run projection is still pending-empty',() => {
    useRunRobots.mockReturnValue({
      projection:{ pending:true,robots:[] },
      operations:[],streamState:'idle',loaded:true,loading:false,error:'',
    } as never);
    useRobotSelection.mockReturnValue([[],vi.fn()]);
    useRobotInstrumentBoard.mockReturnValue({
      viewMode:'list',pageIndex:0,pageCount:1,pageSize:1,
      pagedRobotIds:['b2-01'],boardRowHeight:0,
      panelRef:{ current:null },boardRef:{ current:null },selectionBoxRef:{ current:null },
      setPageIndex:vi.fn(),toggleRobot:vi.fn(),beginBoxSelection:vi.fn(),
      moveBoxSelection:vi.fn(),finishBoxSelection:vi.fn(),clearSelectionBox:vi.fn(),
    });
    const { container } = render(<RobotInstrumentsGrid
      panel={{ id:'robot-instruments',options:{ typeFilter:'all' } } as never}
      context={gridContext({ projectionRobots:[],pagedRobotIds:['b2-01'] }) as never}
    />);
    expect(container.querySelector('[data-xgc-role="run-robot-card"][data-xgc-id="b2-01"]'))
      .not.toBeNull();
    expect(container.textContent).not.toContain('No matching robots');
  });

  it('shows No matching robots only when both roster and runtime are empty',() => {
    useRunRobots.mockReturnValue({
      operations:[],streamState:'idle',loaded:false,loading:false,error:'',
    });
    useRobotSelection.mockReturnValue([[],vi.fn()]);
    useRobotInstrumentBoard.mockReturnValue({
      viewMode:'list',pageIndex:0,pageCount:1,pageSize:1,pagedRobotIds:[],
      boardRowHeight:0,
      panelRef:{ current:null },boardRef:{ current:null },selectionBoxRef:{ current:null },
      setPageIndex:vi.fn(),toggleRobot:vi.fn(),beginBoxSelection:vi.fn(),
      moveBoxSelection:vi.fn(),finishBoxSelection:vi.fn(),clearSelectionBox:vi.fn(),
    });
    const { container } = render(<RobotInstrumentsGrid
      panel={{ id:'robot-instruments',options:{ typeFilter:'all' } } as never}
      context={gridContext({
        robotsValue:undefined,
        assetsValue:{ assets:[],loading:false,error:'' },
        pagedRobotIds:[],
      }) as never}
    />);
    expect(container.querySelector('[data-xgc-role="run-robot-card"]')).toBeNull();
    expect(container.textContent).toContain('No matching robots');
  });
});
