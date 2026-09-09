import type { MouseEvent } from 'react';
import { WorkflowStatusCard } from '../../components/WorkflowStatusCard';
import '../../styles/control-action-grid.css';
import '../../styles/ros-panel-shell-controls.css';
import { rosBasicServicesControlGridStyle } from './rosBasicServicesPanelLayout';
import {
  rosBasicServiceMetric,
  type RosBasicServiceProjection,
} from './rosBasicServicesPanelProjection';
import type { RosBasicServiceId } from './rosBasicServicesPanelModel';
import { useRosPanelText } from './rosMessages';
import type { LocalizedText } from '../../shared/localization/localizedText';
import { measuredFailedProgress,measuredReadyProgress } from '../../shared/measuredReadyProgress';

export type RosBasicServiceControlAction = {
  busy: boolean;
  disabledReason: string;
  titleAttr?: string;
  running?: boolean;
  /** Toggle: start when idle, stop when running. */
  activate: () => Promise<void>;
};

export function RosBasicServicesControlsView({
  actions,
  buttonsPerRow,
  panelId,
  services,
}: {
  actions?: Partial<Record<RosBasicServiceId,RosBasicServiceControlAction>>;
  buttonsPerRow: number;
  panelId: string;
  services: RosBasicServiceProjection[];
}) {
  const t = useRosPanelText();
  return (
    <div
      className="xgc-control-action-grid ros-panel-shell-controls-grid"
      data-xgc-role="ros-basic-services-controls-view"
      data-xgc-id={panelId}
      data-xgc-tone-skin="neutral"
      /* Authored wrap; narrow place cols come from controlActionGridStyle. */
      style={rosBasicServicesControlGridStyle(services.length, buttonsPerRow)}
    >
      {services.map((projection) => {
        const { available,progress,runId,service,status,stopping } = projection;
        const action = actions?.[service.id];
        const failed = status === 'failed';
        const admitted = status === 'waiting' || status === 'starting' || status === 'running'
          || status === 'ready' || stopping || failed;
        const running = !failed && (Boolean((runId || admitted) && available) || Boolean(action?.running));
        const activate = action?.activate;
        const serviceLabel = t(service.label);
        const localizedDescription = rosBasicServiceStatusDescription(t,projection);
        return (
          <WorkflowStatusCard
            className={`xgc-control-action-card ros-panel-service-status-card${action?.disabledReason ? ' ros-panel-service-status-card-locked' : ''}`}
            key={service.id}
            layout="tile"
            title={<span className="ros-panel-shell-control-title">{rosBasicServiceTileTitle(serviceLabel)}</span>}
            status={status}
            tone="neutral"
            running={running}
            busy={stopping || action?.busy}
            disabled={Boolean(action?.disabledReason)}
            metrics={{ primary: rosBasicServiceMetric(projection) }}
            progress={{
              percent: projection.displayPercent,
              ...(status === 'ready' ? measuredReadyProgress : {}),
              ...(failed ? measuredFailedProgress : {}),
              ...((runId || admitted) && available ? {
                value: failed ? Math.max(progress.ready + progress.failed, progress.total > 0 ? 1 : 0) : progress.ready,
                max: Math.max(1, progress.total || (failed ? 1 : 0)),
                label: t('{name} startup readiness',{ name:serviceLabel }),
              } : {}),
            }}
            dataXgcRole="ros-basic-service-control"
            dataXgcId={panelId ? `${panelId}:${service.id}` : service.id}
            runId={runId}
            ariaLabel={available || !runId
              ? t(activate
                ? (running ? '{name}; {description}; stop service' : '{name}; {description}; start service')
                : '{name}; {description}',{ name:serviceLabel,description:localizedDescription })
              : t('{name} unavailable',{ name:serviceLabel })}
            {...(activate ? {
              titleAttr: action?.disabledReason
                || action?.titleAttr
                || (running
                  ? t('Stop {name}.',{ name:serviceLabel })
                  : t('Start {name} through its connected Experiment Action.',{ name:serviceLabel })),
              onClick: (event: MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                if (action?.disabledReason) return;
                void activate();
              },
            } : {})}
          />
        );
      })}
    </div>
  );
}

function rosBasicServiceStatusDescription(t:LocalizedText,projection:RosBasicServiceProjection) {
  if (!projection.available) return t('Panel Workflow Action is not connected');
  if (!projection.runId) return t('Panel Workflow Action is idle');
  if (projection.progress.total === 0) {
    return t('Workflow {status}; no owned Process instances reported',{ status:t(projection.status) });
  }
  return t('{ready}/{total} owned Process instances ready',{
    ready:projection.progress.ready,total:projection.progress.total,
  });
}

/**
 * Dense tile titles only — aria/tooltips keep the single-line service.label.
 * Short names like "VRPN client" fit one line, so insert a hard break after the
 * first space; CSS uses white-space: pre-line on the tile title.
 */
function rosBasicServiceTileTitle(label: string): string {
  const breakAt = label.indexOf(' ');
  if (breakAt < 0) return label;
  return `${label.slice(0, breakAt)}\n${label.slice(breakAt + 1)}`;
}
