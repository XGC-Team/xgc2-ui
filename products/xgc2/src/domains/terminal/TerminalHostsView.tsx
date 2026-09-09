import { Plus,Server,Trash2,X } from 'lucide-react';
import { useRef,useState } from 'react';
import { FormSection } from '@xgc2/ui-react';
import { ConfigDrawer } from '../../components/ConfigDrawer';
import { ControlButton } from '../../components/controls/ControlButton';
import { InputControl,TextareaControl } from '../../components/controls/TextControls';
import { SelectControl } from '../../components/controls/SelectControl';
import { FormActions,FormField,SwitchControl } from '../../components/FormPrimitives';
import {
  ListPage,
  ListPageHost,
  ListPageItemActions,
  ListPageItemMain,
  ListPageRow,
  ListPageTag,
  ListPageTagButton,
} from '../../components/ListPage';
import type { TerminalHost } from './terminalModel';
import {
  terminalHostGroupValidationError,
  terminalHostIDValidationError,
} from './terminalCatalogModel';
import { terminalGroupLabel,useTerminalText } from './terminalMessages';
import type { TerminalResourceCatalogBusy } from './useTerminalResourceCatalog';

type TerminalHostFolder = { id: string; title: string; items: TerminalHost[] };

export type TerminalHostsViewProps = {
  hosts: TerminalHost[];
  folders: TerminalHostFolder[];
  groups: string[];
  query: string;
  groupFilter: string;
  collapsedFolders: string[];
  draft: TerminalHost;
  drawerOpen: boolean;
  error: string;
  busy: TerminalResourceCatalogBusy;
  onQueryChange: (query: string) => void;
  onGroupFilterChange: (group: string) => void;
  onCollapsedFoldersChange: (folders: string[]) => void;
  onDraftChange: (draft: TerminalHost) => void;
  onDrawerOpenChange: (open: boolean) => void;
  onCreate: () => void;
  onConnect: (host: TerminalHost) => void;
  onEdit: (host: TerminalHost) => void;
  onDelete: (hostId: string) => void | Promise<boolean>;
  onResetGroup: (host: TerminalHost) => void | Promise<boolean>;
  onMove: (host: TerminalHost,group: string) => void | Promise<boolean>;
  onSave: () => void | Promise<boolean>;
};

