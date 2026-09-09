import { StatusText } from '@xgc2/ui-react';
import type { RobotKindPanelRenderProps } from '../../robotAssetKindComposition';
import { UnitreeB2RobotInstrument } from './UnitreeB2RobotInstrument';
import { b2LocomotionLabel } from './instrumentModel';
import { RobotListHeaderStatus } from '../../../../panels/robot/RobotListHeaderStatus';
import { listHeaderStatusItems } from '../../../../panels/robot/RobotListHeaderStatusModel';
import {
  RobotListMetric,
  RobotListScalarValue,
  RobotListVectorValue,
} from '../../../../panels/robot/RobotListMetric';
import {
  firstNumber,
  numberValue,
  objectValue,
  orientationYawDegrees,
  robotStreamRate,
} from '../../../../panels/robot/robotTelemetryValues';
import { topicRateLabel } from '../../../../panels/robot/robotProjectionModel';
import { useRobotText } from '../../robotPublic';

const POSE_CHANNEL = 'state.pose';
const VELOCITY_CHANNEL = 'state.velocity';
const SPEED_CHANNEL = 'state.speed';
const POWER_CHANNEL = 'state.power';
const HEALTH_CHANNEL = 'state.health';
const LOCOMOTION_CHANNEL = 'state.locomotion';
const JOINTS_CHANNEL = 'state.joints';
const LINK_CHANNEL = 'diagnostic.link';
const STREAM_HEALTH_CHANNEL = 'diagnostic.stream-health';

export function UnitreeB2InstrumentProjection({ robot,status,channels,healthTone }: RobotKindPanelRenderProps) {
  const value = (channelId: string) => channels[channelId]?.value ?? {};
  return <UnitreeB2RobotInstrument
    robotId={robot.id}
    name={robot.name}
    embedded
    telemetry={{
      online: status.online,
      operationalReady: status.operationalReady,
      connectionState: robot.connectionState,
      poseFresh: Boolean(channels[POSE_CHANNEL] && !channels[POSE_CHANNEL]?.stale),
      velocityStale: channels[VELOCITY_CHANNEL]?.stale ?? true,
      speedStale: channels[SPEED_CHANNEL]?.stale ?? true,
      powerStale: channels[POWER_CHANNEL]?.stale ?? true,
      locomotionStale: channels[LOCOMOTION_CHANNEL]?.stale ?? true,
      healthTone,
      pose: value(POSE_CHANNEL),
      velocity: value(VELOCITY_CHANNEL),
      speed: value(SPEED_CHANNEL),
      power: value(POWER_CHANNEL),
      health: value(HEALTH_CHANNEL),
      locomotion: value(LOCOMOTION_CHANNEL),
      joints: value(JOINTS_CHANNEL),
      jointsStale: channels[JOINTS_CHANNEL]?.stale ?? true,
      streamHealth: value(STREAM_HEALTH_CHANNEL),
      link: value(LINK_CHANNEL),
      poseSequence: channels[POSE_CHANNEL]?.sequence,
      speedSequence: channels[SPEED_CHANNEL]?.sequence,
      powerSequence: channels[POWER_CHANNEL]?.sequence,
      poseObservedAt: channels[POSE_CHANNEL]?.observedAt,
      speedObservedAt: channels[SPEED_CHANNEL]?.observedAt,
      powerObservedAt: channels[POWER_CHANNEL]?.observedAt,
    }}
  />;
}

