// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { AutomationCatalogParameterField,AutomationParameterBindingField } from './AutomationParameterControls';

const recordings = vi.hoisted(() => ({
  list: vi.fn(),
}));

vi.mock('../recording/recordingPublic', () => ({
  listROSBagRecordings: recordings.list,
}));

const bagPathProperty = {
  type: 'string',
  title: 'Bag path',
  'x-xgc-path-kind': 'file',
  'x-xgc-file-extensions': ['.bag', '.mcap', '.db3'],
};

function renderBagPath(onChange = vi.fn()) {
  return {
    onChange,
    ...render(
      <AutomationCatalogParameterField
        nodeId="rosbag-play"
        name="bagPath"
        property={bagPathProperty}
        required
        value=""
        executionTargetId="local"
        target="/bagPath"
        expressionBindingsEnabled={false}
        readOnly={false}
        onChange={onChange}
        onModeChange={vi.fn()}
        onExpressionChange={vi.fn()}
        onError={vi.fn()}
      />,
    ),
  };
}

describe('AutomationCatalogParameterField rosbag-play bagPath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordings.list.mockResolvedValue({
      items: [{
        id: 'demo',
        name: 'demo.bag',
        path: '/tmp/rosbags/demo.bag',
        size: 4096,
        createdAt: '2026-08-19T02:14:00.000Z',
        experimentId: 'experiment-a',
      }],
      limit: 100,
      offset: 0,
      total: 1,
      truncated: false,
    });
  });

  it('offers recorded bags above Browse and writes the archive path', async () => {
    const { onChange } = renderBagPath();
    expect(screen.getByRole('button', { name: 'Browse' })).toBeInTheDocument();
    const trigger = await screen.findByRole('button', { name: 'Recorded bags' });
    expect(recordings.list).toHaveBeenCalledWith({ limit: 100 }, expect.any(AbortSignal));
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('option', { name: 'demo.bag · experiment-a' }));
    expect(onChange).toHaveBeenCalledWith('/tmp/rosbags/demo.bag');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(document.querySelector('.xgc-notice')).toBeNull();
  });

  it('hides the recorded-bag list when the archive is empty', async () => {
    recordings.list.mockResolvedValue({ items: [], limit: 100, offset: 0, total: 0, truncated: false });
    renderBagPath();
    await waitFor(() => expect(recordings.list).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Recorded bags' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse' })).toBeInTheDocument();
  });

  it('does not load the archive for a Gazebo world path', async () => {
    render(
      <AutomationCatalogParameterField
        nodeId="gazebo-server"
        name="world"
        property={{
          type: 'string',
          title: 'World',
          'x-xgc-path-kind': 'file',
          'x-xgc-file-extensions': ['.world'],
        }}
        required
        value=""
        executionTargetId="local"
        target="/world"
        expressionBindingsEnabled={false}
        readOnly={false}
        onChange={vi.fn()}
        onModeChange={vi.fn()}
        onExpressionChange={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Browse' })).toBeInTheDocument();
    await waitFor(() => expect(recordings.list).not.toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Recorded bags' })).not.toBeInTheDocument();
  });
});

describe('AutomationParameterBindingField layout identity', () => {
  it('marks rosMasterUri expressions for the full-row editor contract', () => {
    const { container } = render(
      <AutomationParameterBindingField
        nodeId="ros-publish"
        label="ROS master URI"
        target="/rosMasterUri"
        binding={{ target: '/rosMasterUri',expression: '{{ $input.rosMasterUri }}',language: 'xgc-expression-v2' }}
        expressionBindingsEnabled
        readOnly={false}
        fixedField={<span>fixed</span>}
        onModeChange={vi.fn()}
        onExpressionChange={vi.fn()}
      />,
    );

    expect(container.querySelector(
      '[data-xgc-role="automation-node-parameter-binding"][data-xgc-id="ros-publish:/rosMasterUri"]',
    )).toHaveAttribute('data-xgc-mode', 'expression');
  });
});
