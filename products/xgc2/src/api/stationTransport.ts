export type StationTransport = 'local' | 'header' | 'operator-cookie';

// A page-local projection of GET sessions/current, used only to choose how
// requests travel. It holds no permission or credential and never authenticates
// a request. Every page load must ask the server before setting this value.
let confirmedTransport: StationTransport | undefined;
const unauthorizedListeners = new Set<() => void>();

export function confirmStationTransport(transport: StationTransport): void {
  confirmedTransport = transport;
}

export function resetStationTransport(): void {
  confirmedTransport = undefined;
}

export function stationUsesOperatorCookie(): boolean {
  return confirmedTransport === 'operator-cookie';
}

export function subscribeStationUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => { unauthorizedListeners.delete(listener); };
}

export function reportStationUnauthorized(): void {
  if (confirmedTransport === undefined) return;
  for (const listener of unauthorizedListeners) listener();
}
