import {
  ArrowDown,ArrowLeft,ArrowRight,ArrowUp,Gamepad2,GripVertical,RotateCcw,RotateCw,Square,X,
} from 'lucide-react';
import { memo,useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactElement,type MouseEvent,type PointerEvent,cloneElement } from 'react';
import { createPortal } from 'react-dom';
import { ControlButton } from '../../components/controls/ControlButton';
import { useExperimentSurfaceVisible,useStationExperimentOccupancy,type ExperimentDocument } from '../../domains/experiment/experimentPublic';
import {
  useGroundStationErrorNotification,
  useGroundStationRemoteDock,
  useGroundStationNativeAgentRegistry,
  useGroundStationRemoteRequests,
  syncGroundStationRemoteMessages,
  remoteConversationScope,
  isGroundStationRemoteMessageClosed,
} from '../../domains/groundStationInteraction/groundStationInteractionPublic';
import { postRobotMotionIntent,useRobotSelection,useRobotText } from '../../domains/robot/robotPublic';
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
  clearPersistedRemoteControllers,
  patchPersistedRemoteController,
  persistPressed,
  readPersistedRemoteController,
  readPersistedRemoteControllers,
  syncPersistedRemoteControllers,
  type RemoteControlDirection,
} from './robotRemoteControlPersistence';
import { robotRemoteSpringReturn } from './robotRemoteControlOptions';
import {
  stoppedRemoteIntent,
  useRobotRemoteControlController,
  type RemoteControlAxis,
  type RemoteControlGear,
  type RemoteControlIntent,
  type SubmitRemoteControlIntent,
} from './useRobotRemoteControlController';
import '../../styles/robot-remote-control.css';

type Direction = RemoteControlDirection;
type ControllerInstance = { id:string;sessionId?:string;interactionId?:string;robots:Array<{ id:string;name:string }> };
type PersistScope = { experimentId:string;panelId:string };
const noRobots: Array<{ id:string;px4?: unknown;scout?: unknown;mecanum?: unknown }> = [];

const oppositeDirection: Record<Direction, Direction> = {
  forward: 'backward',
  backward: 'forward',
  left: 'right',
  right: 'left',
  'yaw-left': 'yaw-right',
  'yaw-right': 'yaw-left',
};

const speedGears: Array<{
  id: RemoteControlGear;
  label: string;
  title: string;
}> = [
  { id: 1,label: 'Slow',title: 'Slow' },
  { id: 2,label: 'Medium',title: 'Medium' },
  { id: 3,label: 'Fast',title: 'Fast' },
];

const directions:Array<{ id:Direction;label:string;icon:typeof ArrowUp }> = [
  { id:'forward',label:'Forward',icon:ArrowUp },
  { id:'left',label:'Left',icon:ArrowLeft },
  { id:'right',label:'Right',icon:ArrowRight },
  { id:'backward',label:'Backward',icon:ArrowDown },
  { id:'yaw-left',label:'Yaw left',icon:RotateCcw },
  { id:'yaw-right',label:'Yaw right',icon:RotateCw },
];

