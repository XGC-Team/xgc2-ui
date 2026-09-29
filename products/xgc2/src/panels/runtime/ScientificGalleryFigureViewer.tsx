import { ChevronLeft,ChevronRight,Maximize2,ZoomIn,ZoomOut } from 'lucide-react';
import { useCallback,useEffect,useLayoutEffect,useRef,useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { fetchROSBagFigure,type ImageGalleryFile } from '../../domains/experiment/experimentPublic';
import { ControlButton } from '../../components/controls/ControlButton';
import { Modal } from '../../components/Modal';
import { useRuntimePanelText } from './runtimeMessages';

const ZOOM_STEP = 1.25;
const ZOOM_MIN = 0.05;
const ZOOM_MAX = 64;

type ViewerOffset = { x: number; y: number };
type ViewerSize = { w: number; h: number };

/**
 * Vector-aware detail viewer for one published figure. SVG stays an <img> with
 * explicit pixel geometry so the browser re-renders the vector at every zoom
 * level instead of upscaling a cached raster.
 */
export function ScientificGalleryFigureViewer({ panelId,galleryId,files,index,onClose,onNavigate }: {
  panelId: string;
  galleryId: string;
  files: readonly ImageGalleryFile[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const t = useRuntimePanelText();
  const file = files[index];
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origin: ViewerOffset } | null>(null);
  const [url,setUrl] = useState('');
  const [natural,setNatural] = useState<ViewerSize>({ w: 0,h: 0 });
  const [stageSize,setStageSize] = useState<ViewerSize>({ w: 0,h: 0 });
  const [zoom,setZoom] = useState(1);
  const [offset,setOffset] = useState<ViewerOffset>({ x: 0,y: 0 });

  useEffect(() => {
    setUrl('');
    setNatural({ w: 0,h: 0 });
    setZoom(1);
    setOffset({ x: 0,y: 0 });
    const controller = new AbortController();
    let objectUrl = '';
    fetchROSBagFigure(galleryId,file.name,controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setUrl('');
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  },[file.createdAt,file.name,file.size,galleryId]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (typeof ResizeObserver === 'undefined') {
      setStageSize({ w: stage.clientWidth,h: stage.clientHeight });
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setStageSize({ w: rect.width,h: rect.height });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  },[]);

  const fitScale = natural.w > 0 && natural.h > 0 && stageSize.w > 0 && stageSize.h > 0
    ? Math.min(stageSize.w / natural.w,stageSize.h / natural.h)
    : 0;
  const baseScale = fitScale || 1;
  const content: ViewerSize = { w: natural.w * baseScale * zoom,h: natural.h * baseScale * zoom };

  const zoomAt = useCallback((factor: number,px: number,py: number) => {
    const next = Math.min(ZOOM_MAX,Math.max(ZOOM_MIN,zoom * factor));
    if (next === zoom) return;
    const ratio = next / zoom;
    setOffset(clampOffset(
      { x: px - (px - offset.x) * ratio,y: py - (py - offset.y) * ratio },
      { w: content.w * ratio,h: content.h * ratio },
      stageSize,
    ));
    setZoom(next);
  },[content.h,content.w,offset.x,offset.y,stageSize,zoom]);

  const resetView = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0,y: 0 });
  },[]);

  const showActualSize = useCallback(() => {
    if (fitScale <= 0) return;
    setZoom(1 / fitScale);
    setOffset({ x: 0,y: 0 });
  },[fitScale]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      zoomAt(
        event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP,
        event.clientX - rect.left - rect.width / 2,
        event.clientY - rect.top - rect.height / 2,
      );
    };
    stage.addEventListener('wheel',onWheel,{ passive: false });
    return () => stage.removeEventListener('wheel',onWheel);
  },[zoomAt]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault();
        onNavigate(index - 1);
      } else if (event.key === 'ArrowRight' && index < files.length - 1) {
        event.preventDefault();
        onNavigate(index + 1);
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoomAt(ZOOM_STEP,0,0);
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        zoomAt(1 / ZOOM_STEP,0,0);
      } else if (event.key === '0') {
        event.preventDefault();
        resetView();
      }
    };
    document.addEventListener('keydown',onKey);
    return () => document.removeEventListener('keydown',onKey);
  },[files.length,index,onNavigate,resetView,zoomAt]);

  const pannable = content.w > stageSize.w + 1 || content.h > stageSize.h + 1;
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !pannable) return;
    dragRef.current = { pointerId: event.pointerId,startX: event.clientX,startY: event.clientY,origin: offset };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset(clampOffset(
      { x: drag.origin.x + event.clientX - drag.startX,y: drag.origin.y + event.clientY - drag.startY },
      content,
      stageSize,
    ));
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const percent = Math.round(baseScale * zoom * 100);
  return (
    <Modal
      actions={(
        <div className="scientific-gallery-viewer-tools">
          <ControlButton
            aria-label={t('Zoom out')}
            dataXgcId={panelId}
            dataXgcRole="scientific-gallery-viewer-zoom-out"
            disabled={zoom <= ZOOM_MIN}
            iconOnly
            size="compact"
            title={t('Zoom out')}
            onClick={() => zoomAt(1 / ZOOM_STEP,0,0)}
          >
            <ZoomOut size={15} aria-hidden="true" />
          </ControlButton>
          <span
            className="scientific-gallery-viewer-zoom-level"
            data-xgc-role="scientific-gallery-viewer-zoom-level"
            data-xgc-id={panelId}
          >
            {percent}%
          </span>
          <ControlButton
            aria-label={t('Zoom in')}
            dataXgcId={panelId}
            dataXgcRole="scientific-gallery-viewer-zoom-in"
            disabled={zoom >= ZOOM_MAX}
            iconOnly
            size="compact"
            title={t('Zoom in')}
            onClick={() => zoomAt(ZOOM_STEP,0,0)}
          >
            <ZoomIn size={15} aria-hidden="true" />
          </ControlButton>
          <ControlButton
            aria-label={t('Fit to view')}
            dataXgcId={panelId}
            dataXgcRole="scientific-gallery-viewer-zoom-fit"
            iconOnly
            size="compact"
            title={t('Fit to view')}
            onClick={resetView}
          >
            <Maximize2 size={15} aria-hidden="true" />
          </ControlButton>
          <ControlButton
            aria-label={t('Actual size')}
            dataXgcId={panelId}
            dataXgcRole="scientific-gallery-viewer-zoom-actual"
            disabled={fitScale <= 0}
            size="compact"
            title={t('Actual size')}
            onClick={showActualSize}
          >
            1:1
          </ControlButton>
        </div>
      )}
      ariaLabel={t('Figure viewer')}
      backdropClassName="scientific-gallery-viewer-backdrop"
      className="scientific-gallery-viewer-dialog"
      closeLabel={t('Close figure viewer')}
      closeOnBackdrop={false}
      dataXgcId={panelId}
      dataXgcRole="scientific-gallery-figure-viewer"
      description={files.length > 1
        ? t('Figure {index} of {count}',{ count: files.length,index: index + 1 })
        : undefined}
      size="large"
      title={file.name}
      onClose={onClose}
    >
      <div
        ref={stageRef}
        className="scientific-gallery-viewer-stage"
        data-pannable={pannable ? 'true' : undefined}
        onPointerCancel={endDrag}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
      >
        {url && (
          <img
            alt={file.name}
            className="scientific-gallery-viewer-image"
            draggable={false}
            src={url}
            style={content.w > 0
              ? {
                width: `${content.w}px`,
                height: `${content.h}px`,
                transform: `translate(${offset.x}px, ${offset.y}px)`,
              }
              : { visibility: 'hidden' }}
            onLoad={(event) => {
              const image = event.currentTarget;
              setNatural({ w: image.naturalWidth,h: image.naturalHeight });
            }}
          />
        )}
        <ControlButton
          aria-label={t('Previous figure')}
          className="scientific-gallery-viewer-previous"
          dataXgcId={panelId}
          dataXgcRole="scientific-gallery-viewer-previous"
          disabled={index <= 0}
          iconOnly
          size="compact"
          title={t('Previous figure')}
          onClick={() => onNavigate(index - 1)}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </ControlButton>
        <ControlButton
          aria-label={t('Next figure')}
          className="scientific-gallery-viewer-next"
          dataXgcId={panelId}
          dataXgcRole="scientific-gallery-viewer-next"
          disabled={index >= files.length - 1}
          iconOnly
          size="compact"
          title={t('Next figure')}
          onClick={() => onNavigate(index + 1)}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </ControlButton>
      </div>
    </Modal>
  );
}

function clampOffset(offset: ViewerOffset,content: ViewerSize,stage: ViewerSize): ViewerOffset {
  const maxX = Math.max(0,(content.w - stage.w) / 2);
  const maxY = Math.max(0,(content.h - stage.h) / 2);
  return {
    x: Math.min(maxX,Math.max(-maxX,offset.x)),
    y: Math.min(maxY,Math.max(-maxY,offset.y)),
  };
}
