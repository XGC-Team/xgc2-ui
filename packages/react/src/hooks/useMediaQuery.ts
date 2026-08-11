import { useEffect, useState } from 'react';

export const XGC_BREAKPOINTS = {
  compact: 820,
  mobile: 720,
} as const;

export const XGC_MEDIA_QUERIES = {
  compact: `(max-width: ${XGC_BREAKPOINTS.compact}px)`,
  mobile: `(max-width: ${XGC_BREAKPOINTS.mobile}px)`,
} as const;

export function useMediaQuery(query: string): boolean {
  const subscribe = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [matches, setMatches] = useState(() => subscribe && window.matchMedia(query).matches);

  useEffect(() => {
    if (!subscribe) return undefined;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query, subscribe]);

  return matches;
}

export function useViewportMode(): 'desktop' | 'mobile' {
  return useMediaQuery(XGC_MEDIA_QUERIES.mobile) ? 'mobile' : 'desktop';
}
