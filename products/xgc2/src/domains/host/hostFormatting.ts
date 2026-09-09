export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B','KB','MB','GB','TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)),units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

/** Human rate for network/disk (bytes per second). */
export function formatByteRate(bytesPerSecond: number) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '0 B/s';
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatDateTime(value: string) {
  if (!value) return '-';
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? value : time.toLocaleString();
}

/**
 * Format uptime from either:
 * - Core /proc style "seconds idle" first field string
 * - Agent "13510s" / bare seconds
 * - already human text
 */
export function formatUptime(value: string | number | undefined) {
  if (value == null || value === '') return '-';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return humanizeSeconds(value);
  }
  const text = String(value).trim();
  const secondsMatch = text.match(/^(\d+(?:\.\d+)?)\s*s(?:ec(?:onds)?)?$/i);
  if (secondsMatch) return humanizeSeconds(Number(secondsMatch[1]));
  // /proc/uptime first field (may include idle as second token)
  const proc = text.match(/^(\d+(?:\.\d+)?)(?:\s|$)/);
  if (proc && !/[a-zA-Z]/.test(text.slice(0, 24))) {
    return humanizeSeconds(Number(proc[1]));
  }
  return text;
}

function humanizeSeconds(total: number) {
  if (!Number.isFinite(total) || total < 0) return '-';
  const seconds = Math.floor(total);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}
