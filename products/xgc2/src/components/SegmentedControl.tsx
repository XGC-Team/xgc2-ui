import { SegmentedControl as SharedSegmentedControl } from '@xgc2/ui-react';
import type { ReactNode } from 'react';

export type SegmentedControlOption<Value extends string> = {
  value: Value;
  label: ReactNode;
  ariaControls?: string;
  dataXgcId?: string;
  icon?: ReactNode;
  id?: string;
  disabled?: boolean;
};

export function SegmentedControl<Value extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = 'default',
  variant = 'contained',
  asTabs = false,
  className = '',
  dataXgcRole = 'segmented-control',
  dataXgcId,
  optionDataXgcRole,
}: {
  value: Value;
  options: readonly SegmentedControlOption<Value>[];
  onChange: (value: Value) => void;
  ariaLabel: string;
  size?: 'compact' | 'default';
  variant?: 'contained' | 'underline';
  asTabs?: boolean;
  className?: string;
  dataXgcRole?: string;
  dataXgcId?: string;
  optionDataXgcRole?: string;
}) {
  return <SharedSegmentedControl
    ariaLabel={ariaLabel}
    asTabs={asTabs}
    className={`xgc-tab-strip ${className}`.trim()}
    data-xgc-size={size}
    data-xgc-variant={variant === 'underline' ? 'underline' : undefined}
    dataXgcId={dataXgcId}
    dataXgcRole={dataXgcRole}
    onValueChange={(nextValue) => onChange(nextValue as Value)}
    optionClassName="xgc-tab-item xgc-tab-control"
    optionDataXgcRole={optionDataXgcRole ?? `${dataXgcRole}-option`}
    options={options}
    size={size}
    value={value}
    variant={variant}
  />;
}
