import { ControlButton } from '../../components/controls/ControlButton';
import { InputControl,TextareaControl } from '../../components/controls/TextControls';
import { SelectControl } from '../../components/controls/SelectControl';
import { ConfigDrawer,ConfigDrawerDismissButton } from '../../components/ConfigDrawer';
import { Notice } from '@xgc2/ui-react';
import { FormField,SwitchControl } from '../../components/FormPrimitives';
import { volumeDraftIsValid,type VolumeDraft } from './containerViewModel';

export function VolumeCreateDrawer({
  draft,
  busy,
  error,
  onDraftChange,
  onClose,
  onCreate,
}: {
  draft: VolumeDraft;
  busy: boolean;
  error?: string;
  onDraftChange: (draft: VolumeDraft) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  const canCreate = volumeDraftIsValid(draft) && !busy;
  return (
    <ConfigDrawer
      title="Create volume"
      onClose={onClose}
      closeOnBackdrop={!busy}
      dismissible={!busy}
      bodyClassName="container-form-body"
      dataXgcRole="container-volume-create-drawer" dataXgcId="container-volume-create-drawer"
      footer={(
        <>
          <ConfigDrawerDismissButton disabled={busy}>Cancel</ConfigDrawerDismissButton>
          <ControlButton
            disabled={!canCreate}
            title={!volumeDraftIsValid(draft)
              ? (draft.nfsEnabled
                ? 'Name, NFS address, and remote mount path are required'
                : 'Volume name is required')
              : undefined}
            tone="primary"
            onClick={onCreate}
            dataXgcRole="container-volume-create-submit"
            dataXgcId="container-volume-create-submit"
          >
            {busy ? 'Creating' : 'Create'}
          </ControlButton>
        </>
      )}
    >
      {error ? <Notice density="compact" tone="danger">{error}</Notice> : null}
      <FormField label="Name" htmlFor="volume-create-name">
        <InputControl
          id="volume-create-name"
          autoFocus
          value={draft.name}
          onChange={(name) => onDraftChange({ ...draft,name })}
          aria-label="Volume name"
          placeholder="app-data"
        />
      </FormField>
      <FormField label="Driver" htmlFor="volume-create-driver" description="Docker volume driver name (local is the default).">
        <InputControl
          id="volume-create-driver"
          dataXgcRole="volume-create-driver" dataXgcId="volume-create-driver"
          value={draft.driver}
          onChange={(driver) => onDraftChange({ ...draft,driver })}
          aria-label="Driver"
          placeholder="local"
        />
      </FormField>
      <FormField label="NFS volume">
        <SwitchControl
          checked={draft.nfsEnabled}
          onChange={(nfsEnabled) => onDraftChange({ ...draft,nfsEnabled })}
          label="Mount remote NFS export as a local volume"
          ariaLabel="Enable NFS volume"
        />
      </FormField>
      {draft.nfsEnabled && (
        <>
          <FormField label="NFS address" htmlFor="volume-nfs-address">
            <InputControl
              id="volume-nfs-address"
              value={draft.nfsAddress}
              onChange={(nfsAddress) => onDraftChange({ ...draft,nfsAddress })}
              placeholder="nfs.example.com"
              aria-label="NFS address"
            />
          </FormField>
          <FormField label="NFS version">
            <SelectControl
              dataXgcRole="volume-nfs-version" dataXgcId="volume-nfs-version"
              value={draft.nfsVersion}
              options={[
                { value: 'v3',label: 'NFS v3' },
                { value: 'v4',label: 'NFS v4' },
              ]}
              onChange={(nfsVersion) => onDraftChange({ ...draft,nfsVersion: nfsVersion as VolumeDraft['nfsVersion'] })}
              ariaLabel="NFS version"
              fill
            />
          </FormField>
          <FormField label="Remote mount path" htmlFor="volume-nfs-mount">
            <InputControl
              id="volume-nfs-mount"
              value={draft.nfsMount}
              onChange={(nfsMount) => onDraftChange({ ...draft,nfsMount })}
              placeholder="/export/data"
              aria-label="NFS mount path"
            />
          </FormField>
          <FormField label="NFS options" htmlFor="volume-nfs-option">
            <InputControl
              id="volume-nfs-option"
              value={draft.nfsOption}
              onChange={(nfsOption) => onDraftChange({ ...draft,nfsOption })}
              aria-label="NFS options"
            />
          </FormField>
        </>
      )}
      <FormField label="Driver options" description="One key=value per line (e.g. type=nfs4). NFS wizard fills these automatically when enabled.">
        <TextareaControl
          className="container-list-field"
          value={draft.optionsText}
          onChange={(optionsText) => onDraftChange({ ...draft,optionsText })}
          aria-label="Driver options"
          placeholder={"type=nfs4\no=addr=10.0.0.1,rw\ndevice=:/export"}
        />
      </FormField>
      <FormField label="Labels" description="One KEY=value per line.">
        <TextareaControl
          className="container-list-field"
          value={draft.labelsText}
          onChange={(labelsText) => onDraftChange({ ...draft,labelsText })}
          aria-label="Volume labels"
          placeholder="env=lab\nteam=xgc"
        />
      </FormField>
    </ConfigDrawer>
  );
}
