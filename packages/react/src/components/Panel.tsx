import { createContext, useContext, useId, type HTMLAttributes, type ReactNode } from 'react';
import { classNames } from '../utils';

const PanelDepthContext = createContext(0);

export type PanelProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  actions?: ReactNode;
  bodyLayout?: 'block' | 'column';
  bodyScroll?: boolean;
  /**
   * `framed` is the normal card chrome. Deep nesting is flattened
   * automatically from the third Panel level onward; products should not
   * calculate nesting depth themselves. `flat` remains available when the
   * product intentionally wants a borderless section earlier.
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
  const depth = useContext(PanelDepthContext);
  const effectiveChrome = chrome === 'flat' || depth >= 2 ? 'flat' : 'framed';

  return (
    <section
      {...props}
      className={classNames('xgc-panel', className)}
      aria-labelledby={title ? titleId : props['aria-labelledby']}
      data-chrome={effectiveChrome === 'flat' ? 'flat' : undefined}
      data-depth={depth}
      data-fill={fill || undefined}
      data-padding={padding}
    >
      <PanelDepthContext.Provider value={depth + 1}>
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
      </PanelDepthContext.Provider>
    </section>
  );
}
