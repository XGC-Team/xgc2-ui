import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { classNames } from '../utils';
import { Button } from './Button';

export type ModalProps = {
  actions?: ReactNode;
  alert?: boolean;
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
  closeOnBackdrop?: boolean;
  description?: ReactNode;
  dismissible?: boolean;
  onClose: () => void;
  open?: boolean;
  portalTarget?: Element | DocumentFragment;
  size?: 'small' | 'default' | 'large';
  title: ReactNode;
};

export function Modal({
  actions,
  alert = false,
  ariaLabel,
  children,
  className,
  closeLabel = 'Close dialog',
  closeOnBackdrop = true,
  description,
  dismissible = true,
  onClose,
  open = true,
  portalTarget,
  size = 'default',
  title,
}: ModalProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const onKeyDown = useDialogFocus({ dialogRef, dismissible, onClose, open });

  if (!open || typeof document === 'undefined') return null;
  const modal = (
    <div
      className="xgc-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (closeOnBackdrop && dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className={classNames('xgc-modal', className)}
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

  return createPortal(modal, portalTarget ?? document.body);
}
