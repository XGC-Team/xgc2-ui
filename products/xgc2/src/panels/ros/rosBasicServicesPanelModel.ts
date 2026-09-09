/**
 * The Experiment workflow slot this panel drives. The manifest declares it and
 * the visible Experiment decides which binding fills it; nothing here assumes a
 * particular Automation.
 */
export const ROS_CONTROL_WORKFLOW_SLOT = 'ros-control';

/**
 * All six services join the ROS Control workflow. autoStart* only gates bulk panel Run.
 *
 * readinessNodeKind is the node whose success the tile reports as "ready". It is per
 * service because Robot Adapters is not a process: its adapter process is torn down by
 * a 300 s idle reaper, so a tile that watched process liveness would read Running for
 * five minutes after Stop. robot.ensure-connected owns the connection lease instead,
 * and that lease is revoked synchronously with the run, so connection state is the only
 * basis on which this tile can be honest.
 */
export const rosBasicServices = [
  { id: 'roscore',label: 'ROS',description: 'ROS 1 master',parameterKey: 'autoStartRos',readinessNodeKind: 'process.run-definition' },
  { id: 'gzserver',label: 'Gazebo server',description: 'Gazebo Classic server',parameterKey: 'autoStartGazeboServer',readinessNodeKind: 'process.run-definition' },
  { id: 'vrpn',label: 'VRPN client',description: 'ROS VRPN client',parameterKey: 'autoStartVrpn',readinessNodeKind: 'process.run-definition' },
  { id: 'adapters',label: 'Robot adapters',description: 'Trusted robot adapters',parameterKey: 'autoStartAdapters',readinessNodeKind: 'robot.ensure-connected' },
  { id: 'rviz',label: 'RViz',description: 'ROS visualization',parameterKey: 'autoStartRviz',readinessNodeKind: 'process.run-definition' },
  { id: 'gzclient',label: 'Gazebo client',description: 'Gazebo Classic client',parameterKey: 'autoStartGazeboClient',readinessNodeKind: 'process.run-definition' },
] as const;

export type RosBasicServiceId = (typeof rosBasicServices)[number]['id'];

export const rosBasicServicesPanelViews = ['controls','whiteboard'] as const;
export type RosBasicServicesPanelView = (typeof rosBasicServicesPanelViews)[number];

export function isRosBasicServicesPanelView(value: unknown): value is RosBasicServicesPanelView {
  return typeof value === 'string'
    && (rosBasicServicesPanelViews as readonly string[]).includes(value);
}

/** Tiles follow Experiment Action ports. Unwired services stay off this Experiment. */
export function rosBasicServicesShownFromActionPorts(
  shown: readonly RosBasicServiceId[],
  actions: Readonly<Record<string,{ connected?: boolean } | undefined>>,
): RosBasicServiceId[] {
  const bound = shown.filter((id) => actions[id]?.connected === true);
  return bound.length > 0 ? bound : [...shown];
}
