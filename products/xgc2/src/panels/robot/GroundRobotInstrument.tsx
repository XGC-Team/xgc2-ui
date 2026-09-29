import { memo } from 'react';
import { useRobotText } from '../../domains/robot/robotPublic';
import {
  GROUND_COMMAND_CHANNEL_ID,
  GROUND_IMU_AGE_SOURCE,
  GROUND_IMU_CHANNEL_ID,
  GROUND_POSE_CHANNEL_ID,
  GROUND_POWER_CHANNEL_ID,
  groundRobotInstrumentReadout,
  scoutChassisModeTone,
  type GroundRobotInstrumentTelemetry,
} from './groundInstrumentModel';
import { GROUND_FREQUENCY_ALARM_HZ } from './frequencyAlarm';
import { InstrumentFrequencyRow } from './InstrumentFrequencyRow';
import {
  InstrumentCenterMark,
  InstrumentCompassDirection,
  InstrumentCompassTicks,
  InstrumentMetricRuler,
  InstrumentPitchMarks,
  InstrumentRollScale,
} from './InstrumentHudMarks';
import { RobotInstrumentStatusGlyph } from './RobotInstrumentStatus';
import {
  adapterPositioningStatus,
  imuAgeCommunicationStatus,
  listHeaderStatusItems,
} from './RobotListHeaderStatusModel';
import { RobotInstrumentIdentity } from './RobotInstrumentIdentity';
import { unsignedZeroFixed } from './robotTelemetryValues';

