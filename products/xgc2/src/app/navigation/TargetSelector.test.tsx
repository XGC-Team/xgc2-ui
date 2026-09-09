// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { CoreNode } from '../../domains/core/coreModel';
import { managedHostFixture } from '../../test/managedHostTestFixture';
import { TargetSelector } from './TargetSelector';

describe('TargetSelector managed Agent registry', () => {
  it('shows one local Core and only registry Agents, with unavailable Agents disabled', () => {
    render(
      <TargetSelector
        collapsed={false}
        coreNodes={[
          coreNode(),
          coreNode({ id: 'legacy-agent-core',name: 'Legacy Agent Core',profile: 'agent',baseUrl: 'http://agent' }),
          coreNode({ id: 'remote-core',name: 'Remote Core',profile: 'remote',baseUrl: 'http://core' }),
        ]}
        selectedHostId="agent-offline"
        hosts={[
          managedHostFixture({ id: 'agent-ready',displayName: 'Ready Agent' }),
          managedHostFixture({ id: 'agent-connecting',displayName: 'Connecting Agent',managementConnection: 'connecting' }),
          managedHostFixture({ id: 'agent-offline',displayName: 'Offline Agent',connectivity: 'offline' }),
          managedHostFixture({ id: 'agent-known',displayName: 'Known Agent',enrollment: 'known',effectiveProfile: null }),
          managedHostFixture({ id: 'agent-revoked',displayName: 'Revoked Agent',enrollment: 'revoked' }),
        ]}
        onSelectCore={vi.fn()}
        onSelectHost={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Target' });
    expect(trigger).toHaveTextContent('Agent · Offline Agent (offline)');
    fireEvent.click(trigger);

    expect(screen.getAllByRole('option')).toHaveLength(6);
    expect(screen.getByRole('option', { name: 'Core · Local GCS (local)' })).toBeEnabled();
    expect(screen.queryByRole('option', { name: /Legacy Agent Core/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Remote Core/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Agent · Ready Agent (ready)' })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Agent · Connecting Agent (ready)' })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Agent · Offline Agent (offline)' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Agent · Known Agent (known)' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Agent · Revoked Agent (revoked)' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Agent · Offline Agent (offline)' })).toHaveAttribute('aria-selected', 'true');
  });

  it('does not synthesize a persisted Agent absent from the registry', () => {
    render(
      <TargetSelector
        collapsed={false}
        coreNodes={[coreNode()]}
        selectedHostId="missing-agent"
        hosts={[]}
        onSelectCore={vi.fn()}
        onSelectHost={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Target' });
    expect(trigger).toHaveTextContent('Core · Local GCS (local)');
    fireEvent.click(trigger);
    expect(screen.queryByRole('option', { name: /missing-agent/ })).not.toBeInTheDocument();
  });

  it('selects a ready enrolled Agent from the typed registry option', () => {
    const onSelectHost = vi.fn();
    render(
      <TargetSelector
        collapsed={false}
        coreNodes={[coreNode()]}
        selectedHostId="local"
        hosts={[managedHostFixture({ id: 'agent-ready',displayName: 'Ready Agent' })]}
        onSelectCore={vi.fn()}
        onSelectHost={onSelectHost}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Target' }));
    fireEvent.click(screen.getByRole('option', { name: 'Agent · Ready Agent (ready)' }));
    expect(onSelectHost).toHaveBeenCalledWith('agent-ready');
  });
});

function coreNode(overrides: Partial<CoreNode> = {}): CoreNode {
  return {
    id: 'core-local',
    name: 'Local GCS',
    profile: 'ground',
    baseUrl: '',
    status: 'online',
    capabilities: [],
    registeredAt: '',
    lastSeenAt: '',
    updatedAt: '',
    ...overrides,
  };
}
