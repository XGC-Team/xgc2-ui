import { ArrowDown,ArrowLeft,ArrowRight,ArrowUp,RotateCcw,RotateCw,Square } from 'lucide-react';
import { useCallback,useEffect,useRef,useState,type MouseEvent,type PointerEvent } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { useRobotText } from '../../domains/robot/robotLocalizationPublic';
import type { RemoteControlDirection } from './robotRemoteControlPersistence';
import {
  stoppedRemoteIntent,useRobotRemoteControlController,
  type RemoteControlAxis,type RemoteControlGear,type RemoteControlIntent,type SubmitRemoteControlIntent,
} from './useRobotRemoteControlController';
import '../../styles/robot-remote-control.css';

type Direction = RemoteControlDirection;

export type RobotRemoteControlSurfaceProps = {
  /** Exact owner lifetime, including the grant/Session, not a display name. */
  identity: string;
  controllerId: string;
  robots: readonly { id:string;name:string }[];
  canMotion: boolean;
  submit: SubmitRemoteControlIntent;
  springReturn?: boolean;
  initialIntent?: RemoteControlIntent;
  activateOnMount?: boolean;
  onIntentChange?: (intent:RemoteControlIntent)=>void;
  onFinishReady?: (controllerId:string,finish:()=>Promise<void>)=>void;
  onClose?: ()=>void;
  onError?: (message:string)=>void;
};

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

/** Shared controls only: each host owns its chrome, persistence and authority. */
export function RobotRemoteControlSurface(props:RobotRemoteControlSurfaceProps) {
  const key = JSON.stringify([props.identity,props.controllerId,props.robots.map(robot => robot.id)]);
  return <RemoteControlControls key={key} {...props} />;
}

