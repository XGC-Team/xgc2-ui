import { sameOriginWebSocketUrl } from '../../config/urls';

export function lichtblickProxyUrl(
  targetId: string,
  processInstanceId: string,
  {
    bootstrapLayout,
    embedded,
  }: {
    bootstrapLayout: boolean;
    embedded: boolean;
  },
) {
  const proxyPath = `/api/visualization/targets/${encodeURIComponent(targetId)}/lichtblick/${encodeURIComponent(processInstanceId)}`;
  const params = new URLSearchParams({
    ds: 'foxglove-websocket',
    'ds.url': sameOriginWebSocketUrl(`${proxyPath}/ws`),
  });
  if (embedded) params.set('xgc2Embed', '1');
  if (bootstrapLayout) {
    params.set('layoutUrl', new URL(`${proxyPath}/layout.json`, window.location.origin).href);
  }
  return `${proxyPath}/?${params.toString()}`;
}
