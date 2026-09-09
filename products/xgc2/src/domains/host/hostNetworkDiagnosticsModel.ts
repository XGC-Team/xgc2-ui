import type {
  HostNetworkRoute,
  HostNetworkSnapshot,
  HostRemoteAccessEndpoint,
} from './hostModel';

export type HostNetworkHealthTone = 'normal' | 'warning' | 'critical' | 'unknown';

export type HostNetworkHealthCheck = {
  id: 'link' | 'route' | 'addressing' | 'dns' | 'proxy' | 'remote-access';
  label: string;
  value: string;
  detail: string;
  tone: HostNetworkHealthTone;
};

export type HostNetworkPathCheck = {
  id: 'target' | 'proxy' | 'route' | 'dns';
  label: string;
  value: string;
  detail: string;
  tone: HostNetworkHealthTone;
};

export function hostNetworkHealthChecks(snapshot: HostNetworkSnapshot): HostNetworkHealthCheck[] {
  const nonLoopback = snapshot.interfaces.filter((iface) => iface.name !== 'lo');
  const active = nonLoopback.filter((iface) => iface.up && iface.addresses.some(isUsableAddress));
  const defaults = snapshot.routes.filter(isDefaultRoute).sort(compareRoutePriority);
  const assignments = snapshot.diagnostics.assignments;
  const dynamic = assignments.filter((assignment) => assignment.mode === 'dynamic').length;
  const fixed = assignments.filter((assignment) => assignment.mode === 'static').length;
  const unknown = assignments.filter((assignment) => assignment.mode === 'unknown').length;
  const proxy = snapshot.diagnostics.proxy;
  const proxyValues = [proxy.httpProxy,proxy.httpsProxy,proxy.allProxy].filter(Boolean);
  const activeSSH = snapshot.diagnostics.remoteAccess.filter((endpoint) => (
    endpoint.state === 'active' && endpoint.kind === 'ssh'
  )).length;
  const activeDesktop = snapshot.diagnostics.remoteAccess.filter((endpoint) => (
    endpoint.state === 'active' && endpoint.kind !== 'ssh'
  )).length;
  const listeningRemote = snapshot.diagnostics.remoteAccess.filter((endpoint) => endpoint.state === 'listening').length;

  return [
    {
      id: 'link',
      label: 'Robot links',
      value: `${active.length} ready / ${nonLoopback.length}`,
      detail: active.length > 0
        ? active.map((iface) => iface.name).join(', ')
        : 'No active non-loopback interface with an address',
      tone: active.length > 0 ? 'normal' : 'critical',
    },
    {
      id: 'route',
      label: 'Default route',
      value: defaults.length === 0 ? 'Missing' : defaults.length === 1 ? 'Ready' : `${defaults.length} competing`,
      detail: defaults[0]
        ? routeSummary(defaults[0])
        : 'The robot has no IPv4/IPv6 default path',
      tone: defaults.length === 0 ? 'critical' : defaults.length === 1 ? 'normal' : 'warning',
    },
    {
      id: 'addressing',
      label: 'IP assignment',
      value: dynamic > 0 ? `${dynamic} dynamic` : fixed > 0 ? `${fixed} fixed` : 'Unknown',
      detail: [`${fixed} fixed`,`${dynamic} dynamic`,`${unknown} unknown`].join(' · '),
      tone: dynamic > 0 ? 'warning' : fixed > 0 && unknown === 0 ? 'normal' : 'unknown',
    },
    {
      id: 'dns',
      label: 'DNS',
      value: snapshot.diagnostics.dns.nameServers.length > 0 ? 'Configured' : 'Missing',
      detail: snapshot.diagnostics.dns.nameServers.join(', ') || 'No resolver reported',
      tone: snapshot.diagnostics.dns.nameServers.length > 0 ? 'normal' : 'warning',
    },
    {
      id: 'proxy',
      label: 'Proxy',
      value: proxyValues.length > 0 ? 'Enabled' : 'Direct',
      detail: proxyValues.length > 0
        ? `${proxyValues.join(', ')}${proxy.noProxy.length > 0 ? ` · NO_PROXY ${proxy.noProxy.length}` : ' · NO_PROXY empty'}`
        : 'No Agent process proxy configured',
      tone: proxyValues.length > 0 && proxy.noProxy.length === 0 ? 'warning' : 'normal',
    },
    {
      id: 'remote-access',
      label: 'Remote access',
      value: `${activeSSH} SSH · ${activeDesktop} desktop`,
      detail: `${listeningRemote} listener${listeningRemote === 1 ? '' : 's'} · active sessions only`,
      tone: activeDesktop > 0 || activeSSH > 2 ? 'warning' : 'normal',
    },
  ];
}

