// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { useHostRuntimeChrome } from './hostRuntimeChrome';
import { HostRuntimeShell } from './HostRuntimeShell';
import type { HostSystemLeafComponent,HostSystemLeafContext } from './hostSystemComposition';

const context: HostSystemLeafContext = {
  executionTargetId: 'local',
  isRemote: false,
  requestsAllowed: true,
  actionsEnabled: true,
};

/** Test leaf that mounts chrome the way production Processes/Network toolbars do. */
function chromeLeaf(
  testId: string,
  onMount: () => void,
): HostSystemLeafComponent<'Processes'> {
  return function ChromeLeaf() {
    const { viewSwitcher } = useHostRuntimeChrome();
    onMount();
    return (
      <div data-testid={testId}>
        {viewSwitcher}
      </div>
    );
  };
}

describe('HostRuntimeShell static leaves', () => {
  beforeEach(() => window.localStorage.clear());

  it('mounts only the contributed active leaf and preserves stable selectors', () => {
    const processMount = vi.fn();
    const networkMount = vi.fn();
    const Processes = chromeLeaf('process-leaf',processMount);
    const Network = chromeLeaf('network-leaf',networkMount) as HostSystemLeafComponent<'Network'>;

    const { container } = render(
      <HostRuntimeShell context={context} processes={Processes} network={Network} />,
    );

    expect(screen.getByTestId('process-leaf')).toBeInTheDocument();
    expect(screen.queryByTestId('network-leaf')).not.toBeInTheDocument();
    expect(processMount).toHaveBeenCalledOnce();
    expect(networkMount).not.toHaveBeenCalled();
    expect(container.querySelector('[data-xgc-role="host-runtime"]')).toHaveAttribute(
      'data-xgc-active-view',
      'processes',
    );
    expect(container.querySelector('[data-xgc-role="host-runtime-leaf"][data-xgc-id="processes"]')).not.toBeNull();
    expect(screen.getByRole('tablist',{ name: 'Host runtime view' })).toBeInTheDocument();
    expect(screen.getByRole('tablist',{ name: 'Host runtime view' }))
      .toHaveAttribute('data-xgc-variant','underline');
    expect(screen.getByRole('tablist',{ name: 'Host runtime view' }))
      .toHaveAttribute('data-xgc-size','compact');
    expect(screen.getByRole('tab',{ name: 'Processes' })).toHaveAttribute('aria-selected','true');
    expect(screen.getByRole('tab',{ name: 'Network' })).toHaveAttribute('aria-selected','false');
    expect(container.querySelector('[data-xgc-role="host-runtime-view"][data-xgc-id="processes"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="host-runtime-view"][data-xgc-id="network"]')).not.toBeNull();

    fireEvent.click(screen.getByRole('tab',{ name: 'Network' }));
    expect(screen.getByTestId('network-leaf')).toBeInTheDocument();
    expect(screen.queryByTestId('process-leaf')).not.toBeInTheDocument();
    expect(networkMount).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-xgc-role="host-runtime-leaf"][data-xgc-id="network"]')).not.toBeNull();
    expect(screen.getByRole('tab',{ name: 'Network' })).toHaveAttribute('aria-selected','true');
  });

  it('does not mount a leaf while remote management requests are fenced', () => {
    const mount = vi.fn();
    const Processes: HostSystemLeafComponent<'Processes'> = () => {
      mount();
      return <div>processes</div>;
    };

    render(
      <HostRuntimeShell
        context={{ ...context,isRemote: true,managedHostId: 'agent-a',requestsAllowed: false,actionsEnabled: false }}
        processes={Processes}
      />,
    );

    expect(screen.getByText('Runtime offline')).toBeInTheDocument();
    expect(mount).not.toHaveBeenCalled();
  });

  it('does not expose a source-absent runtime view', () => {
    const Processes: HostSystemLeafComponent<'Processes'> = () => <div>processes only</div>;
    render(<HostRuntimeShell context={context} processes={Processes} />);

    expect(screen.getByText('processes only')).toBeInTheDocument();
    expect(screen.queryByRole('tab',{ name: 'Network' })).not.toBeInTheDocument();
  });

  it('preserves the zero-leaf unavailable selector without mounting code', () => {
    const { container } = render(<HostRuntimeShell context={context} />);

    expect(screen.getByText('Runtime unavailable')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="host-runtime-unavailable"]')).not.toBeNull();
  });

  it('opens Processes for an Overview focus even when Network was previously selected', () => {
    window.localStorage.setItem('xgc.system.processView',JSON.stringify('network'));
    const processMount = vi.fn();
    const networkMount = vi.fn();
    const Processes = chromeLeaf('focused-process-leaf',processMount);
    const Network = chromeLeaf('focused-network-leaf',networkMount) as HostSystemLeafComponent<'Network'>;

    const { container } = render(
      <HostRuntimeShell
        context={{
          ...context,
          runtimeProcessFocus: { requestId: 1,pid: 42,name: 'b2-camera',metric: 'cpu' },
        }}
        processes={Processes}
        network={Network}
      />,
    );

    expect(screen.getByTestId('focused-process-leaf')).toBeInTheDocument();
    expect(screen.queryByTestId('focused-network-leaf')).not.toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="host-runtime"]')).toHaveAttribute('data-xgc-focus-pid','42');
    expect(container.querySelector('[data-xgc-role="host-runtime"]')).toHaveAttribute('data-xgc-active-view','processes');
  });
});
