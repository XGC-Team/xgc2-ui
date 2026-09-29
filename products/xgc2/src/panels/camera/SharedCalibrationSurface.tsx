import { useEffect,useState } from 'react';
import { Camera,RefreshCw } from 'lucide-react';
import { Notice } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { useLocalizedText,type MessageCatalog } from '../../shared/localization/localizedText';
import {
  protocolEnum,protocolObject,protocolRequiredBoolean,protocolRequiredInteger,
} from '../../shared/strictProtocolDecoder';
import type { SharedSurfaceClient,SharedSurfaceProps } from '../../shared/sharedSurface';
import { CameraCalibrationDetectionPreview,CameraCalibrationStateFacts } from './CameraCalibrationReadonlyViews';
import '../../styles/camera-shared-calibration.css';

const MODULE_ID = 'experiment.calibration-readonly';
const VIEW_CONTRACT_VERSION = 1;
const STATE_ENDPOINT = 'calibration.state';
const IMAGE_ENDPOINT = 'calibration.image';
const STATE_ACTION = 'calibration.state.read';
const IMAGE_ACTION = 'calibration.image.read';
const STATE_PATH = '/api/access/entry/calibration/state';
const IMAGE_PATH = '/api/access/entry/calibration/image.jpg';

const zhMessages: MessageCatalog = {
  'Calibration': '标定',
  'Refresh': '刷新',
  'Collecting samples': '采集样本中',
  'Solving': '求解中',
  'Candidate ready': '候选结果就绪',
  'Saved': '已保存',
  'Phase': '阶段',
  'Samples': '样本数',
  'Coverage good enough': '覆盖度已足够',
  'Saved result loaded': '已载入已保存结果',
  'Yes': '是',
  'No': '否',
  'waiting': '等待中',
  'Calibration state could not be loaded.': '无法读取标定状态。',
  'Detection image is unavailable.': '检测图像不可用。',
  'Waiting for a detection result': '等待检测结果',
  'Annotated intrinsic calibration frame': '带标注的内参标定帧',
  'This entry does not include the calibration state.': '此入口不包含标定状态。',
  'This entry is not a readable calibration surface.': '此入口不是可读的标定表面。',
};

type SharedCalibrationState = {
  phase: 'collecting' | 'solving' | 'candidate_ready' | 'saved';
  sessionRevision: number;
  collectionRevision: number;
  samples: number;
  goodenough: boolean;
  imageReady: boolean;
  resultRestored: boolean;
};

function decodeSharedCalibrationState(value: unknown): SharedCalibrationState {
  const record = protocolObject(value, 'calibration.state', [
    'mode', 'phase', 'session_revision', 'collection_revision', 'samples', 'goodenough', 'image_ready', 'result_restored',
  ]);
  protocolEnum(record.mode, ['intrinsic'], 'calibration.state.mode');
  const count = (key: string) => {
    const value = protocolRequiredInteger(record, key, 'calibration.state');
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid calibration counter');
    return value;
  };
  return {
    phase: protocolEnum(record.phase, ['collecting', 'solving', 'candidate_ready', 'saved'], 'calibration.state.phase'),
    sessionRevision: count('session_revision'),
    collectionRevision: count('collection_revision'),
    samples: count('samples'),
    goodenough: protocolRequiredBoolean(record, 'goodenough', 'calibration.state'),
    imageReady: protocolRequiredBoolean(record, 'image_ready', 'calibration.state'),
    resultRestored: protocolRequiredBoolean(record, 'result_restored', 'calibration.state'),
  };
}

type CalibrationScope = { experimentId: string; sessionId: string; panelId: string };

