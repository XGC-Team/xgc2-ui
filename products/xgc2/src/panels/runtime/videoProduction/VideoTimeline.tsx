import { useEffect,useRef,useState,type ReactNode } from 'react';
import { Camera,EyeOff,Sparkles,ZoomIn,ZoomOut } from 'lucide-react';
import { ControlButton } from '../../../components/controls/ControlButton';
import type { VideoTrack } from '../../../domains/recording/recordingPublic';
import { useVideoProductionText } from './videoProductionMessages';
import { formatTimecode,frameStepNs,frameTimeNs,nearestFrameIndex,snapToFrameNs,timelineMaxZoom,timelineTicks,timelineViewWindow } from './videoTimelineModel';

export function VideoTimeline({ id,durationNs,fps,startNs,endNs,frame,frameCount,disabled,onClipChange,onScrub,tracks,selectedTrackId,onSelectTrack,trailFrames,onAddTrailSample,onRemoveTrailSample,cameraLabel,stillFrame,tools }: {
  id: string;
  durationNs: bigint;
  fps: number;
  startNs: bigint;
  endNs: bigint;
  frame: number;
  frameCount: number;
  disabled?: boolean;
  onClipChange: (start: bigint,end: bigint) => void;
  onScrub: (frame: number) => void;
  /** Valid wire tracks rendered as span lanes; selection feeds the inspector. */
  tracks?: readonly VideoTrack[];
  selectedTrackId?: string;
  onSelectTrack?: (id: string) => void;
  /** Trail samples are output frame indices; markers delete, the playhead adds. */
  trailFrames?: readonly number[];
  onAddTrailSample?: (frame: number) => void;
  onRemoveTrailSample?: (frame: number) => void;
  /** The recorded camera that forms the V1 clip lane. */
  cameraLabel?: string;
  /** Clip-relative output frame of a still rendition. */
  stillFrame?: number;
  /** Studio edit tools (mark in/out, still, trail) placed in the readout bar. */
  tools?: ReactNode;
}) {
  const t = useVideoProductionText();
  const root = useRef<HTMLDivElement | null>(null);
  const track = useRef<HTMLDivElement | null>(null);
  const [zoom,setZoom] = useState(1);
  const [viewStart,setViewStart] = useState(0n);
  const step = frameStepNs(fps);
  const playheadNs = startNs + frameTimeNs(BigInt(Math.max(0,Math.min(frame,Math.max(frameCount - 1,0)))),fps);
  const windowNs = timelineViewWindow(durationNs,zoom,playheadNs,viewStart);
  const windowLength = windowNs.endNs - windowNs.startNs;
  const ratio = (value: bigint) => {
    if (windowLength <= 0n) return 0;
    const relative = Number(value - windowNs.startNs) / Number(windowLength);
    return Math.min(1,Math.max(0,relative));
  };
  useEffect(() => { setZoom(1);setViewStart(0n); },[durationNs]);
  useEffect(() => {
    setViewStart((current) => {
      const next = timelineViewWindow(durationNs,zoom,playheadNs,current);
      return next.startNs === current ? current : next.startNs;
    });
  },[durationNs,zoom,playheadNs]);
  useEffect(() => {
    const node = root.current;
    if (!node) return undefined;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom((current) => Math.min(timelineMaxZoom(durationNs),Math.max(1,event.deltaY < 0 ? current * 2 : current / 2)));
    };
    node.addEventListener('wheel',onWheel,{ passive: false });
    return () => node.removeEventListener('wheel',onWheel);
  },[durationNs]);
  const timeAt = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || windowLength <= 0n) return 0n;
    const fraction = Math.min(1,Math.max(0,(clientX - rect.left) / rect.width));
    return windowNs.startNs + BigInt(Math.round(fraction * Number(windowLength)));
  };
  const frameAt = (clientX: number) => {
    const relative = Number(nearestFrameIndex(timeAt(clientX) - startNs,fps));
    return Math.max(0,Math.min(relative,Math.max(frameCount - 1,0)));
  };
  function capture(target: Element,pointerId: number) {
    try { target.setPointerCapture(pointerId); }
    catch { /* Synthetic pointers (tests) have no active pointer to capture. */ }
  }
  function dragHandle(event: React.PointerEvent<HTMLButtonElement>,which: 'start' | 'end') {
    if (disabled) return;
    event.preventDefault();event.stopPropagation();
    capture(event.currentTarget,event.pointerId);
    const move = (clientX: number) => {
      const snapped = snapToFrameNs(timeAt(clientX),fps);
      if (which === 'start') {
        const next = snapped < 0n ? 0n : snapped > endNs - step ? endNs - step : snapped;
        if (next !== startNs) onClipChange(next,endNs);
      } else {
        const next = snapped < startNs + step ? startNs + step : snapped > durationNs ? durationNs : snapped;
        if (next !== endNs) onClipChange(startNs,next);
      }
    };
    move(event.clientX);
    drag(event.currentTarget,move);
  }
  function dragPlayhead(event: React.PointerEvent<HTMLElement>) {
    if (disabled) return;
    event.preventDefault();
    const target = event.currentTarget;
    if (target instanceof HTMLElement) capture(target,event.pointerId);
    const move = (clientX: number) => onScrub(frameAt(clientX));
    move(event.clientX);
    drag(target,move);
  }
  function drag(target: Element,move: (clientX: number) => void) {
    const pointerMove = (next: Event) => move((next as PointerEvent).clientX);
    const stop = () => {
      target.removeEventListener('pointermove',pointerMove);
      target.removeEventListener('pointerup',stop);
      target.removeEventListener('pointercancel',stop);
    };
    target.addEventListener('pointermove',pointerMove);
    target.addEventListener('pointerup',stop);
    target.addEventListener('pointercancel',stop);
  }
  function keyHandle(event: React.KeyboardEvent<HTMLButtonElement>,which: 'start' | 'end') {
    if (disabled) return;
    const delta = event.key === 'ArrowLeft' ? -1n : event.key === 'ArrowRight' ? 1n : 0n;
    if (!delta && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const current = which === 'start' ? startNs : endNs;
    const next = event.key === 'Home' ? 0n : event.key === 'End' ? durationNs
      : frameTimeNs(nearestFrameIndex(current,fps) + delta * (event.shiftKey ? 10n : 1n),fps);
    if (which === 'start') {
      onClipChange(next < 0n ? 0n : next > endNs - step ? endNs - step : next,endNs);
    } else {
      onClipChange(startNs,next < startNs + step ? startNs + step : next > durationNs ? durationNs : next);
    }
  }
  function keyPlayhead(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1
      : event.key === 'Home' ? -frame : event.key === 'End' ? frameCount - 1 - frame : 0;
    if (!delta) return;
    event.preventDefault();
    onScrub(Math.max(0,Math.min(frame + delta * (event.shiftKey ? 10 : 1),Math.max(frameCount - 1,0))));
  }
  const ticks = timelineTicks(windowLength,10,windowNs.startNs);
  // Handles outside the zoomed window would otherwise pin to its edges.
  const inView = (value: bigint) => value >= windowNs.startNs && value <= windowNs.endNs;
  const maxZoom = timelineMaxZoom(durationNs);
  const sampleAt = (sampleFrame: number) => startNs + frameTimeNs(BigInt(sampleFrame),fps);
  const lanes = tracks ?? [];
  return <div className="video-timeline" ref={root} data-xgc-role="video-timeline" data-xgc-id={id} aria-label={t('Timeline')}>
    <div className="video-timeline-readout" data-xgc-role="video-timeline-readout" data-xgc-id={id}>
      <span>{t('Frame {frame} of {count}',{ frame: String(frame),count: String(frameCount) })}</span>
      <span className="video-timeline-clip-range">{t('In')} {formatTimecode(startNs,fps)}  ·  {t('Out')} {formatTimecode(endNs,fps)}</span>
      <span className="video-timeline-tools">
        {tools}
        {trailFrames && onAddTrailSample && <ControlButton size="compact" appearance="inverse" iconOnly
          aria-label={t('Add trail sample at playhead')} title={`${t('Add trail sample at playhead')}  T`}
          disabled={disabled || trailFrames.includes(frame) || trailFrames.length >= 32}
          dataXgcRole="video-trail-add-sample" dataXgcId={id}
          onClick={() => onAddTrailSample(frame)}><Sparkles size={14} aria-hidden="true" /></ControlButton>}
        <span className="video-timeline-tool-gap" aria-hidden="true" />
        <ControlButton size="compact" appearance="inverse" iconOnly disabled={zoom <= 1} aria-label={t('Zoom out timeline')} title={t('Zoom out timeline')}
          dataXgcRole="video-timeline-zoom-out" dataXgcId={id}
          onClick={() => setZoom((current) => Math.max(1,current / 2))}><ZoomOut size={13} aria-hidden="true" /></ControlButton>
        <ControlButton size="compact" appearance="inverse" iconOnly disabled={zoom >= maxZoom} aria-label={t('Zoom in timeline')} title={t('Zoom in timeline')}
          dataXgcRole="video-timeline-zoom-in" dataXgcId={id}
          onClick={() => setZoom((current) => Math.min(maxZoom,current * 2))}><ZoomIn size={13} aria-hidden="true" /></ControlButton>
      </span>
    </div>
    <div className="video-timeline-body video-timeline-body-with-lanes">
      <div className="video-timeline-gutter">
        <div className="video-timeline-gutter-spacer video-timeline-camera-label" title={cameraLabel}
          data-xgc-role="video-timeline-camera" data-xgc-id={id}>
          <Camera size={12} aria-hidden="true" /><span>V1</span><em>{cameraLabel ?? ''}</em>
        </div>
        {lanes.map((item) => <button key={item.id} type="button" className="video-timeline-track-label"
          aria-pressed={item.id === selectedTrackId}
          data-enabled={item.enabled !== false} aria-description={item.enabled === false ? t('Hidden') : undefined}
          data-xgc-role="video-timeline-track" data-xgc-id={`${id}:${item.id}`}
          onClick={() => onSelectTrack?.(item.id)}>{item.enabled === false && <EyeOff size={12} aria-hidden="true" />}
          <i className={`video-timeline-swatch video-timeline-swatch-${item.kind}`} aria-hidden="true"
            style={item.style.color ? { '--track-color': item.style.color } as React.CSSProperties : undefined} />{item.label}</button>)}
      </div>
      <div className="video-timeline-axis">
        <div className="video-timeline-track" ref={track} onPointerDown={dragPlayhead}>
      <div className="video-timeline-ruler" aria-hidden="true">
        {ticks.map((tick) => <span key={String(tick.ns)} className="video-timeline-tick" style={{ insetInlineStart: `${ratio(tick.ns) * 100}%` }}>
          <i /><em>{tick.label}</em>
        </span>)}
      </div>
      <div className="video-timeline-clip" aria-hidden="true"
        style={{ insetInlineStart: `${ratio(startNs) * 100}%`,inlineSize: `${Math.max((ratio(endNs) - ratio(startNs)) * 100,0)}%` }} />
      {trailFrames && trailFrames.length > 1 && <div className="video-timeline-trail-window" aria-hidden="true"
        style={{ insetInlineStart: `${ratio(sampleAt(trailFrames[0])) * 100}%`,
          inlineSize: `${Math.max((ratio(sampleAt(trailFrames[trailFrames.length - 1])) - ratio(sampleAt(trailFrames[0]))) * 100,0)}%` }} />}
      {stillFrame !== undefined && stillFrame >= 0 && stillFrame < frameCount && <span className="video-timeline-still"
        role="img" aria-label={t('Still frame {frame}',{ frame: String(stillFrame) })} title={t('Still frame {frame}',{ frame: String(stillFrame) })}
        style={{ insetInlineStart: `${ratio(sampleAt(stillFrame)) * 100}%` }} />}
      {trailFrames?.map((sample,index) => <button key={sample} type="button" className="video-timeline-sample" disabled={disabled}
        data-solid={index === trailFrames.length - 1 || undefined}
        aria-label={t('Trail sample frame {frame}',{ frame: String(sample) })} title={t('Trail sample frame {frame}',{ frame: String(sample) })}
        data-xgc-role="video-timeline-sample" data-xgc-id={`${id}:${sample}`}
        style={{ insetInlineStart: `${ratio(sampleAt(sample)) * 100}%`,
          '--sample-strength': trailFrames.length > 1 ? String(0.35 + 0.65 * index / (trailFrames.length - 1)) : '1' } as React.CSSProperties}
        onClick={(event) => { event.stopPropagation();onRemoveTrailSample?.(sample); }}
        onPointerDown={(event) => event.stopPropagation()} />)}
      <button type="button" className="video-timeline-handle video-timeline-handle-start" disabled={disabled}
        role="slider" aria-label={t('Clip start handle')} aria-valuemin={0} aria-valuemax={Number(durationNs)}
        aria-valuenow={Number(startNs)} aria-valuetext={formatTimecode(startNs,fps)}
        data-xgc-role="video-timeline-clip-start" data-xgc-id={id}
        style={{ insetInlineStart: `${ratio(startNs) * 100}%`,visibility: inView(startNs) ? undefined : 'hidden' }}
        onPointerDown={(event) => dragHandle(event,'start')} onKeyDown={(event) => keyHandle(event,'start')} />
      <button type="button" className="video-timeline-handle video-timeline-handle-end" disabled={disabled}
        role="slider" aria-label={t('Clip end handle')} aria-valuemin={0} aria-valuemax={Number(durationNs)}
        aria-valuenow={Number(endNs)} aria-valuetext={formatTimecode(endNs,fps)}
        data-xgc-role="video-timeline-clip-end" data-xgc-id={id}
        style={{ insetInlineStart: `${ratio(endNs) * 100}%`,visibility: inView(endNs) ? undefined : 'hidden' }}
        onPointerDown={(event) => dragHandle(event,'end')} onKeyDown={(event) => keyHandle(event,'end')} />
      <button type="button" className="video-timeline-playhead" disabled={disabled}
        role="slider" aria-label={t('Playhead')} aria-valuemin={0} aria-valuemax={Math.max(frameCount - 1,0)}
        aria-valuenow={frame} aria-valuetext={formatTimecode(playheadNs,fps)}
        data-xgc-role="video-timeline-playhead" data-xgc-id={id}
        style={{ insetInlineStart: `${ratio(playheadNs) * 100}%` }}
        onPointerDown={(event) => { event.stopPropagation();dragPlayhead(event); }} onKeyDown={keyPlayhead} />
        </div>
        {lanes.map((item) => {
          const spanStart = BigInt(item.span.startNs);const spanEnd = BigInt(item.span.endNs);
          const spanNs = spanEnd - spanStart;
          // Gradient stops as % of the span: solid from fade-in end to fade-out start.
          const fadeIn = spanNs > 0n ? Number(BigInt(item.animation.fadeInNs) * 10000n / spanNs) / 100 : 0;
          const fadeOut = spanNs > 0n ? 100 - Number(BigInt(item.animation.fadeOutNs) * 10000n / spanNs) / 100 : 100;
          const color = item.style.color;
          return <div className="video-timeline-lane" key={item.id}>
            <button type="button" className={`video-timeline-span video-timeline-span-${item.kind}`}
              aria-label={t('Track span of {label}',{ label: item.label })} aria-pressed={item.id === selectedTrackId}
              data-enabled={item.enabled !== false} aria-description={item.enabled === false ? t('Hidden') : undefined}
              data-xgc-role="video-timeline-span" data-xgc-id={`${id}:${item.id}`}
              style={{
                insetInlineStart: `${ratio(spanStart) * 100}%`,inlineSize: `${Math.max((ratio(spanEnd) - ratio(spanStart)) * 100,0)}%`,
                ...(color ? { '--track-color': color } : {}),
                '--fade-in': `${fadeIn}%`,'--fade-out': `${fadeOut}%`,
                opacity: item.style.opacity,
              } as React.CSSProperties}
              onClick={() => onSelectTrack?.(item.id)} />
          </div>;
        })}
      </div>
    </div>
  </div>;
}
