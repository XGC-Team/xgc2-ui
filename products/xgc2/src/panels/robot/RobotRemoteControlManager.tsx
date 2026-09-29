import {
  Gamepad2,GripVertical,X,
} from 'lucide-react';
import { memo,useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactElement,type MouseEvent,type PointerEvent,cloneElement } from 'react';
import { createPortal } from 'react-dom';
import { ControlButton } from '../../components/controls/ControlButton';
import { robotInstrumentSessionRunIds,useExperimentSurfaceVisible,useExperimentStationOccupancy,type ExperimentDocument } from '../../domains/experiment/experimentPublic';
import {
  ensureOperatorControlSession,
  operatorControlSessionReady,
  OperatorControlSessionNotice,
  useOperatorControlSession,
} from '../../domains/operatorAccess/operatorAccessPublic';
import {
  useGroundStationErrorNotification,
  useGroundStationRemoteDock,
  useGroundStationNativeAgentRegistry,
  useGroundStationRemoteRequests,
  useGroundStationRemoteMessages,
  syncGroundStationRemoteMessages,
  remoteConversationScope,
  isGroundStationRemoteMessageClosed,
} from '../../domains/groundStationInteraction/groundStationInteractionPublic';
import { postRobotMotionIntent,useLiveConnectedRobotIds,useRobotSelection,useRobotText } from '../../domains/robot/robotPublic';
import { panelDashboardId } from '../../shared/panelDashboard';
import { useProductRouteVisible } from '../../shared/routeReady';
import type { PanelPluginProps } from '../types';
import { usePanelFrameControl } from '../usePanelFrameControl';
import {
  remoteControlSelectionRefusal,
  robotIdsForRemoteControl,
} from './robotControlSelectionModel';
import { useRobotControlFrame } from './robotPanelFrameContext';
import {
  patchPersistedRemoteController,
  readPersistedRemoteController,
  readPersistedRemoteControllers,
  syncPersistedRemoteControllers,
  type RemoteControlDirection,
} from './robotRemoteControlPersistence';
import { robotRemoteSpringReturn } from './robotRemoteControlOptions';
import {
  releasedRemoteIntent,
  type RemoteControlAxis,
  type RemoteControlGear,
  type RemoteControlIntent,
  type SubmitRemoteControlIntent,
} from './useRobotRemoteControlController';
import { RobotRemoteControlSurface } from './RobotRemoteControlSurface';
import '../../styles/robot-remote-control.css';

type Direction = RemoteControlDirection;
type ControllerInstance = { id:string;sessionId?:string;interactionId?:string;conversationId?:string;robots:Array<{ id:string;name:string }> };
type PersistScope = { experimentId:string;panelId:string };
const noRobots: Array<{ id:string;px4?: unknown;scout?: unknown;mecanum?: unknown }> = [];
const idSets = new WeakMap<readonly string[],ReadonlySet<string>>();

/**
 * Membership view of an immutable connection id list (live/known/disconnected).
 * Checks run per robot on every render, request and joystick intent, so a
 * fleet-sized list is turned into a Set once per snapshot instead of scanned.
 */
function idSet(ids:readonly string[]) {
  let set = idSets.get(ids);
  if (!set) {
    set = new Set(ids);
    idSets.set(ids,set);
  }
  return set;
}

