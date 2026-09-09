let requestedPath = '';
const listeners = new Set<() => void>();

export function requestHostFilePath(path: string) {
  const next = path.trim();
  if (!next || next === requestedPath) return;
  requestedPath = next;
  listeners.forEach((listener) => listener());
}

export function requestedHostFilePath() {
  return requestedPath;
}

export function subscribeRequestedHostFilePath(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function consumeRequestedHostFilePath(expectedPath?: string) {
  if (expectedPath !== undefined && expectedPath !== requestedPath) return '';
  const path = requestedPath;
  if (!path) return '';
  requestedPath = '';
  listeners.forEach((listener) => listener());
  return path;
}
