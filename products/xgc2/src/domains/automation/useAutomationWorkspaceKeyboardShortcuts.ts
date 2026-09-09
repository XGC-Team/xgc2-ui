import { useEffect,useRef } from 'react';
import type { AutomationGraphClipboard } from './useAutomationGraphCommands';
import { isEditableTarget } from './automationWorkspaceSupport';

function hasNativeTextSelection() {
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString().length > 0);
}

export function useAutomationWorkspaceKeyboardShortcuts({ closeSelectionDialog,closeNodeLibrary }: {
  closeSelectionDialog: () => void;
  closeNodeLibrary: () => void;
}) {
  const saveRef = useRef<() => void>(() => undefined);
  const undoRef = useRef<() => void>(() => undefined);
  const redoRef = useRef<() => void>(() => undefined);
  const addStickyNoteRef = useRef<() => void>(() => undefined);
  const copiedElementsRef = useRef<AutomationGraphClipboard | null>(null);
  const copyNodeRef = useRef<() => boolean>(() => false);
  const pasteNodeRef = useRef<() => boolean>(() => false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSelectionDialog();
        closeNodeLibrary();
        return;
      }
      if (!event.ctrlKey && !event.metaKey && event.shiftKey && event.key.toLowerCase() === 's' && !isEditableTarget(event.target)) {
        event.preventDefault();
        addStickyNoteRef.current();
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || isEditableTarget(event.target)) return;
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveRef.current();
      } else if (event.key.toLowerCase() === 'z' && event.shiftKey) {
        event.preventDefault();
        redoRef.current();
      } else if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undoRef.current();
      } else if (event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redoRef.current();
      } else if (event.key.toLowerCase() === 'c') {
        // A visible text selection belongs to the browser clipboard even when
        // an Automation canvas node remains selected in the background.
        if (hasNativeTextSelection()) return;
        if (copyNodeRef.current()) event.preventDefault();
      } else if (event.key.toLowerCase() === 'v' && pasteNodeRef.current()) {
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeNodeLibrary,closeSelectionDialog]);

  return {
    saveRef,undoRef,redoRef,addStickyNoteRef,copiedElementsRef,copyNodeRef,pasteNodeRef,
  };
}
