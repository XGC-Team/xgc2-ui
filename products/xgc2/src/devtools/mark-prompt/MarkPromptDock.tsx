import { Copy,GitCommitHorizontal,GripVertical,MessageSquarePlus,Send,X } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useCallback,useEffect,useLayoutEffect,useRef,useState } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { SelectControl } from '../../components/controls/SelectControl';
import { useMarkPromptDockVisible } from '../../hooks/useMarkPromptDockVisible';
import { usePersistentState } from '../../hooks/usePersistentState';
import { writeClipboardText } from '../../shared/utils/clipboard';
import '../../styles/mark-prompt.css';
import {
  buildElementSelector,
  buildLandAndReclaimPrompt,
  buildMarkPrompt,
  buildSemanticPath,
  buildStableSelector,
  clamp,
  clampFloatingBoxToViewport,
  clipBoundaryToViewport,
  findAnnotatableCandidates,
  isToolbarPosition,
  placeCaptionInViewport,
  readElementLabel,
  resolveToolbarPixelPosition,
  resolveAnnotationPosition,
  queryAnnotationTarget,
  toolbarPixelsToPercent,
  type BoundaryRect,
  type DevAnnotation,
  type FloatingSize,
  type MarkPromptDeliveryKind,
  type ToolbarPositionPercent,
  type ViewportSize,
} from './markPromptHelpers';
import { installMarkPromptBrowserDiagnostics } from './browserDiagnostics';
import {
  MARK_PROMPT_DEFAULT_PANE_LABEL,
  MarkPromptCommandError,
  listMarkPromptTargets,
  sendMarkPromptCommand,
  type MarkPromptCommandErrorCode,
  type MarkPromptListedTarget,
} from './markPromptCommandService';

export type MarkPromptDockProps = {
  page: string;
  pageId?: string;
  pageSection?: string;
  executionTargetId?: string;
  targetCoreId?: string;
  managedHostId?: string;
};

type PromptDeliveryState =
  | { status: 'idle' }
  | { status: 'sending'; kind: MarkPromptDeliveryKind }
  | { status: 'success'; kind: MarkPromptDeliveryKind }
  | { status: 'error'; kind: MarkPromptDeliveryKind; code: MarkPromptCommandErrorCode; message: string };

type HoverTargetSelection = {
  candidates: Element[];
  selectedIndex: number;
};

