import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';

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
  dismissible,
  onClose,
  open,
}: {
  dialogRef: RefObject<HTMLElement | null>;
  dismissible: boolean;
  onClose: () => void;
  open: boolean;
}) {
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  onCloseRef.current = onClose;
  dismissibleRef.current = dismissible;

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    const dialog = dialogRef.current;
    if (!dialog || event.nativeEvent.isComposing) return;
    if (event.key === 'Escape' && dismissibleRef.current) {
      event.preventDefault();
      onCloseRef.current();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = focusableElements(dialog);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }, [dialogRef]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const preferred = dialog.querySelector<HTMLElement>('[autofocus], [data-dialog-initial-focus]');
    (preferred ?? focusableElements(dialog)[0] ?? dialog).focus();
    return () => {
      if (trigger?.isConnected) trigger.focus();
    };
  }, [dialogRef, open]);

  return onKeyDown;
}

function focusableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => element.getAttribute('aria-hidden') !== 'true');
}
