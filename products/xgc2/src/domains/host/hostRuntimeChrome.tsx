import { createContext,useContext,type ReactNode } from 'react';

/**
 * Runtime chrome shared between HostRuntimeShell and Processes/Network leaves.
 * Shell owns Processes|Network view switcher; leaves place it in the single
 * toolbar row (Containers contract: filter left, search/actions right).
 */
export type HostRuntimeChromeValue = Readonly<{
  viewSwitcher: ReactNode;
}>;

const HostRuntimeChromeContext = createContext<HostRuntimeChromeValue>({
  viewSwitcher: null,
});

export function HostRuntimeChromeProvider({
  value,
  children,
}: {
  value: HostRuntimeChromeValue;
  children: ReactNode;
}) {
  return (
    <HostRuntimeChromeContext.Provider value={value}>
      {children}
    </HostRuntimeChromeContext.Provider>
  );
}

/** Consumer for leaf toolbars — co-located with the Provider (standard context module). */
// eslint-disable-next-line react-refresh/only-export-components -- context consumer hook
export function useHostRuntimeChrome(): HostRuntimeChromeValue {
  return useContext(HostRuntimeChromeContext);
}
