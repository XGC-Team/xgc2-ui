// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { CameraIntrinsicValidationRuntimePanel } from './CameraIntrinsicValidationRuntimePanel';

const api=vi.hoisted(() => ({
  history:vi.fn(),capture:vi.fn(),image:vi.fn(),
}));

vi.mock('../../domains/execution/cameraCalibrationProcessPublic',() => ({
  loadCameraIntrinsicCalibrationFiles:api.history,
  captureCameraIntrinsicValidation:api.capture,
  loadCameraIntrinsicValidationImage:api.image,
}));

describe('CameraIntrinsicValidationRuntimePanel',() => {
  beforeEach(() => {
    vi.clearAllMocks();
    let image=0;
    Object.defineProperty(URL,'createObjectURL',{ configurable:true,value:vi.fn(() => `blob:compare-${++image}`) });
    Object.defineProperty(URL,'revokeObjectURL',{ configurable:true,value:vi.fn() });
    api.history.mockResolvedValue({
      items:[{
        id:'intrinsics-20260830T120000.000000Z.yaml',createdAt:'2026-08-30T12:00:00Z',
        imageWidth:3840,imageHeight:2160,rmsReprojectionErrorPx:0.31,sampleCount:40,latest:true,validated:true,
      }],
      selected:'intrinsics-20260830T120000.000000Z.yaml',
    });
    api.capture.mockResolvedValue({
      schema:'xgc2.camera.intrinsic-validation.v2',generation:1,
      referenceConfiguration:{ kind:'raw' },
      comparisonConfiguration:{ kind:'calibration',calibrationId:'intrinsics-20260830T120000.000000Z.yaml',
        calibrationCreatedAt:'2026-08-30T12:00:00Z' },
      capturedAt:'2026-08-30T12:01:00Z',
      sourceImageSize:[3840,2160],analysisImageSize:[3840,2160],
      remapMeanPx:4.2,remapMaximumPx:18.5,defaultView:'overlay_checker',
      views:[
        { id:'overlay_checker',label:'Grid comparison',description:'Alternating raw and undistorted tiles.' },
        { id:'overlay_redcyan',label:'Red / cyan overlay',description:'Raw and undistorted alignment.' },
        { id:'overlay_corner_zoom',label:'Maximum-warp detail',description:'Largest remap displacement.' },
        { id:'overlay_diff',label:'Difference heatmap',description:'Amplified pixel difference.' },
        { id:'displacement',label:'Distortion displacement',description:'Pixel remap magnitude.' },
        { id:'compare',label:'Reference / comparison',description:'Side-by-side reference.' },
        { id:'reference',label:'Reference',description:'Reference configuration output.' },
        { id:'comparison',label:'Comparison',description:'Comparison configuration output.' },
      ],
    });
    api.image.mockResolvedValue(new Blob(['jpeg'],{ type:'image/jpeg' }));
  });

  it('captures the explicit raw-to-latest pair and renders generated comparisons beside live video',async () => {
    const { container }=render(<CameraIntrinsicValidationRuntimePanel
      targetId="local" processInstanceId="calibrator-1" panelId="validation-1" enabled
      liveStage={<div data-xgc-role="validation-live-fixture">live camera</div>} />);

    const reference=await screen.findByRole('button',{ name:'Reference configuration' });
    const comparison=screen.getByRole('button',{ name:'Comparison configuration' });
    await waitFor(() => expect(comparison).toHaveTextContent('Latest'));
    expect(reference.closest('.panels-camera-intrinsic-validation-field')).not.toBeNull();
    expect(comparison.closest('.panels-camera-intrinsic-validation-field')).not.toBeNull();
    expect(reference).toHaveTextContent('No intrinsics (raw)');
    expect(reference).toHaveAttribute('data-xgc-role', 'camera-intrinsic-validation-calibration-select-trigger');
    expect(reference).toHaveAttribute('data-xgc-id', 'validation-1');
    expect(comparison).toHaveAttribute('data-xgc-role', 'camera-intrinsic-validation-comparison-select-trigger');
    expect(comparison).toHaveAttribute('data-xgc-id', 'validation-1');
    expect(container.querySelector(
      '[data-xgc-role="camera-intrinsic-validation-calibration-select"][data-xgc-id="validation-1"]',
    )).toContainElement(reference);
    expect(container.querySelector(
      '[data-xgc-role="camera-intrinsic-validation-comparison-select"][data-xgc-id="validation-1"]',
    )).toContainElement(comparison);
    expect(container.querySelector(
      '[data-xgc-role="camera-intrinsic-validation-reference-label"][data-xgc-id="validation-1"]',
    )).toHaveTextContent('Reference configuration');
    expect(container.querySelector(
      '[data-xgc-role="camera-intrinsic-validation-comparison-label"][data-xgc-id="validation-1"]',
    )).toHaveTextContent('Comparison configuration');
    expect(container.querySelector(
      '[data-xgc-role="camera-intrinsic-validation-controls-title"][data-xgc-id="validation-1"]',
    )).toHaveTextContent('Validation capture');
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-validation-live"]'))
      .toHaveTextContent('live camera');
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-validation-main"][data-xgc-id="validation-1"]'))
      .toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-validation-empty"][data-xgc-id="validation-1"]'))
      .toHaveClass('panels-camera-intrinsic-validation-empty');
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-validation-runtime"]'))
      .toHaveAttribute('data-has-report','false');
    const side=container.querySelector('.panels-camera-intrinsic-validation-side')!;
    expect([...side.children].map((element) => element.getAttribute('data-xgc-role'))).toEqual([
      'camera-intrinsic-validation-controls','camera-intrinsic-validation-live',
      'camera-intrinsic-validation-gallery',
    ]);
    const capture=container.querySelector<HTMLButtonElement>(
      '[data-xgc-role="camera-intrinsic-validation-capture"][data-xgc-id="validation-1"]',
    )!;
    expect(capture).toHaveTextContent('Capture & compare');
    expect(capture).toBeEnabled();
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-validation-capture-status"]')).toBeNull();
    expect(screen.queryByText('Capturing…')).toBeNull();
    expect(screen.queryByText('Capturing comparison…')).toBeNull();
    expect(screen.queryByText('Loading calibration history…')).toBeNull();
    expect(screen.queryByText('Configurations changed. Capture again to update.')).toBeNull();
    expect(screen.queryByText('No saved intrinsic files; raw comparison remains available.')).toBeNull();
    expect(api.capture).not.toHaveBeenCalled();
    fireEvent.click(capture);

    await waitFor(() => expect(api.capture).toHaveBeenCalledWith(
      'local','calibrator-1',{
        reference:{ kind:'raw' },
        comparison:{ kind:'calibration',calibrationId:'intrinsics-20260830T120000.000000Z.yaml' },
      },
    ));
    expect(await screen.findByRole('img',{ name:'Grid comparison' })).toHaveAttribute('src','blob:compare-1');
    expect(container.querySelector('.panels-camera-intrinsic-validation-heading-title > svg'))
      .toHaveClass('lucide-scan-search');
    expect(container.querySelector('.panels-camera-intrinsic-validation-heading-title > svg'))
      .toHaveAttribute('width','14');
    expect(screen.queryByText('Alternating raw and undistorted tiles.')).toBeNull();
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-validation-main-image"]'))
      .toHaveAttribute('data-xgc-id','overlay_checker');
    expect(container.querySelectorAll('[data-xgc-role="camera-intrinsic-validation-view"]')).toHaveLength(8);
    const gallery=container.querySelector('[data-xgc-role="camera-intrinsic-validation-gallery"]')!;
    expect(gallery).toHaveAttribute('aria-disabled','false');
    expect(side.contains(gallery)).toBe(true);
    expect(container.querySelector('.panels-camera-intrinsic-validation-main')?.contains(gallery)).toBe(false);
    expect(side.firstElementChild).toHaveAttribute('data-xgc-role','camera-intrinsic-validation-controls');
    expect(gallery.querySelector(
      '[data-xgc-role="camera-intrinsic-validation-gallery-title"][data-xgc-id="validation-1"]',
    )).toHaveTextContent('Comparison views');
    const expectedViewIds=['overlay_checker','overlay_redcyan','overlay_corner_zoom','overlay_diff','displacement','compare','reference','comparison'];
    expect([...gallery.querySelectorAll('[data-xgc-role="camera-intrinsic-validation-view"]')]
      .map((view) => view.getAttribute('data-xgc-id'))).toEqual(expectedViewIds.map((id) => `validation-1:${id}`));
    for (const id of expectedViewIds) {
      const view=gallery.querySelector(`[data-xgc-role="camera-intrinsic-validation-view"][data-xgc-id="validation-1:${id}"]`);
      expect(view).toBeInTheDocument();
      expect(view?.querySelector(
        `[data-xgc-role="camera-intrinsic-validation-view-label"][data-xgc-id="validation-1:${id}"]`,
      )).toBeInTheDocument();
      expect(view?.querySelector('strong')).toBeNull();
      expect(view?.querySelector('[data-xgc-role="camera-intrinsic-validation-view-placeholder"]')).toBeNull();
    }
    expect(screen.getByRole('button',{ name:'Raw' })).toHaveAttribute(
      'data-xgc-id','validation-1:reference',
    );
    expect(screen.getByRole('button',{ name:'Target' })).toHaveAttribute(
      'data-xgc-id','validation-1:comparison',
    );
    expect(screen.getByText('4.20 px')).toBeInTheDocument();
    expect(screen.getByText('18.50 px')).toBeInTheDocument();

    const downloadNames:string[]=[];
    const downloadHrefs:string[]=[];
    const downloadClick=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function (this:HTMLAnchorElement) {
      downloadNames.push(this.download);downloadHrefs.push(this.href);
    });
    const download=container.querySelector<HTMLButtonElement>(
      '[data-xgc-role="camera-intrinsic-validation-download"][data-xgc-id="overlay_checker"]',
    )!;
    expect(download).toHaveTextContent('Download');
    fireEvent.click(download);
    expect(downloadNames).toEqual(['intrinsics-20260830T120000.000000Z-overlay_checker.jpg']);
    expect(downloadHrefs).toEqual(['blob:compare-1']);
    downloadClick.mockRestore();

    const resetZoom=screen.getByRole('button',{ name:'Reset' });
    expect(resetZoom).toBeEnabled();
    fireEvent.click(resetZoom);
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-validation-runtime"]'))
      .toHaveAttribute('data-xgc-zoom','1.00');

    const stage=container.querySelector<HTMLElement>(
      '[data-xgc-role="camera-intrinsic-validation-image-stage"]',
    )!;
    const mainImage=container.querySelector<HTMLImageElement>(
      '[data-xgc-role="camera-intrinsic-validation-main-image"]',
    )!;
    Object.defineProperties(stage,{
      clientWidth:{ configurable:true,value:1000 },
      clientHeight:{ configurable:true,value:600 },
    });
    Object.defineProperties(mainImage,{
      naturalWidth:{ configurable:true,value:3840 },
      naturalHeight:{ configurable:true,value:2160 },
    });
    fireEvent.click(container.querySelector(
      '[data-xgc-role="camera-intrinsic-validation-zoom-actual"]',
    )!);
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-validation-runtime"]'))
      .toHaveAttribute('data-xgc-zoom','3.84');
    fireEvent.click(resetZoom);

    fireEvent.click(container.querySelector('[data-xgc-role="camera-intrinsic-validation-view"][data-xgc-id="validation-1:displacement"]')!);
    expect(await screen.findByRole('img',{ name:'Distortion displacement' })).toHaveAttribute('src','blob:compare-5');
    expect(screen.queryByText('Pixel remap magnitude.')).toBeNull();

    fireEvent.wheel(stage,{ deltaY:-1 });
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-validation-runtime"]'))
      .toHaveAttribute('data-xgc-zoom','1.25');
    stage.scrollLeft=20;stage.scrollTop=30;
    fireEvent.pointerDown(stage,{ pointerId:7,button:0,clientX:100,clientY:100 });
    fireEvent.pointerMove(stage,{ pointerId:7,clientX:80,clientY:70 });
    expect(stage.scrollLeft).toBe(40);
    expect(stage.scrollTop).toBe(60);
    fireEvent.pointerUp(stage,{ pointerId:7 });
    fireEvent.click(resetZoom);
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-validation-runtime"]'))
      .toHaveAttribute('data-xgc-zoom','1.00');
    expect(stage.scrollLeft).toBe(0);
    expect(stage.scrollTop).toBe(0);
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-validation-expand"]')).toBeNull();
  });

  it('lists a non-latest YAML without Latest or other status prefixes',async () => {
    api.history.mockResolvedValueOnce({
      items:[{
        id:'intrinsics-legacy.yaml',createdAt:'2026-08-29T12:00:00Z',
        imageWidth:3840,imageHeight:2160,rmsReprojectionErrorPx:1.72,
        sampleCount:21,latest:false,validated:false,boardProfile:'',
      }],
      selected:null,
    });
    render(<CameraIntrinsicValidationRuntimePanel
      targetId="local" processInstanceId="calibrator-legacy" panelId="validation-legacy"
      enabled liveStage={<div>live camera</div>} />);

    const comparison=await screen.findByRole('button',{ name:'Comparison configuration' });
    await waitFor(() => expect(comparison).toHaveTextContent('No intrinsics (raw)'));
    fireEvent.click(comparison);
    const older=screen.getByRole('option',{ name:/3840×2160 · 1.720 px/ });
    expect(older).toBeEnabled();
    expect(older).not.toHaveTextContent('Latest');
    expect(screen.queryByRole('option',{ name:/Unvalidated|Not accepted|Older|Other board|Legacy/ })).toBeNull();
    fireEvent.click(older);
    fireEvent.click(screen.getByRole('button',{ name:'Capture & compare' }));
    await waitFor(() => expect(api.capture).toHaveBeenCalledWith(
      'local','calibrator-legacy',{
        reference:{ kind:'raw' },
        comparison:{ kind:'calibration',calibrationId:'intrinsics-legacy.yaml' },
      },
    ));
  });

  it('keeps Latest only on the newest save and lists other files by timestamp',async () => {
    api.history.mockResolvedValueOnce({
      items:[{
        id:'intrinsics-field.yaml',createdAt:'2026-08-30T12:00:00Z',
        imageWidth:3840,imageHeight:2160,rmsReprojectionErrorPx:0.31,sampleCount:40,
        latest:true,validated:true,boardProfile:'field_6x6_88mm_30pct',
      },{
        id:'intrinsics-a4.yaml',createdAt:'2026-08-29T12:00:00Z',
        imageWidth:3840,imageHeight:2160,rmsReprojectionErrorPx:0.44,sampleCount:36,
        latest:false,validated:false,boardProfile:'a4_6x6_24mm_30pct_kalibr_v1',
      }],
      selected:'intrinsics-field.yaml',
    });
    render(<CameraIntrinsicValidationRuntimePanel
      targetId="local" processInstanceId="calibrator-boards" panelId="validation-boards"
      enabled liveStage={<div>live camera</div>} />);

    const comparison=await screen.findByRole('button',{ name:'Comparison configuration' });
    await waitFor(() => expect(comparison).toHaveTextContent('Latest'));
    fireEvent.click(comparison);
    expect(screen.getByRole('option',{ name:/^Latest ·/ })).toBeInTheDocument();
    expect(screen.getByRole('option',{ name:/3840×2160 · 0.440 px/ })).toBeInTheDocument();
    expect(screen.queryByRole('option',{ name:/Unvalidated|Other board|Older/ })).toBeNull();
  });

  it('keeps all comparison view placeholders visible and temporarily disables controls while capture is pending',async () => {
    api.capture.mockReturnValueOnce(new Promise(() => undefined));
    const { container,unmount }=render(<CameraIntrinsicValidationRuntimePanel
      targetId="local" processInstanceId="calibrator-pending" panelId="validation-pending" enabled
      liveStage={<div>live camera</div>} />);

    const reference=await screen.findByRole('button',{ name:'Reference configuration' });
    const comparison=screen.getByRole('button',{ name:'Comparison configuration' });
    await waitFor(() => expect(comparison).toHaveTextContent('Latest'));
    expect(api.capture).not.toHaveBeenCalled();
    const capture=container.querySelector<HTMLButtonElement>(
      '[data-xgc-role="camera-intrinsic-validation-capture"][data-xgc-id="validation-pending"]',
    )!;
    fireEvent.click(capture);
    await waitFor(() => expect(api.capture).toHaveBeenCalledOnce());
    expect(reference).toBeDisabled();
    expect(comparison).toBeDisabled();
    expect(capture).toBeDisabled();
    expect(capture).toHaveAttribute('aria-busy','true');
    expect(capture).toHaveTextContent('Capture & compare');
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-validation-capture-status"]')).toBeNull();
    expect(screen.queryByText('Capturing…')).toBeNull();
    expect(screen.queryByText('Capturing comparison…')).toBeNull();
    expect(screen.queryByText('Loading calibration history…')).toBeNull();
    expect(screen.queryByText('Configurations changed. Capture again to update.')).toBeNull();
    const gallery=container.querySelector(
      '[data-xgc-role="camera-intrinsic-validation-gallery"][data-xgc-id="validation-pending"]',
    )!;
    const views=[...gallery.querySelectorAll<HTMLButtonElement>('[data-xgc-role="camera-intrinsic-validation-view"]')];
    expect(views).toHaveLength(8);
    expect(views.every((view) => view.disabled)).toBe(true);
    expect(gallery.querySelectorAll('.panels-camera-intrinsic-validation-view-placeholder'))
      .toHaveLength(8);
    expect(gallery.querySelector('[data-xgc-role="camera-intrinsic-validation-view-placeholder"]')).toBeNull();
    expect(views.map((view) => view.getAttribute('data-xgc-id'))).toEqual([
      'validation-pending:overlay_checker','validation-pending:overlay_redcyan',
      'validation-pending:overlay_corner_zoom','validation-pending:overlay_diff',
      'validation-pending:displacement','validation-pending:compare',
      'validation-pending:reference','validation-pending:comparison',
    ]);
    expect(container.querySelector('.panels-camera-intrinsic-validation-side')?.firstElementChild)
      .toHaveAttribute('data-xgc-role','camera-intrinsic-validation-controls');
    unmount();
  });

  it('does not capture on selection changes and allows repeated same-file and raw comparisons',async () => {
    api.capture.mockResolvedValue({
      schema:'xgc2.camera.intrinsic-validation.v2',generation:3,
      referenceConfiguration:{ kind:'calibration',calibrationId:'intrinsics-20260830T120000.000000Z.yaml' },
      comparisonConfiguration:{ kind:'calibration',calibrationId:'intrinsics-20260830T120000.000000Z.yaml' },
      capturedAt:'2026-08-30T12:03:00Z',sourceImageSize:[3840,2160],analysisImageSize:[3840,2160],
      remapMeanPx:0,remapMaximumPx:0,defaultView:'reference',
      views:[{ id:'reference',label:'Reference',description:'Reference configuration output.' }],
    });
    const { container }=render(<CameraIntrinsicValidationRuntimePanel
      targetId="local" processInstanceId="calibrator-repeat" panelId="validation-repeat" enabled
      liveStage={<div>live camera</div>} />);
    const reference=await screen.findByRole('button',{ name:'Reference configuration' });
    const comparison=screen.getByRole('button',{ name:'Comparison configuration' });
    await waitFor(() => expect(comparison).toHaveTextContent('Latest'));

    fireEvent.click(reference);
    fireEvent.click(screen.getByRole('option',{ name:/^Latest ·/ }));
    expect(reference).toHaveTextContent('Latest');
    expect(api.capture).not.toHaveBeenCalled();

    const capture=container.querySelector<HTMLButtonElement>(
      '[data-xgc-role="camera-intrinsic-validation-capture"][data-xgc-id="validation-repeat"]',
    )!;
    fireEvent.click(capture);
    await waitFor(() => expect(api.capture).toHaveBeenNthCalledWith(1,
      'local','calibrator-repeat',{
        reference:{ kind:'calibration',calibrationId:'intrinsics-20260830T120000.000000Z.yaml' },
        comparison:{ kind:'calibration',calibrationId:'intrinsics-20260830T120000.000000Z.yaml' },
      },
    ));
    await waitFor(() => expect(capture).toBeEnabled());

    fireEvent.click(reference);
    fireEvent.click(screen.getByRole('option',{ name:'No intrinsics (raw)' }));
    fireEvent.click(comparison);
    fireEvent.click(screen.getByRole('option',{ name:'No intrinsics (raw)' }));
    expect(api.capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveTextContent('Capture & compare');
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-validation-capture-status"]')).toBeNull();
    expect(screen.queryByText('Configurations changed. Capture again to update.')).toBeNull();
    fireEvent.click(capture);
    await waitFor(() => expect(api.capture).toHaveBeenNthCalledWith(2,
      'local','calibrator-repeat',{
        reference:{ kind:'raw' },comparison:{ kind:'raw' },
      },
    ));
    await waitFor(() => expect(capture).toBeEnabled());
  });

  it('restores the captured report after a dashboard tab unmount without capturing again',async () => {
    const props={
      targetId:'local',processInstanceId:'calibrator-remount',panelId:'validation-remount',enabled:true,
      liveStage:<div>live camera</div>,
    };
    const first=render(<CameraIntrinsicValidationRuntimePanel {...props} />);
    const comparison=await screen.findByRole('button',{ name:'Comparison configuration' });
    await waitFor(() => expect(comparison).toHaveTextContent('Latest'));
    expect(api.capture).not.toHaveBeenCalled();
    fireEvent.click(first.container.querySelector(
      '[data-xgc-role="camera-intrinsic-validation-capture"][data-xgc-id="validation-remount"]',
    )!);
    expect(await screen.findByRole('img',{ name:'Grid comparison' })).toBeInTheDocument();
    fireEvent.click(first.container.querySelector(
      '[data-xgc-role="camera-intrinsic-validation-view"][data-xgc-id="validation-remount:reference"]',
    )!);
    expect(await screen.findByRole('img',{ name:'Raw' })).toBeInTheDocument();
    first.unmount();

    const second=render(<CameraIntrinsicValidationRuntimePanel {...props} />);
    expect(await screen.findByRole('img',{ name:'Raw' })).toBeInTheDocument();
    expect(screen.getByRole('button',{ name:'Reference configuration' })).toHaveTextContent('No intrinsics (raw)');
    expect(screen.getByRole('button',{ name:'Comparison configuration' })).toHaveTextContent('Latest');
    expect(second.container.querySelector('[data-xgc-role="camera-intrinsic-validation-main-image"]'))
      .toHaveAttribute('data-xgc-id','reference');
    expect(api.capture).toHaveBeenCalledTimes(1);
    expect(api.image).toHaveBeenCalledTimes(8);
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});

describe('CameraIntrinsicValidationRuntimePanel column width',() => {
  it('keeps live video and capture on the same padded side track as the selects',() => {
    const css=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'../../styles/camera-intrinsic-panel.css'),'utf8');
    expect(css).toMatch(
      /\.panels-camera-intrinsic-validation-side \{[^}]*padding-inline:\s*var\(--space-md\);/s,
    );
    expect(css).toMatch(
      /\.panels-camera-intrinsic-validation-controls \{[^}]*padding:\s*var\(--space-md\) 0;/s,
    );
    expect(css).not.toMatch(
      /\.panels-camera-intrinsic-validation-live \{[^}]*padding-inline:/s,
    );
    expect(css).toMatch(
      /\.panels-camera-intrinsic-validation-gallery > header \{[^}]*padding:\s*var\(--space-sm\) 0;/s,
    );
    expect(css).toMatch(
      /\.panels-camera-intrinsic-validation-gallery > div \{[^}]*padding:\s*var\(--space-sm\) 0;/s,
    );
  });

  it('fits the whole comparison image inside the visible stage at zoom 1',() => {
    const css=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'../../styles/camera-intrinsic-panel.css'),'utf8');
    expect(css).toMatch(
      /\.panels-camera-intrinsic-validation-image-stage \{[^}]*height:\s*100%;[^}]*display:\s*grid;[^}]*overflow:\s*hidden;/s,
    );
    expect(css).not.toMatch(
      /\.panels-camera-intrinsic-validation-image-stage \{[^}]*display:\s*block;/s,
    );
    expect(css).toMatch(
      /\.panels-camera-intrinsic-validation-zoom-surface img \{[^}]*max-width:\s*100%;[^}]*max-height:\s*100%;[^}]*object-fit:\s*contain;/s,
    );
    expect(css).not.toMatch(
      /\.panels-camera-intrinsic-validation-zoom-surface img \{[^}]*object-fit:\s*cover;/s,
    );
  });
});
