// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { ExperimentSurfaceVisibilityProvider,type PanelInstance } from '../../domains/experiment/experimentPublic';
import { ProductRouteVisibilityProvider } from '../../shared/routeReady';
import type { PanelActionPortRuntime,PanelPluginContext } from '../types';
import { PX4RotorControlPanel } from './PX4RotorControlPanel';
import { RobotControlFrameProvider,RobotControlHeaderActions,RobotControlHeaderLeading } from './RobotPanelFrame';
import { GroundStationRemoteDock } from '../../domains/groundStationInteraction/groundStationInteractionPublic';
import { clampRemoteWindowOrigin } from './RobotRemoteControlManager';
import { remoteControlStorageKey } from './robotRemoteControlPersistence';

const sessionMocks = vi.hoisted(() => ({ resolved:true,id:'session-a' as string | undefined,conversation:'conversation-a' as string | null | undefined }));
vi.mock('../../domains/experiment/useExperimentListRunningIds',() => ({
  useStationExperimentOccupancy:() => ({
    resolved:sessionMocks.resolved,
    sessions:sessionMocks.id ? [{session:{id:sessionMocks.id,experimentResourceId:'experiment-a',state:'active'}}] : [],
  }),
}));

const presenterMocks=vi.hoisted(()=>({
  requests:[] as Array<{id:string;status:string;payload:{context:{remoteController:{sessionId:string;conversationId:string;robotIds:string[]}}}}>,
  closeRequest:vi.fn(async(_id:string):Promise<void>=>undefined),
}));
const notificationMocks = vi.hoisted(() => ({ useError:vi.fn() }));
const motionIntentMocks = vi.hoisted(() => ({
  post:vi.fn(async (_targetId:string,_input:{ robotIds:readonly string[] }):Promise<void> => undefined),
}));

vi.mock('../../domains/groundStationInteraction/groundStationInteractionPublic',async (importOriginal) => {
  const original = await importOriginal() as Record<string,unknown>;
  return {
    ...original,
    useGroundStationErrorNotification:notificationMocks.useError,
    useGroundStationNativeAgentRegistry:()=>({selected:{'experiment-a':sessionMocks.conversation}}),
    useGroundStationRemoteRequests:()=>presenterMocks,

  };
});

vi.mock('../../domains/robot/robotMotionIntentService',() => ({
  postRobotMotionIntent:motionIntentMocks.post,
}));

