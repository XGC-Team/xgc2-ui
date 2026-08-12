import { useEffect, useState } from 'react';
import { classNames } from '../utils';
import { Input } from './Input';

/** Theme-aligned quick picks for operator-authored colors. */
export const XGC_COLOR_CONTROL_PRESETS = [
  '#ffffff',
  '#e2e8f0',
  '#9e9e9e',
  '#526478',
  '#1e293b',
  '#080d13',
  '#315fdc',
  '#5fc4f0',
  '#7ddc9a',
  '#f2c66d',
  '#ffbf00',
  '#ff9191',
  '#c084fc',
] as const;

const HEX6 = /^#[0-9a-f]{6}$/;

export function normalizeHex(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const next = value.trim().toLowerCase();
  return HEX6.test(next) ? next : null;
}

export type ColorControlProps = {
  ariaLabel?: string;
  className?: string;
  dataXgcId?: string;
  dataXgcRole?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  /** Override the shared preset strip. Pass an empty array to hide it. */
  presets?: readonly string[];
  value: string;
};

/** Theme-aware color picker with a validated hex entry and shared preset strip. */
export function ColorControl({
  ariaLabel = 'Color',
  className,
  dataXgcId,
  dataXgcRole,
  disabled = false,
  onChange,
  presets = XGC_COLOR_CONTROL_PRESETS,
  value,
}: ColorControlProps) {
  const normalized = normalizeHex(value) ?? value;
  const [hexDraft, setHexDraft] = useState(normalized);

  useEffect(() => setHexDraft(normalized), [normalized]);

  const commitHex = (raw: string) => {
    setHexDraft(raw);
    const next = normalizeHex(raw);
    if (next) onChange(next);
  };

  const pick = (raw: string) => {
    const next = normalizeHex(raw);
    if (!next || disabled) return;
    setHexDraft(next);
    onChange(next);
  };

  return (
    <div
      className={classNames('xgc-color-control', className)}
      data-disabled={disabled || undefined}
      data-xgc-control="color"
      data-xgc-id={dataXgcId}
      data-xgc-role={dataXgcRole}
    >
      <div className="xgc-color-control-main">
        <label className="xgc-color-swatch" title={ariaLabel}>
          <span
            aria-hidden="true"
            className="xgc-color-swatch-fill"
            style={{ backgroundColor: normalizeHex(value) ?? 'transparent' }}
          />
          <input
            aria-label={ariaLabel}
            disabled={disabled}
            onChange={(event) => pick(event.target.value)}
            type="color"
            value={normalizeHex(value) ?? '#000000'}
          />
        </label>
        <Input
          aria-label={`${ariaLabel} hex`}
          autoComplete="off"
          className="xgc-color-control-input"
          containerProps={{
            'data-xgc-id': dataXgcId,
            'data-xgc-role': dataXgcRole ? `${dataXgcRole}-hex` : undefined,
          }}
          disabled={disabled}
          onBlur={() => setHexDraft(normalized)}
          onValueChange={commitHex}
          spellCheck={false}
          value={hexDraft}
        />
      </div>
      {presets.length > 0 ? (
        <div aria-label={`${ariaLabel} common colors`} className="xgc-color-presets" role="listbox">
          {presets.map((preset) => {
            const active = normalizeHex(value) === normalizeHex(preset);
            return (
              <button
                aria-label={preset}
                aria-selected={active}
                className="xgc-color-preset"
                data-xgc-active={active || undefined}
                disabled={disabled}
                key={preset}
                onClick={() => pick(preset)}
                role="option"
                style={{ backgroundColor: preset }}
                type="button"
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
