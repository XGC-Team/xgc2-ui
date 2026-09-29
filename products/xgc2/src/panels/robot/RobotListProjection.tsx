import { memo } from 'react';
import { StatusText } from '@xgc2/ui-react';
import { useRobotText } from '../../domains/robot/robotPublic';
import { RobotListHeaderStatus } from './RobotListHeaderStatus';
import {
  groundCoreSubscriptionReady,
  px4CoreSubscriptionReady,
  robotConnectionPresentation,
} from './robotConnectionPresentation';
import {
  adapterPositioningStatus,
  imuAgeCommunicationStatus,
  listHeaderStatusItems,
  px4CommunicationStatus,
} from './RobotListHeaderStatusModel';
import { RobotListMetric,RobotListScalarMetric,RobotListVectorMetric } from './RobotListMetric';
import { flightArmedTone,flightModeTone,flightPedestalLive,flightStageLabel } from './flightInstrumentModel';
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
import { RobotInstrumentIdentity } from './RobotInstrumentIdentity';
import { groundListMetricChannelIds,type RobotProjectionChannels } from './useRobotProjectionChannels';

/**
 * The readout of an absent vector. One shared object, so a metric whose
 * vector stays absent keeps equal props between card renders.
 */
const NO_VECTOR: Record<string,unknown> = Object.freeze({});

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
  const poseLive = Boolean(projection.poseChannel && projection.poseChannel.stale !== true);
  const velocityChannel = projection.telemetryChannelIds.velocity
    ? projection.channels[projection.telemetryChannelIds.velocity]
    : undefined;
  const velocityLive = Boolean(velocityChannel && velocityChannel.stale !== true);
  const commandLive = Boolean(
    projection.commandVelocityChannel && projection.commandVelocityChannel.stale !== true,
  );
  const mocapVelocityLive = projection.channels['state.mocap.velocity']?.stale !== true;
  const position = poseLive ? objectValue(projection.pose.position) ?? NO_VECTOR : NO_VECTOR;
  const localVelocity = velocityLive ? objectValue(projection.velocity.linear) ?? NO_VECTOR : NO_VECTOR;
  const mocapPosition = projection.mocap && !projection.mocap.stale
    ? objectValue(projection.mocap.value.position) ?? NO_VECTOR
    : NO_VECTOR;
  const mocapLinear = mocapVelocityLive
    ? objectValue(projection.channels['state.mocap.velocity']?.value.linear)
    : undefined;
  const groundLinear = velocityLive
    ? objectValue(projection.channels['vrpn.velocity']?.value.linear)
      ?? objectValue(projection.velocity.linear)
    : undefined;
  const vrpnSpeed = twistLinearSpeed2Norm(
    projection.flight && !projection.mocapRotor ? mocapLinear : groundLinear,
  );
  const localHeight = numberValue(position.z) ?? null;
  const vrpnHeight = projection.flight && !projection.mocapRotor
    ? numberValue(mocapPosition.z) ?? null
    : numberValue(mocapPosition.z) ?? (projection.mocapRotor ? localHeight : numberValue(position.z) ?? null);
  const commandLinear = commandLive ? objectValue(projection.commandVelocity.linear) ?? {} : {};
  const commandAngular = commandLive ? objectValue(projection.commandVelocity.angular) ?? {} : {};
  const vrpnVelocity = groundLinear ?? NO_VECTOR;
  const vrpnYawRate = velocityLive
    ? numberValue(objectValue(projection.velocity.angular)?.z) ?? null
    : null;
  const setpointValue = projection.setpoint?.value ?? {};
  const setpointPosition = objectValue(setpointValue.position) ?? NO_VECTOR;
  const setpointVelocity = objectValue(setpointValue.velocity) ?? NO_VECTOR;
  const setpointAcceleration = objectValue(setpointValue.accelerationOrForce)
    ?? objectValue(setpointValue.acceleration)
    ?? NO_VECTOR;
  const setpointAvailable = Boolean(projection.setpoint && !projection.setpoint.stale);
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
  const connection = robotConnectionPresentation({
    connectionState: robot.connectionState,
    connectionDetail: robot.connectionDetail,
    hasRun: healthTone !== 'idle',
    coreReady: projection.flight
      ? px4CoreSubscriptionReady({
        flight: projection.flightState,
        streamHealth: stream,
      })
      : groundCoreSubscriptionReady(stream),
  });
  const robotOwnedLive = connection !== 'disconnected';
  const groundPowerAvailable = powerChannel != null && powerChannel.stale !== true;
  const listGroundPowerAvailable = robotOwnedLive && groundPowerAvailable;
  const groundPowerRate = topicRateLabel(listGroundPowerAvailable
    ? robotStreamRate(stream,groundListMetricChannelIds.power)
    : 0);
  const groundBatteryVoltage = listGroundPowerAvailable ? batteryVoltage : null;
  const listFlightBatteryVoltage = robotOwnedLive && powerChannel?.stale !== true
    ? batteryVoltage
    : null;
  const flightPowerRate = topicRateLabel(robotOwnedLive && powerChannel?.stale !== true
    ? robotStreamRate(stream, 'state.power')
    : 0);
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
      connected: booleanValue(projection.flightState.connected) === true,
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
  const headerBatteryVoltage = projection.flight
    ? batteryVoltage
    : (groundPowerAvailable ? batteryVoltage : null);
  const chassisControl = !projection.flight && !isMecanumPanelRobot(robot);

  return <>
    <header>
      <div className="robot-card-identity" data-xgc-gap="sm">
        <RobotInstrumentIdentity robotId={robot.id} name={robot.name} />
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
          controller={projection.controller}
          useControllerStage={projection.flightPresentation !== 'mocap_rotor'}
          flightStale={!flightPedestalLive({
            connectionPresentation: connection,
            flightChannelStale: projection.channels['state.flight']?.stale === true,
          })}
          controllerStale={
            connection === 'disconnected'
            || projection.channels['state.controller']?.stale === true
          }
        />}
        {chassisControl && <ChassisIdentity
          robotId={robot.id}
          chassis={connection === 'disconnected' ? undefined : chassisChannel?.value}
        />}
      </div>
      <RobotListHeaderStatus robotId={robot.id} items={listHeaderStatusItems({
        connection,
        communication,
        battery: {
          percentage: batteryPercentage,
          estimated: !projection.flight,
          voltageV: headerBatteryVoltage,
          source: powerChannel
            ? 'state.power.voltageV+percentageState+percentage'
            : undefined,
          stale: powerChannel?.stale === true,
        },
        position: adapterPositioningStatus(projection.health, {
          streamStale: healthChannel?.stale === true,
        }),
      },t)} />
    </header>
    <dl>
      {projection.flight ? (
        projection.mocapRotor ? <>
          <RobotListVectorMetric
            robotId={robot.id}
            slot="local-pos"
            className="robot-metric-position robot-metric-local-position"
            title={t('Local pos')}
            unit="m"
            rate={topicRateLabel(robotStreamRate(
              projection.streamHealth,
              projection.telemetryChannelIds.pose,
            ))}
            value={position}
          />
          <RobotListVectorMetric
            robotId={robot.id}
            slot="local-vel"
            className="robot-metric-vrpn-position"
            title={t('Local vel')}
            unit="m/s"
            rate={topicRateLabel(robotStreamRate(
              projection.streamHealth,
              projection.telemetryChannelIds.velocity,
            ))}
            value={localVelocity}
          />
          <RobotListScalarMetric
            robotId={robot.id}
            slot="local-spd"
            title={t('Local spd')}
            rate={topicRateLabel(robotStreamRate(
              projection.streamHealth,
              projection.telemetryChannelIds.speed,
            ))}
            role="robot-mocap-rotor-local-speed"
            empty={vrpnSpeed == null}
            value={vrpnSpeed}
            unit="m/s"
          />
          <RobotListScalarMetric
            robotId={robot.id}
            slot="height"
            title={t('Height')}
            rate={topicRateLabel(robotStreamRate(
              projection.streamHealth,
              projection.telemetryChannelIds.pose,
            ))}
            role="robot-mocap-rotor-height"
            empty={numberValue(position.z) == null}
            value={numberValue(position.z) ?? null}
            unit="m"
          />
          <RobotListScalarMetric
            robotId={robot.id}
            slot="battery-vol"
            title={t('Battery vol')}
            rate={flightPowerRate}
            role="robot-mocap-rotor-battery-voltage"
            empty={listFlightBatteryVoltage == null}
            value={listFlightBatteryVoltage}
            unit="V"
            digits={1}
          />
          <RobotListScalarMetric
            robotId={robot.id}
            slot="yaw"
            title={t('Yaw')}
            rate={topicRateLabel(robotStreamRate(
              projection.streamHealth,
              projection.telemetryChannelIds.pose,
            ))}
            role="robot-mocap-rotor-yaw"
            empty={!poseLive || orientationYawDegrees(projection.pose.orientation) == null}
            value={poseLive ? orientationYawDegrees(projection.pose.orientation) : null}
            unit="deg"
          />
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
        <RobotListVectorMetric
          robotId={robot.id}
          slot="vrpn-pos"
          className="robot-metric-vrpn-position"
          title={t('VRPN pos')}
          unit="m"
          rate={topicRateLabel(robotStreamRate(projection.streamHealth,'state.mocap.pose'))}
          value={mocapPosition}
        />
        <RobotListVectorMetric
          robotId={robot.id}
          slot="local-pos"
          className="robot-metric-position robot-metric-local-position"
          title={t('Local pos')}
          unit="m"
          rate={topicRateLabel(robotStreamRate(projection.streamHealth,'state.pose'))}
          value={position}
        />
        <RobotListScalarMetric
          robotId={robot.id}
          slot="vrpn-spd"
          title={t('VRPN spd')}
          rate={topicRateLabel(robotStreamRate(projection.streamHealth,'state.mocap.velocity'))}
          role="robot-flight-vrpn-speed"
          empty={vrpnSpeed == null}
          value={vrpnSpeed}
          unit="m/s"
        />
        <RobotListScalarMetric
          robotId={robot.id}
          slot="height"
          title={t('VRPN height')}
          rate={topicRateLabel(robotStreamRate(projection.streamHealth,'state.mocap.pose'))}
          role="robot-flight-height"
          empty={vrpnHeight == null}
          value={vrpnHeight}
          unit="m"
        />
        <RobotListVectorMetric robotId={robot.id} slot="sp-pos" className="robot-metric-setpoint-pos" title={t('SP pos')} unit="m" rate={setpointRate} value={setpointPosition} />
        <RobotListVectorMetric robotId={robot.id} slot="sp-vel" className="robot-metric-setpoint-vel" title={t('SP vel')} unit="m/s" rate={setpointRate} value={setpointVelocity} />
        <RobotListVectorMetric robotId={robot.id} slot="sp-acc" className="robot-metric-setpoint-acc" title={t('SP acc')} unit="m/s²" rate={setpointRate} value={setpointAcceleration} />
        <RobotListSetpointMask
          robotId={robot.id}
          validFields={numberValue(setpointValue.validFields)}
          available={setpointAvailable}
        />
        </>
      ) : <>
        <RobotListVectorMetric
          robotId={robot.id}
          slot="vrpn-pos"
          className="robot-metric-position robot-metric-local-position"
          title={t('VRPN pos')}
          unit="m"
          rate={vrpnPositionRate}
          role="robot-ground-vrpn-position"
          empty={!poseLive}
          value={position}
        />
        <RobotListVectorMetric
          robotId={robot.id}
          slot="vrpn-vel"
          title={t('VRPN vel')}
          unit="m/s"
          rate={vrpnVelocityRate}
          role="robot-ground-vrpn-velocity"
          value={vrpnVelocity}
        />
        <RobotListScalarMetric
          robotId={robot.id}
          slot="vrpn-spd"
          title={t('VRPN spd')}
          rate={vrpnSpeedRate}
          role="robot-ground-vrpn-speed"
          empty={vrpnSpeed == null}
          value={vrpnSpeed}
          unit="m/s"
        />
        <RobotListScalarMetric
          robotId={robot.id}
          slot="vrpn-yaw-rate"
          title={t('VRPN ω')}
          rate={vrpnVelocityRate}
          role="robot-ground-vrpn-yaw-rate"
          empty={vrpnYawRate == null}
          value={vrpnYawRate}
          unit="rad/s"
        />
        <RobotListScalarMetric
          robotId={robot.id}
          slot="cmd-vel"
          title={t('CMD vel')}
          rate={commandVelocityRate}
          role="robot-ground-command-velocity"
          empty={commandLinearX == null}
          value={commandLinearX}
          unit="m/s"
        />
        <RobotListScalarMetric
          robotId={robot.id}
          slot="cmd-twist"
          title={t('CMD twist')}
          rate={commandVelocityRate}
          role="robot-ground-command-twist"
          empty={commandAngularZ == null}
          value={commandAngularZ}
          unit="rad/s"
        />
        <RobotListScalarMetric
          robotId={robot.id}
          slot="battery-vol"
          title={t('Battery vol')}
          rate={groundPowerRate}
          role="robot-ground-battery-voltage"
          empty={groundBatteryVoltage == null}
          value={groundBatteryVoltage}
          unit="V"
          digits={1}
        />
        <RobotListScalarMetric
          robotId={robot.id}
          slot="yaw"
          title={t('Yaw')}
          rate={vrpnPositionRate}
          role="robot-ground-yaw"
          empty={!poseLive || orientationYawDegrees(projection.pose.orientation) == null}
          value={poseLive ? orientationYawDegrees(projection.pose.orientation) : null}
          unit="deg"
        />
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

const ChassisIdentity = memo(function ChassisIdentity({ robotId,chassis }: {
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
});

const FlightIdentity = memo(function FlightIdentity({
  robotId,flight,controller,useControllerStage = false,flightStale = false,controllerStale = false,
}: {
  robotId: string;
  flight: Record<string,unknown>;
  controller?: Record<string,unknown>;
  useControllerStage?: boolean;
  flightStale?: boolean;
  controllerStale?: boolean;
}) {
  const mode = flightStale ? '--' : stringValue(flight.mode) ?? '--';
  const armedValue = flightStale ? null : booleanValue(flight.armed);
  const armed = armedValue == null ? '--' : armedValue ? 'ARMED' : 'DISARMED';
  const stage = (useControllerStage ? controllerStale : flightStale)
    ? '--'
    : useControllerStage
      ? (stringValue(controller?.text)?.trim() || '--')
      : flightStageLabel(firstNumber(flight, 'landedState', 'landed_state'));
  return (
    <div className="robot-list-flight-state" data-xgc-gap="sm">
      <span
        className="robot-list-header-word"
        data-xgc-role="robot-list-header-flight-mode"
        data-xgc-id={robotId}
        data-xgc-tone={flightModeTone(flightStale ? null : stringValue(flight.mode))}
      >{mode}</span>
      <span
        className="robot-list-header-word"
        data-xgc-role="robot-list-header-flight-armed"
        data-xgc-id={robotId}
        data-xgc-tone={flightArmedTone(armedValue)}
      >{armed}</span>
      <span
        className="robot-list-header-word"
        data-xgc-role="robot-list-header-flight-stage"
        data-xgc-id={robotId}
        data-xgc-tone="normal"
      >{stage}</span>
    </div>
  );
});

/** Local setpoint field-validity lights; re-renders only when the mask or its freshness changes. */
const RobotListSetpointMask = memo(function RobotListSetpointMask({ robotId,validFields,available }: {
  robotId: string;
  validFields: number | undefined;
  available: boolean;
}) {
  const t = useRobotText();
  const setpointMask = setpointMaskGroups(validFields, { available });
  return (
    <div
      className="robot-metric-setpoint-mask"
      data-xgc-role="robot-list-setpoint-mask"
      data-xgc-id={`${robotId}:sp-mask`}
    >
      <dt className="robot-setpoint-mask-labels" aria-label={t('Local setpoint fields')}>
        {setpointMask.map((group) => (
          <span
            key={group.label}
            className="robot-setpoint-mask-label"
            data-xgc-role="robot-list-setpoint-mask-label"
            data-xgc-id={`${robotId}:sp-mask:${group.label}`}
          >{group.label}</span>
        ))}
      </dt>
      <dd className="robot-setpoint-mask-states-row" aria-label={t('Local setpoint field validity')}>
        {setpointMask.flatMap((group, groupIndex) => [
          <span
            key={group.label}
            className="robot-setpoint-mask-states"
            data-xgc-role="robot-list-setpoint-mask-field"
            data-xgc-id={`${robotId}:sp-mask:${group.label}`}
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
  );
});
