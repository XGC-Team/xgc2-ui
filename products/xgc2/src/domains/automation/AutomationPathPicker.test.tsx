// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { AutomationPathPicker } from './AutomationPathPicker';
import { getAutomationWorldPreview,listAutomationTargetFiles } from './automationTargetService';

vi.mock('./automationTargetService', () => ({ getAutomationWorldPreview: vi.fn(),listAutomationTargetFiles: vi.fn() }));

describe('AutomationPathPicker', () => {
  beforeEach(() => vi.clearAllMocks());

  it('browses a generic host path without loading Gazebo world previews', async () => {
    vi.mocked(listAutomationTargetFiles).mockResolvedValue({
      path: '/opt/rviz',
      parent: '/opt',
      entries: [
        { name: 'configs',path: '/opt/rviz/configs',isDir: true },
        { name: 'lab.rviz',path: '/opt/rviz/lab.rviz',isDir: false },
        { name: 'notes.txt',path: '/opt/rviz/notes.txt',isDir: false },
      ],
    });
    const onSelect = vi.fn();
    const { container } = render(<AutomationPathPicker
      targetId="local"
      kind="file"
      fileExtensions={['.rviz']}
      value="/opt/rviz/current.rviz"
      onSelect={onSelect}
      onClose={vi.fn()}
    />);

    await waitFor(() => expect(listAutomationTargetFiles).toHaveBeenCalledWith('local', '/opt/rviz'));
    const dialog = container.querySelector('[data-xgc-role="automation-path-picker"]')!;
    expect(dialog).toHaveAttribute('data-xgc-variant', 'path');
    expect(container.querySelector('[data-xgc-role="automation-path-picker-world-preview"]')).toBeNull();
    expect(screen.queryByText('Scene preview')).not.toBeInTheDocument();
    // Extension filter is visible in the dialog header while the list is filtered.
    expect(container.querySelector('[data-xgc-role="automation-path-picker-extension-hint"]'))
      .toHaveTextContent('Showing .rviz files');
    expect(screen.getByRole('button', { name: 'lab.rviz' })).toHaveAttribute('data-xgc-role', 'automation-path-picker-entry');
    expect(screen.getByRole('button', { name: 'lab.rviz' })).toHaveAttribute('data-xgc-id', '/opt/rviz/lab.rviz');
    expect(screen.queryByRole('button', { name: 'notes.txt' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'lab.rviz' }));
    expect(getAutomationWorldPreview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Select file' }));
    expect(onSelect).toHaveBeenCalledWith('/opt/rviz/lab.rviz');
  });

  it('keeps Gazebo world selection with scene preview on the world variant only', async () => {
    vi.mocked(listAutomationTargetFiles).mockResolvedValue({
      path: '/opt/ros/noetic/share/worlds',
      parent: '/opt/ros/noetic/share',
      entries: [
        { name: 'models',path: '/opt/ros/noetic/share/worlds/models',isDir: true },
        { name: 'empty.world',path: '/opt/ros/noetic/share/worlds/empty.world',isDir: false },
      ],
    });
    vi.mocked(getAutomationWorldPreview).mockResolvedValue({
      worldPath: '/opt/ros/noetic/share/worlds/empty.world',
      description: '基础空场景。',
      imageDataUrl: 'data:image/png;base64,aW1hZ2U=',
    });
    const onSelect = vi.fn();
    const { container } = render(<AutomationPathPicker
      targetId="local"
      kind="file"
      variant="world"
      fileExtensions={['.world']}
      value="/opt/ros/noetic/share/worlds/current.world"
      onSelect={onSelect}
      onClose={vi.fn()}
    />);

    await waitFor(() => expect(listAutomationTargetFiles).toHaveBeenCalledWith('local', '/opt/ros/noetic/share/worlds'));
    expect(container.querySelector('[data-xgc-role="automation-path-picker"]')).toHaveAttribute('data-xgc-variant', 'world');
    expect(container.querySelector('[data-xgc-role="automation-path-picker-world-preview"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /empty\.world/ }));
    await waitFor(() => expect(getAutomationWorldPreview).toHaveBeenCalledWith('local', '/opt/ros/noetic/share/worlds/empty.world'));
    expect(screen.getByText('基础空场景。')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'empty.world scene preview' })).toHaveAttribute('src', 'data:image/png;base64,aW1hZ2U=');
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Select file' }));
    expect(onSelect).toHaveBeenCalledWith('/opt/ros/noetic/share/worlds/empty.world');
  });

  it('keeps world selection usable when no companion files exist', async () => {
    vi.mocked(listAutomationTargetFiles).mockResolvedValue({
      path: '/worlds/camera',parent: '/worlds',entries: [{ name: 'camera.world',path: '/worlds/camera/camera.world',isDir: false }],
    });
    vi.mocked(getAutomationWorldPreview).mockResolvedValue({ worldPath: '/worlds/camera/camera.world' });
    const onSelect = vi.fn();
    render(<AutomationPathPicker
      targetId="local"
      kind="file"
      variant="world"
      fileExtensions={['.world']}
      value="/worlds/camera/current.world"
      onSelect={onSelect}
      onClose={vi.fn()}
    />);

    fireEvent.click(await screen.findByRole('button', { name: 'camera.world' }));
    expect(await screen.findByText('No companion preview is installed for this world.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Select file' }));
    expect(onSelect).toHaveBeenCalledWith('/worlds/camera/camera.world');
  });

  it('opens the flat Gazebo catalog and hides non-world files only for the world variant', async () => {
    const catalogPath = '/opt/ros/noetic/share/gazebo_sim_worlds/worlds/catalog';
    vi.mocked(listAutomationTargetFiles).mockResolvedValue({
      path: catalogPath,
      parent: '/opt/ros/noetic/share/gazebo_sim_worlds/worlds',
      entries: [
        { name: 'nested',path: `${catalogPath}/nested`,isDir: true },
        { name: 'empty.world',path: `${catalogPath}/empty.world`,isDir: false },
        { name: 'empty.md',path: `${catalogPath}/empty.md`,isDir: false },
        { name: 'empty.png',path: `${catalogPath}/empty.png`,isDir: false },
      ],
    });

    render(<AutomationPathPicker
      targetId="local"
      kind="file"
      variant="world"
      fileExtensions={['.world']}
      value="/opt/ros/noetic/share/gazebo_sim_worlds/worlds/empty/empty.world"
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />);

    await waitFor(() => expect(listAutomationTargetFiles).toHaveBeenCalledWith('local', catalogPath));
    expect(screen.getByRole('button', { name: 'empty.world' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'nested' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'empty.md' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'empty.png' })).not.toBeInTheDocument();
  });

  it('does not open the Gazebo catalog for a plain .world file path on the generic picker', async () => {
    vi.mocked(listAutomationTargetFiles).mockResolvedValue({
      path: '/opt/ros/noetic/share/gazebo_sim_worlds/worlds/empty',
      parent: '/opt/ros/noetic/share/gazebo_sim_worlds/worlds',
      entries: [{ name: 'empty.world',path: '/opt/ros/noetic/share/gazebo_sim_worlds/worlds/empty/empty.world',isDir: false }],
    });

    render(<AutomationPathPicker
      targetId="local"
      kind="file"
      fileExtensions={['.world']}
      value="/opt/ros/noetic/share/gazebo_sim_worlds/worlds/empty/empty.world"
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />);

    await waitFor(() => expect(listAutomationTargetFiles).toHaveBeenCalledWith(
      'local',
      '/opt/ros/noetic/share/gazebo_sim_worlds/worlds/empty',
    ));
    expect(listAutomationTargetFiles).not.toHaveBeenCalledWith(
      'local',
      '/opt/ros/noetic/share/gazebo_sim_worlds/worlds/catalog',
    );
  });
});
