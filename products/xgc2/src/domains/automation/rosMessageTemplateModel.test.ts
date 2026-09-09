import { describe,expect,it } from 'vitest';
import {
  defaultROSPublishMessage,
  isROSPublishTopicKind,
  rosMessageTypeSuggestions,
} from './rosMessageTemplateModel';

describe('rosMessageTemplateModel', () => {
  it('covers common ROS1 packages with independent templates', () => {
    const suggestions = rosMessageTypeSuggestions('ros1.publish-topic');
    expect(suggestions.length).toBeGreaterThanOrEqual(90);
    expect(suggestions).toEqual(expect.arrayContaining([
      'std_msgs/String',
      'geometry_msgs/Twist',
      'sensor_msgs/Imu',
      'nav_msgs/Odometry',
      'trajectory_msgs/JointTrajectory',
      'visualization_msgs/Marker',
      'mavros_msgs/PositionTarget',
    ]));

    const first = defaultROSPublishMessage('ros1.publish-topic', 'geometry_msgs/Pose');
    (first.position as Record<string,unknown>).x = 12;
    expect(defaultROSPublishMessage('ros1.publish-topic', 'geometry_msgs/Pose'))
      .toMatchObject({ position: { x: 0 },orientation: { w: 1 } });
  });

  it('provides ROS2 package/msg names and keeps unknown installed types editable', () => {
    const suggestions = rosMessageTypeSuggestions('ros2.publish-topic');
    expect(suggestions.length).toBeGreaterThanOrEqual(90);
    expect(suggestions).toEqual(expect.arrayContaining([
      'std_msgs/msg/String',
      'geometry_msgs/msg/Twist',
      'sensor_msgs/msg/PointCloud2',
      'nav_msgs/msg/Path',
    ]));
    expect(defaultROSPublishMessage('ros2.publish-topic', 'std_msgs/msg/Bool'))
      .toEqual({ data: false });
    expect(defaultROSPublishMessage('ros2.publish-topic', 'rosgraph_msgs/msg/Clock'))
      .toEqual({ clock: { sec: 0,nanosec: 0 } });
    expect(defaultROSPublishMessage('ros2.publish-topic', 'builtin_interfaces/msg/Time'))
      .toEqual({ sec: 0,nanosec: 0 });
    expect(defaultROSPublishMessage('ros2.publish-topic', 'acme_msgs/msg/Telemetry'))
      .toEqual({});
    expect(isROSPublishTopicKind('ros1.publish-topic')).toBe(true);
    expect(isROSPublishTopicKind('ros2.publish-topic')).toBe(true);
    expect(isROSPublishTopicKind('ros1.call-service')).toBe(false);
  });
});
