function copyWithSelectionFallback(text: string) {
  if (typeof document.execCommand !== 'function') return false;
  const activeElement = document.activeElement;
  const selection = document.getSelection();
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange())
    : [];
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.inset = '0 auto auto -9999px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } finally {
    textarea.remove();
    if (selection) {
      selection.removeAllRanges();
      ranges.forEach((range) => selection.addRange(range));
    }
    if (activeElement instanceof HTMLElement) activeElement.focus({ preventScroll: true });
  }
  return copied;
}

/** Writes exact text or rejects; callers must only report success after it resolves. */
export async function writeClipboardText(text: string) {
  let clipboardError: unknown;
  if (typeof navigator.clipboard?.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      clipboardError = error;
    }
  }
  if (copyWithSelectionFallback(text)) return;
  if (clipboardError !== undefined) throw clipboardError;
  throw new Error('Clipboard write is unavailable');
}
