import { FlightRobotInstrument } from './FlightRobotInstrument';
import { GroundRobotInstrument } from './GroundRobotInstrument';
import { isMecanumPanelRobot,robotLabel,type RobotPanelItem } from './robotProjectionModel';
import type { RobotProjectionChannels } from './useRobotProjectionChannels';

export function RobotInstrumentProjection({ robot,projection,healthTone }: {
  robot: RobotPanelItem;
  projection: RobotProjectionChannels;
  healthTone: 'idle' | 'healthy' | 'fault' | 'unavailable';
}) {
  if (projection.flight) {
    return <FlightRobotInstrument
      robotId={robot.id}
      name={robot.name}
      embedded
      telemetry={{
        presentation: projection.flightPresentation,
        online: projection.status.online,
        linkFresh: Boolean(
          projection.telemetryChannelIds.link
          && projection.channels[projection.telemetryChannelIds.link]
          && !projection.channels[projection.telemetryChannelIds.link]?.stale
        ),
        poseFresh: Boolean(projection.poseChannel && !projection.poseChannel.stale),
        mocapState: !projection.mocap ? 'missing' : projection.mocap.stale ? 'stale' : 'fresh',
        healthTone,
        flight: projection.flightState,
        pose: projection.pose,
        mocapPose: projection.mocap?.value ?? {},
        imu: projection.imu,
        localVelocity: projection.channels['state.velocity']?.value ?? projection.velocity,
        mocapVelocity: projection.channels['state.mocap.velocity']?.value ?? {},
        mocapSpeed: projection.speed,
        localizationError: projection.localizationError,
        localSetpoint: projection.setpoint?.value ?? {},
        localSetpointState: !projection.setpoint ? 'missing' : projection.setpoint.stale ? 'stale' : 'fresh',
        power: projection.power,
        health: projection.health,
        streamHealth: projection.streamHealth,
        fcuLink: projection.fcuLink,
      }}
    />;
  }

  if (projection.kindProjection) {
    const RenderInstrument = projection.kindProjection.RenderInstrument;
    return <RenderInstrument
      robot={robot}
      status={projection.status}
      channels={projection.channels}
      healthTone={healthTone}
    />;
  }

  return <GroundRobotInstrument
    robotId={robot.id}
    name={robot.name}
    kindLabel={robotLabel(robot)}
    embedded
    chassisChrome={isMecanumPanelRobot(robot) ? 'none' : 'scout'}
    telemetry={{
      online: projection.status.online,
      operationalReady: projection.status.operationalReady,
      connectionState: robot.connectionState,
      poseFresh: Boolean(projection.poseChannel && !projection.poseChannel.stale),
      healthTone,
      pose: projection.pose,
      velocity: projection.velocity,
      commandVelocity: projection.commandVelocity,
      speed: projection.speed,
      power: projection.power,
      imu: projection.imu,
      chassis: projection.chassis,
      health: projection.health,
      streamHealth: projection.streamHealth,
      powerStale: projection.channels['state.power']?.stale,
      chassisStale: projection.channels['state.chassis']?.stale,
      commandSequence: projection.commandVelocityChannel?.sequence,
      velocitySequence: projection.channels['vrpn.velocity']?.sequence,
      speedSequence: projection.channels['vrpn.speed']?.sequence,
      commandObservedAt: projection.commandVelocityChannel?.observedAt,
      velocityObservedAt: projection.channels['vrpn.velocity']?.observedAt,
      speedObservedAt: projection.channels['vrpn.speed']?.observedAt,
    }}
  />;
}
