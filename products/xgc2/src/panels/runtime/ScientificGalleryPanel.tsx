import { useCallback,useEffect,useRef,useState } from 'react';
import { EmptyState,Notice,useConfirmationDialog } from '@xgc2/ui-react';
import {
  fetchROSBagFigure,
  listROSBagFigures,
  preferVectorGalleryFigures,
  useExperimentSurfaceVisible,
  type ImageGalleryFile,
} from '../../domains/experiment/experimentPublic';
import type { PanelActionInvocation,PanelPluginProps } from '../types';
import { createPanelInvocationRequest,type PanelInvocationRequest } from '../panelInvocationRequest';
import { usePanelInvocationObservation } from '../usePanelInvocationObservation';
import { usePanelExecutionRunDetail } from '../panelExecutionObserver';
import '../../styles/scientific-gallery.css';
import {
  deleteROSBagRecording,
  listROSBagRecordings,
  useRosbagArchiveEpoch,
  type ROSBagRecording,
} from '../../domains/recording/recordingPublic';
import { useAppLanguage } from '../../shared/localization/localizedText';
import { formatOperatorDateTime } from '../../shared/operatorTime';
import { useProductRouteVisible } from '../../shared/routeReady';
import {
  experimentIdFromArtifactsPort,
  publicationIdFromRunParameters,
  SCIENTIFIC_GALLERY_ACTION_PORT,
  SCIENTIFIC_GALLERY_RUNTIME_PORT,
  scientificGalleryPlotFailure,
  scientificGalleryPlotStillWorking,
  scientificGalleryWorkflowDetail,
  scientificGalleryWorkflowDocument,
  scientificGalleryWorkflowRuntime,
  supportsScientificPlotAction,
} from './scientificGalleryPanelModel';
import { useScientificGalleryFrame } from './scientificGalleryPanelFrameState';
import { ScientificGalleryBagTree } from './ScientificGalleryBagTree';
import { ScientificGalleryFigureViewer } from './ScientificGalleryFigureViewer';
import { ScientificGalleryRecordingsView } from './ScientificGalleryRecordingsView';
import { ScientificGalleryVideoView } from './ScientificGalleryVideoView';
import { ScientificGalleryWorkflowView } from './ScientificGalleryWorkflowView';
import { useRuntimePanelText } from './runtimeMessages';

type Props = PanelPluginProps<readonly ['visualization','experiment','automation']>;

export function ScientificGalleryPanel(props: Props) {
  const plot = props.context.ports.actions[SCIENTIFIC_GALLERY_ACTION_PORT];
  const scope = JSON.stringify([props.context.executionTargetId,props.panel.id,
    experimentIdFromArtifactsPort(props.context.ports.data['recording-artifacts']?.value),
    plot?.trace.workflowInstanceId,plot?.trace.presetId,plot?.trace.actionId]);
  // A head edit is not a new runtime. A real scope change only releases observers.
  return <ScientificGalleryWorkspace key={scope} {...props} />;
}

