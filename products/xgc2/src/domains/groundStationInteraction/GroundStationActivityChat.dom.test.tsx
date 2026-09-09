// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { GroundStationActivityChat } from './GroundStationActivityChat';
import { decodeGroundStationInteraction } from './groundStationInteractionDecoder';
import type {
  GroundStationContextInteraction,
  GroundStationStatusInteraction,
} from './groundStationInteractionTypes';

function renderChat(
  presentation: 'overlay' | 'panel',
  items: { statuses?: GroundStationStatusInteraction[];contexts?: GroundStationContextInteraction[] },
) {
  return render(<GroundStationActivityChat
    enabled
    presentation={presentation}
    targetId="local"
    decisions={[]}
    statuses={items.statuses ?? []}
    contexts={items.contexts ?? []}
    streamState="connected"
    inventoryError=""
    onDismiss={vi.fn(async () => undefined)}
    onRespond={vi.fn()}
  />);
}

describe('GroundStationActivityChat density', () => {
  it('collapses a same-origin run behind a count that the operator can open', () => {
    const contexts = [
      context('context-1', 'Inspect UAV one', '2026-07-15T09:00:00Z'),
      context('context-2', 'Inspect UAV two', '2026-07-15T09:01:00Z'),
      context('context-3', 'Inspect UAV three', '2026-07-15T09:02:00Z'),
    ];
    renderChat('panel', { contexts });

    expect(screen.getByText('Inspect UAV three')).toBeInTheDocument();
    expect(screen.queryByText('Inspect UAV one')).toBeNull();
    const more = screen.getByRole('button', { name: '2 more' });
    expect(more).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(more);
    expect(screen.getByText('Inspect UAV one')).toBeInTheDocument();
    expect(screen.getByText('Inspect UAV two')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide earlier' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows a status as a full card in the panel and as one summary line in the bubble', () => {
    const statuses = [status('status-1', 'mission', 'tracking', 0.5)];
    const panel = renderChat('panel', { statuses });
    expect(screen.getByRole('progressbar', { name: 'Mission progress progress' })).toBeInTheDocument();
    expect(screen.queryByText('Mission progress · tracking 50%')).toBeNull();
    // Full card: no density marker, and the meta row naming the node that
    // published this is present. The panel is the only surface with room for
    // it, so it is the one surface that must not drop it.
    const panelEntry = document.querySelector('[data-xgc-role="ground-station-chat-entry"]');
    expect(panelEntry).not.toHaveAttribute('data-xgc-density');
    expect(screen.getByText('mission · status')).toBeInTheDocument();
    expect(panelEntry?.querySelector('time')).toBeInTheDocument();
    panel.unmount();

    renderChat('overlay', { statuses });
    fireEvent.click(screen.getByRole('button', { name: /Open ground station chat/ }));
    expect(screen.queryByRole('progressbar', { name: 'Mission progress progress' })).toBeNull();
    expect(screen.getByText('Mission progress · tracking 50%')).toBeInTheDocument();
    const bubbleEntry = document.querySelector('[data-xgc-role="ground-station-chat-entry"]');
    expect(bubbleEntry).toHaveAttribute('data-xgc-density', 'summary');
    // The bubble is the collapsed one: meta row hidden.
    expect(screen.queryByText('mission · status')).toBeNull();
    expect(bubbleEntry?.querySelector('time')).toBeNull();
  });
});

function context(id: string, title: string, at: string): GroundStationContextInteraction {
  const interaction = decode({
    id,title,kind: 'context',presentation: 'panel',responseMode: 'none',createdAt: at,updatedAt: at,
    payload: { context: { kind: 'robot',id: 'uav-1',actionLabel: 'View' } },
    origin: { type: 'automation',ref: 'mission',nodeId: 'offer' },
  });
  if (interaction.kind !== 'context') throw new Error('invalid context fixture');
  return interaction;
}

function status(id: string, statusKey: string, state: string, progress: number): GroundStationStatusInteraction {
  const interaction = decode({
    id,title: 'Mission progress',kind: 'status',presentation: 'panel',responseMode: 'none',
    createdAt: '2026-07-15T09:00:00Z',updatedAt: '2026-07-15T09:00:00Z',
    payload: { status: { statusKey,state,detail: 'Following path',progress } },
    origin: { type: 'automation',ref: 'mission',nodeId: 'status' },
  });
  if (interaction.kind !== 'status') throw new Error('invalid status fixture');
  return interaction;
}

function decode(patch: Record<string,unknown>) {
  const interaction = decodeGroundStationInteraction({
    schemaVersion: 1,targetScope: 'local',revision: 1,status: 'open',severity: 'info',
    message: 'Ground station activity',audience: { scope: 'all' },...patch,
  });
  if (!interaction) throw new Error('invalid interaction fixture');
  return interaction;
}
