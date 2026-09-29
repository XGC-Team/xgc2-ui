// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { AutomationRunDetail } from '../../domains/automation/automationPublic';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import type { PanelActionInvocation,PanelActionPortRuntime,PanelPluginContext } from '../types';
import { useScientificGalleryFrame } from './scientificGalleryPanelFrameState';
import { ScientificGalleryPanel } from './ScientificGalleryPanel';
import { scientificGalleryPanelPlugin } from './manifest';
import {
  ScientificGalleryFrameProvider,
  ScientificGalleryHeaderActions,
  ScientificGalleryHeaderLeading,
  ScientificGalleryHeaderStatus,
} from './scientificGalleryPanelFrame';
import { testPanelExecution,testRunDetails } from '../../test/panelExecutionTestSupport';

const listROSBagFigures = vi.fn();
const fetchROSBagFigure = vi.fn();
const listROSBagRecordings = vi.fn();
const deleteROSBagRecording = vi.fn();
const listRecordings = vi.fn();
let archiveEpoch = '';

vi.mock('../../domains/experiment/experimentPublic',async () => {
  const { preferVectorGalleryFigures } = await import('../../domains/experiment/scientificGalleryService');
  return {
    listROSBagFigures: (...args: unknown[]) => listROSBagFigures(...args),
    fetchROSBagFigure: (...args: unknown[]) => fetchROSBagFigure(...args),
    preferVectorGalleryFigures,
    useExperimentSurfaceVisible: () => true,
  };
});

vi.mock('../../domains/recording/recordingPublic',() => ({
  listROSBagRecordings: (...args: unknown[]) => listROSBagRecordings(...args),
  deleteROSBagRecording: (...args: unknown[]) => deleteROSBagRecording(...args),
  useRosbagArchiveEpoch: () => archiveEpoch,
  listRecordings: (...args: unknown[]) => listRecordings(...args),
  deleteRecording: vi.fn(),
  downloadRecording: vi.fn(async () => new Blob()),
  fetchRecordingThumbnail: vi.fn(async () => { throw new Error('thumbnail fetch should be skipped'); }),
}));

vi.mock('./videoProduction/VideoProductionPanel',() => ({
  VideoProductionPanel: ({ panel }:{ panel:{ id:string } }) => (
    <div data-xgc-role="video-production" data-xgc-id={panel.id} />
  ),
}));

