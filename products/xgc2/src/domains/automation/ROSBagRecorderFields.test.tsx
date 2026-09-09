// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { ROSBagRecorderFields } from './ROSBagRecorderFields';

describe('ROSBagRecorderFields', () => {
  it('keeps robot scope simple and edits topics as complete JSON arrays', () => {
    const onChange = vi.fn();
    const onError = vi.fn();
    const view = render(<ROSBagRecorderFields
      nodeId="recorder"
      robotOptions={[{ value: 'px4-01',label: 'PX4 01' },{ value: 'ugv-1',label: 'UGV 1' }]}
      slotIds={[]}
      robotTopics={[]}
      globalTopics={['/tf']}
      readOnly={false}
      renderField={(_name, fixedField) => fixedField}
      onChange={onChange}
      onError={onError}
    />);

    expect(view.container.querySelector('small')).toBeNull();

    const robotScope = view.container.querySelector(
      '[data-xgc-role="automation-rosbag-robots"][data-xgc-id="recorder"]',
    )!;
    const slots = screen.getByLabelText('Robot slots ([] = all)');
    expect(robotScope).toContainElement(slots);
    expect(slots).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Select robot scope' }));
    expect(screen.getByRole('option', { name: 'PX4 01' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'UGV 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'UGV 1' }));
    expect(onChange).toHaveBeenCalledWith('slotIds', ['ugv-1']);
    fireEvent.blur(slots, { target: { value: '["px4-01"]' } });
    expect(onChange).toHaveBeenCalledWith('slotIds', ['px4-01']);
    onChange.mockClear();
    fireEvent.blur(slots, { target: { value: '[1]' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(onError).toHaveBeenLastCalledWith('Robot slots ([] = all): Robot slots must contain only strings');

    expect(screen.queryByText('Quick topic presets')).not.toBeInTheDocument();
    const relativePreset = view.container.querySelector(
      '[data-xgc-role="automation-rosbag-topic-preset"][data-xgc-id="recorder:robotTopics"]',
    )!;
    expect(relativePreset).toContainElement(screen.getByRole('button', { name: 'Add robot topic preset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add robot topic preset' }));
    fireEvent.click(screen.getByRole('option', { name: 'PX4 / MAVROS flight state' }));
    expect(onChange).toHaveBeenCalledWith('robotTopics', [
      'mavros/state',
      'mavros/extended_state',
      'mavros/local_position/pose',
      'mavros/local_position/velocity_local',
    ]);
    fireEvent.blur(screen.getByLabelText('Robot topics (relative)'), {
      target: { value: '["mavros/state", "mavros/battery"]' },
    });
    expect(onChange).toHaveBeenCalledWith('robotTopics', ['mavros/state','mavros/battery']);
    fireEvent.click(screen.getByRole('button', { name: 'Add absolute topic preset' }));
    fireEvent.click(screen.getByRole('option', { name: 'TF transforms' }));
    expect(onChange).toHaveBeenCalledWith('globalTopics', ['/tf','/tf_static']);
    fireEvent.blur(screen.getByLabelText('Global topics (absolute)'), { target: { value: '[]' } });
    expect(onChange).toHaveBeenCalledWith('globalTopics', []);
    expect(onError).toHaveBeenLastCalledWith('');
  });
});
