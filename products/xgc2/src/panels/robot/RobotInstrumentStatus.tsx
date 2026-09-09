import type { ReactNode } from 'react';
import { useRobotText } from '../../domains/robot/robotPublic';
import { batteryTelemetryTone } from './RobotListHeaderStatusModel';

export function RobotCommunicationStatusIcon({ robotId,online,roundTripTimeMs,muted = false,placement = 'default' }: {
  robotId: string;
  online: boolean;
  roundTripTimeMs: number | null;
  muted?: boolean;
  placement?: 'default' | 'ground-header';
}) {
  const t = useRobotText();
  const label = online
    ? roundTripTimeMs == null
      ? t('Communication link connected')
      : t('Communication latency {latency} ms',{ latency:roundTripTimeMs.toFixed(1) })
    : t('Communication link unavailable');
  return (
    <InstrumentGlyphSlot
      robotId={robotId}
      role="robot-network-indicator"
      label={label}
      placement={placement}
      tone={muted ? 'muted' : communicationTone(roundTripTimeMs,online)}
    >
      <ConnectionGlyph latency={roundTripTimeMs} online={online} muted={muted} />
    </InstrumentGlyphSlot>
  );
}

export type RobotInstrumentStatusTone = 'neutral' | 'muted' | 'success' | 'info' | 'warning' | 'danger';

export function RobotInstrumentStatusGlyph({
  robotId,kind,role,label,tone,source,value,active = false,
}: {
  robotId: string;
  kind: 'latency' | 'power' | 'position';
  role: string;
  label: string;
  tone: RobotInstrumentStatusTone;
  source?: string;
  value?: number | null;
  active?: boolean;
}) {
  const muted = tone === 'neutral' || tone === 'muted';
  return (
    <InstrumentGlyphSlot
      robotId={robotId}
      role={role}
      label={label}
      placement="list-header"
      source={source}
      tone={tone}
    >
      {kind === 'latency' && <ConnectionGlyph latency={value ?? null} online={active} muted={muted} label={label} />}
      {kind === 'power' && <BatteryGlyph value={value ?? null} muted={muted} tone={tone} />}
      {kind === 'position' && <LocationGlyph ready={active} muted={muted} label={label} />}
    </InstrumentGlyphSlot>
  );
}

function InstrumentGlyphSlot({ robotId,role,label,children,placement,source,tone }: {
  robotId: string;
  role: string;
  label: string;
  children: ReactNode;
  placement?: 'default' | 'ground-header' | 'list-header';
  source?: string;
  tone: RobotInstrumentStatusTone;
}) {
  return (
    <span
      className="robot-instrument-status-glyph"
      data-xgc-role={role}
      data-xgc-id={robotId}
      data-xgc-placement={placement}
      data-xgc-source={source}
      data-xgc-tone={tone}
      title={label}
      aria-label={label}
    >{children}</span>
  );
}

function ConnectionGlyph({ latency,online,muted = false,label }: {
  latency: number | null;
  online: boolean;
  muted?: boolean;
  label?: string;
}) {
  const t = useRobotText();
  const title = label ?? (!online
    ? t('Communication link unavailable')
    : latency == null ? t('Communication link connected; latency unavailable') : `${latency.toFixed(1)} ms`);
  return (
    <span className="robot-instrument-connection-group" title={title}>
      <span className="robot-instrument-connection-icon">
        <svg className="robot-instrument-connection-glyph" width="14" height="14" viewBox="0 0 24 24" fill="none"
          aria-hidden="true">
          <g transform="rotate(45 12 12)" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            opacity={muted ? 0.65 : online ? 0.95 : 0.45}>
            <path d="M6 12h12" />
            <path d="M9 8H3v8h6" />
            <path d="M15 8h6v8h-6" />
          </g>
        </svg>
      </span>
    </span>
  );
}

function LocationGlyph({ ready,muted = false,label }: { ready: boolean;muted?: boolean;label?: string }) {
  const t = useRobotText();
  return <span className="robot-instrument-location-icon" title={label ?? t(ready ? 'local pose and mocap fresh' : 'VRPN position unavailable')}><svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M8,16c0,0,6-5.582,6-10s-2.686-6-6-6S2,1.582,2,6S8,16,8,16z M5,5c0-1.657,1.343-3,3-3s3,1.343,3,3S9.657,8,8,8S5,6.657,5,5z" fill="currentColor" opacity={muted ? 0.65 : ready ? 0.9 : 0.45} /></svg></span>;
}

export function BatteryGlyph({ value,muted = false,placement = 'default',tone }: {
  value: number | null;
  muted?: boolean;
  placement?: 'default' | 'ground-vitals';
  tone?: RobotInstrumentStatusTone;
}) {
  const level = value ?? 0;
  const resolvedTone = muted ? 'muted' : (tone ?? batteryTelemetryTone(value));
  return <svg className="robot-instrument-battery" data-xgc-tone={resolvedTone} data-xgc-placement={placement} width="20" height="14" viewBox="0 0 20 14"><rect className="shell" x="1" y="2" width="16" height="10" rx="1" stroke="currentColor" strokeWidth="1" /><rect className="terminal" x="17" y="5" width="2" height="4" /><rect className="level" x="2" y="3" width={14 * level / 100} height="8" rx="0.5" /><text x="9" y="7.5" textAnchor="middle" dominantBaseline="middle" fontSize="7" fontWeight="700">{value == null ? '--' : Math.round(value)}</text></svg>;
}

function communicationTone(latency: number | null,online: boolean): RobotInstrumentStatusTone {
  if (!online) return 'danger';
  if (latency == null) return 'info';
  if (latency <= 60) return 'success';
  if (latency <= 100) return 'info';
  if (latency <= 150) return 'warning';
  return 'danger';
}
