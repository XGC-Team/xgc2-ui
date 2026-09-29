import { memo } from 'react';

/**
 * HUD parts shared by the flight and ground instruments. Scales and tick marks
 * are static for a robot: the 200 ms telemetry merge only moves the element
 * that carries them (ladder, dial, arrow), so these subtrees skip that render.
 * Readouts re-render whenever a value they show changes.
 */
const pitchMarks = [-30,-20,-10,0,10,20,30] as const;
const compassTicks = [15,30,45,60,75,105,120,135,150,165,195,210,225,240,255,285,300,315,330,345];

export const InstrumentPitchMarks = memo(function InstrumentPitchMarks({ robotId }: { robotId: string }) {
  return <>
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
  </>;
});

export const InstrumentCenterMark = memo(function InstrumentCenterMark() {
  return (
    <svg className="robot-flight-center-mark" width="44" height="8" viewBox="0 0 44 8">
      <line x1="7" y1="4" x2="15" y2="4" />
      <circle cx="22" cy="4" r="2" />
      <line x1="29" y1="4" x2="37" y2="4" />
    </svg>
  );
});

/** Roll arc and its ticks; the roll arrow beside them carries the live angle. */
export const InstrumentRollScale = memo(function InstrumentRollScale() {
  return <>
    <svg className="robot-flight-roll-arc" width="100" height="100" viewBox="0 0 100 100">
      <path d="M 28 11.9 A 44 44 0 0 1 72 11.9" fill="none" stroke="white" strokeWidth="1.2" opacity="0.8" />
    </svg>
    {pitchMarks.map((angle) => <span
      key={angle}
      className="robot-flight-roll-tick"
      data-xgc-emphasis={angle % 30 === 0 ? 'major' : 'minor'}
      style={{ transform: `rotate(${angle}deg)` }}
    />)}
  </>;
});

/** Compass dial ticks; the dial element carries the live heading rotation. */
export const InstrumentCompassTicks = memo(function InstrumentCompassTicks() {
  return <>
    {compassTicks.map((angle) => <span
      key={angle}
      className="robot-flight-compass-tick"
      data-xgc-emphasis={angle % 45 === 0 ? 'major' : 'minor'}
      style={{ transform: `rotate(${angle}deg)` }}
    />)}
  </>;
});

export const InstrumentCompassDirection = memo(function InstrumentCompassDirection({ label,yaw }: {
  label: 'N' | 'E' | 'S' | 'W';
  yaw: number;
}) {
  return <span className="robot-flight-direction" data-xgc-direction={label.toLowerCase()}><b style={{ transform: `rotate(${yaw}deg)` }}>{label}</b></span>;
});

export const InstrumentMetricRuler = memo(function InstrumentMetricRuler({ robotId,side,value,unit,title,source }: {
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
});
