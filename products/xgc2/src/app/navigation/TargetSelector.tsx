import { useMemo } from 'react';
import { SelectControl,type SelectControlOption } from '../../components/controls/SelectControl';
import type { CoreNode } from '../../domains/core/coreModel';
import {
  isLocalManagedHost,
  LOCAL_MANAGED_HOST_ID,
  managedHostOptions,
  type ManagedHost,
} from '../../domains/managedHost/managedHostPublic';
import { isLocalCore } from '../targetCorePolicy';
import { useNavigationText } from './navigationMessages';

export function TargetSelector({
  collapsed,
  coreNodes,
  selectedHostId,
  hosts,
  onSelectCore,
  onSelectHost,
}: {
  collapsed: boolean;
  coreNodes: CoreNode[];
  selectedHostId: string;
  hosts: ManagedHost[];
  onSelectCore: (coreId: string) => void;
  onSelectHost: (hostId: string) => void;
}) {
  const t = useNavigationText();
  const hostOptions = useMemo(() => managedHostOptions(hosts), [hosts]);
  const localCore = coreNodes.find(isLocalCore);
  const localCoreId = localCore?.id ?? LOCAL_MANAGED_HOST_ID;
  const coreOptions = [{
    value: `core:${localCoreId}`,
    label: `Core · ${localCore?.name || 'Local GCS'} (local)`,
  }];
  const agentOptions = hostOptions.map((option) => ({
    value: `host:${option.id}`,
    label: `Agent · ${option.label} (${option.stateLabel})`,
    disabled: option.disabled,
  }));
  const selectedAgentExists = hostOptions.some((option) => option.id === selectedHostId);
  const selectedValue = !isLocalManagedHost(selectedHostId) && selectedAgentExists
    ? `host:${selectedHostId}`
    : `core:${localCoreId}`;
  const targetOptions: SelectControlOption[] = [
    ...coreOptions.map((option) => ({ ...option,group: 'Core' })),
    ...agentOptions.map((option) => ({ ...option,group: 'Agent' })),
  ];

  if (collapsed) return null;

  return (
    <div className="target-selector-strip" data-xgc-role="target-selector" data-xgc-id="target-selector">
      <SelectControl
        className="target-selector-control"
        value={selectedValue}
        options={targetOptions}
        onChange={(value) => {
          if (value.startsWith('core:')) onSelectCore(value.slice('core:'.length));
          else if (value.startsWith('host:')) onSelectHost(value.slice('host:'.length));
        }}
        ariaLabel={t('Target')}
        dataXgcRole="target-selector-control"
        dataXgcId="global"
        size="compact"
        fill
        menuPlacement="above"
      />
    </div>
  );
}
