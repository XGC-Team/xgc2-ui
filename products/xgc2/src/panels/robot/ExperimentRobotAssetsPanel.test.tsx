// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import {
  newExperimentSpec,
  type ExperimentDocument,
  type ExperimentRobotBinding,
  type ExperimentScene,
  type PanelInstance,
} from '../../domains/experiment/experimentPublic';
import {
  defineContributedRobotAssetKind,
  type RobotAssetDocument,
} from '../../domains/robot/robotAssetPublic';
import { PanelFrame } from '../PanelFrame';
import { ProductRouteVisibilityProvider } from '../../shared/routeReady';
import type { PanelPluginContext } from '../types';
import { ExperimentRobotAssetsPanel } from './ExperimentRobotAssetsPanel';
import {
  EXPERIMENT_ROBOT_ASSETS_PANEL_ID,
  experimentRobotAssetsPanelPlugin,
} from './experimentRobotAssetsPanelManifest';

const runningLock = 'Experiment Robots cannot be changed while the Experiment is running. Stop it before editing assets.';
const rosterEditLock = 'Enter Edit mode to add or remove Robots.';
const staleCoordinateDraft = 'The Experiment configuration changed. Reopen coordinate settings before saving.';
const inactiveContributedKind = defineContributedRobotAssetKind('inactive-kind');

