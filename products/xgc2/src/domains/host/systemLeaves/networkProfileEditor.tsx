import { Plus,Save,Trash2 } from 'lucide-react';
import { useEffect,useMemo,useState } from 'react';
import { FormField,SwitchControl } from '../../../components/FormPrimitives';
import { Notice } from '@xgc2/ui-react';
import { ControlButton } from '../../../components/controls/ControlButton';
import { SelectControl } from '../../../components/controls/SelectControl';
import { InputControl } from '../../../components/controls/TextControls';
import type { HostNetworkInterface } from '../hostModel';
import {
  NETWORK_PROFILE_SCHEMA,
  type NetworkInterfaceSelector,
  type NetworkProfile,
  type NetworkProfileAsset,
  type NetworkProfilePreset,
  type NetworkProfileRole,
} from '../hostNetworkProfileModel';
import {
  commitNetworkProfile,
  createNetworkProfile,
  listNetworkProfilePresets,
  listNetworkProfiles,
} from '../hostNetworkProfileActions';

export function NetworkProfileEditor({
  role,
  interfaces,
  actionsEnabled,
  targetCoreId,
}: {
  role: NetworkProfileRole;
  interfaces: HostNetworkInterface[];
  actionsEnabled: boolean;
  targetCoreId?: string;
}) {
  const [presets,setPresets] = useState<NetworkProfilePreset[]>([]);
  const [assets,setAssets] = useState<NetworkProfileAsset[]>([]);
  const [selection,setSelection] = useState('');
  const [selectedAsset,setSelectedAsset] = useState<NetworkProfileAsset>();
  const [draft,setDraft] = useState<NetworkProfile>(() => emptyProfile(role));
  const [busy,setBusy] = useState(true);
  const [error,setError] = useState('');
  const apiOptions = useMemo(() => targetCoreId ? { targetCoreId } : undefined,[targetCoreId]);

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError('');
    Promise.all([
      listNetworkProfilePresets(controller.signal,apiOptions),
      listNetworkProfiles(controller.signal,apiOptions),
    ]).then(([nextPresets,nextAssets]) => {
      const matchingPresets = nextPresets.filter((item) => item.profile.role === role);
      const matchingAssets = nextAssets.filter((item) => item.spec.role === role && !item.head.resource.archivedAt);
      setPresets(matchingPresets);
      setAssets(matchingAssets);
      const initial = matchingPresets.find((item) => item.id === (role === 'core-router' ? 'auto' : 'agent-direct'))
        ?? matchingPresets[0];
      if (initial) {
        setSelection(`preset:${initial.id}`);
        setSelectedAsset(undefined);
        setDraft(cloneProfile(initial.profile));
      } else {
        setSelection('');
        setSelectedAsset(undefined);
        setDraft(emptyProfile(role));
      }
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(errorMessage(cause));
    }).finally(() => {
      if (!controller.signal.aborted) setBusy(false);
    });
    return () => controller.abort();
  },[apiOptions,role]);

  const choices = useMemo(() => [
    ...presets.map((item) => ({ value: `preset:${item.id}`,label: item.profile.name,group: 'Presets' })),
    ...assets.map((item) => ({
      value: `asset:${item.head.resource.id}`,
      label: `${item.spec.name} · v${item.head.commit.version}`,
      group: 'Saved',
    })),
  ],[assets,presets]);

  const selectProfile = (value: string) => {
    setSelection(value);
    const asset = value.startsWith('asset:')
      ? assets.find((item) => item.head.resource.id === value.slice('asset:'.length))
      : undefined;
    if (asset) {
      setSelectedAsset(asset);
      setDraft(cloneProfile(asset.spec));
      return;
    }
    const preset = presets.find((item) => item.id === value.slice('preset:'.length));
    if (preset) {
      setSelectedAsset(undefined);
      setDraft(cloneProfile(preset.profile));
    }
  };

  const save = async () => {
    setBusy(true);
    setError('');
    const identity = mutationIdentity(selectedAsset ? 'save network profile version' : 'create network profile');
    try {
      const saved = selectedAsset
        ? await commitNetworkProfile(selectedAsset,draft,identity,apiOptions)
        : await createNetworkProfile(draft,identity,apiOptions);
      setAssets((current) => [saved,...current.filter((item) => item.head.resource.id !== saved.head.resource.id)]);
      setSelectedAsset(saved);
      setSelection(`asset:${saved.head.resource.id}`);
      setDraft(cloneProfile(saved.spec));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="xgc-host-network-profile" data-xgc-role="host-network-profile" data-xgc-id={role}>
      {error && <Notice tone="danger" density="compact">{error}</Notice>}
      <div className="xgc-host-network-profile-toolbar">
        <SelectControl
          value={selection}
          options={choices}
          onChange={selectProfile}
          ariaLabel="Network profile"
          dataXgcRole="host-network-profile-select" dataXgcId="host-network-profile-select"
          disabled={busy}
          busy={busy}
          fill
        />
        <ControlButton
          tone="primary"
          disabled={!actionsEnabled || busy || !draft.name.trim()}
          dataXgcRole="host-network-profile-save" dataXgcId="host-network-profile-save"
          onClick={() => void save()}
        >
          <Save size={14} aria-hidden="true" />{selectedAsset ? 'Save version' : 'Save profile'}
        </ControlButton>
      </div>
      <div className="xgc-host-network-profile-form">
        <FormField label="Profile name">
          <InputControl value={draft.name} onChange={(name) => setDraft({ ...draft,name })} />
        </FormField>
        {role === 'core-router' ? (
          <CoreProfileFields draft={draft} interfaces={interfaces} onChange={setDraft} />
        ) : (
          <AgentProfileFields draft={draft} interfaces={interfaces} onChange={setDraft} />
        )}
      </div>
    </div>
  );
}

