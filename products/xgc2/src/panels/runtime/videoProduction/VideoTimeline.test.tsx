// @vitest-environment jsdom
import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { VideoTimeline } from './VideoTimeline';
import { formatTimecode,frameStepNs,frameTimeNs,snapToFrameNs,timelineMaxZoom,timelineTicks,timelineViewWindow } from './videoTimelineModel';

const NS = 1_000_000_000n;

describe('timeline math',() => {
  it('floors the frame step and snaps to the nearest grid point',() => {
    expect(frameStepNs(30)).toBe(33333333n);
    expect(snapToFrameNs(0n,30)).toBe(0n);
    expect(snapToFrameNs(49999999n,30)).toBe(33333333n);
    expect(snapToFrameNs(16666666n,30)).toBe(0n);
  });
  it('snap is idempotent and within one step',() => {
    for (const fps of [24,25,30,50,60]) {
      for (const raw of [1n,123456789n,999999999n,12345678901n]) {
        const snapped = snapToFrameNs(raw,fps);
        expect(snapToFrameNs(snapped,fps)).toBe(snapped);
        const distance = snapped > raw ? snapped - raw : raw - snapped;
        expect(distance).toBeLessThanOrEqual(frameStepNs(fps));
      }
    }
  });
  it('formats Remotion-style timecodes',() => {
    expect(formatTimecode(0n,30)).toBe('00:00:00');
    expect(formatTimecode(333333334n,30)).toBe('00:00:10');
    expect(formatTimecode(61n * NS,30)).toBe('01:01:00');
    expect(formatTimecode(3661n * NS + 500_000_000n,30)).toBe('1:01:01:15');
  });
  it('identifies every integer-nanosecond frame boundary without falling back one frame',() => {
    for (const fps of [24,25,30,50,60]) {
      for (let index = 1; index < fps * 2; index += 1) {
        const timestamp = frameTimeNs(BigInt(index),fps);
        const code = `00:${String(Math.floor(index / fps)).padStart(2,'0')}:${String(index % fps).padStart(2,'0')}`;
        expect(formatTimecode(timestamp,fps)).toBe(code);
        expect(formatTimecode(timestamp - 1n,fps)).not.toBe(code);
      }
    }
  });
  it('picks readable ruler steps bounded by maxTicks',() => {
    expect(timelineTicks(10n * NS).at(-1)?.label).toBe('0:10');
    const ticks = timelineTicks(600n * NS);
    expect(ticks.length).toBeLessThanOrEqual(11);
    expect(ticks[0]).toEqual({ ns: 0n,label: '0:00' });
    expect(timelineTicks(0n)).toEqual([]);
  });
  it('labels zoomed-window ticks with absolute bag time',() => {
    const ticks = timelineTicks(5n * NS,10,5n * NS);
    expect(ticks[0]).toEqual({ ns: 5n * NS,label: '0:05.0' });
    expect(ticks.at(-1)?.ns).toBe(10n * NS);
  });
  it('keeps the zoom window at full range without zoom and caps at one second',() => {
    expect(timelineViewWindow(10n * NS,1,5n * NS)).toEqual({ startNs: 0n,endNs: 10n * NS });
    expect(timelineMaxZoom(10n * NS)).toBe(10);
    expect(timelineMaxZoom(500_000_000n)).toBe(1);
    const window = timelineViewWindow(10n * NS,4,5n * NS);
    expect(window.endNs - window.startNs).toBe(2_500_000_000n);
    expect(window.startNs <= 5n * NS && window.endNs >= 5n * NS).toBe(true);
  });
  it('keeps the current window while the anchor stays inside, recenters outside',() => {
    const window = timelineViewWindow(10n * NS,4,5n * NS);
    expect(timelineViewWindow(10n * NS,4,6n * NS,window.startNs)).toEqual(window);
    const moved = timelineViewWindow(10n * NS,4,9n * NS,window.startNs);
    expect(moved.startNs <= 9n * NS && moved.endNs >= 9n * NS).toBe(true);
    expect(moved.startNs).not.toBe(window.startNs);
    expect(timelineViewWindow(10n * NS,4,0n,window.startNs)).toEqual({ startNs: 0n,endNs: 2_500_000_000n });
  });
});

