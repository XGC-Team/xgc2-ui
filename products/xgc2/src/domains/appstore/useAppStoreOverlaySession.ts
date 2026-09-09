import { useEffect,useRef,useState } from 'react';
import { useConfirmationDialog } from '@xgc2/ui-react';
import type { ApiTargetOptions } from '../../api/http';
import { appDetailForVersion } from './appStoreCatalogModel';
import { getAppStoreInstallDiff } from './appStoreService';
import type {
  AppStoreApp,
  AppStoreDetail,
  AppStoreInstall,
  AppStoreInstallOperation,
  AppStoreVersionDiff,
} from './appStoreModel';

export function useAppStoreOverlaySession({ details,install,operateInstall,targetId,apiTarget }: {
  details: AppStoreDetail[];
  install: (appId: string, version: string) => Promise<boolean>;
  operateInstall: (id: string, operation: AppStoreInstallOperation, version?: string) => Promise<boolean>;
  targetId: string;
  apiTarget: ApiTargetOptions;
}) {
  const confirmation = useConfirmationDialog();
  const diffRequestRef = useRef(0);
  const [detailTarget, setDetailTarget] = useState<AppStoreApp | null>(null);
  const [installTarget, setInstallTarget] = useState<AppStoreApp | null>(null);
  const [installVersion, setInstallVersion] = useState('');
  const [installedTarget, setInstalledTarget] = useState<AppStoreInstall | null>(null);
  const [versionDiff, setVersionDiff] = useState<AppStoreVersionDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState('');
  const [uninstallTarget, setUninstallTarget] = useState<AppStoreInstall | null>(null);
  const activeDetail = installTarget
    ? appDetailForVersion(details, installTarget.key, installVersion)
    : undefined;

  useEffect(() => () => {
    diffRequestRef.current += 1;
  }, []);

  async function submitInstall() {
    if (!installTarget || !activeDetail) return;
    if (!await confirmation.confirm({
      title: 'Install application',
      message: `Install ${installTarget.name} ${activeDetail.version}?`,
      confirmLabel: 'Install',
      tone: 'primary',
    })) return;
    if (await install(installTarget.id, activeDetail.version)) setInstallTarget(null);
  }

  async function operate(id: string, operation: AppStoreInstallOperation, version?: string) {
    if (!await confirmation.confirm({
      title: `${operation[0]?.toUpperCase() ?? ''}${operation.slice(1)} application`,
      message: `Confirm ${operation} for this installed app?`,
      confirmLabel: operation,
      tone: operation === 'uninstall' ? 'danger' : 'primary',
    })) return;
    const accepted = await operateInstall(id, operation, version);
    if (accepted && operation === 'uninstall') setUninstallTarget(null);
  }

  async function showVersionDiff(install: AppStoreInstall, version?: string) {
    const request = diffRequestRef.current + 1;
    diffRequestRef.current = request;
    setDiffLoading(true);
    setDiffError('');
    try {
      const diff = await getAppStoreInstallDiff(install.id, targetId, version, apiTarget);
      if (diffRequestRef.current === request) setVersionDiff(diff);
    } catch (cause) {
      if (diffRequestRef.current === request) setDiffError(messageOf(cause));
    } finally {
      if (diffRequestRef.current === request) setDiffLoading(false);
    }
  }

  function openInstall(app: AppStoreApp, version?: string) {
    const detail = appDetailForVersion(details, app.key, version);
    setInstallTarget(app);
    setInstallVersion(detail?.version ?? '');
  }

  function installFromDetail(version?: string) {
    if (!detailTarget) return;
    const app = detailTarget;
    setDetailTarget(null);
    openInstall(app, version);
  }

  return {
    detailTarget,
    setDetailTarget,
    installTarget,
    setInstallTarget,
    installVersion,
    setInstallVersion,
    installedTarget,
    setInstalledTarget,
    versionDiff,
    setVersionDiff,
    diffLoading,
    diffError,
    uninstallTarget,
    setUninstallTarget,
    activeDetail,
    submitInstall,
    operate,
    showVersionDiff,
    openInstall,
    installFromDetail,
    confirmationDialog: confirmation.dialog,
  };
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