function CoreProfileFields({
  draft,interfaces,onChange,
}: {
  draft: NetworkProfile;
  interfaces: HostNetworkInterface[];
  onChange: (profile: NetworkProfile) => void;
}) {
  const robotSelector = draft.interfaces.find((item) => item.id === 'robot-lan')?.selector ?? { mode: 'auto' as const };
  const uplinkSelector = draft.interfaces.find((item) => item.id === 'uplink')?.selector ?? { mode: 'auto' as const };
  const sharing = draft.internetSharing;
  const proxy = draft.githubProxy;
  const requiresUplink = Boolean(
    draft.forwarding.length || sharing || draft.localRoutes.some((route) => route.interfaceId === 'uplink'),
  );
  const sourceCIDR = sharing?.sourceCidrs[0] ?? draft.forwarding[0]?.sourceCidr ?? '192.168.51.0/24';
  return (
    <>
      <FormField label="Robot interface">
        <InterfaceSelect
          value={selectorValue(robotSelector)} interfaces={interfaces} role="host-network-profile-robot-interface"
          onChange={(value) => onChange(setInterface(draft,'robot-lan',selectorFromValue(value,interfaces)))}
        />
      </FormField>
      <FormField label="IPv4 / CIDR">
        <InputControl
          value={draft.addresses[0]?.cidr ?? ''}
          placeholder="192.168.51.150/24"
          onChange={(cidr) => onChange({
            ...draft,
            addresses: cidr ? [{ interfaceId: 'robot-lan',mode: 'secondary',cidr }] : [],
          })}
        />
      </FormField>
      {requiresUplink && (
        <FormField label="Uplink interface">
          <InterfaceSelect
            value={selectorValue(uplinkSelector)} interfaces={interfaces} role="host-network-profile-uplink-interface"
            onChange={(value) => onChange(setInterface(draft,'uplink',selectorFromValue(value,interfaces)))}
          />
        </FormField>
      )}
      <LocalRoutesEditor draft={draft} onChange={onChange} />
      <ForwardingRulesEditor draft={draft} onChange={onChange} />
      <SwitchControl
        label="Share Internet"
        checked={Boolean(sharing)}
        onChange={(enabled) => onChange({
          ...ensureUplink(draft),
          internetSharing: enabled ? {
            sourceCidrs: [sourceCIDR],ingressInterfaceId: 'robot-lan',egressInterfaceId: 'uplink',
            masquerade: true,allowEstablishedReturn: true,
          } : undefined,
        })}
        dataXgcRole="host-network-profile-internet-sharing" dataXgcId="host-network-profile-internet-sharing"
      />
      {sharing && (
        <FormField label="Shared source network">
          <InputControl value={sharing.sourceCidrs[0] ?? ''} onChange={(sourceCidr) => onChange({
            ...draft,internetSharing: { ...sharing,sourceCidrs: [sourceCidr] },
          })} />
        </FormField>
      )}
      <SwitchControl
        label="GitHub proxy"
        checked={Boolean(proxy)}
        onChange={(enabled) => onChange({
          ...draft,
          githubProxy: enabled ? {
            listenAddresses: [addressFromCIDR(draft.addresses[0]?.cidr)],port: 3128,
            allowedSources: [sourceCIDR],destinationPolicy: 'github',upstream: { mode: 'direct' },
          } : undefined,
        })}
        dataXgcRole="host-network-profile-github-proxy" dataXgcId="host-network-profile-github-proxy"
      />
      {proxy && (
        <>
          <FormField label="Proxy listen address">
            <InputControl value={proxy.listenAddresses[0] ?? ''} onChange={(listenAddress) => onChange({
              ...draft,githubProxy: { ...proxy,listenAddresses: [listenAddress] },
            })} />
          </FormField>
          <FormField label="Proxy port">
            <InputControl type="number" min={1} max={65535} step={1} value={proxy.port} onChange={(port) => onChange({
              ...draft,githubProxy: { ...proxy,port: Number(port) },
            })} />
          </FormField>
          <FormField label="Proxy allowed source">
            <InputControl value={proxy.allowedSources[0] ?? ''} onChange={(allowedSource) => onChange({
              ...draft,githubProxy: { ...proxy,allowedSources: [allowedSource] },
            })} />
          </FormField>
        </>
      )}
    </>
  );
}

