/**
 * Developer preference: show the Mark Prompt hover toolbar.
 * Default is off (declutter, 2026-09-24): a developer tool is not product chrome; toggle it from the command palette.
 * Only composed when Developer.MarkPrompt is present.
 */
export const MARK_PROMPT_DOCK_STORAGE_KEY = 'research.markPrompt.dockVisible';
export const MARK_PROMPT_DOCK_CHANGE_EVENT = 'research-mark-prompt-dock-change';

/** Default hidden: only an explicit stored "true" shows the hover control. */
export function readMarkPromptDockVisible(): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(MARK_PROMPT_DOCK_STORAGE_KEY) === 'true'; } catch { return false; }
}

export function writeMarkPromptDockVisible(visible: boolean) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(MARK_PROMPT_DOCK_STORAGE_KEY, visible ? 'true' : 'false'); } catch { /* Preference lost; the dock state still applies in memory. */ }
  window.dispatchEvent(new CustomEvent(MARK_PROMPT_DOCK_CHANGE_EVENT, { detail: visible }));
}