export function TerminalHostsView({
  hosts,
  folders,
  groups,
  query,
  groupFilter,
  collapsedFolders,
  draft,
  drawerOpen,
  error,
  busy,
  onQueryChange,
  onGroupFilterChange,
  onCollapsedFoldersChange,
  onDraftChange,
  onDrawerOpenChange,
  onCreate,
  onConnect,
  onEdit,
  onDelete,
  onResetGroup,
  onMove,
  onSave,
}: TerminalHostsViewProps) {
  const t = useTerminalText();
  const formRef = useRef<HTMLDivElement | null>(null);
  const [validationError,setValidationError]=useState('');

  function updateDraft(next:TerminalHost) {
    setValidationError('');
    onDraftChange(next);
  }

  function submit() {
    const admissionError=terminalHostIDValidationError(draft.id,true)
      || terminalHostGroupValidationError(draft.group);
    if (admissionError) {
      setValidationError(t(admissionError));
      return;
    }
    const invalidControl = Array.from(
      formRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea') ?? [],
    ).find((control) => !control.checkValidity());
    if (invalidControl) {
      invalidControl.reportValidity();
      return;
    }
    void onSave();
  }

  return (
    <>
      {/* Mutation failures stay inline in the drawer FormActions; no page-level banners. */}
      <ListPageHost className="xgc-workspace-full-span" data-xgc-role="terminal-hosts-page" data-xgc-id="terminal-hosts-page">
        <ListPage<TerminalHost>
          createLabel={t('New')}
          createRole="terminal-host-create"
          onCreate={onCreate}
          search={{ value: query,placeholder: t('Search hosts'),onChange: onQueryChange,role: 'terminal-host-search' }}
          controls={(
            <SelectControl
              value={groupFilter}
              options={groups.map((group) => ({ value: group,label: terminalGroupLabel(group,t) }))}
              onChange={onGroupFilterChange}
              icon={<Server size={15} />}
              ariaLabel={t('Host group')}
              dataXgcRole="terminal-host-group-filter" dataXgcId="terminal-host-group-filter"
            />
          )}
          folders={folders.map((folder) => ({ ...folder,title: terminalGroupLabel(folder.title,t) }))}
          collapsedFolders={collapsedFolders}
          onToggleFolder={(folder) => onCollapsedFoldersChange(toggleItem(collapsedFolders,folder))}
          getFolderProps={(folder) => ({
            'data-xgc-role': 'terminal-host-folder',
            'data-xgc-id': folder.id,
          })}
          drag={busy.move ? undefined : {
            mimeType: 'text/xgc-terminal-host-id',
            getItemId: (host) => host.id,
            onMove: (id,folder) => {
              const host = hosts.find((item) => item.id === id);
              if (host && host.group !== folder) void onMove(host,folder);
            },
          }}
          emptyTitle={hosts.length === 0 ? t('No hosts yet') : t('No matching hosts')}
          emptyDescription={hosts.length === 0 ? t('Use New to add an SSH host.') : undefined}
          listClassName="terminal-list-shell"
          dataXgcRole="terminal-hosts-list" dataXgcId="terminal-hosts-list"
          renderItem={(host,dragProps) => (
            <ListPageRow
              as="div"
              className="terminal-host-row"
              key={host.id}
              data-xgc-role="terminal-host-row"
              data-xgc-id={host.id}
              {...dragProps}
            >
              <ListPageItemMain
                title={host.name}
                description={`${host.user}@${host.address}:${host.port}`}
                icon={Server}
                openLabel={t('Connect {name}', { name: host.name })}
                onOpen={() => onConnect(host)}
                tagRowRole="terminal-host-tags"
                tagRowId={host.id}
              >
                <ListPageTagButton disabled={busy.move} title={t('Reset group')} onClick={(event) => { event.stopPropagation();void onResetGroup(host); }}>
                  <span>{terminalGroupLabel(host.group,t)}</span>
                  {host.group !== 'Hosts' && <X size={12} />}
                </ListPageTagButton>
                <ListPageTag>{host.authMode}</ListPageTag>
                <ListPageTagButton variant="edit" title={t('Edit group')} aria-label={t('Edit group')} onClick={(event) => { event.stopPropagation();onEdit(host); }}>
                  <Plus size={12} />
                </ListPageTagButton>
              </ListPageItemMain>
              <ListPageItemActions className="terminal-row-actions" onClick={(event) => event.stopPropagation()}>
                <ControlButton size="compact" tone="success" dataXgcRole="terminal-host-connect" dataXgcId={host.id} onClick={() => onConnect(host)}>{t('Connect')}</ControlButton>
                <ControlButton size="compact" dataXgcRole="terminal-host-edit" dataXgcId={host.id} onClick={() => onEdit(host)}>{t('Edit')}</ControlButton>
                <ControlButton iconOnly size="compact" tone="danger" disabled={busy.remove} aria-busy={busy.remove || undefined} aria-label={t('Delete {name}', { name: host.name })} dataXgcRole="terminal-host-delete" dataXgcId={host.id} onClick={() => void onDelete(host.id)}><Trash2 size={13} /></ControlButton>
              </ListPageItemActions>
            </ListPageRow>
          )}
        />
      </ListPageHost>
      <ConfigDrawer
        title={draft.id ? t('Edit host') : t('New host')}
        open={drawerOpen}
        dismissible={!busy.save}
        onClose={() => onDrawerOpenChange(false)}
        closeOnBackdrop
        bodyClassName="xgc-config-form"
        dataXgcRole="terminal-host-drawer" dataXgcId="terminal-host-drawer"
      >
        <div ref={formRef} className="terminal-form-card xgc-config-form" role="form" aria-label={t('Host credentials')} data-xgc-role="terminal-host-form" data-xgc-id="terminal-host-form" {...sshCredentialManagerIgnoreProps}>
          <FormSection title={t('Connection')} dataXgcRole="terminal-host-connection" dataXgcId="terminal-host-connection">
            <FormField label={t('Name')} htmlFor="terminal-host-name"><InputControl id="terminal-host-name" value={draft.name} onChange={(name) => updateDraft({ ...draft,name })} /></FormField>
            <FormField label={t('Group')} htmlFor="terminal-host-group" required><InputControl
              id="terminal-host-group"
              required
              title={t('Use an explicit host group; Default is not allowed.')}
              value={draft.group}
              onChange={(group) => updateDraft({ ...draft,group })}
            /></FormField>
            <FormField label={t('Address')} htmlFor="terminal-host-address" required><InputControl id="terminal-host-address" required value={draft.address} onChange={(address) => updateDraft({ ...draft,address })} /></FormField>
            <FormField label={t('Port')} htmlFor="terminal-host-port"><InputControl id="terminal-host-port" type="number" min={1} max={65535} step={1} value={draft.port} onChange={(port) => updateDraft({ ...draft,port: Number(port) })} /></FormField>
            <FormField label={t('User')} htmlFor="terminal-host-user" required><InputControl id="terminal-host-user" required value={draft.user} onChange={(user) => updateDraft({ ...draft,user })} {...sshCredentialManagerIgnoreProps} /></FormField>
          </FormSection>
          <FormSection title={t('Credentials')} dataXgcRole="terminal-host-credentials" dataXgcId="terminal-host-credentials">
            {/*
              Stage policy: password-only login over real SSH (including 127.0.0.1).
              Private-key auth is disabled. Password may be left empty when not
              remembering the secret; Connect prompts when needed.
            */}
            <FormField
              label={t('Password')}
              htmlFor="terminal-host-password"
              tooltip={t('Optional to save. If empty (and not already stored), you will be asked for the password each time you connect. Password is used only for that SSH session.')}
            >
              <InputControl
                id="terminal-host-password"
                type="password"
                value={draft.password ?? ''}
                onChange={(password) => updateDraft({ ...draft,authMode: 'password',password })}
                {...sshSecretCredentialProps}
              />
            </FormField>
            <SwitchControl
              checked={draft.rememberPassword}
              label={t('Remember password')}
              description={t('Off: do not store the password. On: save for later connects.')}
              onChange={(rememberPassword) => updateDraft({ ...draft,rememberPassword })}
            />
          </FormSection>
          <FormSection title={t('Notes')} dataXgcRole="terminal-host-notes" dataXgcId="terminal-host-notes">
            <FormField label={t('Description')} htmlFor="terminal-host-description"><TextareaControl id="terminal-host-description" value={draft.description} onChange={(description) => updateDraft({ ...draft,description })} /></FormField>
          </FormSection>
          <FormActions status={validationError || error || undefined}>
            <ControlButton size="compact" tone="primary" disabled={busy.save} aria-busy={busy.save || undefined} onClick={submit} dataXgcRole="terminal-host-save" dataXgcId={draft.id ?? 'new'}>{busy.save ? t('Saving...') : t('Save')}</ControlButton>
          </FormActions>
        </div>
      </ConfigDrawer>
    </>
  );
}

const sshCredentialManagerIgnoreProps = {
  autoComplete: 'off',
  'data-1p-ignore': 'true',
  'data-bwignore': 'true',
  'data-form-type': 'other',
  'data-lpignore': 'true',
} as const;

const sshSecretCredentialProps = {
  ...sshCredentialManagerIgnoreProps,
  autoComplete: 'new-password',
} as const;

function toggleItem(items: string[],item: string) {
  return items.includes(item) ? items.filter((candidate) => candidate !== item) : [...items,item];
}
