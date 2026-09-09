import { useState } from 'react';
import { Ellipsis } from 'lucide-react';
import { InputActionControl } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { InputControl,TextareaControl } from '../../components/controls/TextControls';
import { ConfigDrawer,ConfigDrawerDismissButton } from '../../components/ConfigDrawer';
import { CheckboxControl,FormField } from '../../components/FormPrimitives';
import { AutomationPathPicker } from '../automation/automationPublic';
import type { ComposeDraft } from './containerViewModel';

/**
 * Create compose project drawer.
 * Workdir reuses shared InputActionControl + host path browser (AutomationPathPicker).
 * There is no separate FileInput primitive — browse is input+action + domain path picker.
 */
export function ComposeCreateDrawer({
  draft,
  busy,
  targetId = 'local',
  onDraftChange,
  onClose,
  onCreate,
}: {
  draft: ComposeDraft;
  busy: boolean;
  targetId?: string;
  onDraftChange: (draft: ComposeDraft) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  const [workdirPickerOpen, setWorkdirPickerOpen] = useState(false);

  return (
    <>
      <ConfigDrawer
        title="Create compose project"
        onClose={onClose}
        closeOnBackdrop={!busy}
        dismissible={!busy}
        bodyClassName="container-form-body"
        dataXgcRole="container-compose-create-drawer" dataXgcId="container-compose-create-drawer"
        footer={(
          <>
            <ConfigDrawerDismissButton disabled={busy}>Cancel</ConfigDrawerDismissButton>
            <ControlButton disabled={busy} tone="primary" onClick={onCreate} dataXgcRole="container-compose-create-submit" dataXgcId="container-compose-create-submit">Create and up</ControlButton>
          </>
        )}
      >
        <FormField label="Project name">
          <InputControl
            autoFocus
            placeholder="Compose project name"
            value={draft.name}
            onChange={(name) => onDraftChange({ ...draft,name })}
          />
        </FormField>
        <FormField label="Workdir" dataXgcRole="container-compose-workdir-field" dataXgcId="container-compose-workdir-field">
          <InputActionControl
            aria-label="Workdir"
            dataXgcRole="container-compose-workdir" dataXgcId="container-compose-workdir"
            placeholder="Empty uses ~/.xgc/compose/name. Browse picks a directory on the execution host."
            value={draft.path}
            actionLabel="Browse workdir"
            actionIcon={<Ellipsis size={16} aria-hidden="true" />}
            actionDisabled={busy}
            onValueChange={(path) => onDraftChange({ ...draft,path })}
            onAction={() => setWorkdirPickerOpen(true)}
          />
        </FormField>
        <FormField label="Environment">
          <TextareaControl
            className="container-list-field"
            placeholder=".env content"
            value={draft.env}
            onChange={(env) => onDraftChange({ ...draft,env })}
          />
        </FormField>
        <CheckboxControl
          checked={draft.forcePull}
          label="Pull images before up"
          onChange={(forcePull) => onDraftChange({ ...draft,forcePull })}
        />
        <FormField
          label="Compose file"
          description="YAML content written as docker-compose.yml under the workdir (not a host file path)."
        >
          <TextareaControl
            className="container-compose-file-editor"
            value={draft.file}
            onChange={(file) => onDraftChange({ ...draft,file })}
          />
        </FormField>
      </ConfigDrawer>

      {workdirPickerOpen && (
        <AutomationPathPicker
          targetId={targetId}
          kind="directory"
          value={draft.path}
          onSelect={(path) => {
            onDraftChange({ ...draft, path });
            setWorkdirPickerOpen(false);
          }}
          onClose={() => setWorkdirPickerOpen(false)}
        />
      )}
    </>
  );
}
