import { describe,expect,it } from 'vitest';
import { corePanelPlugins } from '../../../panels/builtinPanels';
import { cameraStreamPanelDefaultRows } from '../../../shared/dashboardGeometry';
import type { GridPos } from '../../../types/common';
import fleetRecipes from '../../../../../local-fleet-lab/experiment-fixture-recipes.json';

type RecipePanel = {
  pluginId: string;
  grid: GridPos;
};

describe('GCS default dashboard camera and chat space', () => {
  it('gives stream camera plugins 16:9 default rows and a small min height', () => {
    const streamPlugins = corePanelPlugins.filter(isCameraStreamPlugin);
    expect(streamPlugins.length).toBeGreaterThanOrEqual(3);
    for (const plugin of streamPlugins) {
      const gridPos = plugin.defaultPanel?.gridPos;
      expect(plugin.layout?.minSize?.h).toBe(2);
      expect(plugin.layout?.sizePolicy?.vertical).toBe('expanding');
      expect(plugin.layout?.preferredHeightForWidth).toBeUndefined();
      expect(gridPos).toBeDefined();
      if (!gridPos) continue;
      expect(gridPos.h).toBe(cameraStreamPanelDefaultRows({ panelWidthCols: gridPos.w }));
    }
    expect(cameraStreamPanelDefaultRows({ panelWidthCols: 7 })).toBeLessThan(7);
  });

  it('keeps calibration camera expanding so inspector chrome is not 16:9-cropped', () => {
    const intrinsic = corePanelPlugins.find((plugin) => (
      (plugin.dataPorts ?? []).some((port) => port.contract === 'camera.calibration.intrinsic.v1')
    ));
    expect(intrinsic?.layout?.sizePolicy?.vertical).toBe('expanding');
    expect(intrinsic?.layout?.minSize?.h).toBe(2);
  });

  it('lets intrinsic Validation run its shared camera workflow from the panel header', () => {
    const validation = corePanelPlugins.find((plugin) => plugin.id === 'camera-intrinsic-validation');
    expect(validation?.panelWorkflowControls).toBe('visible');
    expect(validation?.frameProvider).toBeDefined();
    expect(validation?.headerLeading).toBeDefined();
    expect(validation?.actionPorts).toContainEqual(expect.objectContaining({
      id:'camera-intrinsic-calibration',required:true,actionKinds:['interaction'],
    }));
  });

  it('makes chat and log library defaults taller expanding neighbours', () => {
    const chat = corePanelPlugins.find((plugin) => (
      (plugin.dataPorts ?? []).some((port) => port.contract === 'ground-station.interactions.v1')
    ));
    const logs = corePanelPlugins.find((plugin) => plugin.category === 'Log');
    expect(chat?.layout?.sizePolicy?.vertical).toBe('expanding');
    expect(chat?.panelWorkflowControls).toBe('hidden');
    expect(chat?.defaultPanel?.gridPos?.h).toBeGreaterThan(6);
    expect(logs?.layout?.sizePolicy?.vertical).toBe('expanding');
    expect(logs?.defaultPanel?.gridPos?.h).toBeGreaterThan(4);
  });

  it('hides Robot control header Play because lifecycle cancel belongs to Workflow', () => {
    const control = corePanelPlugins.find((plugin) => plugin.id === 'px4-rotor-control-panel');
    expect(control?.panelWorkflowControls).toBe('hidden');
  });

  it('moves ROS and raw camera to Calibration and gives the GCS right column to chat', () => {
    const calibration = fleetDashboardPanels('calibration');
    const gcs = fleetDashboardPanels('gcs');
    expect(calibration.map((panel) => ({ pluginId:panel.pluginId,grid:panel.grid }))).toEqual([
      { pluginId:'gazebo-world-camera',grid:{ x:0,y:0,w:23,h:16 } },
      { pluginId:'ros-basic-services-control',grid:{ x:23,y:0,w:7,h:5 } },
    ]);
    expect(gcs.map((panel) => ({ pluginId:panel.pluginId,grid:panel.grid }))).toEqual([
      { pluginId:'robot-instruments-grid',grid:{ x:0,y:0,w:7,h:11 } },
      { pluginId:'px4-rotor-control-panel',grid:{ x:0,y:11,w:7,h:5 } },
      { pluginId:'xgc2-lichtblick',grid:{ x:7,y:0,w:16,h:16 } },
      { pluginId:'ground-station-activity',grid:{ x:23,y:0,w:7,h:16 } },
    ]);
    for (const panels of [calibration,gcs]) {
      for (let index = 0; index < panels.length; index += 1) {
        for (let other = index + 1; other < panels.length; other += 1) {
          expect(gridPositionsOverlap(panels[index]!.grid,panels[other]!.grid),
            `${panels[index]!.pluginId} overlaps ${panels[other]!.pluginId}`).toBe(false);
        }
      }
    }
  });

  it('orders the fleet workspace as Config, Calibration, Algorithm, then GCS',() => {
    const authoring = fleetRecipes.experimentFixtureAuthoring as {
      blueprints:Record<string,{ dashboards:Array<{ dashboard:string }> }>;
    };
    expect(authoring.blueprints.fleet?.dashboards.map(({ dashboard }) => dashboard))
      .toEqual(['calibration','algorithm','gcs']);
  });

  it('hides VRPN and RViz controls from the intrinsic calibration dashboard', () => {
    const authoring = fleetRecipes.experimentFixtureAuthoring as {
      blueprints: Record<string, {
        panelOptionOverrides?: Record<string,Record<string,unknown>>;
      }>;
    };
    expect(authoring.blueprints.intrinsic?.panelOptionOverrides?.['ros-control'])
      .toEqual({ layoutHiddenServices:['vrpn','rviz'] });
  });
});

function isCameraStreamPlugin(plugin: (typeof corePanelPlugins)[number]) {
  const ports = plugin.dataPorts ?? [];
  const video = ports.some((port) => port.contract === 'camera.video.v1');
  const calibration = ports.some((port) => port.contract.startsWith('camera.calibration.'));
  const experimentRuntime = ports.some((port) => port.contract === 'experiment.runtime.v1');
  return (video && !calibration) || (calibration && !video && experimentRuntime);
}

function fleetDashboardPanels(dashboardId:string): RecipePanel[] {
  return recipeDashboardPanels('fleet',dashboardId);
}

function recipeDashboardPanels(blueprint: string,dashboardId: string): RecipePanel[] {
  const authoring = fleetRecipes.experimentFixtureAuthoring as {
    panelComponents: Record<string, { pluginId: string;grid: GridPos }>;
    blueprints: Record<string, { dashboards: Array<{ dashboard:string;panelComponents:string[] }> }>;
  };
  const dashboard = authoring.blueprints[blueprint]!.dashboards
    .find((candidate) => candidate.dashboard===dashboardId)!;
  return dashboard.panelComponents.map((key) => {
    const panel = authoring.panelComponents[key]!;
    return { pluginId: panel.pluginId,grid: panel.grid };
  });
}

function gridPositionsOverlap(a: GridPos, b: GridPos) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
