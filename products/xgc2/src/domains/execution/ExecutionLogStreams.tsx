import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { CodeBlock,Notice } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { SegmentedControl } from '../../components/SegmentedControl';
import '../../styles/execution-log-viewer.css';
import { useExecutionLog } from './executionJobLogStore';

export type ExecutionLogEntityType = 'job' | 'process-instance' | 'orchestration';
export type ExecutionLogDisplayMode = 'split' | 'tabs';
type ExecutionLogStream = 'stdout' | 'stderr';

export function ExecutionLogStreams({ targetId,entityType,entityId,follow,displayMode = 'split' }: {
  targetId: string;
  entityType: ExecutionLogEntityType;
  entityId: string;
  follow: boolean;
  displayMode?: ExecutionLogDisplayMode;
}) {
  const [activeStream, setActiveStream] = useState<ExecutionLogStream>('stdout');
  const stdout = useExecutionLog({ targetId,entityType,entityId,stream: 'stdout',follow });
  const stderr = useExecutionLog({ targetId,entityType,entityId,stream: 'stderr',follow });
  const error = [stdout.error, stderr.error].filter(Boolean).join(' · ');
  const streamContent = activeStream === 'stdout' ? stdout.content : stderr.content;

  return (
    <section className="execution-log-section" data-xgc-role={`${entityType}-logs`} data-xgc-id={entityId} data-xgc-layout={displayMode}>
      <header>
        {displayMode === 'tabs' ? (
          <SegmentedControl
            ariaLabel="Log stream"
            asTabs
            className="execution-log-stream-tabs"
            dataXgcId={entityId}
            dataXgcRole={`${entityType}-log-stream-tabs`}
            onChange={setActiveStream}
            optionDataXgcRole={`${entityType}-log-stream-tab`}
            options={(['stdout', 'stderr'] as const).map((stream) => ({
              ariaControls: logStreamPanelId(entityType, entityId, stream),
              dataXgcId: `${entityId}:${stream}`,
              id: logStreamTabId(entityType, entityId, stream),
              label: stream === 'stdout' ? 'Output' : 'Errors',
              value: stream,
            }))}
            size="compact"
            value={activeStream}
          />
        ) : <div><h3>Logs</h3><span>Byte-offset streams · stdout and stderr are retained separately.</span></div>}
        <ControlButton
          size="compact"
          dataXgcRole={`${entityType}-logs-refresh`}
          dataXgcId={entityId}
          disabled={stdout.loading || stderr.loading}
          onClick={() => void Promise.all([stdout.refresh(), stderr.refresh()])}
        >
          <RefreshCw size={13} />{stdout.loading || stderr.loading ? 'Loading' : 'Refresh'}
        </ControlButton>
      </header>
      {error && <Notice className="execution-log-notice" tone="danger" role="alert">{error}</Notice>}
      <div className="execution-log-stream-grid">
        {displayMode === 'tabs' ? (
          <LogStream entityType={entityType} entityId={entityId} stream={activeStream} content={streamContent} tabPanel />
        ) : <>
          <LogStream entityType={entityType} entityId={entityId} stream="stdout" content={stdout.content} />
          <LogStream entityType={entityType} entityId={entityId} stream="stderr" content={stderr.content} />
        </>}
      </div>
    </section>
  );
}

function LogStream({ entityType,entityId,stream,content,tabPanel = false }: {
  entityType: ExecutionLogEntityType;
  entityId: string;
  stream: ExecutionLogStream;
  content: string;
  tabPanel?: boolean;
}) {
  return (
    <div
      className="execution-log-stream"
      role={tabPanel ? 'tabpanel' : undefined}
      id={tabPanel ? logStreamPanelId(entityType, entityId, stream) : undefined}
      aria-labelledby={tabPanel ? logStreamTabId(entityType, entityId, stream) : undefined}
      data-xgc-role={`${entityType}-log-stream`}
      data-xgc-id={`${entityId}:${stream}`}
    >
      {!tabPanel && <strong>{stream}</strong>}
      <CodeBlock
        className="execution-log-output"
        content={content || `No ${stream} captured yet.`}
        copyable={false}
        terminal
      />
    </div>
  );
}

function logStreamTabId(entityType: ExecutionLogEntityType, entityId: string, stream: ExecutionLogStream) {
  return `${entityType}-${entityId}-${stream}-tab`;
}

function logStreamPanelId(entityType: ExecutionLogEntityType, entityId: string, stream: ExecutionLogStream) {
  return `${entityType}-${entityId}-${stream}-panel`;
}