function readCalibrationScope(projection: SharedSurfaceProps['projection']): CalibrationScope | undefined {
  if (projection.contractVersion !== 1 || projection.moduleId !== MODULE_ID
    || projection.viewContractVersion !== VIEW_CONTRACT_VERSION
    || !projection.actions.includes('surface.read')) return undefined;
  const surface = projection.surface;
  if (!surface || typeof surface !== 'object' || Array.isArray(surface)) return undefined;
  const record = surface as Record<string, unknown>;
  if (record.kind !== 'experiment-panel') return undefined;
  const stringField = (key: string) => {
    const value = record[key];
    return typeof value === 'string' && value !== '' && value.trim() === value ? value : undefined;
  };
  const experimentId = stringField('experimentId');
  const sessionId = stringField('sessionId');
  const panelId = stringField('panelId');
  const panel = projection.panel;
  if (!panel || typeof panel !== 'object' || Array.isArray(panel)) return undefined;
  const panelRecord = panel as Record<string, unknown>;
  if (panelRecord.id !== panelId || typeof panelRecord.pluginId !== 'string'
    || !['camera-intrinsic-calibration', 'camera-intrinsic-validation'].includes(panelRecord.pluginId)) return undefined;
  return experimentId && sessionId && panelId ? { experimentId, sessionId, panelId } : undefined;
}

/** An endpoint counts only when id, method, protocol, action and the projected action list all agree. */
function grantedGetEndpoint(projection: SharedSurfaceProps['projection'], endpointId: string, action: string, path: string): boolean {
  const matches = projection.endpoints.filter((candidate) => candidate.id === endpointId);
  if (matches.length !== 1) return false;
  const endpoint = matches[0];
  return endpoint.method === 'GET' && endpoint.protocol === 'http' && endpoint.path === path
    && endpoint.action === action && projection.actions.includes(action);
}

function statusOf(cause: unknown): number {
  return typeof cause === 'object' && cause !== null && typeof (cause as { status?: unknown }).status === 'number'
    ? (cause as { status: number }).status : 0;
}

/**
 * Read-only intrinsic calibration surface mounted from a shared access entry.
 * It only calls the projected calibration.state / calibration.image endpoints:
 * no write endpoints, and the detection image is never a plain camera snapshot.
 */
export function SharedCalibrationSurface(props: SharedSurfaceProps) {
  const t = useLocalizedText(zhMessages);
  const scope = readCalibrationScope(props.projection);
  if (!scope) {
    return <section className="camera-calibration-shared" data-xgc-role="camera-calibration-shared-surface" data-xgc-id={props.projection.entryId}>
      <Notice tone="danger" density="compact">{t('This entry is not a readable calibration surface.')}</Notice>
    </section>;
  }
  return <SharedCalibrationSurfaceView
    key={JSON.stringify([props.projection.entryId, scope.experimentId, scope.sessionId, scope.panelId,
      props.projection.actions, props.projection.endpoints])}
    projection={props.projection}
    client={props.client}
    stateGranted={grantedGetEndpoint(props.projection, STATE_ENDPOINT, STATE_ACTION, STATE_PATH)}
    imageGranted={grantedGetEndpoint(props.projection, IMAGE_ENDPOINT, IMAGE_ACTION, IMAGE_PATH)}
  />;
}

type CalibrationReadoutProps = {
  entryId: string;
  client: SharedSurfaceClient;
  stateGranted: boolean;
  imageGranted: boolean;
};

function SharedCalibrationSurfaceView({ projection,client,stateGranted,imageGranted }: {
  projection: SharedSurfaceProps['projection'];
  client: SharedSurfaceClient;
  stateGranted: boolean;
  imageGranted: boolean;
}) {
  const t = useLocalizedText(zhMessages);
  const [refresh, setRefresh] = useState(0);
  const entryId = projection.entryId;
  return <section className="camera-calibration-shared" data-xgc-role="camera-calibration-shared-surface" data-xgc-id={entryId}>
    <header className="camera-calibration-shared-header">
      <div><Camera size={14} /><strong>{projection.name.trim() || t('Calibration')}</strong></div>
      <ControlButton size="compact" iconOnly aria-label={t('Refresh')} title={t('Refresh')}
        dataXgcRole="camera-calibration-shared-refresh" dataXgcId={entryId}
        disabled={!stateGranted && !imageGranted}
        onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={13} aria-hidden="true" /></ControlButton>
    </header>
    <SharedCalibrationReadout key={refresh} entryId={entryId} client={client}
      stateGranted={stateGranted} imageGranted={imageGranted} />
  </section>;
}

