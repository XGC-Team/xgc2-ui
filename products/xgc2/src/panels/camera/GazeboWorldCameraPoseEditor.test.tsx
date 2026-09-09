// @vitest-environment jsdom

import { render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { GazeboWorldCameraPoseEditor } from './GazeboWorldCameraPoseEditor';

describe('world camera pose feedback',() => {
  it('keeps the apply action name stable while busy and retains real errors',() => {
    const props = {
      id: 'pose',panelId: 'world-camera',
      initialPose: { x: 0,y: 0,z: 3,rollDegrees: 0,pitchDegrees: 0,yawDegrees: 0 },
      pending: false,error: '',disabledReason: '',onApply: vi.fn(),onClose: vi.fn(),
    };
    const view = render(<GazeboWorldCameraPoseEditor {...props} />);
    const apply = screen.getByRole('button',{ name: 'Apply pose' });
    expect(apply).toBeEnabled();
    view.rerender(<GazeboWorldCameraPoseEditor {...props} pending />);
    expect(screen.getByRole('button',{ name: 'Apply pose' })).toBe(apply);
    expect(apply).toBeDisabled();
    expect(apply).toHaveAttribute('aria-busy','true');
    expect(screen.queryByText('Applying')).toBeNull();
    view.rerender(<GazeboWorldCameraPoseEditor {...props} error="Pose update rejected" />);
    expect(screen.getByText('Pose update rejected')).toBeInTheDocument();
    expect(apply).toBeEnabled();
  });
});
