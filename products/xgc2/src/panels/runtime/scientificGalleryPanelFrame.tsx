import { Clapperboard,Images,Network,Play,Square,Trash2,Video } from 'lucide-react';
import { useMemo,useState } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { SearchControl } from '../../components/controls/TextControls';
import { PanelViewSwitcher } from '../../components/PanelViewSwitcher';
import type { PanelPluginFrameProviderProps,PanelPluginHeaderActionsProps } from '../types';
import { useRuntimePanelText } from './runtimeMessages';
import {
  ScientificGalleryFrameContext,
  useScientificGalleryFrame,
  type ScientificGalleryBagActionModel,
  type ScientificGalleryRecordingActionsModel,
  type ScientificGalleryRecordingSearchModel,
  type ScientificGalleryView,
} from './scientificGalleryPanelFrameState';

export function ScientificGalleryFrameProvider({ panel,children }: PanelPluginFrameProviderProps) {
  const [view,setView] = useState<ScientificGalleryView>('gallery');
  const [bagActions,setBagActions] = useState<ScientificGalleryBagActionModel | null>(null);
  const [recordingSearch,setRecordingSearch] = useState<ScientificGalleryRecordingSearchModel | null>(null);
  const [recordingActions,setRecordingActions] = useState<ScientificGalleryRecordingActionsModel | null>(null);
  const value = useMemo(
    () => ({
      panelId:panel.id,view,setView,bagActions,setBagActions,recordingSearch,setRecordingSearch,
      recordingActions,setRecordingActions,
    }),
    [bagActions,panel.id,recordingActions,recordingSearch,view],
  );
  return <ScientificGalleryFrameContext.Provider value={value}>{children}</ScientificGalleryFrameContext.Provider>;
}

export function ScientificGalleryHeaderLeading({ panel,editing }: PanelPluginHeaderActionsProps) {
  const frame = useScientificGalleryFrame(panel.id);
  const t = useRuntimePanelText();
  return (
    <div
      className="scientific-gallery-header-leading"
      data-xgc-role="scientific-gallery-header-leading"
      data-xgc-id={panel.id}
      data-xgc-workflow-view-active={frame.view === 'workflow' ? 'true' : undefined}
      data-xgc-recordings-view-active={frame.view === 'recordings' ? 'true' : undefined}
      data-xgc-video-view-active={frame.view === 'video' ? 'true' : undefined}
    >
      <PanelViewSwitcher
        appearance="panel"
        ariaLabel={t('Analysis views')}
        dataXgcId={panel.id}
        dataXgcRole="scientific-gallery-views"
        disabled={editing}
        items={[
          { id:'gallery' as const,label:t('Plots'),icon:Images },
          { id:'recordings' as const,label:t('Recordings'),icon:Video },
          { id:'video' as const,label:t('Video'),icon:Clapperboard },
          { id:'workflow' as const,label:t('Workflow'),icon:Network },
        ]}
        onChange={frame.setView}
        optionDataXgcRole="scientific-gallery-view"
        presentation="icons"
        value={frame.view}
      />
    </div>
  );
}

export function ScientificGalleryHeaderStatus({ panel }: PanelPluginHeaderActionsProps) {
  const frame = useScientificGalleryFrame(panel.id);
  if (!frame.recordingSearch) return null;
  return (
    <SearchControl
      className="scientific-gallery-header-search"
      dataXgcId="recording-search"
      dataXgcRole="recording-search"
      placeholder={frame.recordingSearch.placeholder}
      value={frame.recordingSearch.query}
      onChange={frame.recordingSearch.onChange}
    />
  );
}

