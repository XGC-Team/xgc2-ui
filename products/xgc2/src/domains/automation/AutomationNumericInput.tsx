import { useEffect,useRef,useState } from 'react';
import { InputControl } from '../../components/controls/TextControls';

/**
 * Automation-owned numeric authoring state. A numeric model cannot represent
 * the empty draft users need while replacing a value, so only complete finite
 * numbers are committed to the Automation document.
 */
export function AutomationNumericInput({
  id,value,integer = false,min,max,step,unit,disabled,readOnly,ariaLabel,title,
  dataXgcRole,dataXgcId,'data-xgc-role': inputDataXgcRole,'data-xgc-id': inputDataXgcId,
  onValueChange,onEmpty,
}: {
  id?: string;
  value?: number;
  integer?: boolean;
  min?: number;
  max?: number;
  step?: number | 'any';
  unit?: string;
  disabled?: boolean;
  readOnly?: boolean;
  ariaLabel?: string;
  title?: string;
  dataXgcRole?: string;
  dataXgcId?: string;
  'data-xgc-role'?: string;
  'data-xgc-id'?: string;
  onValueChange: (value: number) => void;
  onEmpty?: () => void;
}) {
  const committedText = typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  const [draft,setDraft] = useState(committedText);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(committedText);
  }, [committedText]);

  function parsedDraft() {
    if (!draft.trim()) return undefined;
    const parsed = Number(draft);
    return Number.isFinite(parsed) && (!integer || Number.isInteger(parsed)) ? parsed : undefined;
  }

  return (
    <InputControl
      id={id}
      type="number"
      min={min}
      max={max}
      step={step ?? (integer ? 1 : 'any')}
      unit={unit}
      value={draft}
      disabled={disabled}
      readOnly={readOnly}
      aria-label={ariaLabel}
      title={title}
      dataXgcRole={dataXgcRole}
      dataXgcId={dataXgcId}
      data-xgc-role={inputDataXgcRole}
      data-xgc-id={inputDataXgcId}
      onFocus={() => { focused.current = true; }}
      onChange={(raw) => {
        setDraft(raw);
        if (!raw.trim()) return;
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && (!integer || Number.isInteger(parsed))) onValueChange(parsed);
      }}
      onBlur={() => {
        focused.current = false;
        if (!draft.trim()) {
          if (onEmpty) onEmpty();
          else setDraft(committedText);
          return;
        }
        const parsed = parsedDraft();
        if (parsed === undefined) setDraft(committedText);
        else setDraft(String(parsed));
      }}
    />
  );
}
