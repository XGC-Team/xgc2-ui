import { request } from '../../api/http';

export type WebProxyDescription = { proxyPath?: string };

export function describeWebProxy(url: string): Promise<WebProxyDescription> {
  return request<WebProxyDescription>(`/web-proxy?url=${encodeURIComponent(url)}`);
}