const { getExperimentAtCommit,listScenes } = vi.hoisted(() => ({
  getExperimentAtCommit: vi.fn(),
  listScenes: vi.fn(),
}));
vi.mock('../../domains/experiment/experimentService', async (importOriginal) => ({
  ...(await importOriginal() as Record<string,unknown>),
  getExperimentAtCommit,
  listScenes,
}));
describe('ExperimentRobotAssetsPanel Panel v2',() => {
  it('starts with a Robot assembly stage and opens catalog data only in the picker',() => {
    renderPanel(context(experiment()));
    expect(screen.queryByText('No Robots added')).toBeNull();
    expect(screen.getByRole('heading',{ name:'UAV' })).toBeVisible();
    expect(screen.getByRole('heading',{ name:'UGV' })).toBeVisible();
    expect(screen.getAllByRole('button',{ name:'Add robots' })).toHaveLength(2);
    expect(screen.queryByText('No Robot assets')).toBeNull();
    expect(screen.queryByRole('heading',{ name:'Robots' })).toBeNull();
    expect(screen.queryByRole('heading',{ name:'Give each Robot a starting point' })).toBeNull();
    expect(screen.getByRole('button',{ name:'World origin offset' })).toBeVisible();
    browseAssets();
    expect(screen.getByText('No Robot assets')).toBeVisible();
    expect(screen.queryByRole('heading',{ name:'Robots' })).toBeNull();
    expect(screen.getByRole('dialog',{ name:'Add robots' })).toBeVisible();
    expect(screen.queryByRole('heading',{ name:'Give each Robot a starting point' })).toBeNull();
    expect(screen.queryByRole('button',{ name:'Run' })).toBeNull();
  });

  it('opens starting poses as an explicit authoring step without committing on entry',() => {
    const { commit } = renderPanel(context(experiment([px4Binding()]),{ assets:[px4Asset()] }));
    const entry = screen.getByRole('button',{ name:'Simulation starting poses' });
    expect(entry).toHaveAttribute('data-xgc-role','experiment-robot-assets-starting-poses-entry');
    expect(document.querySelector('[data-xgc-role="experiment-robot-assets-fill-current-pose"]')).toBeNull();
    expect(entry).toBeEnabled();
    fireEvent.click(entry);
    expect(coordinateDrawer('starting-poses')).toBeVisible();
    expect(coordinateAxis('px4-01','x')).toBeEnabled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('opens the first Scene card and commits its selection through the Scene authoring port',async () => {
    const original = experiment([px4Binding(),scoutBinding()]);
    const originalRobots = structuredClone(original.spec.robots);
    const robotCommit = vi.fn(async () => original);
    let committed: ExperimentDocument | undefined;
    const sceneCommit = vi.fn(async (scene:unknown) => {
      committed = savedExperiment(original,{ scene:scene as ExperimentScene },'commit-2',2);
      return committed;
    });
    listScenes.mockReset().mockResolvedValue([{
      name:'gazebo-world',path:'/scenes/gazebo-world',relativePath:'gazebo-world',kind:'obstacle',createdAt:'',
      simulators:{ gazebo:{ geometry:'document' } },
    }]);
    const { container } = renderPanel(context(original,{
      assets:[px4Asset(),scoutAsset()],commit:robotCommit,sceneCommit,
    }));

    const entries = Array.from(container.querySelectorAll<HTMLButtonElement>(
      '[data-xgc-role="experiment-robot-assets-coordinate-scene"] > button',
    ));
    expect(entries.map((entry) => entry.getAttribute('data-xgc-role'))).toEqual([
      'experiment-scene-entry',
      'experiment-robot-assets-world-origin',
      'experiment-robot-assets-starting-poses-entry',
      'experiment-robot-assets-world-fence',
    ]);
    fireEvent.click(entries[0]!);
    await screen.findByRole('button',{ name:'Simulator' });
    const sceneSelect = document.querySelector<HTMLButtonElement>('[data-xgc-role="experiment-scene-select-trigger"]');
    if (!sceneSelect) throw new Error('Scene selector trigger missing');
    fireEvent.click(sceneSelect);
    fireEvent.click(await screen.findByRole('option',{ name:'gazebo-world' }));
    const backendSelect = document.querySelector<HTMLButtonElement>('[data-xgc-role="experiment-backend-select-trigger"]');
    if (!backendSelect) throw new Error('Simulator selector trigger missing');
    fireEvent.click(backendSelect);
    fireEvent.click(await screen.findByRole('option',{ name:'Gazebo' }));
    const save = document.querySelector<HTMLButtonElement>('[data-xgc-role="experiment-scene-save"][data-xgc-id="scene"]');
    if (!save) throw new Error('Scene save button missing');
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(sceneCommit).toHaveBeenCalledOnce());
    expect(sceneCommit).toHaveBeenCalledWith(
      { asset:'gazebo-world',simulator:'gazebo',parameters:{} },
      'commit-1',
      'Update Experiment scene',
    );
    expect(robotCommit).not.toHaveBeenCalled();
    expect(committed?.spec.robots).toEqual(originalRobots);
    expect(committed?.spec.localizationOffset).toEqual(original.spec.localizationOffset);
    expect(original.spec.robots).toEqual(originalRobots);
    expect(robotSelection('uav-01')).toBeVisible();
    expect(robotSelection('scout-1')).toBeVisible();
  });

  it('keeps Scene saving disabled and does not call the authoring port when its binding is absent',async () => {
    const sceneCommit = vi.fn(async () => experiment());
    listScenes.mockReset().mockResolvedValue([{
      name:'gazebo-world',path:'/scenes/gazebo-world',relativePath:'gazebo-world',kind:'obstacle',createdAt:'',
      simulators:{ gazebo:{ geometry:'document' } },
    }]);
    renderPanel(context(experiment(),{ sceneCommit,sceneConnected:false }));

    fireEvent.click(screen.getByRole('button',{ name:'Scene' }));
    expect(await screen.findByText('Authoring port "Scene" is not connected.')).toBeVisible();
    const save = document.querySelector<HTMLButtonElement>('[data-xgc-role="experiment-scene-save"][data-xgc-id="scene"]');
    expect(save).toBeDisabled();
    fireEvent.click(save!);
    expect(sceneCommit).not.toHaveBeenCalled();
  });

  it('shows air and ground portraits from the public chassis metadata in the roster and picker',() => {
    renderPanel(context(experiment([px4Binding(),scoutBinding()]),{ assets:[px4Asset(),scoutAsset()] }));
    expect(robotSelection('uav-01').querySelector('.experiment-robot-portrait')).toHaveAttribute('data-family','air');
    expect(robotSelection('scout-1').querySelector('.experiment-robot-portrait')).toHaveAttribute('data-family','ground');
    browseAssets();
    expect(screen.getByRole('button',{ name:'Open FS150-01 settings' }).querySelector('.experiment-robot-portrait'))
      .toHaveAttribute('data-family','air');
    expect(screen.getByRole('button',{ name:'Open Scout Mini settings' }).querySelector('.experiment-robot-portrait'))
      .toHaveAttribute('data-family','ground');
  });

  it('commits next-start poses explicitly while the active Experiment keeps other Robot fields locked',async () => {
    const { container,commit } = renderPanel(context(experiment([px4Binding()]),{
      assets:[px4Asset()],runtimeActive:true,disabledReason:runningLock,
    }));
    selectRobot('uav-01');
    const namespace = screen.getByRole('textbox',{ name:'ROS namespace' });
    expect(namespace).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{ name:'Simulation starting poses' }));
    fireEvent.change(coordinateAxis('px4-01','x'),{ target:{ value:'3' } });
    fireEvent.change(coordinateAxis('px4-01','y'),{ target:{ value:'-4' } });
    fireEvent.change(screen.getByRole('spinbutton',{ name:'Heading' }),{ target:{ value:'0.5' } });
    expect(commit).not.toHaveBeenCalled();
    saveCoordinates('starting-poses');
    await waitFor(() => expect(commit).toHaveBeenCalledOnce());
    const saved = (commit.mock.calls[0]?.[0] as ExperimentRobotBinding[])[0]!;
    expect(saved).toMatchObject({ namespace:'/uav1',initialPose:{ x:3,y:-4,z:0,yaw:0.5 } });
    expect(commit.mock.calls[0]?.[2]).toBe('Set starting poses for the next Experiment');
    // The parameters drawer remounts after the coordinate drawer closes.
    fireEvent.click(screen.getByRole('button',{ name:'Close drawer' }));
    expect(screen.getByRole('textbox',{ name:'ROS namespace' })).toBeDisabled();
    await waitFor(() => expect(poseAxis(container,'experiment-robot-assets-panel-pose-x')).toHaveValue(3));
    expect(poseAxis(container,'experiment-robot-assets-panel-pose-y')).toHaveValue(-4);
    fireEvent.click(screen.getByRole('button',{ name:'Simulation starting poses' }));
    expect(coordinateAxis('px4-01','x')).toHaveValue(3);
    expect(coordinateAxis('px4-01','y')).toHaveValue(-4);
    expect(screen.getByRole('spinbutton',{ name:'Heading' })).toHaveValue(0.5);
  });

  it('queues Robot edits behind a pending commit and blocks the coordinate save until they land',async () => {
    const document = experiment([px4Binding()]);
    let resolveFirst!: (saved: ExperimentDocument) => void;
    const commit = vi.fn()
      .mockImplementationOnce(() => new Promise<ExperimentDocument>((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(async (bindings: ExperimentRobotBinding[]) => savedExperiment(document,{ robots:bindings },'commit-3',3))
      .mockImplementationOnce(async (bindings: ExperimentRobotBinding[]) => savedExperiment(document,{ robots:bindings },'commit-4',4));
    const { container } = renderPanel(context(document,{ assets:[px4Asset()],commit }));
    selectRobot('uav-01');
    const namespace = screen.getByRole('textbox',{ name:'ROS namespace' });
    fireEvent.change(namespace,{ target:{ value:'/uav9' } });
    await waitFor(() => expect(commit).toHaveBeenCalledOnce());
    fireEvent.change(poseAxis(container,'experiment-robot-assets-panel-pose-y'),{ target:{ value:'5' } });
    expect(commit).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button',{ name:'Simulation starting poses' }));
    fireEvent.change(coordinateAxis('px4-01','x'),{ target:{ value:'3' } });
    saveCoordinates('starting-poses');
    await waitFor(() => expect(coordinateDrawer('starting-poses')).toHaveTextContent('Wait for the current changes to finish saving.'));
    await act(async () => resolveFirst(savedExperiment(document,{
      robots:commit.mock.calls[0][0] as ExperimentRobotBinding[],
    },'commit-2',2)));
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(2));
    expect(commit.mock.calls[1]).toEqual([
      [expect.objectContaining({ namespace:'/uav9',initialPose:{ x:0,y:5,z:0,yaw:0 } })],
      'commit-2','Update Experiment Robots from Config dashboard',
    ]);
    saveCoordinates('starting-poses');
    await waitFor(() => expect(coordinateDrawer('starting-poses')).toHaveTextContent(staleCoordinateDraft));
    expect(commit).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button',{ name:'Close drawer' }));
    fireEvent.click(await screen.findByRole('button',{ name:'Discard changes' }));
    await waitFor(() => expect(globalThis.document.querySelector('[data-xgc-role="experiment-coordinate-drawer"]')).toBeNull());
    fireEvent.click(screen.getByRole('button',{ name:'Simulation starting poses' }));
    fireEvent.change(coordinateAxis('px4-01','x'),{ target:{ value:'3' } });
    saveCoordinates('starting-poses');
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(3));
    expect(commit.mock.calls[2]).toEqual([
      [expect.objectContaining({ namespace:'/uav9',initialPose:{ x:3,y:5,z:0,yaw:0 } })],
      'commit-3','Set starting poses for the next Experiment',
    ]);
    fireEvent.click(screen.getByRole('button',{ name:'Close drawer' }));
    expect(screen.getByRole('textbox',{ name:'ROS namespace' })).toHaveValue('/uav9');
    expect(poseAxis(container,'experiment-robot-assets-panel-pose-x')).toHaveValue(3);
    expect(poseAxis(container,'experiment-robot-assets-panel-pose-y')).toHaveValue(5);
  });

  it.each([
    { name:'newer committed configuration',head:'commit-2',version:2,editing:false },
    { name:'same-commit Edit draft',head:'commit-1',version:1,editing:true },
  ])('requires reopening stale starting poses after a $name arrives',async ({ head,version,editing }) => {
    const initial = experiment([px4Binding(1),px4Binding(2)]);
    const changedRobot = { ...px4Binding(2),initialPose:{ x:8,y:0,z:0,yaw:0 } };
    const updated = savedExperiment(initial,{ robots:[px4Binding(1),changedRobot] },head,version);
    const commit = vi.fn(async (bindings: unknown) => savedExperiment(updated,{ robots:bindings as ExperimentRobotBinding[] },'commit-3',3));
    const { rerenderPanel } = renderPanel(context(initial,{ assets:[px4Asset(1),px4Asset(2)],editing,commit }));
    fireEvent.click(screen.getByRole('button',{ name:'Simulation starting poses' }));
    const x = coordinateAxis('px4-01','x');
    fireEvent.change(x,{ target:{ value:'3' } });
    rerenderPanel(context(updated,{ assets:[px4Asset(1),px4Asset(2)],editing,commit }));
    expect(x).toHaveValue(3);
    // Repeating the entry must not replace the existing coordinate draft's base.
    fireEvent.click(screen.getByRole('button',{ name:'Simulation starting poses' }));
    expect(coordinateAxis('px4-01','x')).toBe(x);
    saveCoordinates('starting-poses');
    await waitFor(() => expect(coordinateDrawer('starting-poses')).toHaveTextContent(staleCoordinateDraft));
    expect(commit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{ name:'Close drawer' }));
    fireEvent.click(await screen.findByRole('button',{ name:'Discard changes' }));
    await waitFor(() => expect(globalThis.document.querySelector('[data-xgc-role="experiment-coordinate-drawer"]')).toBeNull());
    fireEvent.click(screen.getByRole('button',{ name:'Simulation starting poses' }));
    fireEvent.change(coordinateAxis('px4-01','x'),{ target:{ value:'3' } });
    saveCoordinates('starting-poses');
    await waitFor(() => expect(commit).toHaveBeenCalledWith([
      expect.objectContaining({ initialPose:{ x:3,y:0,z:0,yaw:0 } }),changedRobot,
    ],head,'Set starting poses for the next Experiment'));
  });

  it('rejects an origin draft after another edit changes the offset without changing the commit',async () => {
    const initial = experiment();
    const offsetCommit = vi.fn();
    const { rerenderPanel } = renderPanel(context(initial,{ editing:true,offsetCommit }));
    openWorldOrigin();
    fireEvent.change(coordinateAxis('origin','x'),{ target:{ value:'1.25' } });
    rerenderPanel(context(savedExperiment(initial,{ localizationOffset:{ x:9,y:0,z:0 } },'commit-1',1),{
      editing:true,offsetCommit,
    }));
    saveCoordinates('origin');
    await waitFor(() => expect(coordinateDrawer('origin')).toHaveTextContent(staleCoordinateDraft));
    expect(offsetCommit).not.toHaveBeenCalled();
    expect(coordinateAxis('origin','x')).toHaveValue(1.25);
  });

  it('advances the authoring baseline after its own save so the open origin drawer can save again',async () => {
    const initial = experiment();
    const offsetCommit = vi.fn()
      .mockImplementationOnce(async (offset) => savedExperiment(initial,{ localizationOffset:offset },'commit-2',2))
      .mockImplementationOnce(async (offset) => savedExperiment(initial,{ localizationOffset:offset },'commit-3',3));
    renderPanel(context(initial,{ offsetCommit }));
    openWorldOrigin();
    fireEvent.change(coordinateAxis('origin','x'),{ target:{ value:'1' } });
    saveCoordinates('origin');
    await waitFor(() => expect(offsetCommit).toHaveBeenCalledTimes(1));
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-save-receipt"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-save"][data-xgc-id="origin"]')?.closest('.xgc-drawer-header')).not.toBeNull();
    fireEvent.change(coordinateAxis('origin','x'),{ target:{ value:'2' } });
    saveCoordinates('origin');
    await waitFor(() => expect(offsetCommit).toHaveBeenNthCalledWith(2,
      { x:-2,y:0,z:0 },'commit-2','Update Experiment world origin offset from Config dashboard',
    ));
    expect(coordinateDrawer('origin')).not.toHaveTextContent(staleCoordinateDraft);
  });

  it('does not create a commit when explicitly saved starting poses already match',async () => {
    const { commit } = renderPanel(context(experiment([px4Binding()]),{ assets:[px4Asset()] }));
    fireEvent.click(screen.getByRole('button',{ name:'Simulation starting poses' }));
    const save = document.querySelector<HTMLButtonElement>('[data-xgc-role="experiment-coordinate-save"][data-xgc-id="starting-poses"]');
    expect(save).toBeEnabled();
    expect(save?.closest('.xgc-drawer-header')).not.toBeNull();
    saveCoordinates('starting-poses');
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-coordinate-error"]')).toBeNull();
      expect(save).toBeEnabled();
    });
    expect(commit).not.toHaveBeenCalled();
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-save-receipt"]')).toBeNull();
    expect(document.querySelector('.xgc-drawer-footer')).toBeNull();
  });

  it('places physical origin and simulation starting poses in distinct illustrated entries',() => {
    const { container,commit,offsetCommit } = renderPanel(context(experiment([px4Binding()]),{ assets:[px4Asset()] }));
    const starting = screen.getByRole('button',{ name:'Simulation starting poses' });
    const origin = screen.getByRole('button',{ name:'World origin offset' });
    const scene = container.querySelector('[data-xgc-role="experiment-robot-assets-coordinate-scene"][data-xgc-id="experiment"]');
    expect(scene).toContainElement(starting);
    expect(scene).toContainElement(origin);
    const fence = screen.getByRole('button',{ name:'World fence' });
    expect(scene).toContainElement(fence);
    expect(fence).toHaveTextContent('World fence');
    expect(fence.querySelector('img.experiment-coordinate-scene-art-image')).not.toBeNull();
    expect(starting).toHaveTextContent('Starting poses');
    expect(starting).toHaveTextContent('Physical tracking is unchanged.');
    expect(origin).toHaveTextContent('One shared reference for physical tracking.');
    expect(origin).not.toHaveTextContent('VRPN');
    expect(scene?.querySelector('[data-xgc-role="experiment-robot-assets-coordinate-kind"]')).toBeNull();
    const gallery = robotSelection('uav-01').closest('.experiment-robot-assets-panel-item-list');
    expect(scene?.compareDocumentPosition(gallery!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(starting.querySelector('svg')).not.toBeNull();
    expect(origin.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-robot-assets-list-toolbar"]')).toBeNull();
    fireEvent.click(fence);
    const fenceDrawer = document.querySelector('[data-xgc-role="experiment-world-fence-drawer"]');
    expect(fenceDrawer).not.toBeNull();
    expect(fenceDrawer).not.toHaveTextContent('All six endpoints are meters');
    expect(fenceDrawer).not.toHaveTextContent('No site defaults are supplied');
    expect(fenceDrawer).not.toHaveTextContent('Authoring port');
    expect(fenceDrawer).not.toHaveTextContent('Control fence · world');
    expect(fenceDrawer).not.toHaveTextContent('Leave unknown ground height blank');
    expect(fenceDrawer).not.toHaveTextContent('Actual ground height');
    expect(fenceDrawer).not.toHaveTextContent('Ground reference');
    expect(screen.getByRole('spinbutton',{ name:'X Minimum (m)' })).toHaveValue(null);
    expect(screen.getByRole('spinbutton',{ name:'Ground (m)' })).toHaveValue(null);
    fireEvent.click(origin);
    expect(coordinateDrawer('origin')).toHaveAccessibleName('World origin');
    expect(commit).not.toHaveBeenCalled();
    expect(offsetCommit).not.toHaveBeenCalled();
  });

  it('fills a blank world fence from the robot experiment and stores ground at zero', async () => {
    const document = experiment([px4Binding()]);
    document.spec.name = 'TASE-4UGVs';
    document.head.name = 'TASE-4UGVs';
    const fenceCommit = vi.fn(async (value: unknown) => ({
      ...document,
      spec: { ...document.spec, worldBoundary: value },
      branch: { ...document.branch, headCommitId: 'commit-fence', headVersion: 2 },
    }));
    renderPanel(context(document, { fenceCommit }));
    fireEvent.click(screen.getByRole('button', { name: 'World fence' }));
    expect(screen.getByRole('spinbutton', { name: 'X Minimum (m)' })).toHaveValue(-12);
    expect(screen.getByRole('spinbutton', { name: 'X Maximum (m)' })).toHaveValue(12);
    expect(screen.getByRole('spinbutton', { name: 'Y Minimum (m)' })).toHaveValue(-7);
    expect(screen.getByRole('spinbutton', { name: 'Y Maximum (m)' })).toHaveValue(7);
    expect(screen.getByRole('spinbutton', { name: 'Z Minimum (m)' })).toHaveValue(-1);
    expect(screen.getByRole('spinbutton', { name: 'Z Maximum (m)' })).toHaveValue(1);
    expect(screen.getByRole('spinbutton', { name: 'Ground (m)' })).toHaveValue(0);
    const xMinimum = screen.getByRole('spinbutton', { name: 'X Minimum (m)' });
    expect(xMinimum).toBeEnabled();
    expect(xMinimum.closest('fieldset')).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save for next start' })).not.toHaveAttribute('title', expect.stringMatching(/not connected/));
    await waitFor(() => expect(fenceCommit).toHaveBeenCalledWith(expect.objectContaining({
      groundZ: 0,
      controlBounds: { xMin: -12, xMax: 12, yMin: -7, yMax: 7, zMin: -1, zMax: 1 },
    }), 'commit-1', 'Update Experiment world fence'));
  });

  it('keeps starting poses available without runtime so the operator can define them directly',() => {
    const { commit } = renderPanel(context(experiment([px4Binding()]),{ assets:[px4Asset()] }));
    const entry = screen.getByRole('button',{ name:'Simulation starting poses' });
    expect(entry).toBeEnabled();
    expect(entry).not.toHaveAttribute('title',rosterEditLock);
    fireEvent.click(entry);
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-source-switcher"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-manual-robot"][data-xgc-id="px4-01"]'))
      .toHaveAttribute('aria-pressed','true');
    expect(coordinateAxis('px4-01','x')).toBeEnabled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('guides when the Experiment robots projection is absent',() => {
    renderPanel(context(undefined));
    expect(screen.getByText('Experiment unavailable')).toBeInTheDocument();
  });

  it('declares the Robot assets body interactive during Dashboard Edit',() => {
    expect(experimentRobotAssetsPanelPlugin.interactiveWhileEditing).toBe(true);
    expect(experimentRobotAssetsPanelPlugin.panelWorkflowControls).toBe('hidden');
    expect(experimentRobotAssetsPanelPlugin.headerStatus).toBeUndefined();
  });

  it('keeps the Robot assets frame body enabled while Dashboard Edit is open',() => {
    const { container } = renderPanel(context(experiment([px4Binding()]),{
      assets:[px4Asset()],editing:true,
    }));
    const frame = container.querySelector('[data-xgc-role="experiment-panel"]');
    expect(frame).toHaveAttribute('data-xgc-editing', 'true');
    expect(frame).toHaveAttribute('data-xgc-interactive-while-editing', 'true');
    expect(frame?.querySelector('.xgc-panel-frame-body')).not.toHaveAttribute('aria-disabled');
  });

  it('does not render Save or Discard in the Experiment Robots header or pane',() => {
    renderPanel(context(experiment([px4Binding()]),{ assets:[px4Asset(),scoutAsset()] }));
    expect(document.querySelector('[data-xgc-role="experiment-robot-assets-panel-save"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="experiment-robot-assets-panel-discard"]')).toBeNull();
    expect(screen.queryByRole('button',{ name:/^save$/i })).toBeNull();
    expect(screen.queryByRole('button',{ name:/discard/i })).toBeNull();
  });

  it('commits a catalog add through the authoring port while Edit mode is open without a panel Save click',async () => {
    const { container,commit } = renderPanel(context(experiment([px4Binding()]),{
      assets:[px4Asset(),scoutAsset()],editing:true,
    }));
    browseAssets();
    const rows = [...container.querySelectorAll('.experiment-robot-assets-panel-asset-card')];
    const add = screen.getByRole('button',{ name:'Add Scout Mini to Experiment' });
    fireEvent.click(add);
    await waitFor(() => expect(commit).toHaveBeenCalled());
    expect(commit).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ ref:expect.objectContaining({ resourceId:'uav-01' }) }),
        expect.objectContaining({
          id:'ugv-01',namespace:'/ugv1',
          ref:expect.objectContaining({ resourceId:'scout-1' }),
        }),
      ]),
      'commit-1',
      'Update Experiment Robots from Config dashboard',
    );
    const added = screen.getByRole('button',{ name:'Open Scout Mini settings' });
    expect(added).toBe(add);
    expect(added).toHaveAttribute('aria-current','true');
    expect(added.querySelector('.experiment-robot-assets-panel-asset-check')).toBeTruthy();
    expect([...container.querySelectorAll('.experiment-robot-assets-panel-asset-card')]).toEqual(rows);
    expect(screen.queryByDisplayValue('/ugv1')).toBeNull();
    expect(screen.getByRole('dialog',{ name:'Add robots' })).toBeVisible();
    added.focus();
    fireEvent.click(added);
    expect(screen.getByDisplayValue('/ugv1')).toBeVisible();
    expect(screen.getByRole('dialog',{ name:'Robot parameters' }).contains(document.activeElement)).toBe(true);
    expect(screen.queryByRole('dialog',{ name:'Add robots' })).toBeNull();
    expect(commit).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-xgc-role="experiment-robot-assets-panel-save"]')).toBeNull();
  });

  it('keeps the picker open for batch additions and queues the latest roster behind the first CAS',async () => {
    const document = experiment();
    let resolveFirst!: (saved: ExperimentDocument) => void;
    const commit = vi.fn()
      .mockImplementationOnce(() => new Promise<ExperimentDocument>((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(async (bindings: ExperimentRobotBinding[]) => savedExperiment(document,{ robots: bindings },'commit-3',3));
    const { container } = renderPanel(context(document,{
      assets:[px4Asset(1),px4Asset(2),scoutAsset()],editing:true,commit,
    }));
    browseAssets();
    const picker = pickerSearch(container);
    fireEvent.click(screen.getByRole('button',{ name:'Add FS150-01 to Experiment' }));
    expect(commit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button',{ name:'Add Scout Mini to Experiment' }));
    fireEvent.click(screen.getByRole('button',{ name:'Add FS150-02 to Experiment' }));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(pickerSearch(container)).toBe(picker);
    expect(screen.getByRole('dialog',{ name:'Add robots' })).toBeVisible();
    expect(container.querySelectorAll('[data-xgc-role="experiment-robot-assets-panel-robot"]')).toHaveLength(3);
    expect(screen.getAllByRole('button',{ name:/^Open .+ settings$/ })).toHaveLength(3);
    const firstBindings = commit.mock.calls[0][0] as ExperimentRobotBinding[];
    await act(async () => resolveFirst(savedExperiment(document,{ robots: firstBindings },'commit-2',2)));
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(2));
    expect(commit.mock.calls[1][1]).toBe('commit-2');
    expect((commit.mock.calls[1][0] as ExperimentRobotBinding[]).map((binding) => binding.ref.resourceId))
      .toEqual(['uav-01','uav-02','scout-1']);
    fireEvent.click(screen.getByRole('button',{ name:'Open Scout Mini settings' }));
    expect(screen.getByDisplayValue('/ugv1')).toBeVisible();
    expect(screen.queryByRole('dialog',{ name:'Add robots' })).toBeNull();
    expect(commit).toHaveBeenCalledTimes(2);
  });

  it('moves picker focus into the Robot parameters drawer and back to the selected Robot card',() => {
    const { container,commit } = renderPanel(context(experiment([px4Binding(),scoutBinding()]),{
      assets:[px4Asset(),scoutAsset()],
    }),'/uav1');
    browseAssets();
    const added = screen.getByRole('button',{ name:'Open Scout Mini settings' });
    added.focus();
    fireEvent.click(added);
    const drawer = screen.getByRole('dialog',{ name:'Robot parameters' });
    expect(drawer).toHaveAttribute('data-xgc-id','scout-1');
    expect(drawer.contains(document.activeElement)).toBe(true);
    expect(container.querySelector('[data-xgc-role="experiment-robot-assets-panel-current-robot"]')).toHaveTextContent('Scout Mini');
    fireEvent.click(screen.getByRole('button',{ name:'Close Robot parameters' }));
    expect(robotSelection('scout-1')).toHaveFocus();
    expect(commit).not.toHaveBeenCalled();
  });

  it('covers only the loading picker without visible helper text or shifting cached rows',() => {
    const document = experiment([px4Binding()]);
    const initial = context(document,{ assets:[px4Asset(),scoutAsset()],editing:true,assetLoading:true });
    const { container,commit,rerenderPanel } = renderPanel(initial);
    const robot = robotSelection('uav-01');
    browseAssets();
    const overlay = container.querySelector('[data-xgc-role="workspace-busy-overlay"][data-xgc-id="experiment-robot-assets-picker"]');
    const add = container.querySelector('[data-xgc-role="experiment-robot-asset-add"][data-xgc-id="scout-1"]');
    expect(overlay).toHaveAccessibleName('Loading assets');
    expect(overlay?.textContent).toBe('');
    expect(screen.queryByText(/Loading assets/)).toBeNull();
    expect(container.querySelector('.experiment-robot-assets-panel-picker-content')).toHaveAttribute('inert');
    expect(add).toBeDisabled();
    fireEvent.click(add!);
    expect(commit).not.toHaveBeenCalled();
    expect(robot).toBeEnabled();
    expect(robot).toBeVisible();
    expect(screen.getByRole('button',{ name:'Close drawer' })).toBeEnabled();

    rerenderPanel(context(document,{ assets:[px4Asset(),scoutAsset()],editing:true }));
    expect(container.querySelector('[data-xgc-role="workspace-busy-overlay"]')).toBeNull();
    expect(screen.getByRole('button',{ name:'Add Scout Mini to Experiment' })).toBe(add);
    expect(add).toBeEnabled();
    expect(robotSelection('uav-01')).toBe(robot);
    expect(pickerSearch(container)).toHaveFocus();
  });

  it('distinguishes a failed catalog request from an empty catalog and preserves the picker on recovery',() => {
    const document = experiment([px4Binding()]);
    const { container,rerenderPanel } = renderPanel(context(document,{ assetError:'Catalog request failed' }));
    browseAssets();
    const search = pickerSearch(container);
    const robot = robotSelection('uav-01');
    expect(screen.getByText('Unable to load Robot assets')).toBeVisible();
    expect(screen.queryByText('No Robot assets')).toBeNull();
    expect(screen.getByRole('button',{ name:'Close drawer' })).toBeEnabled();
    fireEvent.change(search,{ target:{ value:'Scout' } });
    rerenderPanel(context(document,{ assets:[px4Asset(),scoutAsset()],editing:true }));
    expect(screen.queryByText('Unable to load Robot assets')).toBeNull();
    expect(pickerSearch(container)).toBe(search);
    expect(search).toHaveValue('Scout');
    expect(robotSelection('uav-01')).toBe(robot);
    expect(screen.getByRole('button',{ name:'Add Scout Mini to Experiment' })).toBeEnabled();
    rerenderPanel(context(document));
    expect(screen.getByText('No Robot assets')).toBeVisible();
    expect(screen.queryByText('Unable to load Robot assets')).toBeNull();
  });

  it('parks an invalid Robot draft through the picker and restores the draft value and selection',async () => {
    const { container,commit } = renderPanel(context(experiment([px4Binding()]),{ assets:[px4Asset(),scoutAsset()] }));
    selectRobot('uav-01');
    const namespace = screen.getByRole('textbox',{ name:'ROS namespace' });
    fireEvent.change(namespace,{ target:{ value:'' } });
    expect(commit).not.toHaveBeenCalled();
    browseAssets();
    expect(screen.queryByRole('dialog',{ name:'Robot parameters' })).toBeNull();
    expect(robotSelection('uav-01')).toHaveAttribute('aria-pressed','true');
    expect(pickerSearch(container)).toHaveFocus();
    fireEvent.change(pickerSearch(container),{ target:{ value:'Scout' } });
    backToSettings();
    expect(screen.getByRole('dialog',{ name:'Robot parameters' }).contains(document.activeElement)).toBe(true);
    const restored = screen.getByRole('textbox',{ name:'ROS namespace' });
    expect(restored).toHaveValue('');
    expect(restored).toBeVisible();
    expect(robotSelection('uav-01')).toHaveAttribute('aria-pressed','true');
    expect(commit).not.toHaveBeenCalled();
    fireEvent.change(restored,{ target:{ value:'/uav9' } });
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
    browseAssets();
    expect(pickerSearch(container)).toHaveValue('Scout');
    backToSettings();
    expect(screen.getByRole('textbox',{ name:'ROS namespace' })).toHaveValue('/uav9');
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('preserves the Robot form while an origin draft waits for a pending save and is then reopened at its new commit',async () => {
    const document = experiment([px4Binding()]);
    let resolveRobot!: (saved: ExperimentDocument) => void;
    const commit = vi.fn(() => new Promise<ExperimentDocument>((resolve) => { resolveRobot = resolve; }));
    const offsetCommit = vi.fn(async (offset: unknown) => (
      savedExperiment(document,{
        localizationOffset:offset as ExperimentDocument['spec']['localizationOffset'],
      },'commit-3',3)
    ));
    renderPanel(context(document,{ assets:[px4Asset()],commit,offsetCommit }));
    selectRobot('uav-01');
    const namespace = screen.getByRole('textbox',{ name:'ROS namespace' });
    fireEvent.change(namespace,{ target:{ value:'/uav9' } });
    expect(commit).toHaveBeenCalledTimes(1);
    openWorldOrigin();
    expect(namespace).not.toBeVisible();
    const originX = coordinateAxis('origin','x');
    fireEvent.change(originX,{ target:{ value:'1.25' } });
    saveCoordinates('origin');
    await waitFor(() => expect(coordinateDrawer('origin')).toHaveTextContent('Wait for the current changes to finish saving.'));
    expect(offsetCommit).not.toHaveBeenCalled();
    expect(originX).toHaveValue(1.25);
    await act(async () => resolveRobot(savedExperiment(document,{
      robots:[{ ...px4Binding(),namespace:'/uav9' }],
    },'commit-2',2)));
    expect(coordinateAxis('origin','x')).toBe(originX);
    saveCoordinates('origin');
    await waitFor(() => expect(coordinateDrawer('origin')).toHaveTextContent(staleCoordinateDraft));
    expect(offsetCommit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{ name:'Close drawer' }));
    fireEvent.click(await screen.findByRole('button',{ name:'Discard changes' }));
    await waitFor(() => expect(globalThis.document.querySelector('[data-xgc-role="experiment-coordinate-drawer"]')).toBeNull());
    openWorldOrigin();
    fireEvent.change(coordinateAxis('origin','x'),{ target:{ value:'1.25' } });
    saveCoordinates('origin');
    await waitFor(() => expect(offsetCommit).toHaveBeenCalledWith(
      { x:-1.25,y:0,z:0 },'commit-2','Update Experiment world origin offset from Config dashboard',
    ));
    await waitFor(() => expect(screen.getByRole('button',{ name:'Close drawer' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button',{ name:'Close drawer' }));
    const restored = screen.getByRole('textbox',{ name:'ROS namespace' });
    expect(restored).toHaveValue('/uav9');
    expect(restored).toBeVisible();
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('keeps selected parameters mounted through Edit changes and reflects new authoring refusals',() => {
    const value = context(experiment([px4Binding()]),{ assets:[px4Asset(),scoutAsset()] });
    const { container,commit,rerenderPanel } = renderPanel(value);
    selectRobot('uav-01');
    const namespace = screen.getByRole('textbox',{ name:'ROS namespace' });
    rerenderPanel({ ...value,editing:true });
    expect(screen.getByRole('textbox',{ name:'ROS namespace' })).toBe(namespace);
    expect(robotSelection('uav-01')).toHaveAttribute('aria-pressed','true');
    browseAssets();
    const picker = pickerSearch(container);
    const add = screen.getByRole('button',{ name:'Add Scout Mini to Experiment' });
    expect(add).toBeEnabled();
    rerenderPanel({ ...value,disabledReason:runningLock });
    expect(pickerSearch(container)).toBe(picker);
    expect(add).toBeDisabled();
    fireEvent.click(add);
    backToSettings();
    expect(screen.getByRole('textbox',{ name:'ROS namespace' })).toHaveValue('/uav1');
    expect(screen.getByRole('textbox',{ name:'ROS namespace' })).toBeVisible();
    expect(commit).not.toHaveBeenCalled();
  });

  it('keeps roster gestures available in normal browsing so the domain can open its Edit draft',async () => {
    const { container,commit } = renderPanel(context(experiment([px4Binding()]),{
      assets:[px4Asset(),scoutAsset()],
    }));
    browseAssets();
    const add = screen.getByRole('button',{ name:'Add Scout Mini to Experiment' });
    const remove = container.querySelector<HTMLButtonElement>(
      '[data-xgc-role="experiment-robot-assets-panel-robot-remove"][data-xgc-id="uav-01"]',
    );
    expect(add).toBeEnabled();
    expect(remove).toBeEnabled();
    expect(commit).not.toHaveBeenCalled();
    fireEvent.click(add);
    await waitFor(() => expect(commit).toHaveBeenCalledOnce());
    expect((commit.mock.calls[0]?.[0] as ExperimentRobotBinding[]).map((binding) => binding.ref.resourceId))
      .toEqual(['uav-01','scout-1']);
  });

  it('forwards a removal from normal browsing to the existing domain authoring port',async () => {
    const { container,commit } = renderPanel(context(experiment([px4Binding()]),{
      assets:[px4Asset(),scoutAsset()],
    }));
    const remove = container.querySelector<HTMLButtonElement>(
      '[data-xgc-role="experiment-robot-assets-panel-robot-remove"][data-xgc-id="uav-01"]',
    );
    expect(remove).toBeEnabled();
    fireEvent.click(remove!);
    await waitFor(() => expect(commit).toHaveBeenCalled());
    expect(commit).toHaveBeenCalledWith([],'commit-1','Update Experiment Robots from Config dashboard');
  });

  it('persists and presents the UAV cluster before the shared UGV cluster',async () => {
    const { container,commit } = renderPanel(context(experiment([scoutBinding()]),{
      assets:[scoutAsset(),px4Asset(1),px4Asset(2)],editing:true,
    }));
    browseAssets();
    fireEvent.click(screen.getByRole('button',{ name:'Add FS150-01 to Experiment' }));

    await waitFor(() => expect(commit).toHaveBeenCalledOnce());
    const submitted = commit.mock.calls[0]?.[0] as ExperimentRobotBinding[];
    expect(submitted.map(({ id }) => id)).toEqual(['px4-01','scout-01']);
    expect(submitted.map(({ simulationSensors }) => simulationSensors)).toEqual([
      { simpleLidar:false },
      { simpleLidar:false },
    ]);
    expect([...container.querySelectorAll('[data-xgc-role="experiment-robot-assets-panel-robot"]')]
      .map((row) => row.getAttribute('data-xgc-id'))).toEqual(['uav-01','scout-1']);
  });

  it('projects an existing mixed roster as UAV slots followed by UGV slots',() => {
    const { container } = renderPanel(context(experiment([
      scoutBinding(),px4Binding(2),px4Binding(1),
    ]),{ assets:[scoutAsset(),px4Asset(1),px4Asset(2)] }));

    expect([...container.querySelectorAll('[data-xgc-role="experiment-robot-assets-panel-robot"]')]
      .map((row) => row.getAttribute('data-xgc-id'))).toEqual(['uav-01','uav-02','scout-1']);
  });

  it('persists parameter edits immediately',async () => {
    const { commit } = renderPanel(context(experiment([px4Binding()]),{ assets:[px4Asset(),scoutAsset()] }));
    selectRobot('uav-01');
    fireEvent.change(screen.getByDisplayValue('/uav1'),{ target:{ value:'/uav9' } });
    await waitFor(() => expect(commit).toHaveBeenCalled());
    expect(commit).toHaveBeenCalledWith(
      [expect.objectContaining({ id:'px4-01',namespace:'/uav9' })],
      'commit-1',
      'Update Experiment Robots from Config dashboard',
    );
  });

  it('returns from Added or the left Robot row to the same selected settings without persisting selection',async () => {
    const { container,commit } = renderPanel(context(experiment([px4Binding(),scoutBinding()]),{
      assets:[px4Asset(),scoutAsset()],
    }));
    selectRobot('uav-01');
    expect(screen.getByDisplayValue('/uav1')).toBeVisible();
    expect(robotSelection('uav-01')).toHaveAttribute('aria-pressed','true');
    browseAssets();
    const px4 = screen.getByRole('button',{ name:'Open FS150-01 settings' });
    const scout = screen.getByRole('button',{ name:'Open Scout Mini settings' });
    expect(px4).toHaveAttribute('aria-current','true');
    expect(scout).not.toHaveAttribute('aria-current');
    fireEvent.click(scout);
    expect(screen.getByDisplayValue('/ugv1')).toBeVisible();
    expect(robotSelection('scout-1')).toHaveAttribute('aria-pressed','true');
    expect(container.querySelector('[data-xgc-role="experiment-robot-assets-panel-current-robot"]')).toHaveTextContent('Scout Mini');
    expect(screen.queryByRole('dialog',{ name:'Add robots' })).toBeNull();
    browseAssets();
    expect(screen.getByRole('button',{ name:'Open Scout Mini settings' })).toHaveAttribute('aria-current','true');
    expect(screen.getByRole('button',{ name:'Open FS150-01 settings' })).not.toHaveAttribute('aria-current');
    selectRobot('uav-01');
    expect(screen.getByDisplayValue('/uav1')).toBeVisible();
    expect(screen.queryByRole('dialog',{ name:'Add robots' })).toBeNull();
    await Promise.resolve();
    expect(commit).not.toHaveBeenCalled();
  });

  it('shows asset-owned parameters as disabled controls with one explicit Robot asset link',() => {
    renderPanel(context(experiment([px4Binding()]),{ assets:[px4Asset(),scoutAsset()] }));
    selectRobot('uav-01');

    const assetParameters = document.querySelector(
      '[data-xgc-role="experiment-robot-assets-panel-asset-parameters"][data-xgc-id="uav-01"]',
    );
    expect(assetParameters?.tagName).toBe('SECTION');
    expect(assetParameters).not.toHaveAttribute('href');
    expect(assetParameters).toHaveTextContent('Asset parameters');
    expect(assetParameters).toHaveTextContent('MAV sys ID');
    expect(assetParameters).not.toHaveTextContent('Read only');
    const configure = assetParameters?.querySelector(
      '[data-xgc-role="experiment-robot-assets-panel-asset-configure"][data-xgc-id="uav-01"]',
    );
    expect(configure).toHaveAttribute('href','#/assets/robots/uav-01');
    expect(configure).toHaveAccessibleName('Configure FS150-01 Robot asset');
    const model = assetParameters?.querySelector(
      '[data-xgc-role="experiment-robot-assets-panel-asset-parameter"][data-xgc-id="model"]',
    );
    expect(model).toHaveClass('experiment-robot-assets-panel-field');
    expect(model).toHaveTextContent('Model');
    expect(model?.querySelector('input')).toHaveValue('FS150');
    expect(model?.querySelector('input')).toBeDisabled();
    const mavSystemId = assetParameters?.querySelector(
      '[data-xgc-role="experiment-robot-assets-panel-asset-parameter"][data-xgc-id="mav-system-id"] input',
    );
    expect(mavSystemId).toHaveValue('1');
    expect(mavSystemId).toBeDisabled();
    expect([...assetParameters!.querySelectorAll('input')]).not.toHaveLength(0);
    expect([...assetParameters!.querySelectorAll('input')].every((input) => input.disabled)).toBe(true);
    expect(document.querySelector('[data-xgc-role="experiment-robot-assets-panel-selected-asset"]')).toBeNull();
    expect(screen.getByRole('button',{ name:'FS150-01 — UAV-01' })).toBeInTheDocument();
    expect(screen.getByLabelText('Experiment slot')).toHaveValue('UAV-01');
    expect(screen.getByLabelText('Experiment slot')).toBeDisabled();
    expect(screen.getByDisplayValue('/uav1')).not.toBeDisabled();
    expect(document.querySelector('.xgc-notice')).toBeNull();
    expect(document.querySelector('[data-xgc-role="experiment-robot-assets-panel-notices"]')).toBeNull();
    expect(screen.queryByText(runningLock)).toBeNull();
  });

  it('disables catalog and parameter fields while running without a form Notice',() => {
    const { container,commit } = renderPanel(context(experiment([px4Binding()]),{
      assets:[px4Asset(),scoutAsset()],
      disabledReason:runningLock,
    }));
    selectRobot('uav-01');

    browseAssets();
    const add = screen.getByRole('button',{ name:'Add Scout Mini to Experiment' });
    expect(add).toBeDisabled();
    expect(add).toHaveAttribute('title',runningLock);
    fireEvent.click(add);
    selectRobot('uav-01');
    const namespace = screen.getByDisplayValue('/uav1');
    const assetParameters = container.querySelector(
      '[data-xgc-role="experiment-robot-assets-panel-asset-parameters"][data-xgc-id="uav-01"]',
    );
    expect(namespace).toBeVisible();
    expect(namespace).toBeDisabled();
    expect(namespace).toHaveAttribute('title',runningLock);
    expect([...assetParameters!.querySelectorAll('input')]).not.toHaveLength(0);
    expect([...assetParameters!.querySelectorAll('input')].every((input) => input.disabled)).toBe(true);
    const poseFields = container.querySelector(
      '[data-xgc-role="experiment-robot-assets-panel-pose-fields"][data-xgc-id="starting-pose"]',
    );
    expect(poseFields).not.toHaveTextContent(runningLock);
    expect(poseFields).toHaveAttribute('title',runningLock);
    expect(document.querySelector('.xgc-notice')).toBeNull();
    expect(screen.queryByText(runningLock)).toBeNull();
    fireEvent.change(namespace,{ target:{ value:'/uav9' } });
    expect(commit).not.toHaveBeenCalled();
  });

  it('makes the candidate itself the action and shows physical identity instead of Add subcontrols',() => {
    renderPanel(context(experiment([px4Binding()]),{ assets:[px4Asset(),scoutAsset()] }));
    browseAssets();
    const addCard = screen.getByRole('button',{ name:'Add Scout Mini to Experiment' });
    const addedCard = screen.getByRole('button',{ name:'Open FS150-01 settings' });
    expect(addCard).toHaveTextContent('192.0.2.10');
    expect(addCard).toHaveTextContent('Scout Mini');
    expect(addedCard).toHaveTextContent('192.0.2.1');
    expect(addedCard).toHaveTextContent('FS150');
    expect(addCard).not.toHaveTextContent(/Add|Added/);
    expect(addedCard).not.toHaveTextContent(/Add|Added/);
    expect(addCard.querySelector('button')).toBeNull();
    expect(addedCard.querySelector('.experiment-robot-assets-panel-asset-check')).toBeTruthy();
    expect(addCard.querySelector('.experiment-robot-assets-panel-asset-check')).toBeNull();
    expect(addCard).toHaveAttribute('data-xgc-role','experiment-robot-asset-add');
    expect(addCard).toHaveAttribute('data-xgc-id','scout-1');
  });

  it('keeps group Add robots entries in the gallery while the independent asset picker is open',() => {
    const { container } = renderPanel(context(experiment([px4Binding()]),{ assets:[px4Asset(),scoutAsset()] }));
    browseAssets();
    const assetItems = [...container.querySelectorAll('.experiment-robot-assets-panel-asset-card')];
    const robotItems = [...container.querySelectorAll('[data-xgc-role="experiment-robot-assets-panel-robot"]')];
    const lists = [...new Set([...assetItems,...robotItems].map((item) => item.parentElement))];

    expect(assetItems).toHaveLength(2);
    expect(robotItems).toHaveLength(1);
    expect(assetItems.every((item) => item.parentElement?.classList.contains('experiment-robot-assets-panel-item-list'))).toBe(true);
    expect(robotItems.every((item) => item.parentElement?.classList.contains('experiment-robot-assets-panel-item-list'))).toBe(true);
    expect(lists).toHaveLength(2);
    expect(lists[0]).not.toBe(lists[1]);
    const gallery = robotItems[0]?.parentElement;
    const addRobots = screen.getAllByRole('button',{ name:'Add robots' });
    expect(addRobots).toHaveLength(2);
    expect(gallery).toContainElement(addRobots[0]!);
    expect(gallery).toContainElement(addRobots[1]!);
    expect(gallery?.querySelector('[data-xgc-role="experiment-robot-assets-group"][data-xgc-id="uav"]'))
      .toContainElement(addRobots[0]!);
    expect(gallery?.querySelector('[data-xgc-role="experiment-robot-assets-group"][data-xgc-id="ugv"]'))
      .toContainElement(addRobots[1]!);
    expect(container.querySelector('[data-xgc-role="experiment-robot-assets-pane-header"][data-xgc-id="experiment"]')).toBeNull();
  });

  it('moves physical assignments between stable sequential slots',async () => {
    const first = px4Binding(1);
    const second = px4Binding(2);
    first.initialPose.x=1;second.initialPose.x=2;
    first.initialPose.yaw=0.25;second.initialPose.yaw=1.5;
    first.runtimeParameters={ camera_profile:'wide' };second.runtimeParameters={ camera_profile:'narrow' };
    const { container,commit } = renderPanel(context(experiment([first,second]),{
      assets:[px4Asset(1),px4Asset(2)],
    }));
    const firstRow = container.querySelector<HTMLElement>(
      '[data-xgc-role="experiment-robot-assets-panel-robot"][data-xgc-id="uav-01"]',
    );
    const secondRow = container.querySelector<HTMLElement>(
      '[data-xgc-role="experiment-robot-assets-panel-robot"][data-xgc-id="uav-02"]',
    );
    if (!firstRow || !secondRow) throw new Error('stable Robot reorder rows missing');
    const firstButton = robotSelection(first.ref.resourceId);
    const secondButton = robotSelection(second.ref.resourceId);
    expect(firstButton).toHaveAttribute('draggable','true');
    expect(secondButton).toHaveAttribute('draggable','true');

    const dataTransfer = {
      effectAllowed:'none',
      dropEffect:'none',
      types:['text/xgc-experiment-robot-assignment'],
      setData:vi.fn(),
      getData:(type:string) => type === 'text/xgc-experiment-robot-assignment' ? first.ref.resourceId : '',
    };
    fireEvent.dragStart(firstButton,{ dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/xgc-experiment-robot-assignment',first.ref.resourceId);
    expect(firstRow).toHaveAttribute('data-xgc-dragging','true');
    expect(secondButton).toHaveAttribute('title','Move FS150-01 to UAV-02');
    fireEvent.dragOver(secondButton,{ dataTransfer });
    expect(secondRow).toHaveAttribute('data-xgc-drop-target','true');
    fireEvent.drop(secondButton,{ dataTransfer });

    await waitFor(() => expect(commit).toHaveBeenCalledOnce());
    const [submitted,expectedCommitId,reason] = commit.mock.calls[0] ?? [];
    expect((submitted as ExperimentRobotBinding[]).map((binding) => ({
      id:binding.id,asset:binding.ref.resourceId,namespace:binding.namespace,x:binding.initialPose.x,
    }))).toEqual([
      { id:'px4-01',asset:'uav-02',namespace:'/uav1',x:1 },
      { id:'px4-02',asset:'uav-01',namespace:'/uav2',x:2 },
    ]);
    expect((submitted as ExperimentRobotBinding[]).map((binding) => ({ pose:binding.initialPose,parameters:binding.runtimeParameters }))).toEqual([
      { pose:first.initialPose,parameters:first.runtimeParameters },
      { pose:second.initialPose,parameters:second.runtimeParameters },
    ]);
    expect(expectedCommitId).toBe('commit-1');
    expect(reason).toBe('Reorder Experiment Robots from Config dashboard');
    expect([...container.querySelectorAll('[data-xgc-role="experiment-robot-assets-panel-robot"]')]
      .map((row) => row.getAttribute('data-xgc-id'))).toEqual(['uav-02','uav-01']);
  });

  it('restores the original assignments after the host discards an accepted same-head Edit draft',async () => {
    const original=experiment([px4Binding(1),px4Binding(2)]);
    const assets=[px4Asset(1),px4Asset(2)];
    let accepted=original;
    const commit=vi.fn(async (bindings:unknown) => {
      accepted={ ...original,spec:{ ...original.spec,robots:structuredClone(bindings as ExperimentRobotBinding[]) } };
      return accepted;
    });
    const { container,rerenderPanel }=renderPanel(context(original,{ assets,commit }));
    fireEvent.click(container.querySelector('[data-xgc-role="experiment-robot-assets-panel-robot-move-down"][data-xgc-id="uav-01"]')!);
    await waitFor(() => expect(commit).toHaveBeenCalledOnce());
    rerenderPanel(context(accepted,{ assets,commit,editing:true }));
    expect(robotSelection('uav-01')).toHaveAccessibleName('FS150-01 — UAV-02');
    rerenderPanel(context(original,{ assets,commit,editing:false }));
    expect(robotSelection('uav-01')).toHaveAccessibleName('FS150-01 — UAV-01');
    expect(robotSelection('uav-02')).toHaveAccessibleName('FS150-02 — UAV-02');
    expect(commit).toHaveBeenCalledOnce();
  });

  it('separates UAV and UGV collections with markable label rows and hover Add robots on each group',() => {
    const { container } = renderPanel(context(experiment([scoutBinding(),px4Binding(2),px4Binding(1)]),{
      assets:[px4Asset(1),px4Asset(2),scoutAsset()],
    }));
    const labels=[...container.querySelectorAll('[data-xgc-role="experiment-robot-assets-group-label"]')];
    expect(labels.map((label) => [label.getAttribute('data-xgc-id'),label.textContent])).toEqual([
      ['uav','UAV'],['ugv','UGV'],
    ]);
    const swarm=robotSelection('uav-01').closest('.experiment-robot-assets-panel-item-list')!;
    expect([...swarm.children].map((child) => child.getAttribute('data-xgc-id'))).toEqual([
      'uav','uav-01','uav-02','ugv','scout-1',
    ]);
    expect(screen.getAllByRole('button',{ name:'Add robots' })).toHaveLength(2);
    expect(container.querySelector('[data-xgc-role="experiment-robot-assets-browse"][data-xgc-id="uav"]')).toBeTruthy();
    expect(container.querySelector('[data-xgc-role="experiment-robot-assets-browse"][data-xgc-id="ugv"]')).toBeTruthy();
    expect(container.querySelector('[data-xgc-role="experiment-robot-assets-pane-title"][data-xgc-id="experiment"]')).toBeNull();
    const scout = robotSelection('scout-1');
    const assetName = scout.querySelector('.experiment-robot-assets-panel-assignment-name');
    const slotName = scout.querySelector('.experiment-robot-assets-panel-slot-name');
    const identity = scout.querySelector('.experiment-robot-assets-panel-robot-identity');
    expect(assetName).toHaveTextContent('Scout Mini');
    expect(assetName?.tagName).toBe('SPAN');
    expect(slotName?.tagName).toBe('SPAN');
    expect(slotName).toHaveTextContent('UGV-01');
    expect(identity?.firstElementChild).toBe(assetName);
    expect(assetName?.nextElementSibling).toBe(slotName);
    expect(scout).toHaveAccessibleName('Scout Mini — UGV-01');
  });

  it('rejects a physical UAV drop onto a UGV slot even when both groups are reorderable',() => {
    const scoutOne=scoutBinding();
    const scoutTwo={ ...scoutBinding(),id:'scout-2',namespace:'/ugv2',ref:{ ...scoutBinding().ref,resourceId:'scout-2' } };
    const secondScoutAsset={ ...scoutAsset(),head:{ ...scoutAsset().head,resourceId:'scout-2' } };
    const { commit } = renderPanel(context(experiment([px4Binding(1),px4Binding(2),scoutOne,scoutTwo]),{
      assets:[px4Asset(1),px4Asset(2),scoutAsset(),secondScoutAsset],editing:true,
    }));
    const uav=robotSelection('uav-01');
    const ugv=robotSelection('scout-1');
    expect(uav).toHaveAttribute('draggable','true');
    expect(ugv).toHaveAttribute('draggable','true');
    const dataTransfer={
      effectAllowed:'none',dropEffect:'none',types:['text/xgc-experiment-robot-assignment'],
      setData:vi.fn(),getData:vi.fn(() => 'uav-01'),
    };
    fireEvent.dragStart(uav,{ dataTransfer });
    fireEvent.dragOver(ugv,{ dataTransfer });
    expect(ugv.closest('article')).not.toHaveAttribute('data-xgc-drop-target');
    fireEvent.drop(ugv,{ dataTransfer });
    expect(commit).not.toHaveBeenCalled();
    expect(robotSelection('uav-01')).toHaveAccessibleName('FS150-01 — UAV-01');
  });

  it.each([
    ['while the Experiment is read only','This Experiment is read only.','This Experiment is read only.'],
    ['while the Edit draft is being saved','Wait for the current changes to finish saving.','Wait for the current changes to finish saving.'],
    ['while the Experiment is running',runningLock,runningLock],
  ] as const)('offers stable native move controls and locks every reorder path %s',(_state,lockReason,disabledReason) => {
    const { container,commit } = renderPanel(context(experiment([px4Binding(1),px4Binding(2)]),{
      assets:[px4Asset(1),px4Asset(2)],
      disabledReason,
    }));
    const uavRow = container.querySelector<HTMLElement>(
      '[data-xgc-role="experiment-robot-assets-panel-robot"][data-xgc-id="uav-01"]',
    );
    const moveDown = container.querySelector<HTMLButtonElement>(
      '[data-xgc-role="experiment-robot-assets-panel-robot-move-down"][data-xgc-id="uav-01"]',
    );
    const moveUp = container.querySelector<HTMLButtonElement>(
      '[data-xgc-role="experiment-robot-assets-panel-robot-move-up"][data-xgc-id="uav-02"]',
    );
    if (!uavRow || !moveDown || !moveUp) throw new Error('stable Robot reorder controls missing');
    const uavButton = robotSelection('uav-01');
    expect(uavButton).not.toHaveAttribute('draggable');
    expect(moveDown.tagName).toBe('BUTTON');
    expect(moveUp.tagName).toBe('BUTTON');
    expect(moveDown).toBeDisabled();
    expect(moveUp).toBeDisabled();
    expect(moveDown).toHaveAttribute('title',lockReason);
    expect(moveUp).toHaveAttribute('title',lockReason);
    const dataTransfer = {
      effectAllowed:'none',dropEffect:'none',types:['text/xgc-experiment-robot-assignment'],
      setData:vi.fn(),getData:vi.fn(() => px4Binding().ref.resourceId),
    };
    fireEvent.dragStart(uavButton,{ dataTransfer });
    fireEvent.dragOver(moveUp.closest('[data-xgc-role="experiment-robot-assets-panel-robot"]')!,{ dataTransfer });
    fireEvent.drop(moveUp.closest('[data-xgc-role="experiment-robot-assets-panel-robot"]')!,{ dataTransfer });
    expect(dataTransfer.setData).not.toHaveBeenCalled();
    fireEvent.click(moveDown);
    expect(commit).not.toHaveBeenCalled();
  });

  it('rolls back an optimistic asset reassignment when the existing Experiment CAS rejects it',async () => {
    const first = px4Binding(1);
    const second = px4Binding(2);
    const casError = 'The Experiment changed while its Robots were being updated.';
    const commit = vi.fn().mockRejectedValue(new Error(casError));
    const { container } = renderPanel(context(experiment([first,second]),{
      assets:[px4Asset(1),px4Asset(2)],
      commit,
      editing:true,
    }));
    const moveDown = container.querySelector<HTMLButtonElement>(
      '[data-xgc-role="experiment-robot-assets-panel-robot-move-down"][data-xgc-id="uav-01"]',
    );
    if (!moveDown) throw new Error('stable Robot move control missing');

    selectRobot('uav-01');
    fireEvent.click(moveDown);

    await waitFor(() => expect(commit).toHaveBeenCalledWith(
      [
        expect.objectContaining({ id:'px4-01',ref:expect.objectContaining({ resourceId:'uav-02' }) }),
        expect.objectContaining({ id:'px4-02',ref:expect.objectContaining({ resourceId:'uav-01' }) }),
      ],
      'commit-1',
      'Reorder Experiment Robots from Config dashboard',
    ));
    await waitFor(() => expect([...container.querySelectorAll(
      '[data-xgc-role="experiment-robot-assets-panel-robot"]',
    )].map((row) => row.getAttribute('data-xgc-id'))).toEqual(['uav-01','uav-02']));
    expect(robotSelection('uav-01')).toHaveAttribute('aria-pressed','true');
    expect(container.querySelector('[data-xgc-role="experiment-robot-assets-robot-inspector"]'))
      .toHaveAttribute('data-xgc-id','uav-01');
    expect(screen.getByRole('textbox',{ name:'ROS namespace' })).toHaveValue('/uav1');
    const error = container.querySelector('[data-xgc-role="experiment-robot-assets-panel-persist-error"]');
    expect(error).toHaveTextContent(casError);
    expect(error).toBeVisible();
    expect(container.querySelector('.experiment-robot-assets-panel-collection')).toContainElement(error as HTMLElement);
  });

  it('explains a selected known-disabled Robot while keeping the Experiment origin editable',() => {
    const { container,commit } = renderPanel(context(experiment([px4Binding(),unknownKindBinding()]),{
      assets:[px4Asset(),scoutAsset(),unknownKindAsset()],
    }));
    const enabled = document.querySelector('[data-xgc-role="experiment-robot-assets-panel-robot"]:not([data-xgc-state])');
    const disabled = document.querySelector('[data-xgc-role="experiment-robot-assets-panel-robot"][data-xgc-state="known-disabled"]');
    const copy = disabled?.querySelector('.experiment-robot-assets-panel-robot-copy');
    expect(disabled?.parentElement).toHaveClass('experiment-robot-assets-panel-item-list');
    expect(disabled?.parentElement).toBe(enabled?.parentElement);
    expect(disabled?.querySelector('.experiment-robot-assets-panel-robot-mark')).toBeTruthy();
    expect(copy?.querySelector('.experiment-robot-assets-panel-assignment-name')).toBeTruthy();
    expect(copy?.querySelector('.experiment-robot-assets-panel-robot-note'))
      .toHaveTextContent('Not enabled for Experiments');
    expect(copy?.querySelector('.experiment-robot-assets-panel-assignment-name')).toHaveTextContent('Inventory Robot');
    expect(copy).toHaveTextContent('Not enabled for Experiments');
    fireEvent.click(disabled!.querySelector('[data-xgc-role="experiment-robot-assets-panel-robot-select"]')!);
    expect(container.querySelector('[data-xgc-role="experiment-robot-admission-known-disabled"][data-xgc-id="parameters"]'))
      .toHaveTextContent('Robot not enabled for Experiments');
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-drawer"]')).toBeNull();
    openWorldOrigin();
    expect(coordinateAxis('origin','x')).toBeEnabled();
    expect(coordinateAxis('origin','x')).toBeVisible();
    expect(container.querySelector('[data-xgc-role="experiment-robot-assets-selection-empty"]')).toBeNull();
    expect(commit).not.toHaveBeenCalled();
  });

  it('keeps search only in the on-demand asset picker',() => {
    const { container } = renderPanel(context(experiment([px4Binding()]),{ assets:[px4Asset(),scoutAsset()] }));
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-robot-assets-panel-search"]')).toBeNull();
    browseAssets();
    const picker = pickerSearch(container);
    expect(picker).toHaveAccessibleName('Search assets');
    expect(picker).toBeVisible();
    expect(container.querySelectorAll('input[type="search"]')).toHaveLength(1);
    backToSettings();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('opens one candidate drawer without moving the assembly or overlapping coordinate settings',() => {
    const { container } = renderPanel(context(experiment([px4Binding()]),{
      assets:[px4Asset(),scoutAsset()],
    }));
    const workspace = container.querySelector<HTMLElement>('.experiment-robot-assets-panel-workspace')!;
    workspace.scrollTop=380;
    browseAssets();
    const picker = screen.getByRole('dialog',{ name:'Add robots' });
    expect(picker).toHaveAttribute('data-xgc-role','experiment-robot-assets-picker-drawer');
    expect(workspace).not.toContainElement(picker);
    expect(workspace.scrollTop).toBe(380);
    expect(container.querySelector('[data-xgc-role="experiment-robot-assets-detail"]')).toBeNull();
    openWorldOrigin();
    expect(screen.queryByRole('dialog',{ name:'Add robots' })).toBeNull();
    expect(coordinateDrawer('origin')).toBeVisible();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    browseAssets();
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-drawer"]')).toBeNull();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(workspace.scrollTop).toBe(380);
    backToSettings();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toHaveAttribute('data-xgc-role','experiment-robot-assets-browse');
  });

  it('releases the Add robots drawer from the empty backdrop, not from candidate cards',() => {
    renderPanel(context(experiment([px4Binding()]),{ assets:[px4Asset(),scoutAsset()] }));
    browseAssets();
    const picker = screen.getByRole('dialog',{ name:'Add robots' });
    const backdrop = picker.parentElement;
    expect(backdrop).toHaveClass('config-drawer-backdrop');
    fireEvent.mouseDown(picker);
    expect(screen.getByRole('dialog',{ name:'Add robots' })).toBeVisible();
    fireEvent.mouseDown(screen.getByRole('button',{ name:'Add Scout Mini to Experiment' }));
    expect(screen.getByRole('dialog',{ name:'Add robots' })).toBeVisible();
    fireEvent.mouseDown(backdrop!);
    expect(screen.queryByRole('dialog',{ name:'Add robots' })).toBeNull();
    expect(document.activeElement).toHaveAttribute('data-xgc-role','experiment-robot-assets-browse');
  });

  it('uses a compact swarm group label and names the selected Robot without adding nested workspace chrome', () => {
    const { container } = renderPanel(context(experiment([px4Binding()]),{ assets:[px4Asset(),scoutAsset()] }));
    expect(container.querySelector('[data-xgc-role="experiment-robot-assets-pane-header"][data-xgc-id="experiment"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-robot-assets-pane-header"][data-xgc-id="parameters"]')).toBeNull();
    const root = container.querySelector('[data-xgc-role="experiment-robot-assets"]');
    expect(root?.querySelector('.xgc-workspace-panel')).toBeNull();
    expect(root?.querySelector('[data-chrome]')).toBeNull();
    selectRobot('uav-01');
    const parametersDrawer = screen.getByRole('dialog',{ name:'Robot parameters' });
    expect(parametersDrawer).toBeVisible();
    expect(parametersDrawer.querySelectorAll('[data-xgc-role="experiment-robot-assets-pane-title"][data-xgc-id="parameters"]')).toHaveLength(1);
    expect(parametersDrawer.querySelector('[data-xgc-role="experiment-robot-assets-panel-current-robot"]'))
      .toHaveTextContent('FS150-01');
    browseAssets();
    const picker = screen.getByRole('dialog',{ name:'Add robots' });
    expect(picker.querySelectorAll('[data-xgc-role="experiment-robot-assets-pane-title"][data-xgc-id="assets"]')).toHaveLength(1);
    expect(picker.querySelector('[data-xgc-role="experiment-robot-assets-pane-header"][data-xgc-id="assets"]')).toBeNull();
    expect(screen.queryByRole('dialog',{ name:'Robot parameters' })).toBeNull();
    openWorldOrigin();
    expect(coordinateDrawer('origin')).toBeVisible();
    expect(picker).not.toBeInTheDocument();
  });

  it('filters only candidate assets while keeping the complete roster and Robot parameters available',() => {
    const { container,commit } = renderPanel(context(experiment([px4Binding(),scoutBinding()]),{ assets:[px4Asset(),scoutAsset()] }), 'no-such-robot');
    selectRobot('uav-01');
    expect(robotSelection('uav-01')).toBeVisible();
    expect(robotSelection('scout-1')).toBeVisible();
    expect(screen.getByLabelText('ROS namespace')).toHaveValue('/uav1');
    expect(container.querySelector('[data-xgc-role="experiment-robot-assets-panel-asset-parameters"][data-xgc-id="uav-01"]')).toBeVisible();
    browseAssets();
    const picker = pickerSearch(container);
    fireEvent.change(picker,{ target:{ value:'Scout' } });
    expect(screen.queryByRole('button',{ name:'Open FS150-01 settings' })).toBeNull();
    expect(robotSelection('uav-01')).toBeVisible();
    expect(robotSelection('scout-1')).toBeVisible();
    fireEvent.change(picker,{ target:{ value:'no-such-asset' } });
    expect(screen.getByText('No matching assets')).toBeVisible();
    fireEvent.keyDown(picker,{ key:'Escape' });
    expect(picker).toHaveValue('');
    expect(screen.queryByText('No matching assets')).toBeNull();
    backToSettings();
    expect(screen.getByLabelText('ROS namespace')).toHaveValue('/uav1');
    expect(container.querySelector('[data-xgc-role="experiment-robot-assets-panel-asset-parameters"][data-xgc-id="uav-01"]')).toBeVisible();
    expect(commit).not.toHaveBeenCalled();
  });

  it('does not let a legacy roster query disable moving fixed Robot assets between slots',async () => {
    const { container,commit } = renderPanel(context(experiment([px4Binding(1),px4Binding(2)]),{
      assets:[px4Asset(1),px4Asset(2)],editing:true,
    }),'no-such-robot');
    expect(robotSelection('uav-01')).toBeVisible();
    expect(robotSelection('uav-02')).toBeVisible();
    const move = container.querySelector('[data-xgc-role="experiment-robot-assets-panel-robot-move-down"][data-xgc-id="uav-01"]');
    expect(move).toBeEnabled();
    fireEvent.click(move!);
    await waitFor(() => expect(commit).toHaveBeenCalledOnce());
    expect((commit.mock.calls[0][0] as ExperimentRobotBinding[]).map((binding) => binding.ref.resourceId)).toEqual(['uav-02','uav-01']);
  });

  it('authors Position XYZ and yaw with Vector3Control in two columns and does not invent roll or pitch', async () => {
    const { container,commit } = renderPanel(context(experiment([px4Binding()]),{ assets:[px4Asset(),scoutAsset()] }));
    selectRobot('uav-01');
    const fields = container.querySelector(
      '[data-xgc-role="experiment-robot-assets-panel-pose-fields"][data-xgc-id="starting-pose"]',
    );
    const position = container.querySelector('[data-xgc-role="experiment-robot-assets-panel-pose-position"]');
    const orientation = container.querySelector('[data-xgc-role="experiment-robot-assets-panel-pose-attitude"]');
    const x = poseAxis(container, 'experiment-robot-assets-panel-pose-x');
    const y = poseAxis(container, 'experiment-robot-assets-panel-pose-y');
    const z = poseAxis(container, 'experiment-robot-assets-panel-pose-z');
    const yaw = poseAxis(container, 'experiment-robot-assets-panel-pose-yaw');
    expect(fields).toContainElement(position as HTMLElement);
    expect(fields).toContainElement(orientation as HTMLElement);
    expect(fields?.firstElementChild).toContainElement(position as HTMLElement);
    expect(fields?.lastElementChild).toContainElement(orientation as HTMLElement);
    expect(position).toContainElement(x);
    expect(position).toContainElement(y);
    expect(position).toContainElement(z);
    expect(orientation).toContainElement(yaw);
    expect(screen.getByText('Yaw')).toBeInTheDocument();
    expect(container.querySelector(
      '[data-xgc-role="experiment-robot-assets-panel-pose-position-label"][data-xgc-id="starting-pose"]',
    )).toHaveTextContent('Position');
    expect(container.querySelector(
      '[data-xgc-role="experiment-robot-assets-panel-pose-attitude-label"][data-xgc-id="starting-pose"]',
    )).toHaveTextContent('Yaw');
    expect(container.querySelector('[data-xgc-role="experiment-robot-assets-panel-pose-xyz"]')).toContainElement(x);
    expect(container.querySelector('[data-xgc-role="experiment-robot-assets-panel-pose-roll"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-robot-assets-panel-pose-pitch"]')).toBeNull();
    expect(screen.queryByLabelText('Roll (fixed at 0)')).toBeNull();
    expect(screen.queryByLabelText('Pitch (fixed at 0)')).toBeNull();
    expect(yaw).toHaveAttribute('aria-label', 'Yaw');

    fireEvent.change(x,{ target:{ value:'1.5' } });
    await waitFor(() => expect(commit).toHaveBeenCalled());
    expect(commit).toHaveBeenCalledWith(
      [expect.objectContaining({
        id:'px4-01',
        initialPose:expect.objectContaining({ x:1.5,y:0,z:0,yaw:0 }),
      })],
      'commit-1',
      'Update Experiment Robots from Config dashboard',
    );
    fireEvent.change(yaw,{ target:{ value:'0.25' } });
    await waitFor(() => expect(commit.mock.calls.at(-1)?.[0]).toEqual([
      expect.objectContaining({
        id:'px4-01',
        initialPose:{ x:1.5,y:0,z:0,yaw:0.25 },
      }),
    ]));
    expect(commit.mock.calls.at(-1)?.[2]).toBe('Update Experiment Robots from Config dashboard');
  });

  it('shows starting pose axes with at most two decimal places', () => {
    const precise = px4Binding();
    precise.initialPose = { x: 12.345678, y: -0.004, z: 0.181, yaw: 0.987654 };
    const { container } = renderPanel(context(experiment([precise]), { assets: [px4Asset()] }));
    fireEvent.click(container.querySelector('[data-xgc-role="experiment-robot-assets-panel-robot-select"][data-xgc-id="uav-01"]')!);
    expect(poseAxis(container, 'experiment-robot-assets-panel-pose-x')).toHaveValue(12.35);
    expect(poseAxis(container, 'experiment-robot-assets-panel-pose-y')).toHaveValue(0);
    expect(poseAxis(container, 'experiment-robot-assets-panel-pose-z')).toHaveValue(0.18);
    expect(poseAxis(container, 'experiment-robot-assets-panel-pose-yaw')).toHaveValue(0.99);
  });

  it('persists the FS150 front camera switch in the Experiment binding', async () => {
    const { commit } = renderPanel(context(experiment([px4Binding()]),{ assets:[px4Asset()] }));
    selectRobot('uav-01');
    const toggle = screen.getByRole('switch',{ name:'Simulate front camera' });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(commit.mock.calls.at(-1)?.[0]).toEqual([
      expect.objectContaining({ px4:{ imageSimulationEnabled:true } }),
    ]));
    fireEvent.click(toggle);
    await waitFor(() => expect(commit.mock.calls.at(-1)?.[0]).toEqual([
      expect.objectContaining({ px4:{} }),
    ]));
  });

  it.each(simpleLidarRobotCases())('saves the Simple lidar switch for $label in both states',async ({ binding,asset }) => {
    const { container,commit } = renderPanel(context(
      experiment([binding],{ asset:'gazebo-world',simulator:'gazebo' }),
      { assets:[asset] },
    ));
    selectRobot(binding.ref.resourceId);
    const toggle = screen.getByRole('switch',{ name:'Simple lidar' });
    expect(toggle).not.toBeChecked();
    const markableSwitch = container.querySelector(
      `[data-xgc-role="experiment-robot-assets-panel-simple-lidar"][data-xgc-id="${binding.ref.resourceId}"]`,
    );
    expect(markableSwitch).toContainElement(toggle);

    fireEvent.click(toggle);
    await waitFor(() => expect((commit.mock.calls.at(-1)?.[0] as ExperimentRobotBinding[])[0]?.simulationSensors)
      .toEqual({ simpleLidar:true }));
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);
    await waitFor(() => expect((commit.mock.calls.at(-1)?.[0] as ExperimentRobotBinding[])[0]?.simulationSensors)
      .toEqual({ simpleLidar:false }));
    expect(toggle).not.toBeChecked();
  });

  it.each(simpleLidarRobotCases())('hides Simple lidar for $label without a Gazebo scene',({ binding,asset }) => {
    const noScene = renderPanel(context(experiment([binding]),{ assets:[asset] }));
    selectRobot(binding.ref.resourceId);
    expect(screen.queryByRole('switch',{ name:'Simple lidar' })).toBeNull();
    noScene.unmount();

    const lightweight = renderPanel(context(
      experiment([binding],{ asset:'lightweight-world',simulator:'lightweight' }),
      { assets:[asset] },
    ));
    selectRobot(binding.ref.resourceId);
    expect(screen.queryByRole('switch',{ name:'Simple lidar' })).toBeNull();
    lightweight.unmount();
  });

  it('keeps all Parameters settings groups and field labels on the shared panel family',() => {
    const { container } = renderPanel(context(experiment([scoutBinding()]),{ assets:[scoutAsset()] }));
    selectRobot('scout-1');

    const panelRoot = container.querySelector('[data-xgc-role="experiment-robot-assets-robot-inspector"]');
    expect(panelRoot).toHaveClass('config-drawer-wide');
    const groupHeaders = [...panelRoot?.querySelectorAll(
      '[data-xgc-role="experiment-robot-assets-panel-settings-group-title"]',
    ) ?? []];
    expect(groupHeaders.map((header) => header.textContent?.trim())).toEqual([
      'Starting pose',
      'Experiment setup',
      'Simulated sensors',
      'Asset parameters',
    ]);

    const fieldLabels = [...panelRoot?.querySelectorAll(
      `.experiment-robot-assets-panel-field .xgc-form-field-label,
       .experiment-robot-assets-panel-pose-field .xgc-form-field-label`,
    ) ?? []];
    expect(fieldLabels.map((label) => label.textContent?.trim())).toEqual([
      'Position',
      'Yaw',
      'Experiment slot',
      'ROS namespace',
      'Hybrid source',
      'Radio link',
      'Remote IP',
      'Connector',
      'Telemetry',
      'Control local',
      'Mocap',
      'VRPN pose',
    ]);

    const switchLabels = [...panelRoot?.querySelectorAll('.experiment-robot-assets-panel-switches .xgc-boolean-title') ?? []];
    expect(switchLabels.map((label) => label.textContent?.trim())).toEqual([
      'Simulate LiDAR',
      'Simulate camera and depth',
    ]);
    expect(panelRoot?.querySelectorAll('[data-xgc-role="experiment-robot-assets-panel-settings-group"] p')).toHaveLength(0);
  });

  it('gives every Parameters field label the same markable leaf standing as MAV sys ID',() => {
    const { container } = renderPanel(context(experiment([px4Binding()]),{ assets:[px4Asset()] }));
    selectRobot('uav-01');

    const labels = [...container.querySelectorAll(
      '[data-xgc-role="experiment-robot-assets-robot-inspector"] .xgc-form-field-label',
    )];
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label.getAttribute('data-xgc-role') ?? '').toMatch(/-label$/);
      expect(label.getAttribute('data-xgc-id')).toBeTruthy();
    }
    expect(container.querySelector(
      '[data-xgc-role="experiment-robot-assets-panel-asset-parameter-label"][data-xgc-id="mav-system-id"]',
    )).toHaveTextContent('MAV sys ID');
    expect(container.querySelector(
      '[data-xgc-role="experiment-robot-assets-panel-slot-label"]',
    )).toHaveTextContent('Experiment slot');
    expect(container.querySelector(
      '[data-xgc-role="experiment-robot-assets-panel-ros-namespace-label"]',
    )).toHaveTextContent('ROS namespace');
    expect(container.querySelector(
      '[data-xgc-role="experiment-robot-assets-panel-hybrid-source-label"]',
    )).toHaveTextContent('Hybrid source');
    expect(container.querySelector(
      '[data-xgc-role="experiment-robot-assets-panel-pose-position-label"][data-xgc-id="starting-pose"]',
    )).toHaveTextContent('Position');
    expect(container.querySelector(
      '[data-xgc-role="experiment-robot-assets-panel-pose-attitude-label"][data-xgc-id="starting-pose"]',
    )).toHaveTextContent('Yaw');
    expect(container.querySelector(
      '[data-xgc-role="experiment-robot-assets-panel-settings-group-title"][data-xgc-id="experiment-setup"]',
    )).toHaveTextContent('Experiment setup');
    openWorldOrigin();
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-position"][data-xgc-id="origin"]'))
      .toContainElement(coordinateAxis('origin','x'));
  });

  it('authors the Experiment-global origin with an empty Robot roster through explicit next-start save',async () => {
    const { container,commit,offsetCommit } = renderPanel(context(experiment()));
    openWorldOrigin();
    const x = coordinateAxis('origin','x');
    expect(x).toBeVisible();
    expect(x).toBeEnabled();
    expect(x).toHaveAttribute('aria-label','X');
    expect(coordinateAxis('origin','y')).toHaveAttribute('aria-label','Y');
    expect(coordinateAxis('origin','z')).toHaveAttribute('aria-label','Z');
    expect(coordinateDrawer('origin')).toHaveAccessibleName('World origin');
    expect(container.querySelector('[data-xgc-role="experiment-robot-assets-panel-current-robot"]')).toBeNull();
    fireEvent.change(x,{ target:{ value:'1.25' } });
    fireEvent.change(coordinateAxis('origin','y'),{ target:{ value:'-2' } });
    fireEvent.change(coordinateAxis('origin','z'),{ target:{ value:'0.5' } });
    expect(offsetCommit).not.toHaveBeenCalled();
    saveCoordinates('origin');
    await waitFor(() => expect(offsetCommit).toHaveBeenCalledWith(
      { x:-1.25,y:2,z:-0.5 },'commit-1','Update Experiment world origin offset from Config dashboard',
    ));
    expect(commit).not.toHaveBeenCalled();
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-save-receipt"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-save"][data-xgc-id="origin"]')?.closest('.xgc-drawer-header')).not.toBeNull();
    fireEvent.click(screen.getByRole('button',{ name:'Close drawer' }));
    openWorldOrigin();
    expect(coordinateAxis('origin','x')).toHaveValue(1.25);
    expect(coordinateAxis('origin','y')).toHaveValue(-2);
    expect(coordinateAxis('origin','z')).toHaveValue(0.5);
  });

  it('suspends the Robot parameters drawer behind the independent origin drawer and restores its draft',() => {
    const { container } = renderPanel(context(experiment([px4Binding()]),{ assets:[px4Asset()] }));
    selectRobot('uav-01');
    const parametersDrawer = () => screen.queryByRole('dialog',{ name:'Robot parameters' });
    const pose = () => container.querySelector('[data-xgc-role="experiment-robot-assets-panel-pose-fields"][data-xgc-id="starting-pose"]');
    expect(parametersDrawer()).toBeVisible();
    expect(pose()).toBeVisible();
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-drawer"]')).toBeNull();
    openWorldOrigin();
    expect(coordinateDrawer('origin')).toBeVisible();
    expect(parametersDrawer()).toBeNull();
    expect(pose()).toBeNull();
    fireEvent.click(screen.getByRole('button',{ name:'Close drawer' }));
    expect(parametersDrawer()).toBeVisible();
    expect(screen.getByRole('textbox',{ name:'ROS namespace' })).toHaveValue('/uav1');
    expect(pose()).toBeVisible();
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-drawer"]')).toBeNull();
  });

  it('opens Robot parameters in the shared wide drawer that follows the selected Robot',() => {
    renderPanel(context(experiment([px4Binding(),scoutBinding()]),{ assets:[px4Asset(),scoutAsset()] }));
    selectRobot('uav-01');
    const inspector = screen.getByRole('dialog',{ name:'Robot parameters' });
    expect(inspector).toBeVisible();
    expect(inspector).toHaveClass('config-drawer-wide');
    expect(inspector).toHaveAttribute('data-xgc-id','uav-01');
    expect(robotSelection('scout-1')).toBeEnabled();
    selectRobot('scout-1');
    expect(screen.getAllByRole('dialog',{ name:'Robot parameters' })).toHaveLength(1);
    expect(screen.getByRole('dialog',{ name:'Robot parameters' })).toHaveAttribute('data-xgc-id','scout-1');
    expect(screen.getByRole('textbox',{ name:'ROS namespace' })).toHaveValue('/ugv1');
    expect(inspector.querySelector('[data-xgc-role="experiment-robot-assets-robot-parameters"] > header')).toBeNull();
    fireEvent.click(screen.getByRole('button',{ name:'Close Robot parameters' }));
    expect(screen.queryByRole('dialog',{ name:'Robot parameters' })).toBeNull();
    expect(robotSelection('scout-1')).toBeEnabled();
    expect(document.activeElement).toBe(robotSelection('scout-1'));
  });

  it('hides drawers while the Experiment route is parked and restores coordinate drafts and candidate search',() => {
    const value = context(experiment([px4Binding()]),{ assets:[px4Asset()] });
    const tree = (visible: boolean) => <ProductRouteVisibilityProvider visible={visible}>
      <ExperimentRobotAssetsPanel panel={panel()} context={value} />
    </ProductRouteVisibilityProvider>;
    const { container,rerender } = render(tree(true));
    selectRobot('uav-01');
    const parametersDrawer = () => screen.queryByRole('dialog',{ name:'Robot parameters' });
    expect(parametersDrawer()).toBeVisible();
    rerender(tree(false));
    expect(parametersDrawer()).toBeNull();
    rerender(tree(true));
    expect(parametersDrawer()).toBeVisible();
    expect(screen.getByRole('textbox',{ name:'ROS namespace' })).toHaveValue('/uav1');
    openWorldOrigin();
    expect(parametersDrawer()).toBeNull();
    expect(coordinateDrawer('origin')).toBeVisible();
    fireEvent.change(coordinateAxis('origin','x'),{ target:{ value:'12.5' } });
    rerender(tree(false));
    expect(document.querySelector('[data-xgc-role="experiment-coordinate-drawer"]')).toBeNull();
    expect(parametersDrawer()).toBeNull();
    rerender(tree(true));
    expect(coordinateAxis('origin','x')).toHaveValue(12.5);
    browseAssets();
    fireEvent.change(pickerSearch(container),{ target:{ value:'FS150' } });
    rerender(tree(false));
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(tree(true));
    expect(screen.getByRole('dialog',{ name:'Add robots' })).toBeVisible();
    expect(pickerSearch(container)).toHaveValue('FS150');
  });

});

describe('ExperimentRobotAssetsPanel Robot source labels',() => {
  beforeEach(() => {
    getExperimentAtCommit.mockReset();
    getExperimentAtCommit.mockRejectedValue(new Error('Experiment commits unavailable'));
  });

  it('shows the selected pure mode above every portrait without hover, ignoring authored hybridSource',() => {
    renderPanel(context(experiment([px4Binding(),scoutBinding()]),{
      assets:[px4Asset(),scoutAsset()],selectedRunMode:'simulation',
    }));
    // px4Binding authors a physical hybridSource; the pure selected mode covers it.
    const uav = robotSourceLabel('uav-01');
    expect(uav).toHaveTextContent('Simulation');
    expect(uav).not.toHaveTextContent('source');
    expect(uav).toHaveAttribute('data-xgc-source','simulation');
    expect(uav.querySelector('[data-xgc-role="experiment-robot-assets-panel-robot-source-next"]')).toBeNull();
    expect(robotSourceLabel('scout-1')).toHaveTextContent('Simulation');
    expect(robotSourceLabel('scout-1')).not.toHaveTextContent('source');
    const select = robotSelection('uav-01');
    expect(select.firstElementChild).toBe(uav);
    expect(uav.nextElementSibling).toHaveClass('experiment-robot-assets-panel-robot-mark');
  });

  it('shows per-slot draft sources when the selected mode is hybrid',() => {
    renderPanel(context(experiment([px4Binding(),scoutBinding()]),{
      assets:[px4Asset(),scoutAsset()],selectedRunMode:'hybrid',
    }));
    expect(robotSourceLabel('uav-01')).toHaveTextContent('Physical');
    expect(robotSourceLabel('uav-01')).not.toHaveTextContent('source');
    expect(robotSourceLabel('uav-01')).toHaveAttribute('data-xgc-source','physical');
    expect(robotSourceLabel('scout-1')).toHaveTextContent('Simulation');
  });

  it('marks the source undetermined when the host offers no mode evidence',() => {
    renderPanel(context(experiment([px4Binding()]),{ assets:[px4Asset()] }));
    expect(robotSourceLabel('uav-01')).toHaveTextContent('Source undetermined');
    expect(robotSourceLabel('uav-01')).toHaveAttribute('data-xgc-source','unknown');
  });

  it('reads the running Session frozen commit and only flags a real draft difference',async () => {
    getExperimentAtCommit.mockResolvedValue(experiment([{ ...px4Binding(),hybridSource:'simulation' }]));
    renderPanel(context(experiment([px4Binding()]),{
      assets:[px4Asset()],
      runningSession:{ runMode:'hybrid',commitId:'commit-0',digest:'d'.repeat(64) },
    }));
    const label = robotSourceLabel('uav-01');
    expect(label).toHaveTextContent('Source undetermined');
    await waitFor(() => expect(label).toHaveTextContent('Simulation'));
    expect(label).toHaveAttribute('data-xgc-source','simulation');
    expect(getExperimentAtCommit).toHaveBeenCalledWith(
      'experiment-a','commit-0',expect.any(AbortSignal),expect.anything(),
    );
    const next = label.querySelector('[data-xgc-role="experiment-robot-assets-panel-robot-source-next"]');
    expect(next).toHaveTextContent('Next start: Physical');
  });

  it('keeps a replaced asset unknown instead of inheriting the frozen slot source',async () => {
    getExperimentAtCommit.mockResolvedValue(experiment([{
      ...px4Binding(),ref:{ domain:'robot',resourceId:'uav-02',branch:'main' },
    }]));
    renderPanel(context(experiment([px4Binding()]),{
      assets:[px4Asset()],
      runningSession:{ runMode:'hybrid',commitId:'commit-0',digest:'d'.repeat(64) },
    }));
    const label = robotSourceLabel('uav-01');
    await waitFor(() => expect(getExperimentAtCommit).toHaveBeenCalledOnce());
    await waitFor(() => expect(label).toHaveAttribute('data-xgc-source','unknown'));
    expect(label).toHaveTextContent('Source undetermined');
    expect(label).toHaveTextContent('Next start: Physical');
  });

  it('keeps card selection working with the source line present',() => {
    renderPanel(context(experiment([px4Binding()]),{ assets:[px4Asset()],selectedRunMode:'physical' }));
    expect(robotSourceLabel('uav-01')).toHaveTextContent('Physical');
    selectRobot('uav-01');
    expect(screen.getByRole('textbox',{ name:'ROS namespace' })).toBeEnabled();
    expect(robotSelection('uav-01')).toHaveAttribute('aria-pressed','true');
  });
});

function robotSourceLabel(resourceId: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    `[data-xgc-role="experiment-robot-assets-panel-robot-source"][data-xgc-id="${resourceId}"]`,
  );
  if (!element) throw new Error(`Robot source ${resourceId} missing`);
  return element;
}

function robotSelection(resourceId: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    `[data-xgc-role="experiment-robot-assets-panel-robot-select"][data-xgc-id="${resourceId}"]`,
  );
  if (!button) throw new Error(`Robot selection ${resourceId} missing`);
  return button;
}

function selectRobot(resourceId: string) {
  fireEvent.click(robotSelection(resourceId));
}

function browseAssets() {
  fireEvent.click(document.querySelector('[data-xgc-role="experiment-robot-assets-browse"]')!);
}

function backToSettings() {
  fireEvent.click(screen.getByRole('button',{ name:'Close drawer' }));
}

function openWorldOrigin() {
  fireEvent.click(screen.getByRole('button',{ name:'World origin offset' }));
}

function coordinateDrawer(view: 'origin' | 'starting-poses'): HTMLElement {
  const drawer = document.querySelector<HTMLElement>(`[data-xgc-role="experiment-coordinate-drawer"][data-xgc-id="${view}"]`);
  if (!drawer) throw new Error(`coordinate drawer ${view} missing`);
  return drawer;
}

function coordinateAxis(id: string,axis: 'x' | 'y' | 'z'): HTMLInputElement {
  const group = document.querySelector(`[data-xgc-role="experiment-coordinate-position"][data-xgc-id="${id}"]`);
  const input = group?.querySelector<HTMLInputElement>(`input[aria-label="${axis.toUpperCase()}"]`);
  if (!input) throw new Error(`coordinate ${id}:${axis} missing`);
  return input;
}

function saveCoordinates(view: 'origin' | 'starting-poses') {
  const button = document.querySelector<HTMLButtonElement>(`[data-xgc-role="experiment-coordinate-save"][data-xgc-id="${view}"]`);
  if (!button) throw new Error(`coordinate save ${view} missing`);
  fireEvent.click(button);
}

function pickerSearch(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(
    '[data-xgc-role="experiment-robot-assets-picker-search"][data-xgc-id="assets"] input',
  );
  if (!input) throw new Error('asset picker search missing');
  return input;
}

function poseAxis(container: HTMLElement, role: string): HTMLInputElement {
  const root = container.querySelector(`[data-xgc-role="${role}"]`);
  const input = root instanceof HTMLInputElement
    ? root
    : root?.querySelector('input');
  if (!(input instanceof HTMLInputElement)) throw new Error(`${role} input missing`);
  return input;
}

function renderPanel(value:PanelPluginContext<readonly ['experiment','automation']>,legacySearch = '') {
  const commit = vi.mocked(robotsEditorCommit(value));
  const offsetCommit = vi.mocked(offsetEditorCommit(value));
  const item = panel();
  item.query = { search:legacySearch };
  const tree = (current: typeof value) => (
    <PanelFrame
      panel={item}
      selected={false}
      editing={current.editing}
      interactiveWhileEditing={experimentRobotAssetsPanelPlugin.interactiveWhileEditing}
      onSelect={vi.fn()}
    >
      <ExperimentRobotAssetsPanel panel={item} context={current} />
    </PanelFrame>
  );
  const view = render(tree(value));
  return { ...view,commit,offsetCommit,rerenderPanel: (current: typeof value) => view.rerender(tree(current)) };
}

function robotsEditorCommit(value:PanelPluginContext<readonly ['experiment','automation']>) {
  const commit = value.ports.authoring['robots-editor']?.commit;
  if (!commit) throw new Error('robots-editor commit missing');
  return commit;
}

function offsetEditorCommit(value:PanelPluginContext<readonly ['experiment','automation']>) {
  const commit = value.ports.authoring['world-origin-offset-editor']?.commit;
  if (!commit) throw new Error('world-origin-offset-editor commit missing');
  return commit;
}

function context(document?:ExperimentDocument, extras:{
  assets?:RobotAssetDocument[];
  assetLoading?:boolean;
  assetError?:string;
  disabledReason?:string;
  runtimeActive?:boolean;
  selectedRunMode?:string;
  runningSession?:{ runMode:string; commitId:string; digest:string };
  editing?:boolean;
  commit?: (value:unknown,expectedCommitId:string,reason?:string) => Promise<unknown>;
  offsetCommit?: (value:unknown,expectedCommitId:string,reason?:string) => Promise<unknown>;
  fenceCommit?: (value:unknown,expectedCommitId:string,reason?:string) => Promise<unknown>;
  sceneCommit?: (value:unknown,expectedCommitId:string,reason?:string) => Promise<unknown>;
  sceneConnected?: boolean;
} = {}):PanelPluginContext<readonly ['experiment','automation']> {
  const commit = extras.commit ?? vi.fn(async (bindings:unknown,_expectedCommitId:string,_reason?:string) => {
    if (!document) return document;
    return {
      ...document,
      spec:{ ...document.spec,robots:structuredClone(bindings) as ExperimentRobotBinding[] },
      branch:{
        ...document.branch,
        headCommitId:`${document.branch.headCommitId}-saved`,
        headVersion:document.branch.headVersion + 1,
      },
    };
  });
  const offsetCommit = extras.offsetCommit ?? vi.fn(async (offset:unknown,_expectedCommitId:string,_reason?:string) => {
    if (!document) return document;
    return {
      ...document,
      spec:{ ...document.spec,localizationOffset:structuredClone(offset) as ExperimentDocument['spec']['localizationOffset'] },
      branch:{
        ...document.branch,
        headCommitId:`${document.branch.headCommitId}-offset`,
        headVersion:document.branch.headVersion + 1,
      },
    };
  });
  const runtimeValue = extras.runtimeActive || extras.selectedRunMode !== undefined || extras.runningSession ? {
    targetId:'local',activeRuns:[],processInstances:[],documents:[],catalog:[],runSummaries:[],runDetailsById:{},loading:false,error:'',
    ...(extras.selectedRunMode !== undefined ? { selectedRunMode:extras.selectedRunMode } : {}),
    sessionViews:extras.runningSession ? [{
      session:{
        id:'session-1',targetId:'local',experimentResourceId:document?.head.resourceId ?? '',
        experimentCommitId:extras.runningSession.commitId,experimentDigest:extras.runningSession.digest,
        state:'active',mode:'full',runMode:extras.runningSession.runMode,revision:1,
      },
      members:[{
        id:'member-1',targetId:'local',sessionId:'session-1',bindingId:'panel-robot-instruments',kind:'workflow_run',
        ownerId:'robot-runtime-run',status:'running',revision:1,
      }],
    }] : extras.runtimeActive ? [{ session:{ id:'session-1',targetId:'local',state:'active' },members:[{
      id:'member-1',targetId:'local',sessionId:'session-1',bindingId:'panel-robot-instruments',kind:'workflow_run',
      ownerId:'robot-runtime-run',status:'running',revision:1,
    }] }] : [],
  } : undefined;
  return { editing:extras.editing === true,ports:{
    actions:{},
    data:{
      robots:{ id:'robots',label:'Robots',contract:'experiment.robots.v1',connected:Boolean(document),value:document,trace:{} },
      'robot-assets':{
        id:'robot-assets',label:'Robot assets',contract:'robot.assets.v1',connected:true,
        value:{ assets:extras.assets ?? [],loading:extras.assetLoading ?? false,error:extras.assetError ?? '' },trace:{},
      },
      'robot-runtime':{
        id:'robot-runtime',label:'Experiment runtime',contract:'experiment.runtime.v1',connected:Boolean(runtimeValue),
        value:runtimeValue,
        trace:{ projection:'experiment.runtime.v1' },
      },
    },
    authoring:{
      'robots-editor':{
        id:'robots-editor',label:'Robots editor',connected:true,
        disabledReason:extras.disabledReason ?? '',
        value:document?.spec.robots,
        commit,
        trace:{ target:'experiment.robots' },
      },
      'world-origin-offset-editor':{
        id:'world-origin-offset-editor',label:'World origin offset',connected:true,
        disabledReason:extras.disabledReason ?? '',
        value:document?.spec.localizationOffset,
        commit:offsetCommit,
        trace:{ target:'experiment.localizationOffset' },
      },
      'scene-editor':{
        id:'scene-editor',label:'Scene',connected:extras.sceneConnected ?? Boolean(extras.sceneCommit),
        disabledReason:(extras.sceneConnected ?? Boolean(extras.sceneCommit)) ? '' : 'Authoring port "Scene" is not connected.',
        value:document?.spec.scene,
        commit:extras.sceneCommit ?? vi.fn(async () => undefined),
        trace:{ target:'experiment.scene' },
      },
      ...(extras.fenceCommit ? {
        'world-boundary-editor':{
          id:'world-boundary-editor',label:'World fence',connected:true,
          disabledReason:extras.disabledReason ?? '',
          value:document?.spec.worldBoundary,
          commit:extras.fenceCommit,
          trace:{ target:'experiment.worldBoundary' },
        },
      } : {}),
    },interactions:{},
  },executionTargetId:'local' };
}

function panel():PanelInstance {
  return { id:'robot-assets',pluginId:EXPERIMENT_ROBOT_ASSETS_PANEL_ID,title:'Robot assets',gridPos:{ x:0,y:0,w:30,h:16 },query:{},options:{ dashboard:'config',gridColumns:30 },fieldConfig:{},portBindings:[] };
}

function experiment(robots:ExperimentRobotBinding[] = [],scene?:ExperimentScene):ExperimentDocument {
  const now='2026-01-01T00:00:00Z';
  return {
    head:{ domain:'experiment',resourceId:'experiment-a',name:'Experiment',tags:[],mainCommitId:'commit-1',currentVersion:1,digest:'d'.repeat(64),revision:1,createdAt:now,updatedAt:now },
    branch:{ domain:'experiment',resourceId:'experiment-a',name:'main',headCommitId:'commit-1',headVersion:1,revision:1,createdAt:now,updatedAt:now },
    spec:newExperimentSpec({ name:'Experiment',robots,...(scene ? { scene } : {}) }),
  };
}

function savedExperiment(
  document: ExperimentDocument,
  spec: Partial<ExperimentDocument['spec']>,
  headCommitId: string,
  headVersion: number,
): ExperimentDocument {
  return {
    ...document,
    spec:{ ...document.spec,...structuredClone(spec) },
    branch:{ ...document.branch,headCommitId,headVersion },
  };
}

function px4Binding(sequence = 1):ExperimentRobotBinding {
  const suffix=String(sequence).padStart(2,'0');
  return {
    id:`px4-${suffix}`,
    ref:{ domain:'robot',resourceId:`uav-${suffix}`,branch:'main' },
    namespace:`/uav${sequence}`,
    hybridSource:'physical',
    runtimeParameters:{},
    initialPose:{ x:0,y:0,z:0,yaw:0 },
    simulationSensors:{ simpleLidar:false },
    px4:{},
  };
}

function scoutBinding():ExperimentRobotBinding {
  return {
    id:'scout-01',
    ref:{ domain:'robot',resourceId:'scout-1',branch:'main' },
    namespace:'/ugv1',
    hybridSource:'simulation',
    runtimeParameters:{ controller:'leader' },
    initialPose:{ x:2,y:3,z:0.181,yaw:0.5 },
    simulationSensors:{ simpleLidar:false },
    scout:{ lidarSimulationEnabled:true,imageSimulationEnabled:false },
  };
}

function mecanumBinding():ExperimentRobotBinding {
  return {
    id:'mecanum-01',
    ref:{ domain:'robot',resourceId:'mecanum-1',branch:'main' },
    namespace:'/ugv2',
    hybridSource:'physical',
    runtimeParameters:{},
    initialPose:{ x:0,y:0,z:0.28,yaw:0 },
    simulationSensors:{ simpleLidar:false },
    mecanum:{},
  };
}

function simpleLidarRobotCases() {
  return [
    { label:'FS150',binding:px4Binding(),asset:px4Asset() },
    { label:'Scout',binding:scoutBinding(),asset:scoutAsset() },
    { label:'Mecanum',binding:mecanumBinding(),asset:mecanumAsset() },
  ];
}

function px4Asset(sequence = 1):RobotAssetDocument {
  const suffix=String(sequence).padStart(2,'0');
  const resourceId=`uav-${suffix}`;
  return {
    head:{
      domain:'robot',resourceId,name:`FS150-${suffix}`,tags:[],mainCommitId:`${resourceId}-commit`,
      currentVersion:1,digest:resourceId,revision:1,createdAt:'',updatedAt:'',
    },
    branch:{
      domain:'robot',resourceId,name:'main',headCommitId:`${resourceId}-commit`,
      headVersion:1,revision:1,createdAt:'',updatedAt:'',
    },
    spec:{
      kind:'px4_multirotor',name:`FS150-${suffix}`,description:'',tags:[],profileId:'px4.profile',
      px4:{
        modelId:'fs150',mavSystemId:sequence,managementIp:`192.0.2.${sequence}`,sshUsername:'robot',sshPassword:'secret',
        mocapRigidBodyName:`uav-${suffix}`,physicalMavrosLocalPort:9009+sequence,physicalFcuRemotePort:14560,
        simulationLocalPort:14539+sequence,simulationRemotePort:14579+sequence,
        simulation:{ productId:'px4',launchPackage:'px4',launchFile:'sitl.launch' },
      },
    },
  };
}

function scoutAsset():RobotAssetDocument {
  return {
    head:{
      domain:'robot',resourceId:'scout-1',name:'Scout Mini',tags:[],mainCommitId:'scout-1-commit',
      currentVersion:1,digest:'scout-1',revision:1,createdAt:'',updatedAt:'',
    },
    branch:{
      domain:'robot',resourceId:'scout-1',name:'main',headCommitId:'scout-1-commit',
      headVersion:1,revision:1,createdAt:'',updatedAt:'',
    },
    spec:{
      kind:'scout_mini',name:'Scout Mini',description:'',tags:[],profileId:'scout.profile',
      scout:{
        managementAddress:'192.0.2.10',connector:'swarm_ros_bridge',
        sshUsername:'wheeltec',sshPassword:'dongguan',
        telemetryRemotePort:3001,controlLocalPort:3001,mocapRigidBodyName:'scout-1',
        simulation:{ productId:'scout',launchPackage:'scout',launchFile:'spawn.launch' },
      },
    },
  };
}

function mecanumAsset():RobotAssetDocument {
  return {
    head:{
      domain:'robot',resourceId:'mecanum-1',name:'Mecanum',tags:[],mainCommitId:'mecanum-1-commit',
      currentVersion:1,digest:'mecanum-1',revision:1,createdAt:'',updatedAt:'',
    },
    branch:{
      domain:'robot',resourceId:'mecanum-1',name:'main',headCommitId:'mecanum-1-commit',
      headVersion:1,revision:1,createdAt:'',updatedAt:'',
    },
    spec:{
      kind:'mecanum_ugv',name:'Mecanum',description:'',tags:['ugv'],profileId:'mecanum-ugv.ros1.v3',
      mecanum:{
        managementAddress:'192.0.2.20',connector:'swarm_ros_bridge',sshUsername:'wheeltec',sshPassword:'secret',
        telemetryRemotePort:3001,controlLocalPort:3002,mocapRigidBodyName:'mecanum-1',
        simulation:{ productId:'mecanum-sim',launchPackage:'mecanum_sim',launchFile:'spawn.launch' },
      },
    },
  };
}

function unknownKindBinding():ExperimentRobotBinding {
  return {
    id:'inventory-1',
    ref:{ domain:'robot',resourceId:'inventory-1',branch:'main' },
    namespace:'/inventory1',
    hybridSource:'physical',
    runtimeParameters:{},
    initialPose:{ x:0,y:0,z:0,yaw:0 },
  };
}

function unknownKindAsset():RobotAssetDocument {
  return {
    head:{
      domain:'robot',resourceId:'inventory-1',name:'Inventory Robot',tags:[],mainCommitId:'inventory-1-commit',
      currentVersion:1,digest:'inventory-1',revision:1,createdAt:'',updatedAt:'',
    },
    branch:{
      domain:'robot',resourceId:'inventory-1',name:'main',headCommitId:'inventory-1-commit',
      headVersion:1,revision:1,createdAt:'',updatedAt:'',
    },
    spec:{
      kind:inactiveContributedKind,name:'Inventory Robot',description:'',tags:[],profileId:'inactive.profile',
    },
  };
}
