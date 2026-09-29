import { createContext, useContext } from 'react';
import { TIMEZONE_PREFERENCE_SYSTEM } from './operatorTime';
import type { StationTimezone } from './stationTimezone';

const fallback: StationTimezone = {
  preference: TIMEZONE_PREFERENCE_SYSTEM,
  resolved: 'UTC',
  system: 'UTC',
};

export type OperatorTimeContextValue = StationTimezone & {
  setPreference: (preference: string) => Promise<void>;
};

export const OperatorTimeContext = createContext<OperatorTimeContextValue | null>(null);

export function useOperatorTime() {
  const value = useContext(OperatorTimeContext);
  if (!value) {
    return {
      ...fallback,
      resolved: 'UTC',
      setPreference: async () => undefined,
    };
  }
  return value;
}