export function isDefaultRoute(route: HostNetworkRoute) {
  return route.prefixLength === 0 && (
    route.destination === '0.0.0.0' || route.destination === '::' || route.destination === ''
  );
}

export function remoteAccessLabel(endpoint: Pick<HostRemoteAccessEndpoint,'kind'>) {
  switch (endpoint.kind) {
  case 'ssh': return 'SSH';
  case 'rdp': return 'RDP';
  case 'vnc': return 'VNC';
  case 'remoteDesktop': return 'Remote desktop';
  default: return 'Remote access';
  }
}

/**
 * Predict one destination's application/proxy and kernel-route path from the
 * passive Agent snapshot. This intentionally performs no DNS or socket probe.
 */
export function hostNetworkPathChecks(snapshot: HostNetworkSnapshot,rawTarget: string): HostNetworkPathCheck[] {
  const target = parseNetworkTarget(rawTarget);
  if (!target) return [];
  const proxy = selectedProxy(snapshot,target.scheme);
  const bypassed = proxy !== '' && matchesNoProxy(target.host,target.port,snapshot.diagnostics.proxy.noProxy);
  const usesProxy = proxy !== '' && !bypassed;
  const proxyTarget = usesProxy ? parseNetworkTarget(proxy) : null;
  const routedHost = proxyTarget?.host || target.host;
  const route = selectRoute(snapshot.routes,routedHost);
  const targetIsInternal = isInternalHost(target.host);
  const dnsHost = isIPAddress(routedHost) ? '' : routedHost;
  const dnsConfigured = snapshot.diagnostics.dns.nameServers.length > 0;

  return [
    {
      id: 'target',label: 'Destination',value: target.host,
      detail: `${target.scheme.toUpperCase()}${target.port ? ` · port ${target.port}` : ''}`,
      tone: 'normal',
    },
    {
      id: 'proxy',label: 'Application path',
      value: usesProxy ? (targetIsInternal ? 'Internal target uses proxy' : 'Via proxy') : 'Direct',
      detail: usesProxy
        ? `${target.host} → ${routedHost}`
        : bypassed ? `NO_PROXY matches ${target.host}` : 'No matching Agent proxy',
      tone: usesProxy && targetIsInternal ? 'critical' : usesProxy ? 'warning' : 'normal',
    },
    {
      id: 'route',label: 'Kernel route',value: route ? 'Matched' : 'Missing',
      detail: route
        ? `${usesProxy ? `proxy ${routedHost}` : routedHost} · ${routeSummary(route)}`
        : `No route reported for ${routedHost}`,
      tone: route ? 'normal' : 'critical',
    },
    {
      id: 'dns',label: 'DNS prerequisite',
      value: dnsHost === '' ? 'Not needed' : dnsConfigured ? 'Configured' : 'Missing',
      detail: dnsHost === ''
        ? `${routedHost} is already an IP address`
        : `${dnsHost} via ${snapshot.diagnostics.dns.nameServers.join(', ') || 'no resolver'}`,
      tone: dnsHost === '' || dnsConfigured ? 'normal' : 'critical',
    },
  ];
}

function isUsableAddress(address: { address: string }) {
  return address.address !== '127.0.0.1' && address.address !== '::1' && address.address !== '';
}

function compareRoutePriority(left: HostNetworkRoute,right: HostNetworkRoute) {
  if (left.metric !== right.metric) return left.metric - right.metric;
  return left.interfaceName.localeCompare(right.interfaceName);
}

