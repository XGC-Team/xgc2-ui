/** Trailing trusted-WebUI 409/404 while the owner is stopping. Not a Stop failure. */
export function isCameraCalibrationTeardownError(cause: unknown): boolean {
  if (!cause) return false;
  if (typeof cause === 'object' && 'status' in cause) {
    const status = (cause as { status?: unknown }).status;
    if (status === 409 || status === 404) return true;
  }
  const message = cause instanceof Error ? cause.message : String(cause);
  if (!message) return false;
  if (/event stream failed: 409\b/.test(message)) return true;
  if (/event stream failed: 404\b/.test(message)) return true;
  return /trusted WebUI is not running and ready/i.test(message)
    || /trusted WebUI is unavailable/i.test(message)
    || /trusted WebUI process instance not found/i.test(message);
}
