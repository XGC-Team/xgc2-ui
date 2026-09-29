// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { act,cleanup,renderHook,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import {
  getRunRobots,openRobotEventStream,useLiveConnectedRobotIds,
  type RunRobotProjection,
} from '../../robot/robotPublic';
import type { ExperimentSessionView } from '../experimentWorkflowModel';
import {
  StationExperimentOccupancyProvider,useExperimentStationOccupancy,
  type StationExperimentOccupancy,
} from '../useExperimentListRunningIds';
import { robotInstrumentSessionBindingRunIds } from './robotInstrumentConnectionSelection';
import { DashboardStationOccupancyProvider } from './DashboardStationOccupancyProvider';

const stream = vi.hoisted(() => ({ close:vi.fn() }));
vi.mock('../../robot/robotProjectionService',() => ({ getRunRobots:vi.fn() }));
vi.mock('../../robot/robotEventStreamService',() => ({
  openRobotEventStream:vi.fn(() => ({ close:stream.close })),
}));

describe('DashboardStationOccupancyProvider',() => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRunRobots).mockImplementation(async (targetId,runId):Promise<RunRobotProjection> => ({
      targetId,runId,streamId:`stream-${runId}`,projectionRevision:1,pending:false,
      experimentResourceId:'experiment-a',experimentCommitId:'commit-a',robotSelectionDigest:'all',
      robots:[],operations:[],updatedAt:'2026-09-28T12:00:00Z',
    }));
  });
  afterEach(cleanup);

  it('projects only matching opening/active Sessions and preserves station authority and occupancy',() => {
    const active = session('active');
    const opening = session('opening');
    const otherExperiment = session('active','local','experiment-b');
    const otherTarget = session('active','remote');
    const alreadyStopping = session('stopping');
    const terminal = session('canceled');
    const occupancy = station([active,opening,otherExperiment,otherTarget,alreadyStopping,terminal]);
    const { result } = renderHook(() => useExperimentStationOccupancy(),{
      wrapper:({ children }) => <Scope occupancy={occupancy} stopping>{children}</Scope>,
    });
    expect(result.current).toEqual({ ...occupancy,sessions:[
      { ...active,session:{ ...active.session,state:'stopping' } },
      { ...opening,session:{ ...opening.session,state:'stopping' } },
      otherExperiment,otherTarget,alreadyStopping,terminal,
    ] });
    expect(result.current.sessions[0]!.members).toBe(active.members);
    expect(result.current.sessions[1]!.members).toBe(opening.members);
    [otherExperiment,otherTarget,alreadyStopping,terminal].forEach((view,index) => {
      expect(result.current.sessions[index+2]).toBe(view);
    });
    expect(result.current.runningExperimentIds).toBe(occupancy.runningExperimentIds);
    expect(result.current.refresh).toBe(occupancy.refresh);
    expect(result.current.convergeStoppedExperiment).toBe(occupancy.convergeStoppedExperiment);
    expect(occupancy.sessions[0]!.session.state).toBe('active');
    expect(occupancy.sessions[1]!.session.state).toBe('opening');
  });

  it('reuses the parent object outside Stop and when Stop has no matching live Session',() => {
    let occupancy = station([session('active')]);
    let stopping = false;
    const { result,rerender } = renderHook(() => useExperimentStationOccupancy(),{
      wrapper:({ children }) => <Scope occupancy={occupancy} stopping={stopping}>{children}</Scope>,
    });
    expect(result.current).toBe(occupancy);
    stopping = true;
    occupancy = station([session('active','remote'),session('active','local','experiment-b'),session('stopping')]);
    rerender();
    expect(result.current).toBe(occupancy);
    stopping = false;
    occupancy = station([session('active')]);
    rerender();
    expect(result.current).toBe(occupancy);
  });

  it('releases Robot demand synchronously and stays closed while the parent still reports active',async () => {
    let occupancy = station([session('active')]);
    let stopping = false;
    const { result,rerender } = renderHook(usePanelRobotDemand,{
      wrapper:({ children }) => <Scope occupancy={occupancy} stopping={stopping}>{children}</Scope>,
    });
    await waitFor(() => expect(openRobotEventStream).toHaveBeenCalledTimes(1));
    const oldStream = vi.mocked(openRobotEventStream).mock.calls[0]![0];
    expect(oldStream.runId).toBe('instrument-owner');
    stopping = true;
    rerender();
    expect(stream.close).toHaveBeenCalledTimes(1);
    expect(result.current.owners).toEqual([]);
    expect(occupancy.sessions[0]!.session.state).toBe('active');

    occupancy = { ...occupancy,sessions:occupancy.sessions.map(view => ({
      ...view,session:{ ...view.session,revision:2 },
    })) };
    rerender();
    await act(async () => {
      oldStream.onEvent({
        targetId:'local',runId:'instrument-owner',revision:2,refresh:true,
        changes:[],resets:[],emittedAt:'2026-09-28T12:00:01Z',
      });
    });
    expect(getRunRobots).toHaveBeenCalledTimes(1);
    expect(openRobotEventStream).toHaveBeenCalledTimes(1);
    expect(result.current.owners).toEqual([]);

    occupancy = station([session('stopping')]);
    stopping = false;
    rerender();
    expect(result.current.occupancy).toBe(occupancy);
    expect(result.current.owners).toEqual([]);
    expect(openRobotEventStream).toHaveBeenCalledTimes(1);

    occupancy = station([session('active','local','experiment-a','next-owner')]);
    rerender();
    await waitFor(() => expect(openRobotEventStream).toHaveBeenCalledTimes(2));
    expect(result.current.occupancy).toBe(occupancy);
    expect(result.current.owners).toEqual(['next-owner']);
    expect(vi.mocked(openRobotEventStream).mock.calls[1]![0].runId).toBe('next-owner');
  });

  it('resumes the actual active Session when local Stop ends without changing it',async () => {
    const occupancy = station([session('active')]);
    let stopping = true;
    const { result,rerender } = renderHook(usePanelRobotDemand,{
      wrapper:({ children }) => <Scope occupancy={occupancy} stopping={stopping}>{children}</Scope>,
    });
    expect(getRunRobots).not.toHaveBeenCalled();
    stopping = false;
    rerender();
    await waitFor(() => expect(openRobotEventStream).toHaveBeenCalledTimes(1));
    expect(result.current.occupancy).toBe(occupancy);
    expect(result.current.owners).toEqual(['instrument-owner']);
  });
});

