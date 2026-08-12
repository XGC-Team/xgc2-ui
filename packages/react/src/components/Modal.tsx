import { useId, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { classNames } from '../utils';
import { Button } from './Button';

export type ModalProps = {
  actions?: ReactNode;
  alert?: boolean;
  ariaLabel?: string;
  backdropProps?: HTMLAttributes<HTMLDivElement> & DataAttributes;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
  closeOnBackdrop?: boolean;
  description?: ReactNode;
  dismissible?: boolean;
  dialogProps?: Omit<HTMLAttributes<HTMLElement>, 'children' | 'title'> & DataAttributes;
  onClose: () => void;
  open?: boolean;
  portal?: boolean;
  portalTarget?: Element | DocumentFragment;
  size?: 'small' | 'default' | 'large';
  title: ReactNode;
};

type DataAttributes = {
  [key: `data-${string}`]: boolean | number | string | undefined;
};

export function Modal({
  actions,
  alert = false,
  ariaLabel,
  backdropProps,
  children,
  className,
  closeLabel = 'Close dialog',
  closeOnBackdrop = true,
  description,
  dismissible = true,
  dialogProps,
  onClose,
  open = true,
  portal = true,
  portalTarget,
  size = 'default',
  title,
}: ModalProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const onKeyDown = useDialogFocus({ dialogRef, dismissible, onClose, open });

  if (!open) return null;
  const modal = (
    <div
      {...backdropProps}
      className={classNames('xgc-modal-backdrop', backdropProps?.className)}
      role="presentation"
      onMouseDown={(event) => {
        if (closeOnBackdrop && dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        {...dialogProps}
        ref={dialogRef}
        className={classNames('xgc-modal', className, dialogProps?.className)}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : titleId}
        aria-describedby={description ? descriptionId : undefined}
        data-size={size}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="xgc-modal-header">
          <div>
            <strong id={titleId}>{title}</strong>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          {dismissible ? (
            <Button
              appearance="ghost"
              iconOnly
              uiSize="compact"
              aria-label={closeLabel}
              onClick={onClose}
            >
              <span className="xgc-modal-close-icon" aria-hidden="true">×</span>
            </Button>
          ) : null}
        </header>
        <div className="xgc-modal-body">{children}</div>
        {actions ? <footer className="xgc-modal-actions">{actions}</footer> : null}
      </section>
    </div>
  );

  if (!portal) return modal;
  if (typeof document === 'undefined') return null;
  return createPortal(modal, portalTarget ?? document.body);
}