export function RobotRemoteControlManager({ panel,context }:PanelPluginProps<readonly ['visualization','experiment','automation']>) {
  const t = useRobotText();
  const frame = useRobotControlFrame(panel.id);
  const experiment = experimentDocument(context.ports.data.robots?.value);
  const routeVisible = useProductRouteVisible();
  const dashboardVisible = useExperimentSurfaceVisible();
  const operatorPresent = routeVisible && dashboardVisible;
  const layerAnchorRef = useRef<HTMLSpanElement>(null);
  const [layerHost,setLayerHost] = useState<HTMLElement | null>(null);
  const textRef = useRef(t);
  const experimentRef = useRef(experiment);
  textRef.current = t;
  experimentRef.current = experiment;
  const targetId = context.executionTargetId || 'local';
  const experimentId = experiment?.head.resourceId ?? '';
  const occupancy = useExperimentStationOccupancy();
  const activeSession = occupancy.sessions.find(({session}) => (
    session.experimentResourceId === experimentId && session.state === 'active'
  ));
  const activeSessionId = activeSession?.session.id;
  const connectionRuns = robotInstrumentSessionRunIds(experiment?.spec.dashboards ?? [],activeSession);
  const connections = useLiveConnectedRobotIds(targetId,connectionRuns);
  const connectionsRef = useRef(connections);
  connectionsRef.current = connections;
  const runtimeRef = useRef({ resolved:occupancy.resolved,activeSessionId });
  runtimeRef.current = { resolved:occupancy.resolved,activeSessionId };
  const dockHost = useGroundStationRemoteDock(experimentId);
  const {requests:remoteRequests,closeRequest} = useGroundStationRemoteRequests(targetId,experimentId);
  const nativeRegistry = useGroundStationNativeAgentRegistry();
  const remoteMessages = useGroundStationRemoteMessages(experimentId);
  const messageScope = remoteConversationScope(experimentId,nativeRegistry?.selected[experimentId]);
  const persistIdentity = `${experimentId}:${panel.id}`;
  const [controllers,setControllers] = useState<ControllerInstance[]>(() => (
    identitiesFromPersisted(readPersistedRemoteControllers(experimentId,panel.id).filter(item => !isGroundStationRemoteMessageClosed(experimentId,item.id)))
  ));
  const [seenPersistIdentity,setSeenPersistIdentity] = useState(persistIdentity);
  if (seenPersistIdentity !== persistIdentity) {
    setSeenPersistIdentity(persistIdentity);
    setControllers(identitiesFromPersisted(readPersistedRemoteControllers(experimentId,panel.id).filter(item => !isGroundStationRemoteMessageClosed(experimentId,item.id))));
  }
  const [error,setError] = useState('');
  useGroundStationErrorNotification(context.executionTargetId || 'local',error,{
    title:t('Robot control'),source:panel.id,dedupeKey:`${panel.id}:remote-control-error`,
  });
  const robots = experiment?.spec.robots ?? noRobots;
  const [selectedRobotIds] = useRobotSelection({
    experimentId:experiment?.head.resourceId,dashboardId:panelDashboardId(panel),panelId:panel.id,shared:context.sharedStateScope,
  });
  const swarmRobots = useMemo(
    () => robots.map((robot) => ({
      id:robot.id,name:robot.id,px4:robot.px4,scout:robot.scout,mecanum:robot.mecanum,
    })),
    [robots],
  );
  const targetIds = useMemo(
    () => robotIdsForRemoteControl(selectedRobotIds, swarmRobots),
    [swarmRobots,selectedRobotIds],
  );
  const targetRobots = useMemo(() => {
    const targets = new Set(targetIds);
    return swarmRobots.filter((robot) => targets.has(robot.id)).map((robot) => ({ id:robot.id,name:robot.name }));
  },[swarmRobots,targetIds]);
  const controlSession = useOperatorControlSession();
  const controlSessionRefusal = controlSession.phase === 'denied'
    ? t('Robot control needs a signed-in operator session on this browser.')
    : controlSession.phase === 'unavailable'
      ? t('The station could not confirm this browser; robot control is paused.')
      : '';
  const controlSessionBlockedRef = useRef(controlSession.blocked);
  controlSessionBlockedRef.current = controlSession.blocked;
  const selectionRefusal = t(remoteControlSelectionRefusal(selectedRobotIds, swarmRobots));
  const refusal = context.disabledReason || selectionRefusal || controlSessionRefusal
    || (!occupancy.resolved || !activeSessionId ? t('Remote control is unavailable.') : '')
    || (!connections.loaded || targetRobots.some(robot => !idSet(connections.liveIds).has(robot.id))
      ? t('Remote control is unavailable.') : '')
    || (targetRobots.length === 0 ? t('Remote control is unavailable for the selected robots.') : '');
  const selectedAlreadyControlled = controllers.some((controller) => (
    controller.robots.some((robot) => idSet(targetIds).has(robot.id))
  ));
  const launcherRefusal = refusal || (selectedAlreadyControlled
    ? t('A selected robot already has a remote controller.')
    : '');
  const snapshot = useRef({ controllers,targetRobots,refusal });
  snapshot.current = { controllers,targetRobots,refusal };
  const finishers = useRef(new Map<string,()=>Promise<void>>());
  const generations = useRef(new Map<string,number>());
  const registerFinish = useCallback((controllerId:string,finish:()=>Promise<void>) => {
    finishers.current.set(controllerId,finish);
  },[]);
  const springReturn = robotRemoteSpringReturn(panel.options);
  const closingTargets = useRef(new Map<string,ReadonlySet<string>>());

  const submit = useCallback<SubmitRemoteControlIntent>(async (controllerId,robotIds,intent) => {
    if (!experimentId) throw new Error(textRef.current('Remote control is unavailable.'));
    const runtime = runtimeRef.current;
    // An ended Session has already torn down its adapters; never send a final
    // stop (or a restored direction) into a different Session.
    if (!runtime.resolved || !activeSessionId || activeSessionId !== runtime.activeSessionId) return;
    const live = connectionsRef.current;
    if (!live.loaded) return;
    const stopping = intent.longitudinal === 0 && intent.lateral === 0 && intent.yaw === 0;
    // Stop intents always go out; motion intents wait on the operator session.
    if (!stopping && controlSessionBlockedRef.current) return;
    const finalTargets = closingTargets.current.get(controllerId);
    if (finalTargets && !stopping) return;
    const liveIds = idSet(live.liveIds);
    const connectedIds = robotIds.filter(id => liveIds.has(id) && (!finalTargets || finalTargets.has(id)));
    if (!connectedIds.length || (!stopping && connectedIds.length !== robotIds.length)) return;
    const accepted = await postRobotMotionIntent(targetId,{
      experimentId,sessionId:activeSessionId,controllerId,robotIds:connectedIds,...intent,
      generation:generations.current.get(controllerId) ?? 0,
    });
    if (accepted?.generation && accepted.generation > 0) {
      generations.current.set(controllerId,accepted.generation);
    }
  },[activeSessionId,experimentId,targetId]);
  const finishController = useCallback(async (controller:ControllerInstance) => {
    const finish = finishers.current.get(controller.id);
    try {
      if (finish) await finish();
      else await submit(controller.id,controller.robots.map((robot) => robot.id),releasedRemoteIntent);
    } finally {
      if (finishers.current.get(controller.id) === finish) finishers.current.delete(controller.id);
    }
  },[submit]);

  useLayoutEffect(() => {
    setLayerHost(layerAnchorRef.current?.closest(
      '[data-xgc-role="experiment-dashboard-surface"],[data-xgc-role="experiment-route-surface"]',
    ) as HTMLElement | null ?? layerAnchorRef.current?.parentElement ?? null);
  },[]);

  const open = useCallback(() => {
    const current = snapshot.current;
    setError('');
    if (!operatorPresent || current.refusal) return setError(current.refusal || textRef.current('Remote control is unavailable.'));
    const targetSet = new Set(current.targetRobots.map((robot) => robot.id));
    if (current.controllers.some((controller) => controller.robots.some((robot) => targetSet.has(robot.id)))) {
      return setError(t('A robot already has a remote controller.'));
    }
    const create = () => {
      const latest = snapshot.current;
      if (latest.refusal) return setError(latest.refusal);
      const id = window.crypto?.randomUUID?.() ?? `remote-${Date.now()}`;
      const next = [...latest.controllers,{ id,sessionId:runtimeRef.current.activeSessionId,conversationId:messageScope,robots:latest.targetRobots }];
      persistControllerIdentities(experimentRef.current?.head.resourceId,panel.id,next);
      snapshot.current = {...latest,controllers:next};
      setControllers(next);
    };
    // Remote control moves robots; verify the operator session first. A refusal
    // stays inline (error notice + disabled launcher), never a page gate. Once
    // the session is verified, later openings stay synchronous.
    if (operatorControlSessionReady()) return create();
    void ensureOperatorControlSession().then((granted) => {
      if (!granted) return setError(snapshot.current.refusal || textRef.current('Remote control is unavailable.'));
      create();
    });
  },[messageScope,operatorPresent,panel.id,t]);
  const launcher = useMemo(() => ({
    open,disabled:Boolean(launcherRefusal),
    title:launcherRefusal || t('Start remote control for the selected robots.'),
    activeCount:controllers.length,
  }),[controllers.length,launcherRefusal,open,t]);
  usePanelFrameControl(frame.setRemoteControl,launcher);

  // A stable scope keeps the memoized controller windows from re-rendering
  // (and re-reading their persisted view) whenever this manager renders.
  const persistScope = useMemo<PersistScope>(() => ({ experimentId,panelId:panel.id }),[experimentId,panel.id]);
  const robotIdsKey = JSON.stringify(experiment?.spec.robots.map((robot) => robot.id) ?? []);
  useEffect(() => {
    const available = new Set<string>(JSON.parse(robotIdsKey));
    if (available.size === 0) return;
    setControllers((items) => items.filter((controller) => controller.robots.every((robot) => available.has(robot.id))));
  },[robotIdsKey]);

  useEffect(() => {
    if (!occupancy.resolved) return;
    const valid = controllers.filter(controller => controller.sessionId && controller.sessionId === activeSessionId);
    if (valid.length !== controllers.length) {
      setControllers(valid);
      return;
    }
    persistControllerIdentities(experimentId,panel.id,controllers);
    if (!nativeRegistry || messageScope) syncGroundStationRemoteMessages(experimentId,panel.id,controllers,messageScope);
  },[activeSessionId,occupancy.resolved,controllers,experimentId,panel.id,messageScope,nativeRegistry]);

  const closingControllers = useRef(new Set<string>());
  const close = useCallback(async (controller:ControllerInstance) => {
    // A server dismissal can arrive over SSE before its HTTP response. Both
    // paths close the same historical controller and must share one cleanup.
    if (closingControllers.current.has(controller.id)) return;
    closingControllers.current.add(controller.id);
    const liveIds = idSet(connectionsRef.current.liveIds);
    closingTargets.current.set(controller.id,new Set(controller.robots
      .filter(robot => liveIds.has(robot.id)).map(robot => robot.id)));
    const remaining = snapshot.current.controllers.filter((item) => item.id !== controller.id);
    snapshot.current = {...snapshot.current,controllers:remaining};
    persistControllerIdentities(experimentId,panel.id,remaining);
    syncGroundStationRemoteMessages(experimentId,panel.id,remaining,messageScope);
    const finishing = finishController(controller);
    setControllers(remaining);
    const results = await Promise.allSettled([
      finishing,
      controller.interactionId ? closeRequest(controller.interactionId) : Promise.resolve(),
    ]);
    for (const result of results) {
      if (result.status === 'rejected') setError(result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
  },[closeRequest,experimentId,finishController,messageScope,panel.id]);

  useEffect(() => {
    if (!connections.loaded) return;
    const disconnectedIds = idSet(connections.disconnectedIds);
    for (const controller of snapshot.current.controllers) {
      if (controller.robots.some(robot => disconnectedIds.has(robot.id))) void close(controller);
    }
  },[close,connections]);

  const rejectedRequests = useRef(new Set<string>());
  useEffect(() => {
    if (!occupancy.resolved || !operatorPresent || !connections.loaded) return;
    const disconnectedIds = idSet(connections.disconnectedIds);
    const liveIds = idSet(connections.liveIds);
    const robotsById = new Map(swarmRobots.map((robot) => [robot.id,robot] as const));
    for (const request of remoteRequests) {
      const remote=request.payload.context.remoteController!;
      const existing=snapshot.current.controllers.find(item=>item.id===request.id);
      const ended=request.status!=='open' || remote.sessionId!==activeSessionId
        || isGroundStationRemoteMessageClosed(experimentId,request.id)
        || remote.robotIds.some(id=>disconnectedIds.has(id));
      const overlaps=!existing && snapshot.current.controllers.some(controller =>
        controller.robots.some(robot => remote.robotIds.includes(robot.id)));
      if (ended || overlaps) {
        if(existing) void close(existing);
        else if(request.status==='open' && !closingControllers.current.has(request.id) && !rejectedRequests.current.has(request.id)) {
          rejectedRequests.current.add(request.id);
          void closeRequest(request.id).catch(cause=>setError(String(cause)));
        }
        continue;
      }
      if(existing || rejectedRequests.current.has(request.id) || remote.robotIds.some(id=>!liveIds.has(id))) continue;
      const selected=remote.robotIds.map(id=>robotsById.get(id));
      if(selected.some(robot=>!robot)) continue;
      const next=[...snapshot.current.controllers,{
        id:request.id,sessionId:remote.sessionId,interactionId:request.id,conversationId:remote.conversationId,
        robots:selected.map(robot=>({id:robot!.id,name:robot!.name})),
      }];
      snapshot.current={...snapshot.current,controllers:next};
      persistControllerIdentities(experimentId,panel.id,next);
      setControllers(next);
    }
  },[activeSessionId,close,closeRequest,connections,experimentId,swarmRobots,occupancy.resolved,operatorPresent,panel.id,remoteRequests]);

  useEffect(() => {
    if (operatorPresent) return;
    for (const controller of snapshot.current.controllers) void close(controller);
  },[close,operatorPresent]);

  useEffect(() => () => {
    const currentExperimentId = experimentRef.current?.head.resourceId;
    const persisted = currentExperimentId
      ? readPersistedRemoteControllers(currentExperimentId,panel.id)
      : [];
    const keep = new Set(persisted.map((item) => item.id));
    for (const controller of snapshot.current.controllers) {
      if (keep.has(controller.id)) continue;
      void finishController(controller)
        .catch(() => undefined);
    }
  },[finishController,panel.id]);

  const knownIds = idSet(connections.knownIds);
  const windows = controllers.filter(controller => connections.loaded && occupancy.resolved && controller.sessionId
    && controller.robots.every(robot => knownIds.has(robot.id))
    && controller.sessionId === activeSessionId
    && (!controller.interactionId || remoteRequests.some(request=>request.id===controller.interactionId
      && request.status==='open'))).map((controller,index) => (
    <RemoteMessagePortal key={controller.id} experimentId={experimentId} controllerId={controller.id} floatingHost={layerHost} fallbackDock={dockHost} inCurrentConversation={remoteMessages.some(message => message.id === controller.id && message.conversationId === messageScope)}><RobotRemoteControlWindow controller={controller} index={index}
      persistScope={persistScope}
      docked={false}
      springReturn={springReturn} submit={submit} onFinishReady={registerFinish} onClose={close} onError={setError} /></RemoteMessagePortal>
  ));
  return <>
    <span ref={layerAnchorRef} hidden />
    <OperatorControlSessionNotice />
    {operatorPresent && windows}
  </>;
}

function RemoteMessagePortal({experimentId,controllerId,floatingHost,fallbackDock,inCurrentConversation,children}:{experimentId:string;controllerId:string;floatingHost:HTMLElement|null;fallbackDock:HTMLElement|null;inCurrentConversation:boolean;children:ReactElement<{docked:boolean}>}) {
  const messageDock = useGroundStationRemoteDock(`${experimentId}:${controllerId}`);
  const dock = inCurrentConversation ? messageDock ?? fallbackDock : null;
  const host = dock ?? floatingHost;
  const [container] = useState(() => document.createElement('div'));
  useLayoutEffect(() => {
    container.className = dock ? 'robot-remote-message-host' : 'robot-remote-window-layer';
    host?.appendChild(container);
    return () => {
      container.remove();
    };
  },[container,dock,host]);
  // Moving the container preserves React state and the in-flight control queue.
  return createPortal(cloneElement(children,{docked:Boolean(dock)}),container);
}

const RobotRemoteControlWindow = memo(function RobotRemoteControlWindow({
  controller,index,persistScope,docked,springReturn,submit,onFinishReady,onClose,onError,
}:{
  controller:ControllerInstance;index:number;persistScope:PersistScope;docked:boolean;springReturn:boolean;
  submit:SubmitRemoteControlIntent;
  onFinishReady:(controllerId:string,finish:()=>Promise<void>)=>void;
  onClose:(controller:ControllerInstance)=>void;onError:(message:string)=>void;
}) {
  const t = useRobotText();
  const shellRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ dx:number;dy:number } | null>(null);
  // Read the persisted view once per window, not on every render/drag move.
  const [stored] = useState(() => readPersistedRemoteController(
    persistScope.experimentId,persistScope.panelId,controller.id,
  ));
  const restoredGear = stored?.gear ?? 1;
  const restoredPressed = springReturn || controller.interactionId ? [] : stored?.pressed ?? [];
  const [origin,setOrigin] = useState<{ left:number;top:number } | null>(stored?.origin ?? null);
  const [dragging,setDragging] = useState(false);
  const robotIds = useMemo(() => controller.robots.map((robot) => robot.id),[controller.robots]);
  const persistView = useCallback((patch:Parameters<typeof patchPersistedRemoteController>[3]) => {
    patchPersistedRemoteController(persistScope.experimentId,persistScope.panelId,controller.id,patch);
  },[controller.id,persistScope.experimentId,persistScope.panelId]);
  const persistIntent = useCallback((intent:RemoteControlIntent) => {
    const pressed:Direction[] = [];
    if (intent.longitudinal) pressed.push(intent.longitudinal > 0 ? 'forward' : 'backward');
    if (intent.lateral) pressed.push(intent.lateral > 0 ? 'left' : 'right');
    if (intent.yaw) pressed.push(intent.yaw > 0 ? 'yaw-left' : 'yaw-right');
    persistView({ gear:intent.gear,pressed });
  },[persistView]);
  useEffect(() => { shellRef.current?.focus({ preventScroll:true }); },[]);
  function suppressButtonFocus(event:MouseEvent) { event.preventDefault(); }
  function beginDrag(event: PointerEvent<HTMLElement>) {
    if (docked || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('button')) return;
    const shell = shellRef.current;
    if (!shell) return;
    event.preventDefault();
    const rect = shell.getBoundingClientRect();
    dragRef.current = { dx: event.clientX - rect.left,dy: event.clientY - rect.top };
    setOrigin({ left: rect.left,top: rect.top });
    setDragging(true);
    shell.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: PointerEvent<HTMLElement>) {
    if (docked) return;
    const drag = dragRef.current;
    const shell = shellRef.current;
    if (!drag || !shell) return;
    const rect = shell.getBoundingClientRect();
    setOrigin(clampRemoteWindowOrigin(
      event.clientX - drag.dx,
      event.clientY - drag.dy,
      rect.width,
      rect.height,
    ));
  }
  function endDrag(event: PointerEvent<HTMLElement>) {
    if (docked || !dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    if (shellRef.current?.hasPointerCapture(event.pointerId)) {
      shellRef.current.releasePointerCapture(event.pointerId);
    }
    const shell = shellRef.current;
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    persistView({ origin:{ left:rect.left,top:rect.top } });
  }

  return (
    <section ref={shellRef} className={docked ? 'robot-remote-window robot-remote-window-message robot-remote-window-docked' : 'robot-remote-window robot-remote-window-message'} tabIndex={0}
      style={docked ? undefined : origin
        ? { left: origin.left,top: origin.top }
        : { right: 24 + index * 28,bottom: 116 + index * 28 }}
      data-xgc-role="robot-remote-control" data-xgc-id={controller.id}
      data-xgc-robot-ids={robotIds.join(',')}
      data-xgc-spring-return={springReturn ? 'true' : 'false'}
      data-xgc-docked={docked ? 'true' : undefined}
      data-xgc-dragging={dragging ? 'true' : undefined}
      aria-label={t('Remote controller for {robots}',{ robots:robotIds.join(', ') })}
      onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
      <header data-xgc-role="robot-remote-control-drag" data-xgc-id={controller.id}>
        <div data-xgc-role="robot-remote-drag-handle" data-xgc-id={controller.id}>{docked ? <Gamepad2 size={15} aria-hidden="true" /> : <GripVertical size={15} aria-hidden="true" />}</div>
        <ControlButton appearance="inverse" className="robot-remote-control-key" iconOnly size="compact" tabIndex={-1} aria-label={t('Close remote controller')} dataXgcRole="robot-remote-control-close" dataXgcId={controller.id}
          onMouseDown={suppressButtonFocus} onClick={() => onClose(controller)}>
          <X size={14} />
        </ControlButton>
      </header>
      <RobotRemoteControlSurface
        identity={JSON.stringify([persistScope.experimentId,persistScope.panelId,controller.sessionId,controller.id])}
        controllerId={controller.id} robots={controller.robots} canMotion
        submit={submit} springReturn={springReturn}
        initialIntent={intentFrom(restoredGear,new Set(restoredPressed))}
        activateOnMount={!controller.interactionId}
        onIntentChange={persistIntent} onFinishReady={onFinishReady}
        onClose={() => onClose(controller)} onError={onError} />
    </section>
  );
});

// eslint-disable-next-line react-refresh/only-export-components -- viewport clamp for the floating controller
export function clampRemoteWindowOrigin(left:number,top:number,width:number,height:number) {
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const maxTop = Math.max(margin, window.innerHeight - height - margin);
  return {
    left: Math.min(Math.max(margin, left), maxLeft),
    top: Math.min(Math.max(margin, top), maxTop),
  };
}

function intentFrom(gear:RemoteControlGear,pressed:ReadonlySet<Direction>):RemoteControlIntent {
  return {
    gear,
    longitudinal:axis(pressed.has('forward'),pressed.has('backward')),
    lateral:axis(pressed.has('left'),pressed.has('right')),
    yaw:axis(pressed.has('yaw-left'),pressed.has('yaw-right')),
    release: false,
  };
}
function axis(positive:boolean,negative:boolean):RemoteControlAxis {
  return positive === negative ? 0 : positive ? 1 : -1;
}
function experimentDocument(value:unknown):ExperimentDocument|undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Partial<ExperimentDocument>;
  return candidate.head && candidate.branch && candidate.spec ? candidate as ExperimentDocument : undefined;
}
function identitiesFromPersisted(controllers:ReturnType<typeof readPersistedRemoteControllers>) {
  const claimed = new Set<string>();
  return controllers.filter(controller => {
    if (controller.robots.some(robot => claimed.has(robot.id))) return false;
    controller.robots.forEach(robot => claimed.add(robot.id));
    return true;
  }).map((controller) => ({ id:controller.id,sessionId:controller.sessionId,interactionId:controller.interactionId,conversationId:controller.conversationId,robots:controller.robots }));
}
function persistControllerIdentities(
  experimentId:string|undefined,
  panelId:string,
  controllers:ReadonlyArray<ControllerInstance>,
) {
  if (!experimentId) return;
  syncPersistedRemoteControllers(experimentId,panelId,controllers);
}
