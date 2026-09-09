import { createContext,useContext,type ReactNode } from 'react';

const ActivityScope = createContext<{ experimentId?: string; visible: boolean }>({ visible: true });

export function GroundStationActivityScopeProvider({ experimentId,visible,children }: {
  experimentId: string;
  visible: boolean;
  children: ReactNode;
}) {
  return <ActivityScope.Provider value={{ experimentId,visible }}>{children}</ActivityScope.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- scoped domain context consumer
export function useGroundStationActivityScope() { return useContext(ActivityScope); }