export function GroundRobotInstrument({
  robotId,
  name,
  telemetry,
  embedded = false,
  chassisChrome = 'scout',
}: {
  robotId: string;
  name: string;
  kindLabel?: string;
  telemetry: GroundRobotInstrumentTelemetry;
  embedded?: boolean;
  /** Scout shows RC/CMD/UART from chassis_state. Mecanum has no chassis_state. */
  chassisChrome?: 'scout' | 'none';
}) {
  const t = useRobotText();
  const value = groundRobotInstrumentReadout(telemetry);
  const scoutChassis = chassisChrome === 'scout';
  const holonomic = chassisChrome === 'none';
  const roll = value.roll ?? 0;
  const pitch = value.pitch ?? 0;
  const yaw = value.heading ?? 0;
  const rollRadians = roll * Math.PI / 180;
  const deltaHeight = 75 * Math.tan(rollRadians);
  const pitchOffset = pitch * 0.8 / Math.max(Math.cos(rollRadians),0.2);
  const left = 75 - deltaHeight - pitchOffset;
  const right = 75 + deltaHeight - pitchOffset;
  const headerItems = listHeaderStatusItems({
    connection: value.connectionPresentation,
    communication: imuAgeCommunicationStatus(
      { sourceAgeMs: value.imuAgeMs,stale: value.imuStale },
      GROUND_IMU_AGE_SOURCE,
    ),
    battery: {
      percentage: value.battery,
      estimated: true,
      voltageV: value.batteryVoltage,
      source: 'state.power.voltageV+percentageState+percentage',
      stale: value.powerStale,
    },
    position: adapterPositioningStatus(telemetry.health),
    // Ground HUD header matches UAV: communication / positioning / battery only.
    // Scout chassis mode lives on the status pedestal, not as a fourth glyph.
  }, t);
  const frequencyRows = [
    ['IMU','IMU',GROUND_IMU_CHANNEL_ID,value.frequencies.imu,GROUND_FREQUENCY_ALARM_HZ['state.imu']] as const,
    ['VRP','RAW POS',GROUND_POSE_CHANNEL_ID,value.frequencies.position,GROUND_FREQUENCY_ALARM_HZ['vrpn.position']] as const,
    ['CMD','CMD',GROUND_COMMAND_CHANNEL_ID,value.frequencies.command] as const,
    ['BAT','BAT',GROUND_POWER_CHANNEL_ID,value.frequencies.power] as const,
  ];
  const pedestalKind = scoutChassis ? 'chassis' : 'controller';
  const pedestalMode = value.hasChassisContract ? value.controlMode : '--';
  const pedestalTone = value.hasChassisContract
    ? scoutChassisModeTone(telemetry.chassis)
    : 'normal';
  const voltageLabel = value.batteryVoltage == null ? '-- V' : `${value.batteryVoltage.toFixed(1)} V`;
  const currentSuffix = value.batteryCurrent == null ? '' : ` · ${value.batteryCurrent.toFixed(1)} A`;
  return (
    <div
      className="robot-flight-instrument"
      data-xgc-role="robot-ground-instrument"
      data-xgc-embedded={embedded ? 'true' : undefined}
      data-xgc-id={robotId}
      data-xgc-health={telemetry.healthTone}
      data-xgc-connection={value.connectionPresentation}
      data-xgc-attitude={value.heading == null ? 'unknown' : 'measured'}
      data-xgc-chassis={chassisChrome}
      data-xgc-pedestal={pedestalKind}
      data-heading={value.heading == null ? undefined : value.heading.toFixed(2)}
      data-roll={value.roll == null ? undefined : value.roll.toFixed(2)}
      data-pitch={value.pitch == null ? undefined : value.pitch.toFixed(2)}
      data-yaw={value.heading == null ? undefined : value.heading.toFixed(2)}
      data-linear-speed={value.linearSpeed == null ? undefined : value.linearSpeed.toFixed(2)}
      aria-label={t('{name} ground robot instrument',{ name })}
    >
      <div className="robot-flight-instrument-header">
        <RobotInstrumentIdentity
          robotId={robotId}
          name={name}
          className="robot-ground-identity"
          title={name}
        />
        <div
          className="robot-ground-header-status robot-instrument-status-icons"
          data-xgc-role="robot-instrument-status"
          data-xgc-id={robotId}
          aria-label={t('Robot instrument status')}
        >
          {headerItems.map((item) => (
            <RobotInstrumentStatusGlyph
              key={item.kind}
              robotId={robotId}
              kind={item.kind}
              role={item.role}
              label={item.label}
              tone={item.tone}
              source={item.source}
              value={item.value}
              estimated={item.estimated}
              active={item.active}
            />
          ))}
        </div>
      </div>

      <div
        className="robot-flight-instrument-attitude"
        data-xgc-role="robot-ground-hud"
        data-xgc-id={robotId}
      >
        <div className="robot-flight-sky" style={{ clipPath: `polygon(0% 0%, 100% 0%, 100% ${(right / 150) * 100 + 0.35}%, 0% ${(left / 150) * 100 + 0.35}%)` }} />
        <div className="robot-flight-ground" style={{ clipPath: `polygon(0% ${(left / 150) * 100 - 0.35}%, 100% ${(right / 150) * 100 - 0.35}%, 100% 100%, 0% 100%)` }} />
        <svg className="robot-flight-pitch-ladder" viewBox="0 0 150 150" style={{ transform: `translate(-50%, -50%) translateY(${-pitchOffset}px) rotate(${roll}deg)` }}>
          <InstrumentPitchMarks robotId={robotId} />
        </svg>
        <InstrumentCenterMark />
        <div className="robot-flight-roll-indicator">
          <InstrumentRollScale />
          <span className="robot-flight-roll-arrow" style={{ transform: `rotate(${roll}deg)` }} />
        </div>
      </div>

      <InstrumentMetricRuler
        robotId={robotId}
        side="left"
        value={fixedValue(value.linearSpeed,1)}
        unit="m/s"
        title={t('VRPN twist linear speed (2-norm)')}
        source="vrpn.velocity.linear"
      />
      <InstrumentMetricRuler
        robotId={robotId}
        side="right"
        value={fixedValue(value.z,1)}
        unit="m"
        title={t('VRPN height')}
        source="vrpn.position.position.z"
      />

      <div
        className="robot-flight-bottom-status"
        data-xgc-columns={scoutChassis ? '2' : '1'}
      >
        {scoutChassis && (
          <span
            data-xgc-role="robot-ground-chassis-mode"
            data-xgc-id={robotId}
            data-xgc-tone={pedestalTone}
            title={t('Chassis control mode')}
          >{pedestalMode}</span>
        )}
        <span
          data-xgc-role="robot-controller-state"
          data-xgc-id={robotId}
          data-xgc-tone="normal"
          title={t('Controller state')}
        >{value.controllerStatus}</span>
      </div>

      <div className="robot-flight-bottom-panel">
        <div className="robot-flight-frequency-list">
          {frequencyRows.map(([compactLabel,fullLabel,channelId,rate,alarmHz]) => {
            const imuRow = channelId === GROUND_IMU_CHANNEL_ID;
            const batRow = channelId === GROUND_POWER_CHANNEL_ID;
            return <InstrumentFrequencyRow
              key={channelId}
              robotId={robotId}
              channelId={channelId}
              compactLabel={compactLabel}
              fullLabel={fullLabel}
              rate={rate}
              alarmHz={alarmHz}
              role={imuRow ? 'robot-ground-imu' : 'robot-flight-frequency'}
              source={imuRow ? GROUND_IMU_AGE_SOURCE : channelId}
              valueRole={
                imuRow ? 'robot-ground-imu-rate' : batRow ? 'robot-ground-power-rate' : undefined
              }
              valueId={imuRow || batRow ? robotId : undefined}
            />;
          })}
        </div>
        <div className="robot-flight-status-list">
          <InstrumentStatus
            robotId={robotId}
            role="robot-ground-instrument-command-linear"
            label="Vx"
            value={commandValue(value.commandLinear, 1, 'm/s')}
            title={t('Command linear velocity X')}
          />
          {holonomic && (
            <InstrumentStatus
              robotId={robotId}
              role="robot-ground-instrument-command-lateral"
              label="Vy"
              value={commandValue(value.commandLinearY, 1, 'm/s')}
              title={t('Command linear velocity Y')}
            />
          )}
          <InstrumentStatus
            robotId={robotId}
            role="robot-ground-instrument-command-angular"
            label="ω"
            value={commandValue(value.commandAngular, 1, 'rad/s')}
            title={t('Command angular velocity Z')}
          />
          <InstrumentStatus
            robotId={robotId}
            role="robot-ground-power"
            label="VOLT"
            value={voltageLabel}
            title={`${t('Battery voltage')}: ${voltageLabel}${currentSuffix}`}
            voltageV={value.batteryVoltage}
            currentA={value.batteryCurrent}
          />
        </div>
      </div>

      <div
        className="robot-flight-yaw-compass"
        data-xgc-role="robot-ground-yaw-compass"
        data-xgc-id={robotId}
        data-xgc-empty={value.heading == null ? 'true' : undefined}
      >
        <div className="robot-flight-compass-bg" />
        <div className="robot-flight-compass-dial" style={{ transform: `rotate(${-yaw}deg)` }}>
          {(['N','E','S','W'] as const).map((label) => <InstrumentCompassDirection key={label} label={label} yaw={yaw} />)}
          <InstrumentCompassTicks />
        </div>
        <span className="robot-flight-heading-triangle" />
        <strong data-xgc-role="robot-ground-heading" data-xgc-id={robotId} data-xgc-tone="normal">
          {value.heading == null ? '--' : `${Math.round(value.heading)}°`}
        </strong>
      </div>
    </div>
  );
}