export function UnitreeB2ListProjection({ robot,status,channels,showSimulationSourceMark = false }: RobotKindPanelRenderProps) {
  const t = useRobotText();
  const poseChannel = channels[POSE_CHANNEL];
  const speedChannel = channels[SPEED_CHANNEL];
  const velocityChannel = channels[VELOCITY_CHANNEL];
  const powerChannel = channels[POWER_CHANNEL];
  const locomotionChannel = channels[LOCOMOTION_CHANNEL];
  const linkChannel = channels[LINK_CHANNEL];
  const pose = poseChannel?.value ?? {};
  const velocity = velocityChannel?.value ?? {};
  const speed = speedChannel?.value ?? {};
  const power = powerChannel?.value ?? {};
  const locomotionValue = locomotionChannel?.value ?? {};
  const streamHealth = channels[STREAM_HEALTH_CHANNEL]?.value ?? {};
  const position = objectValue(pose.position) ?? {};
  const angular = objectValue(velocity.angular) ?? {};
  const speedValue = firstNumber(speed, 'metersPerSecond', 'meters_per_second') ?? null;
  const yawRate = numberValue(angular.z) ?? null;
  const linkSourceAgeMs = firstNumber(linkChannel?.value ?? {}, 'sourceAgeMs') ?? null;
  const connectionLive = robot.connectionState === 'live' && status.online;
  const powerAvailable = connectionLive && powerChannel != null && powerChannel.stale !== true;
  const batteryVoltage = powerAvailable
    ? firstNumber(power, 'voltageV', 'voltage_v') ?? null
    : null;
  const batteryCurrent = powerAvailable
    ? firstNumber(power, 'currentA', 'current_a') ?? null
    : null;
  const batteryPercentage = powerAvailable
    ? firstNumber(power, 'percentage') ?? null
    : null;
  const poseRate = topicRateLabel(robotStreamRate(streamHealth, POSE_CHANNEL));
  const speedRate = topicRateLabel(robotStreamRate(streamHealth, SPEED_CHANNEL));
  const velocityRate = topicRateLabel(robotStreamRate(streamHealth, VELOCITY_CHANNEL));
  const powerRate = topicRateLabel(powerAvailable
    ? robotStreamRate(streamHealth, POWER_CHANNEL)
    : 0);
  const locomotion = b2LocomotionLabel(locomotionValue);
  const headerStatusItems = listHeaderStatusItems({
    battery: {
      percentage: batteryPercentage,
      source: `${POWER_CHANNEL}.percentage`,
      stale: powerChannel?.stale,
    },
  }).map((item) => {
    if (item.kind === 'latency') {
      const stale = linkChannel?.stale === true;
      const activeAgeMs = linkChannel && !stale ? linkSourceAgeMs : null;
      return {
        kind: 'latency' as const,
        role: 'robot-network-indicator' as const,
        label: !linkChannel
          ? t('B2 forwarder link unavailable')
          : stale
            ? t('B2 forwarder link stale')
            : linkSourceAgeMs == null
              ? t('B2 forwarder link fresh')
              : t('B2 forwarder heartbeat age {age} ms',{ age:Math.round(linkSourceAgeMs) }),
        tone: stale ? 'danger' as const : 'neutral' as const,
        source: `${LINK_CHANNEL}.sourceAgeMs`,
        value: activeAgeMs,
        active: activeAgeMs != null,
      };
    }
    if (item.kind === 'position') {
      const stale = poseChannel?.stale === true;
      const available = Boolean(poseChannel);
      return {
        kind: 'position' as const,
        role: 'robot-position-indicator' as const,
        label: !available
          ? t('B2 odometry unavailable')
          : stale
            ? t('B2 odometry stale')
            : t('B2 odometry fresh'),
        tone: stale ? 'danger' as const : 'neutral' as const,
        source: POSE_CHANNEL,
        active: available && !stale,
      };
    }
    return item;
  });

  return <>
    <header>
      <div className="robot-card-identity" data-xgc-gap="sm">
        <strong>{robot.name}</strong>
        {showSimulationSourceMark && (
          <StatusText
            status="error"
            className="robot-instrument-source-badge"
            title={t('This Robot uses its authored simulation source when the Session selects the hybrid branch.')}
          >
            (sim)
          </StatusText>
        )}
        <div className="robot-list-ground-state" data-xgc-role="robot-list-b2-state" data-xgc-id={robot.id} data-xgc-gap="sm">
          <span className="robot-list-header-word robot-list-primary-state robot-list-ground-primary-state">{t(locomotion)}</span>
          <span className="robot-list-ground-secondary">
            <span className="robot-list-ground-meta" title={t('Unitree B2 quadruped')}>B2</span>
            {batteryVoltage != null && <>
              <i aria-hidden="true">·</i>
              <span className="robot-list-ground-meta" title={t('Battery voltage')}>
                {batteryVoltage.toFixed(1)} V
              </span>
            </>}
          </span>
        </div>
      </div>
      <RobotListHeaderStatus robotId={robot.id} items={headerStatusItems} />
    </header>
    <dl>
      <RobotListMetric
        robotId={robot.id}
        slot="odom-pos"
        className="robot-metric-position robot-metric-local-position"
        title={t('Odom pos')}
        unit="m"
        rate={poseRate}
      >
        <RobotListVectorValue value={position} />
      </RobotListMetric>
      <RobotListMetric
        robotId={robot.id}
        slot="odom-spd"
        title={t('Odom spd')}
        rate={speedRate}
        role="robot-b2-odom-speed"
        empty={speedValue == null}
      >
        <RobotListScalarValue value={speedValue} unit="m/s" />
      </RobotListMetric>
      <RobotListMetric
        robotId={robot.id}
        slot="battery-vol"
        title={t('Battery vol')}
        rate={powerRate}
        role="robot-b2-battery-voltage"
        empty={batteryVoltage == null}
      >
        <RobotListScalarValue value={batteryVoltage} unit="V" digits={1} />
      </RobotListMetric>
      <RobotListMetric
        robotId={robot.id}
        slot="battery-i"
        title={t('Battery I')}
        rate={powerRate}
        role="robot-b2-battery-current"
        empty={batteryCurrent == null}
      >
        <RobotListScalarValue value={batteryCurrent} unit="A" digits={1} />
      </RobotListMetric>
      <RobotListMetric
        robotId={robot.id}
        slot="yaw"
        title={t('Yaw')}
        rate={poseRate}
        role="robot-b2-yaw"
        empty={orientationYawDegrees(pose.orientation) == null}
      >
        <RobotListScalarValue value={orientationYawDegrees(pose.orientation)} unit="deg" />
      </RobotListMetric>
      <RobotListMetric
        robotId={robot.id}
        slot="yaw-rate"
        title={t('Yaw rate')}
        rate={velocityRate}
        role="robot-b2-yaw-rate"
        empty={yawRate == null}
      >
        <RobotListScalarValue value={yawRate} unit="rad/s" />
      </RobotListMetric>
      <RobotListMetric robotId={robot.id} slot="mode" className="robot-metric-health" title={t('Mode')} rate="--">
        <span className="robot-list-ground-primary-state">{t(locomotion)}</span>
      </RobotListMetric>
    </dl>
  </>;
}
