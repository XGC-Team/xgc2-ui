import { ExternalLink } from 'lucide-react';
import { ControlButton,ControlLink } from '../../components/controls/ControlButton';
import { InputControl } from '../../components/controls/TextControls';
import { SelectControl } from '../../components/controls/SelectControl';
import { ConfigDrawer,ConfigDrawerDismissButton } from '../../components/ConfigDrawer';
import { CodeBlock,FormSection,FormSectionSpan,Notice } from '@xgc2/ui-react';
import { FormActions,FormField } from '../../components/FormPrimitives';
import { ListPageTag,ListPageTagRow } from '../../components/ListPage';
import { appCategoryLabel } from './appStoreCatalogModel';
import type { AppStoreApp,AppStoreDetail,AppStoreInstall,AppStoreVersionDiff } from './appStoreModel';
import './app-store-drawer.css';

export function AppDetailDrawer({ app,onClose,onInstall }: {
  app: AppStoreApp;
  onClose: () => void;
  onInstall: () => void;
}) {
  return (
    <ConfigDrawer
      title={app.name}
      onClose={onClose}
      closeOnBackdrop
      className="app-store-drawer-surface"
      bodyClassName="xgc-config-form"
      dataXgcRole="config-drawer"
      dataXgcId={app.key}
      footer={(
        <>
          <ConfigDrawerDismissButton>Cancel</ConfigDrawerDismissButton>
          <ControlButton tone="primary" onClick={onInstall} dataXgcRole="app-store-install-submit" dataXgcId={app.key}>Install</ControlButton>
        </>
      )}
    >
      <FormSection title="Overview" dataXgcRole="app-store-detail-overview" dataXgcId={app.key}>
        <FormSectionSpan className="app-store-drawer-overview" data-xgc-role="app-store-detail-hero" data-xgc-id={app.key}>
          <p className="app-store-drawer-description">{app.description || 'No description provided.'}</p>
          <ListPageTagRow className="app-store-drawer-tags" aria-label={`${app.name} tags`}>
            <ListPageTag data-xgc-kind="category">{appCategoryLabel(app.type)}</ListPageTag>
            {app.architectures.slice(0, 3).map((item) => (
              <ListPageTag data-xgc-kind="architecture" key={item}>{item}</ListPageTag>
            ))}
            {app.tags.map((item) => <ListPageTag key={item}>{item}</ListPageTag>)}
          </ListPageTagRow>
        </FormSectionSpan>
      </FormSection>
      {app.github && (
        <FormSection title="Links" dataXgcRole="app-store-detail-links" dataXgcId={app.key}>
          <FormSectionSpan className="app-store-drawer-links">
            <ControlLink size="compact" href={app.github} target="_blank" rel="noreferrer">
              <ExternalLink size={13} aria-hidden="true" /> GitHub
            </ControlLink>
          </FormSectionSpan>
        </FormSection>
      )}
    </ConfigDrawer>
  );
}

export function AppInstallDrawer({ app,details,version,busy,onVersionChange,onClose,onInstall }: {
  app: AppStoreApp;
  details: AppStoreDetail[];
  version: string;
  busy: boolean;
  onVersionChange: (version: string) => void;
  onClose: () => void;
  onInstall: () => void;
}) {
  return (
    <ConfigDrawer
      title={`Install ${app.name}`}
      subtitle={`${appCategoryLabel(app.type)} · verified catalog`}
      onClose={onClose}
      closeOnBackdrop={!busy}
      dismissible={!busy}
      className="app-store-drawer-install"
      bodyClassName="xgc-config-form"
      dataXgcRole="config-drawer"
      dataXgcId={app.key}
    >
      <FormSection title="Version" dataXgcRole="app-store-install-version" dataXgcId={app.key}>
        <FormField label="Catalog version" htmlFor="app-install-version">
          <SelectControl
            id="app-install-version"
            value={version}
            options={details.map((detail) => ({ value: detail.version,label: detail.version }))}
            onChange={onVersionChange}
            ariaLabel="Catalog version"
            dataXgcRole="app-install-version" dataXgcId="app-install-version"
            fill
          />
        </FormField>
      </FormSection>
      <Notice role="note" density="compact">
        Installation parameters, image verification, staging, health checks and rollback are handled automatically.
      </Notice>
      <FormActions status="Installation continues safely in the background.">
        <ConfigDrawerDismissButton disabled={busy}>Cancel</ConfigDrawerDismissButton>
        <ControlButton tone="primary" disabled={busy} onClick={onInstall} dataXgcRole="app-store-install-submit" dataXgcId={app.key}>{busy ? 'Submitting' : 'Install'}</ControlButton>
      </FormActions>
    </ConfigDrawer>
  );
}

export function InstalledDetailDrawer({ install,onClose }: { install: AppStoreInstall; onClose: () => void }) {
  return (
    <ConfigDrawer title="Installed app" subtitle={install.name} onClose={onClose} closeOnBackdrop bodyClassName="xgc-config-form">
      <FormSection title="Deployment" dataXgcRole="app-store-installed-deployment" dataXgcId={install.id}>
        <FormField label="Version"><InputControl readOnly value={install.version} /></FormField>
        <FormField label="Status"><InputControl readOnly value={install.status} /></FormField>
        <FormField label="Container"><InputControl readOnly value={install.containerName} /></FormField>
        <FormField label="Path"><InputControl readOnly value={install.installPath} /></FormField>
      </FormSection>
    </ConfigDrawer>
  );
}

export function VersionDiffDrawer({ diff,onClose }: { diff: AppStoreVersionDiff; onClose: () => void }) {
  return (
    <ConfigDrawer
      title="Version diff"
      subtitle={`${diff.appKey} ${diff.fromVersion} → ${diff.toVersion}`}
      onClose={onClose}
      closeOnBackdrop
      className="app-store-drawer-surface"
      bodyClassName="xgc-config-form"
    >
      <FormSection title="Parameters" dataXgcRole="app-store-diff-params" dataXgcId={diff.appKey}>
        <FormSectionSpan>
          <CodeBlock className="app-store-drawer-diff" content={diff.paramDiff} copyable={false}
            data-xgc-role="app-store-diff-body" data-xgc-id="params" />
        </FormSectionSpan>
      </FormSection>
      <FormSection title="Docker compose" dataXgcRole="app-store-diff-compose" dataXgcId={diff.appKey}>
        <FormSectionSpan>
          <CodeBlock className="app-store-drawer-diff" content={diff.composeDiff} copyable={false}
            data-xgc-role="app-store-diff-body" data-xgc-id="compose" />
        </FormSectionSpan>
      </FormSection>
    </ConfigDrawer>
  );
}

export function AppUninstallDrawer({ install,busy,onClose,onUninstall }: {
  install: AppStoreInstall;
  busy: boolean;
  onClose: () => void;
  onUninstall: () => void;
}) {
  return (
    <ConfigDrawer
      title={`Uninstall ${install.name}`}
      subtitle="The app will be stopped and removed safely."
      onClose={onClose}
      closeOnBackdrop={!busy}
      dismissible={!busy}
      footer={(
        <>
          <ConfigDrawerDismissButton disabled={busy}>Cancel</ConfigDrawerDismissButton>
          <ControlButton tone="danger" disabled={busy} onClick={onUninstall} dataXgcRole="app-store-uninstall-submit" dataXgcId={install.id}>{busy ? 'Submitting' : 'Uninstall'}</ControlButton>
        </>
      )}
    >
      <Notice role="note" density="compact">Uninstalling removes the deployed app from this target.</Notice>
    </ConfigDrawer>
  );
}
