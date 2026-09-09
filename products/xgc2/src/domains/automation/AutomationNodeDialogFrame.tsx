import { Fragment,type ReactNode } from 'react';
import { Modal,Toolbar } from '@xgc2/ui-react';
import '../../styles/automation-node-dialog.css';

export type AutomationNodeDialogPane = {
  id: 'input' | 'configuration' | 'output';
  content: ReactNode;
};

export function AutomationNodeDialogFrame({ nodeId,title,actions,panes,onClose }: {
  nodeId: string;
  title: string;
  actions?: ReactNode;
  panes: readonly AutomationNodeDialogPane[];
  onClose: () => void;
}) {
  return (
    <Modal
      ariaLabel={`Node ${nodeId}`}
      backdropProps={{
        className: 'automation-node-dialog-backdrop',
        'data-xgc-role': 'automation-node-dialog-backdrop',
        'data-xgc-id': nodeId,
      }}
      className="automation-node-dialog"
      closeLabel="Close node dialog"
      dialogProps={{
        'data-xgc-role': 'automation-node-dialog',
        'data-xgc-id': nodeId,
      }}
      onClose={onClose}
      portal={false}
      size="large"
      title={title}
    >
      <div className="automation-node-dialog-content">
        <div
          className="automation-node-dialog-chrome"
          data-xgc-role="automation-node-dialog-chrome"
          data-xgc-id={nodeId}
        >
          <p className="automation-node-dialog-title">{title}</p>
          {actions ? <Toolbar className="automation-node-dialog-runtime">{actions}</Toolbar> : null}
        </div>
        <div
          className="automation-node-dialog-columns"
          data-xgc-role="automation-node-dialog-panes"
          data-xgc-id={nodeId}
          data-xgc-pane-count={panes.length}
        >
          {panes.map((pane) => <Fragment key={pane.id}>{pane.content}</Fragment>)}
        </div>
      </div>
    </Modal>
  );
}
