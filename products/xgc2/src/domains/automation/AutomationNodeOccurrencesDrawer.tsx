import { useAutomationExecutionText } from './automationExecutionMessages';
import { ConfigDrawer } from '../../components/ConfigDrawer';
import { ControlButton } from '../../components/controls/ControlButton';
import { CodeBlock,StatusText } from '@xgc2/ui-react';
import '../../styles/automation-occurrences.css';
import { AutomationExecutionRelationsView } from './AutomationExecutionRelations';
import type {
  AutomationExecutionRelations,
  AutomationNodeInvocation,
} from './automationExecutionContracts';

export function AutomationNodeOccurrencesDrawer({
  runId,
  nodeId,
  displayName,
  invocations,
  relations,
  focusedInvocationId = '',
  onOpenInvocation,
  onOpenRun,
  onClose,
}: {
  runId: string;
  nodeId: string;
  displayName?: string;
  invocations: AutomationNodeInvocation[];
  relations?: AutomationExecutionRelations;
  focusedInvocationId?: string;
  onOpenInvocation?: (invocationId: string) => void;
  onOpenRun?: (runId: string) => void | Promise<unknown>;
  onClose: () => void;
}) {
  const t = useAutomationExecutionText();
  const ordered = [...invocations].sort((left, right) => (
    right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id)
  ));
  return (
    <ConfigDrawer
      title={displayName || nodeId}
      subtitle={t('Node execution details')}
      onClose={onClose}
      closeOnBackdrop
      className="automation-occurrences-drawer"
      bodyClassName="automation-occurrences-body"
      dataXgcRole="automation-node-occurrences-drawer"
      dataXgcId={`${runId}:${nodeId}`}
    >
      {ordered.length === 0 ? (
        <div className="automation-occurrences-empty">
          <strong>{t('No invocation recorded')}</strong>
          <span>{t('This node did not execute in the selected Run.')}</span>
        </div>
      ) : ordered.map((invocation, index) => (
        <article
          className="automation-occurrences-card"
          data-xgc-status={invocation.status}
          data-xgc-role="automation-node-occurrence"
          data-xgc-id={invocation.id}
          aria-current={focusedInvocationId === invocation.id ? 'true' : undefined}
          key={invocation.id}
        >
          <header>
            <div>
              <strong>{t('Execution')} {ordered.length > 1 ? ordered.length - index : ''}</strong>
            </div>
            <StatusText status={invocation.status}>{t(invocation.status)}</StatusText>
          </header>
          <dl className="automation-occurrences-facts">
            <div><dt>{t('Started')}</dt><dd>{formatTimestamp(invocation.startedAt)}</dd></div>
            <div><dt>{t('Finished')}</dt><dd>{formatTimestamp(invocation.finishedAt)}</dd></div>
            {invocation.compensationStatus !== 'none' && (
              <div><dt>{t('Compensation')}</dt><dd>{invocation.compensationStatus}</dd></div>
            )}
          </dl>
          <section className="automation-occurrences-public-data" aria-label={t('Execution values')}>
            <OccurrenceValue title={t('Output')} value={outputRefValue(invocation)} />
            <OccurrenceValue title={t('Input')} value={inputRefValue(invocation)} />
          </section>
          <details className="automation-occurrences-technical" data-xgc-role="automation-occurrence-technical" data-xgc-id={invocation.id}>
            <summary data-xgc-role="automation-occurrence-technical-toggle" data-xgc-id={invocation.id}>{t('Technical details')}</summary>
            <dl className="automation-occurrences-facts">
              <div><dt>{t('Invocation')}</dt><dd><code>{invocation.id}</code></dd></div>
              <div><dt>{t('Run')}</dt><dd><code>{runId}</code></dd></div>
            </dl>
            <section className="automation-occurrences-attempts" aria-label={t('Attempts')}>
              <header><strong>{t('Attempts')}</strong><span>{invocation.attempts.length}</span></header>
              {invocation.attempts.length === 0 ? (
                <span className="automation-runtime-value-empty">No attempt recorded.</span>
              ) : invocation.attempts.map((attempt) => (
                <div
                  className="automation-occurrences-attempt"
                  data-xgc-status={attempt.status}
                  data-xgc-role="automation-node-attempt"
                  data-xgc-id={attempt.id}
                  key={attempt.id}
                >
                  <div>
                    <strong>{attempt.phase === 'compensation' ? 'Compensation' : 'Execution'} attempt {attempt.number}</strong>
                    <code title={attempt.id}>{shortID(attempt.id)}</code>
                  </div>
                  <div>
                    <StatusText status={attempt.status} />
                    {attempt.adoptionCount !== undefined && <small>Adopted {attempt.adoptionCount}</small>}
                  </div>
                </div>
              ))}
            </section>
          </details>
          <InvocationLineage invocation={invocation} onOpen={onOpenInvocation} />
          {relations && <AutomationExecutionRelationsView relations={relations} invocationId={invocation.id} onOpenRun={onOpenRun} onOpenInvocation={onOpenInvocation} />}

        </article>
      ))}
    </ConfigDrawer>
  );
}

function InvocationLineage({ invocation,onOpen }: {
  invocation: AutomationNodeInvocation;
  onOpen?: (invocationId: string) => void;
}) {
  const t = useAutomationExecutionText();
  const producers = [...new Map(invocation.inputRefs.map((input) => [input.producer.invocationId,input])).values()];
  if (producers.length === 0) return null;
  return (
    <section className="automation-occurrences-attempts" aria-label={t('Input lineage')}>
      <header><strong>{t('Input lineage')}</strong></header>
      {producers.map((input) => (
        <div className="automation-occurrences-attempt" key={input.producer.invocationId}>
          <div><strong>{input.inputKey}</strong></div>
          <InvocationLink invocationId={input.producer.invocationId} relation="producer" onOpen={onOpen} />
        </div>
      ))}
    </section>
  );
}

function InvocationLink({ invocationId,relation,onOpen }: {
  invocationId: string;
  relation: 'producer';
  onOpen?: (invocationId: string) => void;
}) {
  const t = useAutomationExecutionText();
  if (!onOpen) return null;
  return (
    <ControlButton

      type="button"
      data-xgc-role={`automation-occurrence-${relation}-open`}
      data-xgc-id={invocationId}
      onClick={() => onOpen(invocationId)}
    >{t('Open source execution')}</ControlButton>
  );
}

function OccurrenceValue({ title,value }: { title: string;value: unknown }) {
  const t = useAutomationExecutionText();
  return (
    <section>
      <strong>{title}</strong>
      {value === undefined
        ? <span className="automation-runtime-value-empty">{t('Unavailable or not recorded.')}</span>
        : <CodeBlock className="automation-runtime-json" content={typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? ''}
            copyable={false} language="json" />}
    </section>
  );
}

function inputRefValue(invocation: AutomationNodeInvocation) {
  if (invocation.inputRefs.length === 0) return undefined;
  return invocation.inputRefs.map((input) => ({
    input: input.inputKey, value: input.producer.value,
  }));
}

function outputRefValue(invocation: AutomationNodeInvocation) {
  if (invocation.outputRefs.length === 0) return undefined;
  return invocation.outputRefs.length === 1 ? invocation.outputRefs[0].value
    : invocation.outputRefs.map((output) => ({ port: output.port, value: output.value }));
}

function formatTimestamp(value?: string) {
  if (!value) return '—';
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value : timestamp.toLocaleString();
}

function shortID(value: string) {
  return value.length > 16 ? `${value.slice(0, 10)}…${value.slice(-4)}` : value;
}