function SharedCalibrationReadout({ entryId,client,stateGranted,imageGranted }: CalibrationReadoutProps) {
  const t = useLocalizedText(zhMessages);
  const [loaded, setLoaded] = useState<{ client: SharedSurfaceClient; state?: SharedCalibrationState }>();
  const state = loaded?.client === client ? loaded.state : undefined;
  const stateError = loaded?.client === client && loaded.state === undefined;

  // This version offers finite reads, not a calibration event stream. Refresh
  // remounts the readout; no periodic polling or write workspace is invented.
  useEffect(() => {
    if (!stateGranted) return undefined;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await client.request(STATE_ENDPOINT, { signal: controller.signal });
        if (!response.ok) throw new Error('Calibration state unavailable');
        const next = decodeSharedCalibrationState(await response.json());
        if (!controller.signal.aborted) setLoaded({ client, state: next });
      } catch {
        if (!controller.signal.aborted) setLoaded({ client });
      }
    })();
    return () => controller.abort();
  }, [client, stateGranted]);

  // With both grants, wait for the state before inspecting the display. With
  // image-only authority, the JPEG read independently determines availability.
  const imageWanted = imageGranted && (!stateGranted || state?.imageReady === true);
  const phaseLabels: Record<SharedCalibrationState['phase'], string> = {
    collecting: t('Collecting samples'), solving: t('Solving'),
    candidate_ready: t('Candidate ready'), saved: t('Saved'),
  };
  const facts = state ? [
    { label: t('Phase'), value: phaseLabels[state.phase] },
    { label: t('Samples'), value: String(state.samples) },
    { label: t('Coverage good enough'), value: state.goodenough ? t('Yes') : t('No') },
    { label: t('Saved result loaded'), value: state.resultRestored ? t('Yes') : t('No') },
  ] : [];
  const status = state ? phaseLabels[state.phase] : t('waiting');
  return <>
    {!stateGranted ? <Notice tone="neutral" density="compact">{t('This entry does not include the calibration state.')}</Notice> : null}
    {stateError ? <Notice tone="danger" density="compact">{t('Calibration state could not be loaded.')}</Notice> : null}
    {facts.length > 0 ? <CameraCalibrationStateFacts id={entryId} items={facts} /> : null}
    {stateGranted && !state && !stateError ? <p role="status" aria-label={t('waiting')} className="xgc-visually-hidden">{t('waiting')}</p> : null}
    {imageWanted ? <SharedCalibrationImage entryId={entryId} client={client} status={status} />
      : imageGranted ? <CameraCalibrationDetectionPreview id={entryId} status={status} imageUrl=""
        imageAlt={t('Annotated intrinsic calibration frame')} placeholder={t('Waiting for a detection result')} /> : null}
  </>;
}

function SharedCalibrationImage({ entryId,client,status }: {
  entryId: string;
  client: SharedSurfaceClient;
  status: string;
}) {
  const t = useLocalizedText(zhMessages);
  const [loaded, setLoaded] = useState<{ client: SharedSurfaceClient; url?: string; failed?: boolean }>();
  const current = loaded?.client === client ? loaded : undefined;
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    void (async () => {
      try {
        const response = await client.request(IMAGE_ENDPOINT, { signal: controller.signal });
        if (!response.ok) throw { status: response.status };
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        if (blob.type !== 'image/jpeg' || blob.size === 0 || blob.size > 32 * 1024 * 1024) {
          throw new Error('Invalid calibration JPEG');
        }
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ client, url: objectUrl });
      } catch (cause) {
        if (!controller.signal.aborted) setLoaded({ client, failed: statusOf(cause) !== 503 });
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [client]);
  return <>
    {current?.failed ? <p className="camera-calibration-shared-muted">{t('Detection image is unavailable.')}</p> : null}
    <CameraCalibrationDetectionPreview id={entryId} status={status} imageUrl={current?.url ?? ''}
      imageAlt={t('Annotated intrinsic calibration frame')} placeholder={t('Waiting for a detection result')} />
  </>;
}

export default SharedCalibrationSurface;
