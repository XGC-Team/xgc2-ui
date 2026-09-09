import { Drawer as SharedDrawer } from '@xgc2/ui-react';
import type { ReactNode } from 'react';
import { ConfigDrawerCloseContext, type ConfigDrawerActionHelpers } from './ConfigDrawerCloseContext';

export type { ConfigDrawerActionHelpers } from './ConfigDrawerCloseContext';
export { ConfigDrawerDismissButton } from './ConfigDrawerClose';

export type ConfigDrawerProps = {
  actions?: ReactNode | ((helpers: ConfigDrawerActionHelpers) => ReactNode);
  ariaLabel?: string;
  backdropClassName?: string;
  bodyClassName?: string;
  children: ReactNode;
  className?: string;
  closeDataXgcId?: string;
  closeDataXgcRole?: string;
  closeLabel?: string;
  closeOnBackdrop?: boolean;
  dataXgcId?: string;
  dataXgcPlugin?: string;
  dataXgcRole?: string;
  dirty?: boolean;
  discardCancelLabel?: string;
  discardChanges?: readonly string[];
  discardConfirmLabel?: string;
  discardMessage?: string;
  discardTitle?: string;
  dismissible?: boolean;
  footer?: ReactNode | ((helpers: ConfigDrawerActionHelpers) => ReactNode);
  hideHeader?: boolean;
  onClose: () => void;
  open?: boolean;
  showClose?: boolean;
  subtitle?: ReactNode;
  title: ReactNode;
};

/** Product compatibility boundary backed entirely by the shared right drawer. */
export function ConfigDrawer({
  actions,
  ariaLabel,
  backdropClassName,
  bodyClassName,
  children,
  className = '',
  closeDataXgcId,
  closeDataXgcRole,
  closeLabel = 'Close drawer',
  closeOnBackdrop = false,
  dataXgcId,
  dataXgcPlugin,
  dataXgcRole = 'config-drawer',
  dirty = false,
  discardCancelLabel = 'Keep editing',
  discardChanges,
  discardConfirmLabel = 'Discard changes',
  discardMessage,
  discardTitle = 'Discard unsaved changes?',
  dismissible = true,
  footer,
  hideHeader = false,
  onClose,
  open = true,
  showClose = true,
  subtitle,
  title,
}: ConfigDrawerProps) {
  const width = className.includes('config-drawer-extra-wide')
    ? 'extra-wide'
    : className.includes('config-drawer-wide')
      ? 'wide'
      : 'default';
  const provide = (helpers: ConfigDrawerActionHelpers, content: ReactNode) => (
    <ConfigDrawerCloseContext.Provider value={helpers.requestClose}>{content}</ConfigDrawerCloseContext.Provider>
  );

  return (
    <SharedDrawer
      actions={actions ? (helpers) => provide(helpers, typeof actions === 'function' ? actions(helpers) : actions) : undefined}
      actionsClassName="config-drawer-actions"
      ariaLabel={ariaLabel}
      backdropClassName={`config-drawer-backdrop ${backdropClassName ?? ''}`.trim()}
      backdropProps={{ 'data-xgc-plugin': dataXgcPlugin }}
      bodyClassName={`config-drawer-body ${bodyClassName ?? ''}`.trim()}
      className={`config-drawer ${className}`.trim()}
      closeButtonProps={{
        'data-xgc-id': closeDataXgcId,
        'data-xgc-role': closeDataXgcRole,
      }}
      closeLabel={closeLabel}
      closeOnBackdrop={closeOnBackdrop}
      description={subtitle}
      dialogProps={{
        'data-xgc-dirty': dirty ? 'true' : undefined,
        'data-xgc-footer': footer ? 'true' : undefined,
        'data-xgc-header': hideHeader ? 'false' : undefined,
        'data-xgc-id': dataXgcId,
        'data-xgc-plugin': dataXgcPlugin,
        'data-xgc-role': dataXgcRole,
      }}
      dirty={dirty}
      discardCancelLabel={discardCancelLabel}
      discardChanges={discardChanges}
      discardConfirmLabel={discardConfirmLabel}
      discardMessage={discardMessage}
      discardTitle={discardTitle}
      dismissible={dismissible}
      footer={footer ? (helpers) => provide(helpers, typeof footer === 'function' ? footer(helpers) : footer) : undefined}
      footerClassName="config-drawer-footer"
      hideHeader={hideHeader}
      onClose={onClose}
      open={open}
      portal={false}
      showClose={showClose}
      title={title}
      width={width}
    >
      {(helpers) => provide(helpers, children)}
    </SharedDrawer>
  );
}