describe('Robot control remote view',() => {
  beforeEach(() => {
    window.localStorage.clear();
    sessionMocks.resolved = true;
    sessionMocks.id = 'session-a';
    sessionMocks.conversation = 'conversation-a';
    presenterMocks.requests=[];
    presenterMocks.closeRequest.mockClear();
    notificationMocks.useError.mockReset();
    motionIntentMocks.post.mockReset();
    motionIntentMocks.post.mockResolvedValue(undefined);
  });

  it('presents an Agent-requested controller without sending motion and keeps its closed history',async()=>{
    presenterMocks.requests=[{id:'agent-remote-message',status:'open',payload:{context:{remoteController:{sessionId:'session-a',conversationId:'conversation-a',robotIds:['scout-01']}}}}];
    const view=renderPanel();
    const remote=await screen.findByRole('region',{name:/Remote controller/});
    expect(remote).toHaveAttribute('data-xgc-id','agent-remote-message');
    expect(motionIntentMocks.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Close remote controller'}));
    await waitFor(()=>expect(presenterMocks.closeRequest).toHaveBeenCalledWith('agent-remote-message'));
    await waitFor(()=>expect(screen.queryByRole('region',{name:/Remote controller/})).not.toBeInTheDocument());
    expect(motionIntentMocks.post).not.toHaveBeenCalled();
    view.unmount();
    renderPanel();
    expect(screen.queryByRole('region',{name:/Remote controller/})).not.toBeInTheDocument();
    expect(motionIntentMocks.post).not.toHaveBeenCalled();
  });

  it('keeps an already opened Agent controller reachable when the operator switches conversations',async () => {
    presenterMocks.requests=[{id:'active-conversation-remote',status:'open',payload:{context:{remoteController:{sessionId:'session-a',conversationId:'conversation-a',robotIds:['scout-01']}}}}];
    const view=renderPanel();
    const remote=await screen.findByRole('region',{name:/Remote controller/});
    sessionMocks.conversation='conversation-b';
    view.rerender(panelTree());
    expect(screen.getByRole('region',{name:/Remote controller/})).toBe(remote);
    expect(motionIntentMocks.post).not.toHaveBeenCalled();
    expect(presenterMocks.closeRequest).not.toHaveBeenCalled();
  });

  it('keeps manual control reachable while conversation selection has not loaded',() => {
    sessionMocks.conversation=undefined;
    writeSelection(['scout-01']);
    renderPanel();
    fireEvent.click(screen.getByRole('button',{name:'Start remote control'}));
    expect(screen.getByRole('region',{name:/Remote controller/})).toBeInTheDocument();
  });

  it('handles a dismissal event arriving before the response without a second stop',async()=>{
    const request={id:'racing-remote-message',status:'open',payload:{context:{remoteController:{sessionId:'session-a',conversationId:'conversation-a',robotIds:['scout-01']}}}};
    presenterMocks.requests=[request];
    let resolveClose!:()=>void;
    presenterMocks.closeRequest.mockImplementationOnce(()=>new Promise<void>(resolve=>{resolveClose=resolve;}));
    const view=renderPanel();
    await screen.findByRole('region',{name:/Remote controller/});
    fireEvent.click(screen.getByRole('button',{name:'Close remote controller'}));
    await waitFor(()=>expect(presenterMocks.closeRequest).toHaveBeenCalledTimes(1));
    presenterMocks.requests=[{...request,status:'resolved'}];
    view.rerender(panelTree());
    expect(motionIntentMocks.post).not.toHaveBeenCalled();
    expect(presenterMocks.closeRequest).toHaveBeenCalledTimes(1);
    await act(async()=>resolveClose());
    expect(screen.queryByRole('region',{name:/Remote controller/})).not.toBeInTheDocument();
    expect(motionIntentMocks.post).not.toHaveBeenCalled();
  });

  it('does not present an Agent remote in another conversation or Session',()=>{
    presenterMocks.requests=[
      {id:'other-conversation',status:'open',payload:{context:{remoteController:{sessionId:'session-a',conversationId:'conversation-b',robotIds:['scout-01']}}}},
      {id:'ended-session',status:'open',payload:{context:{remoteController:{sessionId:'old-session',conversationId:'conversation-a',robotIds:['scout-01']}}}},
    ];
    renderPanel();
    expect(screen.queryByRole('region',{name:/Remote controller/})).not.toBeInTheDocument();
    expect(motionIntentMocks.post).not.toHaveBeenCalled();
    expect(presenterMocks.closeRequest).toHaveBeenCalledWith('ended-session');
    expect(presenterMocks.closeRequest).not.toHaveBeenCalledWith('other-conversation');
  });

  it('keeps the remote launcher in the header trailing slot as an uncolored Run-sized icon',() => {
    writeSelection(['px4-01']);
    const action = actionPort();
    const view = renderPanel(action);
    const views = screen.getAllByRole('button').filter((button) => button.getAttribute('data-xgc-role') === 'robot-control-panel-view');
    expect(views.map((button) => button.getAttribute('aria-label'))).toEqual([
      'UAV control','UGV control',
    ]);
    const start = screen.getByRole('button',{ name:'Start remote control' });
    expect(start).toBeEnabled();
    expect(start).toHaveClass('xgc-panel-runtime-action');
    expect(start).toHaveAttribute('data-xgc-icon-only','true');
    expect(start).toHaveAttribute('data-xgc-size','compact');
    expect(start).toHaveAttribute('data-xgc-tone','default');
    expect(start).toHaveAttribute('data-xgc-appearance','raised');
    expect(start.textContent?.replace(/\s+/g,'')).toBe('');
    expect(start.querySelector('svg.lucide-gamepad-2')).toBeTruthy();
    expect(view.container.querySelector('[data-xgc-role="experiment-panel-header-trailing"]')).toContainElement(start);
    expect(view.container.querySelector('[data-xgc-role="robot-control-header-actions"]')).not.toContainElement(start);
    fireEvent.click(screen.getByRole('button',{ name:'UGV control' }));
    expect(screen.getByRole('button',{ name:'UGV control' })).toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('button',{ name:'Start remote control' })).toBe(start);
    fireEvent.click(screen.getByRole('button',{ name:'UAV control' }));
    expect(screen.getByRole('button',{ name:'UAV control' })).toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('button',{ name:'Start remote control' })).toBe(start);
    expect(screen.queryByRole('region',{ name:/Remote controller/ })).not.toBeInTheDocument();
    expect(motionIntentMocks.post).not.toHaveBeenCalled();
    expect(action.invoke).not.toHaveBeenCalled();
  });

  it('disables remote control instead of broadcasting an empty selection to the fleet',() => {
    const action = actionPort();
    renderPanel(action);
    const start = screen.getByRole('button',{ name:'Start remote control' });
    expect(start).toBeDisabled();
    expect(start).toHaveAttribute(
      'title','Select at least one Scout, Mecanum, or PX4 robot in Robot instruments.',
    );
    fireEvent.click(start);
    expect(screen.queryByRole('region',{ name:/Remote controller/ })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('xgc.experiment.experiment-a.robot.selection')).toBeNull();
  });

  it('disables only the remote launcher for an unsupported selected robot kind',() => {
    writeSelection(['b2-01']);
    renderPanel(actionPort(),[{ id:'b2-01',unitreeB2: {} }]);
    const start = screen.getByRole('button',{ name:'Start remote control' });
    expect(start).toBeDisabled();
    expect(start).toHaveAttribute('title','Remote control supports Scout, Mecanum, and PX4 robots.');
    expect(screen.getByRole('button',{ name:'UAV control' })).toBeEnabled();
    expect(screen.getByRole('button',{ name:'UGV control' })).toBeEnabled();
  });

  it('targets every selected compatible robot and ignores an unsupported neighbor',async () => {
    writeSelection(['mecanum-01','b2-01','px4-01']);
    const action = actionPort();
    renderPanel(action,[
      { id:'px4-01',px4: {} },
      { id:'mecanum-01',mecanum: {} },
      { id:'b2-01',unitreeB2: {} },
    ]);
    fireEvent.click(screen.getByRole('button',{ name:'Start remote control' }));
    expect(screen.getByRole('region',{ name:/Remote controller/ }))
      .toHaveAttribute('data-xgc-robot-ids','px4-01,mecanum-01');
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',robotIds:['px4-01','mecanum-01'],gear:1,longitudinal:0,lateral:0,yaw:0,
    })));
    expect(action.invoke).not.toHaveBeenCalled();
  });

  it('targets one selected Scout in a four-Scout roster and can stop, close, and restart',async () => {
    const fourScouts = [
      { id:'scout-01',scout: {} },
      { id:'scout-02',scout: {} },
      { id:'scout-03',scout: {} },
      { id:'scout-04',scout: {} },
    ];
    writeSelection(['scout-03']);
    const action = actionPort();
    renderPanel(action,fourScouts);
    expect(screen.queryByRole('region',{ name:/Remote controller/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{ name:'Start remote control' }));
    const window = screen.getByRole('region',{ name:/Remote controller/ });
    expect(screen.getByRole('button',{ name:'Slow' })).toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('button',{ name:'Medium' })).toHaveAttribute('aria-pressed','false');
    expect(screen.getByRole('button',{ name:'Fast' })).toHaveAttribute('aria-pressed','false');
    expect(screen.getByRole('button',{ name:'Stop' })).toHaveAttribute('aria-pressed','true');
    expect(screen.queryByRole('button',{ name:'Hold to move' })).not.toBeInTheDocument();
    expect(window).toHaveAttribute('data-xgc-spring-return','false');
    expect(window).toHaveAttribute('data-xgc-robot-ids','scout-03');
    expect(window).toHaveFocus();
    expect(screen.getByRole('button',{ name:'Start remote control' })).toBeDisabled();
    expect(screen.getByRole('button',{ name:'Start remote control' }))
      .toHaveAttribute('title','A selected robot already has a remote controller.');
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',robotIds:['scout-03'],gear:1,longitudinal:0,lateral:0,yaw:0,
    })));
    fireEvent.click(screen.getByRole('button',{ name:'Forward' }));
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',robotIds:['scout-03'],gear:1,longitudinal:1,lateral:0,yaw:0,
    })));
    expect(screen.getByRole('button',{ name:'Forward' })).toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('button',{ name:'Stop' })).toHaveAttribute('aria-pressed','false');
    fireEvent.click(screen.getByRole('button',{ name:'Stop' }));
    expect(screen.getByRole('button',{ name:'Stop' })).toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('button',{ name:'Forward' })).toHaveAttribute('aria-pressed','false');
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',robotIds:['scout-03'],gear:1,longitudinal:0,lateral:0,yaw:0,
    })));
    fireEvent.click(screen.getByRole('button',{ name:'Close remote controller' }));
    await waitFor(() => expect(screen.queryByRole('region',{ name:/Remote controller/ })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button',{ name:'Start remote control' })).toBeEnabled());

    fireEvent.click(screen.getByRole('button',{ name:'Start remote control' }));
    const restarted = screen.getByRole('region',{ name:/Remote controller/ });
    expect(restarted).toHaveAttribute('data-xgc-robot-ids','scout-03');
    fireEvent.click(screen.getByRole('button',{ name:'Forward' }));
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenLastCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',robotIds:['scout-03'],gear:1,longitudinal:1,lateral:0,yaw:0,
    })));
    expect(motionIntentMocks.post.mock.calls.every(([,input]) => (
      JSON.stringify((input as { robotIds?:string[] }).robotIds) === JSON.stringify(['scout-03'])
    ))).toBe(true);
    expect(action.invoke).not.toHaveBeenCalled();
  });

  it('routes remote Action failures to notifications without rendering the error in the panel or controller',async () => {
    writeSelection(['scout-01']);
    motionIntentMocks.post.mockRejectedValue(new Error('remote command failed'));
    const view = renderPanel(actionPort());
    fireEvent.click(screen.getByRole('button',{ name:'Start remote control' }));

    await waitFor(() => expect(notificationMocks.useError).toHaveBeenCalledWith(
      'local','remote command failed',{
        title:'Robot control',source:'robot-control',dedupeKey:'robot-control:remote-control-error',
      },
    ));
    expect(view.container).not.toHaveTextContent('remote command failed');
    expect(screen.getByRole('region',{ name:/Remote controller/ })).not.toHaveTextContent('remote command failed');
    expect(screen.queryByText('Ready')).not.toBeInTheDocument();
    expect(screen.queryByText('Applying…')).not.toBeInTheDocument();
  });

  it('lets cross-axis motion latch together and cancels the same-axis opposite plus Stop',async () => {
    writeSelection(['scout-01']);
    const action = actionPort();
    renderPanel(action);
    fireEvent.click(screen.getByRole('button',{ name:'Start remote control' }));
    expect(screen.getByRole('button',{ name:'Stop' })).toHaveAttribute('aria-pressed','true');
    fireEvent.click(screen.getByRole('button',{ name:'Forward' }));
    fireEvent.click(screen.getByRole('button',{ name:'Left' }));
    fireEvent.click(screen.getByRole('button',{ name:'Yaw left' }));
    expect(screen.getByRole('button',{ name:'Forward' })).toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('button',{ name:'Left' })).toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('button',{ name:'Yaw left' })).toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('button',{ name:'Stop' })).toHaveAttribute('aria-pressed','false');
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',longitudinal:1,lateral:1,yaw:1,
    })));
    fireEvent.click(screen.getByRole('button',{ name:'Backward' }));
    expect(screen.getByRole('button',{ name:'Forward' })).toHaveAttribute('aria-pressed','false');
    expect(screen.getByRole('button',{ name:'Backward' })).toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('button',{ name:'Left' })).toHaveAttribute('aria-pressed','true');
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenLastCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',longitudinal:-1,lateral:1,yaw:1,
    })));
  });

  it('keeps the same controller DOM node after a motion click',async () => {
    writeSelection(['scout-01']);
    const action = actionPort();
    renderPanel(action);
    fireEvent.click(screen.getByRole('button',{ name:'Start remote control' }));
    const remote = screen.getByRole('region',{ name:/Remote controller/ });
    const forward = screen.getByRole('button',{ name:'Forward' });
    fireEvent.click(forward);
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',robotIds:['scout-01'],longitudinal:1,lateral:0,yaw:0,
    })));
    expect(screen.getByRole('region',{ name:/Remote controller/ })).toBe(remote);
    expect(screen.getByRole('button',{ name:'Forward' })).toBe(forward);
  });

  it('latches a direction on pointer down so the key stays down before click',async () => {
    writeSelection(['scout-01']);
    const action = actionPort();
    renderPanel(action);
    fireEvent.click(screen.getByRole('button',{ name:'Start remote control' }));
    const remote = screen.getByRole('region',{ name:/Remote controller/ });
    const forward = screen.getByRole('button',{ name:'Forward' });
    const slow = screen.getByRole('button',{ name:'Slow' });
    const medium = screen.getByRole('button',{ name:'Medium' });
    expect(slow).toHaveAttribute('aria-pressed','true');
    fireEvent.pointerDown(forward,{ button:0,pointerId:1 });
    expect(forward).toHaveAttribute('aria-pressed','true');
    fireEvent.pointerUp(forward,{ pointerId:1 });
    fireEvent.click(forward);
    expect(forward).toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('region',{ name:/Remote controller/ })).toBe(remote);
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',robotIds:['scout-01'],longitudinal:1,lateral:0,yaw:0,
    })));
    fireEvent.pointerDown(medium,{ button:0,pointerId:2 });
    expect(medium).toHaveAttribute('aria-pressed','true');
    expect(slow).toHaveAttribute('aria-pressed','false');
    expect(screen.getByRole('button',{ name:'Forward' })).toBe(forward);
  });

  it('keeps an open controller when the robot roster snapshot is briefly empty',() => {
    writeSelection(['scout-01']);
    const action = actionPort();
    const view = renderPanel(action);
    fireEvent.click(screen.getByRole('button',{ name:'Start remote control' }));
    const remote = screen.getByRole('region',{ name:/Remote controller/ });
    view.rerender(panelTree(action,[]));
    expect(screen.getByRole('region',{ name:/Remote controller/ })).toBe(remote);
    view.rerender(panelTree(action,defaultRobots));
    expect(screen.getByRole('region',{ name:/Remote controller/ })).toBe(remote);
    expect(remote).toHaveAttribute('data-xgc-robot-ids','scout-01');
  });

  it('reads spring return from panel options and holds a direction only while the pointer is down',async () => {
    writeSelection(['scout-01']);
    const action = actionPort();
    const view = renderPanel(action);
    fireEvent.click(screen.getByRole('button',{ name:'Start remote control' }));
    const remote = screen.getByRole('region',{ name:/Remote controller/ });
    const forward = screen.getByRole('button',{ name:'Forward' });
    expect(remote).toHaveAttribute('data-xgc-spring-return','false');
    expect(screen.queryByRole('button',{ name:'Hold to move' })).not.toBeInTheDocument();

    fireEvent.click(forward);
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',robotIds:['scout-01'],longitudinal:1,lateral:0,yaw:0,
    })));
    view.rerender(panelTree(action,defaultRobots,{ springReturn:true }));
    expect(screen.getByRole('region',{ name:/Remote controller/ })).toHaveAttribute('data-xgc-spring-return','true');
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenLastCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',robotIds:['scout-01'],longitudinal:0,lateral:0,yaw:0,
    })));

    const held = screen.getByRole('button',{ name:'Forward' });
    held.setPointerCapture = vi.fn();
    held.releasePointerCapture = vi.fn();
    held.hasPointerCapture = vi.fn(() => true);
    fireEvent.pointerDown(held,{ button:0,pointerId:2 });
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenLastCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',robotIds:['scout-01'],longitudinal:1,lateral:0,yaw:0,
    })));
    fireEvent.pointerUp(held,{ pointerId:2 });
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenLastCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',robotIds:['scout-01'],longitudinal:0,lateral:0,yaw:0,
    })));
    fireEvent.click(held);
    expect(motionIntentMocks.post).toHaveBeenLastCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',robotIds:['scout-01'],longitudinal:0,lateral:0,yaw:0,
    }));
  });

  it('holds xgc1 arrow keys without leaving focus on Start remote control',async () => {
    writeSelection(['scout-01']);
    const action = actionPort();
    renderPanel(action);
    fireEvent.click(screen.getByRole('button',{ name:'Start remote control' }));
    const window = screen.getByRole('region',{ name:/Remote controller/ });
    expect(window).toHaveFocus();
    const shortcuts = window.querySelector(`[data-xgc-role="robot-remote-shortcuts"][data-xgc-id="${window.getAttribute('data-xgc-id')}"]`);
    expect(shortcuts?.tagName).toBe('TABLE');
    expect(shortcuts?.querySelectorAll('tr')).toHaveLength(4);
    expect(shortcuts?.querySelectorAll('th, td')).toHaveLength(8);
    expect(window.querySelector('.robot-remote-yaw-left')).toBeTruthy();
    expect(window.querySelector('.robot-remote-directions')).toContainElement(shortcuts as HTMLElement);
    expect(shortcuts).toHaveTextContent(/↑↓←→\s*move\s*Z\/X\s*yaw\s*Space\s*stop\s*Esc\s*close/i);
    fireEvent.keyDown(document,{ key:'ArrowUp' });
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',robotIds:['scout-01'],longitudinal:1,lateral:0,yaw:0,
    })));
    fireEvent.keyUp(document,{ key:'ArrowUp' });
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',robotIds:['scout-01'],longitudinal:0,lateral:0,yaw:0,
    })));
    expect(window).toHaveFocus();
  });

  it('drives arrow keys even when the chat composer is focused',async () => {
    writeSelection(['scout-01']);
    renderPanel(actionPort());
    fireEvent.click(screen.getByRole('button',{ name:'Start remote control' }));
    const composer = document.createElement('div');
    composer.setAttribute('contenteditable','true');
    document.body.appendChild(composer);
    const down = new KeyboardEvent('keydown',{ key:'ArrowUp',bubbles:true,cancelable:true });
    composer.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',robotIds:['scout-01'],longitudinal:1,lateral:0,yaw:0,
    })));
    const up = new KeyboardEvent('keyup',{ key:'ArrowUp',bubbles:true,cancelable:true });
    composer.dispatchEvent(up);
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenLastCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',robotIds:['scout-01'],longitudinal:0,lateral:0,yaw:0,
    })));
    composer.remove();
  });

  it('drags the floating controller from the chrome without sending a motion intent',() => {
    writeSelection(['scout-01']);
    const action = actionPort();
    renderPanel(action);
    fireEvent.click(screen.getByRole('button',{ name:'Start remote control' }));
    const remote = screen.getByRole('region',{ name:/Remote controller/ });
    vi.spyOn(remote,'getBoundingClientRect').mockReturnValue({
      x:100,y:200,left:100,top:200,width:310,height:280,right:410,bottom:480,
      toJSON() { return {}; },
    } as DOMRect);
    remote.setPointerCapture = vi.fn();
    remote.releasePointerCapture = vi.fn();
    remote.hasPointerCapture = vi.fn(() => true);
    const invokeCount = motionIntentMocks.post.mock.calls.length;
    fireEvent.pointerDown(remote.querySelector('[data-xgc-role="robot-remote-control-drag"]')!,{
      button:0,clientX:120,clientY:210,pointerId:1,
    });
    fireEvent.pointerMove(remote,{ clientX:220,clientY:260,pointerId:1 });
    expect(remote).toHaveStyle({ left:'200px',top:'250px' });
    expect(remote).toHaveAttribute('data-xgc-dragging','true');
    fireEvent.pointerUp(remote,{ pointerId:1 });
    expect(remote).not.toHaveAttribute('data-xgc-dragging');
    expect(motionIntentMocks.post.mock.calls.length).toBe(invokeCount);
    expect(action.invoke).not.toHaveBeenCalled();
  });

  it('does not start a window drag from a motion button',() => {
    writeSelection(['scout-01']);
    const action = actionPort();
    renderPanel(action);
    fireEvent.click(screen.getByRole('button',{ name:'Start remote control' }));
    const remote = screen.getByRole('region',{ name:/Remote controller/ });
    fireEvent.pointerDown(screen.getByRole('button',{ name:'Forward' }),{ button:0,clientX:40,clientY:40,pointerId:1 });
    expect(remote).not.toHaveAttribute('data-xgc-dragging');
    expect(remote.style.left).toBe('');
  });

  it('clamps a dragged controller inside the viewport',() => {
    expect(clampRemoteWindowOrigin(-40,-20,310,280)).toEqual({ left:8,top:8 });
    expect(clampRemoteWindowOrigin(4000,4000,310,280)).toEqual({
      left:Math.max(8, window.innerWidth - 318),
      top:Math.max(8, window.innerHeight - 288),
    });
  });

  it('starts remote control without a remote-control Action port',async () => {
    writeSelection(['px4-01']);
    renderPanel();
    const start = screen.getByRole('button',{ name:'Start remote control' });
    expect(start).toBeEnabled();
    fireEvent.click(start);
    expect(screen.getByRole('region',{ name:/Remote controller/ })).toBeInTheDocument();
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',robotIds:['px4-01'],gear:1,longitudinal:0,lateral:0,yaw:0,
    })));
  });

  it('keeps the launcher enabled across view switches without a remote-control Action',() => {
    writeSelection(['scout-01']);
    const view = renderPanel();
    expect(screen.getByRole('button',{ name:'Start remote control' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button',{ name:'UGV control' }));
    view.rerender(panelTree(undefined,defaultRobots));
    expect(screen.getByRole('button',{ name:'UGV control' })).toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('button',{ name:'Start remote control' })).toBeEnabled();
  });

  it('closes the floating remote and zeros motion when leaving the Experiment',async () => {
    writeSelection(['scout-01']);
    const action = actionPort();
    const view = renderPanel(action);
    fireEvent.click(screen.getByRole('button',{ name:'Start remote control' }));
    fireEvent.click(screen.getByRole('button',{ name:'Forward' }));
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',robotIds:['scout-01'],longitudinal:1,lateral:0,yaw:0,
    })));
    expect(screen.getByRole('region',{ name:/Remote controller/ })).toBeInTheDocument();
    view.rerender(panelTree(action,defaultRobots,undefined,{ route:false }));
    await waitFor(() => expect(screen.queryByRole('region',{ name:/Remote controller/ })).not.toBeInTheDocument());
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',robotIds:['scout-01'],gear:1,longitudinal:0,lateral:0,yaw:0,
    })));
    expect(document.body.querySelector('[data-xgc-role="robot-remote-control"]')).toBeNull();
    expect(window.localStorage.getItem(remoteControlStorageKey('experiment-a','robot-control'))).toBeNull();
  });

  it.each(['close','route','dashboard'] as const)('orders the final zero after pending motion on %s',async (exit) => {
    let finishForward:()=>void = () => { throw new Error('Forward was not submitted.'); };
    motionIntentMocks.post.mockImplementation(async (_targetId,input) => {
      const intent = input as typeof input & { longitudinal:number;lateral:number };
      if (intent.longitudinal === 1 && intent.lateral === 0) {
        await new Promise<void>((resolve) => { finishForward = resolve; });
      }
    });
    writeSelection(['scout-01']);
    const view = renderPanel();
    fireEvent.click(screen.getByRole('button',{ name:'Start remote control' }));
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button',{ name:'Forward' }));
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button',{ name:'Left' }));
    if (exit === 'close') fireEvent.click(screen.getByRole('button',{ name:'Close remote controller' }));
    else view.rerender(panelTree(undefined,defaultRobots,undefined,{ [exit]:false }));
    // Closing may not overtake the request already sent to this controller.
    expect(motionIntentMocks.post).toHaveBeenCalledTimes(2);
    await act(async () => { finishForward(); });
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenCalledTimes(3));
    expect(motionIntentMocks.post).toHaveBeenLastCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',robotIds:['scout-01'],longitudinal:0,lateral:0,yaw:0,
    }));
    await waitFor(() => expect(screen.queryByRole('region',{ name:/Remote controller/ })).not.toBeInTheDocument());
    expect(window.localStorage.getItem(remoteControlStorageKey('experiment-a','robot-control'))).toBeNull();
  });

  it('restores an open remote controller after the panel remounts',async () => {
    writeSelection(['scout-01']);
    const view = renderPanel();
    fireEvent.click(screen.getByRole('button',{ name:'Start remote control' }));
    const remote = screen.getByRole('region',{ name:/Remote controller/ });
    const id = remote.getAttribute('data-xgc-id');
    fireEvent.click(screen.getByRole('button',{ name:'Forward' }));
    fireEvent.click(screen.getByRole('button',{ name:'Medium' }));
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',controllerId:id,robotIds:['scout-01'],gear:2,longitudinal:1,lateral:0,yaw:0,
    })));
    const posted = motionIntentMocks.post.mock.calls.length;
    view.unmount();
    expect(screen.queryByRole('region',{ name:/Remote controller/ })).not.toBeInTheDocument();
    expect(motionIntentMocks.post.mock.calls.length).toBe(posted);
    expect(JSON.parse(window.localStorage.getItem(remoteControlStorageKey('experiment-a','robot-control')) ?? 'null'))
      .toEqual(expect.objectContaining({
        v:1,
        controllers:[expect.objectContaining({
          id,
          robots:[{ id:'scout-01',name:'scout-01' }],
          gear:2,
          pressed:['forward'],
        })],
      }));

    renderPanel();
    const restored = screen.getByRole('region',{ name:/Remote controller/ });
    expect(restored).toHaveAttribute('data-xgc-id',id);
    expect(restored).toHaveAttribute('data-xgc-robot-ids','scout-01');
    expect(screen.getByRole('button',{ name:'Forward' })).toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('button',{ name:'Medium' })).toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('button',{ name:'Stop' })).toHaveAttribute('aria-pressed','false');
    expect(screen.getByRole('button',{ name:'Start remote control' })).toBeDisabled();
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',controllerId:id,robotIds:['scout-01'],gear:2,longitudinal:1,lateral:0,yaw:0,
    })));
  });

  it.each(['ended','replaced','legacy'] as const)('does not replay a cached controller after its Session is %s',async (kind) => {
    writeSelection(['scout-01']);
    const view = renderPanel();
    fireEvent.click(screen.getByRole('button',{name:'Start remote control'}));
    const id = screen.getByRole('region',{name:/Remote controller/}).getAttribute('data-xgc-id');
    fireEvent.click(screen.getByRole('button',{name:'Forward'}));
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenLastCalledWith('local',expect.objectContaining({sessionId:'session-a',longitudinal:1})));
    view.unmount();
    motionIntentMocks.post.mockClear();
    if (kind === 'legacy') {
      const key = remoteControlStorageKey('experiment-a','robot-control');
      const stored = JSON.parse(localStorage.getItem(key)!);
      delete stored.controllers[0].sessionId;
      localStorage.setItem(key,JSON.stringify(stored));
    } else sessionMocks.id = kind === 'ended' ? undefined : 'session-b';
    const refreshed = renderPanel();
    expect(screen.queryByRole('region',{name:/Remote controller/})).not.toBeInTheDocument();
    expect(motionIntentMocks.post).not.toHaveBeenCalled();
    expect(localStorage.getItem(remoteControlStorageKey('experiment-a','robot-control'))).toBeNull();
    const messages = JSON.parse(localStorage.getItem('xgc.experiment.experiment-a.remote-messages.v1')!);
    expect(messages.find((item:{id:string}) => item.id === id).closedAt).toBeTruthy();
    refreshed.unmount();
    renderPanel();
    expect(motionIntentMocks.post).not.toHaveBeenCalled();
  });

  it('waits for authoritative Session recovery without replaying or discarding the cached intent',async () => {
    writeSelection(['scout-01']);
    const view = renderPanel();
    fireEvent.click(screen.getByRole('button',{name:'Start remote control'}));
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenCalledTimes(1));
    view.unmount();
    motionIntentMocks.post.mockClear();
    sessionMocks.resolved = false;
    const refreshed = renderPanel();
    expect(screen.queryByRole('region',{name:/Remote controller/})).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Start remote control'})).toBeDisabled();
    expect(motionIntentMocks.post).not.toHaveBeenCalled();
    expect(localStorage.getItem(remoteControlStorageKey('experiment-a','robot-control'))).not.toBeNull();
    sessionMocks.resolved = true;
    refreshed.rerender(panelTree());
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenCalledTimes(1));
    expect(motionIntentMocks.post).toHaveBeenLastCalledWith('local',expect.objectContaining({sessionId:'session-a'}));
    sessionMocks.id = undefined;
    motionIntentMocks.post.mockClear();
    refreshed.rerender(panelTree());
    expect(screen.queryByRole('region',{name:/Remote controller/})).not.toBeInTheDocument();
    expect(motionIntentMocks.post).not.toHaveBeenCalled();
    expect(localStorage.getItem(remoteControlStorageKey('experiment-a','robot-control'))).toBeNull();
  });

  it('docks an open remote into the ground-station conversation host instead of floating',async () => {
    writeSelection(['scout-01']);
    const action = actionPort();
    render(<>
      <div data-xgc-role="native-agent-conversation" data-xgc-id="session-a">
        <GroundStationRemoteDock experimentId="experiment-a" />
        <div>Ask anything...</div>
      </div>
      {panelTree(action)}
    </>);
    fireEvent.click(screen.getByRole('button',{ name:'Start remote control' }));
    const remote = screen.getByRole('region',{ name:/Remote controller/ });
    const dock = document.querySelector('[data-xgc-role="ground-station-remote-dock"]');
    expect(dock).toHaveAttribute('data-xgc-id','experiment-a');
    expect(dock).toContainElement(remote);
    expect(document.querySelector('[data-xgc-role="native-agent-conversation"]')).toContainElement(remote);
    expect(document.querySelector('.robot-remote-window-layer')).toBeNull();
    expect(remote).toHaveAttribute('data-xgc-docked','true');
    expect(remote).toHaveClass('robot-remote-window-docked');
    expect(remote.querySelector('[data-xgc-role="robot-remote-control-title"]')).toHaveTextContent('scout-01');
    expect(remote.querySelector(`[data-xgc-role="robot-remote-shortcuts"][data-xgc-id="${remote.getAttribute('data-xgc-id')}"]`))
      .toHaveTextContent(/↑↓←→\s*move\s*Z\/X\s*yaw\s*Space\s*stop\s*Esc\s*close/i);
    expect(remote.querySelector('.robot-remote-targets')).toBeNull();
    expect(screen.getByRole('button',{ name:'Forward' })).toHaveAttribute('data-xgc-size','compact');
    expect(remote).not.toHaveAttribute('style');
    const invokeCount = motionIntentMocks.post.mock.calls.length;
    fireEvent.pointerDown(remote.querySelector('[data-xgc-role="robot-remote-control-drag"]')!,{
      button:0,clientX:120,clientY:210,pointerId:1,
    });
    fireEvent.pointerMove(remote,{ clientX:220,clientY:260,pointerId:1 });
    expect(remote).not.toHaveAttribute('data-xgc-dragging');
    expect(remote.style.left).toBe('');
    expect(motionIntentMocks.post.mock.calls.length).toBe(invokeCount);
    fireEvent.click(screen.getByRole('button',{ name:'Forward' }));
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',robotIds:['scout-01'],longitudinal:1,lateral:0,yaw:0,
    })));
    expect(action.invoke).not.toHaveBeenCalled();
  });

  it('floats outside the chat viewport without remounting or resending motion',async () => {
    let intersect: ((visible:boolean)=>void) | undefined;
    vi.stubGlobal('IntersectionObserver',class {
      constructor(callback:IntersectionObserverCallback) {
        intersect = visible => callback([{ isIntersecting:visible } as IntersectionObserverEntry],this as unknown as IntersectionObserver);
      }
      observe() {}
      disconnect() {}
    });
    try {
      writeSelection(['scout-01']);
      render(<><GroundStationRemoteDock experimentId="experiment-a" />{panelTree()}</>);
      fireEvent.click(screen.getByRole('button',{ name:'Start remote control' }));
      const remote = screen.getByRole('region',{ name:/Remote controller/ });
      fireEvent.click(screen.getByRole('button',{ name:'Forward' }));
      await waitFor(() => expect(motionIntentMocks.post).toHaveBeenLastCalledWith('local',expect.objectContaining({ longitudinal:1 })));
      const count = motionIntentMocks.post.mock.calls.length;
      const dock = document.querySelector<HTMLElement>('[data-xgc-role="ground-station-remote-dock"]')!;
      vi.spyOn(dock,'getBoundingClientRect').mockReturnValue({ height:220 } as DOMRect);
      act(() => intersect?.(false));
      expect(screen.getByRole('region',{ name:/Remote controller/ })).toBe(remote);
      expect(remote).not.toHaveAttribute('data-xgc-docked');
      expect(remote.querySelector('[data-xgc-role="robot-remote-drag-handle"]')).not.toBeNull();
      expect(document.querySelector('.robot-remote-window-layer')).toContainElement(remote);
      expect(dock.style.minHeight).toBe('220px');
      expect(screen.getByRole('button',{ name:'Forward' })).toHaveAttribute('aria-pressed','true');
      act(() => intersect?.(true));
      expect(dock).toContainElement(remote);
      expect(remote).toHaveAttribute('data-xgc-docked','true');
      expect(motionIntentMocks.post).toHaveBeenCalledTimes(count);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('moves an already open remote into the conversation dock when the host appears',async () => {
    writeSelection(['scout-01']);
    const view = render(panelTree());
    fireEvent.click(screen.getByRole('button',{ name:'Start remote control' }));
    const remote = screen.getByRole('region',{ name:/Remote controller/ });
    expect(document.querySelector('.robot-remote-window-layer')).toContainElement(remote);
    expect(remote).not.toHaveAttribute('data-xgc-docked');
    view.rerender(<>
      <div data-xgc-role="native-agent-conversation" data-xgc-id="session-a">
        <GroundStationRemoteDock experimentId="experiment-a" />
      </div>
      {panelTree()}
    </>);
    const docked = screen.getByRole('region',{ name:/Remote controller/ });
    expect(document.querySelector('[data-xgc-role="ground-station-remote-dock"]')).toContainElement(docked);
    expect(document.querySelector('.robot-remote-window-layer')).toBeNull();
    expect(docked).toHaveAttribute('data-xgc-docked','true');
  });

  it('does not restore a remote after the operator closes it',async () => {
    writeSelection(['scout-01']);
    const view = renderPanel();
    fireEvent.click(screen.getByRole('button',{ name:'Start remote control' }));
    fireEvent.click(screen.getByRole('button',{ name:'Close remote controller' }));
    await waitFor(() => expect(screen.queryByRole('region',{ name:/Remote controller/ })).not.toBeInTheDocument());
    expect(window.localStorage.getItem(remoteControlStorageKey('experiment-a','robot-control'))).toBeNull();
    view.unmount();
    renderPanel();
    expect(screen.queryByRole('region',{ name:/Remote controller/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button',{ name:'Start remote control' })).toBeEnabled();
  });

  it('restores a spring-return remote as Stop because the pointer is no longer down',async () => {
    writeSelection(['scout-01']);
    const view = renderPanel(undefined,defaultRobots,{ springReturn:true });
    fireEvent.click(screen.getByRole('button',{ name:'Start remote control' }));
    const forward = screen.getByRole('button',{ name:'Forward' });
    forward.setPointerCapture = vi.fn();
    forward.releasePointerCapture = vi.fn();
    forward.hasPointerCapture = vi.fn(() => true);
    fireEvent.pointerDown(forward,{ button:0,pointerId:2 });
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',robotIds:['scout-01'],longitudinal:1,lateral:0,yaw:0,
    })));
    view.unmount();
    renderPanel(undefined,defaultRobots,{ springReturn:true });
    expect(screen.getByRole('region',{ name:/Remote controller/ })).toBeInTheDocument();
    expect(screen.getByRole('button',{ name:'Stop' })).toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('button',{ name:'Forward' })).toHaveAttribute('aria-pressed','false');
    await waitFor(() => expect(motionIntentMocks.post).toHaveBeenLastCalledWith('local',expect.objectContaining({
      experimentId:'experiment-a',robotIds:['scout-01'],longitudinal:0,lateral:0,yaw:0,
    })));
  });
});

