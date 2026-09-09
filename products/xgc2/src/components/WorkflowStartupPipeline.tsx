import { useRef } from 'react';
import '../styles/workflow-startup-pipeline.css';
import {
  workflowStartupRailState,
  workflowStartupWidthCopy,
  type WorkflowStartupPhase,
  type WorkflowStartupStage,
  type WorkflowStartupWidthCopy,
} from './workflowStartupPipelineModel';

export function WorkflowStartupPipeline({
  id,
  role = 'workflow-startup-pipeline',
  title,
  phase,
  stages,
}: {
  id: string;
  role?: string;
  title: string;
  phase: WorkflowStartupPhase;
  stages: readonly WorkflowStartupStage[];
}) {
  const busy = phase === 'starting' || phase === 'stopping';
  const persist = useRef<{
    id: string;
    lastReadyIndex: number;
    sendingId: string;
    copy: WorkflowStartupWidthCopy;
  }>({
    id,
    lastReadyIndex: -1,
    sendingId: '',
    copy: { titles: [], facts: [] },
  });
  if (persist.current.id !== id) {
    persist.current = { id, lastReadyIndex: -1, sendingId: '', copy: { titles: [], facts: [] } };
  } else if (phase === 'stopped') {
    persist.current.lastReadyIndex = -1;
    persist.current.sendingId = '';
  }
  const rails = workflowStartupRailState(
    phase,
    stages,
    persist.current.lastReadyIndex,
    persist.current.sendingId,
  );
  persist.current.lastReadyIndex = rails.lastReadyIndex;
  persist.current.sendingId = rails.sendingId;
  persist.current.copy = workflowStartupWidthCopy(title, stages, persist.current.copy);
  return (
    <div
      className="workflow-startup-pipeline"
      data-xgc-role={role}
      data-xgc-id={id}
      data-state={phase}
      aria-busy={busy || undefined}
      aria-label={title}
    >
      <div className="workflow-startup-pipeline-frame">
        <header className="workflow-startup-pipeline-header">
          <strong data-xgc-role={`${role}-title`} data-xgc-id={id}>{title}</strong>
        </header>
        <ol className="workflow-startup-pipeline-stages">
          <li className="workflow-startup-pipeline-sizer" aria-hidden="true">
            <span className="workflow-startup-pipeline-mark" />
            <span className="workflow-startup-pipeline-body">
              {persist.current.copy.titles.map((sample) => (
                <span
                  key={`title:${sample}`}
                  className="workflow-startup-pipeline-sizer-line workflow-startup-pipeline-heading"
                  data-sample={sample}
                />
              ))}
              {persist.current.copy.facts.map((sample) => (
                <span
                  key={`fact:${sample}`}
                  className="workflow-startup-pipeline-sizer-line workflow-startup-pipeline-fact"
                  data-sample={sample}
                />
              ))}
            </span>
          </li>
          {stages.map((stage,index) => (
            <li
              key={stage.id}
              className="workflow-startup-pipeline-stage"
              data-xgc-role={`${role}-stage`}
              data-xgc-id={`${id}:${stage.id}`}
              data-xgc-status={stage.status}
              data-current={stage.id === rails.currentId ? 'true' : 'false'}
              title={stage.detail || undefined}
            >
              <span className="workflow-startup-pipeline-mark" aria-hidden="true">{stage.icon}</span>
              {index < stages.length - 1 ? (
                <span
                  className="workflow-startup-pipeline-rail"
                  aria-hidden="true"
                  data-sending={stage.id === rails.sendingId ? 'true' : 'false'}
                  data-passed={rails.passed.has(stage.id) ? 'true' : 'false'}
                >
                  <span className="workflow-startup-pipeline-send" />
                </span>
              ) : null}
              <span className="workflow-startup-pipeline-body">
                <strong
                  className="workflow-startup-pipeline-heading"
                  data-xgc-role={`${role}-stage-title`}
                  data-xgc-id={`${id}:${stage.id}`}
                >
                  {stage.title}
                </strong>
                <span
                  className="workflow-startup-pipeline-fact"
                  data-xgc-role={`${role}-stage-fact`}
                  data-xgc-id={`${id}:${stage.id}`}
                >
                  {stage.fact}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
