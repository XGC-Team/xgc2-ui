import type { ReactNode } from 'react';
import { classNames } from '../utils';
import './Breadcrumbs.css';

export type BreadcrumbItem = {
  className?: string;
  current?: boolean;
  dataXgcId?: string;
  dataXgcRole?: string;
  href?: string;
  id: string;
  label: ReactNode;
  onClick?: () => void;
  title?: string;
};

export type BreadcrumbsProps = {
  ariaLabel?: string;
  className?: string;
  dataXgcId?: string;
  dataXgcRole?: string;
  items: readonly BreadcrumbItem[];
  separator?: ReactNode;
};

export function Breadcrumbs({
  ariaLabel = 'Page hierarchy',
  className,
  dataXgcId,
  dataXgcRole = 'breadcrumbs',
  items,
  separator = '›',
}: BreadcrumbsProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={classNames('xgc-breadcrumbs', className)}
      data-xgc-id={dataXgcId}
      data-xgc-role={dataXgcRole}
    >
      {items.map((item, index) => {
        const common = {
          'aria-current': item.current ? 'page' as const : undefined,
          className: classNames('xgc-breadcrumb-item', item.className),
          'data-xgc-id': item.dataXgcId,
          'data-xgc-role': item.dataXgcRole,
          title: item.title,
        };
        return (
          <span className="xgc-breadcrumb-segment" key={item.id}>
            {index > 0 ? <span aria-hidden="true" className="xgc-breadcrumb-separator">{separator}</span> : null}
            {item.href ? (
              <a {...common} href={item.href} onClick={item.onClick}>{item.label}</a>
            ) : item.onClick ? (
              <button {...common} onClick={item.onClick} type="button">{item.label}</button>
            ) : (
              <span {...common}>{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
