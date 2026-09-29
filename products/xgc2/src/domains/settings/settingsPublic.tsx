import { createElement, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  setResolvedOperatorTimeZone,
  TIMEZONE_PREFERENCE_SYSTEM,
} from '../../shared/operatorTime';
import {
  OperatorTimeContext,
  type OperatorTimeContextValue,
} from '../../shared/operatorTimeContext';
import type { StationTimezone } from '../../shared/stationTimezone';
import { getStationTimezone, putStationTimezone } from './stationTimezoneService';

const fallback: StationTimezone = {
  preference: TIMEZONE_PREFERENCE_SYSTEM,
  resolved: 'UTC',
  system: 'UTC',
};

/** Settings-owned station clock. Callers still mount it as `<OperatorTimeProvider>`. */
export function OperatorTimeProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<StationTimezone>(fallback);

  useEffect(() => {
    let cancelled = false;
    void getStationTimezone().then((next) => {
      if (cancelled) return;
      setResolvedOperatorTimeZone(next.resolved);
      setSnapshot(next);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback(async (preference: string) => {
    const next = await putStationTimezone(preference);
    setResolvedOperatorTimeZone(next.resolved);
    setSnapshot(next);
  }, []);

  const value = useMemo<OperatorTimeContextValue>(() => ({
    ...snapshot,
    setPreference,
  }), [setPreference, snapshot]);

  return createElement(OperatorTimeContext.Provider, { value }, children);
}
