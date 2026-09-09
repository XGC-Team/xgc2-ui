export type SSHDrawerDraft = {
  key: string;
  title: string;
  value: string;
  type: 'port' | 'address' | 'root';
};

export const permitRootLoginOptions = [
  { value: 'yes',label: 'yes' },
  { value: 'no',label: 'no' },
  { value: 'without-password',label: 'without-password' },
  { value: 'forced-commands-only',label: 'forced-commands-only' },
];

export function permitRootLoginLabel(value: string) {
  return value || '-';
}

export function validateSSHPorts(value: string) {
  const ports = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (ports.length === 0) return false;
  const seen = new Set<string>();
  return ports.every((port) => {
    const number = Number(port);
    if (!/^\d+$/.test(port) || !Number.isInteger(number) || number < 1 || number > 65535 || seen.has(port)) return false;
    seen.add(port);
    return true;
  });
}
