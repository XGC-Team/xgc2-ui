import type { Dispatch,SetStateAction } from 'react';
import { Notice } from '@xgc2/ui-react';
import { ConfigDrawer } from '../../../components/ConfigDrawer';
import type { VideoSettings,VideoSourceCatalog } from '../../../domains/recording/recordingPublic';
import { useVideoProductionText } from './videoProductionMessages';
import { VideoSourceSettings } from './VideoSourceSettings';
import { VideoClockSyncCard } from './VideoEditingCards';
import type { VideoEditingDraft,VideoEditingIssue } from './videoEditingModel';

/** Setup drawers of the studio. Clip, output and recipe controls live in the
 * inspector and top bar; only source bindings and clock mappings open here. */
export type VideoSettingsSection = 'clip' | 'clock';

export function VideoWorkbenchSettings({ id,section,onClose,bagId,catalog,settings,setSettings,editing,setEditing,issue,clockIssues }: {
  id: string;section: VideoSettingsSection;onClose: () => void;bagId: string;catalog?: VideoSourceCatalog;
  settings: VideoSettings;setSettings: Dispatch<SetStateAction<VideoSettings>>;
  editing: VideoEditingDraft;setEditing: Dispatch<SetStateAction<VideoEditingDraft>>;
  issue?: string;clockIssues: readonly VideoEditingIssue[];
}) {
  const t = useVideoProductionText();
  const titles = { clip: 'Sources & layers',clock: 'Clock sync' };
  return <ConfigDrawer title={t(titles[section])} onClose={onClose} closeOnBackdrop
    closeLabel={t('Close settings')} closeDataXgcRole="video-settings-close" closeDataXgcId={id}
    dataXgcRole="video-global-settings" dataXgcId={`${id}:${section}`} bodyClassName="video-settings-body">
    {section === 'clip' && bagId && <section className="video-workbench-card" aria-label={t('Sources & layers')} data-xgc-role="video-sources-card" data-xgc-id={id}>
      {catalog && <VideoSourceSettings id={id} catalog={catalog} value={settings} onChange={setSettings} />}
      {issue && <Notice tone="warning" density="compact">{t(issue)}</Notice>}
    </section>}
    {section === 'clock' && bagId && <VideoClockSyncCard id={id} catalog={catalog} mappings={editing.clockMappings}
      issues={clockIssues}
      onChange={(clockMappings) => setEditing((current) => ({ ...current,clockMappings }))} />}
  </ConfigDrawer>;
}
