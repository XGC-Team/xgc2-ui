import { Unplug } from 'lucide-react';
import { useMemo,useState } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { InputControl } from '../../components/controls/TextControls';
import { SelectControl } from '../../components/controls/SelectControl';
import { FormField } from '../../components/FormPrimitives';
import { summarizeNetworkInspect } from './networkInspectViewModel';
import { DockerInspectDataView,DockerInspectFacts } from './DockerInspectDataView';

export type NetworkConnectDraft = {
  container: string;
  ipv4: string;
  ipv6: string;
  aliases: string;
};

export type NetworkContainerOption = {
  value: string;
  label: string;
};

export function NetworkInspectSummary({
  content,
  busy = false,
  containerOptions = [],
  onConnect,
  onDisconnect,
}: {
  content: string;
  busy?: boolean;
  containerOptions?: readonly NetworkContainerOption[];
  onConnect?: (draft: NetworkConnectDraft) => void;
  onDisconnect?: (container: string) => void;
}) {
  const summary = useMemo(() => summarizeNetworkInspect(content), [content]);
  const [connectDraft,setConnectDraft] = useState<NetworkConnectDraft>({
    container: '',
    ipv4: '',
    ipv6: '',
    aliases: '',
  });

  const connected = new Set(summary.endpoints.map((endpoint) => endpoint.name.replace(/^\//, '')));
  const availableOptions = containerOptions.filter((option) => {
    const bare = option.label.replace(/^\//, '');
    return !connected.has(option.value) && !connected.has(bare) && !connected.has(option.label);
  });

  return (
    <DockerInspectDataView
      content={content}
      structured={summary.structured}
      ariaLabel="Network inspect view"
      rootRole="container-network-inspect-summary"
      tabsRole="container-network-inspect-view-tabs"
      modeRole="container-network-inspect-view-mode"
      rawRole="container-network-inspect-raw"
      summaryClassName="container-network-inspect-body"
    >
      <DockerInspectFacts facts={summary.facts} dataXgcRole="container-network-inspect-facts" dataXgcId="container-network-inspect-facts" />

      <section className="container-network-endpoints" data-xgc-role="container-network-endpoints" data-xgc-id="container-network-endpoints">
            <strong>Connected containers</strong>
            {summary.endpoints.length === 0 ? (
              <p className="container-network-endpoints-empty">No containers are attached.</p>
            ) : (
              <div className="container-network-endpoint-table" role="table">
                <div className="container-network-endpoint-head container-network-endpoint-head-actions" role="row">
                  <span role="columnheader">Name</span>
                  <span role="columnheader">IPv4</span>
                  <span role="columnheader">IPv6</span>
                  <span role="columnheader">MAC</span>
                  <span role="columnheader">Endpoint</span>
                  {onDisconnect && <span role="columnheader">Operation</span>}
                </div>
                {summary.endpoints.map((endpoint) => (
                  <div
                    className={[
                      'container-network-endpoint-row',
                      onDisconnect ? 'container-network-endpoint-row-actions' : '',
                    ].filter(Boolean).join(' ')}
                    data-xgc-id={endpoint.id}
                    data-xgc-role="container-network-endpoint-row"
                    key={endpoint.id}
                    role="row"
                  >
                    <span role="cell">{endpoint.name}</span>
                    <span role="cell">{endpoint.ipv4 || '-'}</span>
                    <span role="cell">{endpoint.ipv6 || '-'}</span>
                    <span role="cell">{endpoint.mac || '-'}</span>
                    <span role="cell">{endpoint.endpointId || '-'}</span>
                    {onDisconnect && (
                      <span className="container-network-endpoint-actions" role="cell">
                        <ControlButton
                          aria-label={`Disconnect ${endpoint.name}`}
                          dataXgcId={endpoint.id}
                          dataXgcRole="container-network-disconnect"
                          disabled={busy}
                          iconOnly
                          size="compact"
                          title={`Disconnect ${endpoint.name}`}
                          tone="danger"
                          onClick={() => onDisconnect(endpoint.name.replace(/^\//, '') || endpoint.id)}
                        >
                          <Unplug size={13} aria-hidden="true" />
                        </ControlButton>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
      </section>

      {onConnect && (
        <section className="container-network-connect" data-xgc-role="container-network-connect" data-xgc-id="container-network-connect">
              <strong>Connect container</strong>
              <div className="container-network-connect-form">
                <FormField label="Container">
                  <SelectControl
                    ariaLabel="Container to connect"
                    dataXgcRole="container-network-connect-container" dataXgcId="container-network-connect-container"
                    fill
                    options={[
                      { value: '', label: availableOptions.length ? 'Select container' : 'No available containers' },
                      ...availableOptions,
                    ]}
                    value={connectDraft.container}
                    onChange={(container) => setConnectDraft((current) => ({ ...current,container }))}
                  />
                </FormField>
                <FormField label="IPv4" description="Optional static address on this network.">
                  <InputControl
                    aria-label="Connect IPv4 address"
                    placeholder="172.28.0.10"
                    value={connectDraft.ipv4}
                    onChange={(ipv4) => setConnectDraft((current) => ({ ...current,ipv4 }))}
                  />
                </FormField>
                <FormField label="IPv6" description="Optional static IPv6 address.">
                  <InputControl
                    aria-label="Connect IPv6 address"
                    placeholder="2001:db8:1::10"
                    value={connectDraft.ipv6}
                    onChange={(ipv6) => setConnectDraft((current) => ({ ...current,ipv6 }))}
                  />
                </FormField>
                <FormField label="Aliases" description="Optional comma or newline separated DNS aliases.">
                  <InputControl
                    aria-label="Connect aliases"
                    placeholder="api, api.internal"
                    value={connectDraft.aliases}
                    onChange={(aliases) => setConnectDraft((current) => ({ ...current,aliases }))}
                  />
                </FormField>
                <div className="container-network-connect-actions">
                  <ControlButton
                    disabled={busy || !connectDraft.container.trim()}
                    tone="primary"
                    dataXgcRole="container-network-connect-submit"
                    dataXgcId="container-network-connect-submit"
                    onClick={() => {
                      onConnect(connectDraft);
                      setConnectDraft({ container: '',ipv4: '',ipv6: '',aliases: '' });
                    }}
                  >
                    Connect
                  </ControlButton>
                </div>
              </div>
        </section>
      )}
    </DockerInspectDataView>
  );
}
