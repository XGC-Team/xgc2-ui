// @vitest-environment jsdom

import { act,fireEvent,render,screen } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { writeFieldTooltipsEnabled } from '../shared/preferences/fieldTooltipPreference';
import { Tooltip } from './Tooltip';
import { FormField } from './FormPrimitives';
import { InputControl } from './controls/TextControls';

describe('Tooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Global preference defaults off; tests that assert bubbles opt in.
    writeFieldTooltipsEnabled(true);
  });
  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it('shows a fixed, portaled bubble after hover delay and hides on leave', () => {
    render(
      <Tooltip content="Physics step size in seconds.">
        <button type="button">Step size</button>
      </Tooltip>,
    );
    expect(screen.queryByRole('tooltip')).toBeNull();
    const trigger = screen.getByRole('button', { name: 'Step size' }).parentElement!;
    expect(trigger).toHaveAttribute('data-xgc-role', 'tooltip-trigger');
    fireEvent.mouseEnter(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => { vi.advanceTimersByTime(200); });
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Physics step size in seconds.');
    expect(tip).toHaveAttribute('data-xgc-role', 'tooltip');
    expect(tip.parentElement).toBe(document.body);
    expect(tip.style.position).toBe('fixed');
    fireEvent.mouseLeave(trigger);
    act(() => { vi.advanceTimersByTime(120); });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('renders children unchanged when content is empty', () => {
    const { container } = render(
      <Tooltip content="   ">
        <button type="button">Plain</button>
      </Tooltip>,
    );
    expect(container.querySelector('[data-xgc-role="tooltip-trigger"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Plain' })).toBeInTheDocument();
  });

  it('FormField tooltip covers the whole field including the label', () => {
    const { container } = render(
      <FormField label="Gazebo world" tooltip="World SDF/URDF path loaded by Gazebo server.">
        <InputControl aria-label="Gazebo world" value="/opt/worlds/empty.world" onChange={() => {}} />
      </FormField>,
    );
    const trigger = container.querySelector('[data-xgc-role="tooltip-trigger"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.querySelector('.xgc-form-field-label')).toHaveTextContent('Gazebo world');
    expect(trigger?.querySelector('.xgc-input-control')).not.toBeNull();
    // Hovering the label (common when scanning dual-column drawers) shows help.
    fireEvent.mouseEnter(trigger!);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByRole('tooltip')).toHaveTextContent('World SDF/URDF path loaded by Gazebo server.');
    expect(screen.getByRole('tooltip').style.position).toBe('fixed');
  });

  it('shows help for ROS process fields that only had a product help fallback', () => {
    const { container } = render(
      <FormField
        label="Gazebo VRPN acceleration low-pass cutoff (Hz)"
        tooltip="Independent low-pass cutoff (Hz) for linear and angular acceleration derived from VRPN poses."
        dataXgcRole="automation-node-parameter"
        dataXgcId="ros-basic-services-process-ros-control:gazeboVrpnAccelerationFilterCutoff"
      >
        <InputControl type="number" aria-label="Gazebo VRPN acceleration low-pass cutoff (Hz)" value={25} onChange={() => {}} />
      </FormField>,
    );
    const field = container.querySelector(
      '[data-xgc-role="automation-node-parameter"][data-xgc-id="ros-basic-services-process-ros-control:gazeboVrpnAccelerationFilterCutoff"]',
    );
    expect(field).not.toBeNull();
    const trigger = field!.closest('[data-xgc-role="tooltip-trigger"]');
    expect(trigger).not.toBeNull();
    expect(trigger).toHaveAttribute('data-xgc-id', 'ros-basic-services-process-ros-control:gazeboVrpnAccelerationFilterCutoff');
    fireEvent.mouseEnter(trigger!);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByRole('tooltip')).toHaveTextContent(/acceleration/);
  });

  it('does not open on programmatic focus (drawer moves focus into the first field)', () => {
    render(
      <FormField label="Buttons per row" tooltip="Maximum tiles per row.">
        <InputControl type="number" aria-label="Buttons per row" value={4} onChange={() => {}} />
      </FormField>,
    );
    const input = screen.getByLabelText('Buttons per row');
    // Simulate ConfigDrawer useDialogFocus focusing the first input on open.
    act(() => { input.focus(); });
    act(() => {
      // focus-visible check runs on rAF after focus capture.
      vi.runOnlyPendingTimers();
    });
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('renders children without a trigger when the global preference is off', () => {
    writeFieldTooltipsEnabled(false);
    const { container } = render(
      <FormField label="Gazebo world" tooltip="World path.">
        <InputControl aria-label="Gazebo world" value="/opt/worlds/empty.world" onChange={() => {}} />
      </FormField>,
    );
    expect(container.querySelector('[data-xgc-role="tooltip-trigger"]')).toBeNull();
    fireEvent.mouseEnter(screen.getByLabelText('Gazebo world'));
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('dismisses on scroll instead of repositioning (drawer scroll must stay smooth)', () => {
    render(
      <Tooltip content="Physics step size in seconds.">
        <button type="button">Step size</button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Step size' }).parentElement!);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    act(() => { vi.advanceTimersByTime(120); });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
