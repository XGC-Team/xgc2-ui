import { SelectControl } from '../../components/controls/SelectControl';
import '../../styles/automation-trigger-controls.css';
import { useAutomationTriggerText } from './automationTriggerMessages';
import { AutomationTriggerControls } from './AutomationTriggerControls';
import type { AutomationNode } from './automationDefinitionContracts';
import type {
  AutomationActivation,
  AutomationTestListenerSession,
  AutomationTriggerCredential,
  AutomationTriggerEventReceipt,
  AutomationTriggerKind,
} from './automationTriggerContracts';
import { automationTriggerLabel } from './automationTriggerLabels';

type TriggerNode = AutomationNode & { kind: AutomationTriggerKind };

export type AutomationWorkspaceTriggerPanelProps = {
  resourceId: string;
  targetId: string;
  triggerNodes: TriggerNode[];
  effectiveEntrypointNodeId: string;
  selectedEntrypoint?: TriggerNode;
  activation?: AutomationActivation;
  activationCredential?: AutomationTriggerCredential;
  testListenerSession?: AutomationTestListenerSession;
  activationDraftMismatch: boolean;
  busy: string;
  archived: boolean;
  onEntrypointChange: (nodeId: string) => void;
  onRunOnce: () => Promise<AutomationTriggerEventReceipt>;
  onActivate: () => Promise<unknown>;
  onDeactivate: () => Promise<unknown>;
  onDismissActivationCredential: () => void;
  onStartListening: (ttlSeconds: number) => Promise<unknown>;
  onCancelListening: () => Promise<unknown>;
  onSubmitTestEvent: (payload: Record<string,unknown>) => Promise<AutomationTriggerEventReceipt>;
};

export function AutomationWorkspaceTriggerPanel({
  resourceId,triggerNodes,effectiveEntrypointNodeId,selectedEntrypoint,activation,activationCredential,
  testListenerSession,activationDraftMismatch,busy,archived,onEntrypointChange,onRunOnce,onActivate,
  onDeactivate,onDismissActivationCredential,onStartListening,onCancelListening,onSubmitTestEvent,
}: AutomationWorkspaceTriggerPanelProps) {
  const t = useAutomationTriggerText();
  if (triggerNodes.length === 0 || (
    triggerNodes.length === 1
    && (triggerNodes[0].kind === 'trigger.manual' || triggerNodes[0].kind === 'trigger.automation-call')
  )) return null;
  return (
    <section
      className="automation-trigger-controls-surface automation-trigger-controls-entrypoint-panel"
      data-xgc-layout="shell"
      data-xgc-role="automation-trigger-entrypoints"
      data-xgc-id={resourceId}
    >
      {triggerNodes.length > 1 && (
        <div
          className="automation-trigger-controls-entrypoint-selector"
          data-xgc-role="automation-trigger-entrypoint-selector"
          data-xgc-id={resourceId}
        >
          <SelectControl
            fill
            value={effectiveEntrypointNodeId}
            options={[
              { value: '',label: t('Select an entrypoint…') },
              ...triggerNodes.map((node) => ({ value: node.id,label: `${node.displayName} · ${t(automationTriggerLabel(node.kind))}` })),
            ]}
            disabled={Boolean(busy)}
            onChange={onEntrypointChange}
            ariaLabel={t('Trigger entrypoint')}
            dataXgcRole="automation-trigger-entrypoint-select"
            dataXgcId={resourceId}
          />
        </div>
      )}
      {selectedEntrypoint && (
        <AutomationTriggerControls
          embedded
          resourceId={resourceId}
          entrypointNodeId={selectedEntrypoint.id}
          triggerKind={selectedEntrypoint.kind}
          activation={activation}
          activationCredential={activationCredential}
          listenerSession={testListenerSession}
          draftDiffersFromActivation={activationDraftMismatch}
          busy={busy}
          disabled={archived}
          onRunOnce={onRunOnce}
          onActivate={onActivate}
          onDeactivate={onDeactivate}
          onDismissActivationCredential={onDismissActivationCredential}
          onStartListening={onStartListening}
          onCancelListening={onCancelListening}
          onSubmitTestEvent={onSubmitTestEvent}
        />
      )}
    </section>
  );
}
