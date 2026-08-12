import type { ComponentType } from 'react';

export type PanelViewIcon = ComponentType<{
  'aria-hidden'?: boolean;
  className?: string;
  size?: number | string;
}>;

export type PanelViewItem<Value extends string> = {
  disabled?: boolean;
  icon: PanelViewIcon;
  id: Value;
  label: string;
};

export type PanelViewPresentation = 'labels' | 'icons' | 'responsive';
export type PanelViewAppearance = 'default' | 'panel';

export type PanelViewSwitcherProps<Value extends string> = {
  appearance?: PanelViewAppearance;
  ariaLabel: string;
  dataXgcId?: string;
  dataXgcRole?: string;
  disabled?: boolean;
  items: readonly PanelViewItem<Value>[];
  onChange: (value: Value) => void;
  optionDataXgcRole?: string;
  presentation?: PanelViewPresentation;
  stopPropagation?: boolean;
  value: Value;
};

export function PanelViewSwitcher<Value extends string>({
  appearance = 'default',
  ariaLabel,
  dataXgcId,
  dataXgcRole = 'panel-view-switcher',
  disabled = false,
  items,
  onChange,
  optionDataXgcRole = 'panel-view',
  presentation = 'responsive',
  stopPropagation = true,
  value,
}: PanelViewSwitcherProps<Value>) {
  return (
    <nav
      aria-label={ariaLabel}
      className="xgc-panel-view-switcher"
      data-xgc-appearance={appearance}
      data-xgc-id={dataXgcId}
      data-xgc-presentation={presentation}
      data-xgc-role={dataXgcRole}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            aria-label={item.label}
            aria-pressed={item.id === value}
            className="xgc-panel-view-switcher-button"
            data-xgc-id={item.id}
            data-xgc-role={optionDataXgcRole}
            disabled={disabled || item.disabled}
            key={item.id}
            onClick={(event) => {
              if (stopPropagation) event.stopPropagation();
              onChange(item.id);
            }}
            title={item.label}
            type="button"
          >
            <Icon aria-hidden className="xgc-panel-view-switcher-icon" size={13} />
            <span className="xgc-panel-view-switcher-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