function RemoteControlControls({
  identity,controllerId,robots,canMotion,submit,springReturn = true,
  initialIntent = stoppedRemoteIntent,activateOnMount = false,onIntentChange,onFinishReady,onClose,onError,
}:RobotRemoteControlSurfaceProps) {
  const t = useRobotText();
  const [gear,setGear] = useState(initialIntent.gear);
  const [pressed,setPressed] = useState(() => directionsFromIntent(initialIntent));
  const held = useRef(new Set<string>());
  const pointerCommitted = useRef(false);
  const delivery = useRobotRemoteControlController({
    identity,controllerId,robotIds:robots.map(robot => robot.id),submit,
    initialIntent,activateOnMount,canMotion,onFinishReady,
  });
  const live = useRef({ gear,pressed,delivery,canMotion,springReturn,onIntentChange,onClose,onError });
  live.current = { ...live.current,delivery,canMotion,springReturn,onIntentChange,onClose,onError };
  useEffect(() => { if (delivery.error) live.current.onError?.(delivery.error); },[delivery.error]);

  const applyPressed = useCallback((next:Set<Direction>,nextGear = live.current.gear,force = false) => {
    if (!live.current.canMotion) return;
    live.current.pressed = next;
    live.current.gear = nextGear;
    setPressed(next);
    setGear(nextGear);
    const intent = intentFrom(nextGear,next);
    live.current.onIntentChange?.(intent);
    live.current.delivery.send(intent,force);
  },[]);
  const setDirection = useCallback((direction:Direction,down:boolean) => {
    const next = new Set(live.current.pressed);
    if (down) { next.add(direction);next.delete(oppositeDirection[direction]); }
    else next.delete(direction);
    applyPressed(next);
  },[applyPressed]);
  const stop = useCallback(() => {
    held.current.clear();
    applyPressed(new Set(),live.current.gear,true);
  },[applyPressed]);
  const cancelInput = useCallback(() => {
    held.current.clear();
    if (live.current.pressed.size) applyPressed(new Set());
  },[applyPressed]);

  useEffect(() => {
    if (springReturn) cancelInput();
  },[cancelInput,springReturn]);
  useEffect(() => {
    if (canMotion) return;
    held.current.clear();
    live.current.pressed = new Set();
    setPressed(new Set());
  },[canMotion]);

  useEffect(() => {
    if (!canMotion) return;
    const heldKeys = held.current;
    function onKeyDown(event:KeyboardEvent) {
      const key = keyOf(event);
      if (event.repeat || heldKeys.has(key)) return;
      const direction = holdKeys[key];
      if (direction) {
        if (menuBlocksRemoteKeys(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        heldKeys.add(key);
        setDirection(direction,true);
        return;
      }
      if (typingInField(event.target)) return;
      if (key === ' ' || key === 'Escape') {
        event.preventDefault();
        if (key === 'Escape' && live.current.onClose) live.current.onClose();
        else stop();
      }
    }
    function onKeyUp(event:KeyboardEvent) {
      const key = keyOf(event);
      const direction = holdKeys[key];
      // A focus change to a menu must not swallow the matching release.
      if (!direction || !heldKeys.delete(key)) return;
      event.preventDefault();
      event.stopPropagation();
      setDirection(direction,false);
    }
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') cancelInput();
    }
    window.addEventListener('keydown',onKeyDown,true);
    window.addEventListener('keyup',onKeyUp,true);
    window.addEventListener('blur',cancelInput);
    window.addEventListener('pagehide',cancelInput);
    document.addEventListener('visibilitychange',onVisibilityChange);
    return () => {
      heldKeys.clear();
      window.removeEventListener('keydown',onKeyDown,true);
      window.removeEventListener('keyup',onKeyUp,true);
      window.removeEventListener('blur',cancelInput);
      window.removeEventListener('pagehide',cancelInput);
      document.removeEventListener('visibilitychange',onVisibilityChange);
    };
  },[canMotion,cancelInput,setDirection,stop]);

  function chooseGear(next:RemoteControlGear) {
    applyPressed(new Set(live.current.pressed),next);
  }
  function toggleDirection(direction:Direction) {
    setDirection(direction,!live.current.pressed.has(direction));
  }
  function consumePointerCommit() {
    if (!pointerCommitted.current) return false;
    pointerCommitted.current = false;
    return true;
  }
  function directionPointerDown(event:PointerEvent<HTMLButtonElement>,direction:Direction) {
    if (!live.current.canMotion) return;
    event.preventDefault();
    pointerCommitted.current = true;
    if (live.current.springReturn) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDirection(direction,true);
    } else toggleDirection(direction);
  }
  function directionPointerUp(event:PointerEvent<HTMLButtonElement>,direction:Direction) {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (live.current.springReturn) setDirection(direction,false);
  }
  function directionClick(direction:Direction) {
    if (consumePointerCommit() || live.current.springReturn) return;
    toggleDirection(direction);
  }
  function suppressButtonFocus(event:MouseEvent) { event.preventDefault(); }

  return <>
      <div className="robot-remote-gears" role="group" aria-label={t('Speed')}>
        {speedGears.map((option) => (
          <ControlButton appearance="inverse" key={option.id} className="robot-remote-control-key" size="compact" tabIndex={canMotion ? 0 : -1} disabled={!canMotion}
            dataXgcRole="robot-remote-speed-gear" dataXgcId={`${controllerId}:${option.id}`}
            aria-label={t(option.title)}
            title={t(option.title)}
            aria-pressed={gear === option.id}
            onPointerDown={(event) => { event.preventDefault(); chooseGear(option.id); }}
            onMouseDown={suppressButtonFocus} onClick={() => chooseGear(option.id)}>
            {t(option.label)}
          </ControlButton>
        ))}
      </div>
      <div className="robot-remote-directions" role="group" aria-label={t('Remote controller for {robots}',{ robots:robots.map(robot => robot.name).join(', ') })}>
        {directions.map(({ id,label,icon:Icon }) => (
          <ControlButton appearance="inverse" key={id} className={`robot-remote-control-key robot-remote-${id}`} size="compact" tabIndex={canMotion ? 0 : -1} disabled={!canMotion}
            dataXgcRole="robot-remote-motion-intent"
            dataXgcId={`${controllerId}:${id}`} aria-label={t(label)} aria-pressed={pressed.has(id)}
            onPointerDown={(event) => directionPointerDown(event, id)}
            onPointerUp={(event) => directionPointerUp(event, id)}
            onPointerCancel={cancelInput}
            onLostPointerCapture={() => { if (live.current.springReturn) setDirection(id,false); else cancelInput(); }}
            onMouseDown={suppressButtonFocus}
            onClick={() => directionClick(id)}>
            <Icon size={18} />
          </ControlButton>
        ))}
        <ControlButton appearance="inverse" className="robot-remote-control-key robot-remote-stop" size="compact" tone="danger" iconOnly tabIndex={canMotion ? 0 : -1} disabled={!canMotion}
          dataXgcRole="robot-remote-motion-intent"
          dataXgcId={`${controllerId}:stop`} aria-label={t('Stop')}
          aria-pressed={pressed.size === 0}
          onPointerDown={(event) => { event.preventDefault(); pointerCommitted.current = true; stop(); }}
          onMouseDown={suppressButtonFocus}
          onClick={() => { if (!consumePointerCommit()) stop(); }}>
          <Square size={16} />
        </ControlButton>
        <table className="robot-remote-shortcuts" data-xgc-role="robot-remote-shortcuts" data-xgc-id={controllerId}>
          <tbody>
            <tr><th scope="row">↑↓←→</th><td>{t('move')}</td></tr>
            <tr><th scope="row">Z/X</th><td>{t('yaw')}</td></tr>
            <tr><th scope="row">Space</th><td>{t('Stop')}</td></tr>
            {onClose ? <tr><th scope="row">Esc</th><td>{t('Close')}</td></tr> : null}
          </tbody>
        </table>
      </div>
  </>;
}

function intentFrom(gear:RemoteControlGear,pressed:ReadonlySet<Direction>):RemoteControlIntent {
  return { gear,longitudinal:axis(pressed.has('forward'),pressed.has('backward')),
    lateral:axis(pressed.has('left'),pressed.has('right')),
    yaw:axis(pressed.has('yaw-left'),pressed.has('yaw-right')),release:false };
}
function directionsFromIntent(intent:RemoteControlIntent):Set<Direction> {
  const pressed = new Set<Direction>();
  if (intent.longitudinal) pressed.add(intent.longitudinal > 0 ? 'forward' : 'backward');
  if (intent.lateral) pressed.add(intent.lateral > 0 ? 'left' : 'right');
  if (intent.yaw) pressed.add(intent.yaw > 0 ? 'yaw-left' : 'yaw-right');
  return pressed;
}
function axis(positive:boolean,negative:boolean):RemoteControlAxis {
  return positive === negative ? 0 : positive ? 1 : -1;
}
function keyOf(event:KeyboardEvent) { return event.key.length === 1 ? event.key.toLowerCase() : event.key; }
function typingInField(target:EventTarget|null) {
  return target instanceof HTMLElement && Boolean(target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'));
}
function menuBlocksRemoteKeys(target:EventTarget|null) {
  return target instanceof HTMLElement && Boolean(target.closest('[role="listbox"],[role="menu"],[role="option"],[role="combobox"][aria-expanded="true"]'));
}
