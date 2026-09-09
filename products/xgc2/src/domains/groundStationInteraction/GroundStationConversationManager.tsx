import { Plus } from 'lucide-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { SelectControl } from '../../components/controls/SelectControl';
import { useGroundStationNativeAgentRegistry,type GroundStationNativeBinding } from './GroundStationNativeAgentProvider';
import { useGroundStationNativeText } from './groundStationNativeMessages';
import type { useGroundStationNativeConnection } from './useGroundStationNativeConnection';
import { GroundStationConversationHeaderPortal } from './GroundStationConversationFrame';

export function GroundStationConversationManager({experimentId,binding,connection,active}:{
  experimentId:string; binding?:GroundStationNativeBinding;
  connection:ReturnType<typeof useGroundStationNativeConnection>; active:boolean;
}) {
  const registry = useGroundStationNativeAgentRegistry();
  const t = useGroundStationNativeText();
  if (!registry) return null;
  const inventory = registry.inventories[experimentId];
  const conversations = registry.bindings.filter(item => item.experimentId === experimentId && item.session && !item.session.archived)
    .sort((a,b) => b.session!.createdAt.localeCompare(a.session!.createdAt));
  return <>
    <GroundStationConversationHeaderPortal slot="leading">
    <SelectControl size="compact" ariaLabel={t('Conversations')} value={binding?.sessionId ?? ''}
      dataXgcRole="ground-station-conversation-select" dataXgcId={experimentId} disabled={!active || connection.busy}
      className="ground-station-conversation-picker" onOpen={() => void registry.refresh(experimentId)}
      options={[{value:'',label:t('New conversation')},...conversations.map(item => ({value:item.sessionId,
        label:item.session!.title || `${item.session!.provider} · ${new Date(item.session!.createdAt).toLocaleString()}`})),
        ...(inventory?.nextCursor ? [{value:'load-older',label:t('Load older')}] : [])]}
      onChange={value => {
        if (value === 'load-older') void registry.refresh(experimentId,undefined,true);
        else registry.select(experimentId,value || null);
      }} />
    </GroundStationConversationHeaderPortal>
    <GroundStationConversationHeaderPortal slot="trailing">
    <ControlButton className="xgc-panel-runtime-action" size="compact" iconOnly appearance="raised"
      aria-label={t('New conversation')} title={t('New conversation')}
      dataXgcRole="ground-station-conversation-new" dataXgcId={experimentId} disabled={!active || connection.busy}
      onClick={() => registry.select(experimentId,null)}><Plus size={13} aria-hidden="true" /></ControlButton>
    </GroundStationConversationHeaderPortal>
  </>;
}
