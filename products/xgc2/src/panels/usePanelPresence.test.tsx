// @vitest-environment jsdom

import { useLayoutEffect } from 'react';
import { render,screen } from '@testing-library/react';
import { describe,expect,it } from 'vitest';
import { panelPresenceCount,registerPanelPresence,usePanelPresenceCount } from './usePanelPresence';

function PresencePanel({ pluginId,targetId = 'local' }: { pluginId: string;targetId?: string }) {
  useLayoutEffect(() => registerPanelPresence(pluginId, targetId), [pluginId,targetId]);
  return <div data-xgc-role="presence-panel" />;
}

function PresenceCount({ pluginId,targetId = 'local' }: { pluginId: string;targetId?: string }) {
  return <output data-xgc-role="presence-count">{usePanelPresenceCount(pluginId, targetId)}</output>;
}

function presenceCountText() {
  return screen.getByRole('status').textContent;
}

describe('usePanelPresence', () => {
  it('counts mounted panels per plugin and releases the count on unmount', () => {
    const view = render(
      <>
        <PresenceCount pluginId="ground-station-activity" />
        <PresencePanel pluginId="ground-station-activity" />
        <PresencePanel pluginId="ground-station-activity" />
        <PresencePanel pluginId="gazebo-world-camera" />
      </>,
    );
    expect(presenceCountText()).toBe('2');
    expect(panelPresenceCount('gazebo-world-camera', 'local')).toBe(1);

    view.rerender(
      <>
        <PresenceCount pluginId="ground-station-activity" />
        <PresencePanel pluginId="ground-station-activity" />
      </>,
    );
    expect(presenceCountText()).toBe('1');
    expect(panelPresenceCount('gazebo-world-camera', 'local')).toBe(0);

    view.rerender(<PresenceCount pluginId="ground-station-activity" />);
    expect(presenceCountText()).toBe('0');
  });

  it('keeps presence per execution target so one target never answers for another', () => {
    render(
      <>
        <PresenceCount pluginId="ground-station-activity" targetId="agent-a" />
        <PresencePanel pluginId="ground-station-activity" targetId="local" />
      </>,
    );

    expect(presenceCountText()).toBe('0');
    expect(panelPresenceCount('ground-station-activity', 'local')).toBe(1);
    expect(panelPresenceCount('ground-station-activity', 'agent-a')).toBe(0);
  });

  it('reports zero for a plugin nothing ever registered', () => {
    render(<PresenceCount pluginId="never-mounted" />);
    expect(presenceCountText()).toBe('0');
  });

  it('ignores blank identifiers and never counts one panel twice', () => {
    const release = registerPanelPresence('ground-station-activity', 'local');
    expect(panelPresenceCount('ground-station-activity', 'local')).toBe(1);
    release();
    release();
    expect(panelPresenceCount('ground-station-activity', 'local')).toBe(0);

    const blank = registerPanelPresence('   ', 'local');
    blank();
    expect(panelPresenceCount('', 'local')).toBe(0);
    const blankTarget = registerPanelPresence('ground-station-activity', '  ');
    blankTarget();
    expect(panelPresenceCount('ground-station-activity', '')).toBe(0);
  });
});
