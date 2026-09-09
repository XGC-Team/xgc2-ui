// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe,expect,it } from 'vitest';
import { GroundStationRemoteDock } from './GroundStationRemoteDock';
import { useGroundStationRemoteDock } from './groundStationRemoteDockRegistry';

function Probe({ experimentId }:{ experimentId:string }) {
  const host = useGroundStationRemoteDock(experimentId);
  return <span data-testid={`dock-host:${experimentId}`}>{host?.getAttribute('data-xgc-id') ?? ''}</span>;
}

describe('ground station remote dock registry',() => {
  it('publishes the conversation host to sibling consumers and clears it on unmount',() => {
    const view = render(<>
      <GroundStationRemoteDock experimentId="experiment-a" />
      <Probe experimentId="experiment-a" />
      <Probe experimentId="experiment-b" />
    </>);
    expect(view.container.querySelector('[data-xgc-role="ground-station-remote-dock"]'))
      .toHaveAttribute('data-xgc-id','experiment-a');
    expect(view.getByTestId('dock-host:experiment-a')).toHaveTextContent('experiment-a');
    expect(view.getByTestId('dock-host:experiment-b')).toHaveTextContent('');
    view.unmount();
    const later = render(<Probe experimentId="experiment-a" />);
    expect(later.getByTestId('dock-host:experiment-a')).toHaveTextContent('');
  });
});
