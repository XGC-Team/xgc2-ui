import { useEffect,useMemo } from 'react';
import type { ApiTargetOptions } from '../../api/http';
import { useGroundStationNotification } from '../groundStationInteraction/groundStationInteractionPublic';
import { AppStoreSettings,type AppStoreSettingsLabels } from './AppStoreSettings';
import { useAppStoreSettingsSession } from './useAppStoreSettingsSession';
import { useAppStoreSnapshot } from './useAppStoreSnapshot';

/**
 * Image-registry settings for the shared Settings page.
 * Edits auto-save; no explicit Save / Sync actions.
 */
export function AppStoreSettingsSection({
  targetId = 'local',
  targetCoreId,
  title,
  labels,
}: {
  targetId?: string;
  targetCoreId?: string;
  title: string;
  labels?: Partial<AppStoreSettingsLabels>;
}) {
  const apiTarget = useMemo<ApiTargetOptions>(() => (targetCoreId ? { targetCoreId } : {}), [targetCoreId]);
  const targetKey = `${targetCoreId ?? ''}\u0000${targetId}`;
  const { error,refresh,setting } = useAppStoreSnapshot({ targetId,targetKey,apiTarget });
  const settings = useAppStoreSettingsSession({ targetId,apiTarget,setting });

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useGroundStationNotification(targetId, error, {
    title: 'App store settings',severity: 'error',source: 'app-store-settings',dedupeKey: 'app-store-settings:load-error',
  });
  useGroundStationNotification(targetId, settings.feedback?.text ?? '', {
    title: 'App store settings',
    severity: 'error',
    source: 'app-store-settings',
    dedupeKey: `app-store-settings:save:${settings.feedback?.text ?? ''}`,
  });

  return (
    <AppStoreSettings
      title={title}
      draft={settings.draft}
      labels={labels}
      onChange={settings.setDraft}
    />
  );
}

export type { AppStoreSettingsLabels };