function LocalRoutesEditor({
  draft,onChange,
}: {
  draft: NetworkProfile;
  onChange: (profile: NetworkProfile) => void;
}) {
  const update = (index: number,patch: Partial<NetworkProfile['localRoutes'][number]>) => {
    const routes = draft.localRoutes.map((route,routeIndex) => routeIndex === index ? { ...route,...patch } : route);
    const next = patch.interfaceId ? ensureLogicalInterface(draft,patch.interfaceId) : draft;
    onChange({ ...next,localRoutes:routes });
  };
  return (
    <section className="xgc-host-network-profile-rules" data-xgc-role="host-network-profile-local-routes" data-xgc-id="host-network-profile-local-routes">
      <div className="xgc-host-network-profile-rules-heading">
        <div>
          <strong>Local routes</strong>
          <span>Choose where traffic originating on this host leaves.</span>
        </div>
        <ControlButton
          size="compact"
          dataXgcRole="host-network-profile-local-route-add" dataXgcId="host-network-profile-local-route-add"
          onClick={() => {
            const next = ensureUplink(draft);
            onChange({
              ...next,
              localRoutes:[...draft.localRoutes,{
                destinationCidr:'0.0.0.0/0',gateway:'',interfaceId:'uplink',metric:100,
              }],
            });
          }}
        >
          <Plus size={14} aria-hidden="true" />Add route
        </ControlButton>
      </div>
      {draft.localRoutes.length === 0 ? (
        <span className="xgc-host-network-profile-rules-empty">No explicit local routes.</span>
      ) : draft.localRoutes.map((route,index) => (
        <div
          className="xgc-host-network-profile-rule-row xgc-host-network-profile-local-route"
          data-xgc-role="host-network-profile-local-route"
          data-xgc-id={String(index)}
          key={index}
        >
          <FormField label="Destination" dataXgcRole="host-network-profile-local-route-destination" dataXgcId={String(index)}>
            <InputControl
              value={route.destinationCidr}
              placeholder="10.20.0.0/16"
              onChange={(destinationCidr) => update(index,{ destinationCidr })}
            />
          </FormField>
          <FormField label="Gateway" dataXgcRole="host-network-profile-local-route-gateway" dataXgcId={String(index)}>
            <InputControl
              value={route.gateway}
              placeholder="192.168.51.1"
              onChange={(gateway) => update(index,{ gateway })}
            />
          </FormField>
          <FormField label="Interface" dataXgcRole="host-network-profile-local-route-interface" dataXgcId={String(index)}>
            <LogicalInterfaceSelect
              value={route.interfaceId}
              role="host-network-profile-local-route-interface-select"
              dataXgcId={String(index)}
              onChange={(interfaceId) => update(index,{ interfaceId })}
            />
          </FormField>
          <FormField label="Metric" dataXgcRole="host-network-profile-local-route-metric" dataXgcId={String(index)}>
            <InputControl
              type="number"
              min={1}
              max={32767}
              step={1}
              value={route.metric}
              onChange={(metric) => update(index,{ metric:Number(metric) })}
            />
          </FormField>
          <ControlButton
            iconOnly
            size="compact"
            tone="danger"
            aria-label={`Remove local route ${index + 1}`}
            title={`Remove local route ${index + 1}`}
            dataXgcRole="host-network-profile-local-route-remove"
            dataXgcId={String(index)}
            onClick={() => onChange({
              ...draft,localRoutes:draft.localRoutes.filter((_,routeIndex) => routeIndex !== index),
            })}
          >
            <Trash2 size={14} aria-hidden="true" />
          </ControlButton>
        </div>
      ))}
    </section>
  );
}

