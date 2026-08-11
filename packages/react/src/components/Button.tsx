import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes } from 'react';
import { classNames } from '../utils';

export type ButtonTone = 'default' | 'primary' | 'danger' | 'success';
export type ButtonAppearance = 'default' | 'ghost' | 'solid';
export type ComponentSize = 'default' | 'compact';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  appearance?: ButtonAppearance;
  iconOnly?: boolean;
  tone?: ButtonTone;
  uiSize?: ComponentSize;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  appearance = 'default',
  children,
  className,
  iconOnly = false,
  tone = 'default',
  type = 'button',
  uiSize = 'default',
  ...props
}, ref) {
  return (
    <button
      ref={ref}
      {...props}
      type={type}
      className={classNames('xgc-button', className)}
      data-appearance={appearance}
      data-icon-only={iconOnly || undefined}
      data-size={uiSize}
      data-tone={tone}
    >
      {children}
    </button>
  );
});

export type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  appearance?: ButtonAppearance;
  iconOnly?: boolean;
  tone?: ButtonTone;
  uiSize?: ComponentSize;
};

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink({
  appearance = 'default',
  children,
  className,
  iconOnly = false,
  tone = 'default',
  uiSize = 'default',
  ...props
}, ref) {
  return (
    <a
      ref={ref}
      {...props}
      className={classNames('xgc-button', className)}
      data-appearance={appearance}
      data-icon-only={iconOnly || undefined}
      data-size={uiSize}
      data-tone={tone}
    >
      {children}
    </a>
  );
});