/** xgc1 XRemoteControlDialog: arrows + Z/X, hold while the key is down. */
const holdKeys: Record<string, Direction> = {
  ArrowUp: 'forward',
  ArrowDown: 'backward',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  z: 'yaw-left',
  Z: 'yaw-left',
  x: 'yaw-right',
  X: 'yaw-right',
};

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
  const occupancy = useStationExperimentOccupancy(targetId);
  const activeSessionId = occupancy.sessions.find(({session}) => (
    session.experimentResourceId === experimentId && session.state === 'active'
  ))?.session.id;
  const runtimeRef = useRef({ resolved:occupancy.resolved,activeSessionId });
  runtimeRef.current = { resolved:occupancy.resolved,activeSessionId };
  const dockHost = useGroundStationRemoteDock(experimentId);
  const {requests:remoteRequests,closeRequest} = useGroundStationRemoteRequests(targetId,experimentId);
  const nativeRegistry = useGroundStationNativeAgentRegistry();
  const conversationId = nativeRegistry?.selected[experimentId] ?? undefined;
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
  const fleetRobots = useMemo(
    () => robots.map((robot) => ({
      id:robot.id,name:robot.id,px4:robot.px4,scout:robot.scout,mecanum:robot.mecanum,
    })),
    [robots],
  );
  const targetIds = useMemo(
    () => robotIdsForRemoteControl(selectedRobotIds, fleetRobots),
    [fleetRobots,selectedRobotIds],
  );
  const targetRobots = useMemo(
    () => fleetRobots.filter((robot) => targetIds.includes(robot.id)).map((robot) => ({ id:robot.id,name:robot.name })),
    [fleetRobots,targetIds],
  );
  const selectionRefusal = t(remoteControlSelectionRefusal(selectedRobotIds, fleetRobots));
  const refusal = context.disabledReason || selectionRefusal
    || (!occupancy.resolved || !activeSessionId ? t('Remote control is unavailable.') : '')
    || (targetRobots.length === 0 ? t('Remote control is unavailable for the selected robots.') : '');
  const selectedAlreadyControlled = controllers.some((controller) => (
    controller.robots.some((robot) => targetIds.includes(robot.id))
  ));
  const launcherRefusal = refusal || (selectedAlreadyControlled
    ? t('A selected robot already has a remote controller.')
    : '');
  const snapshot = useRef({ controllers,targetRobots,refusal });
  snapshot.current = { controllers,targetRobots,refusal };
  const finishers = useRef(new Map<string,()=>Promise<void>>());
  const registerFinish = useCallback((controllerId:string,finish:()=>Promise<void>) => {
    finishers.current.set(controllerId,finish);
  },[]);
  const springReturn = robotRemoteSpringReturn(panel.options);

  const submit = useCallback<SubmitRemoteControlIntent>(async (controllerId,robotIds,intent) => {
    if (!experimentId) throw new Error(textRef.current('Remote control is unavailable.'));
    const runtime = runtimeRef.current;
    // An ended Session has already torn down its adapters; never send a final
    // stop (or a restored direction) into a different Session.
    if (!runtime.resolved || !activeSessionId || activeSessionId !== runtime.activeSessionId) return;
    await postRobotMotionIntent(targetId,{ experimentId,sessionId:activeSessionId,controllerId,robotIds,...intent });
  },[activeSessionId,experimentId,targetId]);
  const finishController = useCallback(async (controller:ControllerInstance) => {
    const finish = finishers.current.get(controller.id);
    try {
      if (finish) await finish();
      else await submit(controller.id,controller.robots.map((robot) => robot.id),stoppedRemoteIntent);
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
    const id = window.crypto?.randomUUID?.() ?? `remote-${Date.now()}`;
    const next = [...current.controllers,{ id,sessionId:runtimeRef.current.activeSessionId,robots:current.targetRobots }];
    persistControllerIdentities(experimentRef.current?.head.resourceId,panel.id,next);
    setControllers(next);
  },[operatorPresent,panel.id,t]);
  const launcher = useMemo(() => ({
    open,disabled:Boolean(launcherRefusal),
    title:launcherRefusal || t('Start remote control for the selected robots.'),
    activeCount:controllers.length,
  }),[controllers.length,launcherRefusal,open,t]);
  usePanelFrameControl(frame.setRemoteControl,launcher);

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
    const remaining = snapshot.current.controllers.filter((item) => item.id !== controller.id);
    persistControllerIdentities(experimentRef.current?.head.resourceId,panel.id,remaining);
    try {
      await finishController(controller);
      if (controller.interactionId) await closeRequest(controller.interactionId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setControllers((items) => items.filter((item) => item.id !== controller.id));
    }
  },[closeRequest,finishController,panel.id]);

  useEffect(() => {
    if (!occupancy.resolved || !operatorPresent) return;
    for (const request of remoteRequests) {
      const remote=request.payload.context.remoteController!;
      const existing=snapshot.current.controllers.find(item=>item.id===request.id);
      const ended=request.status!=='open' || remote.sessionId!==activeSessionId
        || isGroundStationRemoteMessageClosed(experimentId,request.id);
      if (ended) {
        if(existing) void close(existing);
        else if(request.status==='open') void closeRequest(request.id).catch(cause=>setError(String(cause)));
        continue;
      }
      if(remote.conversationId!==conversationId || existing) continue;
      const selected=remote.robotIds.map(id=>fleetRobots.find(robot=>robot.id===id));
      if(selected.some(robot=>!robot)) continue;
      setControllers(items=>items.some(item=>item.id===request.id)?items:[...items,{
        id:request.id,sessionId:remote.sessionId,interactionId:request.id,
        robots:selected.map(robot=>({id:robot!.id,name:robot!.name})),
      }]);
    }
  },[activeSessionId,close,closeRequest,conversationId,experimentId,fleetRobots,occupancy.resolved,operatorPresent,remoteRequests]);

  useEffect(() => {
    if (operatorPresent) return;
    const openControllers = snapshot.current.controllers;
    if (openControllers.length === 0) return;
    const currentExperimentId = experimentRef.current?.head.resourceId;
    if (currentExperimentId) clearPersistedRemoteControllers(currentExperimentId,panel.id);
    setControllers([]);
    for (const controller of openControllers) {
      void finishController(controller)
        .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
    }
  },[finishController,operatorPresent,panel.id]);

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

  const windows = controllers.filter(controller => occupancy.resolved && controller.sessionId
    && controller.sessionId === activeSessionId
    && (!controller.interactionId || remoteRequests.some(request=>request.id===controller.interactionId
      && request.status==='open'))).map((controller,index) => (
    <RemoteMessagePortal key={controller.id} experimentId={experimentId} controllerId={controller.id} floatingHost={layerHost} fallbackDock={dockHost}><RobotRemoteControlWindow controller={controller} index={index}
      persistScope={{ experimentId,panelId:panel.id }}
      docked={false}
      springReturn={springReturn} submit={submit} onFinishReady={registerFinish} onClose={close} onError={setError} /></RemoteMessagePortal>
  ));
  return <>
    <span ref={layerAnchorRef} hidden />
    {operatorPresent && windows}
  </>;
}

