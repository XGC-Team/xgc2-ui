import { Fragment, memo, type ReactNode } from 'react';
import { useRobotText } from '../../domains/robot/robotPublic';
import { numberValue } from './robotTelemetryValues';
import { splitSignedArrayAxis, splitSignedFixed } from './robotProjectionModel';

type RobotListMetricFrame = {
  robotId: string;
  slot: string;
  title: string;
  unit?: string;
  rate?: string;
  role?: string;
  className?: string;
  empty?: boolean;
  source?: string;
};

function robotListMetricFrame(
  { robotId,slot,title,unit,rate,role,className,empty,source }: RobotListMetricFrame,
  readout: ReactNode,
) {
  const hostId = `${robotId}:${slot}`;
  const labeled = unit ? `${title} (${unit})` : title;
  return (
    <div className={className} data-xgc-role={role} data-xgc-id={hostId} data-xgc-source={source}>
      <dt>
        <span
          className="robot-list-metric-title"
          data-xgc-role="robot-list-metric-title"
          data-xgc-id={hostId}
          title={title}
          aria-label={labeled}
        >
          {title}
        </span>
        {rate !== undefined && (
          <span
            className="robot-list-metric-rate"
            data-xgc-role="robot-list-metric-rate"
            data-xgc-id={hostId}
          >
            {rate}
          </span>
        )}
      </dt>
      <dd className="robot-list-metric-body" data-xgc-empty={empty ? 'true' : undefined}>
        <span
          className="robot-list-metric-readout"
          data-xgc-role="robot-list-metric-readout"
          data-xgc-id={hostId}
        >
          {readout}
        </span>
      </dd>
    </div>
  );
}

export function RobotListMetric({ children,...frame }: RobotListMetricFrame & { children: ReactNode }) {
  return robotListMetricFrame(frame,children);
}

function scalarDigitMinCh(digits: number) {
  return Math.max(4, digits + 3);
}

export const RobotListScalarValue = memo(function RobotListScalarValue({
  value,
  unit,
  digits = 2,
}: {
  value: number | null;
  unit?: string;
  digits?: number;
}) {
  const signed = value == null ? { sign: '', digits: '--' } : splitSignedFixed(value, digits);
  const labeled = unit ? `${signed.sign}${signed.digits} ${unit}` : `${signed.sign}${signed.digits}`;
  return (
    <span
      className="robot-list-metric-value"
      data-xgc-empty={value == null ? 'true' : undefined}
      title={value == null ? undefined : labeled}
    >
      <span className="robot-list-metric-sign" data-xgc-sign={signed.sign ? 'minus' : 'none'}>
        {signed.sign}
      </span>
      <span className="robot-list-metric-digits" style={{ minWidth: `${scalarDigitMinCh(digits)}ch` }}>
        {signed.digits}
      </span>
      {unit ? <span className="robot-list-metric-unit">{` ${unit}`}</span> : null}
    </span>
  );
});

export const RobotListVectorValue = memo(function RobotListVectorValue({ value,showAxisLabels = false }: {
  value: Record<string, unknown>;
  showAxisLabels?: boolean;
}) {
  const t = useRobotText();
  const axes = (['x', 'y', 'z'] as const).map((axis) => {
    const number = numberValue(value[axis]);
    const signed = number == null
      ? { sign: '', integer: '--', fraction: '', digits: '--' }
      : splitSignedArrayAxis(number);
    return { axis, signed, empty: number == null };
  });
  return (
    <span
      className="robot-metric-vector-value"
      data-xgc-empty={axes.every((item) => item.empty) ? 'true' : undefined}
    >
      {axes.map(({ axis, signed, empty }, index) => (
        <Fragment key={axis}>
          {index > 0 ? (
            <span className="robot-metric-vector-gap" aria-hidden="true">{' '}</span>
          ) : null}
          <span
            className="robot-metric-vector-axis"
            data-xgc-axis={axis}
            data-xgc-empty={empty ? 'true' : undefined}
            aria-label={empty ? t('{axis} unavailable',{ axis }) : `${axis} ${signed.sign}${signed.digits}`}
            title={empty ? t('{axis}: unavailable',{ axis }) : `${axis}: ${signed.sign}${signed.digits}`}
          >
            {showAxisLabels && (
              <span className="robot-metric-vector-axis-label" aria-hidden="true">{axis}</span>
            )}
            <span
              className="robot-list-metric-sign"
              data-xgc-sign={signed.sign === '-' ? 'minus' : 'none'}
            >
              {signed.sign}
            </span>
            <span className="robot-list-metric-digits">
              <span className="robot-metric-vector-int">{signed.integer}</span>
              {signed.fraction ? (
                <>
                  <span className="robot-metric-vector-dot">.</span>
                  <span className="robot-metric-vector-frac">{signed.fraction}</span>
                </>
              ) : null}
            </span>
          </span>
        </Fragment>
      ))}
    </span>
  );
});

/**
 * A list metric with an x/y/z readout. Every prop is a primitive or the
 * projection's own value object, so a card render skips this metric unless
 * its readout, rate or state changed. `value` must keep its identity while
 * unchanged (no fresh `{}` per render).
 */
export const RobotListVectorMetric = memo(function RobotListVectorMetric({ value,...frame }: RobotListMetricFrame & {
  value: Record<string,unknown>;
}) {
  return robotListMetricFrame(frame,<RobotListVectorValue value={value} />);
});

/** A list metric with a scalar readout; `unit` and `digits` belong to the value. */
export const RobotListScalarMetric = memo(function RobotListScalarMetric({ value,unit,digits,...frame }: Omit<RobotListMetricFrame,'unit'> & {
  value: number | null;
  unit?: string;
  digits?: number;
}) {
  return robotListMetricFrame(frame,<RobotListScalarValue value={value} unit={unit} digits={digits} />);
});
