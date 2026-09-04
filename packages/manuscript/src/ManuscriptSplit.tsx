import { ResponsiveSplit, type ResponsiveSplitProps } from '@xgc2/ui-react';
import { classNames } from './classNames';

export type ManuscriptSplitProps = Omit<ResponsiveSplitProps, 'primary' | 'secondary'> & {
  dataXgcId?: string;
  pdf: ResponsiveSplitProps['secondary'];
  source: ResponsiveSplitProps['primary'];
};

export function ManuscriptSplit({
  className,
  dataXgcId = 'manuscript-split',
  pdf,
  ratio = 'balanced',
  source,
  ...props
}: ManuscriptSplitProps) {
  return (
    <ResponsiveSplit
      {...props}
      className={classNames('xgc-manuscript-split', className)}
      data-xgc-id={dataXgcId}
      data-xgc-role="manuscript-split"
      primary={source}
      ratio={ratio}
      secondary={pdf}
    />
  );
}
