/** UI preferences are convenience state: storage may be full, blocked or read-only.
 * A failed preference read/write must never take the workbench down. */
export function readPreference(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
export function writePreference(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* Preference lost for this session; the workbench keeps working. */ }
}
