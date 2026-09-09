import { RefreshCw } from 'lucide-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { SelectControl } from '../../components/controls/SelectControl';
import { CodeBlock,EmptyState,Notice,Panel,Toolbar } from '@xgc2/ui-react';
import { useHostLogsResource } from './useHostLogsResource';

export function HostOverviewLogsCard({
  managedHostId,
  targetCoreId,
  requestsAllowed,
  actionsEnabled,
}: {
  managedHostId?: string;
  targetCoreId?: string;
  requestsAllowed: boolean;
  actionsEnabled: boolean;
}) {
  const logs = useHostLogsResource({ managedHostId,targetCoreId,requestsAllowed });

  const sourceOptions = logs.sources.map((source) => ({
    value: source.id,
    label: source.path || source.id,
  }));

  return (
    <Panel
      bodyLayout="column"
      className="xgc-host-logs-section"
      title="Host logs"
      description="Bounded log chunk from Agent host log sources. Loads on open and explicit refresh only."
      data-xgc-role="host-logs-card" data-xgc-id="host-logs-card"
      actions={(
        <Toolbar className="xgc-host-logs-toolbar" data-xgc-role="host-logs-toolbar" data-xgc-id="host-logs-toolbar">
          <SelectControl
            className="xgc-host-logs-source"
            value={logs.sourceId}
            options={sourceOptions.length > 0 ? sourceOptions : [{ value: '',label: 'No sources' }]}
            ariaLabel="Host log source"
            dataXgcRole="host-logs-source" dataXgcId="host-logs-source"
            disabled={!actionsEnabled || sourceOptions.length === 0 || logs.busy}
            onChange={logs.selectSource}
          />
          <ControlButton
            disabled={!actionsEnabled || !logs.sourceId || logs.busy}
            dataXgcRole="host-logs-refresh" dataXgcId="host-logs-refresh"
            onClick={() => void logs.refresh()}
          >
            <RefreshCw size={14} aria-hidden="true" />Refresh
          </ControlButton>
        </Toolbar>
      )}
    >
      {logs.message && <Notice tone={logs.messageTone} density="compact" onDismiss={logs.clearMessage}>{logs.message}</Notice>}
      {!requestsAllowed && (
        <EmptyState
          density="compact"
          title="Host logs offline"
          description="Log membership is enabled, but the Agent connection is not ready for automatic requests."
          data-xgc-role="host-logs-offline" data-xgc-id="host-logs-offline"
        />
      )}
      {requestsAllowed && logs.sources.length === 0 && !logs.busy && (
        <EmptyState density="compact" title="No log sources" description="This Agent advertised host logs but returned no sources." />
      )}
      {logs.chunk && (
        <CodeBlock className="xgc-host-logs-chunk" content={logs.chunk.content || '(empty chunk)'} copyable={false}
          data-xgc-role="host-logs-chunk" data-xgc-id={logs.chunk.sourceId} terminal />
      )}
    </Panel>
  );
}
