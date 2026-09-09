import type { ReactNode } from 'react';
import { ControlButton,type ControlButtonProps } from './controls/ControlButton';
import { useConfigDrawerRequestClose } from './ConfigDrawerCloseContext';

/** Cancel control that always uses the drawer discard-confirm close path. */
export function ConfigDrawerDismissButton({
  children = 'Cancel',
  type = 'button',
  ...props
}: Omit<ControlButtonProps, 'onClick'> & { children?: ReactNode }) {
  const requestClose = useConfigDrawerRequestClose();
  return (
    <ControlButton type={type} {...props} onClick={() => { void requestClose(); }}>
      {children}
    </ControlButton>
  );
}
