/**
 * Global operator preference: show hover help bubbles on form fields.
 * Default is off — operators opt in from Settings → Appearance.
 */
export const FIELD_TOOLTIPS_STORAGE_KEY = 'xgc.fieldTooltips';
export const FIELD_TOOLTIPS_CHANGE_EVENT = 'xgc-field-tooltips-change';

/** Default closed: only an explicit stored "true" enables tooltips. */
export function readFieldTooltipsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(FIELD_TOOLTIPS_STORAGE_KEY) === 'true';
}

export function writeFieldTooltipsEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FIELD_TOOLTIPS_STORAGE_KEY, enabled ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent(FIELD_TOOLTIPS_CHANGE_EVENT, { detail: enabled }));
}