export function MarkPromptDock({
  page,
}: MarkPromptDockProps) {
  const dockVisible = useMarkPromptDockVisible();
  const [enabled, setEnabled] = useState(false);
  const [annotations, setAnnotations] = usePersistentState<DevAnnotation[]>('xgc.markPrompt.annotations.v1', [], isDevAnnotations);
  const [dragId, setDragId] = useState<string | null>(null);
  const [toolbarPos, setToolbarPos] = usePersistentState<ToolbarPositionPercent>('xgc.markPrompt.position', {
    xPercent: 1,
    yPercent: 1,
  }, isToolbarPosition);
  const toolbarDragRef = useRef<{ pointerId: number; dx: number; dy: number; moved: boolean } | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [promptDelivery, setPromptDelivery] = useState<PromptDeliveryState>({ status: 'idle' });
  const [preferredPane, setPreferredPane] = usePersistentState(
    'xgc.markPrompt.target.v1',
    MARK_PROMPT_DEFAULT_PANE_LABEL,
    isPaneIdentity,
  );
  const [targets, setTargets] = useState<MarkPromptListedTarget[]>([]);
  const [targetsBusy, setTargetsBusy] = useState(false);
  const [targetsError, setTargetsError] = useState('');
  const targetsRequestRef = useRef(0);
  const hoverSelectionRef = useRef<HoverTargetSelection | null>(null);
  const [hoverSelection, setHoverSelection] = useState<HoverTargetSelection | null>(null);
  const [viewportTick, setViewportTick] = useState(0);

  useEffect(() => {
    const update = () => setViewportTick((value) => value + 1);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, []);

  useEffect(() => installMarkPromptBrowserDiagnostics(), []);

  const refreshTargets = useCallback(async (isCancelled?: () => boolean) => {
    const requestId = ++targetsRequestRef.current;
    const cancelled = () => isCancelled?.() || requestId !== targetsRequestRef.current;
    setTargetsBusy(true);
    try {
      const listed = await listMarkPromptTargets();
      if (cancelled()) return;
      setTargets(listed);
      setTargetsError('');
    } catch (error) {
      if (cancelled()) return;
      setTargets([]);
      setTargetsError(compactDeliveryMessage(error));
    } finally {
      if (!cancelled()) setTargetsBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!dockVisible) return;
    let cancelled = false;
    const refresh = () => {
      if (document.visibilityState === 'visible') void refreshTargets(() => cancelled);
    };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      targetsRequestRef.current += 1;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [dockVisible, refreshTargets]);

  useEffect(() => {
    if (!enabled) return;
    const cancelMarking = (event: KeyboardEvent) => {
      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        const current = hoverSelectionRef.current;
        if (!current) return;
        event.preventDefault();
        event.stopPropagation();
        const delta = event.key === 'ArrowUp' ? 1 : -1;
        const selectedIndex = clamp(current.selectedIndex + delta, 0, current.candidates.length - 1);
        if (selectedIndex === current.selectedIndex) return;
        setCurrentHoverSelection({ ...current,selectedIndex });
        return;
      }
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setEnabled(false);
      setDragId(null);
      setCurrentHoverSelection(null);
    };
    window.addEventListener('keydown', cancelMarking, true);
    return () => window.removeEventListener('keydown', cancelMarking, true);
  }, [enabled]);

  useEffect(() => {
    setViewportTick((value) => value + 1);
  }, [promptDelivery.status]);

  useEffect(() => {
    if (dockVisible) return;
    setEnabled(false);
    setDragId(null);
    hoverSelectionRef.current = null;
    setHoverSelection(null);
  }, [dockVisible]);

  const pageAnnotations = annotations.filter((item) => item.page === page);
  const visibleAnnotations = enabled ? pageAnnotations : [];
  const viewport = currentViewportSize();
  const toolbarSize = {
    width: toolbarRef.current?.offsetWidth || toolbarFallbackSize.width,
    height: toolbarRef.current?.offsetHeight || toolbarFallbackSize.height,
  };
  const toolbarPixels = resolveToolbarPixelPosition(toolbarPos, viewport, toolbarSize);
  const toolbarPlacement = clampFloatingBoxToViewport(
    { left: toolbarPixels.x,top: toolbarPixels.y },
    toolbarSize,
    viewport,
    markerViewportMargin,
  );
  const generatedPrompt = buildMarkPrompt(annotations, page);
  const landPrompt = buildLandAndReclaimPrompt();
  const isSending = promptDelivery.status === 'sending';
  const selectedPaneId = resolveSelectedPaneId(targets, preferredPane);
  const selectedTarget = targets.find((target) => target.paneId === selectedPaneId);
  const canDeliver = Boolean(selectedTarget && selectedTarget.agentStatus !== 'blocked');
  const deliveryTargetLabel = selectedTarget?.paneLabel ?? 'selected Herdr pane';
  const sendButtonLabel = promptActionLabel('marks', promptDelivery, deliveryTargetLabel);
  const landButtonLabel = promptActionLabel('land', promptDelivery, deliveryTargetLabel);
  const landButtonTitle = promptDelivery.status === 'error' && promptDelivery.kind === 'land'
    ? promptDelivery.message
    : targetsError || `${landButtonLabel}。提交推送全部仓到远程主分支并回收工作树；必要时 APT 发车。`;
  const hoveredTarget = hoverSelection?.candidates[hoverSelection.selectedIndex] ?? null;
  const hoverBoundary = resolveTargetBoundary(hoveredTarget, viewportTick);

  function addAnnotation(event: ReactPointerEvent<HTMLDivElement>) {
    if (!enabled || isSending || event.target !== event.currentTarget) return;
    const selection = resolvePointerHoverSelection(event.clientX, event.clientY, hoverSelectionRef.current);
    const target = selection?.candidates[selection.selectedIndex] ?? null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const anchorX = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5;
    const anchorY = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
    const id = window.crypto?.randomUUID?.() ?? `annotation-${Date.now()}`;
    setPromptDelivery({ status: 'idle' });
    setCurrentHoverSelection(null);
    setAnnotations((items) => [
      ...items,
      {
        id,
        page,
        x: event.clientX,
        y: event.clientY,
        anchorX,
        anchorY,
        selector: buildElementSelector(target),
        stableSelector: buildStableSelector(target),
        semanticPath: buildSemanticPath(target, page),
        role: target.getAttribute('data-xgc-role') ?? undefined,
        elementId: target.getAttribute('data-xgc-id') ?? undefined,
        elementLabel: readElementLabel(target),
        elementTag: target.tagName.toLowerCase(),
        text: `标注 ${items.length + 1}`,
      },
    ]);
  }

  function moveAnnotation(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragId || isSending) return;
    setPromptDelivery({ status: 'idle' });
    setAnnotations((items) => items.map((item) => {
      if (item.id !== dragId) return item;
      const target = queryAnnotationTarget(item);
      if (!target) {
        return { ...item, x: event.clientX, y: event.clientY };
      }
      const rect = target.getBoundingClientRect();
      return {
        ...item,
        x: event.clientX,
        y: event.clientY,
        anchorX: clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1),
        anchorY: clamp((event.clientY - rect.top) / Math.max(rect.height, 1), 0, 1),
      };
    }));
  }

  function moveOnAnnotationLayer(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragId) {
      setCurrentHoverSelection(null);
      moveAnnotation(event);
      return;
    }
    if (!enabled || isSending || event.target !== event.currentTarget) {
      setCurrentHoverSelection(null);
      return;
    }
    setCurrentHoverSelection(resolvePointerHoverSelection(
      event.clientX,
      event.clientY,
      hoverSelectionRef.current,
    ));
  }

  function setCurrentHoverSelection(selection: HoverTargetSelection | null) {
    const current = hoverSelectionRef.current;
    if (current === selection) return;
    if (current && selection
        && current.selectedIndex === selection.selectedIndex
        && current.candidates.length === selection.candidates.length
        && current.candidates.every((candidate, index) => candidate === selection.candidates[index])) {
      return;
    }
    hoverSelectionRef.current = selection;
    setHoverSelection(selection);
  }

  function updateText(id: string, text: string) {
    if (isSending) return;
    setPromptDelivery({ status: 'idle' });
    setAnnotations((items) => items.map((item) => (item.id === id ? { ...item, text } : item)));
  }

  function removeAnnotation(id: string) {
    if (isSending) return;
    setPromptDelivery({ status: 'idle' });
    setAnnotations((items) => items.filter((item) => item.id !== id));
  }

  function clearAnnotations() {
    setPromptDelivery({ status: 'idle' });
    setAnnotations([]);
    setDragId(null);
    setCurrentHoverSelection(null);
  }

  function startToolbarDrag(event: ReactPointerEvent<HTMLSpanElement>) {
    if (event.button !== 0) return;
    const toolbar = event.currentTarget.closest('.dev-annotation-toolbar');
    if (!(toolbar instanceof HTMLElement)) return;
    const rect = toolbar.getBoundingClientRect();
    toolbarDragRef.current = {
      pointerId: event.pointerId,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveToolbar(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = toolbarDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const viewport = currentViewportSize();
    const toolbar = { width: event.currentTarget.offsetWidth, height: event.currentTarget.offsetHeight };
    const placement = clampFloatingBoxToViewport({
      left: event.clientX - drag.dx,
      top: event.clientY - drag.dy,
    }, toolbar, viewport, markerViewportMargin);
    const next = { x: placement.left,y: placement.top };
    if (Math.abs(next.x - toolbarPixels.x) > 2 || Math.abs(next.y - toolbarPixels.y) > 2) {
      drag.moved = true;
    }
    setToolbarPos(toolbarPixelsToPercent(next, viewport, toolbar));
  }

  function stopToolbarDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (toolbarDragRef.current?.pointerId === event.pointerId) {
      toolbarDragRef.current = null;
    }
  }

  async function copyPrompt() {
    if (isSending) return;
    try {
      await writeClipboardText(generatedPrompt);
      clearAnnotations();
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
    window.setTimeout(() => setCopyStatus('idle'), 1200);
  }

  async function deliverGeneratedPrompt() {
    if (annotations.length === 0) return;
    await deliverPrompt(generatedPrompt, 'marks', { clearMarks: true });
  }

  async function deliverLandAndReclaimPrompt() {
    await deliverPrompt(landPrompt, 'land', { clearMarks: false });
  }

  async function deliverPrompt(
    prompt: string,
    kind: MarkPromptDeliveryKind,
    options: { clearMarks: boolean },
  ) {
    if (isSending || !canDeliver || !selectedPaneId) return;
    setPromptDelivery({ status: 'sending', kind });
    try {
      await sendMarkPromptCommand(prompt, selectedPaneId);
      if (options.clearMarks) {
        setAnnotations([]);
        setDragId(null);
        setCurrentHoverSelection(null);
      }
      setPromptDelivery({ status: 'success', kind });
    } catch (error) {
      // Herdr can stop or change occupants after discovery. Re-read its state
      // without retrying delivery or clearing the developer's prompt.
      void refreshTargets();
      if (error instanceof MarkPromptCommandError) {
        setPromptDelivery({ status: 'error', kind, code: error.code, message: error.message });
      } else {
        setPromptDelivery({
          status: 'error',
          kind,
          code: 'network-error',
          message: compactDeliveryMessage(error),
        });
      }
    }
  }

  if (!dockVisible) return null;

  return (
    <>
      <div
        className="dev-annotation-layer"
        data-xgc-enabled={enabled ? 'true' : undefined}
        onPointerDown={addAnnotation}
        onPointerMove={moveOnAnnotationLayer}
        onPointerUp={() => setDragId(null)}
        onPointerCancel={() => {
          setDragId(null);
          setCurrentHoverSelection(null);
        }}
        onPointerLeave={() => {
          if (!dragId) setCurrentHoverSelection(null);
        }}
      >
        {visibleAnnotations.map((annotation, index) => {
          const target = queryAnnotationTarget(annotation);
          const boundary = resolveTargetBoundary(target, viewportTick);
          if (!boundary) return null;
          return (
            <div
              key={`boundary-${annotation.id}`}
              className="dev-annotation-target-outline"
              data-mark-phase="selected"
              data-xgc-id={annotation.id}
              style={boundary}
              aria-hidden="true"
            >
              <span className="dev-annotation-target-index">{index + 1}</span>
            </div>
          );
        })}
        {hoverBoundary && hoveredTarget && (
          <HoverTargetBoundary
            boundary={hoverBoundary}
            caption={hoverTargetCaption(
              hoveredTarget,
              hoverSelection?.selectedIndex ?? 0,
              hoverSelection?.candidates.length ?? 1,
            )}
            viewportTick={viewportTick}
          />
        )}
        {visibleAnnotations.map((annotation, index) => {
          const position = resolveAnnotationPosition(annotation, viewportTick);
          return (
            <AnnotationPin
              key={annotation.id}
              annotation={annotation}
              index={index}
              position={position}
              viewportTick={viewportTick}
              disabled={isSending}
              onStartDrag={() => {
                setCurrentHoverSelection(null);
                setDragId(annotation.id);
              }}
              onTextChange={(text) => updateText(annotation.id, text)}
              onRemove={() => removeAnnotation(annotation.id)}
              onSubmit={() => void deliverGeneratedPrompt()}
            />
          );
        })}
      </div>

      <div
        ref={toolbarRef}
        className="dev-annotation-toolbar"
        data-xgc-role="mark-prompt-toolbar"
        data-xgc-id="mark-prompt-toolbar"
        title={targetsError || undefined}
        style={{
          left: toolbarPlacement.left,
          top: toolbarPlacement.top,
          maxWidth: toolbarPlacement.maxWidth,
          maxHeight: toolbarPlacement.maxHeight,
        }}
        onPointerMove={moveToolbar}
        onPointerUp={stopToolbarDrag}
        onPointerCancel={stopToolbarDrag}
        onPointerEnter={() => setCurrentHoverSelection(null)}
      >
        <div className="mark-prompt-toolbar-row">
          <span
            className="dev-annotation-drag-handle"
            title="Drag mark prompt tools"
            onPointerDown={startToolbarDrag}
          >
            <GripVertical size={14} strokeWidth={1.8} />
          </span>
          <ControlButton
            className="mark-prompt-toggle"
            tone={enabled ? 'primary' : 'default'}
            disabled={isSending}
            aria-pressed={enabled}
            dataXgcRole="mark-prompt-toggle"
            dataXgcId="mark-prompt-toggle"
            onClick={() => {
              if (!enabled) void refreshTargets();
              setEnabled((value) => !value);
              setDragId(null);
              setCurrentHoverSelection(null);
            }}
          >
            <MessageSquarePlus size={15} />
            Mark
          </ControlButton>
          <SelectControl
            compact
            size="compact"
            className="mark-prompt-target"
            busy={targetsBusy}
            disabled={isSending}
            value={selectedPaneId}
            options={targets.map((target) => ({
              value: target.paneId,
              label: target.paneLabel,
              disabled: target.agentStatus === 'blocked',
            }))}
            placeholder="No Herdr pane"
            ariaLabel="Herdr pane"
            dataXgcRole="mark-prompt-target"
            dataXgcId="mark-prompt-target"
            menuPlacement="below"
            onOpen={() => refreshTargets()}
            onChange={(paneId) => {
              const selected = targets.find((target) => target.paneId === paneId);
              setPreferredPane(selected?.paneLabel || paneId);
              setPromptDelivery({ status: 'idle' });
            }}
          />
          <ControlButton
            size="compact"
            iconOnly
            className="mark-prompt-send-button"
            tone={deliveryTone('marks', promptDelivery)}
            onClick={() => void deliverGeneratedPrompt()}
            disabled={annotations.length === 0 || isSending || !canDeliver}
            aria-label={sendButtonLabel}
            data-xgc-role="mark-prompt-send"
            data-xgc-id="mark-prompt-send"
            title={promptDelivery.status === 'error' && promptDelivery.kind === 'marks' ? promptDelivery.message : targetsError || sendButtonLabel}
          >
            <Send size={15} />
          </ControlButton>
          <ControlButton
            size="compact"
            iconOnly
            className="mark-prompt-copy-button"
            onClick={() => void copyPrompt()}
            disabled={annotations.length === 0 || isSending}
            aria-label="Copy generated prompt"
            title={copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy generated prompt'}
            data-xgc-role="mark-prompt-copy"
            data-xgc-id="mark-prompt-copy"
          >
            <Copy size={13} />
          </ControlButton>
          <ControlButton
            size="compact"
            iconOnly
            className="mark-prompt-land-button"
            tone={deliveryTone('land', promptDelivery)}
            onClick={() => void deliverLandAndReclaimPrompt()}
            disabled={isSending || !canDeliver}
            aria-label={landButtonLabel}
            data-xgc-role="mark-prompt-land"
            data-xgc-id="mark-prompt-land"
            title={landButtonTitle}
          >
            <GitCommitHorizontal size={15} />
          </ControlButton>
        </div>
      </div>
    </>
  );
}

const markerViewportMargin = 8;
const toolbarFallbackSize: FloatingSize = { width: 400,height: 38 };
const hoverCaptionFallbackSize: FloatingSize = { width: 560,height: 22 };
const annotationPinFallbackSize: FloatingSize = { width: 520,height: 30 };

function HoverTargetBoundary({
  boundary,
  caption,
  viewportTick,
}: {
  boundary: BoundaryRect;
  caption: string;
  viewportTick: number;
}) {
  const captionRef = useRef<HTMLSpanElement>(null);
  const captionSize = useMeasuredElementSize(captionRef, hoverCaptionFallbackSize, caption, viewportTick);
  const placement = placeCaptionInViewport(
    boundary,
    captionSize,
    currentViewportSize(),
    markerViewportMargin,
  );
  return (
    <div
      className="dev-annotation-target-outline"
      data-mark-phase="hover"
      style={boundary}
      aria-hidden="true"
    >
      <span
        ref={captionRef}
        className="dev-annotation-target-caption"
        data-caption-placement={placement.placement}
        style={{
          left: placement.left,
          top: placement.top,
          width: Math.min(captionSize.width, placement.maxWidth),
          maxWidth: Math.min(hoverCaptionFallbackSize.width, placement.maxWidth),
          maxHeight: placement.maxHeight,
        }}
      >
        {caption}
      </span>
    </div>
  );
}

function AnnotationPin({
  annotation,
  index,
  position,
  viewportTick,
  disabled,
  onStartDrag,
  onTextChange,
  onRemove,
  onSubmit,
}: {
  annotation: DevAnnotation;
  index: number;
  position: { x: number;y: number };
  viewportTick: number;
  disabled: boolean;
  onStartDrag: () => void;
  onTextChange: (text: string) => void;
  onRemove: () => void;
  onSubmit: () => void;
}) {
  const pinRef = useRef<HTMLDivElement>(null);
  const pinSize = useMeasuredElementSize(
    pinRef,
    annotationPinFallbackSize,
    annotation.text,
    viewportTick,
  );
  const placement = clampFloatingBoxToViewport({
    left: position.x - 12,
    top: position.y - pinSize.height / 2,
  }, pinSize, currentViewportSize(), markerViewportMargin);
  return (
    <div
      ref={pinRef}
      className="dev-annotation-pin"
      data-xgc-role="mark-prompt-annotation-pin"
      data-xgc-id={annotation.id}
      style={{
        left: placement.left,
        top: placement.top,
        width: Math.min(pinSize.width, placement.maxWidth),
        maxWidth: Math.min(annotationPinFallbackSize.width, placement.maxWidth),
        maxHeight: placement.maxHeight,
      }}
      title={`${annotation.elementTag} ${annotation.elementLabel}\n${annotation.stableSelector || annotation.selector}`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        if (event.target instanceof Element && event.target.closest('input, button')) return;
        event.stopPropagation();
        onStartDrag();
      }}
    >
      <span className="dev-annotation-pin-index">{index + 1}</span>
      <input
        value={annotation.text}
        disabled={disabled}
        aria-label="Mark change"
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => onTextChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
          event.preventDefault();
          event.stopPropagation();
          onSubmit();
        }}
      />
      <ControlButton size="compact" iconOnly disabled={disabled} onClick={onRemove} aria-label="Remove mark" dataXgcRole="mark-prompt-remove" dataXgcId="mark-prompt-remove">
        <X size={12} />
      </ControlButton>
    </div>
  );
}

