import { Input, Textarea } from '@xgc2/ui-react';
import { Search } from 'lucide-react';
import type { InputHTMLAttributes,KeyboardEvent,ReactNode,TextareaHTMLAttributes } from 'react';
import { controlClassNames,type ControlSize } from './controlFoundation';

export function SearchControl({
  value,
  placeholder,
  ariaLabel,
  icon = <Search size={16} aria-hidden="true" />,
  size = 'default',
  className = '',
  dataXgcRole,
  dataXgcId,
  disabled = false,
  onChange,
  onKeyDown,
}: {
  value: string;
  placeholder?: string;
  ariaLabel?: string;
  icon?: ReactNode;
  size?: ControlSize;
  className?: string;
  dataXgcRole?: string;
  dataXgcId?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <InputControl
      type="search"
      controlKind="search"
      className={controlClassNames('xgc-search-control', className)}
      icon={icon}
      size={size}
      dataXgcRole={dataXgcRole}
      dataXgcId={dataXgcId}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel ?? placeholder}
      disabled={disabled}
      onChange={onChange}
      onKeyDown={onKeyDown}
    />
  );
}

export function InputControl({
  icon,
  unit,
  size = 'default',
  controlKind = 'input',
  className = '',
  dataXgcRole,
  dataXgcId,
  onChange,
  ...inputProps
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'onChange' | 'size'> & {
  icon?: ReactNode;
  /** Optional right-aligned grey unit overlay inside the field (e.g. m, °, Hz). */
  unit?: string;
  size?: ControlSize;
  controlKind?: 'input' | 'search';
  className?: string;
  dataXgcRole?: string;
  dataXgcId?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <Input
      className={controlClassNames('xgc-control', 'xgc-input-control', className)}
      icon={icon}
      unit={unit}
      uiSize={size}
      containerProps={{
        'data-xgc-control': controlKind,
        'data-xgc-size': size,
        'data-xgc-unit': unit ? 'true' : undefined,
        'data-xgc-role': dataXgcRole,
        'data-xgc-id': dataXgcId,
      }}
      {...inputProps}
      onValueChange={onChange}
    />
  );
}

export function TextareaControl({
  className = '',
  dataXgcRole,
  dataXgcId,
  onChange,
  ...textareaProps
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className' | 'onChange'> & {
  className?: string;
  dataXgcRole?: string;
  dataXgcId?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <span
      className={controlClassNames('xgc-control', 'xgc-textarea-control', className)}
      data-xgc-control="textarea"
      data-xgc-role={dataXgcRole}
      data-xgc-id={dataXgcId}
      data-disabled={textareaProps.disabled ? 'true' : undefined}
    >
      <Textarea {...textareaProps} onValueChange={onChange} />
    </span>
  );
}
