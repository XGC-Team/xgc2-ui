/**
 * Global page-text selection preference.
 * Development defaults to selectable; packaged operator builds default to restricted.
 */
export const TEXT_SELECTION_STORAGE_KEY = 'xgc.textSelection.enabled';
export const TEXT_SELECTION_CHANGE_EVENT = 'xgc-text-selection-change';

export function readTextSelectionEnabled(defaultEnabled = !import.meta.env.PROD): boolean {
  if (typeof window === 'undefined') return defaultEnabled;
  try {
    const stored = window.localStorage.getItem(TEXT_SELECTION_STORAGE_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch {
    return defaultEnabled;
  }
  return defaultEnabled;
}

export function applyTextSelectionEnabled(enabled: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.xgcTextSelection = enabled ? 'enabled' : 'restricted';
}

export function initializeTextSelectionPreference(defaultEnabled = !import.meta.env.PROD) {
  const enabled = readTextSelectionEnabled(defaultEnabled);
  applyTextSelectionEnabled(enabled);
  return enabled;
}

export function writeTextSelectionEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TEXT_SELECTION_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // The current document can still apply a preference when storage is unavailable.
  }
  applyTextSelectionEnabled(enabled);
  window.dispatchEvent(new CustomEvent(TEXT_SELECTION_CHANGE_EVENT, { detail: enabled }));
}
