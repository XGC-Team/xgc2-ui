import { Button, ButtonLink } from '@xgc2/ui-react';
import { forwardRef } from 'react';
import type { AnchorHTMLAttributes,ButtonHTMLAttributes } from 'react';
import { controlClassNames,type ControlSize } from './controlFoundation';

export type ControlTone = 'default' | 'primary' | 'danger' | 'success';
export type ControlAppearance = 'default' | 'ghost' | 'solid' | 'raised';

export type ControlButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: ControlSize;
  tone?: ControlTone;
  appearance?: ControlAppearance;
  iconOnly?: boolean;
  dataXgcRole?: string;
  dataXgcId?: string;
  'data-xgc-role'?: string;
  'data-xgc-id'?: string;
};

export const ControlButton = forwardRef<HTMLButtonElement,ControlButtonProps>(function ControlButton({
  size = 'default',
  tone = 'default',
  appearance = 'default',
  iconOnly = false,
  className = '',
  dataXgcRole,
  dataXgcId,
  'data-xgc-role': dataXgcRoleAttribute,
  'data-xgc-id': dataXgcIdAttribute,
  type = 'button',
  children,
  ...props
}: ControlButtonProps,ref) {
  return (
    <Button
      ref={ref}
      {...props}
      type={type}
      className={controlClassNames('xgc-control','xgc-control-button',className)}
      appearance={appearance}
      iconOnly={iconOnly}
      tone={tone}
      uiSize={size}
      data-xgc-control="button"
      data-xgc-size={size}
      data-xgc-tone={tone}
      data-xgc-appearance={appearance}
      data-xgc-icon-only={iconOnly ? 'true' : undefined}
      data-xgc-role={dataXgcRole ?? dataXgcRoleAttribute}
      data-xgc-id={dataXgcId ?? dataXgcIdAttribute}
    >
      {children}
    </Button>
  );
});

export type ControlLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  size?: ControlSize;
  tone?: ControlTone;
  appearance?: ControlAppearance;
  iconOnly?: boolean;
  dataXgcRole?: string;
  dataXgcId?: string;
  'data-xgc-role'?: string;
  'data-xgc-id'?: string;
};

export function ControlLink({
  size = 'default',
  tone = 'default',
  appearance = 'default',
  iconOnly = false,
  className = '',
  dataXgcRole,
  dataXgcId,
  'data-xgc-role': dataXgcRoleAttribute,
  'data-xgc-id': dataXgcIdAttribute,
  children,
  ...props
}: ControlLinkProps) {
  return (
    <ButtonLink
      {...props}
      className={controlClassNames('xgc-control','xgc-control-button',className)}
      appearance={appearance}
      iconOnly={iconOnly}
      tone={tone}
      uiSize={size}
      data-xgc-control="link"
      data-xgc-size={size}
      data-xgc-tone={tone}
      data-xgc-appearance={appearance}
      data-xgc-icon-only={iconOnly ? 'true' : undefined}
      data-xgc-role={dataXgcRole ?? dataXgcRoleAttribute}
      data-xgc-id={dataXgcId ?? dataXgcIdAttribute}
    >
      {children}
    </ButtonLink>
  );
}