function ScientificGalleryWorkspace({ panel,context }: Props) {
  const t = useRuntimePanelText();
  const frame = useScientificGalleryFrame(panel.id);
  const scriptPath = typeof panel.options.scriptPath === 'string' ? panel.options.scriptPath.trim() : '';
  const experimentId = experimentIdFromArtifactsPort(context.ports.data['recording-artifacts']?.value);
  const archiveEpoch = useRosbagArchiveEpoch(context.executionTargetId || 'local',Boolean(experimentId));
  const plot = context.ports.actions[SCIENTIFIC_GALLERY_ACTION_PORT];
  const plotConnected = Boolean(plot?.connected && supportsScientificPlotAction(plot.inputSchema));
  const [bags,setBags] = useState<ROSBagRecording[]>([]);
  const [selectedId,setSelectedId] = useState('');
  const [bagsChecked,setBagsChecked] = useState(false);
  const [bagsError,setBagsError] = useState('');
  const [publicationId,setPublicationId] = useState('');
  const [runId,setRunId] = useState('');
  const [accepted,setAccepted] = useState<PanelActionInvocation>();
  const [displayPublicationId,setDisplayPublicationId] = useState('');
  const [archiveBusy,setArchiveBusy] = useState(false);
  const [cancelPending,setCancelPending] = useState(false);
  const [running,setRunning] = useState(false);
  const [runError,setRunError] = useState('');
  const [figures,setFigures] = useState<ImageGalleryFile[]>([]);
  const [galleryError,setGalleryError] = useState('');
  const [viewerIndex,setViewerIndex] = useState<number | null>(null);
  const [removing,setRemoving] = useState(false);
  const { confirm, dialog: confirmationDialog } = useConfirmationDialog();
  const routeVisible = useProductRouteVisible();
  const surfaceVisible = useExperimentSurfaceVisible();
  const invokedHere = useRef(false);
  const loadedReceipt = useRef('');
  const runGeneration = useRef(0);
  const mounted = useRef(true);
  const submission = useRef<PanelInvocationRequest | undefined>(undefined);
  const submissionLocked = useRef(false);
  const observation = usePanelInvocationObservation(plot,accepted,running);
  const runDetail = usePanelExecutionRunDetail(plot?.execution,runId);
  const observationRef = useRef(observation);
  observationRef.current = observation;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false;runGeneration.current += 1; };
  },[]);
  useEffect(() => {
    if (!running) { submissionLocked.current = false;setCancelPending(false); }
  },[running]);

  // Record Stop advances the existing execution-SSE epoch; no archive polling.
  useEffect(() => {
    setArchiveBusy(true);
    setBagsError('');
    if (!experimentId) return;
    const controller = new AbortController();
    loadArchiveBags(controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setBags(items);
        setSelectedId((current) => (
          current && items.some((item) => item.id === current) ? current : items[0]?.id ?? ''
        ));
        setBagsChecked(true);
        setBagsError('');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setBagsError(messageOf(cause));
        setBagsChecked(true);
      }).finally(() => {
        if (!controller.signal.aborted) setArchiveBusy(false);
      });
    return () => controller.abort();
  },[archiveEpoch,experimentId]);

  const selectedBag = bags.find((item) => item.id === selectedId);
  const effectivePath = selectedBag?.path.trim() ?? '';
  const receipt = observation.invocation ?? plot?.latestInvocation;
  const receiptRef = useRef(receipt);
  receiptRef.current = receipt;
  const plotRef = useRef(plot);
  useEffect(() => {
    plotRef.current = plot;
  });

  const loadFiguresForReceipt = useCallback(async (
    receiptId: string,
    currentRun: boolean,
    receiptRevision: number | undefined,
    signal: AbortSignal,
    generation?: number,
  ) => {
    const stale = () => !mounted.current || signal.aborted
      || (currentRun && Boolean(submission.current?.cancelRequested))
      || (generation !== undefined && generation !== runGeneration.current);
    const execution = plotRef.current?.execution;
    let id = currentRun ? publicationId : '';
    if (!id) {
      let detail = execution?.runDetail(receiptId);
      if (!detail?.run && execution?.loadRunDetail) {
        detail = await execution.loadRunDetail(receiptId,receiptRevision);
      }
      if (stale()) return;
      if (!currentRun && detail?.run?.sourceRef.resourceId !== experimentId) return;
      id = publicationIdFromRunParameters(detail?.run?.parameters);
    }
    const observedDetail = observationRef.current.detail;
    const liveDetail = currentRun ? observedDetail : execution?.runDetail(receiptId);
    const currentReceipt = receiptRef.current;
    if (currentReceipt?.id !== receiptId) return;
    const stillWorking = currentReceipt.status !== 'succeeded' || liveDetail?.run?.id !== receiptId
      || scientificGalleryPlotStillWorking(liveDetail);
    // R24 permits partial figures while the writer is running. Displaying a
    // preview must not release the exact Run's occupancy or hide later failure.
    if (!id || stale()) {
      if (!stale() && !stillWorking) {
        loadedReceipt.current = receiptId;
        setGalleryError(t('The Plot workflow result has no image publication.'));
        setRunning(false);
      }
      return;
    }
    let listing;
    try {
      listing = await listROSBagFigures(id,signal);
    } catch (cause: unknown) {
      if (stale() || stillWorking) return;
      loadedReceipt.current = receiptId;
      setGalleryError(messageOf(cause));
      setRunning(false);
      return;
    }
    if (stale()) return;
    const nextFigures = preferVectorGalleryFigures(listing.files);
    if (nextFigures.length === 0 && stillWorking) return;
    if (!stillWorking) loadedReceipt.current = receiptId;
    setPublicationId(id);
    setDisplayPublicationId(id);
    setRunId(receiptId);
    setFigures(nextFigures);
    if (nextFigures.length === 0) {
      setGalleryError(t('The Plot workflow finished without figures.'));
    } else {
      setGalleryError(listing.truncated ? t('The image publication is too large to show in full.') : '');
    }
    if (!stillWorking) setRunning(false);
  },[experimentId,publicationId,t]);

  useEffect(() => {
    if (running || !selectedId) return;
    const controller = new AbortController();
    void listROSBagFigures(selectedId, controller.signal)
      .then((listing) => {
        if (controller.signal.aborted) return;
        const nextFigures = preferVectorGalleryFigures(listing.files);
        setFigures(nextFigures);
        setDisplayPublicationId(selectedId);
        setPublicationId(selectedId);
        setGalleryError(listing.truncated ? t('The image publication is too large to show in full.') : '');
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setFigures([]);
          setGalleryError(messageOf(cause));
        }
      });
    return () => controller.abort();
  },[running,selectedId,t]);

  const trackedDetail = accepted ? observation.detail : runDetail;
  const trackedStatus = observation.invocation?.status ?? trackedDetail?.run?.status ?? '';
  const plotProgress = [
    trackedStatus,
    trackedDetail?.nodeSummaries.map((node) => `${node.nodeId}:${node.status}:${node.activeOccurrenceCount}`).join('|') ?? '',
    trackedDetail?.relations?.childRuns.map((child) => (
      `${child.childRunId}:${child.observedStatus ?? ''}:${child.runStatus ?? ''}`
    )).join('|') ?? '',
  ].join('/');
  useEffect(() => {
    if (!running || !runId || !trackedStatus) return;
    if (trackedStatus === 'failed' || trackedStatus === 'canceled'
      || trackedStatus === 'rejected' || trackedStatus === 'stopped') {
      setRunError(scientificGalleryPlotFailure(trackedDetail) || t('Plot workflow failed.'));
      setRunning(false);
      return;
    }
    if (cancelPending && trackedStatus === 'succeeded' && trackedDetail
      && !scientificGalleryPlotStillWorking(trackedDetail)) {
      loadedReceipt.current = runId;
      setRunning(false);
      return;
    }
    const controller = new AbortController();
    void loadFiguresForReceipt(runId,true,trackedDetail?.run?.revision,controller.signal,runGeneration.current)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && !scientificGalleryPlotStillWorking(trackedDetail,trackedStatus)) {
          setGalleryError(messageOf(cause));
          setRunning(false);
        }
      });
    return () => controller.abort();
  },[cancelPending,loadFiguresForReceipt,plotProgress,runId,running,t,trackedDetail,trackedStatus]);

  const runTitle = context.disabledReason || plot?.disabledReason
    || (!plotConnected ? t('Connect a compatible Plot workflow action.') : undefined)
    || (!scriptPath ? t('Configure one plotting script path') : undefined)
    || (!effectivePath && bagsChecked ? t('Choose a data file') : t('Plot'));

  const run = useCallback(() => {
    if (!scriptPath || !plotConnected || running || submissionLocked.current || !plot || !effectivePath
      || !selectedId || removing || context.disabledReason || plot.disabledReason) return;
    submissionLocked.current = true;
    const generation = runGeneration.current + 1;
    runGeneration.current = generation;
    invokedHere.current = true;
    loadedReceipt.current = '';
    setAccepted(undefined);
    setCancelPending(false);
    setRunId('');
    setGalleryError('');
    setRunError('');
    setViewerIndex(null);
    setRunning(true);
    const fail = (message: string) => {
      if (!mounted.current || generation !== runGeneration.current) return;
      submissionLocked.current = false;
      setRunError(message);
      setRunning(false);
    };
    const nextGalleryId = selectedId;
    setPublicationId(nextGalleryId);
    const command = createPanelInvocationRequest(plot,{
      inputPath:effectivePath,scriptPath,publicationId:nextGalleryId,
    },`Plot figures for ${nameOfPath(effectivePath)}`,
    () => observationRef.current.invocation);
    submission.current = command;
    void command.result.then((invocation) => {
      if (!mounted.current || generation !== runGeneration.current) return;
      setAccepted(invocation);
      setRunId(invocation.id);
      // The terminal observer, not this HTTP callback, decides result completion.
    }).catch((cause: unknown) => fail(messageOf(cause)));
  },[context.disabledReason,effectivePath,plot,plotConnected,removing,running,scriptPath,selectedId]);

  const stop = useCallback(() => {
    const command = submission.current;
    if (!command || cancelPending) return;
    const generation = runGeneration.current;
    setCancelPending(true);
    void command.cancel('Stop plotting').catch((cause: unknown) => {
      if (!mounted.current || generation !== runGeneration.current) return;
      setRunError(messageOf(cause));
      setCancelPending(false);
    });
    // Keep Run observation and occupancy until the backend terminal fact.
  },[cancelPending]);

  const removeBag = useCallback((bag: ROSBagRecording) => {
    if (removing || running || archiveBusy) return;
    setRemoving(true);
    void deleteROSBagRecording(bag.id)
      .then(() => {
        if (!mounted.current) return;
        const remaining = bags.filter((item) => item.id !== bag.id);
        setBags(remaining);
        setSelectedId((current) => current === bag.id ? remaining[0]?.id ?? '' : current);
        setBagsError('');
      })
      .catch((cause: unknown) => {
        if (mounted.current) setBagsError(messageOf(cause));
      })
      .finally(() => {
        if (mounted.current) setRemoving(false);
      });
  },[archiveBusy,bags,removing,running]);
  const askDelete = useCallback(async () => {
    const bag = selectedBag;
    if (!bag || removing || running || archiveBusy) return;
    const accepted = await confirm({
      title: t('Delete bag'),
      message: t('Delete {name}?', { name: bag.name }),
      confirmLabel: t('Delete'),
      cancelLabel: t('Cancel'),
    });
    if (accepted) removeBag(bag);
  },[archiveBusy,confirm,removeBag,removing,running,selectedBag,t]);

  const { setBagActions } = frame;
  useEffect(() => {
    if (!experimentId || !selectedBag) {
      setBagActions(null);
      return;
    }
    setBagActions({
      bagId: selectedBag.id,
      removing,
      runDisabled: !effectivePath || !scriptPath || !plotConnected || removing || Boolean(context.disabledReason || plot?.disabledReason),
      runTitle,
      running,
      onDelete: () => { void askDelete(); },
      onRun: run,
      onStop: stop,
    });
  },[
    askDelete,context.disabledReason,effectivePath,experimentId,plot?.disabledReason,plotConnected,removing,
    run,runTitle,running,scriptPath,selectedBag,setBagActions,stop,
  ]);
  useEffect(() => () => setBagActions(null),[setBagActions]);

  const workflowRuntime = scientificGalleryWorkflowRuntime(context.ports.data[SCIENTIFIC_GALLERY_RUNTIME_PORT]?.value);
  const workflow = scientificGalleryWorkflowDocument(workflowRuntime,plot);
  const workflowDetail = scientificGalleryWorkflowDetail(workflowRuntime,plot,runId);

  if (!experimentId) {
    return <EmptyState appearance="plain" fill title={t('No Experiment')} />;
  }

  return (
    <section className="scientific-gallery" data-xgc-role="scientific-gallery" data-xgc-id={panel.id}>
      {confirmationDialog}
      {frame.view === 'workflow' ? (
        <ScientificGalleryWorkflowView
          catalog={workflowRuntime?.catalog ?? []}
          detail={workflowDetail}
          loadRunDetail={plot?.execution?.loadRunDetail ?? workflowRuntime?.loadRunDetail}
          panelId={panel.id}
          workflow={workflow}
        />
      ) : frame.view === 'recordings' ? (
        <ScientificGalleryRecordingsView panelId={panel.id} />
      ) : frame.view === 'video' ? (
        <ScientificGalleryVideoView panel={panel} context={context} />
      ) : (
        <div className="scientific-gallery-body">
          <div
            className="scientific-gallery-bag-pane"
            data-xgc-role="scientific-gallery-bag-pane"
            data-xgc-id={panel.id}
          >
            {bagsError && <Notice tone="danger" density="compact">{bagsError}</Notice>}
            <ScientificGalleryBagTree
              bags={bags}
              panelId={panel.id}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
          <div
            className="scientific-gallery-stage"
            data-xgc-role="scientific-gallery-stage"
            data-xgc-id={panel.id}
          >
            {(runError || observation.error) && <Notice tone="danger" density="compact">{runError || observation.error}</Notice>}
            {galleryError && <Notice tone="warning" density="compact">{galleryError}</Notice>}
            {figures.length > 0 && (
              <ul className="scientific-gallery-results" data-xgc-role="scientific-gallery-figures" data-xgc-id={panel.id}>
                {figures.map((file,index) => (
                  <li key={`${displayPublicationId}:${file.name}`}>
                    <GalleryFigure galleryId={displayPublicationId} file={file} panelId={panel.id} onOpen={() => setViewerIndex(index)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          {viewerIndex !== null && figures[viewerIndex] && routeVisible && surfaceVisible && (
            <ScientificGalleryFigureViewer
              files={figures}
              galleryId={displayPublicationId}
              index={viewerIndex}
              panelId={panel.id}
              onClose={() => setViewerIndex(null)}
              onNavigate={setViewerIndex}
            />
          )}
        </div>
      )}
    </section>
  );
}

function GalleryFigure({ galleryId,file,panelId,onOpen }: { galleryId:string;file:ImageGalleryFile;panelId:string;onOpen:() => void }) {
  const t = useRuntimePanelText();
  const language = useAppLanguage();
  const plottedAt = figurePlottedAt(file.createdAt, language);
  const frame = useRef<HTMLElement>(null);
  const [nearViewport,setNearViewport] = useState(false);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setNearViewport(true);
      observer.disconnect();
    },{ rootMargin:'600px 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  },[]);
  const url = useGalleryObjectUrl(nearViewport ? galleryId : '',file);
  return (
    <figure ref={frame} className="scientific-gallery-result" data-xgc-role="scientific-gallery-figure" data-xgc-id={`${panelId}:${file.name}`}>
      <button
        type="button"
        className="scientific-gallery-preview-frame"
        data-xgc-role="scientific-gallery-figure-open"
        data-xgc-id={`${panelId}:${file.name}`}
        aria-label={t('Open figure {name}',{ name:file.name })}
        disabled={!url}
        onClick={onOpen}
      >
        {url && <img className="scientific-gallery-preview-image" src={url} alt="" loading="lazy" />}
      </button>
      <figcaption className="scientific-gallery-caption">
        <span data-xgc-role="scientific-gallery-figure-name" data-xgc-id={`${panelId}:${file.name}`}>{file.name}</span>
        {plottedAt && (
          <time
            dateTime={file.createdAt}
            data-xgc-role="scientific-gallery-figure-plotted-at"
            data-xgc-id={`${panelId}:${file.name}`}
          >{plottedAt}</time>
        )}
      </figcaption>
    </figure>
  );
}

function figurePlottedAt(value: string, language: ReturnType<typeof useAppLanguage>) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime()) || date.getUTCFullYear() < 2000) return '';
  return formatOperatorDateTime(value, language === 'zh-CN' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function useGalleryObjectUrl(galleryId: string,file: ImageGalleryFile) {
  const [url,setUrl] = useState('');
  useEffect(() => {
    if (!galleryId) return;
    const controller = new AbortController();
    let objectUrl = '';
    fetchROSBagFigure(galleryId,file.name,controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setUrl('');
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  },[file.createdAt,file.name,file.size,galleryId]);
  return url;
}

function nameOfPath(path: string) {
  const parts = path.trim().split('/').filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

const ARCHIVE_LIST_LIMIT = 500;

async function loadArchiveBags(signal: AbortSignal): Promise<ROSBagRecording[]> {
  const items: ROSBagRecording[] = [];
  let offset: number | undefined;
  for (;;) {
    if (signal.aborted) throw new DOMException('Aborted','AbortError');
    const page = await listROSBagRecordings(
      offset === undefined ? { limit: ARCHIVE_LIST_LIMIT } : { limit: ARCHIVE_LIST_LIMIT, offset },
      signal,
    );
    items.push(...page.items);
    if (!page.truncated) return items;
    const next = page.nextOffset ?? items.length;
    if (!Number.isSafeInteger(next) || next <= (offset ?? 0)) throw new Error('Archive pagination did not advance.');
    offset = next;
  }
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
