// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RobotSimulationImages } from './RobotSimulationImages';
import { listRobotSimulationImages, type RobotSimulationImage } from './robotAssetService';

vi.mock('./robotAssetService', () => ({ listRobotSimulationImages: vi.fn() }));
const fs150: RobotSimulationImage = { profile: 'fs150-focal-noetic', label: 'FS150', os: 'ubuntu', version: '20.04', ros: 'noetic', image: 'sha256:private-pin', installed: true };

describe('RobotSimulationImages', () => {
  beforeEach(() => vi.clearAllMocks());
  it('shows supported environment and local availability without placement controls or internal values', async () => {
    vi.mocked(listRobotSimulationImages).mockResolvedValue([fs150]);
    const { rerender } = render(<RobotSimulationImages kind="px4_multirotor" model="fs150" />);
    expect(await screen.findByText('FS150')).toBeInTheDocument();
    expect(screen.getByText('ubuntu 20.04 · ROS noetic')).toBeInTheDocument();
    expect(screen.getByText('Available locally')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/sha256|fs150-focal|PX4 SITL|MAVROS|centralized/i);
    rerender(<RobotSimulationImages kind="px4_multirotor" model="fs150" />);
    expect(listRobotSimulationImages).toHaveBeenCalledTimes(1);
  });
  it('keeps both Scout board recipes visible even when one image is absent locally', async () => {
    vi.mocked(listRobotSimulationImages).mockResolvedValue([
      { ...fs150, profile: 'scout-bionic-melodic', label: 'Scout Xavier', version: '18.04', ros: 'melodic', image: '', installed: false },
      { ...fs150, profile: 'scout-focal-noetic', label: 'Scout Orin NX' },
    ]);
    render(<RobotSimulationImages kind="scout_mini" />);
    expect(await screen.findByText('Scout Xavier')).toBeInTheDocument();
    expect(screen.getByText('Scout Orin NX')).toBeInTheDocument();
    expect(screen.getByText('Not available locally')).toBeInTheDocument();
    expect(screen.getByText('Available locally')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('cancels replaced and unmounted requests and never shows the previous model response', async () => {
    let resolveFirst!: (images: RobotSimulationImage[]) => void;
    vi.mocked(listRobotSimulationImages).mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; })).mockResolvedValueOnce([]);
    const { rerender, unmount } = render(<RobotSimulationImages kind="px4_multirotor" model="fs150" />);
    const firstSignal = vi.mocked(listRobotSimulationImages).mock.calls[0]![2]!;
    rerender(<RobotSimulationImages kind="unitree_b2" />);
    expect(firstSignal.aborted).toBe(true);
    expect(await screen.findByText('No simulation image provided for this model.')).toBeInTheDocument();
    await act(async () => resolveFirst([fs150]));
    expect(screen.queryByText('FS150')).not.toBeInTheDocument();
    expect(screen.getByText('Available onboard environments')).toBeInTheDocument();
    const lastSignal = vi.mocked(listRobotSimulationImages).mock.calls[1]![2]!;
    unmount();
    expect(lastSignal.aborted).toBe(true);
  });
  it('keeps the server error visible instead of presenting it as an unsupported model', async () => {
    vi.mocked(listRobotSimulationImages).mockRejectedValue(new Error('Read access denied'));
    render(<RobotSimulationImages kind="mecanum_ugv" />);
    await waitFor(() => expect(screen.getByText('Read access denied')).toBeInTheDocument());
    expect(screen.queryByText('No simulation image provided for this model.')).not.toBeInTheDocument();
  });
});
