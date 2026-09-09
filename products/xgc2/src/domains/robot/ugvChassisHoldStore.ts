import { useCallback,type Dispatch,type SetStateAction } from 'react';
import { panelStateKey,usePanelState,type PanelStateScope } from '../../shared/panelPrivateState';

const holdKey = 'ugv.chassisHold';

export function ugvChassisHoldKey(scope: PanelStateScope) {
  return panelStateKey(scope, holdKey);
}

export function useUgvChassisHold(scope: PanelStateScope) {
  const [stored,setStored] = usePanelState<boolean>(scope, holdKey, false);
  const held = stored === true;
  const setHeld: Dispatch<SetStateAction<boolean>> = useCallback((value) => {
    setStored((current) => {
      const previous = current === true;
      return typeof value === 'function' ? value(previous) : value;
    });
  }, [setStored]);
  return [held,setHeld] as const;
}
