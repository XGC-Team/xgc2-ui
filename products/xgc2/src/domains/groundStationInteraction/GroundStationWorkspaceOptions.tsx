import { useEffect,useState } from 'react';
import { Notice } from '@xgc2/ui-react';
import { FormField } from '../../components/FormPrimitives';
import { SelectControl } from '../../components/controls/SelectControl';
import { getGroundStationNativeCapabilities,type GroundStationNativeCapabilities } from './groundStationNativeAgentService';
import { useGroundStationNativeText } from './groundStationNativeMessages';

/** The panel stores a workspace selection; each conversation retains its own binding. */
export function GroundStationWorkspaceOptions({experimentId,options,onChange}:{
  experimentId?:string; options:Record<string,unknown>; onChange:(options:Record<string,unknown>)=>void;
}) {
  const t=useGroundStationNativeText();
  const [capabilities,setCapabilities]=useState<GroundStationNativeCapabilities>();
  const [error,setError]=useState('');
  useEffect(() => {
    if (!experimentId) return;
    const controller=new AbortController();
    void getGroundStationNativeCapabilities(experimentId,controller.signal).then(value => {
      if (!controller.signal.aborted) setCapabilities(value);
    }).catch(cause => {if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));});
    return () => controller.abort();
  },[experimentId]);
  const selected=typeof options.workspaceId === 'string' ? options.workspaceId : capabilities?.workspaceBinding?.workspace.id ?? '';
  return <><FormField label={t('Experiment workspace')} description={t('New conversations use this directory. Existing conversations keep their workspace.')}
    dataXgcRole="ground-station-chat-workspace" dataXgcId={experimentId ?? 'new'}>
    <SelectControl value={selected} ariaLabel={t('Experiment workspace')}
      dataXgcRole="ground-station-chat-workspace-select" dataXgcId={experimentId ?? 'new'}
      options={(capabilities?.workspaces ?? []).map(item => ({value:item.id,label:item.directory || item.label}))}
      disabled={!capabilities} onChange={workspaceId => onChange({...options,workspaceId})} />
  </FormField>{error ? <Notice tone="warning" density="compact">{error}</Notice> : null}</>;
}
