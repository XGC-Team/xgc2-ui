import { formatOperatorDateTime } from '../../../shared/operatorTime';
import { useMemo,useState } from 'react';
import { ChevronDown,ChevronRight,Folder,Globe,RefreshCw } from 'lucide-react';
import { EmptyState } from '@xgc2/ui-react';
import { ControlButton } from '../../../components/controls/ControlButton';
import { PanelViewSwitcher } from '../../../components/PanelViewSwitcher';
import type { ROSBagRecording } from '../../../domains/recording/recordingPublic';
import { useVideoProductionText } from './videoProductionMessages';
import { videoBagLabel } from './videoProductionModel';
import { groupVideoSources,recordingModeLabel,recordingTime } from './videoSourceModel';

/**
 * Latest recordings grouped by their source Experiment. Missing acquisition
 * metadata is shown honestly; refreshing this list never chooses an input.
 */
export function VideoSourcePane({ id,bags,selectedId,busy,loaded,scope,onScopeChange,nextOffset,onSelect,onRefresh,onLoadOlder }: {
  id: string;
  bags: readonly ROSBagRecording[];
  selectedId: string;
  busy: boolean;
  loaded: boolean;
  scope: 'current' | 'all';
  onScopeChange: (scope: 'current' | 'all') => void;
  nextOffset?: number;
  onSelect: (bagId: string) => void;
  onRefresh: () => void;
  onLoadOlder: () => void;
}) {
  const t = useVideoProductionText();
  const [collapsed,setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const groups = useMemo(() => groupVideoSources(bags),[bags]);
  function toggleFolder(folder: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(folder)) next.delete(folder);else next.add(folder);
      return next;
    });
  }
  return <nav className="video-source-pane" aria-label={t('Archived bags')} data-xgc-role="video-source-pane" data-xgc-id={id}>
    <PanelViewSwitcher ariaLabel={t('Recording scope')} dataXgcRole="video-source-scopes" dataXgcId={id}
      optionDataXgcRole="video-source-scope" presentation="labels" value={scope} onChange={onScopeChange}
      items={[{ id:'current' as const,label:t('Current experiment'),icon:Folder },{ id:'all' as const,label:t('All recordings'),icon:Globe }]} />
    <div className="video-production-toolbar">
      <ControlButton size="compact" iconOnly disabled={busy} aria-label={t('Refresh archive')} title={t('Refresh archive')}
        dataXgcRole="video-production-refresh" dataXgcId={id} onClick={onRefresh}><RefreshCw size={13} aria-hidden="true" /></ControlButton>
      {nextOffset !== undefined && <ControlButton size="compact" disabled={busy} dataXgcRole="video-production-more" dataXgcId={id}
        onClick={onLoadOlder}>{t('Load older')}</ControlButton>}
    </div>
    {busy && <p role="status">{t('Loading recordings')}</p>}
    {loaded && !busy && groups.length === 0 && <EmptyState appearance="plain" title={t('No archived bags')} />}
    {groups.map(({ key: folder,name,items }) => {
      const isCollapsed = collapsed.has(folder);
      return <section className="video-source-group" key={folder || '(root)'} data-xgc-role="video-source-group" data-xgc-id={`${id}:${folder || 'root'}`}>
        <button type="button" className="video-source-group-toggle" aria-expanded={!isCollapsed}
          data-xgc-role="video-source-group-toggle" data-xgc-id={`${id}:${folder || 'root'}`}
          onClick={() => toggleFolder(folder)}>
          {isCollapsed ? <ChevronRight size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
          <Folder size={13} aria-hidden="true" />
          <span>{name || t('Experiment name unknown')}</span>
        </button>
        {!isCollapsed && items.map((bag) => (
          <button type="button" key={bag.id} className="video-source-bag" aria-pressed={bag.id === selectedId}
            data-xgc-role="video-source-bag" data-xgc-id={`${id}:${bag.id}`}
            onClick={() => onSelect(bag.id)}>
            <span>{videoBagLabel(bag)}</span>
            <small>{t(recordingModeLabel(bag.runMode))} · {recordingTime(bag) === undefined
              ? t('Recording time unknown')
              : formatOperatorDateTime(bag.startedAt!, undefined, { year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short' })}</small>
          </button>
        ))}
      </section>;
    })}
  </nav>;
}
