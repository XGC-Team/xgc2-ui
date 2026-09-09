import { describe,expect,it } from 'vitest';
import {
  defaultROSServiceRequest,
  isROSServiceCallKind,
  rosServiceTypeSuggestions,
} from './rosServiceRequestModel';

describe('rosServiceRequestModel', () => {
  it('supplies editable ROS1 request templates without sharing mutable state', () => {
    expect(rosServiceTypeSuggestions('ros1.call-service').length).toBeGreaterThanOrEqual(40);
    const first = defaultROSServiceRequest('ros1.call-service', 'mavros_msgs/CommandBool');
    expect(first).toEqual({ value: false });
    first.value = true;
    expect(defaultROSServiceRequest('ros1.call-service', 'mavros_msgs/CommandBool'))
      .toEqual({ value: false });
    expect(rosServiceTypeSuggestions('ros1.call-service')).toContain('std_srvs/SetBool');
    expect(rosServiceTypeSuggestions('ros1.call-service')).toEqual(expect.arrayContaining([
      'nav_msgs/GetPlan',
      'sensor_msgs/SetCameraInfo',
      'gazebo_msgs/SpawnModel',
      'mavros_msgs/WaypointPush',
    ]));
  });

  it('supports ROS2 templates and falls back safely for installed custom types', () => {
    expect(rosServiceTypeSuggestions('ros2.call-service').length).toBeGreaterThanOrEqual(30);
    expect(defaultROSServiceRequest('ros2.call-service', 'example_interfaces/srv/AddTwoInts'))
      .toEqual({ a: 0,b: 0 });
    expect(defaultROSServiceRequest('ros2.call-service', 'acme_interfaces/srv/Operate'))
      .toEqual({});
    expect(rosServiceTypeSuggestions('ros2.call-service')).toEqual(expect.arrayContaining([
      'lifecycle_msgs/srv/ChangeState',
      'rcl_interfaces/srv/SetParameters',
      'composition_interfaces/srv/LoadNode',
      'controller_manager_msgs/srv/SwitchController',
    ]));
    expect(isROSServiceCallKind('ros2.call-service')).toBe(true);
    expect(isROSServiceCallKind('ros1.publish-topic')).toBe(false);
  });
});
