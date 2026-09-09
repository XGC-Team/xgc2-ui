import { createContext,useContext } from 'react';

export type ConfigDrawerActionHelpers = {
  requestClose: () => void;
  dirty: boolean;
};

export const ConfigDrawerCloseContext = createContext<(() => void) | null>(null);

/** Close/dismiss path for controls rendered inside the drawer. */
export function useConfigDrawerRequestClose(): () => void {
  const requestClose = useContext(ConfigDrawerCloseContext);
  if (!requestClose) {
    throw new Error('useConfigDrawerRequestClose must be used within ConfigDrawer');
  }
  return requestClose;
}
