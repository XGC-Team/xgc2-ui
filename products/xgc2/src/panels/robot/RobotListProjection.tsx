import { StatusText } from '@xgc2/ui-react';
import { useRobotText } from '../../domains/robot/robotPublic';
import { RobotListHeaderStatus } from './RobotListHeaderStatus';
import {
  adapterPositioningStatus,
  imuAgeCommunicationStatus,
  listHeaderStatusItems,
  px4CommunicationStatus,
} from './RobotListHeaderStatusModel';
import { RobotListMetric,RobotListScalarValue,RobotListVectorValue } from './RobotListMetric';
import { flightArmedTone,flightModeTone,flightStageLabel } from './flightInstrumentModel';
import { scoutChassisModeTone,scoutControlModeLabel } from './groundInstrumentModel';
import {
  booleanValue,
  firstNumber,
  objectValue,
  numberValue,
  orientationYawDegrees,
  robotStreamRate,
  stringValue,
  twistLinearSpeed2Norm,
} from './robotTelemetryValues';
import {
  isMecanumPanelRobot,
  setpointMaskGroups,
  topicRateLabel,
  type RobotPanelItem,
} from './robotProjectionModel';
import { groundListMetricChannelIds,type RobotProjectionChannels } from './useRobotProjectionChannels';

export function RobotListProjection({
  robot,projection,healthTone = 'healthy',showSimulationSourceMark = false,
}: {
  robot: RobotPanelItem;
  projection: RobotProjectionChannels;
  healthTone?: 'idle' | 'healthy' | 'fault' | 'unavailable';
  showSimulationSourceMark?: boolean;
}) {
  const t = useRobotText();
  if (projection.kindProjection) {
    const RenderList = projection.kindProjection.RenderList;
    return <RenderList
      robot={robot}
      status={projection.status}
      channels={projection.channels}
      healthTone={healthTone}
      showSimulationSourceMark={showSimulationSourceMark}
    />;
  }
  const position = objectValue(projection.pose.position) ?? {};
  const localVelocity = objectValue(projection.velocity.linear) ?? {};
  const mocapPosition = projection.mocap && !projection.mocap.stale
    ? objectValue(projection.mocap.value.position) ?? {}
    : {};
  const mocapLinear = objectValue(projection.channels['state.mocap.velocity']?.value.linear)
    ?? objectValue(projection.channels['vrpn.velocity']?.value.linear)
    ?? objectValue(projection.velocity.linear);
  const vrpnSpeed = twistLinearSpeed2Norm(
    projection.flight && !projection.mocapRotor
      ? objectValue(projection.channels['state.mocap.velocity']?.value.linear)
      : mocapLinear,
  );
  const localHeight = numberValue(position.z) ?? null;
  const vrpnHeight = projection.flight && !projection.mocapRotor
    ? numberValue(mocapPosition.z) ?? null
    : numberValue(mocapPosition.z) ?? (projection.mocapRotor ? localHeight : numberValue(position.z) ?? null);
  const commandLinear = objectValue(projection.commandVelocity.linear) ?? {};
  const commandAngular = objectValue(projection.commandVelocity.angular) ?? {};
  const vrpnVelocity = objectValue(projection.velocity.linear) ?? {};
  const vrpnAccelerationChannel = projection.channels[groundListMetricChannelIds.acceleration];
  const vrpnAccelerationValue = vrpnAccelerationChannel?.value ?? {};
  const vrpnAcceleration = objectValue(vrpnAccelerationValue.linear)
    ?? objectValue(vrpnAccelerationValue.acceleration)
    ?? vrpnAccelerationValue;
  const setpointValue = projection.setpoint?.value ?? {};
  const setpointPosition = objectValue(setpointValue.position) ?? {};
  const setpointVelocity = objectValue(setpointValue.velocity) ?? {};
  const setpointAcceleration = objectValue(setpointValue.accelerationOrForce)
    ?? objectValue(setpointValue.acceleration)
    ?? {};
  const setpointAvailable = Boolean(projection.setpoint && !projection.setpoint.stale);
  const setpointMask = setpointMaskGroups(numberValue(setpointValue.validFields), {
    available: setpointAvailable,
  });
  const batteryVoltage = firstNumber(projection.power, 'voltageV', 'voltage_v') ?? null;
  const telemetryLinkChannel = projection.telemetryChannelIds.link
    ? projection.channels[projection.telemetryChannelIds.link]
    : undefined;
  const powerChannel = projection.channels[groundListMetricChannelIds.power];
  const chassisChannel = projection.channels[groundListMetricChannelIds.chassis];
  const healthChannel = projection.channels[groundListMetricChannelIds.health];
  const setpointRate = topicRateLabel(robotStreamRate(
    projection.streamHealth,
    projection.telemetryChannelIds.setpoint ?? 'setpoint.local',
  ));
  const commandLinearX = numberValue(commandLinear.x) ?? null;
  const commandAngularZ = numberValue(commandAngular.z) ?? null;
  const stream = projection.streamHealth;
  const imuFreshness = streamChannelFreshness(stream,groundListMetricChannelIds.imu);
  const vrpnPositionRate = topicRateLabel(robotStreamRate(stream, groundListMetricChannelIds.position));
  const vrpnSpeedRate = topicRateLabel(robotStreamRate(stream, groundListMetricChannelIds.velocity));
  const vrpnVelocityRate = topicRateLabel(robotStreamRate(stream, groundListMetricChannelIds.velocity));
  const vrpnAccelerationRate = topicRateLabel(robotStreamRate(stream, groundListMetricChannelIds.acceleration));
  const flightPowerRate = topicRateLabel(robotStreamRate(stream, 'state.power'));
  const connectionLive = robot.connectionState === 'live' && projection.status.online;
  const groundPowerAvailable = connectionLive && powerChannel != null && powerChannel.stale !== true;
  const groundPowerRate = topicRateLabel(groundPowerAvailable
    ? robotStreamRate(stream,groundListMetricChannelIds.power)
    : 0);
  const groundBatteryVoltage = groundPowerAvailable ? batteryVoltage : null;
  const commandVelocityRate = topicRateLabel(robotStreamRate(stream, groundListMetricChannelIds.command));
  const latencyMs = firstNumber(
    telemetryLinkChannel?.value ?? projection.fcuLink,
    'roundTripTimeMs',
    'round_trip_time_ms',
    'latencyMs',
    'latency_ms',
  ) ?? null;
  const communication = projection.flight
    ? px4CommunicationStatus({
      roundTripTimeMs: latencyMs,
      connected: booleanValue(projection.flightState.connected) ?? projection.status.online,
      stale: telemetryLinkChannel?.stale,
      source: projection.telemetryChannelIds.link
        ? `${projection.telemetryChannelIds.link}.roundTripTimeMs`
        : 'diagnostic.fcu-link.roundTripTimeMs',
    })
    : imuAgeCommunicationStatus(
      imuFreshness,
      'diagnostic.stream-health.channels[state.imu].sourceAgeMs',
    );
  const powerValue = powerChannel?.value ?? projection.power;
  const availablePercentage = firstNumber(powerValue, 'percentage') ?? null;
  const batteryPercentage = projection.flight
    ? availablePercentage
    : groundPowerAvailable && stringValue(powerValue.percentageState) === 'PERCENTAGE_STATE_AVAILABLE'
      ? availablePercentage
      : null;
  const headerBatteryVoltage = projection.flight ? batteryVoltage : groundBatteryVoltage;
  const chassisControl = !projection.flight && !isMecanumPanelRobot(robot);

  return <>
    <header>
      <div className="robot-card-identity" data-xgc-gap="sm">
        <strong>{robot.name}</strong>
        {showSimulationSourceMark && (
          <StatusText
            status="error"
            className="robot-instrument-source-badge"
            title={t('This Robot uses its authored simulation source when the Session selects the hybrid branch.')}
            data-xgc-id={robot.id}
          >
            (sim)
          </StatusText>
        )}
        {projection.flight && <FlightIdentity
          robotId={robot.id}
          flight={projection.flightState}
        />}
        {chassisControl && <ChassisIdentity
          robotId={robot.id}
          chassis={chassisChannel?.value}
        />}
      </div>
      <RobotListHeaderStatus robotId={robot.id} items={listHeaderStatusItems({
        idle: healthTone === 'idle',
        communication,
        battery: {
          percentage: batteryPercentage,
          voltageV: headerBatteryVoltage,
          source: powerChannel
            ? 'state.power.voltageV+percentageState+percentage'
            : undefined,
          stale: powerChannel?.stale === true || (!projection.flight && !connectionLive),
        },
        position: adapterPositioningStatus(projection.health, {
          streamStale: healthChannel?.stale === true,
        }),
      },t)} />
    </header>
    <dl>
      {projection.flight ? (
        projection.mocapRotor ? <>
          <RobotListMetric
            robotId={robot.id}
            slot="local-pos"
            className="robot-metric-position robot-metric-local-position"
            title={t('Local pos')}
            unit="m"
            rate={topicRateLabel(robotStreamRate(
              projection.streamHealth,
              projection.telemetryChannelIds.pose,
            ))}
          >
            <RobotListVectorValue value={position} />
          </RobotListMetric>
          <RobotListMetric
            robotId={robot.id}
            slot="local-vel"
            className="robot-metric-vrpn-position"
            title={t('Local vel')}
            unit="m/s"
            rate={topicRateLabel(robotStreamRate(
              projection.streamHealth,
              projection.telemetryChannelIds.velocity,
            ))}
          >
            <RobotListVectorValue value={localVelocity} />
          </RobotListMetric>
          <RobotListMetric
            robotId={robot.id}
            slot="local-spd"
            title={t('Local spd')}
            rate={topicRateLabel(robotStreamRate(
              projection.streamHealth,
              projection.telemetryChannelIds.speed,
            ))}
            role="robot-mocap-rotor-local-speed"
            empty={vrpnSpeed == null}
          >
            <RobotListScalarValue value={vrpnSpeed} unit="m/s" />
          </RobotListMetric>
          <RobotListMetric
            robotId={robot.id}
            slot="height"
            title={t('Height')}
            rate={topicRateLabel(robotStreamRate(
              projection.streamHealth,
              projection.telemetryChannelIds.pose,
            ))}
            role="robot-mocap-rotor-height"
            empty={numberValue(position.z) == null}
          >
            <RobotListScalarValue value={numberValue(position.z) ?? null} unit="m" />
          </RobotListMetric>
          <RobotListMetric
            robotId={robot.id}
            slot="battery-vol"
            title={t('Battery vol')}
            rate={flightPowerRate}
            role="robot-mocap-rotor-battery-voltage"
            empty={batteryVoltage == null}
          >
            <RobotListScalarValue value={batteryVoltage} unit="V" digits={1} />
          </RobotListMetric>
          <RobotListMetric
            robotId={robot.id}
            slot="yaw"
            title={t('Yaw')}
            rate={topicRateLabel(robotStreamRate(
              projection.streamHealth,
              projection.telemetryChannelIds.pose,
            ))}
            role="robot-mocap-rotor-yaw"
            empty={orientationYawDegrees(projection.pose.orientation) == null}
          >
            <RobotListScalarValue value={orientationYawDegrees(projection.pose.orientation)} unit="deg" />
          </RobotListMetric>
          <RobotListMetric robotId={robot.id} slot="mode" className="robot-metric-health" title={t('Mode')} rate="--">
            <span className="robot-list-flight-primary-state">
              {stringValue(projection.flightState.mode) ?? '--'}
            </span>
          </RobotListMetric>
          <RobotListMetric robotId={robot.id} slot="link" className="robot-metric-setpoint-mask" title={t('Link')} rate="Zenoh">
            <span className="robot-list-flight-primary-state">
              {t(telemetryLinkChannel && !telemetryLinkChannel.stale ? 'READY' : 'OFFLINE')}
            </span>
          </RobotListMetric>
        </> : <>
        <RobotListMetric
          robotId={robot.id}
          slot="vrpn-pos"
          className="robot-metric-vrpn-position"
          title={t('VRPN pos')}
          unit="m"
          rate={topicRateLabel(robotStreamRate(projection.streamHealth,'state.mocap.pose'))}
        >
          <RobotListVectorValue value={mocapPosition} />
        </RobotListMetric>
        <RobotListMetric
          robotId={robot.id}
          slot="local-pos"
          className="robot-metric-position robot-metric-local-position"
          title={t('Local pos')}
          unit="m"
          rate={topicRateLabel(robotStreamRate(projection.streamHealth,'state.pose'))}
        >
          <RobotListVectorValue value={position} />
        </RobotListMetric>
        <RobotListMetric
          robotId={robot.id}
          slot="vrpn-spd"
          title={t('VRPN spd')}
          rate={topicRateLabel(robotStreamRate(projection.streamHealth,'state.mocap.velocity'))}
          role="robot-flight-vrpn-speed"
          empty={vrpnSpeed == null}
        >
          <RobotListScalarValue value={vrpnSpeed} unit="m/s" />
        </RobotListMetric>
        <RobotListMetric
          robotId={robot.id}
          slot="height"
          title={t('VRPN height')}
          rate={topicRateLabel(robotStreamRate(projection.streamHealth,'state.mocap.pose'))}
          role="robot-flight-height"
          empty={vrpnHeight == null}
        >
          <RobotListScalarValue value={vrpnHeight} unit="m" />
        </RobotListMetric>
        <RobotListMetric robotId={robot.id} slot="sp-pos" className="robot-metric-setpoint-pos" title={t('SP pos')} unit="m" rate={setpointRate}>
          <RobotListVectorValue value={setpointPosition} />
        </RobotListMetric>
        <RobotListMetric robotId={robot.id} slot="sp-vel" className="robot-metric-setpoint-vel" title={t('SP vel')} unit="m/s" rate={setpointRate}>
          <RobotListVectorValue value={setpointVelocity} />
        </RobotListMetric>
        <RobotListMetric robotId={robot.id} slot="sp-acc" className="robot-metric-setpoint-acc" title={t('SP acc')} unit="m/s²" rate={setpointRate}>
          <RobotListVectorValue value={setpointAcceleration} />
        </RobotListMetric>
        <div
          className="robot-metric-setpoint-mask"
          data-xgc-role="robot-list-setpoint-mask"
          data-xgc-id={`${robot.id}:sp-mask`}
        >
          <dt className="robot-setpoint-mask-labels" aria-label={t('Local setpoint fields')}>
            {setpointMask.map((group) => (
              <span
                key={group.label}
                className="robot-setpoint-mask-label"
                data-xgc-role="robot-list-setpoint-mask-label"
                data-xgc-id={`${robot.id}:sp-mask:${group.label}`}
              >{group.label}</span>
            ))}
          </dt>
          <dd className="robot-setpoint-mask-states-row" aria-label={t('Local setpoint field validity')}>
            {setpointMask.flatMap((group, groupIndex) => [
              <span
                key={group.label}
                className="robot-setpoint-mask-states"
                data-xgc-role="robot-list-setpoint-mask-field"
                data-xgc-id={`${robot.id}:sp-mask:${group.label}`}
              >
                {group.lights.map((state, index) => (
                  <span
                    key={`${group.label}-${index}`}
                    className="robot-setpoint-mask-state"
                    data-xgc-state={state}
                    aria-label={t(state === 'unmasked'
                      ? '{field} unmasked' : state === 'masked' ? '{field} masked' : '{field} unknown',{
                      field:`${group.label}${group.lights.length > 1 ? 'xyz'[index] : ''}`,
                    })}
                    title={t(state === 'unmasked'
                      ? '{field} unmasked' : state === 'masked' ? '{field} masked' : '{field} unknown',{
                      field:`${group.label}${group.lights.length > 1 ? 'xyz'[index] : ''}`,
                    })}
                  >{state === 'unmasked' ? '✓' : state === 'masked' ? '×' : '–'}</span>
                ))}
              </span>,
              ...(groupIndex < setpointMask.length - 1 ? [
                <span
                  key={`${group.label}-sep`}
                  className="robot-setpoint-mask-sep"
                  aria-hidden="true"
                >·</span>,
              ] : []),
            ])}
          </dd>
        </div>
        </>
      ) : <>
        <RobotListMetric
          robotId={robot.id}
          slot="vrpn-pos"
          className="robot-metric-position robot-metric-local-position"
          title={t('VRPN pos')}
          unit="m"
          rate={vrpnPositionRate}
          role="robot-ground-vrpn-position"
        >
          <RobotListVectorValue value={position} />
        </RobotListMetric>
        <RobotListMetric
          robotId={robot.id}
          slot="vrpn-vel"
          title={t('VRPN vel')}
          unit="m/s"
          rate={vrpnVelocityRate}
          role="robot-ground-vrpn-velocity"
        >
          <RobotListVectorValue value={vrpnVelocity} />
        </RobotListMetric>
        <RobotListMetric
          robotId={robot.id}
          slot="vrpn-spd"
          title={t('VRPN spd')}
          rate={vrpnSpeedRate}
          role="robot-ground-vrpn-speed"
          empty={vrpnSpeed == null}
        >
          <RobotListScalarValue value={vrpnSpeed} unit="m/s" />
        </RobotListMetric>
        <RobotListMetric
          robotId={robot.id}
          slot="vrpn-acc"
          title={t('VRPN acc')}
          unit="m/s²"
          rate={vrpnAccelerationRate}
          role="robot-ground-vrpn-acceleration"
        >
          <RobotListVectorValue value={vrpnAcceleration} />
        </RobotListMetric>
        <RobotListMetric
          robotId={robot.id}
          slot="cmd-vel"
          title={t('CMD vel')}
          rate={commandVelocityRate}
          role="robot-ground-command-velocity"
          empty={commandLinearX == null}
        >
          <RobotListScalarValue value={commandLinearX} unit="m/s" />
        </RobotListMetric>
        <RobotListMetric
          robotId={robot.id}
          slot="cmd-twist"
          title={t('CMD twist')}
          rate={commandVelocityRate}
          role="robot-ground-command-twist"
          empty={commandAngularZ == null}
        >
          <RobotListScalarValue value={commandAngularZ} unit="rad/s" />
        </RobotListMetric>
        <RobotListMetric
          robotId={robot.id}
          slot="battery-vol"
          title={t('Battery vol')}
          rate={groundPowerRate}
          role="robot-ground-battery-voltage"
          empty={groundBatteryVoltage == null}
        >
          <RobotListScalarValue value={groundBatteryVoltage} unit="V" digits={1} />
        </RobotListMetric>
        <RobotListMetric
          robotId={robot.id}
          slot="yaw"
          title={t('Yaw')}
          rate={vrpnPositionRate}
          role="robot-ground-yaw"
          empty={orientationYawDegrees(projection.pose.orientation) == null}
        >
          <RobotListScalarValue value={orientationYawDegrees(projection.pose.orientation)} unit="deg" />
        </RobotListMetric>
      </>}
    </dl>
  </>;
}

