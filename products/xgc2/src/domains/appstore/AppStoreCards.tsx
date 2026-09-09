import { RotateCw,Settings,Square,Trash2 } from 'lucide-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { ListPageTag,ListPageTagRow } from '../../components/ListPage';
import { Button,StatusText } from '@xgc2/ui-react';
import { appCategoryLabel } from './appStoreCatalogModel';
import type {
  AppStoreApp,
  AppStoreDetail,
  AppStoreInstall,
  AppStoreInstallOperation,
} from './appStoreModel';
import './app-store-card.css';

export function StoreCard({ app,installed,update,busy = false,onOpenDetail,onInstall }: {
  app: AppStoreApp;
  installed?: AppStoreInstall;
  update?: boolean;
  busy?: boolean;
  onOpenDetail: () => void;
  onInstall: () => void;
}) {
  const installing = busy || installed?.status === 'installing' || installed?.status === 'upgrading';
  return (
    <article className="app-store-card-surface" data-xgc-role="app-store-row" data-xgc-id={app.key} onClick={onOpenDetail}>
      <div className="app-store-card-body">
        <div className="app-store-card-head">
          <Button appearance="ghost" className="xgc-row-open-button" type="button" aria-label={`Open ${app.name} details`} onClick={(event) => { event.stopPropagation();onOpenDetail(); }}>
            <strong title={app.name}>{app.name}</strong>
          </Button>
          <StatusText className="app-store-card-status" status={installed?.status ?? 'not-installed'}>
            {update ? 'update' : installed ? installed.status : 'not installed'}
          </StatusText>
        </div>
        <p className="app-store-card-description" title={app.description}>{app.description}</p>
        <div className="app-store-card-footer">
          <ListPageTagRow className="app-store-card-meta" aria-label={`${app.name} metadata`}>
            <ListPageTag data-xgc-kind="category">{appCategoryLabel(app.type)}</ListPageTag>
            {app.architectures.slice(0, 2).map((item) => (
              <ListPageTag data-xgc-kind="architecture" key={item}>{item}</ListPageTag>
            ))}
          </ListPageTagRow>
          <div className="app-store-card-actions" onClick={(event) => event.stopPropagation()}>
            <ControlButton size="compact" onClick={onOpenDetail} dataXgcRole="app-store-detail" dataXgcId={app.key}>Detail</ControlButton>
            <ControlButton size="compact" tone="primary" disabled={installing} onClick={onInstall} dataXgcRole="app-store-install" dataXgcId={app.key}>
              {installing ? update ? 'Upgrading' : 'Installing' : update ? 'Upgrade' : 'Install'}
            </ControlButton>
          </div>
        </div>
      </div>
    </article>
  );
}

export function InstalledCard({ install,app,latestDetail,busy,onOperate,onOpenParams,onShowDiff,onUninstall }: {
  install: AppStoreInstall;
  app?: AppStoreApp;
  latestDetail?: AppStoreDetail;
  busy: boolean;
  onOperate: (id: string, operation: AppStoreInstallOperation, version?: string) => void;
  onOpenParams: () => void;
  onShowDiff: (version?: string) => void;
  onUninstall: () => void;
}) {
  const stopped = install.status === 'stopped';
  const canUpgrade = latestDetail && latestDetail.version !== install.version;
  return (
    <article className="app-store-card-surface" data-xgc-kind="installed" data-xgc-role="app-install-row" data-xgc-id={install.id}>
      <div className="app-store-card-body">
        <div className="app-store-card-head">
          <strong title={install.name}>{install.name}</strong>
          <StatusText status={install.status}>{install.status}</StatusText>
        </div>
        <p>{app?.name ?? install.appKey} · {install.version}</p>
        <ListPageTagRow className="app-store-card-meta" aria-label={`${install.name} install metadata`}>
          <ListPageTag>Latest {latestDetail?.version ?? install.version}</ListPageTag>
          <ListPageTag>Port {install.httpPort || 'n/a'}</ListPageTag>
          <ListPageTag>{install.containerName}</ListPageTag>
          <ListPageTag>{install.source}</ListPageTag>
        </ListPageTagRow>
        <p className="app-store-card-install-path" title={install.installPath}>{install.installPath}</p>
        <div className="app-store-card-actions">
          {canUpgrade && <ControlButton size="compact" tone="primary" disabled={busy} onClick={() => onOperate(install.id, 'upgrade', latestDetail?.version)} dataXgcRole="app-install-upgrade" dataXgcId={install.id}>Upgrade</ControlButton>}
          {canUpgrade && <ControlButton size="compact" onClick={() => onShowDiff(latestDetail?.version)} dataXgcRole="app-install-diff" dataXgcId={install.id}>Diff</ControlButton>}
          <ControlButton size="compact" onClick={onOpenParams} dataXgcRole="app-install-params" dataXgcId={install.id}><Settings size={13} aria-hidden="true" /> Details</ControlButton>
          <ControlButton size="compact" disabled={busy} onClick={() => onOperate(install.id, 'restart')} dataXgcRole="app-install-restart" dataXgcId={install.id}><RotateCw size={13} aria-hidden="true" /> Restart</ControlButton>
          <ControlButton size="compact" disabled={busy} onClick={() => onOperate(install.id, stopped ? 'start' : 'stop')} dataXgcRole="app-install-stop" dataXgcId={install.id}><Square size={13} aria-hidden="true" /> {stopped ? 'Start' : 'Stop'}</ControlButton>
          <ControlButton size="compact" tone="danger" disabled={busy} onClick={onUninstall} dataXgcRole="app-install-uninstall" dataXgcId={install.id}><Trash2 size={13} aria-hidden="true" /> Uninstall</ControlButton>
        </div>
      </div>
    </article>
  );
}
