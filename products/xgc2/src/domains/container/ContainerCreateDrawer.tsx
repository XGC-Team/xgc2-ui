import { ControlButton } from '../../components/controls/ControlButton';
import { InputControl,TextareaControl } from '../../components/controls/TextControls';
import { SelectControl } from '../../components/controls/SelectControl';
import { ConfigDrawer } from '../../components/ConfigDrawer';
import { FormField,SwitchControl } from '../../components/FormPrimitives';
import type { ContainerDraft } from './containerViewModel';

const restartPolicyOptions = [
  { value: 'no',label: 'no' },
  { value: 'unless-stopped',label: 'unless-stopped' },
  { value: 'always',label: 'always' },
  { value: 'on-failure',label: 'on-failure' },
];

export function ContainerCreateDrawer({
  draft,
  busy,
  onDraftChange,
  onClose,
  onCreate,
}: {
  draft: ContainerDraft;
  busy: boolean;
  onDraftChange: (draft: ContainerDraft) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  return (
    <ConfigDrawer
      title="Create container"
      onClose={onClose}
      bodyClassName="container-form-body"
      dataXgcRole="container-create-drawer" dataXgcId="container-create-drawer"
      footer={(
        <>
          <ControlButton onClick={onClose} dataXgcRole="container-create-cancel" dataXgcId="container-create-cancel">Cancel</ControlButton>
          <ControlButton disabled={busy} tone="primary" onClick={onCreate} dataXgcRole="container-create-submit" dataXgcId="container-create-submit">Create</ControlButton>
        </>
      )}
    >
      <FormField label="Name">
        <InputControl
          autoFocus
          value={draft.name}
          onChange={(name) => onDraftChange({ ...draft,name })}
        />
      </FormField>
      <FormField label="Image">
        <InputControl
          placeholder="nginx:alpine"
          value={draft.image}
          onChange={(image) => onDraftChange({ ...draft,image })}
        />
      </FormField>
      <FormField label="Ports" description="One mapping per line or comma-separated.">
        <TextareaControl
          className="container-list-field"
          placeholder="8080:80"
          value={draft.ports}
          onChange={(ports) => onDraftChange({ ...draft,ports })}
        />
      </FormField>
      <FormField label="Environment" description="One KEY=value entry per line.">
        <TextareaControl
          className="container-list-field"
          placeholder="KEY=value"
          value={draft.env}
          onChange={(env) => onDraftChange({ ...draft,env })}
        />
      </FormField>
      <FormField label="Volumes" description="One host:container mapping per line.">
        <TextareaControl
          className="container-list-field"
          placeholder="/host:/container"
          value={draft.volumes}
          onChange={(volumes) => onDraftChange({ ...draft,volumes })}
        />
      </FormField>
      <FormField label="Command">
        <InputControl
          value={draft.command}
          onChange={(command) => onDraftChange({ ...draft,command })}
        />
      </FormField>
      <FormField label="Restart policy">
        <SelectControl
          ariaLabel="Restart policy"
          dataXgcRole="container-restart-policy" dataXgcId="container-restart-policy"
          fill
          options={restartPolicyOptions}
          value={draft.restartPolicy}
          onChange={(restartPolicy) => onDraftChange({ ...draft,restartPolicy })}
        />
      </FormField>
      <SwitchControl
        checked={draft.privileged}
        label="Privileged"
        onChange={(privileged) => onDraftChange({ ...draft,privileged })}
      />
    </ConfigDrawer>
  );
}
