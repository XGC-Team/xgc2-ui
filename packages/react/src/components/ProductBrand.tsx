import type { HTMLAttributes, ReactNode } from 'react';
import { classNames } from '../utils';

export type ProductBrandProps = HTMLAttributes<HTMLDivElement> & {
  mark?: ReactNode;
  organization?: ReactNode;
  product: ReactNode;
};

export function ProductBrand({
  className,
  mark,
  organization = 'XGC2',
  product,
  ...props
}: ProductBrandProps) {
  return (
    <div {...props} className={classNames('xgc-product-brand', className)}>
      {mark ? <span className="xgc-product-brand-mark" aria-hidden="true">{mark}</span> : null}
      <strong className="xgc-product-brand-organization">{organization}</strong>
      <span className="xgc-product-brand-name">{product}</span>
    </div>
  );
}
