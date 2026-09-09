import { RefreshCw,Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { ControlButton } from '../../../components/controls/ControlButton';
import { CodeBlock,EmptyState,Notice,Panel,StatusText,Toolbar } from '@xgc2/ui-react';
import { SortableDataTable } from '../../../components/SortableDataTable';
import type { HostSystemLeafProps } from '../hostSystemComposition';
import { useHostFirewallResource } from '../useHostFirewallResource';
import { useDeferSystemTabReady } from '../hostSystemTabSurface';

export function HostFirewallSystemLeaf(context: HostSystemLeafProps<'Firewall'>) {
  const apiTarget = useMemo(() => ({
    ...(context.targetCoreId ? { targetCoreId: context.targetCoreId } : {}),
    ...(context.managedHostId ? { managedHostId: context.managedHostId } : {}),
  }),[context.managedHostId,context.targetCoreId]);
  const firewall = useHostFirewallResource(apiTarget,{
    requestsAllowed: context.requestsAllowed,
    actionsEnabled: context.actionsEnabled,
  });
  const waitingForFirewall = context.requestsAllowed && !firewall.status && !firewall.message;
  useDeferSystemTabReady(waitingForFirewall);
  const enabled = Boolean(firewall.status?.enabled ?? firewall.status?.active);

  return (
    <Panel
      bodyLayout="column"
      className="xgc-host-firewall-section"
      title="Firewall"
      data-xgc-role="host-firewall-section" data-xgc-id="host-firewall-section"
      actions={(
        <Toolbar className="xgc-host-firewall-actions" data-xgc-role="host-firewall-actions" data-xgc-id="host-firewall-actions">
          <ControlButton disabled={firewall.busy} dataXgcRole="host-firewall-toggle" dataXgcId="host-firewall-toggle" onClick={() => void firewall.operate(enabled ? 'disable' : 'enable')}>
            {enabled ? 'Disable' : 'Enable'}
          </ControlButton>
          <ControlButton disabled={firewall.busy} dataXgcRole="host-firewall-reload" dataXgcId="host-firewall-reload" onClick={() => void firewall.operate('reload')}>Reload</ControlButton>
          <ControlButton disabled={firewall.busy} dataXgcRole="host-firewall-refresh" dataXgcId="host-firewall-refresh" onClick={() => void firewall.refresh()}>
            <RefreshCw size={14} aria-hidden="true" />Refresh
          </ControlButton>
        </Toolbar>
      )}
    >
      {firewall.message && <Notice tone={firewall.messageTone} density="compact" onDismiss={firewall.clearMessage}>{firewall.message}</Notice>}
      {firewall.status ? (
        <div className="xgc-host-firewall-status" data-xgc-role="host-firewall-status" data-xgc-id="host-firewall-status">
          <StatusText tone={enabled ? 'neutral' : 'warning'} status={enabled ? 'enabled' : 'disabled'} />
          <span data-xgc-role="host-firewall-backend" data-xgc-id="host-firewall-backend">{firewall.status.backend || firewall.status.name || 'unknown'}</span>
          {firewall.status.output && <CodeBlock className="xgc-host-firewall-output" content={firewall.status.output}
            copyable={false} data-xgc-role="host-firewall-output" data-xgc-id="host-firewall-output" terminal />}
        </div>
      ) : null}
      {context.isRemote ? (
        firewall.rules.length > 0 ? (
          <SortableDataTable
            className="xgc-host-firewall-rules"
            columns={[
              { id: 'direction',header: 'Direction',cell: (rule) => rule.direction },
              { id: 'protocol',header: 'Protocol',cell: (rule) => rule.protocol },
              { id: 'port',header: 'Port',cell: (rule) => <strong>{rule.port}</strong> },
              { id: 'source',header: 'Source',cell: (rule) => rule.source || '*' },
              { id: 'action',header: 'Action',cell: (rule) => <em>{rule.action}</em> },
              { id: 'description',header: 'Description',cell: (rule) => rule.description || rule.id },
              { id: 'operation',header: 'Operation',cell: (rule) => <ControlButton
                  size="compact"
                  tone="danger"
                  disabled={firewall.busy}
                  dataXgcRole="host-firewall-rule-remove" dataXgcId={rule.id}
                  onClick={() => void firewall.removeRule(rule.id)}
                ><Trash2 size={14} aria-hidden="true" />Remove</ControlButton> },
            ]}
            data-xgc-role="host-firewall-rules" data-xgc-id="host-firewall-rules"
            getRowProps={(rule) => ({ 'data-xgc-role': 'host-firewall-rule','data-xgc-id': rule.id })}
            rowKey={(rule) => rule.id}
            rows={firewall.rules}
          />
        ) : (
          <EmptyState
            density="compact"
            appearance="plain"
            title="No firewall rules"
            data-xgc-role="host-firewall-empty" data-xgc-id="host-firewall-empty"
          />
        )
      ) : null}
    </Panel>
  );
}
