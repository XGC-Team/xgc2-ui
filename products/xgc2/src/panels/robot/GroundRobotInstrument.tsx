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
import { RobotInstrumentStatusGlyph } from './RobotInstrumentStatus';
import {
  adapterPositioningStatus,
  imuAgeCommunicationStatus,
  listHeaderStatusItems,
} from './RobotListHeaderStatusModel';
import { unsignedZeroFixed } from './robotTelemetryValues';

const pitchMarks = [-30,-20,-10,0,10,20,30] as const;
const compassTicks = [15,30,45,60,75,105,120,135,150,165,195,210,225,240,255,285,300,315,330,345];

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
    communication: imuAgeCommunicationStatus(
      { sourceAgeMs: value.imuAgeMs,stale: value.imuStale },
      GROUND_IMU_AGE_SOURCE,
    ),
    battery: {
      percentage: value.battery,
      voltageV: value.batteryVoltage,
      source: 'state.power.voltageV+percentageState+percentage',
      stale: value.powerStale,
    },
    position: adapterPositioningStatus(telemetry.health),
    idle: telemetry.healthTone === 'idle',
    // Ground HUD header matches UAV: communication / positioning / battery only.
    // Scout chassis mode lives on the status pedestal, not as a fourth glyph.
  }, t);
  const frequencyRows = [
    ['IMU','IMU',GROUND_IMU_CHANNEL_ID,value.frequencies.imu,GROUND_FREQUENCY_ALARM_HZ['state.imu']] as const,
    ['VRP','RAW POS',GROUND_POSE_CHANNEL_ID,value.frequencies.position,GROUND_FREQUENCY_ALARM_HZ['vrpn.position']] as const,
    ['CMD','CMD',GROUND_COMMAND_CHANNEL_ID,value.frequencies.command] as const,
    ['BAT','BAT',GROUND_POWER_CHANNEL_ID,value.frequencies.power] as const,
  ];
  const showPedestal = scoutChassis;
  const pedestalMode = value.hasChassisContract ? value.controlMode : '--';
  const pedestalTone = scoutChassisModeTone(telemetry.chassis);
  const voltageLabel = value.batteryVoltage == null ? '-- V' : `${value.batteryVoltage.toFixed(1)} V`;
  const currentSuffix = value.batteryCurrent == null ? '' : ` · ${value.batteryCurrent.toFixed(1)} A`;
  return (
    <div
      className="robot-flight-instrument"
      data-xgc-role="robot-ground-instrument"
      data-xgc-embedded={embedded ? 'true' : undefined}
      data-xgc-id={robotId}
      data-xgc-health={telemetry.healthTone}
      data-xgc-connection={value.online ? 'online' : 'offline'}
      data-xgc-chassis={chassisChrome}
      data-xgc-pedestal={showPedestal ? 'chassis' : 'none'}
      data-heading={value.heading == null ? undefined : value.heading.toFixed(2)}
      data-roll={value.roll == null ? undefined : value.roll.toFixed(2)}
      data-pitch={value.pitch == null ? undefined : value.pitch.toFixed(2)}
      data-yaw={value.heading == null ? undefined : value.heading.toFixed(2)}
      data-linear-speed={value.linearSpeed == null ? undefined : value.linearSpeed.toFixed(2)}
      aria-label={t('{name} ground robot instrument',{ name })}
    >
      <div className="robot-flight-instrument-header">
        <strong className="robot-ground-identity" title={name}>{name}</strong>
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
          {pitchMarks.map((angle) => {
            const yMark = 75 + angle * 0.8;
            const zero = angle === 0;
            return (
              <g
                key={angle}
                className="robot-flight-pitch-mark"
                data-xgc-role="robot-flight-pitch-mark"
                data-xgc-id={`${robotId}:${angle}`}
                data-xgc-region={angle > 0 ? 'sky' : zero ? 'horizon' : 'ground'}
                transform={`translate(0 ${yMark})`}
              >
                {!zero && <text x="62" y="2" textAnchor="end">{Math.abs(angle)}</text>}
                <line x1={zero ? 55 : 65} x2="85" y1="0" y2="0" />
                {zero && <line x1="85" x2="95" y1="0" y2="0" />}
                {!zero && <text x="88" y="2" textAnchor="start">{Math.abs(angle)}</text>}
                <rect className="robot-flight-pitch-mark-hit" x="50" y="-8" width="50" height="16" />
              </g>
            );
          })}
        </svg>
        <svg className="robot-flight-center-mark" width="44" height="8" viewBox="0 0 44 8">
          <line x1="7" y1="4" x2="15" y2="4" />
          <circle cx="22" cy="4" r="2" />
          <line x1="29" y1="4" x2="37" y2="4" />
        </svg>
        <div className="robot-flight-roll-indicator">
          <svg className="robot-flight-roll-arc" width="100" height="100" viewBox="0 0 100 100">
            <path d="M 28 11.9 A 44 44 0 0 1 72 11.9" fill="none" stroke="white" strokeWidth="1.2" opacity="0.8" />
          </svg>
          {pitchMarks.map((angle) => <span
            key={angle}
            className="robot-flight-roll-tick"
            data-xgc-emphasis={angle % 30 === 0 ? 'major' : 'minor'}
            style={{ transform: `rotate(${angle}deg)` }}
          />)}
          <span className="robot-flight-roll-arrow" style={{ transform: `rotate(${roll}deg)` }} />
        </div>
      </div>

      <MetricRuler
        robotId={robotId}
        side="left"
        value={fixedValue(value.linearSpeed,1)}
        unit="m/s"
        title={t('VRPN twist linear speed (2-norm)')}
        source="vrpn.velocity.linear"
      />
      <MetricRuler
        robotId={robotId}
        side="right"
        value={fixedValue(value.z,1)}
        unit="m"
        title={t('VRPN height')}
        source="vrpn.position.position.z"
      />

      {showPedestal && (
        <div
          className="robot-flight-bottom-status"
          data-xgc-role="robot-ground-chassis-mode"
          data-xgc-id={robotId}
          data-xgc-columns="1"
        >
          <span data-xgc-tone={pedestalTone} title={t('Chassis control mode')}>{pedestalMode}</span>
        </div>
      )}

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
          {(['N','E','S','W'] as const).map((label) => <Direction key={label} label={label} yaw={yaw} />)}
          {compassTicks.map((angle) => <span
            key={angle}
            className="robot-flight-compass-tick"
            data-xgc-emphasis={angle % 45 === 0 ? 'major' : 'minor'}
            style={{ transform: `rotate(${angle}deg)` }}
          />)}
        </div>
        <span className="robot-flight-heading-triangle" />
        <strong data-xgc-role="robot-ground-heading" data-xgc-id={robotId} data-xgc-tone="normal">
          {value.heading == null ? '--' : `${Math.round(value.heading)}°`}
        </strong>
      </div>
    </div>
  );
}

