import { useState,type ReactNode } from 'react';
import { Play,Square } from 'lucide-react';
import { ControlButton } from '../components/controls/ControlButton';
import type { PanelActionPortRuntime } from './types';

export function PanelActionControl({
  port,
  inputs = {},
  label,
  compact = false,
  activeBehavior = 'stop',
  children,
}: {
  port?: PanelActionPortRuntime;
  inputs?: Record<string,unknown>;
  label?: string;
  compact?: boolean;
  activeBehavior?: 'stop' | 'disable';
  children?: ReactNode;
}) {
  const [busy,setBusy] = useState(false);
  const title = label || port?.label || 'Unbound Action';
  const refusal = port?.disabledReason || (!port?.connected ? `Action port "${title}" is not connected.` : '');
  const active = port?.activeInvocation;
  const stopControl = Boolean(active && activeBehavior === 'stop');
  const statusDescription = active ? `${title}: ${active.status}` : refusal || undefined;

  async function start() {
    if (!port || refusal || busy) return;
    setBusy(true);
    try {
      await port.invoke(inputs,`Invoke ${port.label} from its panel port`);
    } catch {
      return;
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!port || !active || busy) return;
    setBusy(true);
    try {
      await port.control(active,'stop',`Stop ${port.label} from its panel port`);
    } catch {
      return;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-xgc-role="panel-action-port" data-xgc-id={port?.id || title}>
      <ControlButton
        size={compact ? 'compact' : undefined}
        tone={stopControl ? 'danger' : 'primary'}
        disabled={busy || Boolean(stopControl ? !port?.action?.controls.includes('stop') : refusal || active)}
        title={statusDescription}
        aria-description={statusDescription}
        dataXgcRole={stopControl ? 'panel-action-stop' : 'panel-action-invoke'}
        dataXgcId={port?.id || title}
        onClick={() => void (stopControl ? stop() : start())}
      >
        {stopControl ? <Square size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
        {children ?? (stopControl ? `Stop ${title}` : title)}
      </ControlButton>
    </div>
  );
}