function useMeasuredElementSize<T extends HTMLElement>(
  ref: { current: T | null },
  fallback: FloatingSize,
  measurementKey: string,
  viewportTick: number,
): FloatingSize {
  const [size, setSize] = useState<FloatingSize>(fallback);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setSize((current) => (
        Math.abs(current.width - rect.width) < 0.5 && Math.abs(current.height - rect.height) < 0.5
          ? current
          : { width: rect.width,height: rect.height }
      ));
    };
    update();
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measurementKey,ref,viewportTick]);
  return size;
}

function currentViewportSize(): ViewportSize {
  return { width: window.innerWidth,height: window.innerHeight };
}

function resolveTargetBoundary(target: Element | null, tick: number): BoundaryRect | null {
  void tick;
  if (!target?.isConnected) return null;
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return clipBoundaryToViewport({
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  }, currentViewportSize());
}

function resolvePointerHoverSelection(
  x: number,
  y: number,
  current: HoverTargetSelection | null,
): HoverTargetSelection | null {
  const candidates = findAnnotatableCandidates(x, y);
  if (candidates.length === 0) return null;
  if (current?.candidates[0] === candidates[0]) {
    const selected = current.candidates[current.selectedIndex];
    const selectedIndex = candidates.indexOf(selected);
    if (selectedIndex >= 0) return { candidates,selectedIndex };
  }
  return { candidates,selectedIndex: 0 };
}

