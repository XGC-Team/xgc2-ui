// @vitest-environment jsdom
import { useState } from 'react';
import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { WorldCameraExtrinsicSelectionField } from './WorldCameraExtrinsicSelectionField';
import { manualExtrinsicChoice } from './worldCameraExtrinsicSelectionModel';
const fingerprint = vi.hoisted(() => vi.fn());
vi.mock('../../domains/automation/automationPublic',() => ({ readAutomationTargetFileFingerprint:fingerprint }));
const path = '/cal/phy/usb_cam/extrinsics-20260920T123456Z.yaml';
const props = {
  panelId:'camera',kind:'simulation' as const,targetId:'local',root:'/cal',camera:'usb_cam',
  offset:{ x:7,y:8,z:9 },files:[{ value:path,label:'Physical · 2026-09-20 12:34:56' }],legacyLabel:'Current hand-set pose',
};

function Harness() {
  const [value,setValue] = useState('{"mode":"auto"}');
  return <><WorldCameraExtrinsicSelectionField {...props} value={value} onChange={(choice) => setValue(JSON.stringify(choice))} />
    <output data-testid="choice">{value}</output></>;
}

describe('WorldCameraExtrinsicSelectionField',() => {
  beforeEach(() => { fingerprint.mockReset(); });
  it('pins a saved calibration from either mode using the exact owner fingerprint, then returns to Auto',async () => {
    fingerprint.mockResolvedValue('a'.repeat(64));
    render(<Harness />);
    fireEvent.click(screen.getByRole('button',{ name:'Simulation camera position' }));
    fireEvent.click(screen.getByRole('option',{ name:'Saved calibration' }));
    fireEvent.click(screen.getByRole('button',{ name:'Simulation camera position calibration' }));
    fireEvent.click(screen.getByRole('option',{ name:'Physical · 2026-09-20 12:34:56' }));
    await waitFor(() => expect(JSON.parse(screen.getByTestId('choice').textContent!)).toEqual({
      mode:'version',result:{ sourceMode:'phy',fileName:'extrinsics-20260920T123456Z.yaml',sha256:'a'.repeat(64) },
    }));
    expect(fingerprint).toHaveBeenCalledWith('local',path,expect.any(AbortSignal));
    fireEvent.click(screen.getByRole('button',{ name:'Simulation camera position' }));
    fireEvent.click(screen.getByRole('option',{ name:'Automatic' }));
    expect(screen.getByTestId('choice')).toHaveTextContent('{"mode":"auto"}');
  });

  it('writes independent manual optical pose and freezes the experiment offset',() => {
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole('button',{ name:'Simulation camera position' }));
    fireEvent.click(screen.getByRole('option',{ name:'Manual pose' }));
    const xField = container.querySelector('[data-xgc-role="gazebo-world-camera-simulation-extrinsic-manual-field"][data-xgc-id="camera:simulation:x"]');
    const x = xField instanceof HTMLInputElement ? xField : xField?.querySelector('input');
    fireEvent.change(x!,{ target:{ value:'3.5' } });
    expect(JSON.parse(screen.getByTestId('choice').textContent!)).toEqual(manualExtrinsicChoice({
      x:3.5,y:0,z:0,rollDegrees:0,pitchDegrees:0,yawDegrees:0,
    },props.offset));
  });

  it('does not invent a zero world offset or silently replace malformed selection with Auto',() => {
    render(<WorldCameraExtrinsicSelectionField {...props} offset={undefined} value="broken" onChange={vi.fn()} />);
    expect(screen.getByText('The camera position setting is invalid. Choose a mode again.')).toBeVisible();
    fireEvent.click(screen.getByRole('button',{ name:'Simulation camera position' }));
    expect(screen.getByRole('option',{ name:'Manual pose' })).toBeDisabled();
  });

  it('aborts a late file fingerprint when mode changes, without overwriting Auto',async () => {
    let finish!:(value:string)=>void;
    fingerprint.mockImplementation(() => new Promise<string>((resolve) => { finish=resolve; }));
    render(<Harness />);
    fireEvent.click(screen.getByRole('button',{ name:'Simulation camera position' }));
    fireEvent.click(screen.getByRole('option',{ name:'Saved calibration' }));
    fireEvent.click(screen.getByRole('button',{ name:'Simulation camera position calibration' }));
    fireEvent.click(screen.getByRole('option',{ name:'Physical · 2026-09-20 12:34:56' }));
    fireEvent.click(screen.getByRole('button',{ name:'Simulation camera position' }));
    fireEvent.click(screen.getByRole('option',{ name:'Automatic' }));
    await act(async () => finish('a'.repeat(64)));
    expect(screen.getByTestId('choice')).toHaveTextContent('{"mode":"auto"}');
    expect(fingerprint.mock.calls[0][2].aborted).toBe(true);
  });

  it('does not write a filename-only choice after the owner rejects a read',async () => {
    fingerprint.mockRejectedValue(new Error('owner denied'));
    const onChange=vi.fn();
    render(<WorldCameraExtrinsicSelectionField {...props} kind="physical" value='{ "mode":"auto" }' onChange={onChange} />);
    fireEvent.click(screen.getByRole('button',{ name:'Physical camera position' }));
    fireEvent.click(screen.getByRole('option',{ name:'Saved calibration' }));
    fireEvent.click(screen.getByRole('button',{ name:'Physical camera position calibration' }));
    fireEvent.click(screen.getByRole('option',{ name:'Physical · 2026-09-20 12:34:56' }));
    await screen.findByText('This saved calibration could not be verified. Select it again.');
    expect(onChange).not.toHaveBeenCalled();
  });
});