export function ScientificGalleryHeaderActions({ panel,editing }: PanelPluginHeaderActionsProps) {
  const frame = useScientificGalleryFrame(panel.id);
  if (frame.view === 'recordings' && frame.recordingActions) {
    const actions = frame.recordingActions;
    return (
      <div
        className="scientific-gallery-header-actions"
        data-xgc-role="scientific-gallery-header-actions"
        data-xgc-id={panel.id}
      >
        <div className="scientific-gallery-bag-actions" data-xgc-role="recording-actions" data-xgc-id={actions.recordingId}>
          <ControlButton
            appearance="raised"
            aria-label={actions.stopLabel}
            dataXgcId={actions.recordingId}
            dataXgcRole="recording-stop"
            disabled={editing}
            size="compact"
            title={actions.stopLabel}
            onClick={(event) => {
              event.stopPropagation();
              actions.onStop();
            }}
          >
            <Square size={13} aria-hidden="true" />
            {actions.stopLabel}
          </ControlButton>
          <ControlButton
            appearance="raised"
            aria-busy={actions.removing || undefined}
            aria-label={actions.removeLabel}
            dataXgcId={actions.recordingId}
            dataXgcRole="recording-remove"
            disabled={editing || actions.removing}
            size="compact"
            title={actions.removeLabel}
            tone="danger"
            onClick={(event) => {
              event.stopPropagation();
              actions.onDelete();
            }}
          >
            <Trash2 size={13} aria-hidden="true" />
            {actions.removeLabel}
          </ControlButton>
        </div>
      </div>
    );
  }
  if (frame.view !== 'gallery' || !frame.bagActions) return null;
  return (
    <div
      className="scientific-gallery-header-actions"
      data-xgc-role="scientific-gallery-header-actions"
      data-xgc-id={panel.id}
    >
      <ScientificGalleryBagActions
        bagId={frame.bagActions.bagId}
        disabled={editing}
        panelId={panel.id}
        removeDisabled={false}
        removing={frame.bagActions.removing}
        runDisabled={frame.bagActions.runDisabled}
        runTitle={frame.bagActions.runTitle}
        running={frame.bagActions.running}
        onDelete={frame.bagActions.onDelete}
        onRun={frame.bagActions.onRun}
        onStop={frame.bagActions.onStop}
      />
    </div>
  );
}

export function ScientificGalleryBagActions({
  bagId,
  disabled,
  panelId,
  removeDisabled,
  removing,
  runDisabled,
  runTitle,
  running,
  onDelete,
  onRun,
  onStop,
}:{
  bagId: string;
  disabled: boolean;
  panelId: string;
  removeDisabled: boolean;
  removing: boolean;
  runDisabled: boolean;
  runTitle?: string;
  running: boolean;
  onDelete: () => void;
  onRun: () => void;
  onStop: () => void;
}) {
  const t = useRuntimePanelText();
  return (
    <div
      className="scientific-gallery-bag-actions"
      data-xgc-role="scientific-gallery-bag-actions"
      data-xgc-id={panelId}
    >
      <ScientificGalleryPlotControls
        disabled={disabled}
        panelId={panelId}
        runDisabled={runDisabled}
        runTitle={runTitle}
        running={running}
        onRun={onRun}
        onStop={onStop}
      />
      <ControlButton
        appearance="raised"
        aria-busy={removing || undefined}
        aria-label={t('Delete')}
        dataXgcId={bagId}
        dataXgcRole="scientific-gallery-bag-delete"
        disabled={disabled || removeDisabled || running || removing}
        size="compact"
        title={t('Delete')}
        tone="danger"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 size={13} aria-hidden="true" />
        {t('Delete')}
      </ControlButton>
    </div>
  );
}

export function ScientificGalleryPlotControls({
  disabled,
  panelId,
  runDisabled,
  runTitle,
  running,
  onRun,
  onStop,
}:{
  disabled: boolean;
  panelId: string;
  runDisabled: boolean;
  runTitle?: string;
  running: boolean;
  onRun: () => void;
  onStop: () => void;
}) {
  const t = useRuntimePanelText();
  return (
    <div
      className="scientific-gallery-plot-controls"
      data-xgc-role="scientific-gallery-plot-controls"
      data-xgc-id={panelId}
    >
      {running ? (
        <ControlButton
          appearance="raised"
          aria-label={t('Stop')}
          dataXgcId={panelId}
          dataXgcRole="scientific-gallery-stop"
          data-xgc-status="running"
          disabled={disabled}
          size="compact"
          title={t('Stop')}
          tone="danger"
          onClick={(event) => {
            event.stopPropagation();
            onStop();
          }}
        >
          <Square size={13} aria-hidden="true" />
          {t('Stop')}
        </ControlButton>
      ) : (
        <ControlButton
          appearance="raised"
          aria-label={t('Plot')}
          dataXgcId={panelId}
          dataXgcRole="scientific-gallery-run"
          data-xgc-status="stopped"
          disabled={disabled || runDisabled}
          size="compact"
          title={runTitle || t('Plot')}
          onClick={(event) => {
            event.stopPropagation();
            onRun();
          }}
        >
          <Play size={13} aria-hidden="true" />
          {t('Plot')}
        </ControlButton>
      )}
    </div>
  );
}