function streamChannelFreshness(
  streamHealth: Record<string,unknown>,
  channelId: string,
): { sourceAgeMs: number | null;stale?: boolean } | undefined {
  const channels = Array.isArray(streamHealth.channels) ? streamHealth.channels : [];
  const channel = channels
    .map(objectValue)
    .find((candidate) => candidate?.channelId === channelId || candidate?.channel_id === channelId);
  if (!channel) return undefined;
  return {
    sourceAgeMs: firstNumber(channel,'sourceAgeMs','source_age_ms') ?? null,
    stale: booleanValue(channel.stale),
  };
}

function ChassisIdentity({ robotId,chassis }: {
  robotId: string;
  chassis?: Record<string,unknown>;
}) {
  const t = useRobotText();
  return (
    <span
      className="robot-list-header-word"
      data-xgc-role="robot-list-header-chassis-mode"
      data-xgc-id={robotId}
      data-xgc-tone={scoutChassisModeTone(chassis)}
      title={t('Chassis control mode')}
    >{scoutControlModeLabel(chassis)}</span>
  );
}

function FlightIdentity({ robotId,flight }: {
  robotId: string;
  flight: Record<string,unknown>;
}) {
  const connected = flight.connected === true;
  const mode = connected ? stringValue(flight.mode) ?? '--' : '--';
  const armed = connected ? (flight.armed === true ? 'ARMED' : 'DISARMED') : '--';
  const stage = connected ? flightStageLabel(firstNumber(flight, 'landedState', 'landed_state')) : '--';
  return (
    <div className="robot-list-flight-state" data-xgc-gap="sm">
      <span
        className="robot-list-header-word"
        data-xgc-role="robot-list-header-flight-mode"
        data-xgc-id={robotId}
        data-xgc-tone={flightModeTone(connected ? stringValue(flight.mode) : null)}
      >{mode}</span>
      <span
        className="robot-list-header-word"
        data-xgc-role="robot-list-header-flight-armed"
        data-xgc-id={robotId}
        data-xgc-tone={flightArmedTone(connected ? flight.armed === true : null)}
      >{armed}</span>
      <span
        className="robot-list-header-word"
        data-xgc-role="robot-list-header-flight-stage"
        data-xgc-id={robotId}
        data-xgc-tone="normal"
      >{stage}</span>
    </div>
  );
}