const InstrumentStatus = memo(function InstrumentStatus({ robotId,role,label,value,title,voltageV,currentA,tone }: {
  robotId: string;
  role: string;
  label: string;
  value: string;
  title?: string;
  voltageV?: number | null;
  currentA?: number | null;
  tone?: 'danger' | 'success' | 'normal';
}) {
  const { sign, body } = splitSignedStatusValue(value);
  return (
    <span
      data-xgc-role={role}
      data-xgc-id={robotId}
      data-xgc-voltage-v={voltageV == null ? undefined : voltageV}
      data-xgc-current-a={currentA == null ? undefined : currentA}
      title={title}
    >
      <small>{label}</small>
      <strong className="robot-flight-status-value" data-xgc-tone={tone ?? 'normal'}>
        {sign ? <span className="robot-flight-status-sign" data-xgc-sign={sign === '-' ? 'minus' : 'plus'}>{sign}</span> : null}{body}
      </strong>
    </span>
  );
});

function fixedValue(value: number | null,digits: number) {
  return value == null ? '--' : unsignedZeroFixed(value, digits);
}

function signedFixed(value: number, digits: number) {
  const formatted = value.toFixed(digits);
  return formatted.startsWith('-') ? formatted : `+${formatted}`;
}

function commandValue(value: number | null, digits: number, unit: string) {
  return value == null ? `-- ${unit}` : `${signedFixed(value, digits)} ${unit}`;
}

/** Placeholder `--` is not a minus. Leading `+`/`-` before a digit share a 1ch slot. */
function splitSignedStatusValue(value: string): { sign: '+' | '-' | ''; body: string } {
  if (value.startsWith('--') || (!value.startsWith('+') && !value.startsWith('-'))) {
    return { sign: '', body: value };
  }
  return { sign: value[0] as '+' | '-', body: value.slice(1) };
}