function renderPanel(
  action?:PanelActionPortRuntime,
  robots:readonly Record<string,unknown>[] = defaultRobots,
  options?:Record<string,unknown>,
  visibility?:{ route?:boolean; dashboard?:boolean },
) {
  return render(panelTree(action,robots,options,visibility));
}

function panelTree(
  action?:PanelActionPortRuntime,
  robots:readonly Record<string,unknown>[] = defaultRobots,
  options?:Record<string,unknown>,
  visibility:{ route?:boolean; dashboard?:boolean } = {},
) {
  const routeVisible = visibility.route !== false;
  const dashboardVisible = visibility.dashboard !== false;
  const panel = panelFixture(options);
  return <ProductRouteVisibilityProvider visible={routeVisible}>
    <ExperimentSurfaceVisibilityProvider visible={dashboardVisible}>
      <div data-xgc-role="experiment-route-surface" hidden={!routeVisible ? true : undefined}>
        <div data-xgc-role="experiment-dashboard-surface" hidden={!dashboardVisible ? true : undefined}>
          <RobotControlFrameProvider panel={panel}>
            <div data-xgc-role="experiment-panel-header-leading" data-xgc-id={panel.id}>
              <RobotControlHeaderLeading panel={panel} editing={false} />
            </div>
            <div data-xgc-role="experiment-panel-header-trailing" data-xgc-id={panel.id}>
              <RobotControlHeaderActions panel={panel} editing={false} />
            </div>
            <PX4RotorControlPanel panel={panel} context={context(action,robots)} />
          </RobotControlFrameProvider>
        </div>
      </div>
    </ExperimentSurfaceVisibilityProvider>
  </ProductRouteVisibilityProvider>;
}

