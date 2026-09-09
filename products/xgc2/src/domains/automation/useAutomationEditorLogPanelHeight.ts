import { useEffect,useRef,useState,type KeyboardEvent as ReactKeyboardEvent,type PointerEvent as ReactPointerEvent,type RefObject } from 'react';

export const AUTOMATION_EDITOR_LOG_MIN_HEIGHT = 160;

const DEFAULT_PANEL_HEIGHT = 300;
const PANEL_HEIGHT_STORAGE_KEY = 'xgc.automation.editorLogs.height';

export function useAutomationEditorLogPanelHeight(panelRef: RefObject<HTMLElement | null>) {
  const [panelHeight, setPanelHeight] = useState(readPanelHeight);
  const dragCleanup = useRef<(() => void) | null>(null);

  useEffect(() => () => dragCleanup.current?.(), []);

  function setHeight(next: number, persist = false) {
    const height = clampPanelHeight(next, panelRef.current);
    setPanelHeight(height);
    if (persist) writePanelHeight(height);
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    dragCleanup.current?.();
    const startY = event.clientY;
    const startHeight = panelHeight;
    const move = (nextEvent: PointerEvent) => setHeight(startHeight + startY - nextEvent.clientY);
    const finish = (nextEvent: PointerEvent) => {
      setHeight(startHeight + startY - nextEvent.clientY, true);
      cleanup();
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      dragCleanup.current = null;
    };
    dragCleanup.current = cleanup;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }

  function resizeByKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!['ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home'
      ? AUTOMATION_EDITOR_LOG_MIN_HEIGHT
      : event.key === 'End'
        ? automationEditorLogPanelMaxHeight(panelRef.current)
        : panelHeight + (event.key === 'ArrowUp' ? 24 : -24);
    setHeight(next, true);
  }

  return { panelHeight,startResize,resizeByKeyboard };
}

export function automationEditorLogPanelMaxHeight(panel: HTMLElement | null) {
  const editorHeight = panel?.parentElement?.getBoundingClientRect().height;
  return Math.max(AUTOMATION_EDITOR_LOG_MIN_HEIGHT, Math.round((editorHeight || viewportHeight()) * .75));
}

function readPanelHeight() {
  const fallback = Math.max(DEFAULT_PANEL_HEIGHT, Math.round(viewportHeight() * .3));
  try {
    const stored = Number(window.localStorage.getItem(PANEL_HEIGHT_STORAGE_KEY));
    return clampPanelHeight(Number.isFinite(stored) && stored > 0 ? stored : fallback, null);
  } catch {
    return clampPanelHeight(fallback, null);
  }
}

function writePanelHeight(height: number) {
  try {
    window.localStorage.setItem(PANEL_HEIGHT_STORAGE_KEY, String(height));
  } catch {
    // Local storage is an enhancement; resizing still works without it.
  }
}

function clampPanelHeight(height: number, panel: HTMLElement | null) {
  return Math.round(Math.min(automationEditorLogPanelMaxHeight(panel), Math.max(AUTOMATION_EDITOR_LOG_MIN_HEIGHT, height)));
}

function viewportHeight() {
  return typeof window === 'undefined' ? 800 : Math.max(window.innerHeight, 320);
}
