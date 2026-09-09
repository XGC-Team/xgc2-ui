import { History,Network,ScrollText,Workflow } from 'lucide-react';
import { useCallback,useMemo,useState } from 'react';
import { SelectControl } from '../../components/controls/SelectControl';
import { PanelViewSwitcher } from '../../components/PanelViewSwitcher';
import type { PanelPluginFrameProviderProps,PanelPluginHeaderActionsProps } from '../types';
import {
  automationWorkflowAuditView,
  automationWorkflowControlSwitcherView,
  configuredAutomationResourceIds,
  type AutomationWorkflowPanelView,
} from './automationWorkflowPanelModel';
import {
  AutomationWorkflowPanelFrameContext,
  useAutomationWorkflowPanelFrame,
  type AutomationWorkflowOption,
} from './automationWorkflowPanelFrameState';
import { useAutomationExecutionText } from '../../domains/automation/automationPublic';

export type AutomationWorkflowPanelVariant = 'control' | 'audit';

export function AutomationWorkflowControlFrameProvider(props: PanelPluginFrameProviderProps) {
  return <AutomationWorkflowPanelFrameProvider {...props} variant="control" />;
}

export function AutomationWorkflowAuditFrameProvider(props: PanelPluginFrameProviderProps) {
  return <AutomationWorkflowPanelFrameProvider {...props} variant="audit" />;
}

function AutomationWorkflowPanelFrameProvider({
  panel,
  children,
  variant,
}: PanelPluginFrameProviderProps & { variant: AutomationWorkflowPanelVariant }) {
  const [view, setView] = useState<AutomationWorkflowPanelView>(
    () => automationWorkflowPanelView(variant, panel.options.defaultView),
  );
  const [workflows, setWorkflowsState] = useState<AutomationWorkflowOption[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(
    () => configuredAutomationResourceIds(panel.options)[0] ?? '',
  );
  const [selectedRunId, setSelectedRunId] = useState('');
  const setWorkflows = useCallback((nextWorkflows: AutomationWorkflowOption[]) => {
    setWorkflowsState((current) => current.length === nextWorkflows.length
      && current.every((workflow, index) => workflow.id === nextWorkflows[index]?.id
        && workflow.label === nextWorkflows[index]?.label
        && workflow.resourceId === nextWorkflows[index]?.resourceId)
      ? current
      : nextWorkflows);
  }, []);
  const selectWorkflow = useCallback((workflowId: string) => {
    setSelectedWorkflowId(workflowId);
    setSelectedRunId('');
  }, []);
  const value = useMemo(() => ({
    panelId: panel.id,
    view,
    setView,
    workflows,
    setWorkflows,
    selectedWorkflowId,
    selectWorkflow,
    selectedRunId,
    setSelectedRunId,
  }), [panel.id,selectedRunId,selectedWorkflowId,selectWorkflow,setWorkflows,view,workflows]);
  return <AutomationWorkflowPanelFrameContext.Provider value={value}>{children}</AutomationWorkflowPanelFrameContext.Provider>;
}

export function AutomationWorkflowControlHeaderActions(props: PanelPluginHeaderActionsProps) {
  return <AutomationWorkflowPanelHeaderActions {...props} variant="control" />;
}

export function AutomationWorkflowAuditHeaderActions(props: PanelPluginHeaderActionsProps) {
  return <AutomationWorkflowPanelHeaderActions {...props} variant="audit" />;
}

function AutomationWorkflowPanelHeaderActions({
  panel,
  variant,
}: PanelPluginHeaderActionsProps & { variant: AutomationWorkflowPanelVariant }) {
  const frameState = useAutomationWorkflowPanelFrame(panel.id);
  const t = useAutomationExecutionText();
  const viewItems = variant === 'control'
    ? [
        { id: 'controls' as const,label: t('Controls'),icon: Workflow },
        { id: 'whiteboard' as const,label: t('Workflow'),icon: Network },
      ]
    : [
        { id: 'history' as const,label: t('History'),icon: History },
        { id: 'logs' as const,label: t('Logs'),icon: ScrollText },
      ];
  // Control tiles already list every workflow. Every inspection view needs one
  // selected workflow; the audit variant only contains inspection views.
  const showWorkflowSelector = frameState.workflows.length > 0
    && (variant === 'audit' || frameState.view !== 'controls');
  return (
    <div className="automation-workflow-header-actions" data-xgc-role="automation-workflow-header-actions" data-xgc-id={panel.id}
      data-xgc-workflow-view-active={frameState.view === 'whiteboard' ? 'true' : undefined}>
      <PanelViewSwitcher
        value={frameState.view}
        items={viewItems}
        onChange={frameState.setView}
        ariaLabel={t('Automation workflow panel views')}
        presentation="icons"
        appearance="panel"
        dataXgcRole="automation-workflow-view-switcher"
        dataXgcId={panel.id}
        optionDataXgcRole="automation-workflow-view"
      />
      {showWorkflowSelector && (
        <div className="automation-workflow-header-selector" data-xgc-role="automation-workflow-selector" data-xgc-id={panel.id}>
          <SelectControl
            className="automation-workflow-header-select"
            size="compact"
            fill
            menuAlign="end"
            value={frameState.selectedWorkflowId || frameState.workflows[0]?.id || ''}
            options={frameState.workflows.map((workflow) => ({ value: workflow.id,label: workflow.label }))}
            onChange={frameState.selectWorkflow}
            icon={<Workflow size={13} aria-hidden="true" />}
            ariaLabel={t('Selected Automation workflow')}
            dataXgcRole="automation-workflow-selector-listbox"
            dataXgcId={panel.id}
          />
        </div>
      )}
    </div>
  );
}

function automationWorkflowPanelView(variant: AutomationWorkflowPanelVariant, value: unknown) {
  return variant === 'control'
    ? automationWorkflowControlSwitcherView(value)
    : automationWorkflowAuditView(value);
}
