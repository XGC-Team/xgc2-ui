import { useEffect,useState } from 'react';
import { EmptyState } from '@xgc2/ui-react';
import { describeWebProxy } from '../../domains/visualization/visualizationPublic';
import type { PanelPluginProps } from '../types';
import '../../styles/web-proxy-panel.css';

export function WebProxyWorkspace({ panel }: PanelPluginProps<readonly ['visualization','experiment']>) {
  const url = typeof panel.options.url === 'string' ? panel.options.url.trim() : '';
  const [proxyPath,setProxyPath] = useState('');
  const [error,setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setProxyPath('');
    setError('');
    if (!url) return;
    describeWebProxy(url)
      .then((payload) => {
        if (cancelled) return;
        const path = typeof payload.proxyPath === 'string' ? payload.proxyPath : '';
        if (!path.startsWith('/api/web-proxy/')) {
          setError('The Core web proxy rejected this URL.');
          return;
        }
        setProxyPath(path);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { cancelled = true; };
  }, [url]);
  if (!url) {
    return (
      <EmptyState
        appearance="plain"
        fill
        title="No panel URL"
        description="Open panel settings and enter the onboard field-panel origin, for example http://172.30.251.20:8099/."
      />
    );
  }
  if (error) {
    return <EmptyState appearance="plain" fill title="Panel proxy unavailable" description={error} />;
  }
  if (!proxyPath) {
    return <EmptyState appearance="plain" fill title="Opening field panel" description="Resolving the same-origin reverse-proxy path." />;
  }
  return (
    <div className="web-proxy-workspace" data-xgc-role="web-proxy-workspace" data-xgc-id={panel.id}>
      <iframe className="web-proxy-frame" title={panel.title} src={proxyPath} />
    </div>
  );
}
