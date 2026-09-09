import { useMemo,useState } from 'react';
import type { PanelPluginContext } from '../types';
import { CAMERA_VIDEO_MEDIA_WORKFLOW_SLOT } from './cameraVideoPanelModel';
import type { CameraVideoMediaControl } from './cameraVideoPanelFrameContext';

type CameraPanelContext = PanelPluginContext<readonly ['visualization','experiment','execution','automation']>;

export function useCameraVideoMediaControl(context: CameraPanelContext,portId = CAMERA_VIDEO_MEDIA_WORKFLOW_SLOT) {
  const port = context.ports.actions[portId];
  const [action,setAction] = useState<'idle'|'restarting'>('idle');
  const [error,setError] = useState('');
  const active = port?.activeInvocation;
  const refusal = port?.disabledReason || (!port?.connected ? `Action port "${portId}" is not connected.` : '');

  async function restart() {
    if (!port || action !== 'idle') return;
    setAction('restarting');
    setError('');
    try {
      if (!active) throw new Error('The camera media Action has no active invocation.');
      await port.control(active,'restart',`Restart ${port.label} from camera panel`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAction('idle');
    }
  }

  const control = useMemo<CameraVideoMediaControl>(() => ({
    bindingId:portId,
    runId:active?.id ?? '',
    state:action === 'idle' ? active?.status ?? (port?.connected ? 'stopped' : 'unbound') : action,
    running:Boolean(active),
    restarting:action === 'restarting',
    restartDisabledReason:refusal || (!active ? 'The camera media Action has no active invocation.' : ''),
    restart,
    // restart deliberately resolves the port from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }),[action,active,port,portId,refusal]);
  return { control,error };
}
