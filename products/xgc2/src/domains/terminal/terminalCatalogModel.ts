import type { TerminalHost,TerminalSetting } from './terminalModel';

/** Free-form SSH Host default group (Targets rail + Hosts catalog). */
export const TERMINAL_HOST_GROUP = 'Hosts';

const terminalHostIDPattern=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const reservedTerminalHostIDs=new Set(['default-direct-shell','default-local-loopback']);
const reservedTerminalRobotHostPrefix='robot-asset:';
const nonVisibleTerminalGroupCodePoint=/[\p{C}\p{Zl}\p{Zp}]/u;
const visibleTerminalGroupCodePoint=/[\p{L}\p{N}\p{P}\p{S}]/u;

export type TerminalCollectionFolder<T> = {
  id: string;
  title: string;
  items: T[];
};

export type TerminalCollectionProjection<T> = {
  groups: string[];
  folders: TerminalCollectionFolder<T>[];
};

export function createEmptyTerminalHost(): TerminalHost {
  return {
    id: '',
    name: '',
    group: TERMINAL_HOST_GROUP,
    address: '',
    port: 22,
    user: 'root',
    authMode: 'password',
    password: '',
    privateKey: '',
    passphrase: '',
    rememberPassword: true,
    hasPassword: false,
    hostKey: '',
    description: '',
  };
}

export function createFallbackTerminalSetting(colors: {
  backgroundColor: string;
  foregroundColor: string;
}): TerminalSetting {
  return {
    id: 'default',
    fontFamily: "Monaco, Menlo, Consolas, 'Courier New', monospace",
    fontSize: 13,
    lineHeight: 1.2,
    letterSpacing: 0,
    cursorStyle: 'block',
    cursorBlink: true,
    scrollback: 2000,
    scrollSensitivity: 6,
    defaultHostId: '',
    ...colors,
  };
}

export function projectTerminalHosts(
  hosts: TerminalHost[],
  query: string,
  groupFilter: string,
): TerminalCollectionProjection<TerminalHost> {
  return projectTerminalCollection(hosts,query,groupFilter,normalizeHostGroup,(host) => [
    host.name,
    host.address,
    host.user,
    normalizeHostGroup(host.group),
    host.authMode,
    host.description ?? '',
  ]);
}

export function upsertTerminalRecord<T extends { id: string }>(items: T[], item: T): T[] {
  return items.some((current) => current.id === item.id)
    ? items.map((current) => current.id === item.id ? item : current)
    : [...items,item];
}

export function normalizeHostGroup(group: string): string {
  return group.trim();
}

export function terminalHostIDValidationError(id:string,allowEmpty=false):string {
  if (allowEmpty && id === '') return '';
  if (!terminalHostIDPattern.test(id)) return 'Terminal host ID must be a stable ASCII ID.';
  if (reservedTerminalHostIDs.has(id) || id.startsWith(reservedTerminalRobotHostPrefix)) {
    return 'Terminal host ID is reserved.';
  }
  return '';
}

export function terminalHostGroupValidationError(group:string):string {
  if (!group) return 'Terminal host group is required.';
  if (group !== group.trim() || new TextEncoder().encode(group).length > 128) {
    return 'Terminal host group must be canonical UTF-8 of at most 128 bytes.';
  }
  if (group === 'Default') return 'Terminal host group Default is retired; use an explicit group.';
  let visible=false;
  for (const value of group) {
    if (nonVisibleTerminalGroupCodePoint.test(value) || (/\s/u.test(value) && value !== ' ')) {
      return 'Terminal host group must contain only visible Unicode and ordinary spaces.';
    }
    if (visibleTerminalGroupCodePoint.test(value)) visible=true;
  }
  return visible ? '' : 'Terminal host group must contain visible text.';
}

function projectTerminalCollection<T extends { group: string }>(
  items: T[],
  rawQuery: string,
  groupFilter: string,
  normalizeGroup: (group: string) => string,
  searchableValues: (item: T) => string[],
): TerminalCollectionProjection<T> {
  const query = rawQuery.trim().toLowerCase();
  const groups = ['all',...Array.from(new Set(items.map((item) => normalizeGroup(item.group)))).sort()];
  const filteredItems = items.filter((item) => {
    const group = normalizeGroup(item.group);
    const matchesGroup = groupFilter === 'all' || group === groupFilter;
    const matchesQuery = !query || searchableValues(item).some((value) => value.toLowerCase().includes(query));
    return matchesGroup && matchesQuery;
  });
  const groupedItems = groupBy(filteredItems,(item) => normalizeGroup(item.group));
  const folders = Object.entries(groupedItems).map(([group,groupItems]) => ({
    id: group,
    title: group,
    items: groupItems,
  }));
  return { groups,folders };
}

function groupBy<T>(items: T[], keyFor: (item: T) => string): Record<string,T[]> {
  return items.reduce<Record<string,T[]>>((groups,item) => {
    const key = keyFor(item);
    groups[key] = [...(groups[key] ?? []),item];
    return groups;
  },{});
}
