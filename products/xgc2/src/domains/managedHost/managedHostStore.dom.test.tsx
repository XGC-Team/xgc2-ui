// @vitest-environment jsdom

import { act,render,screen,waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { ManagedHost } from './managedHostModel';
import {
  useManagedHostRegistryError,
  useManagedHostRegistryStatus,
  useManagedHosts,
} from './managedHostStore';
import { managedHostFixture } from '../../test/managedHostTestFixture';
import { productWebComposition } from '../../../profiles/core-dev';
import { ProductWebCompositionProvider } from '../../shared/productWebComposition';

const serviceMock = vi.hoisted(() => ({
  listManagedHosts: vi.fn(),
}));

vi.mock('./managedHostService', () => ({
  listManagedHosts: serviceMock.listManagedHosts,
  revokeManagedHost: vi.fn(),
}));

describe('managedHostStore initial registry snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not request a registry when AgentLink.ComputeTargets is disabled', async () => {
    renderProbe(<ManagedHostResolutionProbe suffix="disabled" />, false);

    await act(async () => undefined);
    expect(serviceMock.listManagedHosts).not.toHaveBeenCalled();
    expect(screen.getByTestId('status-disabled')).toHaveTextContent('disabled');
    expect(screen.getByTestId('host-ids-disabled')).toHaveTextContent('');
  });

  it('reports an initial registry failure without pretending that the Agent list is empty', async () => {
    serviceMock.listManagedHosts.mockRejectedValueOnce(new Error('registry unavailable'));

    renderProbe(<ManagedHostResolutionProbe suffix="failed" />);

    await waitFor(() => expect(serviceMock.listManagedHosts).toHaveBeenCalledOnce());
    await act(async () => undefined);
    expect(screen.getByTestId('status-failed')).toHaveTextContent('error');
    expect(screen.getByTestId('error-failed')).toHaveTextContent('registry unavailable');
    expect(screen.getByTestId('host-ids-failed')).toHaveTextContent('');
  });

  it('deduplicates concurrent subscribers into one GET and never starts discovery', async () => {
    const listed = deferred<ManagedHost[]>();
    serviceMock.listManagedHosts.mockReturnValueOnce(listed.promise);

    renderProbe(<><ManagedHostResolutionProbe suffix="a" /><ManagedHostResolutionProbe suffix="b" /></>);

    await waitFor(() => expect(serviceMock.listManagedHosts).toHaveBeenCalledOnce());
    expect(screen.getByTestId('status-a')).toHaveTextContent('loading');
    expect(screen.getByTestId('status-b')).toHaveTextContent('loading');

    await act(async () => listed.resolve([managedHostFixture()]));
    await waitFor(() => expect(screen.getByTestId('status-a')).toHaveTextContent('ready'));
    expect(screen.getByTestId('host-ids-a')).toHaveTextContent('agent-a');
    expect(screen.getByTestId('host-ids-b')).toHaveTextContent('agent-a');
    expect(serviceMock.listManagedHosts).toHaveBeenCalledTimes(1);
  });
});

function renderProbe(children: ReactNode, agentLinkComputeTargets = true) {
  return render(
    <ProductWebCompositionProvider composition={{
      ...productWebComposition,
      agentLinkComputeTargets,
    }}>
      {children}
    </ProductWebCompositionProvider>,
  );
}

function ManagedHostResolutionProbe({ suffix }: { suffix: string }) {
  const hosts = useManagedHosts();
  const status = useManagedHostRegistryStatus();
  const error = useManagedHostRegistryError();
  return (
    <>
      <span data-testid={`status-${suffix}`}>{status}</span>
      <span data-testid={`error-${suffix}`}>{error}</span>
      <span data-testid={`host-ids-${suffix}`}>{hosts.map((host) => host.id).join(',')}</span>
    </>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise,resolve };
}
