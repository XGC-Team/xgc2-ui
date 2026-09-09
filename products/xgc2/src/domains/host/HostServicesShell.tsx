import { EmptyState } from '@xgc2/ui-react';
import type { HostSystemLeafComponent,HostSystemLeafContext } from './hostSystemComposition';
import './HostServicesShell.css';

export function HostServicesShell({
  context,
  sshService: SSHService,
  firewall: Firewall,
}: {
  context: HostSystemLeafContext;
  sshService?: HostSystemLeafComponent<'SSHService'>;
  firewall?: HostSystemLeafComponent<'Firewall'>;
}) {
  if (!SSHService && !Firewall) {
    return (
      <div
        className="xgc-host-services xgc-host-fill-workspace"
        data-xgc-role="host-ssh-page" data-xgc-id="host-ssh-page"
        data-xgc-remote={context.isRemote ? 'true' : undefined}
      >
        <EmptyState
          density="compact"
          title="SSH / Firewall unavailable"
          description="Neither SSHService nor Firewall is present in this product and admitted for this host."
          data-xgc-role="host-services-unavailable" data-xgc-id="host-services-unavailable"
        />
      </div>
    );
  }

  return (
    <div
      className="xgc-host-services xgc-host-fill-workspace"
      data-xgc-role="host-ssh-page" data-xgc-id="host-ssh-page"
      data-xgc-remote={context.isRemote ? 'true' : undefined}
      data-xgc-requests={context.requestsAllowed ? 'allowed' : 'blocked'}
    >
      {!context.requestsAllowed ? (
        <EmptyState
          density="compact"
          title="SSH / Firewall offline"
          description="Membership is enabled, but the Agent connection is not ready for automatic requests."
          data-xgc-role="host-services-offline" data-xgc-id="host-services-offline"
        />
      ) : (
        <>
          {SSHService ? <SSHService {...context} /> : null}
          {Firewall ? <Firewall {...context} /> : null}
        </>
      )}
    </div>
  );
}
