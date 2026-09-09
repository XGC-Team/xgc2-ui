import { LoaderCircle,Play,Save,Square } from 'lucide-react';
import { useLayoutEffect,useState } from 'react';
import { createPortal } from 'react-dom';
import { ControlButton } from '../../components/controls/ControlButton';
import { useProductRouteVisible } from '../../shared/routeReady';
import { useAutomationAuthoringText } from './automationAuthoringMessages';
import { AutomationAdmissionEditor } from './AutomationAdmissionEditor';
import { AutomationRunParameterSchemaEditor } from './AutomationRunParameterSchemaEditor';
import type { AutomationWorkspaceView } from './AutomationDefinitionWorkspace.types';
import type { AutomationAction } from './automationDefinitionContracts';
import type { AutomationTriggerKind } from './automationTriggerContracts';
import { shortRunID } from './automationWorkspaceSupport';
import { AutomationPaneTabs } from './AutomationNodePanelTabs';

export type AutomationWorkspaceTopbarProps = {
  resourceId: string;
  view: AutomationWorkspaceView;
  action?: AutomationAction;
  canEdit: boolean;
  busy: string;
  dirty: boolean;
  archived: boolean;
  editorRunId?: string;
  editorRunActive: boolean;
  editorRunStopping: boolean;
  triggerKind: AutomationTriggerKind | '';
  onViewChange: (view: AutomationWorkspaceView) => void;
  onActionChange: (action: AutomationAction) => void;
  onSave: () => Promise<unknown>;
  onStop: () => void;
  onPrepareRun: () => void;
};

export function AutomationWorkspaceTopbar({
  resourceId,view,action,canEdit,busy,dirty,archived,editorRunId,editorRunActive,
  editorRunStopping,triggerKind,onViewChange,onActionChange,
  onSave,onStop,onPrepareRun,
}: AutomationWorkspaceTopbarProps) {
  const t = useAutomationAuthoringText();
  const routeVisible = useProductRouteVisible();
  const [host,setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setHost(globalThis.document.getElementById('xgc-page-topbar-actions'));
  }, []);
  if (!routeVisible) return null;
  const viewSwitch = <AutomationPaneTabs
    ariaLabel={t('Automation workspace')}
    className="automation-workspace-view-switch"
    dataXgcId={resourceId}
    dataXgcRole="automation-workspace-view-switch"
    onChange={onViewChange}
    optionDataXgcRole="automation-workspace-view"
    options={(['editor', 'executions'] as const).map((item) => ({
      ariaControls: `automation-workspace-${item}-${resourceId}`,
      dataXgcId: item,
      id: `automation-workspace-${item}-tab-${resourceId}`,
      label: t(item === 'editor' ? 'Editor' : 'History'),
      value: item,
    }))}
    value={view}
  />;
  const admissionSetting = view === 'editor' && action ? (
    <AutomationAdmissionEditor
      resourceId={resourceId}
      admission={action.admission}
      readOnly={!canEdit}
      disabled={Boolean(busy)}
      onChange={(admission) => onActionChange({ ...action,admission })}
    />
  ) : null;
  const parameterSetting = view === 'editor' && action ? (
    <AutomationRunParameterSchemaEditor
      resourceId={resourceId}
      actionId={action.id}
      actionLabel={action.label}
      schema={action.inputSchema}
      readOnly={!canEdit}
      disabled={Boolean(busy)}
      onChange={(inputSchema) => onActionChange({ ...action,inputSchema })}
    />
  ) : null;
  if (!host) return <>{viewSwitch}{admissionSetting}{parameterSetting}</>;
  return createPortal(<div className="automation-workspace-topbar" role="group" aria-label={t('Automation workspace')} data-xgc-role="automation-workspace-toolbar" data-xgc-id={resourceId}>
    {viewSwitch}
    {(parameterSetting || admissionSetting) && <div className="automation-workspace-settings">
      {parameterSetting}
      {admissionSetting}
    </div>}
    {view === 'editor' && canEdit && (
      <ControlButton className="automation-workspace-command-control" type="button" data-xgc-role="automation-definition-save" data-xgc-id={resourceId} disabled={!dirty || Boolean(busy)} onClick={() => void onSave().catch(() => undefined)}>{busy === 'save' ? <LoaderCircle data-xgc-spinning="true" size={14} /> : <Save size={14} />}{t('Save')}</ControlButton>
    )}
    {view === 'editor' && !archived && <>
      {editorRunActive && editorRunId ? (
        <ControlButton
          className="automation-workspace-command-control"
          tone="danger"
          appearance="solid"
          type="button"
          aria-label={editorRunStopping
            ? t('Stopping run {id}', { id: shortRunID(editorRunId) })
            : t('Stop run {id}', { id: shortRunID(editorRunId) })}
          data-xgc-role={editorRunStopping ? 'automation-run-stopping' : 'automation-run-stop'}
          data-xgc-id={editorRunId}
          disabled={Boolean(busy) || editorRunStopping}
          onClick={onStop}
        >{editorRunStopping ? <LoaderCircle data-xgc-spinning="true" size={14} /> : <Square size={14} />}{t('Stop')}</ControlButton>
      ) : triggerKind === 'trigger.manual' && (
        <ControlButton className="automation-workspace-command-control" tone="primary" dataXgcRole="automation-run-open" dataXgcId={resourceId} disabled={Boolean(busy)} onClick={onPrepareRun}>{busy === 'run' ? <LoaderCircle data-xgc-spinning="true" size={14} /> : <Play size={14} />}{t('Run')}</ControlButton>
      )}
    </>}
  </div>, host);
}
