import { useLayoutEffect,useRef } from 'react';
import { registerGroundStationRemoteDock } from './groundStationRemoteDockRegistry';

export function GroundStationRemoteDock({ experimentId }:{ experimentId:string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host || !experimentId) return;
    let release: (()=>void) | undefined = registerGroundStationRemoteDock(experimentId,host);
    const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(([entry]) => {
      if (!entry) return;
      if (entry.isIntersecting) {
        release ??= registerGroundStationRemoteDock(experimentId,host);
      } else {
        // Retain the message's measured space while its live controls float.
        const height = host.getBoundingClientRect().height;
        if (height > 0) host.style.minHeight = `${height}px`;
        release?.();
        release = undefined;
      }
    });
    observer?.observe(host);
    return () => { observer?.disconnect();release?.(); };
  },[experimentId]);
  return <div ref={ref} data-xgc-role="ground-station-remote-dock" data-xgc-id={experimentId} />;
}