function Scope({ occupancy,stopping,children }: {
  occupancy:StationExperimentOccupancy;stopping:boolean;children:ReactNode;
}) {
  return <StationExperimentOccupancyProvider value={occupancy}>
    <DashboardStationOccupancyProvider experimentResourceId="experiment-a" executionTargetId="local" stopping={stopping}>
      {children}
    </DashboardStationOccupancyProvider>
  </StationExperimentOccupancyProvider>;
}

function usePanelRobotDemand() {
  const occupancy = useExperimentStationOccupancy();
  const active = occupancy.sessions.find(view => view.session.experimentResourceId === 'experiment-a'
    && view.session.state === 'active');
  const owners = robotInstrumentSessionBindingRunIds(active,['instruments']);
  useLiveConnectedRobotIds('local',owners);
  return { occupancy,owners };
}

function station(sessions:ExperimentSessionView[]):StationExperimentOccupancy {
  return {
    sessions,runningExperimentIds:new Set(sessions.map(view => view.session.experimentResourceId)),
    resolved:true,error:'retained diagnostic',refresh:vi.fn(async () => undefined),
    convergeStoppedExperiment:vi.fn(async () => undefined),
  };
}

function session(
  state:ExperimentSessionView['session']['state'],targetId='local',experimentResourceId='experiment-a',ownerId='instrument-owner',
):ExperimentSessionView {
  return {
    session:{ id:'session-a',targetId,experimentResourceId,state,mode:'full',runMode:'simulation',revision:1 },
    members:[{ id:'member-a',targetId,sessionId:'session-a',bindingId:'instruments',kind:'workflow_run',ownerId,status:'running',revision:1 }],
  };
}