describe('ScientificGalleryPanel',() => {
  beforeEach(() => {
    vi.stubGlobal('crypto',{ randomUUID:() => '6b7e2da6-4747-4509-ad2f-8f331cf3e30f' });
    URL.createObjectURL = vi.fn(() => 'blob:gallery-figure');
    URL.revokeObjectURL = vi.fn();
    listROSBagFigures.mockReset().mockResolvedValue({
      galleryId:'bag-1',
      files:[],
    });
    fetchROSBagFigure.mockReset().mockResolvedValue(new Blob(['<svg/>'],{ type:'image/svg+xml' }));
    listROSBagRecordings.mockReset().mockResolvedValue(recordings());
    deleteROSBagRecording.mockReset().mockResolvedValue({ deleted:'run-42.bag' });
    listRecordings.mockReset().mockResolvedValue([]);
    archiveEpoch = '';
  });

  it('uses one command action and one offline-authored script path',() => {
    expect(scientificGalleryPanelPlugin.actionPorts).toEqual([
      expect.objectContaining({ id:'plot',actionKinds:['command'],required:true }),
      expect.objectContaining({ id:'render-video',actionKinds:['command'] }),
    ]);
    expect(scientificGalleryPanelPlugin.optionSchema).toHaveProperty('scriptPath');
    expect(scientificGalleryPanelPlugin.optionSchema).not.toHaveProperty('galleryRoot');
    expect(scientificGalleryPanelPlugin.panelWorkflowControls).toBe('hidden');
    expect(scientificGalleryPanelPlugin.frameProvider).toBe(ScientificGalleryFrameProvider);
    expect(scientificGalleryPanelPlugin.headerLeading).toBe(ScientificGalleryHeaderLeading);
    expect(scientificGalleryPanelPlugin.headerStatus).toBe(ScientificGalleryHeaderStatus);
    expect(scientificGalleryPanelPlugin.headerActions).toBe(ScientificGalleryHeaderActions);
  });

  it('puts Plot and Delete in the panel header after a bag is selected',async () => {
    listROSBagRecordings.mockResolvedValue(recordings(
      { id:'bag-1',name:'run-42.bag',path:'/home/lxk/Documents/XGC/Data/run-42.bag' },
    ));
    renderGallery();
    const gallery = document.querySelector('[data-xgc-role="scientific-gallery"][data-xgc-id="gallery"]');
    const leading = document.querySelector('[data-xgc-role="scientific-gallery-header-leading"][data-xgc-id="gallery"]');
    const pane = await waitFor(() => {
      const node = document.querySelector('[data-xgc-role="scientific-gallery-bag-pane"][data-xgc-id="gallery"]');
      expect(node).toBeTruthy();
      return node as HTMLElement;
    });
    const headerActions = await waitFor(() => {
      const node = document.querySelector('[data-xgc-role="scientific-gallery-header-actions"][data-xgc-id="gallery"]');
      expect(node).toBeTruthy();
      return node as HTMLElement;
    });
    const stage = document.querySelector('[data-xgc-role="scientific-gallery-stage"][data-xgc-id="gallery"]');
    const row = await screen.findByRole('button',{ name:/run-42\.bag/i });
    const plot = screen.getByRole('button',{ name:'Plot' });
    const remove = screen.getByRole('button',{ name:'Delete' });
    const actions = headerActions.querySelector('[data-xgc-role="scientific-gallery-bag-actions"][data-xgc-id="gallery"]');
    expect(leading?.querySelector('[data-xgc-role="scientific-gallery-views"]')).toBeInTheDocument();
    expect(gallery).toContainElement(pane);
    expect(gallery).toContainElement(stage as HTMLElement);
    expect(pane).toContainElement(row);
    expect(pane.querySelector('[data-xgc-role="scientific-gallery-bag-actions"]')).toBeNull();
    expect(stage?.querySelector('[data-xgc-role="scientific-gallery-bag-actions"]')).toBeNull();
    expect(headerActions).toContainElement(actions as HTMLElement);
    expect(actions).toContainElement(plot);
    expect(actions).toContainElement(remove);
    expect(plot.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(plot).not.toHaveClass('xgc-panel-runtime-action');
    expect(remove).not.toHaveClass('xgc-panel-runtime-action');
    expect(screen.queryByRole('button',{ name:'Browse' })).toBeNull();
    expect(screen.queryByLabelText('Choose a data file')).toBeNull();
    expect(document.querySelector('[data-xgc-role="scientific-gallery-data-file-input"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="scientific-gallery-data-file-browse"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="automation-path-picker"]')).toBeNull();
    expect(screen.queryByText('No figures')).toBeNull();
    expect(screen.queryByRole('button',{ name:'Run Scientific plots' })).toBeNull();
    expect(screen.queryByRole('button',{ name:'Stop Scientific plots' })).toBeNull();
    expect(screen.getByRole('button',{ name:'Plots' })).toBeInTheDocument();
    expect(screen.getByRole('button',{ name:'Recordings' })).toBeInTheDocument();
    expect(screen.getByRole('button',{ name:'Video' })).toBeInTheDocument();
    expect(screen.getByRole('button',{ name:'Workflow' })).toBeInTheDocument();
    expect(screen.queryByRole('button',{ name:'Generate figures' })).toBeNull();
    expect(screen.queryByRole('button',{ name:'Refresh data files' })).toBeNull();
    expect(document.querySelector('[data-xgc-role="scientific-gallery-header-actions"]')).toBeInTheDocument();
  });

  it('keeps the figure stage on the selected bag and leaves video thumbnails to Recordings',async () => {
    listROSBagRecordings.mockResolvedValue(recordings(
      ...Array.from({ length:10 },(_, index) => attributedBag(index,'exp-1')),
      { id:'loose.bag',name:'loose.bag',path:'/data/loose.bag' },
    ));
    renderGallery();
    const stage = await waitFor(() => {
      const node = document.querySelector('[data-xgc-role="scientific-gallery-stage"][data-xgc-id="gallery"]');
      expect(node).toBeTruthy();
      return node as HTMLElement;
    });
    await screen.findByRole('button',{ name:/TASE-4UGVs_simulation_2026-09-21_18-09-00\.bag/i });
    expect(stage.querySelector('[data-xgc-role="scientific-gallery-recent-grid"]')).toBeNull();
    expect(stage.querySelector('[data-xgc-role="scientific-gallery-recent-tile"]')).toBeNull();
    expect(screen.queryByText('Recent runs')).toBeNull();
    expect(screen.queryByText('No figures')).toBeNull();
    fireEvent.click(screen.getByRole('button',{ name:'Recordings' }));
    expect(document.querySelector('[data-xgc-role="scientific-gallery-stage"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="recording-library"]')).toBeInTheDocument();
  });

  it('deletes the selected bag from the header after confirm',async () => {
    listROSBagRecordings.mockResolvedValue(recordings(
      { id:'bag-1',name:'run-42.bag',path:'/data/run-42.bag' },
      { id:'bag-2',name:'keep.bag',path:'/data/keep.bag' },
    ));
    renderGallery();
    const row = await screen.findByRole('button',{ name:/run-42\.bag/i });
    expect(row).toHaveAttribute('aria-pressed','true');
    const remove = await screen.findByRole('button',{ name:'Delete' });
    fireEvent.click(remove);
    const dialog = screen.getByRole('alertdialog',{ name:'Delete bag' });
    expect(dialog).toHaveTextContent('Delete run-42.bag?');
    expect(remove).toHaveAttribute('data-xgc-role','scientific-gallery-bag-delete');
    expect(document.querySelector('[data-xgc-role="scientific-gallery-bag-delete-confirm"]')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button',{ name:'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(deleteROSBagRecording).not.toHaveBeenCalled();
    fireEvent.click(remove);
    fireEvent.click(within(screen.getByRole('alertdialog',{ name:'Delete bag' })).getByRole('button',{ name:'Delete' }));
    await waitFor(() => expect(deleteROSBagRecording).toHaveBeenCalledWith('bag-1'));
    await waitFor(() => expect(screen.queryByRole('button',{ name:/run-42\.bag/i })).toBeNull());
    expect(screen.getByRole('button',{ name:/keep\.bag/i })).toHaveAttribute('aria-pressed','true');
    await waitFor(() => expect(screen.getByRole('button',{ name:'Plot' })).not.toBeDisabled());
    expect(screen.getByRole('button',{ name:'Delete' })).toHaveAttribute('data-xgc-id','bag-2');
  });

  it('renders recording directories and root bags as a folder tree',async () => {
    listROSBagRecordings.mockResolvedValue(recordings(
      {
        id:'hash-bag',
        name:'68d6094c7ed54d4fe3c962f8708f0989/xgc_2026-09-17-14-55-15_0.bag',
        path:'/data/68d6094c7ed54d4fe3c962f8708f0989/xgc_2026-09-17-14-55-15_0.bag',
      },
      { id:'root-bag',name:'xdata_phy_2026-01-14.bag',path:'/data/xdata_phy_2026-01-14.bag' },
    ));
    renderGallery();
    await screen.findByRole('button',{ name:/xgc_2026-09-17-14-55-15_0\.bag/i });
    const recording = document.querySelector(
      '[data-xgc-role="scientific-gallery-bag-folder"][data-xgc-id="68d6094c7ed54d4fe3c962f8708f0989"]',
    );
    expect(recording).toBeTruthy();
    expect(recording?.querySelector('[data-xgc-role="scientific-gallery-bag-folder-title"]'))
      .toHaveTextContent('xgc_2026-09-17-14-55-15_0');
    expect(document.querySelector('[data-xgc-role="scientific-gallery-bag-folder"][data-xgc-id="data"]'))
      .toBeInTheDocument();
    expect(screen.getByRole('button',{ name:/xdata_phy_2026-01-14\.bag/i })).toBeInTheDocument();
  });

  it('refreshes the folder tree when a recorder process finishes without polling',async () => {
    listROSBagRecordings.mockResolvedValue(recordings(
      {
        id:'old-bag',
        name:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/xgc_2026-09-18-07-00-00_0.bag',
        path:'/data/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/xgc_2026-09-18-07-00-00_0.bag',
      },
    ));
    const value = context(plotAction());
    const view = renderGallery(panel(),value);
    const previous = await screen.findByRole('button',{ name:/xgc_2026-09-18-07-00-00_0\.bag/i });
    expect(previous).toHaveAttribute('aria-pressed','true');
    const callsAfterMount = listROSBagRecordings.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);

    listROSBagRecordings.mockResolvedValue(recordings(
      {
        id:'new-bag',
        name:'3f7a0f63dc438bb8692ea4371558c356/xgc_2026-09-18-07-59-10_0.bag',
        path:'/data/3f7a0f63dc438bb8692ea4371558c356/xgc_2026-09-18-07-59-10_0.bag',
      },
      {
        id:'old-bag',
        name:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/xgc_2026-09-18-07-00-00_0.bag',
        path:'/data/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/xgc_2026-09-18-07-00-00_0.bag',
      },
    ));
    archiveEpoch = 'rec-1:stopped:2026-09-18T08:01:00Z';
    await act(async () => view.rerender(galleryTree(panel(),value)));
    expect(await screen.findByRole('button',{ name:/xgc_2026-09-18-07-59-10_0\.bag/i })).toBeInTheDocument();
    expect(document.querySelector(
      '[data-xgc-role="scientific-gallery-bag-folder-toggle"][data-xgc-id="3f7a0f63dc438bb8692ea4371558c356"]',
    )).toBeInTheDocument();
    expect(screen.getByRole('button',{ name:/xgc_2026-09-18-07-00-00_0\.bag/i })).toHaveAttribute('aria-pressed','true');
    expect(listROSBagRecordings.mock.calls.length).toBe(callsAfterMount + 1);

    await act(async () => view.rerender(galleryTree(panel(),value)));
    expect(listROSBagRecordings.mock.calls.length).toBe(callsAfterMount + 1);
    view.unmount();
  });

  it('reads the rest of a truncated archive listing',async () => {
    listROSBagRecordings
      .mockResolvedValueOnce({
        items:[{
          id:'bag-1',name:'run-1.bag',path:'/data/run-1.bag',size:10,createdAt:'2026-01-02T00:00:00Z',
        }],
        limit:500, offset:0, total:2, truncated:true, nextOffset:1,
      })
      .mockResolvedValueOnce({
        items:[{
          id:'bag-2',name:'run-2.bag',path:'/data/run-2.bag',size:10,createdAt:'2026-01-01T00:00:00Z',
        }],
        limit:500, offset:1, total:2, truncated:false,
      });
    renderGallery();
    expect(await screen.findByRole('button',{ name:/run-1\.bag/i })).toBeInTheDocument();
    expect(screen.getByRole('button',{ name:/run-2\.bag/i })).toBeInTheDocument();
    expect(listROSBagRecordings).toHaveBeenNthCalledWith(1,{ limit:500 },expect.any(AbortSignal));
    expect(listROSBagRecordings).toHaveBeenNthCalledWith(2,{ limit:500, offset:1 },expect.any(AbortSignal));
  });

  it('reports a non-advancing archive cursor instead of repeating the request',async () => {
    listROSBagRecordings.mockResolvedValue({ items:[],limit:500,offset:0,total:1,truncated:true,nextOffset:0 });
    renderGallery();
    expect(await screen.findByText('Archive pagination did not advance.')).toBeInTheDocument();
    expect(listROSBagRecordings).toHaveBeenCalledTimes(1);
  });

  it('lists nested archive bags and plots the selected file',async () => {
    listROSBagRecordings.mockResolvedValue(recordings(
      { id:'bag-1',name:'run-42.bag',path:'/home/lxk/Documents/XGC/Data/run-42.bag' },
      { id:'bag-2',name:'four-scout/inner.bag',path:'/home/lxk/Documents/XGC/Data/four-scout/inner.bag' },
    ));
    const action = plotAction();
    const value = context(action);
    const view = renderGallery(panel(),value);
    const nested = await screen.findByRole('button',{ name:/inner\.bag/i });
    fireEvent.click(nested);
    fireEvent.click(screen.getByRole('button',{ name:'Plot' }));
    await waitFor(() => expect(action.invoke).toHaveBeenCalledWith({
      inputPath:'/home/lxk/Documents/XGC/Data/four-scout/inner.bag',
      scriptPath:'/workspace/plot.py',
      publicationId:'bag-2',
    },'Plot figures for inner.bag'));
    const stop = screen.getByRole('button',{ name:'Stop' });
    expect(stop).toHaveTextContent('Stop');
    expect(stop).not.toHaveTextContent('plotting');
    expect(document.querySelector('[data-xgc-role="scientific-gallery-bag-folder"][data-xgc-id="four-scout"]'))
      .toBeInTheDocument();

    listROSBagFigures.mockResolvedValue({
      galleryId:'bag-2',
      files:[{ name:'overview.svg',size:12,mediaType:'image/svg+xml',createdAt:'2026-01-01T00:00:00Z' }],
    });
    action.latestInvocation = { id:'run-plot',status:'succeeded',revision:2 };
    await act(async () => view.rerender(galleryTree(panel(),value)));
    expect(await screen.findByText('overview.svg')).toBeInTheDocument();
    expect(listROSBagFigures).toHaveBeenCalledWith(
      'bag-2',expect.any(AbortSignal),
    );
  });

  it('loads the selected bag\'s latest figures without re-plotting',async () => {
    listROSBagRecordings.mockResolvedValue(recordings(
      { id:'bag-1',name:'run-42.bag',path:'/artifacts/experiment.data' },
    ));
    listROSBagFigures.mockResolvedValue({
      galleryId:'bag-1',
      files:[{ name:'overview.svg',size:12,mediaType:'image/svg+xml',createdAt:'2026-01-01T00:00:00Z' }],
    });
    renderGallery(panel(),context(plotAction()));
    expect(await screen.findByText('overview.svg')).toBeInTheDocument();
    const plottedAt = document.querySelector(
      '[data-xgc-role="scientific-gallery-figure-plotted-at"][data-xgc-id="gallery:overview.svg"]',
    );
    expect(plottedAt).toHaveAttribute('dateTime','2026-01-01T00:00:00Z');
    expect(plottedAt?.textContent).toMatch(/2026/);
    expect(listROSBagFigures).toHaveBeenCalledWith(
      'bag-1',expect.any(AbortSignal),
    );
  });

  it('switches the stage to another bag\'s figures',async () => {
    listROSBagRecordings.mockResolvedValue(recordings(
      { id:'bag-1',name:'run-42.bag',path:'/artifacts/a.data' },
      { id:'bag-2',name:'later.bag',path:'/artifacts/b.data' },
    ));
    listROSBagFigures.mockImplementation(async (id: string) => ({
      galleryId:id,
      files:[{
        name: id === 'bag-2' ? 'later.svg' : 'overview.svg',
        size:12,
        mediaType:'image/svg+xml',
        createdAt:'2026-01-01T00:00:00Z',
      }],
    }));
    renderGallery();
    expect(await screen.findByText('overview.svg')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{ name:/later\.bag/i }));
    expect(await screen.findByText('later.svg')).toBeInTheDocument();
    expect(screen.queryByText('overview.svg')).not.toBeInTheDocument();
  });

  it('queues Stop until its own admission and remains occupied until terminal truth',async () => {
    listROSBagRecordings.mockResolvedValue(recordings({ id:'bag-1',name:'run-42.bag',path:'/data/run-42.bag' }));
    const action = plotAction();
    const admission = deferred<PanelActionInvocation>();
    action.invoke = vi.fn(() => admission.promise);
    action.activeInvocation = { id:'other-browser',status:'running',revision:9 };
    const view = renderGallery(panel(),context(action));
    fireEvent.click(await screen.findByRole('button',{ name:'Plot' }));
    fireEvent.click(screen.getByRole('button',{ name:'Stop' }));
    expect(action.control).not.toHaveBeenCalled();
    expect(screen.queryByRole('button',{ name:'Plot' })).toBeNull();
    await act(async () => admission.resolve({ id:'own',status:'running',revision:1 }));
    await waitFor(() => expect(action.control).toHaveBeenCalledWith(
      { id:'own',status:'running',revision:1 },'cancel','Stop plotting',
    ));
    expect(action.control).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button',{ name:'Stop' })).toBeInTheDocument();
    testRunDetails(action.execution).own = runDetail('own','stopped',2);
    await act(async () => view.rerender(galleryTree(panel(),context(action))));
    expect(screen.getByRole('button',{ name:'Plot' })).toBeInTheDocument();
  });

  it('preserves an explicit pending cancellation after the observing panel unmounts',async () => {
    listROSBagRecordings.mockResolvedValue(recordings({ id:'bag-1',name:'run-42.bag',path:'/data/run-42.bag' }));
    const action = plotAction();
    const admission = deferred<PanelActionInvocation>();
    action.invoke = vi.fn(() => admission.promise);
    const view = renderGallery(panel(),context(action));
    fireEvent.click(await screen.findByRole('button',{ name:'Plot' }));
    fireEvent.click(screen.getByRole('button',{ name:'Stop' }));
    expect(screen.getByRole('button',{ name:'Stop' })).toBeInTheDocument();
    view.unmount();
    await act(async () => admission.resolve({ id:'own',status:'running',revision:1 }));
    await waitFor(() => expect(action.control).toHaveBeenCalledWith(
      { id:'own',status:'running',revision:1 },'cancel','Stop plotting',
    ));
  });

  it('stops a terminal join anchor before detail arrives and waits for its child completion',async () => {
    listROSBagRecordings.mockResolvedValue(recordings({ id:'bag-1',name:'run-42.bag',path:'/data/run-42.bag' }));
    const action = plotAction();
    const admission = deferred<PanelActionInvocation>();
    const seed = deferred<AutomationRunDetail>();
    action.invoke = vi.fn(() => admission.promise);
    action.execution!.loadRunDetail = vi.fn(() => seed.promise);
    const view = renderGallery(panel(),context(action));
    fireEvent.click(await screen.findByRole('button',{ name:'Plot' }));
    fireEvent.click(screen.getByRole('button',{ name:'Stop' }));
    const joined: PanelActionInvocation = { id:'joined',status:'succeeded',revision:3 };
    await act(async () => admission.resolve(joined));
    await waitFor(() => expect(action.control).toHaveBeenCalledExactlyOnceWith(joined,'cancel','Stop plotting'));
    expect(screen.getByRole('button',{ name:'Stop' })).toBeInTheDocument();
    testRunDetails(action.execution).joined = { invocations:[],nodeSummaries:[],loading:true,error:'' };
    await act(async () => view.rerender(galleryTree(panel(),context(action))));
    expect(screen.getByRole('button',{ name:'Stop' })).toBeInTheDocument();
    testRunDetails(action.execution).joined = { invocations:[],nodeSummaries:[],loading:false,error:'snapshot unavailable' };
    await act(async () => view.rerender(galleryTree(panel(),context(action))));
    expect(screen.getByRole('button',{ name:'Stop' })).toBeInTheDocument();
    expect(screen.getByText('snapshot unavailable')).toBeInTheDocument();
    const detail = {
      ...runDetail('joined','succeeded',3),
      relations:{ runId:'joined',childRuns:[{
        childRunId:'writer',observedStatus:'running',observedRevision:2,runStatus:'running',runRevision:2,
      }] },
    } as unknown as AutomationRunDetail;
    await act(async () => seed.resolve(detail));
    expect(screen.getByRole('button',{ name:'Stop' })).toBeInTheDocument();
    testRunDetails(action.execution).joined = detail;
    await act(async () => view.rerender(galleryTree(panel(),context(action))));
    expect(screen.getByRole('button',{ name:'Stop' })).toBeInTheDocument();
    expect(screen.queryByText('snapshot unavailable')).toBeNull();
    testRunDetails(action.execution).joined = {
      ...detail,relations:{ ...detail.relations,childRuns:[{
        ...detail.relations!.childRuns[0],runStatus:'stopped',runRevision:4,
      }] },
    } as AutomationRunDetail;
    await act(async () => view.rerender(galleryTree(panel(),context(action))));
    expect(screen.getByRole('button',{ name:'Plot' })).toBeInTheDocument();
    expect(action.control).toHaveBeenCalledTimes(1);
  });

  it('keeps a terminal producer occupied through partial previews until exact detail is available',async () => {
    listROSBagRecordings.mockResolvedValue(recordings({ id:'bag-1',name:'run-42.bag',path:'/data/run-42.bag' }));
    listROSBagFigures.mockResolvedValue({
      galleryId:'bag-1',
      files:[{ name:'overview.svg',size:12,mediaType:'image/svg+xml',createdAt:'2026-01-01T00:00:00Z' }],
    });
    const action = plotAction();
    const pending = deferred<AutomationRunDetail>();
    action.invoke = vi.fn(async () => ({ id:'joined',status:'succeeded' as const,revision:3 }));
    action.execution!.loadRunDetail = vi.fn(() => pending.promise);
    testRunDetails(action.execution).joined = { invocations:[],nodeSummaries:[],loading:true,error:'' };
    const view = renderGallery(panel(),context(action));
    const start = await screen.findByRole('button',{ name:'Plot' });
    await waitFor(() => expect(start).not.toBeDisabled());
    await act(async () => fireEvent.click(start));
    expect(await screen.findByText('overview.svg')).toBeInTheDocument();
    expect(screen.getByRole('button',{ name:'Stop' })).toBeInTheDocument();
    testRunDetails(action.execution).joined = { invocations:[],nodeSummaries:[],loading:false,error:'snapshot unavailable' };
    await act(async () => view.rerender(galleryTree(panel(),context(action))));
    expect(screen.getByText('snapshot unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button',{ name:'Stop' })).toBeInTheDocument();
    const completed = runDetail('joined','succeeded',3);
    await act(async () => pending.resolve(completed));
    expect(screen.getByRole('button',{ name:'Stop' })).toBeInTheDocument();
    testRunDetails(action.execution).joined = completed;
    await act(async () => view.rerender(galleryTree(panel(),context(action))));
    expect(screen.getByRole('button',{ name:'Plot' })).toBeInTheDocument();
    expect(screen.queryByText('snapshot unavailable')).toBeNull();
  });

  it('uses retained exact revision for Stop and preserves occupancy after cancel rejection',async () => {
    listROSBagRecordings.mockResolvedValue(recordings({ id:'bag-1',name:'run-42.bag',path:'/data/run-42.bag' }));
    const action = plotAction();
    action.control = vi.fn().mockRejectedValueOnce(new Error('revision conflict')).mockResolvedValue(undefined);
    const view = renderGallery(panel(),context(action));
    fireEvent.click(await screen.findByRole('button',{ name:'Plot' }));
    await waitFor(() => expect(action.execution!.retainRunObservation).toHaveBeenCalledWith('run-plot'));
    testRunDetails(action.execution)['run-plot'] = runDetail('run-plot','running',5);
    await act(async () => view.rerender(galleryTree(panel(),context(action))));
    await act(async () => fireEvent.click(screen.getByRole('button',{ name:'Stop' })));
    expect(await screen.findByText('revision conflict')).toBeInTheDocument();
    expect(action.control).toHaveBeenCalledWith({ id:'run-plot',status:'running',revision:5 },'cancel','Stop plotting');
    expect(screen.getByRole('button',{ name:'Stop' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{ name:'Stop' }));
    await waitFor(() => expect(action.control).toHaveBeenCalledTimes(2));
  });

  it('previews the first image while retaining producer occupancy and later failure',async () => {
    listROSBagRecordings.mockResolvedValue(recordings({ id:'bag-1',name:'run-42.bag',path:'/data/run-42.bag' }));
    listROSBagFigures.mockResolvedValue({
      galleryId:'bag-1',
      files:[{ name:'overview.svg',size:12,mediaType:'image/svg+xml',createdAt:'2026-01-01T00:00:00Z' }],
    });
    const action = plotAction();
    const view = renderGallery(panel(),context(action));
    fireEvent.click(await screen.findByRole('button',{ name:'Plot' }));
    await waitFor(() => expect(action.execution!.retainRunObservation).toHaveBeenCalledWith('run-plot'));
    testRunDetails(action.execution)['run-plot'] = runDetail('run-plot','running',2);
    await act(async () => view.rerender(galleryTree(panel(),context(action))));
    expect(await screen.findByText('overview.svg')).toBeInTheDocument();
    expect(listROSBagFigures).toHaveBeenCalled();
    expect(screen.getByRole('button',{ name:'Stop' })).toBeInTheDocument();
    const failed = runDetail('run-plot','failed',3);
    failed.run!.primaryError = 'plot writer failed';
    testRunDetails(action.execution)['run-plot'] = failed;
    await act(async () => view.rerender(galleryTree(panel(),context(action))));
    expect(screen.getByText('plot writer failed')).toBeInTheDocument();
    expect(screen.getByText('overview.svg')).toBeInTheDocument();
    expect(screen.getByRole('button',{ name:'Plot' })).toBeInTheDocument();
  });

  it('does not let an old admission mutate a new Experiment or cancel it implicitly',async () => {
    listROSBagRecordings.mockResolvedValue(recordings({ id:'bag-1',name:'run-42.bag',path:'/data/run-42.bag' }));
    const old = plotAction();
    const admission = deferred<PanelActionInvocation>();
    old.invoke = vi.fn(() => admission.promise);
    const view = renderGallery(panel(),context(old));
    fireEvent.click(await screen.findByRole('button',{ name:'Plot' }));
    const next = plotAction();
    next.invoke = vi.fn(async () => ({ id:'new-run',status:'running' as const,revision:1 }));
    await act(async () => view.rerender(galleryTree(panel(),context(next,'exp-2'))));
    fireEvent.click(await screen.findByRole('button',{ name:'Plot' }));
    await waitFor(() => expect(next.execution!.retainRunObservation).toHaveBeenCalledWith('new-run'));
    await act(async () => admission.resolve({ id:'old-run',status:'running',revision:1 }));
    expect(old.control).not.toHaveBeenCalled();
    expect(next.execution!.retainRunObservation).not.toHaveBeenCalledWith('old-run');
    fireEvent.click(screen.getByRole('button',{ name:'Stop' }));
    await waitFor(() => expect(next.control).toHaveBeenCalledWith(
      { id:'new-run',status:'running',revision:1 },'cancel','Stop plotting',
    ));
  });

  it('switches to the bound plot workflow view from the header',async () => {
    renderGallery();
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole('button',{ name:'Workflow' }));
    expect(document.querySelector('[data-xgc-role="scientific-gallery-header-leading"]'))
      .toHaveAttribute('data-xgc-workflow-view-active','true');
    expect(document.querySelector('[data-xgc-role="scientific-gallery-workflow"][data-xgc-id="gallery"]'))
      .toHaveAttribute('data-state','empty');
    expect(screen.queryByText('overview.svg')).not.toBeInTheDocument();
    expect(document.querySelector('[data-xgc-role="scientific-gallery-bag-list"]')).toBeNull();
  });

  it('moves the recording library into the Recordings view and hides Plot actions',async () => {
    listROSBagRecordings.mockResolvedValue(recordings(
      { id:'bag-1',name:'run-42.bag',path:'/data/run-42.bag' },
    ));
    renderGallery();
    await screen.findByRole('button',{ name:/run-42\.bag/i });
    expect(await screen.findByRole('button',{ name:'Plot' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{ name:'Recordings' }));
    expect(document.querySelector('[data-xgc-role="scientific-gallery-header-leading"]'))
      .toHaveAttribute('data-xgc-recordings-view-active','true');
    const library = document.querySelector('[data-xgc-role="recording-library"][data-xgc-id="recording-library"]');
    const search = await waitFor(() => {
      const node = document.querySelector('[data-xgc-role="recording-search"][data-xgc-id="recording-search"]');
      expect(node).toBeTruthy();
      return node as HTMLElement;
    });
    expect(library).toBeInTheDocument();
    expect(library?.querySelector('[data-xgc-role="recording-search"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="experiment-panel-header-status"][data-xgc-id="gallery"]'))
      .toContainElement(search as HTMLElement);
    expect(document.querySelector('[data-xgc-role="experiment-panel-header"][data-xgc-id="gallery"]'))
      .toContainElement(search as HTMLElement);
    expect(document.querySelector('[data-xgc-role="scientific-gallery-bag-pane"]')).toBeNull();
    expect(screen.queryByRole('button',{ name:'Plot' })).toBeNull();
    expect(screen.queryByRole('button',{ name:'Delete' })).toBeNull();
  });

  it('puts recording Stop and Delete on the header trailing side', async () => {
    const instance = panel();
    function Publish() {
      const { setRecordingActions,setView } = useScientificGalleryFrame(instance.id);
      useEffect(() => {
        setView('recordings');
        setRecordingActions({
          recordingId: 'screen.1',
          removing: false,
          stopLabel: 'Stop',
          removeLabel: 'Delete',
          onStop: () => {},
          onDelete: () => {},
        });
      }, [setRecordingActions,setView]);
      return null;
    }
    render(
      <ScientificGalleryFrameProvider panel={instance}>
        <div data-xgc-role="experiment-panel-header-trailing" data-xgc-id={instance.id}>
          <ScientificGalleryHeaderActions panel={instance} editing={false} />
        </div>
        <Publish />
      </ScientificGalleryFrameProvider>,
    );
    const stop = await screen.findByRole('button', { name: 'Stop' });
    const remove = screen.getByRole('button', { name: 'Delete' });
    const trailing = document.querySelector('[data-xgc-role="experiment-panel-header-trailing"]');
    expect(trailing).toContainElement(stop);
    expect(trailing).toContainElement(remove);
    expect(stop).toHaveAttribute('data-xgc-role', 'recording-stop');
    expect(remove).toHaveAttribute('data-xgc-id', 'screen.1');
    expect(document.querySelector('[data-xgc-role="recording-actions"]')).toContainElement(stop);
  });

  it('embeds the video workbench in the Video view without a nested Panel title',async () => {
    listROSBagRecordings.mockResolvedValue(recordings(
      { id:'bag-1',name:'run-42.bag',path:'/data/run-42.bag' },
    ));
    renderGallery();
    await screen.findByRole('button',{ name:/run-42\.bag/i });
    fireEvent.click(screen.getByRole('button',{ name:'Video' }));
    expect(document.querySelector('[data-xgc-role="scientific-gallery-header-leading"]'))
      .toHaveAttribute('data-xgc-video-view-active','true');
    const video = document.querySelector('[data-xgc-role="scientific-gallery-video"][data-xgc-id="gallery"]');
    const production = document.querySelector('[data-xgc-role="video-production"][data-xgc-id="gallery"]');
    expect(video).toBeInTheDocument();
    expect(video).toContainElement(production as HTMLElement);
    expect(video?.querySelector(':scope > [data-xgc-role="scientific-gallery-video-toolbar"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="scientific-gallery-video-toolbar"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="video-workbench-tools"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="scientific-gallery-video"] .xgc-workspace-panel-title'))
      .toBeNull();
    expect(document.querySelector('[data-xgc-role="scientific-gallery-bag-pane"]')).toBeNull();
    expect(screen.queryByRole('button',{ name:'Plot' })).toBeNull();
    expect(screen.queryByRole('button',{ name:'Delete' })).toBeNull();
  });

  it('selects the latest listed bag and plots it without a path picker',async () => {
    listROSBagRecordings.mockResolvedValue(recordings(
      { id:'bag-1',name:'run-42.bag',path:'/home/lxk/Documents/XGC/Data/run-42.bag' },
    ));
    const action = plotAction();
    renderGallery(panel(),context(action));
    const row = await screen.findByRole('button',{ name:/run-42\.bag/i });
    expect(row).toHaveAttribute('aria-pressed','true');
    expect(listROSBagRecordings).toHaveBeenCalledWith({ limit:500 },expect.any(AbortSignal));
    const run = await screen.findByRole('button',{ name:'Plot' });
    await waitFor(() => expect(run).not.toBeDisabled());
    fireEvent.click(run);
    expect(screen.getByRole('button',{ name:'Stop' })).toBeInTheDocument();
    await waitFor(() => expect(action.invoke).toHaveBeenCalledWith({
      inputPath:'/home/lxk/Documents/XGC/Data/run-42.bag',
      scriptPath:'/workspace/plot.py',
      publicationId:'bag-1',
    },'Plot figures for run-42.bag'));
  });

  it('hides Plot and Delete until a bag is selected',async () => {
    renderGallery();
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="scientific-gallery-bag-list"]')).toBeTruthy();
    });
    expect(screen.queryByRole('button',{ name:'Plot' })).toBeNull();
    expect(screen.queryByRole('button',{ name:'Delete' })).toBeNull();
    expect(screen.queryByLabelText('Choose a data file')).toBeNull();
  });

  it('tracks the invoked run to completion through its retained run detail',async () => {
    listROSBagRecordings.mockResolvedValue(recordings(
      { id:'bag-1',name:'run-42.bag',path:'/data/run-42.bag' },
    ));
    listROSBagFigures.mockResolvedValue({
      galleryId:'bag-1',
      files:[{ name:'overview.svg',size:12,mediaType:'image/svg+xml',createdAt:'2026-01-01T00:00:00Z' }],
    });
    const action = plotAction();
    const view = renderGallery(panel(),context(action));
    await waitFor(() => expect(screen.getByRole('button',{ name:'Plot' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button',{ name:'Plot' }));
    expect(screen.getByRole('button',{ name:'Stop' })).toBeInTheDocument();
    await waitFor(() => {
      expect(action.execution!.retainRunObservation).toHaveBeenCalledWith('run-plot');
      expect(action.execution!.loadRunDetail).toHaveBeenCalledWith('run-plot');
    });
    testRunDetails(action.execution)['run-plot'] = {
      run:{ id:'run-plot',status:'succeeded',revision:2,sourceRef:{ resourceId:'exp-1' },parameters:{} },
      invocations:[],nodeSummaries:[],loading:false,error:'',
    } as unknown as AutomationRunDetail;
    await act(async () => view.rerender(galleryTree(panel(),context(action))));
    expect(await screen.findByText('overview.svg')).toBeInTheDocument();
    expect(screen.getByRole('button',{ name:'Plot' })).toBeInTheDocument();
    view.unmount();
  });

  it('does not retain completed Plot occupancy from an older active projection',async () => {
    listROSBagRecordings.mockResolvedValue(recordings({ id:'bag-1',name:'run-42.bag',path:'/data/run-42.bag' }));
    listROSBagFigures.mockResolvedValue({
      galleryId:'bag-1',
      files:[{ name:'overview.svg',size:12,mediaType:'image/svg+xml',createdAt:'2026-01-01T00:00:00Z' }],
    });
    const action = plotAction();
    action.activeInvocation = { id:'run-plot',status:'running',revision:1 };
    const view = renderGallery(panel(),context(action));
    fireEvent.click(await screen.findByRole('button',{ name:'Plot' }));
    await waitFor(() => expect(action.execution!.retainRunObservation).toHaveBeenCalledWith('run-plot'));
    testRunDetails(action.execution)['run-plot'] = runDetail('run-plot','succeeded',3);
    await act(async () => view.rerender(galleryTree(panel(),context(action))));
    expect(await screen.findByText('overview.svg')).toBeInTheDocument();
    expect(await screen.findByRole('button',{ name:'Plot' })).toBeInTheDocument();
    expect(screen.queryByRole('button',{ name:'Stop' })).toBeNull();
  });

  it('keeps previous figures while Stop plotting is up and the new publication is still empty',async () => {
    listROSBagRecordings.mockResolvedValue(recordings(
      { id:'bag-1',name:'run-42.bag',path:'/data/run-42.bag' },
    ));
    listROSBagFigures.mockResolvedValue({
      galleryId:'bag-1',
      files:[{ name:'overview.svg',size:12,mediaType:'image/svg+xml',createdAt:'2026-01-01T00:00:00Z' }],
    });
    const action = plotAction();
    const view = renderGallery(panel(),context(action));
    await waitFor(() => expect(screen.getByRole('button',{ name:'Plot' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button',{ name:'Plot' }));
    action.latestInvocation = { id:'run-plot',status:'succeeded',revision:2 };
    testRunDetails(action.execution)['run-plot'] = {
      run:{ id:'run-plot',status:'succeeded',revision:2,sourceRef:{ resourceId:'exp-1' },parameters:{} },
      invocations:[],nodeSummaries:[],loading:false,error:'',
    } as unknown as AutomationRunDetail;
    await act(async () => view.rerender(galleryTree(panel(),context(action))));
    expect(await screen.findByText('overview.svg')).toBeInTheDocument();

    listROSBagFigures.mockResolvedValue({
      galleryId:'bag-1',
      files:[],
    });
    action.invoke = vi.fn(async () => ({ id:'run-plot-2',status:'running' as const,revision:1 }));
    fireEvent.click(screen.getByRole('button',{ name:'Plot' }));
    expect(screen.getByRole('button',{ name:'Stop' })).toBeInTheDocument();
    expect(screen.getByText('overview.svg')).toBeInTheDocument();

    listROSBagFigures.mockResolvedValue({
      galleryId:'bag-1',
      files:[
        { name:'sce1-resultsFIG1.png',size:12,mediaType:'image/png',createdAt:'2026-09-17T15:31:00Z' },
        { name:'sce1-resultsFIG3.png',size:12,mediaType:'image/png',createdAt:'2026-09-17T15:31:00Z' },
      ],
    });
    testRunDetails(action.execution)['run-plot-2'] = {
      run:{ id:'run-plot-2',status:'succeeded',revision:2,sourceRef:{ resourceId:'exp-1' },parameters:{} },
      invocations:[],
      nodeSummaries:[{ nodeId:'plot-results',kind:'process.run-python-script',status:'succeeded',activeOccurrenceCount:0 }],
      loading:false,error:'',
    } as unknown as AutomationRunDetail;
    await act(async () => view.rerender(galleryTree(panel(),context(action))));
    expect(await screen.findByText('sce1-resultsFIG1.png')).toBeInTheDocument();
    expect(screen.getByText('sce1-resultsFIG3.png')).toBeInTheDocument();
    expect(screen.queryByText('overview.svg')).toBeNull();
    expect(screen.getByRole('button',{ name:'Plot' })).toBeInTheDocument();
    view.unmount();
  });

  it('opens a zoomable viewer from a figure and closes it with Escape',async () => {
    listROSBagRecordings.mockResolvedValue(recordings({ id:'bag-1',name:'run-42.bag',path:'/data/run-42.bag' }));
    listROSBagFigures.mockResolvedValue({
      galleryId:'bag-1',
      files:[{ name:'overview.svg',size:12,mediaType:'image/svg+xml',createdAt:'2026-01-01T00:00:00Z' }],
    });
    renderGallery();
    const openFigure = await screen.findByRole('button',{ name:'Open figure overview.svg' });
    await waitFor(() => expect(openFigure).not.toBeDisabled());
    fireEvent.click(openFigure);
    const dialog = await screen.findByRole('dialog',{ name:'Figure viewer' });
    expect(dialog).toHaveAttribute('data-xgc-role','scientific-gallery-figure-viewer');
    expect(dialog).toHaveAttribute('data-xgc-id','gallery');
    await waitFor(() => expect(dialog.querySelector('.scientific-gallery-viewer-image')).toBeTruthy());
    expect(dialog.querySelector('.xgc-modal-header strong')).toHaveTextContent('overview.svg');
    const level = document.querySelector('[data-xgc-role="scientific-gallery-viewer-zoom-level"][data-xgc-id="gallery"]');
    expect(level).toHaveTextContent('100%');
    fireEvent.click(screen.getByRole('button',{ name:'Zoom in' }));
    expect(level).toHaveTextContent('125%');
    fireEvent.click(screen.getByRole('button',{ name:'Fit to view' }));
    expect(level).toHaveTextContent('100%');
    fireEvent.keyDown(dialog,{ key:'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows one tile per figure stem and prefers the SVG carrier',async () => {
    listROSBagRecordings.mockResolvedValue(recordings({ id:'bag-1',name:'run-42.bag',path:'/data/run-42.bag' }));
    listROSBagFigures.mockResolvedValue({
      galleryId:'bag-1',
      files:[
        { name:'overview.png',size:12,mediaType:'image/png',createdAt:'2026-01-01T00:00:00Z' },
        { name:'overview.svg',size:12,mediaType:'image/svg+xml',createdAt:'2026-01-01T00:00:00Z' },
        { name:'still.png',size:12,mediaType:'image/png',createdAt:'2026-01-01T00:00:01Z' },
      ],
    });
    renderGallery();
    expect(await screen.findByText('overview.svg')).toBeInTheDocument();
    expect(screen.getByText('still.png')).toBeInTheDocument();
    expect(screen.queryByText('overview.png')).toBeNull();
    expect(document.querySelectorAll('[data-xgc-role="scientific-gallery-figure"]')).toHaveLength(2);
  });

  it('navigates between figures with buttons and arrow keys',async () => {
    listROSBagRecordings.mockResolvedValue(recordings({ id:'bag-1',name:'run-42.bag',path:'/data/run-42.bag' }));
    listROSBagFigures.mockResolvedValue({
      galleryId:'bag-1',
      files:[
        { name:'a.svg',size:12,mediaType:'image/svg+xml',createdAt:'2026-01-01T00:00:00Z' },
        { name:'b.svg',size:12,mediaType:'image/svg+xml',createdAt:'2026-01-01T00:00:01Z' },
      ],
    });
    renderGallery();
    const openFigure = await screen.findByRole('button',{ name:'Open figure a.svg' });
    await waitFor(() => expect(openFigure).not.toBeDisabled());
    fireEvent.click(openFigure);
    const dialog = await screen.findByRole('dialog',{ name:'Figure viewer' });
    expect(screen.getByText('Figure 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button',{ name:'Previous figure' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{ name:'Next figure' }));
    await waitFor(() => expect(screen.getByText('Figure 2 of 2')).toBeInTheDocument());
    expect(dialog.querySelector('.xgc-modal-header strong')).toHaveTextContent('b.svg');
    expect(screen.getByRole('button',{ name:'Next figure' })).toBeDisabled();
    fireEvent.keyDown(document.body,{ key:'ArrowLeft' });
    await waitFor(() => expect(screen.getByText('Figure 1 of 2')).toBeInTheDocument());
    fireEvent.keyDown(document.body,{ key:'ArrowRight' });
    await waitFor(() => expect(screen.getByText('Figure 2 of 2')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button',{ name:'Close figure viewer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

function recordings(...items: Array<{ id: string; name: string; path: string } & Partial<{
  experimentId: string; recordingId: string; startedAt: string; runMode: string;
}>>) {
  return {
    items: items.map((item) => ({ size:10, createdAt:'2026-01-02T00:00:00Z', ...item })),
    limit:100, offset:0, total:items.length, truncated:false,
  };
}

function attributedBag(index: number, experimentId: string) {
  const recordingId = index.toString(16).padStart(32,'0');
  const stamp = `2026-09-21_18-${String(index).padStart(2,'0')}-00`;
  return {
    id:`bag.${recordingId}.0`,
    name:`Experiments/TASE-4UGVs/Runs/${stamp}_simulation/Data/TASE-4UGVs_simulation_${stamp}.bag`,
    path:`/archive/${recordingId}.bag`,
    experimentId,
    recordingId,
    startedAt:`2026-09-21T18:${String(index).padStart(2,'0')}:00Z`,
    runMode:'simulation',
  };
}

function renderGallery(instance = panel(),value = context(plotAction())) {
  return render(galleryTree(instance,value));
}

function galleryTree(instance: PanelInstance,value: PanelPluginContext) {
  return (
    <ScientificGalleryFrameProvider panel={instance}>
      <div data-xgc-role="experiment-panel-header" data-xgc-id={instance.id}>
        <ScientificGalleryHeaderLeading panel={instance} editing={false} />
        <div data-xgc-role="experiment-panel-header-status" data-xgc-id={instance.id}>
          <ScientificGalleryHeaderStatus panel={instance} editing={false} />
        </div>
        <ScientificGalleryHeaderActions panel={instance} editing={false} />
      </div>
      <ScientificGalleryPanel panel={instance} context={value} />
    </ScientificGalleryFrameProvider>
  );
}

function panel(): PanelInstance {
  return {
    id:'gallery',pluginId:'scientific-gallery',title:'Scientific plots',
    gridPos:{ x:7,y:0,w:23,h:16 },query:{},options:{ dashboard:'algorithm',scriptPath:'/workspace/plot.py' },fieldConfig:{},portBindings:[],
  };
}

function plotAction(): PanelActionPortRuntime {
  return {
    id:'plot',label:'Plot',connected:true,disabledReason:'',defaults:{},
    action:{ id:'plot',label:'Plot',kind:'command',controls:['cancel'] },
    inputSchema:{ fields:[
      { name:'inputPath',kind:'string',required:true,string:{} },
      { name:'scriptPath',kind:'string',required:true,string:{} },
      { name:'publicationId',kind:'string',required:true,string:{} },
    ] },
    invoke:vi.fn(async () => ({ id:'run-plot',status:'running' as const,revision:1 })),
    control:vi.fn(),trace:{},execution:testPanelExecution({},{ loadRunDetail:vi.fn(),retainRunDetail:vi.fn(),retainRunObservation:vi.fn(() => () => undefined) }),
  };
}

function context(action: PanelActionPortRuntime,experimentId = 'exp-1'): PanelPluginContext {
  return {
    executionTargetId:'local',
    ports:{
      actions:{ plot:action },
      data:{ 'recording-artifacts':{
        id:'recording-artifacts',label:'Artifacts',contract:'recording.artifacts.v1',connected:true,
        value:{ experimentResourceId:experimentId },trace:{},
      } },
      authoring:{},interactions:{},
    },
  };
}

function deferred<T>() {
  let resolve!: (value:T) => void;
  const promise = new Promise<T>((yes) => { resolve=yes; });
  return { promise,resolve };
}

function runDetail(id:string,status:PanelActionInvocation['status'],revision:number): AutomationRunDetail {
  return {
    run:{ id,status,revision,sourceRef:{ resourceId:'exp-1' },parameters:{} },
    invocations:[],nodeSummaries:[],loading:false,error:'',
  } as unknown as AutomationRunDetail;
}
