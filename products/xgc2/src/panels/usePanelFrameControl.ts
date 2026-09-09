import { useEffect } from 'react';

export function usePanelFrameControl<Control>(
  setControl: (control: Control | null) => void,
  control: Control,
) {
  useEffect(() => {
    setControl(control);
  }, [control,setControl]);
  useEffect(() => () => setControl(null), [setControl]);
}
