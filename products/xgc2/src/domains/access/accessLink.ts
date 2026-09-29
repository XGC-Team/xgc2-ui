import { ACCESS_ENTRY_PATH, type AccessEntry } from './accessTypes';

/**
 * Share-link construction. The operator's own origin is never a candidate:
 * only backend-reported `advertisedHosts` may be offered (harness#118 product
 * review: a 127.0.0.1 station must not mint phone-dead links).
 */

export type AccessEntryLinkCandidate = {
  host: string;
  /** Host formatted for a URL authority (IPv6 bracketed). */
  authority: string;
  isPrivateIPv4: boolean;
  isLoopback: boolean;
};

const WILDCARD_HOSTS = new Set(['0.0.0.0', '::', '[::]', '']);

export function accessEntryLinkCandidates(
  entry: Pick<AccessEntry, 'advertisedHosts'>,
): AccessEntryLinkCandidate[] {
  const seen = new Set<string>();
  const candidates: AccessEntryLinkCandidate[] = [];
  for (const raw of entry.advertisedHosts) {
    const host = typeof raw === 'string' ? raw.trim() : '';
    if (WILDCARD_HOSTS.has(host)) continue;
    const normalized = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
    if (WILDCARD_HOSTS.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    candidates.push({
      host: normalized,
      authority: normalized.includes(':') ? `[${normalized}]` : normalized,
      isPrivateIPv4: isPrivateIPv4(normalized),
      isLoopback: isLoopbackHost(normalized),
    });
  }
  return candidates;
}

export function buildAccessEntryLink(
  candidate: Pick<AccessEntryLinkCandidate, 'authority'>,
  boundPort: number,
  bootstrapToken: string,
): string {
  const authority = candidate.authority.trim();
  if (!authority || WILDCARD_HOSTS.has(authority)) {
    throw new Error('share link requires a concrete advertised host');
  }
  if (!Number.isInteger(boundPort) || boundPort < 1 || boundPort > 65535) {
    throw new Error('share link requires a bound port between 1 and 65535');
  }
  const token = bootstrapToken.trim();
  if (!token) throw new Error('share link requires a bootstrap token');
  return `http://${authority}:${boundPort}${ACCESS_ENTRY_PATH}#token=${encodeURIComponent(token)}`;
}

function isPrivateIPv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => Number(part));
  if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  const [a, b] = octets;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function isLoopbackHost(host: string): boolean {
  if (host === '::1') return true;
  const parts = host.split('.');
  return parts.length === 4 && parts[0] === '127';
}