function InstrumentStatus({ robotId,role,label,value,title,voltageV,currentA,tone }: {
  robotId: string;
  role: string;
  label: string;
  value: string;
  title?: string;
  voltageV?: number | null;
  currentA?: number | null;
  tone?: 'danger' | 'success' | 'normal';
}) {
  return (
    <span
      data-xgc-role={role}
      data-xgc-id={robotId}
      data-xgc-voltage-v={voltageV == null ? undefined : voltageV}
      data-xgc-current-a={currentA == null ? undefined : currentA}
      title={title}
    >
      <small>{label}</small>
      <strong className="robot-flight-status-value" data-xgc-tone={tone ?? 'normal'}>{value}</strong>
    </span>
  );
}

function MetricRuler({ robotId,side,value,unit,title,source }: {
  robotId: string;
  side: 'left' | 'right';
  value: string;
  unit: string;
  title?: string;
  source?: string;
}) {
  return (
    <div
      className="robot-flight-metric-ruler"
      data-xgc-role="robot-flight-metric-ruler"
      data-xgc-id={`${robotId}:${side}`}
      data-xgc-side={side}
      data-xgc-source={source}
      data-xgc-tone="normal"
      title={title}
    >
      <span><strong>{value}</strong><small>{unit}</small></span>
    </div>
  );
}

function Direction({ label,yaw }: { label: 'N' | 'E' | 'S' | 'W';yaw: number }) {
  return <span className="robot-flight-direction" data-xgc-direction={label.toLowerCase()}><b style={{ transform: `rotate(${yaw}deg)` }}>{label}</b></span>;
}

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
