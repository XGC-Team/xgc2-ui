import type { HTMLAttributes, ReactNode } from 'react';
import { classNames } from '../utils';
import './Typography.css';

export type TextVariant = 'body' | 'secondary' | 'label' | 'meta' | 'caption' | 'code';
export type HeadingVariant = 'page' | 'section' | 'panel';

export type TextProps = HTMLAttributes<HTMLElement> & {
  as?: 'span' | 'p' | 'div' | 'label';
  variant?: TextVariant;
};

/**
 * Semantic text role. Typography follows `variant`, never DOM location.
 * Products may choose the semantic element with `as` without changing the
 * visual hierarchy. Each variant renders one role from
 * `@xgc2/ui-tokens/typography.css`: body, secondary (body in muted colour),
 * label, meta, caption and code.
 */
export function Text({ as = 'span', className, variant = 'body', ...props }: TextProps) {
  const Element = as;
  return (
    <Element
      {...props}
      className={classNames('xgc-text', className)}
      data-variant={variant}
    />
  );
}

export type HeadingProps = Omit<HTMLAttributes<HTMLHeadingElement>, 'title'> & {
  as?: 'h1' | 'h2' | 'h3' | 'h4';
  children: ReactNode;
  variant?: HeadingVariant;
};

/**
 * Semantic heading role. The HTML outline and the product visual hierarchy are
 * independent: e.g. a route-level h2 can still use the `page` visual role.
 * `page` renders the display role, `section` the title role and `panel` the
 * chrome role shared with Panel and WorkspacePanel header titles.
 */
export function Heading({ as = 'h2', className, variant = 'section', ...props }: HeadingProps) {
  const Element = as;
  return (
    <Element
      {...props}
      className={classNames('xgc-heading', className)}
      data-variant={variant}
    />
  );
}