function ForwardingRulesEditor({
  draft,onChange,
}: {
  draft: NetworkProfile;
  onChange: (profile: NetworkProfile) => void;
}) {
  const update = (index: number,patch: Partial<NetworkProfile['forwarding'][number]>) => {
    const rules = draft.forwarding.map((rule,ruleIndex) => ruleIndex === index ? { ...rule,...patch } : rule);
    let next = draft;
    if (patch.ingressInterfaceId) next = ensureLogicalInterface(next,patch.ingressInterfaceId);
    if (patch.egressInterfaceId) next = ensureLogicalInterface(next,patch.egressInterfaceId);
    onChange({ ...next,forwarding:rules });
  };
  return (
    <section className="xgc-host-network-profile-rules" data-xgc-role="host-network-profile-forwarding-rules" data-xgc-id="host-network-profile-forwarding-rules">
      <div className="xgc-host-network-profile-rules-heading">
        <div>
          <strong>Forwarding rules</strong>
          <span>Bound traffic that this host routes for connected devices.</span>
        </div>
        <ControlButton
          size="compact"
          dataXgcRole="host-network-profile-forwarding-rule-add" dataXgcId="host-network-profile-forwarding-rule-add"
          onClick={() => {
            const next = ensureUplink(draft);
            onChange({
              ...next,
              forwarding:[...draft.forwarding,{
                sourceCidr:'192.168.51.0/24',destinationCidr:'0.0.0.0/0',
                ingressInterfaceId:'robot-lan',egressInterfaceId:'uplink',
              }],
            });
          }}
        >
          <Plus size={14} aria-hidden="true" />Add forwarding rule
        </ControlButton>
      </div>
      {draft.forwarding.length === 0 ? (
        <span className="xgc-host-network-profile-rules-empty">No forwarded traffic.</span>
      ) : draft.forwarding.map((rule,index) => (
        <div
          className="xgc-host-network-profile-rule-row xgc-host-network-profile-forwarding-rule"
          data-xgc-role="host-network-profile-forwarding-rule"
          data-xgc-id={String(index)}
          key={index}
        >
          <FormField label="Source" dataXgcRole="host-network-profile-forwarding-source" dataXgcId={String(index)}>
            <InputControl
              value={rule.sourceCidr}
              placeholder="192.168.51.0/24"
              onChange={(sourceCidr) => update(index,{ sourceCidr })}
            />
          </FormField>
          <FormField label="Destination" dataXgcRole="host-network-profile-forwarding-destination" dataXgcId={String(index)}>
            <InputControl
              value={rule.destinationCidr}
              placeholder="0.0.0.0/0"
              onChange={(destinationCidr) => update(index,{ destinationCidr })}
            />
          </FormField>
          <FormField label="Ingress" dataXgcRole="host-network-profile-forwarding-ingress" dataXgcId={String(index)}>
            <LogicalInterfaceSelect
              value={rule.ingressInterfaceId}
              role="host-network-profile-forwarding-ingress-select"
              dataXgcId={String(index)}
              onChange={(ingressInterfaceId) => update(index,{ ingressInterfaceId })}
            />
          </FormField>
          <FormField label="Egress" dataXgcRole="host-network-profile-forwarding-egress" dataXgcId={String(index)}>
            <LogicalInterfaceSelect
              value={rule.egressInterfaceId}
              role="host-network-profile-forwarding-egress-select"
              dataXgcId={String(index)}
              onChange={(egressInterfaceId) => update(index,{ egressInterfaceId })}
            />
          </FormField>
          <ControlButton
            iconOnly
            size="compact"
            tone="danger"
            aria-label={`Remove forwarding rule ${index + 1}`}
            title={`Remove forwarding rule ${index + 1}`}
            dataXgcRole="host-network-profile-forwarding-rule-remove"
            dataXgcId={String(index)}
            onClick={() => onChange({
              ...draft,forwarding:draft.forwarding.filter((_,ruleIndex) => ruleIndex !== index),
            })}
          >
            <Trash2 size={14} aria-hidden="true" />
          </ControlButton>
        </div>
      ))}
    </section>
  );
}

