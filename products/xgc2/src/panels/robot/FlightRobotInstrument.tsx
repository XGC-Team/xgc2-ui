import { useRobotText } from '../../domains/robot/robotPublic';
import {
  FCU_ROUND_TRIP_ALARM_MS,
  flightArmedTone,
  flightModeTone,
  flightRobotInstrumentReadout,
  roundTripTimeTone,
  type FlightRobotInstrumentTelemetry,
} from './flightInstrumentModel';
import {
  FLIGHT_FS150_FREQUENCY_ALARM_HZ,
  FLIGHT_MOCAP_ROTOR_FREQUENCY_ALARM_HZ,
  formatFrequencyRateLabel,
  frequencyValueTone,
} from './frequencyAlarm';
import { InstrumentFrequencyRow } from './InstrumentFrequencyRow';
import { RobotInstrumentStatusGlyph } from './RobotInstrumentStatus';
import {
  adapterPositioningStatus,
  listHeaderStatusItems,
  px4CommunicationStatus,
  VRPN_LOCAL_POSITION_ERROR_ALARM_CM,
  vrpnLocalPositionErrorTone,
} from './RobotListHeaderStatusModel';
import { unsignedZeroFixed } from './robotTelemetryValues';

const pitchMarks = [-30,-20,-10,0,10,20,30] as const;
const compassTicks = [15,30,45,60,75,105,120,135,150,165,195,210,225,240,255,285,300,315,330,345];

