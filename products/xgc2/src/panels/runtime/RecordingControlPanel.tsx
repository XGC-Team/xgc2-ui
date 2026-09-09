import { useCallback,useEffect,useRef,useState } from 'react';
import { Download,RefreshCw } from 'lucide-react';
import { EmptyState,Inline,Notice } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import {
  downloadROSBagRecording,
  listROSBagRecordings,
  type ROSBagRecording,
} from '../../domains/recording/recordingPublic';
import type { PanelPluginProps } from '../types';
import { PanelActionControl } from '../PanelPortControls';
import { ROSBAG_RECORDING_WORKFLOW_SLOT } from './recordingControlPanelModel';
import { experimentIdFromArtifactsPort } from './rosbagPlotPanelModel';
import '../../styles/recording-control.css';
import { useRuntimePanelText } from './runtimeMessages';

export function RecordingControlPanel({ panel,context }: PanelPluginProps<readonly ['visualization','experiment']>) {
  const t = useRuntimePanelText();
  const recording = context.ports.actions[ROSBAG_RECORDING_WORKFLOW_SLOT];
  const artifacts = context.ports.data['recording-artifacts'];
  const experimentId = artifacts?.connected ? experimentIdFromArtifactsPort(artifacts.value) : '';
  return (
    <section className="recording-control-panel" data-xgc-role="recording-control" data-xgc-id={panel.id}>
      <PanelActionControl port={recording} label={t('Recording')} />
      {experimentId && <RecordingArtifacts
        key={experimentId}
        experimentId={experimentId}
        panelId={panel.id}
        recordingStatus={recording?.activeInvocation?.status}
      />}
    </section>
  );
}

function RecordingArtifacts({ experimentId,panelId,recordingStatus }: {
  experimentId: string;
  panelId: string;
  recordingStatus?: string;
}) {
  const t = useRuntimePanelText();
  const [bags,setBags] = useState<ROSBagRecording[]>([]);
  const [loaded,setLoaded] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [incomplete,setIncomplete] = useState(false);
  const [nextOffset,setNextOffset] = useState<number>();
  const [downloading,setDownloading] = useState<string>();
  const requestRef = useRef<AbortController | null>(null);
  const downloadRef = useRef<AbortController | null>(null);

  const load = useCallback(async (offset = 0) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true);
    setError('');
    try {
      const page = await listROSBagRecordings({ experimentId,offset },controller.signal);
      if (controller.signal.aborted) return;
      setBags((current) => offset === 0 ? page.items : [
        ...current,
        ...page.items.filter((bag) => !current.some((previous) => previous.id === bag.id)),
      ]);
      setLoaded(true);
      setNextOffset(page.truncated ? page.nextOffset : undefined);
      setIncomplete(Boolean(page.attributionTruncated || (page.truncated && page.nextOffset === undefined)));
    } catch (cause) {
      if (!controller.signal.aborted) setError(messageOf(cause));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  },[experimentId]);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  },[load,recordingStatus]);
  useEffect(() => () => downloadRef.current?.abort(),[]);

  async function download(bag: ROSBagRecording) {
    if (downloading) return;
    const controller = new AbortController();
    downloadRef.current = controller;
    setDownloading(bag.id);
    setError('');
    try {
      const blob = await downloadROSBagRecording(bag.id,controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = bag.name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      if (!controller.signal.aborted) setError(messageOf(cause));
    } finally {
      if (!controller.signal.aborted) setDownloading(undefined);
    }
  }

  return (
    <section className="recording-control-artifacts" aria-label={t('Recorded bags')}
      aria-busy={busy} data-xgc-role="recording-artifact-projection" data-xgc-id={panelId}>
      <header className="recording-control-artifacts-header">
        <strong>{t('Recorded bags')}</strong>
        <ControlButton iconOnly size="compact" aria-label={t('Refresh recorded bags')}
          dataXgcRole="recording-artifacts-refresh" dataXgcId={panelId}
          disabled={busy} onClick={() => void load()}>
          <RefreshCw size={14} aria-hidden="true" />
        </ControlButton>
      </header>
      {error && <Notice tone="danger" density="compact" data-xgc-role="recording-artifacts-error" data-xgc-id={panelId}>{error}</Notice>}
      {incomplete && <Notice tone="warning" density="compact">{t('Some recording history is unavailable.')}</Notice>}
      {loaded && bags.length === 0 && !error && <EmptyState appearance="plain" density="compact" title={t('No recorded bags')} />}
      {bags.length > 0 && <ul className="recording-control-artifact-list">
        {bags.map((bag) => (
          <li className="recording-control-artifact" key={bag.id} data-xgc-role="recording-artifact" data-xgc-id={`${panelId}:${bag.id}`}>
            <div className="recording-control-artifacts">
              <span className="recording-control-artifact-name" data-xgc-role="recording-artifact-name" data-xgc-id={`${panelId}:${bag.id}`}>{bag.name}</span>
              <Inline gap="compact" wrap>
                <time className="recording-control-artifact-meta" dateTime={bag.createdAt}
                  data-xgc-role="recording-artifact-time" data-xgc-id={`${panelId}:${bag.id}`}>{new Date(bag.createdAt).toLocaleString()}</time>
                <span className="recording-control-artifact-meta" data-xgc-role="recording-artifact-size" data-xgc-id={`${panelId}:${bag.id}`}>{formatSize(bag.size)}</span>
              </Inline>
            </div>
            <ControlButton iconOnly size="compact" aria-label={t('Download recorded bag {name}',{ name: bag.name })}
              dataXgcRole="recording-artifact-download" dataXgcId={`${panelId}:${bag.id}`}
              disabled={Boolean(downloading)} aria-busy={downloading === bag.id || undefined}
              onClick={() => void download(bag)}><Download size={14} aria-hidden="true" /></ControlButton>
          </li>
        ))}
      </ul>}
      {nextOffset !== undefined && <ControlButton size="compact" disabled={busy}
        dataXgcRole="recording-artifacts-more" dataXgcId={panelId} onClick={() => void load(nextOffset)}>
        {t('Load older')}
      </ControlButton>}
    </section>
  );
}

function messageOf(cause: unknown) { return cause instanceof Error ? cause.message : String(cause); }

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB','MB','GB','TB'];
  const exponent = Math.min(units.length,Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** exponent).toLocaleString(undefined,{ maximumFractionDigits: 1 })} ${units[exponent - 1]}`;
}
