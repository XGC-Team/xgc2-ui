// @vitest-environment jsdom

import { render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { HostServicesShell } from './HostServicesShell';
import type { HostSystemLeafComponent,HostSystemLeafContext } from './hostSystemComposition';

const context: HostSystemLeafContext = {
  executionTargetId: 'local',
  isRemote: false,
  requestsAllowed: true,
  actionsEnabled: true,
};

describe('HostServicesShell static leaves', () => {
  it('preserves the zero-leaf unavailable selector', () => {
    const { container } = render(<HostServicesShell context={context} />);

    expect(screen.getByText('SSH / Firewall unavailable')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="host-services-unavailable"]')).not.toBeNull();
  });

  it('does not mount admitted leaves while management requests are fenced', () => {
    const mount = vi.fn();
    const SSHService: HostSystemLeafComponent<'SSHService'> = () => {
      mount();
      return <div>ssh</div>;
    };
    render(
      <HostServicesShell
        context={{ ...context,isRemote: true,managedHostId: 'agent-a',requestsAllowed: false,actionsEnabled: false }}
        sshService={SSHService}
      />,
    );

    expect(screen.getByText('SSH / Firewall offline')).toBeInTheDocument();
    expect(mount).not.toHaveBeenCalled();
  });
});
