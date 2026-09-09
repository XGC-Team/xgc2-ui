import { CodeBlock,Notice } from '@xgc2/ui-react';
import type { PanelPluginProps } from '../types';
import '../../styles/automation-workflow-logs.css';
import { useAutomationExecutionText } from '../../domains/automation/automationPublic';

export function WorkflowLogsPanel({ panel,context }: PanelPluginProps<readonly ['experiment']>) {
  const t = useAutomationExecutionText();
  const traces = context.ports.data['workflow-traces'];
  return (
    <section className="automation-workflow-logs" data-xgc-role="workflow-logs" data-xgc-id={panel.id}>
      {traces?.value !== undefined ? (
        <CodeBlock
          content={JSON.stringify(traces.value,null,2) ?? ''}
          copyable={false}
          data-xgc-role="workflow-log-output"
          data-xgc-id={panel.id}
          language="json"
        />
      ) : traces?.connected ? (
        <Notice density="compact">{t('The connected workflow tree has no retained log sources.')}</Notice>
      ) : null}
    </section>
  );
}
