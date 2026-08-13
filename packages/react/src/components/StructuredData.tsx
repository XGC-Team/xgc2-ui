import type { HTMLAttributes, ReactNode } from 'react';
import { classNames } from '../utils';
import { ProgressBar, type ProgressBarTone } from './ProgressBar';

export type DescriptionListProps = HTMLAttributes<HTMLDListElement> & {
  columns?: 1 | 2 | 3 | 4;
  density?: 'compact' | 'default';
  orientation?: 'horizontal' | 'vertical';
  wrapValues?: boolean;
};

export function DescriptionList({
  className,
  columns = 1,
  density = 'default',
  orientation = 'horizontal',
  wrapValues = false,
  ...props
}: DescriptionListProps) {
  return (
    <dl
      {...props}
      className={classNames('xgc-description-list', className)}
      data-columns={columns}
      data-density={density}
      data-orientation={orientation}
      data-wrap-values={wrapValues || undefined}
    />
  );
}

export type DescriptionItemProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  label: ReactNode;
  value: ReactNode;
};

export function DescriptionItem({ className, label, value, ...props }: DescriptionItemProps) {
  const displayValue = value === undefined || value === null || value === '' ? '—' : value;
  return (
    <div {...props} className={classNames('xgc-description-item', className)}>
      <dt>{label}</dt>
      <dd>{displayValue}</dd>
    </div>
  );
}

export type SettingsListProps = HTMLAttributes<HTMLDivElement>;

export function SettingsList({ className, role = 'list', ...props }: SettingsListProps) {
  return <div {...props} className={classNames('xgc-settings-list', className)} role={role} />;
}

export type SettingRowProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title'> & {
  actions?: ReactNode;
  children?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
  value?: ReactNode;
};

export function SettingRow({
  actions,
  children,
  className,
  description,
  role = 'listitem',
  title,
  value,
  ...props
}: SettingRowProps) {
  return (
    <div {...props} className={classNames('xgc-setting-row', className)} role={role}>
      <div className="xgc-setting-row-copy">
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </div>
      <div className="xgc-setting-row-control">{children ?? value}</div>
      {actions ? <div className="xgc-setting-row-actions">{actions}</div> : null}
    </div>
  );
}

export type ResourceMeterProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  detail?: ReactNode;
  label: ReactNode;
  percent: number;
  tone?: ProgressBarTone;
};

export function ResourceMeter({ className, detail, label, percent, tone = 'accent', ...props }: ResourceMeterProps) {
  const value = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  return (
    <div {...props} className={classNames('xgc-resource-meter', className)}>
      <div className="xgc-resource-meter-heading">
        <strong>{label}</strong>
        <span>{value.toFixed(1)}%</span>
      </div>
      <ProgressBar ariaHidden percent={value} size="regular" tone={tone} />
      {detail ? <div className="xgc-resource-meter-detail">{detail}</div> : null}
    </div>
  );
}
