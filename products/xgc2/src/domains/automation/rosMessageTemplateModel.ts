import type { AutomationNode } from './automationDefinitionContracts';

type ROSTemplate = Record<string,unknown>;

const vector3 = () => ({ x: 0,y: 0,z: 0 });
const quaternion = () => ({ x: 0,y: 0,z: 0,w: 1 });
const pose = () => ({ position: vector3(),orientation: quaternion() });
const twist = () => ({ linear: vector3(),angular: vector3() });
const header = () => ({ frame_id: '' });
const covariance36 = () => Array(36).fill(0);

const ROS1_MESSAGE_TEMPLATES: Readonly<Record<string,ROSTemplate>> = Object.freeze({
  'std_msgs/Empty': {},
  'std_msgs/Bool': { data: false },
  'std_msgs/Byte': { data: 0 },
  'std_msgs/Char': { data: 0 },
  'std_msgs/Int8': { data: 0 },
  'std_msgs/UInt8': { data: 0 },
  'std_msgs/Int16': { data: 0 },
  'std_msgs/UInt16': { data: 0 },
  'std_msgs/Int32': { data: 0 },
  'std_msgs/UInt32': { data: 0 },
  'std_msgs/Int64': { data: 0 },
  'std_msgs/UInt64': { data: 0 },
  'std_msgs/Float32': { data: 0 },
  'std_msgs/Float64': { data: 0 },
  'std_msgs/String': { data: '' },
  'std_msgs/Time': { data: { secs: 0,nsecs: 0 } },
  'std_msgs/Duration': { data: { secs: 0,nsecs: 0 } },
  'std_msgs/Header': header(),
  'std_msgs/ColorRGBA': { r: 0,g: 0,b: 0,a: 1 },
  'std_msgs/ByteMultiArray': { layout: { dim: [],data_offset: 0 },data: [] },
  'std_msgs/Int8MultiArray': { layout: { dim: [],data_offset: 0 },data: [] },
  'std_msgs/UInt8MultiArray': { layout: { dim: [],data_offset: 0 },data: [] },
  'std_msgs/Int16MultiArray': { layout: { dim: [],data_offset: 0 },data: [] },
  'std_msgs/UInt16MultiArray': { layout: { dim: [],data_offset: 0 },data: [] },
  'std_msgs/Int32MultiArray': { layout: { dim: [],data_offset: 0 },data: [] },
  'std_msgs/UInt32MultiArray': { layout: { dim: [],data_offset: 0 },data: [] },
  'std_msgs/Int64MultiArray': { layout: { dim: [],data_offset: 0 },data: [] },
  'std_msgs/UInt64MultiArray': { layout: { dim: [],data_offset: 0 },data: [] },
  'std_msgs/Float32MultiArray': { layout: { dim: [],data_offset: 0 },data: [] },
  'std_msgs/Float64MultiArray': { layout: { dim: [],data_offset: 0 },data: [] },

  'geometry_msgs/Point': vector3(),
  'geometry_msgs/Point32': vector3(),
  'geometry_msgs/Vector3': vector3(),
  'geometry_msgs/Quaternion': quaternion(),
  'geometry_msgs/Pose2D': { x: 0,y: 0,theta: 0 },
  'geometry_msgs/Pose': pose(),
  'geometry_msgs/Transform': { translation: vector3(),rotation: quaternion() },
  'geometry_msgs/Twist': twist(),
  'geometry_msgs/Accel': { linear: vector3(),angular: vector3() },
  'geometry_msgs/Wrench': { force: vector3(),torque: vector3() },
  'geometry_msgs/Inertia': { m: 0,com: vector3(),ixx: 0,ixy: 0,ixz: 0,iyy: 0,iyz: 0,izz: 0 },
  'geometry_msgs/Polygon': { points: [] },
  'geometry_msgs/PointStamped': { header: header(),point: vector3() },
  'geometry_msgs/Vector3Stamped': { header: header(),vector: vector3() },
  'geometry_msgs/QuaternionStamped': { header: header(),quaternion: quaternion() },
  'geometry_msgs/PoseStamped': { header: header(),pose: pose() },
  'geometry_msgs/TransformStamped': { header: header(),child_frame_id: '',transform: { translation: vector3(),rotation: quaternion() } },
  'geometry_msgs/TwistStamped': { header: header(),twist: twist() },
  'geometry_msgs/AccelStamped': { header: header(),accel: { linear: vector3(),angular: vector3() } },
  'geometry_msgs/WrenchStamped': { header: header(),wrench: { force: vector3(),torque: vector3() } },
  'geometry_msgs/InertiaStamped': { header: header(),inertia: { m: 0,com: vector3(),ixx: 0,ixy: 0,ixz: 0,iyy: 0,iyz: 0,izz: 0 } },
  'geometry_msgs/PolygonStamped': { header: header(),polygon: { points: [] } },
  'geometry_msgs/PoseArray': { header: header(),poses: [] },
  'geometry_msgs/PoseWithCovariance': { pose: pose(),covariance: covariance36() },
  'geometry_msgs/PoseWithCovarianceStamped': { header: header(),pose: { pose: pose(),covariance: covariance36() } },
  'geometry_msgs/TwistWithCovariance': { twist: twist(),covariance: covariance36() },
  'geometry_msgs/TwistWithCovarianceStamped': { header: header(),twist: { twist: twist(),covariance: covariance36() } },

  'sensor_msgs/BatteryState': { header: header(),voltage: 0,temperature: 0,current: 0,charge: 0,capacity: 0,design_capacity: 0,percentage: 0,power_supply_status: 0,power_supply_health: 0,power_supply_technology: 0,present: false,cell_voltage: [],cell_temperature: [],location: '',serial_number: '' },
  'sensor_msgs/CameraInfo': { header: header(),height: 0,width: 0,distortion_model: '',d: [],k: Array(9).fill(0),r: Array(9).fill(0),p: Array(12).fill(0),binning_x: 0,binning_y: 0,roi: { x_offset: 0,y_offset: 0,height: 0,width: 0,do_rectify: false } },
  'sensor_msgs/CompressedImage': { header: header(),format: '',data: [] },
  'sensor_msgs/FluidPressure': { header: header(),fluid_pressure: 0,variance: 0 },
  'sensor_msgs/Illuminance': { header: header(),illuminance: 0,variance: 0 },
  'sensor_msgs/Image': { header: header(),height: 0,width: 0,encoding: '',is_bigendian: 0,step: 0,data: [] },
  'sensor_msgs/Imu': { header: header(),orientation: quaternion(),orientation_covariance: Array(9).fill(0),angular_velocity: vector3(),angular_velocity_covariance: Array(9).fill(0),linear_acceleration: vector3(),linear_acceleration_covariance: Array(9).fill(0) },
  'sensor_msgs/JointState': { header: header(),name: [],position: [],velocity: [],effort: [] },
  'sensor_msgs/Joy': { header: header(),axes: [],buttons: [] },
  'sensor_msgs/LaserScan': { header: header(),angle_min: 0,angle_max: 0,angle_increment: 0,time_increment: 0,scan_time: 0,range_min: 0,range_max: 0,ranges: [],intensities: [] },
  'sensor_msgs/MagneticField': { header: header(),magnetic_field: vector3(),magnetic_field_covariance: Array(9).fill(0) },
  'sensor_msgs/MultiEchoLaserScan': { header: header(),angle_min: 0,angle_max: 0,angle_increment: 0,time_increment: 0,scan_time: 0,range_min: 0,range_max: 0,ranges: [],intensities: [] },
  'sensor_msgs/NavSatFix': { header: header(),status: { status: 0,service: 0 },latitude: 0,longitude: 0,altitude: 0,position_covariance: Array(9).fill(0),position_covariance_type: 0 },
  'sensor_msgs/PointCloud2': { header: header(),height: 0,width: 0,fields: [],is_bigendian: false,point_step: 0,row_step: 0,data: [],is_dense: false },
  'sensor_msgs/Range': { header: header(),radiation_type: 0,field_of_view: 0,min_range: 0,max_range: 0,range: 0 },
  'sensor_msgs/RelativeHumidity': { header: header(),relative_humidity: 0,variance: 0 },
  'sensor_msgs/Temperature': { header: header(),temperature: 0,variance: 0 },
  'sensor_msgs/TimeReference': { header: header(),source: '' },

  'nav_msgs/GridCells': { header: header(),cell_width: 0,cell_height: 0,cells: [] },
  'nav_msgs/MapMetaData': { map_load_time: { secs: 0,nsecs: 0 },resolution: 0,width: 0,height: 0,origin: pose() },
  'nav_msgs/OccupancyGrid': { header: header(),info: { resolution: 0,width: 0,height: 0,origin: pose() },data: [] },
  'nav_msgs/Odometry': { header: header(),child_frame_id: '',pose: { pose: pose(),covariance: covariance36() },twist: { twist: twist(),covariance: covariance36() } },
  'nav_msgs/Path': { header: header(),poses: [] },
  'trajectory_msgs/JointTrajectory': { header: header(),joint_names: [],points: [] },
  'trajectory_msgs/JointTrajectoryPoint': { positions: [],velocities: [],accelerations: [],effort: [],time_from_start: { secs: 0,nsecs: 0 } },
  'diagnostic_msgs/DiagnosticArray': { header: header(),status: [] },
  'diagnostic_msgs/DiagnosticStatus': { level: 0,name: '',message: '',hardware_id: '',values: [] },
  'visualization_msgs/Marker': { header: header(),ns: '',id: 0,type: 0,action: 0,pose: pose(),scale: vector3(),color: { r: 0,g: 0,b: 0,a: 1 },lifetime: { secs: 0,nsecs: 0 },frame_locked: false,points: [],colors: [],text: '',mesh_resource: '',mesh_use_embedded_materials: false },
  'visualization_msgs/MarkerArray': { markers: [] },
  'tf2_msgs/TFMessage': { transforms: [] },
  'rosgraph_msgs/Clock': { clock: { secs: 0,nsecs: 0 } },

  'mavros_msgs/State': { header: header(),connected: false,armed: false,guided: false,manual_input: false,mode: '',system_status: 0 },
  'mavros_msgs/ExtendedState': { header: header(),vtol_state: 0,landed_state: 0 },
  'mavros_msgs/PositionTarget': { header: header(),coordinate_frame: 1,type_mask: 3583,position: vector3(),velocity: vector3(),acceleration_or_force: vector3(),yaw: 0,yaw_rate: 0 },
  'mavros_msgs/GlobalPositionTarget': { header: header(),coordinate_frame: 0,type_mask: 4088,latitude: 0,longitude: 0,altitude: 0,velocity: vector3(),acceleration_or_force: vector3(),yaw: 0,yaw_rate: 0 },
  'mavros_msgs/AttitudeTarget': { header: header(),type_mask: 199,orientation: quaternion(),body_rate: vector3(),thrust: 0 },
  'mavros_msgs/ActuatorControl': { header: header(),group_mix: 0,controls: Array(8).fill(0) },
  'mavros_msgs/OverrideRCIn': { channels: Array(18).fill(0) },
  'mavros_msgs/ManualControl': { header: header(),x: 0,y: 0,z: 0,r: 0,buttons: 0 },
});

