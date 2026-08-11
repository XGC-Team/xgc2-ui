import { useState, type HTMLAttributes, type ReactNode } from 'react';
import { classNames } from '../utils';
import { Button } from './Button';

export type ToolbarProps = HTMLAttributes<HTMLDivElement>;

export function Toolbar({ className, ...props }: ToolbarProps) {
  return <div {...props} className={classNames('xgc-toolbar', className)} />;
}

export type StatCardProps = HTMLAttributes<HTMLElement> & {
  detail?: ReactNode;
  label: ReactNode;
  value: ReactNode;
};

export function StatCard({ className, detail, label, value, ...props }: StatCardProps) {
  return (
    <article {...props} className={classNames('xgc-stat-card', className)}>
      <span className="xgc-stat-card-label">{label}</span>
      <strong className="xgc-stat-card-value">{value}</strong>
      {detail ? <span className="xgc-stat-card-detail">{detail}</span> : null}
    </article>
  );
}

export type DataTableProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  empty?: boolean;
  emptyMessage?: ReactNode;
};

export function DataTable({
  children,
  className,
  empty = false,
  emptyMessage = 'No data',
  ...props
}: DataTableProps) {
  return (
    <div {...props} className={classNames('xgc-data-table', className)}>
      {empty ? <div className="xgc-data-table-empty">{emptyMessage}</div> : children}
    </div>
  );
}

export type CodeBlockProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  content: string;
  copyLabel?: string;
  copySuccessLabel?: string;
  copyable?: boolean;
  label?: ReactNode;
  terminal?: boolean;
};

export function CodeBlock({
  className,
  content,
  copyLabel = 'Copy',
  copySuccessLabel = 'Copied',
  copyable = true,
  label,
  terminal = false,
  ...props
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!content || !navigator.clipboard) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return (
    <section
      {...props}
      className={classNames('xgc-code-block', className)}
      data-terminal={terminal || undefined}
    >
      {label || copyable ? (
        <header className="xgc-code-block-header">
          {label ? <strong>{label}</strong> : <span />}
          {copyable ? (
            <Button appearance="ghost" uiSize="compact" disabled={!content} onClick={() => void copy()}>
              {copied ? copySuccessLabel : copyLabel}
            </Button>
          ) : null}
        </header>
      ) : null}
      <pre>{content}</pre>
    </section>
  );
}
