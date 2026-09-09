import { createContext,useContext,type ReactNode } from 'react';

const ExperimentSurfaceVisibilityContext = createContext(true);

/** True only while the Experiment dashboard is the visible workspace. */
export function ExperimentSurfaceVisibilityProvider({
  visible,
  children,
}: {
  visible: boolean;
  children: ReactNode;
}) {
  return (
    <ExperimentSurfaceVisibilityContext.Provider value={visible}>
      {children}
    </ExperimentSurfaceVisibilityContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- context consumer hook
export function useExperimentSurfaceVisible() {
  return useContext(ExperimentSurfaceVisibilityContext);
}