function ros2Template(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ros2Template);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([key,nested]) => [
    key === 'secs' ? 'sec' : key === 'nsecs' ? 'nanosec' : key,
    ros2Template(nested),
  ]));
}

const ROS2_MESSAGE_TEMPLATES: Readonly<Record<string,ROSTemplate>> = Object.freeze({
  ...Object.fromEntries(
    Object.entries(ROS1_MESSAGE_TEMPLATES)
      .filter(([type]) => type !== 'std_msgs/Time' && type !== 'std_msgs/Duration')
      .map(([type,template]) => {
        const separator = type.indexOf('/');
        return [`${type.slice(0, separator)}/msg/${type.slice(separator + 1)}`,ros2Template(template)];
      }),
  ),
  'builtin_interfaces/msg/Time': { sec: 0,nanosec: 0 },
  'builtin_interfaces/msg/Duration': { sec: 0,nanosec: 0 },
});

export function isROSPublishTopicKind(kind: AutomationNode['kind']) {
  return kind === 'ros1.publish-topic' || kind === 'ros2.publish-topic';
}

export function rosMessageTypeSuggestions(kind: AutomationNode['kind']) {
  return Object.keys(kind === 'ros2.publish-topic' ? ROS2_MESSAGE_TEMPLATES : ROS1_MESSAGE_TEMPLATES);
}

export function defaultROSPublishMessage(kind: AutomationNode['kind'], messageType: string) {
  const templates = kind === 'ros2.publish-topic' ? ROS2_MESSAGE_TEMPLATES : ROS1_MESSAGE_TEMPLATES;
  return structuredClone(templates[messageType] ?? {});
}
