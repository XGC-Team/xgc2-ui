import { useEffect,useRef } from 'react';
import { useAutomationAuthoringText } from './automationAuthoringMessages';
import type {
  AutomationDocument,
  AutomationNode,
  AutomationNodeCatalogEntry,
} from './automationDefinitionContracts';
import { AutomationNodePanelTabs } from './AutomationNodePanelTabs';
import { AutomationNodeParameters } from './AutomationNodeParameters';
import { AutomationNodeSettings } from './AutomationNodeSettings';
import type { AutomationParameterOptions } from './AutomationParameterControls';
import {
  automationNodeEditorFromComposition,
  type AutomationNodeWebComposition,
} from './nodes/automationNodeWebComposition';

export function AutomationNodeConfigPanel({
  node,
  catalog,
  parameterSchema,
  parameterPath = 'root',
  parameterOptions,
  automationDocuments,
  inputSourceIds = [],
  executionTargetId = 'local',
  readOnly = false,
  nodeComposition,
  onChange,
  onError,
}: {
  node: AutomationNode;
  catalog?: AutomationNodeCatalogEntry;
  parameterSchema?: Record<string,unknown>;
  parameterPath?: 'root' | 'parameters';
  parameterOptions?: AutomationParameterOptions;
  automationDocuments?: readonly AutomationDocument[];
  inputSourceIds?: readonly string[];
  executionTargetId?: string;
  readOnly?: boolean;
  nodeComposition?: AutomationNodeWebComposition;
  onChange: (patch: Partial<AutomationNode>) => void;
  onError: (error: string) => void;
}) {
  const t = useAutomationAuthoringText();
  const editor = automationNodeEditorFromComposition(
    nodeComposition, node.kind, node.typeVersion,
  );
  const priorStaticParameterError = useRef<string | null>(null);
  useEffect(() => {
    if (!catalog || catalog.kind !== node.kind || catalog.typeVersion !== node.typeVersion) return;
    const validationError = editor?.validateCatalogEntry?.(catalog);
    if (validationError) onError(validationError);
  }, [catalog,editor,node.kind,node.typeVersion,onError]);
  useEffect(() => {
    const validationError = editor?.validateParameters?.(node) ?? null;
    if (validationError) {
      priorStaticParameterError.current = validationError;
      onError(validationError);
      return;
    }
    if (priorStaticParameterError.current) {
      priorStaticParameterError.current = null;
      onError('');
    }
  }, [editor,node,onError]);
  return (
    <AutomationNodePanelTabs
      nodeId={node.id}
      tabs={[
        {
          id: 'parameters',
          label: t('Parameters'),
          content: (
            <AutomationNodeParameters
              node={node}
              catalog={catalog}
              parameterSchema={parameterSchema}
              parameterPath={parameterPath}
              parameterOptions={parameterOptions}
              automationDocuments={automationDocuments}
              inputSourceIds={inputSourceIds}
              executionTargetId={executionTargetId}
              readOnly={readOnly}
              editor={editor}
              onChange={onChange}
              onError={onError}
            />
          ),
        },
        {
          id: 'settings',
          label: t('Settings'),
          content: <AutomationNodeSettings node={node} readOnly={readOnly} onChange={onChange} />,
        },
      ]}
    />
  );
}
