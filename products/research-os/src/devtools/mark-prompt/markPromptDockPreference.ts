/**
 * Developer preference: show the Mark Prompt hover toolbar.
 * Default is on — operators hide it from Settings → Tools.
 * Only composed when Developer.MarkPrompt is present.
 */
export const MARK_PROMPT_DOCK_STORAGE_KEY = 'research.markPrompt.dockVisible';
export const MARK_PROMPT_DOCK_CHANGE_EVENT = 'research-mark-prompt-dock-change';

/** Default visible: only an explicit stored "false" hides the hover control. */
export function readMarkPromptDockVisible(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(MARK_PROMPT_DOCK_STORAGE_KEY) !== 'false';
}

export function writeMarkPromptDockVisible(visible: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MARK_PROMPT_DOCK_STORAGE_KEY, visible ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent(MARK_PROMPT_DOCK_CHANGE_EVENT, { detail: visible }));
}
