import type { AutomationNode } from './automationDefinitionContracts';

const ROS1_SERVICE_REQUEST_TEMPLATES: Readonly<Record<string,Record<string,unknown>>> = Object.freeze({
  'std_srvs/Empty': {},
  'std_srvs/Trigger': {},
  'std_srvs/SetBool': { data: false },
  'mavros_msgs/CommandBool': { value: false },
  'mavros_msgs/SetMode': { base_mode: 0,custom_mode: '' },
  'mavros_msgs/CommandHome': { current_gps: false,yaw: 0,latitude: 0,longitude: 0,altitude: 0 },
  'mavros_msgs/CommandLong': { broadcast: false,command: 0,confirmation: 0,param1: 0,param2: 0,param3: 0,param4: 0,param5: 0,param6: 0,param7: 0 },
  'mavros_msgs/CommandTOL': { min_pitch: 0,yaw: 0,latitude: 0,longitude: 0,altitude: 0 },
  'mavros_msgs/CommandVtolTransition': { state: 0 },
  'mavros_msgs/MessageInterval': { message_id: 0,message_rate: 0 },
  'mavros_msgs/ParamGet': { param_id: '' },
  'mavros_msgs/ParamPull': { force_pull: false },
  'mavros_msgs/ParamPush': {},
  'mavros_msgs/ParamSet': { param_id: '',value: { integer: 0,real: 0 } },
  'mavros_msgs/SetMavFrame': { mav_frame: 0 },
  'mavros_msgs/StreamRate': { stream_id: 0,message_rate: 0,on_off: false },
  'mavros_msgs/VehicleInfoGet': { get_all: false,sysid: 0,compid: 0 },
  'mavros_msgs/WaypointClear': {},
  'mavros_msgs/WaypointGOTO': { waypoint: { frame: 0,command: 0,is_current: false,autocontinue: false,param1: 0,param2: 0,param3: 0,param4: 0,x_lat: 0,y_long: 0,z_alt: 0 } },
  'mavros_msgs/WaypointPull': {},
  'mavros_msgs/WaypointPush': { start_index: 0,waypoints: [] },
  'mavros_msgs/WaypointSetCurrent': { wp_seq: 0 },
  'nav_msgs/GetMap': {},
  'nav_msgs/GetPlan': {
    start: { header: { frame_id: 'map' },pose: { position: { x: 0,y: 0,z: 0 },orientation: { x: 0,y: 0,z: 0,w: 1 } } },
    goal: { header: { frame_id: 'map' },pose: { position: { x: 0,y: 0,z: 0 },orientation: { x: 0,y: 0,z: 0,w: 1 } } },
    tolerance: 0,
  },
  'nav_msgs/SetMap': { map: { header: { frame_id: 'map' },info: { resolution: 0,width: 0,height: 0,origin: { position: { x: 0,y: 0,z: 0 },orientation: { x: 0,y: 0,z: 0,w: 1 } } },data: [] },initial_pose: { header: { frame_id: 'map' },pose: { pose: { position: { x: 0,y: 0,z: 0 },orientation: { x: 0,y: 0,z: 0,w: 1 } },covariance: Array(36).fill(0) } } },
  'sensor_msgs/SetCameraInfo': { camera_info: { height: 0,width: 0,distortion_model: '',d: [],k: Array(9).fill(0),r: Array(9).fill(0),p: Array(12).fill(0) } },
  'roscpp/GetLoggers': {},
  'roscpp/SetLoggerLevel': { logger: '',level: 'info' },
  'topic_tools/MuxSelect': { topic: '' },
  'topic_tools/MuxAdd': { topic: '' },
  'topic_tools/MuxDelete': { topic: '' },
  'gazebo_msgs/SetModelState': {
    model_state: {
      model_name: '',
      pose: {
        position: { x: 0,y: 0,z: 0 },
        orientation: { x: 0,y: 0,z: 0,w: 1 },
      },
      twist: {
        linear: { x: 0,y: 0,z: 0 },
        angular: { x: 0,y: 0,z: 0 },
      },
      reference_frame: 'world',
    },
  },
  'gazebo_msgs/GetWorldProperties': {},
  'gazebo_msgs/GetModelProperties': { model_name: '' },
  'gazebo_msgs/GetModelState': { model_name: '',relative_entity_name: 'world' },
  'gazebo_msgs/GetLinkState': { link_name: '',reference_frame: 'world' },
  'gazebo_msgs/GetLinkProperties': { link_name: '' },
  'gazebo_msgs/GetLightProperties': { light_name: '' },
  'gazebo_msgs/GetJointProperties': { joint_name: '' },
  'gazebo_msgs/GetPhysicsProperties': {},
  'gazebo_msgs/DeleteModel': { model_name: '' },
  'gazebo_msgs/DeleteLight': { light_name: '' },
  'gazebo_msgs/SpawnModel': { model_name: '',model_xml: '',robot_namespace: '',initial_pose: { position: { x: 0,y: 0,z: 0 },orientation: { x: 0,y: 0,z: 0,w: 1 } },reference_frame: 'world' },
  'gazebo_msgs/SetLinkState': { link_state: { link_name: '',pose: { position: { x: 0,y: 0,z: 0 },orientation: { x: 0,y: 0,z: 0,w: 1 } },twist: { linear: { x: 0,y: 0,z: 0 },angular: { x: 0,y: 0,z: 0 } },reference_frame: 'world' } },
  'gazebo_msgs/ApplyBodyWrench': { body_name: '',reference_frame: 'world',reference_point: { x: 0,y: 0,z: 0 },wrench: { force: { x: 0,y: 0,z: 0 },torque: { x: 0,y: 0,z: 0 } },start_time: { secs: 0,nsecs: 0 },duration: { secs: 0,nsecs: 0 } },
  'gazebo_msgs/ApplyJointEffort': { joint_name: '',effort: 0,start_time: { secs: 0,nsecs: 0 },duration: { secs: 0,nsecs: 0 } },
  'gazebo_msgs/BodyRequest': { body_name: '' },
  'gazebo_msgs/JointRequest': { joint_name: '' },
  'gazebo_msgs/SetLightProperties': { light_name: '',diffuse: { r: 0,g: 0,b: 0,a: 1 },attenuation_constant: 0,attenuation_linear: 0,attenuation_quadratic: 0 },
  'gazebo_msgs/SetLinkProperties': { link_name: '',com: { position: { x: 0,y: 0,z: 0 },orientation: { x: 0,y: 0,z: 0,w: 1 } },gravity_mode: true,mass: 0,ixx: 0,ixy: 0,ixz: 0,iyy: 0,iyz: 0,izz: 0 },
  'gazebo_msgs/SetJointProperties': { joint_name: '',ode_joint_config: { damping: [],hiStop: [],loStop: [],erp: [],cfm: [],stop_erp: [],stop_cfm: [],fudge_factor: [],fmax: [],vel: [] } },
  'gazebo_msgs/SetJointTrajectory': { model_name: '',joint_trajectory: { joint_names: [],points: [] } },
  'gazebo_msgs/SetModelConfiguration': { model_name: '',urdf_param_name: '',joint_names: [],joint_positions: [] },
  'gazebo_msgs/SetPhysicsProperties': { time_step: 0,max_update_rate: 0,gravity: { x: 0,y: 0,z: -9.81 },ode_config: { auto_disable_bodies: false,sor_pgs_precon_iters: 0,sor_pgs_iters: 50,sor_pgs_w: 1,sor_pgs_rms_error_tol: 0,contact_surface_layer: 0.001,contact_max_correcting_vel: 100,cfm: 0,erp: 0.2,max_contacts: 20 } },
});

