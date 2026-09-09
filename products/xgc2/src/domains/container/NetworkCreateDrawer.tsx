import { ControlButton } from '../../components/controls/ControlButton';
import { InputControl,TextareaControl } from '../../components/controls/TextControls';
import { SelectControl } from '../../components/controls/SelectControl';
import { ConfigDrawer,ConfigDrawerDismissButton } from '../../components/ConfigDrawer';
import { FormField,FormGroup,SwitchControl } from '../../components/FormPrimitives';
import {
  dockerNetworkDrivers,
  networkCreateDisabledReason,
  type DockerNetworkDriver,
  type NetworkCreateDraft,
} from './containerViewModel';

const driverOptions = dockerNetworkDrivers.map((driver) => ({ value: driver,label: driver }));

export function NetworkCreateDrawer({
  draft,
  busy,
  parentInterfaces,
  onDraftChange,
  onClose,
  onCreate,
}: {
  draft: NetworkCreateDraft;
  busy: boolean;
  parentInterfaces: readonly string[];
  onDraftChange: (draft: NetworkCreateDraft) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  const disabledReason = networkCreateDisabledReason(draft);
  const needsParent = draft.driver === 'macvlan' || draft.driver === 'ipvlan';
  const parentOptions = [
    { value: '', label: parentInterfaces.length ? 'Select interface' : 'No host interfaces found' },
    ...parentInterfaces.map((name) => ({ value: name, label: name })),
  ];
  // Allow free-form parent when the host list is incomplete.
  if (draft.parent && !parentInterfaces.includes(draft.parent)) {
    parentOptions.push({ value: draft.parent, label: draft.parent });
  }

  return (
    <ConfigDrawer
      title="Create network"
      onClose={onClose}
      closeOnBackdrop={!busy}
      dismissible={!busy}
      bodyClassName="container-form-body"
      dataXgcRole="container-network-create-drawer" dataXgcId="container-network-create-drawer"
      footer={(
        <>
          <ConfigDrawerDismissButton disabled={busy}>Cancel</ConfigDrawerDismissButton>
          <ControlButton
            disabled={busy || Boolean(disabledReason)}
            title={disabledReason || undefined}
            tone="primary"
            onClick={onCreate}
            dataXgcRole="container-network-create-submit"
            dataXgcId="container-network-create-submit"
          >
            {busy ? 'Creating' : 'Create'}
          </ControlButton>
        </>
      )}
    >
      <FormField label="Name" htmlFor="network-create-name">
        <InputControl
          id="network-create-name"
          autoFocus
          aria-label="Network name"
          placeholder="mission-net"
          value={draft.name}
          onChange={(name) => onDraftChange({ ...draft,name })}
        />
      </FormField>
      <FormField label="Driver">
        <SelectControl
          ariaLabel="Network driver"
          dataXgcRole="container-network-driver" dataXgcId="container-network-driver"
          fill
          options={driverOptions}
          value={draft.driver}
          onChange={(driver) => onDraftChange({
            ...draft,
            driver: driver as DockerNetworkDriver,
            parent: driver === 'macvlan' || driver === 'ipvlan' ? draft.parent : '',
          })}
        />
      </FormField>
      {needsParent && (
        <FormField label="Parent NIC" description="Host interface used as the macvlan/ipvlan parent.">
          {parentInterfaces.length > 0 ? (
            <SelectControl
              ariaLabel="Parent network interface"
              dataXgcRole="container-network-parent" dataXgcId="container-network-parent"
              fill
              options={parentOptions}
              value={draft.parent}
              onChange={(parent) => onDraftChange({ ...draft,parent })}
            />
          ) : (
            <InputControl
              aria-label="Parent network interface"
              placeholder="eth0"
              value={draft.parent}
              onChange={(parent) => onDraftChange({ ...draft,parent })}
            />
          )}
        </FormField>
      )}

      <FormGroup legend="Options">
        <SwitchControl
          checked={draft.internal}
          label="Internal"
          description="Restrict external connectivity"
          onChange={(internal) => onDraftChange({ ...draft,internal })}
        />
        <SwitchControl
          checked={draft.attachable}
          label="Attachable"
          description="Allow manual container attach"
          onChange={(attachable) => onDraftChange({ ...draft,attachable })}
        />
      </FormGroup>

      <FormField label="IPv4">
        <SwitchControl
          checked={draft.ipv4}
          label="Enable IPv4"
          onChange={(ipv4) => onDraftChange({ ...draft,ipv4 })}
        />
      </FormField>
      {draft.ipv4 && (
        <>
          <FormField label="Subnet" description="CIDR, e.g. 172.28.0.0/16">
            <InputControl
              aria-label="IPv4 subnet"
              placeholder="172.28.0.0/16"
              value={draft.subnet}
              onChange={(subnet) => onDraftChange({ ...draft,subnet })}
            />
          </FormField>
          <FormField label="Gateway">
            <InputControl
              aria-label="IPv4 gateway"
              placeholder="172.28.0.1"
              value={draft.gateway}
              onChange={(gateway) => onDraftChange({ ...draft,gateway })}
            />
          </FormField>
          <FormField label="IP range" description="Optional allocation range inside the subnet.">
            <InputControl
              aria-label="IPv4 IP range"
              placeholder="172.28.5.0/24"
              value={draft.ipRange}
              onChange={(ipRange) => onDraftChange({ ...draft,ipRange })}
            />
          </FormField>
          <FormField label="Aux addresses" description="One name=ip per line.">
            <TextareaControl
              aria-label="IPv4 aux addresses"
              className="container-list-field"
              placeholder="router=172.28.5.2"
              value={draft.auxAddressText}
              onChange={(auxAddressText) => onDraftChange({ ...draft,auxAddressText })}
            />
          </FormField>
        </>
      )}

      <FormField label="IPv6">
        <SwitchControl
          checked={draft.ipv6}
          label="Enable IPv6"
          onChange={(ipv6) => onDraftChange({ ...draft,ipv6 })}
        />
      </FormField>
      {draft.ipv6 && (
        <>
          <FormField label="IPv6 subnet">
            <InputControl
              aria-label="IPv6 subnet"
              placeholder="2001:db8:1::/64"
              value={draft.subnetV6}
              onChange={(subnetV6) => onDraftChange({ ...draft,subnetV6 })}
            />
          </FormField>
          <FormField label="IPv6 gateway">
            <InputControl
              aria-label="IPv6 gateway"
              placeholder="2001:db8:1::1"
              value={draft.gatewayV6}
              onChange={(gatewayV6) => onDraftChange({ ...draft,gatewayV6 })}
            />
          </FormField>
          <FormField label="IPv6 IP range">
            <InputControl
              aria-label="IPv6 IP range"
              placeholder="2001:db8:1::/80"
              value={draft.ipRangeV6}
              onChange={(ipRangeV6) => onDraftChange({ ...draft,ipRangeV6 })}
            />
          </FormField>
          <FormField label="IPv6 aux addresses" description="One name=ip per line.">
            <TextareaControl
              aria-label="IPv6 aux addresses"
              className="container-list-field"
              placeholder="router=2001:db8:1::2"
              value={draft.auxAddressV6Text}
              onChange={(auxAddressV6Text) => onDraftChange({ ...draft,auxAddressV6Text })}
            />
          </FormField>
        </>
      )}

      <FormField label="Driver options" description="One key=value option per line.">
        <TextareaControl
          aria-label="Network driver options"
          className="container-list-field"
          placeholder="com.docker.network.bridge.enable_icc=true"
          value={draft.optionsText}
          onChange={(optionsText) => onDraftChange({ ...draft,optionsText })}
        />
      </FormField>
      <FormField label="Labels" description="One key=value label per line.">
        <TextareaControl
          aria-label="Network labels"
          className="container-list-field"
          placeholder="env=lab"
          value={draft.labelsText}
          onChange={(labelsText) => onDraftChange({ ...draft,labelsText })}
        />
      </FormField>
    </ConfigDrawer>
  );
}