function parseNetworkTarget(raw: string): { scheme: string;host: string;port: string } | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value.includes('://') ? value : `https://${value}`);
    const host = parsed.hostname.replace(/^\[|\]$/g,'').replace(/\.$/,'').toLowerCase();
    if (!host) return null;
    return { scheme: parsed.protocol.replace(':','').toLowerCase() || 'https',host,port: parsed.port };
  } catch {
    return null;
  }
}

function selectedProxy(snapshot: HostNetworkSnapshot,scheme: string) {
  const proxy = snapshot.diagnostics.proxy;
  if (scheme === 'http') return proxy.httpProxy || proxy.allProxy;
  if (scheme === 'https') return proxy.httpsProxy || proxy.allProxy;
  return proxy.allProxy;
}

function matchesNoProxy(host: string,port: string,entries: string[]) {
  return entries.some((rawEntry) => {
    let entry = rawEntry.trim().toLowerCase();
    if (!entry) return false;
    if (entry === '*') return true;
    if (entry.includes('://')) {
      try {
        const parsed = new URL(entry);
        entry = `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`;
      } catch {
        return false;
      }
    }
    const bracketed = entry.match(/^\[([^\]]+)\](?::([0-9]+))?$/);
    const split = bracketed ? null : entry.match(/^([^:]+):([0-9]+)$/);
    const entryHost = (bracketed?.[1] || split?.[1] || entry).replace(/^\./,'').replace(/\.$/,'');
    const entryPort = bracketed?.[2] || split?.[2] || '';
    if (entryPort && entryPort !== port) return false;
    if (entryHost.includes('/') && isIPv4(host)) return ipv4InCIDR(host,entryHost);
    return host === entryHost || host.endsWith(`.${entryHost}`);
  });
}

function selectRoute(routes: HostNetworkRoute[],host: string) {
  const candidates = isIPv4(host)
    ? routes.filter((route) => isIPv4(route.destination) && ipv4InRoute(host,route))
    : routes.filter(isDefaultRoute);
  return [...candidates].sort((left,right) => (
    right.prefixLength - left.prefixLength || compareRoutePriority(left,right)
  ))[0];
}

function ipv4InRoute(host: string,route: HostNetworkRoute) {
  if (route.prefixLength === 0) return true;
  const hostValue = ipv4Number(host);
  const routeValue = ipv4Number(route.destination);
  if (hostValue === null || routeValue === null || route.prefixLength < 0 || route.prefixLength > 32) return false;
  const mask = route.prefixLength === 0 ? 0 : (0xffffffff << (32 - route.prefixLength)) >>> 0;
  return (hostValue & mask) === (routeValue & mask);
}

function ipv4InCIDR(host: string,cidr: string) {
  const [network,prefixRaw] = cidr.split('/',2);
  const prefixLength = Number(prefixRaw);
  return ipv4InRoute(host,{
    destination: network,prefixLength,gateway: '',interfaceName: '',metric: 0,table: '',
  });
}

function ipv4Number(value: string) {
  if (!isIPv4(value)) return null;
  return value.split('.').reduce((total,part) => ((total << 8) | Number(part)) >>> 0,0);
}

function isIPv4(value: string) {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function isIPAddress(value: string) {
  return isIPv4(value) || value.includes(':');
}

function isInternalHost(host: string) {
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.lan') || !host.includes('.')) return true;
  const value = ipv4Number(host);
  if (value === null) return host === '::1' || host.toLowerCase().startsWith('fc') || host.toLowerCase().startsWith('fd');
  return ipv4InCIDR(host,'10.0.0.0/8') || ipv4InCIDR(host,'172.16.0.0/12') ||
    ipv4InCIDR(host,'192.168.0.0/16') || ipv4InCIDR(host,'127.0.0.0/8') ||
    ipv4InCIDR(host,'169.254.0.0/16');
}

function routeSummary(route: HostNetworkRoute) {
  const gateway = route.gateway && route.gateway !== '0.0.0.0' && route.gateway !== '::'
    ? `via ${route.gateway}`
    : 'direct';
  return `${gateway} · ${route.interfaceName || 'unknown interface'} · metric ${route.metric}`;
}
