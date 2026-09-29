import { useNavigation } from '../../app/navigationContext';
import { useTargetCore } from '../../app/useTargetCore';
import {
  isLocalManagedHost,
  managedHostLabel,
  useManagedHosts,
} from '../managedHost/managedHostPublic';
import { TerminalPage } from './TerminalPage';
import type { TerminalComposition } from './terminalComposition';
import { EMPTY_TERMINAL_COMPOSITION } from './terminalComposition';
import { resolveTerminalTab } from './terminalNavigation';

export type TerminalRouteProps = {
  composition?: TerminalComposition;
};

export function TerminalRoute({ composition = EMPTY_TERMINAL_COMPOSITION }: TerminalRouteProps) {
  const nav = useNavigation((state) => ({
    managedHostId: state.managedHostId,terminalSection: state.pageSection('terminal'),setPageSection: state.setPageSection,
  }));
  const { routedTargetCoreId } = useTargetCore('terminal');
  const managedHosts = useManagedHosts();
  const managedHostId = nav.managedHostId;
  const selectedAgent = !isLocalManagedHost(managedHostId)
    ? managedHosts.find((host) => host.id === managedHostId)
    : undefined;
  const activeTab = resolveTerminalTab(nav.terminalSection);
  return (
    <TerminalPage
      activeTab={activeTab}
      onTabChange={(tab) => nav.setPageSection('terminal', tab)}
      visible
      targetCoreId={routedTargetCoreId}
      managedHostId={isLocalManagedHost(managedHostId) ? undefined : managedHostId}
      agentLabel={selectedAgent ? managedHostLabel(selectedAgent) : undefined}
      composition={composition}
    />
  );
}
