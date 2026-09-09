// Direct Media Edge control endpoint used for locally managed Gazebo camera panels.
export const DEFAULT_LOCAL_MEDIA_EDGE_URL = 'http://127.0.0.1:18090';
// Standalone Agent Hub Docker/WebUI service used by developer marker intake.
export const DEFAULT_LOCAL_AGENT_HUB_URL = 'http://127.0.0.1:3100';
export const DEFAULT_BROWSER_ORIGIN = 'http://localhost';

export function localMediaEdgeURLForPort(port: number) {
  const url = new URL(DEFAULT_LOCAL_MEDIA_EDGE_URL);
  url.port = String(port);
  return url.toString().replace(/\/$/, '');
}

export function sameOriginWebSocketUrl(path: string) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${protocol}//${window.location.host}${normalizedPath}`;
}
