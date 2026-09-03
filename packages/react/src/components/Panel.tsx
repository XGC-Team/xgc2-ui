import { useId, type HTMLAttributes, type ReactNode } from 'react';
import { classNames } from '../utils';

export type PanelProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  actions?: ReactNode;
  bodyLayout?: 'block' | 'column';
  bodyScroll?: boolean;
  /**
   * `framed` is the full chrome (border, radius, header, card shadow) and is
   * the only variant allowed at the two outermost nesting levels. `flat`
   * drops background/border/radius/shadow and simplifies the header so inner
   * sections group by spacing and typography instead of stacked chrome.
   */
  chrome?: 'framed' | 'flat';
  description?: ReactNode;
  fill?: boolean;
  /** Extra attributes stamped on the panel header chrome (markable identity). */
  headerProps?: Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'> & {
    [attribute: `data-${string}`]: string | number | boolean | undefined;
  };
  padding?: 'default' | 'none';
  title?: ReactNode;
};

export function Panel({
  actions,
  bodyLayout = 'block',
  bodyScroll = false,
  children,
  chrome = 'framed',
  className,
  description,
  fill = false,
  headerProps,
  padding = 'default',
  title,
  ...props
}: PanelProps) {
  const titleId = useId();
  return (
    <section
      {...props}
      className={classNames('xgc-panel', className)}
      aria-labelledby={title ? titleId : props['aria-labelledby']}
      data-chrome={chrome === 'flat' ? 'flat' : undefined}
      data-fill={fill || undefined}
      data-padding={padding}
    >
      {title || actions ? (
        <header className="xgc-panel-header" {...headerProps}>
          <div className="xgc-panel-heading">
            {title ? <h2 id={titleId}>{title}</h2> : null}
          </div>
          {actions ? <div className="xgc-panel-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div
        className="xgc-panel-body"
        data-layout={bodyLayout}
        data-scroll={bodyScroll || undefined}
      >
        {description ? <p className="xgc-panel-description">{description}</p> : null}
        {children}
      </div>
    </section>
  );
}
