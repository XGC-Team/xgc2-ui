import { useCallback, useId, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useConfirmationDialog } from '../hooks/useConfirmationDialog';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { classNames } from '../utils';
import { Button, type ButtonProps } from './Button';

export type DrawerActionHelpers = {
  dirty: boolean;
  requestClose: () => void;
};

type DataAttributes = {
  [key: `data-${string}`]: string | number | boolean | undefined;
};

export type DrawerProps = {
  actions?: ReactNode | ((helpers: DrawerActionHelpers) => ReactNode);
  ariaLabel?: string;
  actionsClassName?: string;
  backdropClassName?: string;
  backdropProps?: HTMLAttributes<HTMLDivElement> & DataAttributes;
  bodyClassName?: string;
  children: ReactNode | ((helpers: DrawerActionHelpers) => ReactNode);
  className?: string;
  closeButtonProps?: Omit<ButtonProps, 'children' | 'onClick'> & DataAttributes;
  closeLabel?: string;
  closeOnBackdrop?: boolean;
  description?: ReactNode;
  dirty?: boolean;
  discardCancelLabel?: string;
  discardChanges?: readonly string[];
  discardConfirmLabel?: string;
  discardMessage?: ReactNode;
  discardTitle?: ReactNode;
  dismissible?: boolean;
  dialogProps?: Omit<HTMLAttributes<HTMLElement>, 'children' | 'title'> & DataAttributes;
  footer?: ReactNode | ((helpers: DrawerActionHelpers) => ReactNode);
  footerClassName?: string;
  headerClassName?: string;
  hideHeader?: boolean;
  onClose: () => void;
  open?: boolean;
  portal?: boolean;
  portalTarget?: Element | DocumentFragment;
  showClose?: boolean;
  title: ReactNode;
  width?: 'default' | 'wide' | 'extra-wide';
};

export function Drawer({
  actions,
  actionsClassName,
  ariaLabel,
  backdropClassName,
  backdropProps,
  bodyClassName,
  children,
  className,
  closeButtonProps,
  closeLabel = 'Close drawer',
  closeOnBackdrop = false,
  description,
  dirty = false,
  discardCancelLabel = 'Keep editing',
  discardChanges,
  discardConfirmLabel = 'Discard changes',
  discardMessage,
  discardTitle = 'Discard unsaved changes?',
  dismissible = true,
  dialogProps,
  footer,
  footerClassName,
  headerClassName,
  hideHeader = false,
  onClose,
  open = true,
  portal = true,
  portalTarget,
  showClose = true,
  title,
  width = 'default',
}: DrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const confirmation = useConfirmationDialog();
  const dirtyRef = useRef(dirty);
  const discardChangesRef = useRef(discardChanges);
  dirtyRef.current = dirty;
  discardChangesRef.current = discardChanges;

  const requestClose = useCallback(() => {
    void (async () => {
      if (!dismissible) return;
      if (!dirtyRef.current) {
        onClose();
        return;
      }
      const changes = discardChangesRef.current ?? [];
      const confirmed = await confirmation.confirm({
        cancelLabel: discardCancelLabel,
        confirmLabel: discardConfirmLabel,
        message: (
          <div className="xgc-drawer-discard-summary" data-xgc-role="config-drawer-discard-summary">
            {discardMessage ? <div>{discardMessage}</div> : null}
            {changes.length ? (
              <ul data-xgc-role="config-drawer-discard-changes">{changes.map((change) => <li key={change}>{change}</li>)}</ul>
            ) : null}
          </div>
        ),
        title: discardTitle,
        tone: 'danger',
      });
      if (confirmed) onClose();
    })();
  }, [
    confirmation,
    discardCancelLabel,
    discardConfirmLabel,
    discardMessage,
    discardTitle,
    dismissible,
    onClose,
  ]);

  const onKeyDown = useDialogFocus({ dialogRef: drawerRef, dismissible, onClose: requestClose, open });
  if (!open || typeof document === 'undefined') return null;
  const helpers = { dirty, requestClose };
  const resolvedActions = typeof actions === 'function' ? actions(helpers) : actions;
  const resolvedChildren = typeof children === 'function' ? children(helpers) : children;
  const resolvedFooter = typeof footer === 'function' ? footer(helpers) : footer;
  const resolvedAriaLabel = ariaLabel ?? (hideHeader && typeof title === 'string' ? title : undefined);
  const drawer = (
    <>
      <div
        {...backdropProps}
        className={classNames('xgc-drawer-backdrop', backdropClassName, backdropProps?.className)}
        onMouseDown={(event) => {
          if (closeOnBackdrop && event.target === event.currentTarget) requestClose();
        }}
        role="presentation"
      >
        <aside
          {...dialogProps}
          aria-label={resolvedAriaLabel}
          aria-labelledby={resolvedAriaLabel || hideHeader ? undefined : titleId}
          aria-describedby={description ? descriptionId : undefined}
          aria-modal="true"
          className={classNames('xgc-drawer', className, dialogProps?.className)}
          data-dirty={dirty || undefined}
          data-footer={resolvedFooter ? 'true' : undefined}
          data-header={hideHeader ? 'false' : undefined}
          data-width={width}
          onKeyDown={onKeyDown}
          ref={drawerRef}
          role="dialog"
          tabIndex={-1}
        >
          {!hideHeader ? (
            <header className={classNames('xgc-drawer-header', headerClassName)}>
              <strong id={titleId}>{title}</strong>
              <div className={classNames('xgc-drawer-actions', actionsClassName)}>
                {resolvedActions}
                {showClose ? (
                  <Button
                    {...closeButtonProps}
                    appearance={closeButtonProps?.appearance ?? 'ghost'}
                    aria-label={closeLabel}
                    disabled={!dismissible || closeButtonProps?.disabled}
                    iconOnly
                    onClick={requestClose}
                    uiSize={closeButtonProps?.uiSize ?? 'compact'}
                  >×</Button>
                ) : null}
              </div>
            </header>
          ) : null}
          <div className={classNames('xgc-drawer-body', bodyClassName)}>
            {description ? <div className="xgc-drawer-description" id={descriptionId}>{description}</div> : null}
            {resolvedChildren}
          </div>
          {resolvedFooter ? <footer className={classNames('xgc-drawer-footer', footerClassName)}>{resolvedFooter}</footer> : null}
        </aside>
      </div>
      {confirmation.dialog}
    </>
  );
  return portal ? createPortal(drawer, portalTarget ?? document.body) : drawer;
}
