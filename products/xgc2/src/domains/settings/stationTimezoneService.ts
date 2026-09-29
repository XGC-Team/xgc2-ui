import { request, withTerminalAuth } from '../../api/http';
import type { StationTimezone } from '../../shared/stationTimezone';

export function getStationTimezone() {
  return request<StationTimezone>('/station/timezone', undefined, withTerminalAuth());
}

export function putStationTimezone(preference: string) {
  return request<StationTimezone>('/station/timezone', {
    method: 'PUT',
    body: JSON.stringify({ preference }),
  }, withTerminalAuth());
}
