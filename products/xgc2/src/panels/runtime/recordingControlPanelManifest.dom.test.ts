// @vitest-environment jsdom

import { describe,expect,it } from 'vitest';
import { corePanelPlugins } from '../builtinPanels';
import { recordingControlPanelPlugin,rosbagPlotPanelPlugin } from './manifest';
import {
  RECORDING_CONTROL_PANEL_ID,
  ROSBAG_RECORDING_WORKFLOW_SLOT,
} from './recordingControlPanelModel';

describe('recording-control panel manifest', () => {
  it('is installed in the core panel registry under the codec plugin id', () => {
    expect(corePanelPlugins.map((plugin) => plugin.id)).toContain(RECORDING_CONTROL_PANEL_ID);
    expect(recordingControlPanelPlugin.id).toBe('recording-control');
  });

  it('drives the recorder through an explicit service Action port', () => {
    expect(recordingControlPanelPlugin.actionPorts).toEqual([
      expect.objectContaining({ id: ROSBAG_RECORDING_WORKFLOW_SLOT,actionKinds:['service'] }),
    ]);
    // Not required: an Experiment template that binds no recorder is a
    // legitimate Experiment, and the panel guides rather than failing the board.
    expect(recordingControlPanelPlugin.actionPorts?.[0]?.required).toBeUndefined();
  });

  it('asks the layout to grow it in both directions from a usable minimum', () => {
    expect(recordingControlPanelPlugin.layout?.minSize).toEqual({ w: 4,h: 4 });
    expect(recordingControlPanelPlugin.layout?.sizePolicy)
      .toEqual({ horizontal: 'expanding',vertical: 'expanding' });
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
