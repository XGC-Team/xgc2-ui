import { Button } from '@xgc2/ui-react';
import type { HTMLAttributes } from 'react';
import { classNames } from './classNames';
import type { PdfQuote } from './PdfPane';

export type QuoteChipProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  dataXgcId?: string;
  dataXgcRole?: string;
  disabled?: boolean;
  onSend: (quote: PdfQuote) => void;
  quote: PdfQuote;
  sendLabel?: string;
};

export function QuoteChip({
  className,
  dataXgcId = 'quote-chip',
  dataXgcRole = 'quote-chip',
  disabled = false,
  onSend,
  quote,
  sendLabel = 'Send',
  ...props
}: QuoteChipProps) {
  return (
    <div
      {...props}
      className={classNames('xgc-manuscript-quote-chip', className)}
      data-xgc-id={dataXgcId}
      data-xgc-role={dataXgcRole}
    >
      <span
        className="xgc-manuscript-quote-chip-text"
        data-xgc-id={`${dataXgcId}:text`}
        data-xgc-role="quote-chip-text"
      >
        p.{quote.page} {quote.text}
      </span>
      <Button
        data-xgc-id={`${dataXgcId}:send`}
        data-xgc-role="quote-chip-send"
        disabled={disabled}
        onClick={() => onSend(quote)}
        uiSize="compact"
      >
        {sendLabel}
      </Button>
    </div>
  );
}
