/**
 * Unitree B2 quadruped instrument face (single / double board views).
 * Dog-specific chrome: SOC/V/A, locomotion mode, heading, planar speed, joints age.
 */

import { b2RobotInstrumentReadout, type B2RobotInstrumentTelemetry } from './instrumentModel';
import {
  BatteryGlyph,
  RobotCommunicationStatusIcon,
} from '../../../../panels/robot/RobotInstrumentStatus';
import { StatusText } from '@xgc2/ui-react';
import { useRobotText } from '../../robotPublic';

export function UnitreeB2RobotInstrument({
  robotId,
  name,
  telemetry,
  embedded = false,
}: {
  robotId: string;
  name: string;
  telemetry: B2RobotInstrumentTelemetry;
  embedded?: boolean;
}) {
  const t = useRobotText();
  const value = b2RobotInstrumentReadout(telemetry);
  const percentageLabel = value.battery == null ? '--' : `${Math.round(value.battery)}%`;
  const voltageLabel = value.batteryVoltage == null ? '--.- V' : `${value.batteryVoltage.toFixed(1)} V`;
  const currentLabel = value.batteryCurrent == null
    ? '--.- A'
    : `${value.batteryCurrent >= 0 ? '+' : ''}${value.batteryCurrent.toFixed(1)} A`;
  const powerLabel = `${percentageLabel} · ${voltageLabel}`;
  const linkLabel = value.roundTripTimeMs == null
    ? t(value.link)
    : `${t(value.link)} · ${value.roundTripTimeMs.toFixed(1)} ms`;
  const motionLabel = telemetry.locomotionStale
    ? t('LOCOMOTION STALE')
    : value.commandStale
    ? t('{mode} · CMD STALE',{ mode:value.locomotionMode })
    : value.motionEnabled == null
    ? t(value.locomotionMode)
    : value.motionEnabled
      ? t('{mode} · MOTION',{ mode:value.locomotionMode })
      : t('{mode} · HOLD',{ mode:value.locomotionMode });
  const jointsLabel = value.jointCount == null
    ? value.jointsStale ? t('JOINTS STALE') : t('JOINTS --')
    : value.jointsStale
      ? t('{count}j STALE',{ count:value.jointCount })
      : t('{count} joints',{ count:value.jointCount });

  return (
    <div
      className="robot-b2-instrument"
      data-xgc-role="robot-b2-instrument"
      data-xgc-embedded={embedded ? 'true' : undefined}
      data-xgc-id={robotId}
      data-xgc-health={telemetry.healthTone}
      data-xgc-connection={value.online ? 'online' : 'offline'}
      data-xgc-stream-state={value.streamState}
      data-xgc-command-stale={value.commandStale ? 'true' : undefined}
      data-heading={value.heading == null ? undefined : value.heading.toFixed(2)}
      data-linear-speed={value.linearSpeed == null ? undefined : value.linearSpeed.toFixed(2)}
      aria-label={t('{name} Unitree B2 instrument',{ name })}
    >
      <header className="robot-b2-instrument-header">
        <span className="robot-b2-identity">
          <strong>{name}</strong>
          <small>Unitree B2 · {motionLabel}</small>
        </span>
        <span className="robot-b2-header-status">
          <RobotCommunicationStatusIcon
            robotId={robotId}
            online={value.online}
            roundTripTimeMs={value.roundTripTimeMs}
            placement="ground-header"
          />
          <StatusText
            status={value.streamState}
            aria-label={t('B2 streams {state}',{ state:t(value.streamState) })}
            title={t('B2 streams {state}',{ state:t(value.streamState) })}
          >
            {value.streamState === 'live' ? t('LIVE') : value.streamState === 'stale' ? t('STALE') : t('OFF')}
          </StatusText>
        </span>
      </header>

      <div className="robot-b2-instrument-body">
        <div className="robot-b2-heading" data-xgc-role="robot-b2-heading" data-xgc-id={robotId}>
          <div className="robot-b2-heading-dial">
            <span className="north">N</span>
            <span className="east">E</span>
            <span className="south">S</span>
            <span className="west">W</span>
            <svg
              className="robot-b2-heading-pointer"
              viewBox="0 0 32 44"
              style={{ transform: `translate(-50%, -50%) rotate(${value.heading ?? 0}deg)` }}
              aria-hidden="true"
            >
              <path className="outline" d="M16 2 28 17v22L16 34 4 39V17Z" />
              <path className="core" d="M16 7 23 19v12l-7-3-7 3V19Z" />
              <path className="axis" d="M16 7v21" />
            </svg>
            <strong>{value.heading == null ? '--' : `${Math.round(value.heading)}°`}</strong>
          </div>
          <small>{t('HEADING')}</small>
        </div>

        <div className="robot-b2-motion">
          <div className="robot-b2-speed" data-xgc-role="robot-b2-linear-speed" data-xgc-id={robotId} data-xgc-stale={telemetry.speedStale ? 'true' : undefined}>
            <span>
              <strong>{fixedValue(value.linearSpeed, 2)}</strong>
              <small>m/s</small>
            </span>
            <div className="robot-b2-speed-track">
              <i style={{ width: `${Math.min(Math.abs(value.linearSpeed ?? 0) / 3 * 100, 100)}%` }} />
            </div>
            <small className="robot-b2-rate-line">
              <span>{telemetry.speedStale ? t('ODOM SPEED STALE') : t('ODOM SPEED')}</span>
              <span className="robot-b2-rate-value">{rateLabel(value.frequencies.speed)}</span>
            </small>
          </div>

          <div className="robot-b2-angular" data-xgc-role="robot-b2-angular-speed" data-xgc-id={robotId} data-xgc-stale={telemetry.velocityStale ? 'true' : undefined}>
            <span>
              <strong>{fixedValue(value.angularSpeed, 2)}</strong>
              <small>rad/s</small>
            </span>
            <small className="robot-b2-rate-line">
              <span>{telemetry.velocityStale ? t('YAW RATE STALE') : t('YAW RATE')}</span>
              <span className="robot-b2-rate-value">{rateLabel(value.frequencies.pose)}</span>
            </small>
          </div>

          <div className="robot-b2-position" data-xgc-role="robot-b2-position" data-xgc-id={robotId}>
            <small className="robot-b2-rate-line">
              <span>{t('ODOM POSE')}</span>
              <span className="robot-b2-rate-value">{rateLabel(value.frequencies.pose)}</span>
            </small>
            <span>
              <i>X</i>
              <strong>{fixedValue(value.x, 2)}</strong>
              <i>m</i>
            </span>
            <span>
              <i>Y</i>
              <strong>{fixedValue(value.y, 2)}</strong>
              <i>m</i>
            </span>
            <span>
              <i>Z</i>
              <strong>{fixedValue(value.z, 2)}</strong>
              <i>m</i>
            </span>
            <span
              className="robot-b2-pose-fresh"
              data-xgc-pose={value.pose}
              title={value.pose === 'fresh' ? t('Pose sample fresh') : t('Pose sample stale')}
            >
              {value.pose === 'fresh' ? t('POSE OK') : t('POSE STALE')}
            </span>
          </div>

          <div className="robot-b2-power-panel" data-xgc-role="robot-b2-power-detail" data-xgc-id={robotId} data-xgc-stale={telemetry.powerStale ? 'true' : undefined}>
            <small className="robot-b2-rate-line">
              <span>{telemetry.powerStale ? t('BMS STALE') : t('BMS')}</span>
              <span className="robot-b2-rate-value">{rateLabel(value.frequencies.power)}</span>
            </small>
            <span>
              <i>{t('SOC')}</i>
              <strong>{percentageLabel}</strong>
            </span>
            <span>
              <i>V</i>
              <strong>{voltageLabel}</strong>
            </span>
            <span>
              <i>I</i>
              <strong>{currentLabel}</strong>
            </span>
            <span className="robot-b2-joints" data-xgc-role="robot-b2-joints" data-xgc-id={robotId} data-xgc-stale={value.jointsStale ? 'true' : undefined}>
              {jointsLabel}
            </span>
          </div>
        </div>
      </div>

      <footer className="robot-b2-vitals">
        <div data-xgc-role="robot-b2-power" data-xgc-id={robotId}>
          <span>
            <small>{t('POWER')}</small>
            <strong>{powerLabel}</strong>
          </span>
          <BatteryGlyph value={value.battery} placement="ground-vitals" />
        </div>
        <div data-xgc-role="robot-b2-health" data-xgc-id={robotId}>
          <small>{t('HEALTH')}</small>
          <strong data-xgc-tone={value.operationalReady ? 'healthy' : 'danger'}>{t(value.health)}</strong>
        </div>
        <div data-xgc-role="robot-b2-link" data-xgc-id={robotId}>
          <small>{t('LINK')}</small>
          <strong data-xgc-tone={value.online ? 'healthy' : 'danger'}>{linkLabel}</strong>
        </div>
      </footer>
    </div>
  );
}

function rateLabel(rate: number) {
  return rate > 0 ? `${rate.toFixed(1)} Hz` : '--';
}

function fixedValue(value: number | null, digits: number) {
  return value == null ? '--' : value.toFixed(digits);
}
