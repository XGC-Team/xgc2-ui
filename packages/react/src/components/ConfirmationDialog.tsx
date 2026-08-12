import type { ReactNode } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

export type ConfirmationDialogRequest = {
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
};

export type ConfirmationDialogProps = {
  request: ConfirmationDialogRequest;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmationDialog({ request, onCancel, onConfirm }: ConfirmationDialogProps) {
  return (
    <Modal
      actions={(
        <>
          <Button onClick={onCancel}>{request.cancelLabel ?? 'Cancel'}</Button>
          <Button appearance="solid" tone={request.tone ?? 'danger'} onClick={onConfirm}>
            {request.confirmLabel ?? 'Confirm'}
          </Button>
        </>
      )}
      alert
      onClose={onCancel}
      size="small"
      title={request.title}
    >
      {typeof request.message === 'string' || typeof request.message === 'number'
        ? <p className="xgc-modal-copy">{request.message}</p>
        : request.message}
    </Modal>
  );
}
