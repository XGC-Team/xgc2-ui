import { Settings,Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { WorkspacePanel } from '@xgc2/ui-react';
import { ControlButton } from '../components/controls/ControlButton';
import type { PanelInstance } from '../domains/experiment/experimentPublic';
import './PanelFrame.css';

export function PanelFrame({
  panel,
  selected,
  editing,
  gcsMode = false,
  chrome,
  interactiveWhileEditing = false,
  children,
  headerLeading,
  headerStatus,
  headerActions,
  onSelect,
  onConfigure,
  onDelete,
}: {
  panel: PanelInstance;
  selected: boolean;
  editing?: boolean;
  gcsMode?: boolean;
  chrome?: 'framed' | 'seamed' | 'flat';
  interactiveWhileEditing?: boolean;
  children: ReactNode;
  headerLeading?: ReactNode;
  headerStatus?: ReactNode;
  headerActions?: ReactNode;
  onSelect: () => void;
  onConfigure?: () => void;
  onDelete?: () => void;
}) {
  const showHeader = Boolean(editing || headerLeading || headerStatus || headerActions || onConfigure || onDelete);
  return (
    <WorkspacePanel
      actions={(
        <>
          <div className="xgc-panel-frame-leading" data-xgc-role="experiment-panel-header-leading" data-xgc-id={panel.id}>
            {headerLeading}
          </div>
          {headerStatus != null && (
            <div className="xgc-panel-frame-status" data-xgc-role="experiment-panel-header-status" data-xgc-id={panel.id}>
              {headerStatus}
            </div>
          )}
          <div className="xgc-panel-frame-trailing" data-xgc-role="experiment-panel-header-trailing" data-xgc-id={panel.id}>
            {headerActions}
            {/* Shared edit chrome: configure then delete. Plugins only fill the drawer. */}
            {onConfigure && (
              <ControlButton
                className="xgc-panel-frame-action"
                size="compact"
                iconOnly
                title="Panel settings"
                aria-label="Panel settings"
                dataXgcRole="panel-config"
                dataXgcId={panel.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onConfigure();
                }}
              >
                <Settings size={14} aria-hidden="true" />
              </ControlButton>
            )}
            {onDelete && (
              <ControlButton
                className="xgc-panel-frame-action"
                size="compact"
                tone="danger"
                iconOnly
                title="Delete panel"
                aria-label="Delete panel"
                dataXgcRole="panel-delete"
                dataXgcId={panel.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 size={14} aria-hidden="true" />
              </ControlButton>
            )}
          </div>
        </>
      )}
      actionsClassName="xgc-panel-frame-actions"
      bodyClassName="xgc-panel-frame-body"
      chrome={chrome ?? (gcsMode ? 'seamed' : 'framed')}
      className="xgc-panel-frame"
      data-xgc-role="experiment-panel"
      data-xgc-id={panel.id}
      data-panel-id={panel.id}
      data-xgc-width={panel.gridPos.w}
      data-xgc-selected={editing && selected ? 'true' : undefined}
      data-xgc-editing={editing ? 'true' : undefined}
      data-xgc-interactive-while-editing={editing && interactiveWhileEditing ? 'true' : undefined}
      editing={editing}
      headerClassName="xgc-panel-frame-header"
      headerProps={{
        hidden: !showHeader,
        'data-xgc-role': 'experiment-panel-header',
        'data-xgc-id': panel.id,
      }}
      interactiveWhileEditing={interactiveWhileEditing}
      onSelect={onSelect}
      selected={selected}
      // Experiment exception: keep actions, never a visible panel subtitle.
      title={<span className="xgc-visually-hidden">{panel.title}</span>}
    >
      {children}
    </WorkspacePanel>
  );
}
