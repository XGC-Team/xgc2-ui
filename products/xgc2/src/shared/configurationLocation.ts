export type ConfigurationLocationDomain = 'experiment' | 'robotAsset';

export type ConfigurationLocation = {
  domain: ConfigurationLocationDomain;
  resourceId: string;
};

const pathByDomain: Record<ConfigurationLocationDomain,string> = {
  experiment: '#/experiments',
  robotAsset: '#/assets/robots',
};

export function configurationDetailHash(domain: ConfigurationLocationDomain, resourceId: string) {
  return `${pathByDomain[domain]}/${encodeURIComponent(resourceId)}`;
}

export function configurationListHash(domain: ConfigurationLocationDomain) {
  return pathByDomain[domain];
}

export function configurationLocationFromHash(hash: string): ConfigurationLocation | undefined {
  for (const [domain,path] of Object.entries(pathByDomain) as Array<[ConfigurationLocationDomain,string]>) {
    if (hash === path) return { domain,resourceId: '' };
    const detailPrefix = `${path}/`;
    if (!hash.startsWith(detailPrefix)) continue;
    const rest = hash.slice(detailPrefix.length);
    const slash = rest.indexOf('/');
    if (slash >= 0) {
      if (domain !== 'experiment') return { domain,resourceId: '' };
      const tail = rest.slice(slash + 1);
      if (!rest.slice(0, slash) || !tail || tail.includes('/')) return { domain,resourceId: '' };
      try {
        return { domain,resourceId: decodeURIComponent(rest.slice(0, slash)) };
      } catch {
        return { domain,resourceId: '' };
      }
    }
    try {
      return { domain,resourceId: decodeURIComponent(rest) };
    } catch {
      return { domain,resourceId: '' };
    }
  }
  return undefined;
}

export function configurationResourceIdFromHash(hash: string, domain: ConfigurationLocationDomain) {
  const location = configurationLocationFromHash(hash);
  return location?.domain === domain ? location.resourceId : '';
}