function writeSelection(ids: string[]) {
  window.localStorage.setItem('xgc.experiment.experiment-a.robot.selection', JSON.stringify(ids));
}

function panelFixture(options:Record<string,unknown> = {}):PanelInstance {
  return { id:'robot-control',pluginId:'px4-rotor-control-panel',title:'Robot control',gridPos:{ x:0,y:0,w:8,h:6 },query:{},options:{ dashboard:'gcs',...options },fieldConfig:{},portBindings:[] };
}

function actionPort():PanelActionPortRuntime {
  return { id:'remote-control',label:'Remote control',connected:true,disabledReason:'',
    action:{ id:'set-motion-intent',label:'Remote control',kind:'command',controls:['cancel'] },
    defaults:{},invoke:vi.fn(async () => ({ id:'run-1',status:'running' as const,revision:1 })),
    control:vi.fn(async () => undefined),trace:{} };
}

const defaultRobots = [
  { id:'px4-01',px4: {} },{ id:'scout-01',scout: {} },
];

function context(
  action?:PanelActionPortRuntime,
  robots:readonly Record<string,unknown>[] = defaultRobots,
):PanelPluginContext {
  return {
    sharedStateScope: 'experiment',
    executionTargetId:'local',
    ports:{ actions:action ? { 'remote-control':action } : {},data:{ robots:{
      id:'robots',label:'Robots',contract:'experiment.robots.v1',connected:true,
      value:{ head:{ resourceId:'experiment-a' },branch:{ name:'main' },spec:{ robots } },trace:{},
    } },authoring:{},interactions:{} } };
}
