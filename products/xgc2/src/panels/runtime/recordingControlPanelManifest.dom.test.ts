// @vitest-environment jsdom

import { describe,expect,it } from 'vitest';
import { availablePanelPlugins,corePanelPlugins } from '../builtinPanels';
import { rosbagPlotPanelPlugin,scientificGalleryPanelPlugin } from './manifest';

describe('retired recording-control plugin', () => {
  it('is not registered as a panel plugin', () => {
    expect(corePanelPlugins.map((plugin) => plugin.id)).not.toContain('recording-control');
    expect(availablePanelPlugins.map((plugin) => plugin.id)).not.toContain('recording-control');
  });
});

describe('retired standalone video panel', () => {
  it('is not registered as a panel plugin', () => {
    expect(corePanelPlugins.map((plugin) => plugin.id)).not.toContain('experiment-video-production');
    expect(availablePanelPlugins.map((plugin) => plugin.id)).not.toContain('experiment-video-production');
  });
});

describe('rosbag-plot panel manifest', () => {
  it('is installed as a PlotJuggler-style bag inspector', () => {
    expect(corePanelPlugins.map((plugin) => plugin.id)).toContain('rosbag-plot');
    expect(rosbagPlotPanelPlugin.id).toBe('rosbag-plot');
    expect(rosbagPlotPanelPlugin.dataPorts).toEqual([
      expect.objectContaining({ id:'recording-artifacts',contract:'recording.artifacts.v1' }),
    ]);
  });
});

describe('scientific-gallery panel manifest', () => {
  it('binds one plotting action with one script path', () => {
    expect(corePanelPlugins.map((plugin) => plugin.id)).toContain('scientific-gallery');
    expect(scientificGalleryPanelPlugin.id).toBe('scientific-gallery');
    expect(scientificGalleryPanelPlugin.panelWorkflowControls).toBe('hidden');
    expect(scientificGalleryPanelPlugin.fillBody).toBe(true);
    expect(scientificGalleryPanelPlugin.headerLeading).toBeDefined();
    expect(scientificGalleryPanelPlugin.headerActions).toBeDefined();
    expect(scientificGalleryPanelPlugin.frameProvider).toBeDefined();
    expect(scientificGalleryPanelPlugin.actionPorts).toEqual([
      expect.objectContaining({ id:'plot',actionKinds:['command'],required:true }),
      expect.objectContaining({ id:'render-video',actionKinds:['command'] }),
    ]);
    expect(scientificGalleryPanelPlugin.optionSchema).toHaveProperty('scriptPath');
    expect(scientificGalleryPanelPlugin.dataPorts).toEqual([
      expect.objectContaining({ id:'recording-artifacts',contract:'recording.artifacts.v1' }),
      expect.objectContaining({ id:'runtime',contract:'workflowruntime.run' }),
    ]);
    expect(scientificGalleryPanelPlugin.defaultPanel?.gridPos).toEqual({ x:0,y:0,w:23,h:16 });
  });
});
