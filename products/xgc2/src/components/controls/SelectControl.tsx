import { SelectMenu } from '@xgc2/ui-react';
import type { SelectMenuOption, SelectMenuProps } from '@xgc2/ui-react';
import type { AriaAttributes, ReactNode } from 'react';
import { useId, useLayoutEffect } from 'react';
import { controlClassNames, type ControlSize } from './controlFoundation';

export type SelectControlOption = SelectMenuOption;

export type SelectControlProps = Pick<AriaAttributes, 'aria-describedby' | 'aria-invalid'> & {
  ariaLabel: string;
  autoFocus?: boolean;
  busy?: boolean;
  className?: string;
  compact?: boolean;
  dataXgcId?: string;
  dataXgcRole: string;
  disabled?: boolean;
  fill?: boolean;
  icon?: ReactNode;
  id?: string;
  menuAlign?: SelectMenuProps['menuAlign'];
  menuPlacement?: SelectMenuProps['menuPlacement'];
  onChange: (value: string) => void;
  onOpen?: SelectMenuProps['onOpen'];
  options: SelectControlOption[];
  placeholder?: string;
  size?: ControlSize;
  value: string;
};

/**
 * Family SelectMenu puts `data-xgc-role` on `.xgc-select-control`. Marker
 * deepest-hits the inner native `.xgc-select-trigger` button, and FormField
 * clones a `useId()` html id onto that button. Stamp a trigger leaf so
 * stableSelector is `[data-xgc-role="${role}-trigger"]`, not `#_r_N_-control`.
 */

export function SelectControl({
  className,
  dataXgcId,
  dataXgcRole,
  onChange,
  size = 'default',
  ...props
}: SelectControlProps) {
  const stamp = `xgc-select-stamp${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const markableId = dataXgcId ?? dataXgcRole;
  useLayoutEffect(() => {
    const host = document.querySelector(`.${stamp}`);
    if (!(host instanceof HTMLElement)) return;
    const trigger = host.querySelector<HTMLElement>(':scope > .xgc-select-trigger');
    if (!trigger) return;
    trigger.setAttribute('data-xgc-role', `${dataXgcRole}-trigger`);
    trigger.setAttribute('data-xgc-id', markableId);
  }, [dataXgcRole, markableId, stamp]);
  return <SelectMenu
    {...props}
    className={controlClassNames('xgc-control', className, stamp)}
    dataXgcId={markableId}
    dataXgcRole={dataXgcRole}
    onValueChange={onChange}
    uiSize={size}
  />;
}