const ROS2_SERVICE_REQUEST_TEMPLATES: Readonly<Record<string,Record<string,unknown>>> = Object.freeze({
  'std_srvs/srv/Empty': {},
  'std_srvs/srv/Trigger': {},
  'std_srvs/srv/SetBool': { data: false },
  'example_interfaces/srv/AddTwoInts': { a: 0,b: 0 },
  'nav_msgs/srv/GetMap': {},
  'nav_msgs/srv/GetPlan': {
    start: { header: { frame_id: 'map' },pose: { position: { x: 0,y: 0,z: 0 },orientation: { x: 0,y: 0,z: 0,w: 1 } } },
    goal: { header: { frame_id: 'map' },pose: { position: { x: 0,y: 0,z: 0 },orientation: { x: 0,y: 0,z: 0,w: 1 } } },
    tolerance: 0,
  },
  'nav_msgs/srv/SetMap': { map: { header: { frame_id: 'map' },info: { resolution: 0,width: 0,height: 0,origin: { position: { x: 0,y: 0,z: 0 },orientation: { x: 0,y: 0,z: 0,w: 1 } } },data: [] },initial_pose: { header: { frame_id: 'map' },pose: { pose: { position: { x: 0,y: 0,z: 0 },orientation: { x: 0,y: 0,z: 0,w: 1 } },covariance: Array(36).fill(0) } } },
  'sensor_msgs/srv/SetCameraInfo': { camera_info: { height: 0,width: 0,distortion_model: '',d: [],k: Array(9).fill(0),r: Array(9).fill(0),p: Array(12).fill(0) } },
  'tf2_msgs/srv/FrameGraph': {},
  'lifecycle_msgs/srv/ChangeState': { transition: { id: 0,label: '' } },
  'lifecycle_msgs/srv/GetState': {},
  'lifecycle_msgs/srv/GetAvailableStates': {},
  'lifecycle_msgs/srv/GetAvailableTransitions': {},
  'rcl_interfaces/srv/GetParameters': { names: [] },
  'rcl_interfaces/srv/GetParameterTypes': { names: [] },
  'rcl_interfaces/srv/SetParameters': { parameters: [] },
  'rcl_interfaces/srv/SetParametersAtomically': { parameters: [] },
  'rcl_interfaces/srv/ListParameters': { prefixes: [],depth: 0 },
  'rcl_interfaces/srv/DescribeParameters': { names: [] },
  'rcl_interfaces/srv/GetLoggerLevels': { names: [] },
  'rcl_interfaces/srv/SetLoggerLevels': { levels: [] },
  'composition_interfaces/srv/ListNodes': {},
  'composition_interfaces/srv/LoadNode': { package_name: '',plugin_name: '',node_name: '',node_namespace: '',log_level: 0,remap_rules: [],parameters: [],extra_arguments: [] },
  'composition_interfaces/srv/UnloadNode': { unique_id: 0 },
  'controller_manager_msgs/srv/ListControllers': {},
  'controller_manager_msgs/srv/ListControllerTypes': {},
  'controller_manager_msgs/srv/LoadController': { name: '' },
  'controller_manager_msgs/srv/UnloadController': { name: '' },
  'controller_manager_msgs/srv/ConfigureController': { name: '' },
  'controller_manager_msgs/srv/SwitchController': { activate_controllers: [],deactivate_controllers: [],strictness: 2,activate_asap: false,timeout: { sec: 0,nanosec: 0 } },
  'gazebo_msgs/srv/GetWorldProperties': {},
  'gazebo_msgs/srv/GetModelProperties': { model_name: '' },
  'gazebo_msgs/srv/GetModelState': { model_name: '',relative_entity_name: 'world' },
  'gazebo_msgs/srv/DeleteModel': { model_name: '' },
  'gazebo_msgs/srv/SpawnModel': { model_name: '',model_xml: '',robot_namespace: '',initial_pose: { position: { x: 0,y: 0,z: 0 },orientation: { x: 0,y: 0,z: 0,w: 1 } },reference_frame: 'world' },
  'gazebo_msgs/srv/SetModelState': {
    model_state: {
      model_name: '',
      pose: { position: { x: 0,y: 0,z: 0 },orientation: { x: 0,y: 0,z: 0,w: 1 } },
      twist: { linear: { x: 0,y: 0,z: 0 },angular: { x: 0,y: 0,z: 0 } },
      reference_frame: 'world',
    },
  },
});

export function isROSServiceCallKind(kind: AutomationNode['kind']) {
  return kind === 'ros1.call-service' || kind === 'ros2.call-service';
}

export function rosServiceTypeSuggestions(kind: AutomationNode['kind']) {
  return Object.keys(kind === 'ros2.call-service'
    ? ROS2_SERVICE_REQUEST_TEMPLATES
    : ROS1_SERVICE_REQUEST_TEMPLATES);
}

export function defaultROSServiceRequest(kind: AutomationNode['kind'], serviceType: string) {
  const templates = kind === 'ros2.call-service'
    ? ROS2_SERVICE_REQUEST_TEMPLATES
    : ROS1_SERVICE_REQUEST_TEMPLATES;
  return structuredClone(templates[serviceType] ?? {});
}
