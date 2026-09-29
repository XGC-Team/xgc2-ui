import type { AgentLinkStats } from '../managedHost/managedHostPublic';
import './AgentLinkHealth.css';

/**
 * AgentLink ops health for a remote host (D-116 M2): presence sessions,
 * reconnects, heartbeat freshness and the largest heartbeat gap, and why the
 * last session ended. This is robot xgc-agent connectivity, not chat.
 */
export function AgentLinkHealth({ link, now = Date.now() }: { link?: AgentLinkStats; now?: number }) {
  if (!link) {
    return (
      <p className="xgc-agent-link-health" data-xgc-role="agent-link-health" data-xgc-id="agent-link-health" data-xgc-state="unseen">
        AgentLink: not seen since Core started.
      </p>
    );
  }
  const connected = Boolean(link.connectedAt);
  const items: Array<[string, string]> = [
    ['Link', connected ? `up ${duration(now - Date.parse(link.connectedAt!))}` : 'down'],
    ['Last heartbeat', link.lastHeartbeatAt ? `${duration(now - Date.parse(link.lastHeartbeatAt))} ago` : '—'],
    ['Heartbeats', String(link.heartbeats)],
    ['Max heartbeat gap', link.maxHeartbeatGapMs > 0 ? duration(link.maxHeartbeatGapMs) : '—'],
    ['Reconnects', String(link.reconnects)],
    ['Lease expiries', String(link.leaseExpired)],
    ['Last drop', link.lastEndAt
      ? `${link.lastEndReason ?? 'unknown'} · ${duration(now - Date.parse(link.lastEndAt))} ago`
        + (link.lastSessionMs ? ` after ${duration(link.lastSessionMs)}` : '')
      : '—'],
  ];
  return (
    <dl
      className="xgc-agent-link-health"
      data-xgc-role="agent-link-health"
      data-xgc-id="agent-link-health"
      data-xgc-state={connected ? 'up' : 'down'}
      aria-label="AgentLink health"
    >
      {items.map(([label, value]) => (
        <div key={label} className="xgc-agent-link-health-item">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function duration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
