import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent,
  type SetStateAction,
} from 'react';
import {
  robotInstrumentPageSizeForView,
  robotInstrumentPageSlice,
  useRobotInstrumentPageSizes,
  useRobotInstrumentViewMode,
} from '../../domains/experiment/experimentPublic';
import {
  robotInstrumentBoardLayout,
  robotInstrumentScrollTarget,
  robotInstrumentSelectionContainsCenter,
  robotInstrumentSelectionRectangle,
  robotInstrumentToggleAllSelection,
  robotInstrumentWheelDelta,
  robotInstrumentWheelRows,
} from './robotInstrumentBoardModel';

export function useRobotInstrumentBoard({
  experimentId,
  dashboardId,
  panelId,
  robotIds,
  visibleRobotIds,
  setSelected,
}: {
  experimentId?: string;
  dashboardId?: string;
  panelId?: string;
  robotIds: readonly string[];
  visibleRobotIds: readonly string[];
  setSelected: Dispatch<SetStateAction<string[]>>;
}) {
  const scope = useMemo(() => ({ experimentId,dashboardId,panelId }), [dashboardId,experimentId,panelId]);
  const [viewMode] = useRobotInstrumentViewMode(scope);
  const [pageSizes] = useRobotInstrumentPageSizes(scope);
  const [pageIndex,setPageIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const selectionBoxRef = useRef<HTMLDivElement>(null);
  const selectionDragRef = useRef<{ pointerId: number;startX: number;startY: number } | undefined>(undefined);
  const boardScrollStepRef = useRef(0);
  const pageCountRef = useRef(1);
  const [boardRowHeight,setBoardRowHeight] = useState(200);

  useEffect(() => {
    const ids = new Set(robotIds);
    setSelected((items) => {
      const next = items.filter((id) => ids.has(id));
      return next.length === items.length ? items : next;
    });
  }, [robotIds,setSelected]);

  // Switching view or configured page size restarts paging: the old page index
  // means nothing once the page holds a different number of instruments.
  useEffect(() => {
    setPageIndex(0);
  }, [pageSizes,scope,viewMode]);

  useLayoutEffect(() => {
    if (viewMode !== 'single' && viewMode !== 'double' && viewMode !== 'list') return;
    const board = boardRef.current;
    if (!board) return;
    const update = () => {
      if (board.clientHeight <= 0) return;
      const style = window.getComputedStyle(board);
      const gap = Number.parseFloat(style.rowGap) || 0;
      const verticalPadding = (Number.parseFloat(style.paddingTop) || 0)
        + (Number.parseFloat(style.paddingBottom) || 0);
      if (viewMode === 'list') {
        const rowHeight = Number.parseFloat(style.gridAutoRows) || 87;
        boardScrollStepRef.current = rowHeight + gap;
        return;
      }
      const layout = robotInstrumentBoardLayout(board.clientHeight, gap, verticalPadding);
      boardScrollStepRef.current = layout.scrollStep;
      setBoardRowHeight((current) => Math.abs(current - layout.rowHeight) < 0.5 ? current : layout.rowHeight);
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(board);
    return () => observer.disconnect();
  }, [viewMode]);

  // Whole-item wheel scroll for list / single / double. pageCountRef keeps this
  // native listener on the latest render without reinstalling it per page.
  // List has no bottom page bar: at an edge, the same wheel flips the configured
  // page (items-per-page still comes from panel private state).
  useEffect(() => {
    if (viewMode !== 'single' && viewMode !== 'double' && viewMode !== 'list') return;
    const board = boardRef.current;
    if (!board) return;
    let accumulatedDelta = 0;
    let previousDirection = 0;
    let previousEventAt = 0;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || event.deltaY === 0) return;
      event.preventDefault();
      const direction = Math.sign(event.deltaY);
      if (direction !== previousDirection || event.timeStamp - previousEventAt > 180) accumulatedDelta = 0;
      previousDirection = direction;
      previousEventAt = event.timeStamp;
      const wheel = robotInstrumentWheelRows(
        accumulatedDelta,
        robotInstrumentWheelDelta(event.deltaY, event.deltaMode, board.clientHeight),
      );
      accumulatedDelta = wheel.remainder;
      if (wheel.rowDelta === 0) return;
      const before = board.scrollTop;
      const nextScroll = robotInstrumentScrollTarget(
        board.scrollTop,board.scrollHeight,board.clientHeight,boardScrollStepRef.current,wheel.rowDelta,
      );
      board.scrollTop = nextScroll;
      if (viewMode !== 'list') return;
      // At a scroll edge (or nothing to scroll), advance the configured page.
      if (Math.abs(nextScroll - before) >= 0.5) return;
      const pageDelta = Math.sign(wheel.rowDelta);
      if (pageDelta === 0) return;
      setPageIndex((current) => {
        const maxPage = Math.max(0, pageCountRef.current - 1);
        const next = Math.max(0, Math.min(maxPage, current + pageDelta));
        if (next !== current) board.scrollTop = pageDelta > 0 ? 0 : Math.max(0, board.scrollHeight - board.clientHeight);
        return next;
      });
    };
    board.addEventListener('wheel', onWheel, { passive: false });
    return () => board.removeEventListener('wheel', onWheel);
  }, [viewMode]);

  const toggleRobot = useCallback((robotId: string) => {
    setSelected((items) => items.includes(robotId)
      ? items.filter((item) => item !== robotId)
      : [...items,robotId]);
  }, [setSelected]);

  const clearSelectionBox = useCallback(() => {
    selectionDragRef.current = undefined;
    if (selectionBoxRef.current) selectionBoxRef.current.hidden = true;
  }, []);

  const updateSelectionBox = useCallback((board: HTMLDivElement, clientX: number, clientY: number) => {
    const drag = selectionDragRef.current;
    const panel = panelRef.current;
    const box = selectionBoxRef.current;
    if (!drag || !panel || !box) return undefined;
    const selection = robotInstrumentSelectionRectangle(
      { x: drag.startX,y: drag.startY },{ x: clientX,y: clientY },board.getBoundingClientRect(),
    );
    const panelBounds = panel.getBoundingClientRect();
    box.hidden = false;
    box.style.left = `${selection.left - panelBounds.left}px`;
    box.style.top = `${selection.top - panelBounds.top}px`;
    box.style.width = `${selection.width}px`;
    box.style.height = `${selection.height}px`;
    return selection;
  }, []);

  const beginBoxSelection = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button === 1) {
      event.preventDefault();
      clearSelectionBox();
      setSelected((items) => robotInstrumentToggleAllSelection(items, visibleRobotIds));
      return;
    }
    if (event.button !== 0 || event.pointerType === 'touch') return;
    if ((event.target as Element).closest('[data-xgc-role="run-robot-card"]')) return;
    event.preventDefault();
    selectionDragRef.current = { pointerId: event.pointerId,startX: event.clientX,startY: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateSelectionBox(event.currentTarget, event.clientX, event.clientY);
  }, [clearSelectionBox,setSelected,updateSelectionBox,visibleRobotIds]);

  const moveBoxSelection = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (selectionDragRef.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    updateSelectionBox(event.currentTarget, event.clientX, event.clientY);
  }, [updateSelectionBox]);

  const finishBoxSelection = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = selectionDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const selection = updateSelectionBox(event.currentTarget, event.clientX, event.clientY);
    if (selection && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 4) {
      const hits = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-xgc-role="run-robot-card"]'))
        .filter((card) => robotInstrumentSelectionContainsCenter(selection, card.getBoundingClientRect()))
        .map((card) => card.dataset.xgcId ?? '')
        .filter(Boolean);
      if (hits.length) setSelected((items) => Array.from(new Set([...items,...hits])));
    }
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    clearSelectionBox();
  }, [clearSelectionBox,setSelected,updateSelectionBox]);

  // List / single / double each honor their own configured items-per-page.
  const pageSize = robotInstrumentPageSizeForView(pageSizes, viewMode);
  const page = robotInstrumentPageSlice(visibleRobotIds, pageSize, pageIndex);
  pageCountRef.current = page.pageCount;

  return {
    viewMode,
    pageSizes,
    pageIndex: page.pageIndex,
    pageCount: page.pageCount,
    pageSize: page.pageSize,
    pagedRobotIds: page.items,
    setPageIndex,
    panelRef,
    boardRef,
    selectionBoxRef,
    boardRowHeight,
    toggleRobot,
    beginBoxSelection,
    moveBoxSelection,
    finishBoxSelection,
    clearSelectionBox,
  };
}
