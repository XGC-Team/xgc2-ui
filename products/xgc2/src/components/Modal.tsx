import { Modal as SharedModal } from '@xgc2/ui-react';
import type { ReactNode } from 'react';

export function Modal({
  actions,
  alert = false,
  ariaLabel,
  backdropClassName,
  children,
  className,
  closeLabel = 'Close dialog',
  closeOnBackdrop = true,
  description,
  dismissible = true,
  onClose,
  open = true,
  size = 'default',
  title,
  dataXgcId,
  dataXgcRole = 'modal',
}: {
  actions?: ReactNode;
  alert?: boolean;
  ariaLabel?: string;
  backdropClassName?: string;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
  closeOnBackdrop?: boolean;
  description?: ReactNode;
  dismissible?: boolean;
  onClose: () => void;
  open?: boolean;
  size?: 'small' | 'default' | 'large';
  title: ReactNode;
  dataXgcId?: string;
  dataXgcRole?: string;
}) {
  return (
    <SharedModal
      actions={actions}
      alert={alert}
      ariaLabel={ariaLabel}
      backdropProps={{ className:backdropClassName }}
      className={className}
      closeLabel={closeLabel}
      closeOnBackdrop={closeOnBackdrop}
      description={description}
      dialogProps={{
        'data-xgc-id': dataXgcId,
        'data-xgc-role': dataXgcRole,
        'data-xgc-size': size,
      }}
      dismissible={dismissible}
      onClose={onClose}
      open={open}
      size={size}
      title={title}
    >
      {children}
    </SharedModal>
  );
}