export function FlightRobotInstrument({ robotId,name,telemetry,embedded = false }: {
  robotId: string;
  name: string;
  telemetry: FlightRobotInstrumentTelemetry;
  embedded?: boolean;
}) {
  const t = useRobotText();
  const value = flightRobotInstrumentReadout(telemetry);
  const rollRadians = value.roll * Math.PI / 180;
  const deltaHeight = 75 * Math.tan(rollRadians);
  const pitchOffset = value.pitch * 0.8 / Math.max(Math.cos(rollRadians),0.2);
  const left = 75 - deltaHeight - pitchOffset;
  const right = 75 + deltaHeight - pitchOffset;
  const headerItems = listHeaderStatusItems({
    communication: px4CommunicationStatus({
      roundTripTimeMs: value.roundTripTimeMs,
      connected: value.connected,
    }),
    battery: {
      percentage: value.battery,
      voltageV: value.batteryVoltage,
      source: 'state.power.voltageV+percentageState+percentage',
    },
    position: adapterPositioningStatus(telemetry.health),
    idle: value.healthTone === 'idle',
  }, t);
  const frequencyRows = value.presentation === 'mocap_rotor'
    ? [
      ['POS','POSE','state.pose',value.frequencies.localPosition,FLIGHT_MOCAP_ROTOR_FREQUENCY_ALARM_HZ['state.pose']] as const,
      ['VEL','VEL','state.velocity',value.frequencies.mocapVelocity,FLIGHT_MOCAP_ROTOR_FREQUENCY_ALARM_HZ['state.velocity']] as const,
      ['IMU','IMU','state.imu',value.frequencies.imu,FLIGHT_MOCAP_ROTOR_FREQUENCY_ALARM_HZ['state.imu']] as const,
      ['PWR','PWR','state.power',value.frequencies.power] as const,
    ]
    : [
      ['IMU','IMU','state.imu',value.frequencies.imu,FLIGHT_FS150_FREQUENCY_ALARM_HZ['state.imu']] as const,
      ['SP','SP RAW','setpoint.local',value.frequencies.localSetpoint] as const,
      ['VRP','RAW POS','state.mocap.pose',value.frequencies.mocapPosition,FLIGHT_FS150_FREQUENCY_ALARM_HZ['state.mocap.pose']] as const,
      ['LP','LOCAL POS','state.pose',value.frequencies.localPosition,FLIGHT_FS150_FREQUENCY_ALARM_HZ['state.pose']] as const,
    ];
  const armedStatus = armedLabel(value.armed);
  const mocapRotor = value.presentation === 'mocap_rotor';
  const speedSource = mocapRotor ? 'state.velocity.linear' : 'state.mocap.velocity.linear';
  const heightSource = mocapRotor ? 'state.pose.position.z' : 'state.mocap.pose.position.z';
  return (
    <div
      className="robot-flight-instrument"
      data-xgc-role="robot-flight-instrument"
      data-xgc-id={robotId}
      data-xgc-embedded={embedded ? 'true' : undefined}
      data-xgc-health={value.healthTone}
      data-xgc-connection={value.online ? 'online' : 'offline'}
      data-roll={value.roll.toFixed(2)}
      data-pitch={value.pitch.toFixed(2)}
      data-yaw={value.yaw.toFixed(2)}
      aria-label={t('{name} flight instrument',{ name })}
    >
      <div className="robot-flight-instrument-header">
        <strong>{name}</strong>
        <div
          className="robot-instrument-status-icons"
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

      <div className="robot-flight-instrument-attitude" data-xgc-role="robot-flight-hud" data-xgc-id={robotId}>
        <div className="robot-flight-sky" style={{ clipPath: `polygon(0% 0%, 100% 0%, 100% ${(right / 150) * 100 + 0.35}%, 0% ${(left / 150) * 100 + 0.35}%)` }} />
        <div className="robot-flight-ground" style={{ clipPath: `polygon(0% ${(left / 150) * 100 - 0.35}%, 100% ${(right / 150) * 100 - 0.35}%, 100% 100%, 0% 100%)` }} />
        <svg className="robot-flight-pitch-ladder" viewBox="0 0 150 150" style={{ transform: `translate(-50%, -50%) translateY(${-pitchOffset}px) rotate(${value.roll}deg)` }}>
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
          <span className="robot-flight-roll-arrow" style={{ transform: `rotate(${value.roll}deg)` }} />
        </div>
      </div>

      <MetricRuler
        robotId={robotId}
        side="left"
        value={fixedValue(value.speed,1)}
        unit="m/s"
        title={t('VRPN twist linear speed (2-norm)')}
        source={speedSource}
      />
      <MetricRuler
        robotId={robotId}
        side="right"
        value={fixedValue(value.altitude,1)}
        unit="m"
        title={t('VRPN height')}
        source={heightSource}
      />

      <div className="robot-flight-bottom-status" data-xgc-columns="3">
        <span data-xgc-role="robot-flight-mode" data-xgc-id={robotId} data-xgc-tone={flightModeTone(value.mode)} title={value.mode}>{value.mode}</span>
        <span
          data-xgc-role="robot-flight-stage"
          data-xgc-id={robotId}
          data-xgc-tone="normal"
          title={t('Flight stage: {stage}',{ stage:value.flightStage })}
        >{compactFlightStage(value.flightStage)}</span>
        <span data-xgc-role="robot-flight-armed" data-xgc-id={robotId} data-xgc-tone={flightArmedTone(value.armed)} title={armedStatus}>{armedStatus}</span>
      </div>

      <div className="robot-flight-bottom-panel">
        <div className="robot-flight-frequency-list">
          {frequencyRows.map(([compactLabel,fullLabel,channelId,rate,alarmHz]) => (
            <InstrumentFrequencyRow
              key={channelId}
              robotId={robotId}
              channelId={channelId}
              compactLabel={compactLabel}
              fullLabel={fullLabel}
              rate={rate}
              alarmHz={alarmHz}
            />
          ))}
        </div>
        <div className="robot-flight-hud-center">
          <div
            data-xgc-role="robot-flight-climb"
            data-xgc-id={robotId}
            data-xgc-tone="normal"
            title={t('Local vertical velocity')}
          >
            {value.climb != null && Math.abs(value.climb) >= 0.1 && <b className="robot-flight-climb-direction"
              data-xgc-direction={value.climb >= 0 ? 'up' : 'down'}>{value.climb >= 0 ? '↑' : '↓'}</b>}
            {absoluteFixedValue(value.climb,1)}<small> m/s</small>
          </div>
        </div>
        <div className="robot-flight-status-list">
          {mocapRotor ? <>
            <InstrumentStatus
              robotId={robotId}
              role="robot-flight-link"
              label="LNK"
              value={value.linkReady ? 'OK' : '--'}
              title={t(value.linkReady ? 'Onboard Zenoh telemetry link ready' : 'Onboard Zenoh telemetry link unavailable')}
            />
            <InstrumentStatus
              robotId={robotId}
              role="robot-flight-positioning"
              label="POS"
              value={value.positioning ? 'OK' : '--'}
              title={t(value.positioning ? 'Local pose fresh' : 'Local pose unavailable or stale')}
            />
            <InstrumentStatus
              robotId={robotId}
              role="robot-flight-battery-voltage"
              label="VOLT"
              value={value.batteryVoltage == null ? '-- V' : `${value.batteryVoltage.toFixed(1)} V`}
              title={`${t('Battery voltage')}: ${value.batteryVoltage == null ? '--' : `${value.batteryVoltage.toFixed(1)} V`}`}
            />
          </> : <>
            <InstrumentStatus
              robotId={robotId}
              role="robot-flight-vision-pose"
              id={`${robotId}:state.vision.pose`}
              label="VIS"
              value={formatFrequencyRateLabel(value.frequencies.visionPose)}
              title={t('{channel} {rate}; alarm below {alarm} Hz', {
                channel: 'VIS',
                rate: formatFrequencyRateLabel(value.frequencies.visionPose),
                alarm: FLIGHT_FS150_FREQUENCY_ALARM_HZ['state.vision.pose'],
              })}
              tone={frequencyValueTone(
                value.frequencies.visionPose,
                'state.vision.pose',
                FLIGHT_FS150_FREQUENCY_ALARM_HZ['state.vision.pose'],
              )}
              alarmHz={FLIGHT_FS150_FREQUENCY_ALARM_HZ['state.vision.pose']}
            />
            <InstrumentStatus
              robotId={robotId}
              role="robot-flight-position-error"
              label="ERR"
              value={value.positionErrorCm == null ? '-- cm' : `${Math.min(99.9,value.positionErrorCm).toFixed(1)} cm`}
              title={value.positionErrorCm == null
                ? t('VRPN–local position error')
                : t('Position error {error} cm; alarm above {alarm} cm',{
                  error:value.positionErrorCm.toFixed(1),
                  alarm:VRPN_LOCAL_POSITION_ERROR_ALARM_CM,
                })}
              tone={vrpnLocalPositionErrorTone(value.positionErrorCm)}
              alarmCm={VRPN_LOCAL_POSITION_ERROR_ALARM_CM}
            />
            <InstrumentStatus
              robotId={robotId}
              role="robot-flight-round-trip-time"
              label="RTT"
              value={`${compactRoundTripTime(value.roundTripTimeMs)} ms`}
              title={value.roundTripTimeMs == null
                ? t('FCU round-trip time unavailable')
                : t('FCU round-trip time {latency} ms; alarm above {alarm} ms',{
                  latency:value.roundTripTimeMs.toFixed(1),
                  alarm:FCU_ROUND_TRIP_ALARM_MS,
                })}
              tone={roundTripTimeTone(value.roundTripTimeMs)}
              alarmMs={FCU_ROUND_TRIP_ALARM_MS}
            />
            <InstrumentStatus
              robotId={robotId}
              role="robot-flight-battery-voltage"
              label="VOLT"
              value={value.batteryVoltage == null ? '-- V' : `${value.batteryVoltage.toFixed(1)} V`}
              title={`${t('Battery voltage')}: ${value.batteryVoltage == null ? '--' : `${value.batteryVoltage.toFixed(1)} V`}`}
            />
          </>}
        </div>
      </div>

      <div className="robot-flight-yaw-compass" data-xgc-role="robot-flight-yaw-compass" data-xgc-id={robotId}>
        <div className="robot-flight-compass-bg" />
        <div className="robot-flight-compass-dial" style={{ transform: `rotate(${-value.yaw}deg)` }}>
          {(['N','E','S','W'] as const).map((label) => <Direction key={label} label={label} yaw={value.yaw} />)}
          {compassTicks.map((angle) => <span
            key={angle}
            className="robot-flight-compass-tick"
            data-xgc-emphasis={angle % 45 === 0 ? 'major' : 'minor'}
            style={{ transform: `rotate(${angle}deg)` }}
          />)}
        </div>
        <span className="robot-flight-heading-triangle" />
        <strong data-xgc-role="robot-flight-heading" data-xgc-id={robotId} data-xgc-tone="normal">{Math.round(value.yaw)}°</strong>
      </div>
    </div>
  );
}

