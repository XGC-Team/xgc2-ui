import {
  useCallback,
  useEffect,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { isInsideOwnedOverlay, useOverlayEscapeHandler } from '../components/OverlayStack';

const focusableSelector = [
  'button:not(:disabled)',
  'a[href]',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useDialogFocus({
  dialogRef,
  dialogId,
  dismissible,
  open,
}: {
  dialogRef: RefObject<HTMLElement | null>;
  dialogId?: string;
  dismissible: boolean;
  open: boolean;
}) {
  const closeTopOverlay = useOverlayEscapeHandler();

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    const dialog = dialogRef.current;
    if (!dialog || event.nativeEvent.isComposing) return;
    if (event.key === 'Escape' && dismissible) {
      if (event.defaultPrevented) return;
      closeTopOverlay(event);
      return;
    }
    if (event.defaultPrevented) return;
    if (event.key !== 'Tab') return;

    const focusable = focusableElements(dialog);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const activeElement = document.activeElement;
    if (isInsideOwnedOverlay(activeElement, dialogId)) return;
    const focusOwned = dialog.contains(activeElement);
    if (event.shiftKey && (activeElement === first || !focusOwned)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (activeElement === last || !focusOwned)) {
      event.preventDefault();
      first.focus();
    }
  }, [closeTopOverlay, dialogId, dialogRef, dismissible]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const preferred = dialog.querySelector<HTMLElement>([
      '[autofocus]',
      '[data-dialog-initial-focus]',
      '.xgc-drawer-body input:not(:disabled)',
      '.xgc-drawer-body select:not(:disabled)',
      '.xgc-drawer-body textarea:not(:disabled)',
    ].join(','));
    (preferred ?? focusableElements(dialog)[0] ?? dialog).focus();
    return () => {
      if (trigger?.isConnected) trigger.focus();
    };
  }, [dialogRef, open]);

  return onKeyDown;
}

function focusableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => element.getAttribute('aria-hidden') !== 'true')
    .sort((left, right) => (
      left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    ));
}
