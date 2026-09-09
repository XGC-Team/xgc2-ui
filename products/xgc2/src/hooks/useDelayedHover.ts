import { useCallback,useEffect,useRef,useState } from 'react';

export function useDelayedHover(hideDelayMs: number) {
  const [hoveredId, setHoveredId] = useState('');
  const hideTimer = useRef<number | undefined>(undefined);

  const setHover = useCallback((id: string, active: boolean) => {
    if (hideTimer.current !== undefined) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = undefined;
    }
    if (active) {
      setHoveredId(id);
      return;
    }
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = undefined;
      setHoveredId((current) => current === id ? '' : current);
    }, hideDelayMs);
  }, [hideDelayMs]);

  useEffect(() => () => {
    if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current);
  }, []);

  return [hoveredId,setHover] as const;
}