function AgentProfileFields({
  draft,interfaces,onChange,
}: {
  draft: NetworkProfile;
  interfaces: HostNetworkInterface[];
  onChange: (profile: NetworkProfile) => void;
}) {
  const egress = draft.agentEgress ?? { mode: 'direct' as const,preserveManagementRoute: true };
  const selector = draft.interfaces.find((item) => item.id === 'egress')?.selector ?? { mode: 'auto' as const };
  const setMode = (mode: string) => {
    if (mode === 'direct') {
      onChange({ ...draft,interfaces: [],agentEgress: { mode:'direct',preserveManagementRoute:true } });
      return;
    }
    const next = setInterface(draft,'egress',selector);
    onChange({
      ...next,
      agentEgress: mode === 'via-core-gateway'
        ? { mode,preserveManagementRoute:true,interfaceId:'egress',coreGateway:'192.168.51.150',rollbackTimeoutSeconds:30 }
        : { mode:'via-core-proxy',preserveManagementRoute:true,interfaceId:'egress',proxyUrl:'http://192.168.51.150:3128',rollbackTimeoutSeconds:30 },
    });
  };
  return (
    <>
      <FormField label="Egress mode">
        <SelectControl
          value={egress.mode}
          options={[
            { value:'direct',label:'Direct' },
            { value:'via-core-gateway',label:'Via Core Gateway' },
            { value:'via-core-proxy',label:'Via Core Proxy' },
          ]}
          onChange={setMode}
          ariaLabel="Agent egress mode"
          dataXgcRole="host-network-profile-agent-mode" dataXgcId="host-network-profile-agent-mode"
          fill
        />
      </FormField>
      {egress.mode !== 'direct' && (
        <>
          <FormField label="Egress interface">
            <InterfaceSelect
              value={selectorValue(selector)} interfaces={interfaces} role="host-network-profile-agent-interface"
              onChange={(value) => onChange(setInterface(draft,'egress',selectorFromValue(value,interfaces)))}
            />
          </FormField>
          {egress.mode === 'via-core-gateway' ? (
            <FormField label="Core gateway">
              <InputControl value={egress.coreGateway ?? ''} onChange={(coreGateway) => onChange({
                ...draft,agentEgress: { ...egress,coreGateway },
              })} />
            </FormField>
          ) : (
            <FormField label="Core proxy URL">
              <InputControl value={egress.proxyUrl ?? ''} onChange={(proxyUrl) => onChange({
                ...draft,agentEgress: { ...egress,proxyUrl },
              })} />
            </FormField>
          )}
          <FormField label="Rollback timeout">
            <InputControl
              type="number" min={15} max={300} step={1} unit="s"
              value={egress.rollbackTimeoutSeconds ?? 30}
              onChange={(seconds) => onChange({
                ...draft,agentEgress: { ...egress,rollbackTimeoutSeconds: Number(seconds) },
              })}
            />
          </FormField>
        </>
      )}
    </>
  );
}