describe('VideoTimeline component',() => {
  function setup(overrides?: Partial<Parameters<typeof VideoTimeline>[0]>) {
    const onClipChange = vi.fn();const onScrub = vi.fn();
    const props = {
      id: 'video',durationNs: 10n * NS,fps: 30,startNs: 0n,endNs: 10n * NS,
      frame: 0,frameCount: 300,onClipChange,onScrub,...overrides,
    };
    render(<VideoTimeline {...props} />);
    return { onClipChange,onScrub };
  }
  it('retains hidden tracks, spans and selection without changing their time geometry',() => {
    const onSelectTrack = vi.fn();
    setup({ tracks:[{ id:'hidden',label:'Hidden route',kind:'path',enabled:false,selector:{ kind:'topic',topic:'/route' },
      span:{ startNs:String(NS),endNs:String(9n * NS) },animation:{ fadeInNs:'0',fadeOutNs:'0',easing:'linear' },style:{ color:'#ff0000',widthMeters:0.01,opacity:1 } }],selectedTrackId:'hidden',onSelectTrack });
    const label = document.querySelector('[data-xgc-role="video-timeline-track"]')!;
    const span = screen.getByRole('button',{ name:'Track span of Hidden route' });
    expect(label).toHaveAttribute('data-enabled','false');expect(label).toHaveAttribute('aria-pressed','true');
    expect(span).toHaveAttribute('data-enabled','false');expect(span).toHaveAttribute('aria-description','Hidden');
    expect(span).toHaveStyle({ insetInlineStart:'10%',inlineSize:'80%' });
    fireEvent.click(span);expect(onSelectTrack).toHaveBeenCalledWith('hidden');
  });
  it('shows the frame readout and timecodes',() => {
    setup({ frame: 15 });
    expect(screen.getByText('Frame 15 of 300')).toBeInTheDocument();
    // The playhead timecode lives in the studio bar; the timeline shows the clip range.
    expect(screen.getByText('In 00:00:00  ·  Out 00:10:00',{ normalizer: (text) => text })).toBeInTheDocument();
  });
  it('moves the playhead with the keyboard inside the clip',() => {
    const { onScrub } = setup({ frame: 5 });
    const playhead = screen.getByRole('slider',{ name: 'Playhead' });
    fireEvent.keyDown(playhead,{ key: 'ArrowRight' });
    expect(onScrub).toHaveBeenCalledWith(6);
    fireEvent.keyDown(playhead,{ key: 'ArrowLeft',shiftKey: true });
    expect(onScrub).toHaveBeenCalledWith(0);
    fireEvent.keyDown(playhead,{ key: 'End' });
    expect(onScrub).toHaveBeenCalledWith(299);
  });
  it('drags the clip handles on the frame grid with clamping',() => {
    const { onClipChange } = setup({ startNs: 2n * NS,endNs: 8n * NS });
    const start = screen.getByRole('slider',{ name: 'Clip start handle' });
    fireEvent.keyDown(start,{ key: 'ArrowRight' });
    expect(onClipChange).toHaveBeenCalledWith(2n * NS + frameStepNs(30),8n * NS);
    const end = screen.getByRole('slider',{ name: 'Clip end handle' });
    fireEvent.keyDown(end,{ key: 'ArrowLeft' });
    expect(onClipChange).toHaveBeenCalledWith(2n * NS,frameTimeNs(239n,30));
    fireEvent.keyDown(end,{ key: 'End' });
    expect(onClipChange).toHaveBeenCalledWith(2n * NS,10n * NS);
    fireEvent.keyDown(start,{ key: 'Home' });
    expect(onClipChange).toHaveBeenCalledWith(0n,8n * NS);
  });
  it('keeps at least one frame between the handles',() => {
    const { onClipChange } = setup({ startNs: 8n * NS - frameStepNs(30),endNs: 8n * NS });
    fireEvent.keyDown(screen.getByRole('slider',{ name: 'Clip start handle' }),{ key: 'ArrowRight' });
    expect(onClipChange).toHaveBeenCalledWith(8n * NS - frameStepNs(30),8n * NS);
  });
  it('steps clip boundaries by exact frame index without accumulating truncated steps',() => {
    const onClipChange = vi.fn();
    const props = { id: 'video',durationNs: 10n * NS,fps: 30,startNs: 0n,endNs: 10n * NS,
      frame: 0,frameCount: 300,onClipChange,onScrub: vi.fn() };
    const view = render(<VideoTimeline {...props} />);
    for (let index = 1; index <= 30; index += 1) {
      fireEvent.keyDown(screen.getByRole('slider',{ name: 'Clip start handle' }),{ key: 'ArrowRight' });
      const [startNs] = onClipChange.mock.lastCall!;
      expect(startNs).toBe(frameTimeNs(BigInt(index),30));
      view.rerender(<VideoTimeline {...props} startNs={startNs} />);
    }
    expect(onClipChange).toHaveBeenLastCalledWith(NS,10n * NS);
  });
  it('scrubs by pointer on the track using the real track geometry',() => {
    const { onScrub } = setup({ frame: 0 });
    const track = document.querySelector('.video-timeline-track') as HTMLElement;
    vi.spyOn(track,'getBoundingClientRect').mockReturnValue({
      left: 0,width: 1000,top: 0,right: 1000,bottom: 56,height: 56,x: 0,y: 0,toJSON: () => ({}),
    });
    fireEvent.pointerDown(track,{ clientX: 500,pointerId: 1 });
    expect(onScrub).toHaveBeenCalledWith(150);
    fireEvent.pointerMove(track,{ clientX: 100,pointerId: 1 });
    expect(onScrub).toHaveBeenCalledWith(30);
    fireEvent.pointerUp(track,{ clientX: 100,pointerId: 1 });
  });
  it.each([0n,100_000_001n])('scrubs to non-integral-second frames relative to clip start %s', (startNs) => {
    const { onScrub } = setup({ startNs });
    const track = document.querySelector('.video-timeline-track') as HTMLElement;
    vi.spyOn(track,'getBoundingClientRect').mockReturnValue({
      left: 0,width: 1000,top: 0,right: 1000,bottom: 56,height: 56,x: 0,y: 0,toJSON: () => ({}),
    });
    const clientX = Number(startNs + 35_000_000n) / 10_000_000;
    fireEvent.pointerDown(track,{ clientX,pointerId: 1 });
    expect(onScrub).toHaveBeenLastCalledWith(1);
    fireEvent.pointerUp(track,{ clientX,pointerId: 1 });
  });
  it('ignores pointer and keyboard input while disabled',() => {
    const { onScrub,onClipChange } = setup({ disabled: true });
    expect(screen.getByRole('slider',{ name: 'Playhead' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('slider',{ name: 'Clip start handle' }),{ key: 'ArrowRight' });
    expect(onScrub).not.toHaveBeenCalled();expect(onClipChange).not.toHaveBeenCalled();
  });
  it('zooms in on the playhead and scrubs within the visible window',() => {
    const { onScrub } = setup({ frame: 0 });
    const track = document.querySelector('.video-timeline-track') as HTMLElement;
    vi.spyOn(track,'getBoundingClientRect').mockReturnValue({
      left: 0,width: 1000,top: 0,right: 1000,bottom: 56,height: 56,x: 0,y: 0,toJSON: () => ({}),
    });
    fireEvent.click(screen.getByRole('button',{ name: 'Zoom in timeline' }));
    // Zoom 2 over a 10 s bag: a 5 s window anchored at the playhead.
    fireEvent.pointerDown(track,{ clientX: 500,pointerId: 1 });
    expect(onScrub).toHaveBeenCalledWith(75);
    fireEvent.pointerUp(track,{ clientX: 500,pointerId: 1 });
    expect(screen.getByRole('button',{ name: 'Zoom out timeline' })).toBeEnabled();
  });
  it('renders track span lanes and selects a track',() => {
    const onSelectTrack = vi.fn();
    const tracks = [{
      id: 't1',label: 'Planned',kind: 'path' as const,selector: { kind: 'topic' as const,topic: '/planned' },
      span: { startNs: '2000000000',endNs: '6000000000' },
      animation: { fadeInNs: '1000000000',fadeOutNs: '0',easing: 'linear' as const },
      style: { color: '#22c55e',opacity: 1,widthMeters: 0.01 },
    }];
    render(<VideoTimeline id="video" durationNs={10n * NS} fps={30} startNs={0n} endNs={10n * NS}
      frame={0} frameCount={300} onClipChange={vi.fn()} onScrub={vi.fn()}
      tracks={tracks} selectedTrackId="" onSelectTrack={onSelectTrack} />);
    const span = screen.getByRole('button',{ name: 'Track span of Planned' });
    expect(span.style.getPropertyValue('--fade-in')).toBe('25%');
    expect(span.style.getPropertyValue('--fade-out')).toBe('100%');
    fireEvent.click(screen.getByRole('button',{ name: 'Planned' }));
    expect(onSelectTrack).toHaveBeenCalledWith('t1');
  });
  it('shows trail samples and deletes them from the ruler',() => {
    const onRemoveTrailSample = vi.fn();
    render(<VideoTimeline id="video" durationNs={10n * NS} fps={30} startNs={0n} endNs={10n * NS}
      frame={0} frameCount={300} onClipChange={vi.fn()} onScrub={vi.fn()}
      trailFrames={[30,60]} onAddTrailSample={vi.fn()} onRemoveTrailSample={onRemoveTrailSample} />);
    fireEvent.click(screen.getByRole('button',{ name: 'Trail sample frame 60' }));
    expect(onRemoveTrailSample).toHaveBeenCalledWith(60);
  });
});
