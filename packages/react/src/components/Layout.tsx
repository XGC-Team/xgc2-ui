import type { HTMLAttributes, ReactNode } from 'react';
import { classNames } from '../utils';

export type LayoutGap = 'none' | 'tight' | 'compact' | 'default' | 'comfortable' | 'spacious';

export type StackProps = HTMLAttributes<HTMLDivElement> & {
  gap?: LayoutGap;
};

export function Stack({ className, gap = 'default', ...props }: StackProps) {
  return <div {...props} className={classNames('xgc-stack', className)} data-gap={gap} />;
}

export type InlineProps = HTMLAttributes<HTMLDivElement> & {
  align?: 'start' | 'center' | 'end' | 'baseline' | 'stretch';
  gap?: LayoutGap;
  justify?: 'start' | 'center' | 'end' | 'between';
  wrap?: boolean;
};

export function Inline({
  align = 'center',
  className,
  gap = 'default',
  justify = 'start',
  wrap = true,
  ...props
}: InlineProps) {
  return (
    <div
      {...props}
      className={classNames('xgc-inline', className)}
      data-align={align}
      data-gap={gap}
      data-justify={justify}
      data-wrap={wrap || undefined}
    />
  );
}

export type ResponsiveGridProps = HTMLAttributes<HTMLDivElement> & {
  columnWidth?: 'compact' | 'default' | 'wide';
  gap?: LayoutGap;
};

export function ResponsiveGrid({
  className,
  columnWidth = 'default',
  gap = 'default',
  ...props
}: ResponsiveGridProps) {
  return (
    <div
      {...props}
      className={classNames('xgc-responsive-grid', className)}
      data-column-width={columnWidth}
      data-gap={gap}
    />
  );
}

export type ScrollRegionProps = HTMLAttributes<HTMLDivElement> & {
  fill?: boolean;
};

export function ScrollRegion({ className, fill = true, ...props }: ScrollRegionProps) {
  return (
    <div
      {...props}
      className={classNames('xgc-scroll-region', className)}
      data-fill={fill || undefined}
    />
  );
}

export type OperatorWorkspaceProps = HTMLAttributes<HTMLDivElement> & {
  gap?: LayoutGap;
  padding?: 'none' | 'compact' | 'default';
};

/** Fixed operator workspace: bounded content with explicit internal scroll regions. */
export function OperatorWorkspace({
  className,
  gap = 'default',
  padding = 'default',
  ...props
}: OperatorWorkspaceProps) {
  return (
    <div
      {...props}
      className={classNames('xgc-operator-workspace', className)}
      data-gap={gap}
      data-padding={padding}
    />
  );
}

export type SectionHeaderProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  actions?: ReactNode;
  headingLevel?: 1 | 2 | 3 | 4;
  title: ReactNode;
};

/** Quiet content section heading. First-level framed surfaces should use Panel instead. */
export function SectionHeader({ actions, className, headingLevel = 2, title, ...props }: SectionHeaderProps) {
  const Heading = `h${headingLevel}` as 'h1' | 'h2' | 'h3' | 'h4';
  return (
    <header {...props} className={classNames('xgc-section-header', className)}>
      <Heading className="xgc-section-header-title">{title}</Heading>
      {actions ? <div className="xgc-section-header-actions">{actions}</div> : null}
    </header>
  );
}