function InterfaceSelect({
  value,interfaces,role,onChange,
}: {
  value: string;
  interfaces: HostNetworkInterface[];
  role: string;
  onChange: (value: string) => void;
}) {
  return (
    <SelectControl
      value={value}
      options={[
        { value:'auto',label:'Auto' },
        ...interfaces.filter((item) => item.macAddress).map((item) => ({
          value:item.macAddress,label:`${item.name} · ${item.macAddress}`,
        })),
      ]}
      onChange={onChange}
      ariaLabel="Network interface"
      dataXgcRole={role} dataXgcId={role}
      fill
    />
  );
}

function LogicalInterfaceSelect({
  value,role,dataXgcId,onChange,
}: {
  value: string;
  role: string;
  dataXgcId: string;
  onChange: (value: string) => void;
}) {
  return (
    <SelectControl
      value={value}
      options={[
        { value:'robot-lan',label:'Robot LAN' },
        { value:'uplink',label:'Uplink' },
      ]}
      onChange={onChange}
      ariaLabel="Profile interface"
      dataXgcRole={role}
      dataXgcId={dataXgcId}
      fill
    />
  );
}

function setInterface(profile: NetworkProfile,id: string,selector: NetworkInterfaceSelector): NetworkProfile {
  return {
    ...profile,
    interfaces: [
      ...profile.interfaces.filter((item) => item.id !== id),
      { id,selector },
    ],
  };
}

function ensureUplink(profile: NetworkProfile) {
  return profile.interfaces.some((item) => item.id === 'uplink')
    ? profile
    : setInterface(profile,'uplink',{ mode:'auto' });
}

function ensureLogicalInterface(profile: NetworkProfile,id: string) {
  return profile.interfaces.some((item) => item.id === id)
    ? profile
    : setInterface(profile,id,{ mode:'auto' });
}

function selectorValue(selector: NetworkInterfaceSelector) {
  return selector.mode === 'permanent-mac' ? selector.permanentMac : 'auto';
}

function selectorFromValue(value: string,interfaces: HostNetworkInterface[]): NetworkInterfaceSelector {
  if (value === 'auto') return { mode:'auto' };
  const iface = interfaces.find((item) => item.macAddress === value);
  return { mode:'permanent-mac',permanentMac:value,nameHint:iface?.name };
}

function addressFromCIDR(cidr = '') {
  return cidr.split('/')[0] ?? '';
}

function emptyProfile(role: NetworkProfileRole): NetworkProfile {
  if (role === 'agent-egress') {
    return {
      schema:NETWORK_PROFILE_SCHEMA,name:'Agent Direct',role,
      interfaces:[],addresses:[],localRoutes:[],forwarding:[],
      agentEgress:{ mode:'direct',preserveManagementRoute:true },
    };
  }
  return {
    schema:NETWORK_PROFILE_SCHEMA,name:'Auto',role,
    interfaces:[{ id:'robot-lan',selector:{ mode:'auto' } }],
    addresses:[],localRoutes:[],forwarding:[],
  };
}

function cloneProfile(profile: NetworkProfile): NetworkProfile {
  return JSON.parse(JSON.stringify(profile)) as NetworkProfile;
}

function mutationIdentity(reason: string) {
  const id = `network-profile-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { requestId:id,idempotencyKey:id,reason };
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