function RemoteMessagePortal({experimentId,controllerId,floatingHost,fallbackDock,children}:{experimentId:string;controllerId:string;floatingHost:HTMLElement|null;fallbackDock:HTMLElement|null;children:ReactElement<{docked:boolean}>}) {
  const messageDock = useGroundStationRemoteDock(`${experimentId}:${controllerId}`);
  const dock = messageDock ?? fallbackDock;
  const host = dock ?? floatingHost;
  const [container] = useState(() => document.createElement('div'));
  useLayoutEffect(() => {
    container.className = dock ? 'robot-remote-message-host' : 'robot-remote-window-layer';
    host?.appendChild(container);
    return () => {
      const width = dock ? container.firstElementChild?.getBoundingClientRect().width : undefined;
      if (width) container.style.setProperty('--remote-window-width',`${width}px`);
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
  const stored = useRef(readPersistedRemoteController(
    persistScope.experimentId,persistScope.panelId,controller.id,
  )).current;
  const restoredGear = stored?.gear ?? 1;
  const restoredPressed = springReturn || controller.interactionId ? [] : stored?.pressed ?? [];
  const [origin,setOrigin] = useState<{ left:number;top:number } | null>(stored?.origin ?? null);
  const [dragging,setDragging] = useState(false);
  const [gear,setGear] = useState<RemoteControlGear>(restoredGear);
  const [pressed,setPressed] = useState<Set<Direction>>(() => new Set(restoredPressed));
  const pointerCommitted = useRef(false);
  const robotIds = useMemo(() => controller.robots.map((robot) => robot.id),[controller.robots]);
  const persistView = useCallback((patch:Parameters<typeof patchPersistedRemoteController>[3]) => {
    patchPersistedRemoteController(persistScope.experimentId,persistScope.panelId,controller.id,patch);
  },[controller.id,persistScope.experimentId,persistScope.panelId]);
  const delivery = useRobotRemoteControlController({
    identity:`${controller.id}:${robotIds.join(',')}`,controllerId:controller.id,robotIds,submit,onFinishReady,
    initialIntent:intentFrom(restoredGear,new Set(restoredPressed)),
    activateOnMount:!controller.interactionId,
  });
  const live = useRef({ gear,pressed,delivery,onError,springReturn:false });
  live.current.delivery = delivery;
  live.current.onError = onError;
  live.current.springReturn = springReturn;
  useEffect(() => { if (delivery.error) onError(delivery.error); },[delivery.error,onError]);
  useEffect(() => { shellRef.current?.focus({ preventScroll:true }); },[]);

  const applyPressed = useCallback((next: Set<Direction>, nextGear = live.current.gear) => {
    live.current.pressed = next;
    live.current.gear = nextGear;
    setPressed(next);
    persistView({ gear:nextGear,pressed:persistPressed(next) });
    live.current.delivery.send(intentFrom(nextGear, next));
  }, [persistView]);
  const setDirection = useCallback((direction: Direction, down: boolean) => {
    const next = new Set(live.current.pressed);
    if (down) {
      next.add(direction);
      next.delete(oppositeDirection[direction]);
    } else {
      next.delete(direction);
    }
    applyPressed(next);
  }, [applyPressed]);
  const stop = useCallback(() => {
    applyPressed(new Set());
    live.current.delivery.send({ ...stoppedRemoteIntent,gear:live.current.gear },true);
  }, [applyPressed]);

  useEffect(() => {
    if (springReturn && live.current.pressed.size > 0) applyPressed(new Set());
  }, [applyPressed,springReturn]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat) return;
      const direction = holdKeys[event.key];
      if (direction) {
        if (menuBlocksRemoteKeys(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        setDirection(direction, true);
        return;
      }
      if (typingInField(event.target)) return;
      if (event.key === ' ' || event.key === 'Escape') {
        event.preventDefault();
        if (event.key === 'Escape') onClose(controller);
        else stop();
      }
    }
    function onKeyUp(event: KeyboardEvent) {
      const direction = holdKeys[event.key];
      if (direction) {
        if (menuBlocksRemoteKeys(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        setDirection(direction, false);
        return;
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keyup', onKeyUp, true);
    };
  }, [controller,onClose,setDirection,stop]);

  function chooseGear(next:RemoteControlGear) {
    live.current.gear = next;
    setGear(next);
    persistView({ gear:next,pressed:persistPressed(live.current.pressed) });
    live.current.delivery.send(intentFrom(next,live.current.pressed));
  }
  function toggleDirection(direction:Direction) {
    const next = new Set(live.current.pressed);
    if (next.has(direction)) {
      next.delete(direction);
    } else {
      next.add(direction);
      next.delete(oppositeDirection[direction]);
    }
    applyPressed(next);
  }
  function consumePointerCommit() {
    if (!pointerCommitted.current) return false;
    pointerCommitted.current = false;
    return true;
  }
  function directionPointerDown(event: PointerEvent<HTMLButtonElement>, direction: Direction) {
    event.preventDefault();
    pointerCommitted.current = true;
    if (live.current.springReturn) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDirection(direction, true);
      return;
    }
    toggleDirection(direction);
  }
  function directionPointerUp(event: PointerEvent<HTMLButtonElement>, direction: Direction) {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (live.current.springReturn) setDirection(direction, false);
  }
  function directionClick(direction: Direction) {
    if (consumePointerCommit() || live.current.springReturn) return;
    toggleDirection(direction);
  }
  function suppressButtonFocus(event: MouseEvent) {
    event.preventDefault();
  }
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
        <div>{docked ? <Gamepad2 size={15} aria-hidden="true" /> : <GripVertical size={15} aria-hidden="true" data-xgc-role="robot-remote-drag-handle" data-xgc-id={controller.id} />}<strong
          className="robot-remote-target-title"
          title={controller.robots.map((robot) => robot.name).join(' · ')}
          data-xgc-role="robot-remote-control-title" data-xgc-id={controller.id}
        >{controller.robots.map((robot) => robot.name).join(' · ')}</strong></div>
        <ControlButton className="robot-remote-control-key" iconOnly size="compact" tabIndex={-1} aria-label={t('Close remote controller')} dataXgcRole="robot-remote-control-close" dataXgcId={controller.id}
          onMouseDown={suppressButtonFocus} onClick={() => onClose(controller)}>
          <X size={14} />
        </ControlButton>
      </header>
      <div className="robot-remote-gears" role="group" aria-label={t('Speed')}>
        {speedGears.map((option) => (
          <ControlButton key={option.id} className="robot-remote-control-key" size="compact" tabIndex={-1}
            dataXgcRole="robot-remote-speed-gear" dataXgcId={`${controller.id}:${option.id}`}
            aria-label={t(option.title)}
            title={t(option.title)}
            aria-pressed={gear === option.id}
            onPointerDown={(event) => { event.preventDefault(); chooseGear(option.id); }}
            onMouseDown={suppressButtonFocus} onClick={() => chooseGear(option.id)}>
            {t(option.label)}
          </ControlButton>
        ))}
      </div>
      <div className="robot-remote-directions" role="group" aria-label={t('Motion intentions')}>
        {directions.map(({ id,label,icon:Icon }) => (
          <ControlButton key={id} className={`robot-remote-control-key robot-remote-${id}`} size="compact" tabIndex={-1}
            dataXgcRole="robot-remote-motion-intent"
            dataXgcId={`${controller.id}:${id}`} aria-label={t(label)} aria-pressed={pressed.has(id)}
            onPointerDown={(event) => directionPointerDown(event, id)}
            onPointerUp={(event) => directionPointerUp(event, id)}
            onPointerCancel={(event) => directionPointerUp(event, id)}
            onMouseDown={suppressButtonFocus}
            onClick={() => directionClick(id)}>
            <Icon size={18} />
          </ControlButton>
        ))}
        <ControlButton className="robot-remote-control-key robot-remote-stop" size="compact" tone="danger" iconOnly tabIndex={-1}
          dataXgcRole="robot-remote-motion-intent"
          dataXgcId={`${controller.id}:stop`} aria-label={t('Stop')}
          aria-pressed={pressed.size === 0}
          onPointerDown={(event) => { event.preventDefault(); pointerCommitted.current = true; stop(); }}
          onMouseDown={suppressButtonFocus}
          onClick={() => { if (!consumePointerCommit()) stop(); }}>
          <Square size={16} />
        </ControlButton>
        <table className="robot-remote-shortcuts" data-xgc-role="robot-remote-shortcuts" data-xgc-id={controller.id}>
          <tbody>
            <tr><th scope="row">↑↓←→</th><td>{t('move')}</td></tr>
            <tr><th scope="row">Z/X</th><td>{t('yaw')}</td></tr>
            <tr><th scope="row">Space</th><td>{t('Stop')}</td></tr>
            <tr><th scope="row">Esc</th><td>{t('Close')}</td></tr>
          </tbody>
        </table>
      </div>
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
  };
}
function axis(positive:boolean,negative:boolean):RemoteControlAxis {
  return positive === negative ? 0 : positive ? 1 : -1;
}
function typingInField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}
function menuBlocksRemoteKeys(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('[role="listbox"], [role="menu"], [role="option"], [role="combobox"][aria-expanded="true"]'));
}
function experimentDocument(value:unknown):ExperimentDocument|undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Partial<ExperimentDocument>;
  return candidate.head && candidate.branch && candidate.spec ? candidate as ExperimentDocument : undefined;
}
function identitiesFromPersisted(controllers:ReturnType<typeof readPersistedRemoteControllers>) {
  return controllers.map((controller) => ({ id:controller.id,sessionId:controller.sessionId,interactionId:controller.interactionId,robots:controller.robots }));
}
function persistControllerIdentities(
  experimentId:string|undefined,
  panelId:string,
  controllers:ReadonlyArray<ControllerInstance>,
) {
  if (!experimentId) return;
  syncPersistedRemoteControllers(experimentId,panelId,controllers);
}