function InstrumentStatus({ robotId,role,label,value,title,id,tone,alarmHz,alarmMs,alarmCm }: {
  robotId: string;
  role: string;
  label: string;
  value: string;
  title?: string;
  id?: string;
  tone?: 'danger' | 'success' | 'normal';
  alarmHz?: number;
  alarmMs?: number;
  alarmCm?: number;
}) {
  return (
    <span
      data-xgc-role={role}
      data-xgc-id={id ?? robotId}
      data-xgc-alarm-hz={alarmHz == null ? undefined : String(alarmHz)}
      data-xgc-alarm-ms={alarmMs == null ? undefined : String(alarmMs)}
      data-xgc-alarm-cm={alarmCm == null ? undefined : String(alarmCm)}
      title={title}
    >
      <small>{label}</small>
      <strong className="robot-flight-status-value" data-xgc-tone={tone ?? 'normal'}>{value}</strong>
    </span>
  );
}

function armedLabel(armed: boolean | null) {
  if (armed == null) return '--';
  return armed ? 'ARMED' : 'DISARMED';
}

/** Instrument-only codes; list chrome keeps full flightStageLabel words. */
function compactFlightStage(stage: string) {
  switch (stage) {
    case 'GROUND': return 'GND';
    case 'AIRBORNE': return 'AIR';
    case 'TAKEOFF': return 'TO';
    case 'LANDING': return 'LND';
    default: return '--';
  }
}

function compactRoundTripTime(value: number | null) {
  return value == null ? '--' : String(Math.min(999,Math.round(value)));
}

function fixedValue(value: number | null,digits: number) {
  return value == null ? '--' : unsignedZeroFixed(value, digits);
}

function absoluteFixedValue(value: number | null,digits: number) {
  return value == null ? '--' : Math.abs(value).toFixed(digits);
}

function Direction({ label,yaw }: { label: 'N' | 'E' | 'S' | 'W';yaw: number }) {
  return <span className="robot-flight-direction" data-xgc-direction={label.toLowerCase()}><b style={{ transform: `rotate(${yaw}deg)` }}>{label}</b></span>;
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