function hoverTargetCaption(target: Element, selectedIndex: number, candidateCount: number): string {
  const selector = buildStableSelector(target) || buildElementSelector(target);
  const hierarchy = candidateCount > 1
    ? ` · ${selectedIndex + 1}/${candidateCount}${selectedIndex < candidateCount - 1 ? ' · Alt+↑ parent' : ''}${selectedIndex > 0 ? ' · Alt+↓ child' : ''}`
    : '';
  return `${target.tagName.toLowerCase()} · ${selector || readElementLabel(target)}${hierarchy}`.slice(0, 220);
}

function promptActionLabel(
  kind: MarkPromptDeliveryKind,
  delivery: PromptDeliveryState,
  paneLabel: string,
): string {
  const noun = kind === 'marks' ? 'generated prompt' : 'land-and-reclaim prompt';
  if (delivery.status === 'idle' || delivery.kind !== kind) {
    return `Send ${noun} to ${paneLabel}`;
  }
  if (delivery.status === 'sending') return `Sending ${noun} to ${paneLabel}`;
  if (delivery.status === 'success') return `Sent ${noun} to ${paneLabel}`;
  return `Retry sending ${noun} to ${paneLabel}`;
}

function deliveryTone(kind: MarkPromptDeliveryKind, delivery: PromptDeliveryState): 'default' | 'primary' | 'danger' | 'success' {
  if (delivery.status === 'idle' || delivery.kind !== kind) return 'primary';
  if (delivery.status === 'success') return 'success';
  if (delivery.status === 'error') return 'danger';
  return 'primary';
}

function compactDeliveryMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'The local prompt bridge is unavailable.';
  return message.replace(/\s+/g, ' ').trim().slice(0, 240) || 'The local prompt bridge is unavailable.';
}

function resolveSelectedPaneId(targets: MarkPromptListedTarget[], preferred: string): string {
  if (targets.length === 0) return '';
  const byLabel = targets.find((target) => target.paneLabel === preferred);
  if (byLabel) return byLabel.paneId;
  const byId = targets.find((target) => target.paneId === preferred);
  if (byId) return byId.paneId;
  const lead = targets.find((target) => target.primary || target.paneLabel === MARK_PROMPT_DEFAULT_PANE_LABEL);
  if (lead) return lead.paneId;
  return targets[0].paneId;
}

function isPaneIdentity(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(value);
}

function isDevAnnotations(value: unknown): value is DevAnnotation[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const annotation = item as Partial<DevAnnotation>;
    return typeof annotation.id === 'string'
      && typeof annotation.page === 'string'
      && typeof annotation.x === 'number'
      && Number.isFinite(annotation.x)
      && typeof annotation.y === 'number'
      && Number.isFinite(annotation.y)
      && typeof annotation.text === 'string';
  });
}
