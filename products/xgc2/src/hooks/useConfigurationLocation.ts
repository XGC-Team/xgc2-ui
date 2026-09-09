import { useCallback,useEffect,useRef,useState } from 'react';
import {
  configurationDetailHash,
  configurationListHash,
  configurationLocationFromHash,
  configurationResourceIdFromHash,
  type ConfigurationLocationDomain,
} from '../shared/configurationLocation';

export function useConfigurationLocation(domain: ConfigurationLocationDomain, active = true) {
  const [resourceId, setResourceId] = useState(() => configurationResourceIdFromHash(window.location.hash, domain));
  const activeRef = useRef(active);
  const resourceIdRef = useRef(resourceId);
  activeRef.current = active;
  resourceIdRef.current = resourceId;

  useEffect(() => {
    const sync = () => {
      const location = configurationLocationFromHash(window.location.hash);
      if (!window.location.hash) {
        if (!activeRef.current) return;
        if (resourceIdRef.current) {
          const hash = configurationDetailHash(domain, resourceIdRef.current);
          if (window.location.hash !== hash) {
            window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
          }
          return;
        }
        setResourceId('');
        return;
      }
      if (location?.domain !== domain) return;
      setResourceId(location.resourceId);
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [domain]);

  useEffect(() => {
    if (!active || !resourceIdRef.current) return;
    const hash = configurationDetailHash(domain, resourceIdRef.current);
    if (window.location.hash === hash) return;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  }, [active, domain]);

  const open = useCallback((nextResourceId: string) => {
    setResourceId(nextResourceId);
    window.location.hash = configurationDetailHash(domain, nextResourceId);
  }, [domain]);

  const close = useCallback(() => {
    setResourceId('');
    const listHash = configurationListHash(domain);
    if (window.location.hash !== listHash) window.location.hash = listHash;
  }, [domain]);

  const replaceInvalidWithList = useCallback(() => {
    setResourceId('');
    const hash = configurationListHash(domain);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  }, [domain]);

  return { resourceId,open,close,replaceInvalidWithList };
}
