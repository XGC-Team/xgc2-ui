import { useId, useState, type ReactNode } from 'react';
import { classNames } from '../utils';

export type ConfigSectionProps = {
  children: ReactNode;
  className?: string;
  dataXgcId?: string;
  dataXgcRole?: string;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  title: ReactNode;
};

export function ConfigSection({
  children,
  className,
  dataXgcId,
  dataXgcRole = 'config-section',
  defaultOpen = true,
  onOpenChange,
  open,
  title,
}: ConfigSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const expanded = open ?? internalOpen;
  const panelId = useId();
  const titleId = useId();
  const setExpanded = (next: boolean) => {
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <section
      className={classNames('xgc-config-section', className)}
      data-xgc-expanded={expanded ? 'true' : 'false'}
      data-xgc-id={dataXgcId}
      data-xgc-role={dataXgcRole}
    >
      <h2 className="xgc-config-section-heading" id={titleId}>
        <button
          aria-controls={panelId}
          aria-expanded={expanded}
          className="xgc-config-section-toggle"
          data-xgc-id={dataXgcId}
          data-xgc-role="config-section-toggle"
          onClick={() => setExpanded(!expanded)}
          type="button"
        >
          <ChevronIcon collapsed={!expanded} />
          <span className="xgc-config-section-title">{title}</span>
        </button>
      </h2>
      {expanded ? (
        <div
          aria-labelledby={titleId}
          className="xgc-config-section-body"
          data-xgc-id={dataXgcId}
          data-xgc-role="config-section-body"
          id={panelId}
          role="region"
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg aria-hidden="true" className="xgc-config-section-chevron" data-xgc-collapsed={collapsed || undefined} fill="none" height="14" viewBox="0 0 16 16" width="14">
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}
