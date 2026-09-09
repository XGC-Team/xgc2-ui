import { useState } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { InputControl } from '../../components/controls/TextControls';
import { SelectControl } from '../../components/controls/SelectControl';
import { ConfigDrawer,ConfigDrawerDismissButton } from '../../components/ConfigDrawer';
import { Notice } from '@xgc2/ui-react';
import { FormActions,FormField } from '../../components/FormPrimitives';
import { listLabeledFieldChanges } from '../../shared/draftChangeSummary';
import { permitRootLoginOptions,type SSHDrawerDraft,validateSSHPorts } from './hostServicesModel';
import './HostSSHConfigDrawer.css';

export function HostSSHConfigDrawer({ draft,onClose,onSave }: {
  draft: SSHDrawerDraft;
  onClose: () => void;
  onSave: (value: string) => void;
}) {
  const [value,setValue] = useState(draft.value);
  const [error,setError] = useState('');
  const dirty = value !== draft.value;
  const fieldLabel = draft.type === 'root' ? 'Permit root login' : draft.title;
  const discardChanges = dirty
    ? listLabeledFieldChanges(
      { value: draft.value },
      { value },
      { value: fieldLabel },
    )
    : [];
  const submit = () => {
    if (!dirty) return;
    const next = value.trim();
    if (draft.type === 'port' && !validateSSHPorts(next)) {
      setError('Use one or more ports from 1 to 65535, separated by commas.');
      return;
    }
    onSave(next);
  };
  return (
    <ConfigDrawer
      title={draft.title}
      subtitle="SSH base configuration"
      bodyClassName="xgc-host-ssh-config-form"
      onClose={onClose}
      closeOnBackdrop
      dirty={dirty}
      discardChanges={discardChanges}
    >
      <FormField label={fieldLabel} error={error || undefined}>
        {draft.type === 'root' ? (
          <SelectControl
            className="xgc-host-ssh-config-control"
            value={value}
            options={permitRootLoginOptions}
            ariaLabel="Permit root login"
            dataXgcRole="host-ssh-root-login" dataXgcId="host-ssh-root-login"
            fill
            onChange={setValue}
          />
        ) : (
          <InputControl
            className="xgc-host-ssh-config-control"
            value={value}
            placeholder={draft.type === 'address' ? '0.0.0.0,::' : '22'}
            aria-label={draft.title}
            onChange={setValue}
          />
        )}
      </FormField>
      {draft.type === 'address' && <Notice tone="info" density="compact">Leave empty to listen on all configured interfaces.</Notice>}
      <FormActions status="Changing SSH config restarts the SSH service.">
        <ConfigDrawerDismissButton size="compact">Cancel</ConfigDrawerDismissButton>
        <ControlButton size="compact" tone="primary" disabled={!dirty} onClick={submit} dataXgcRole="host-ssh-config-confirm" dataXgcId="host-ssh-config-confirm">Confirm</ControlButton>
      </FormActions>
    </ConfigDrawer>
  );
}
