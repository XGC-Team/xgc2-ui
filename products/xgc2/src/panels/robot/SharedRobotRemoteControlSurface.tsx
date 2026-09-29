import { Notice } from '@xgc2/ui-react';
import { useCallback,useRef,useState } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { isRemoteMotionHeld } from '../../domains/robot/robotPublic';
import { useLocalizedText } from '../../shared/localization/localizedText';
import type { SharedSurfaceClient,SharedSurfaceProps } from '../../shared/sharedSurface';
import { RobotRemoteControlSurface } from './RobotRemoteControlSurface';
import { stoppedRemoteIntent,type SubmitRemoteControlIntent } from './useRobotRemoteControlController';

const messages = {
  'This remote controller is unavailable.':'此遥控器不可用。',
  'This entry does not allow motion control.':'此入口未授权运动控制。',
  'The control command did not complete. Try again.':'控制指令未完成，请重试。',
  'Another operator is controlling these robots.':'其他操作者正在控制这些机器人。',
  'Take control':'接管控制',
};

type RemoteBinding = {
  identity:string;
  controllerId:string;
  robotIds:readonly string[];
  robots:readonly { id:string;name:string }[];
  canMotion:boolean;
};

/** Robot-owned adapter; the host supplies its already bound cookie transport. */
export function SharedRobotRemoteControlSurface({ projection,client }:SharedSurfaceProps) {
  const t = useLocalizedText(messages);
  const binding = remoteBinding(projection);
  if (!binding) return <Notice tone="danger" density="compact">{t('This remote controller is unavailable.')}</Notice>;
  return <SharedRemoteControl key={binding.identity} binding={binding} client={client} />;
}

function SharedRemoteControl({ binding,client }:{ binding:RemoteBinding;client:SharedSurfaceClient }) {
  const t = useLocalizedText(messages);
  const [failed,setFailed] = useState(false);
  const [held,setHeld] = useState(false);
  const generation = useRef(0);
  const sendMotion = useCallback(async (intent:{ gear:number;longitudinal:number;lateral:number;yaw:number;release?:boolean },takeover:boolean) => {
    const { gear,longitudinal,lateral,yaw,release } = intent;
    const response = await client.request('motion',{
      body:{ gear,longitudinal,lateral,yaw,release:Boolean(release),generation:generation.current,takeover },
    });
    const payload = await readMotionAccepted(response);
    if (payload.generation > 0) generation.current = payload.generation;
    setHeld(false);
    setFailed(false);
  },[client]);
  const submit = useCallback<SubmitRemoteControlIntent>(async (controllerId,robotIds,intent) => {
    if (!binding.canMotion || controllerId !== binding.controllerId
      || robotIds.length !== binding.robotIds.length
      || robotIds.some((id,index) => id !== binding.robotIds[index])) {
      throw new Error('Motion does not match the granted controller and robots.');
    }
    try {
      await sendMotion(intent,false);
    } catch (error) {
      if (isRemoteMotionHeld(error)) {
        setHeld(true);
        setFailed(false);
        return;
      }
      throw error;
    }
  },[binding,sendMotion]);
  return <section className="robot-remote-window robot-remote-window-message robot-remote-window-docked"
    data-xgc-role="shared-robot-remote-control" data-xgc-id={binding.controllerId}>
    <header><div>{binding.robots.map(robot => robot.name).join(', ')}</div></header>
    {held ? <Notice tone="warning" density="compact">{t('Another operator is controlling these robots.')}
      <ControlButton onClick={() => { void sendMotion({ ...stoppedRemoteIntent,gear:2,release:true },true).catch(() => setFailed(true)); }}
        dataXgcRole="shared-robot-take-control" dataXgcId={binding.controllerId}>{t('Take control')}</ControlButton>
    </Notice> : null}
    {failed ? <Notice tone="danger" density="compact">{t('The control command did not complete. Try again.')}</Notice> : null}
    {!binding.canMotion ? <Notice density="compact">{t('This entry does not allow motion control.')}</Notice> : null}
    <RobotRemoteControlSurface identity={binding.identity} controllerId={binding.controllerId}
      robots={binding.robots} canMotion={binding.canMotion} submit={submit}
      initialIntent={{ ...stoppedRemoteIntent,gear:2 }} onError={() => setFailed(true)} />
  </section>;
}

async function readMotionAccepted(response:Response) {
  try {
    const payload = await response.json() as { generation?:unknown };
    const generation = payload.generation;
    return { generation: typeof generation === 'number' && Number.isSafeInteger(generation) && generation > 0 ? generation : 0 };
  } catch {
    return { generation: 0 };
  }
}

function remoteBinding(projection:SharedSurfaceProps['projection']):RemoteBinding|undefined {
  if (projection.contractVersion !== 1 || projection.moduleId !== 'experiment.remote-control'
    || projection.viewContractVersion !== 1 || !opaque(projection.entryId)
    || !Array.isArray(projection.actions) || !projection.actions.includes('surface.read')
    || !Array.isArray(projection.endpoints)) return undefined;
  const surface = record(projection.surface);
  if (surface?.kind !== 'remote-controller' || !opaque(surface.experimentId) || !opaque(surface.sessionId)
    || !opaque(surface.controllerId) || !Array.isArray(surface.robotIds) || !surface.robotIds.length
    || !surface.robotIds.every(opaque) || new Set(surface.robotIds).size !== surface.robotIds.length
    || !Array.isArray(projection.robots) || projection.robots.length !== surface.robotIds.length) return undefined;
  const names = new Map<string,string>();
  for (const item of projection.robots) {
    const robot = record(item);
    if (!opaque(robot?.id) || typeof robot.name !== 'string' || !robot.name.trim() || names.has(robot.id)) return undefined;
    names.set(robot.id,robot.name.trim());
  }
  if (surface.robotIds.some(id => !names.has(id))) return undefined;
  const robotIds = [...surface.robotIds] as string[];
  const robots = robotIds.map(id => ({ id,name:names.get(id)! }));
  const candidates = projection.endpoints.filter(endpoint => endpoint.id === 'motion');
  const endpoint = candidates.length === 1 ? candidates[0] : undefined;
  const canMotion = projection.actions.includes('remote.motion') && endpoint?.method === 'POST'
    && endpoint.protocol === 'http' && endpoint.action === 'remote.motion';
  return {
    identity:JSON.stringify([projection.entryId,surface.experimentId,surface.sessionId,surface.controllerId,robotIds,
      canMotion ? [endpoint.id,endpoint.method,endpoint.path,endpoint.protocol,endpoint.action] : null]),
    controllerId:surface.controllerId,robotIds,robots,canMotion:Boolean(canMotion),
  };
}

function record(value:unknown):Record<string,unknown>|undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : undefined;
}
function opaque(value:unknown):value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && value.trim() === value;
}
