import { describe,expect,it } from 'vitest';
import {
  addSeriesToPane,
  chartScale,
  dropFieldOnWorkspace,
  emptyRosbagPlotWorkspace,
  experimentIdFromArtifactsPort,
  parseFieldDrag,
  plottableTopics,
  polylineForSeries,
  removeSeriesFromPane,
  seriesIdForField,
} from './rosbagPlotPanelModel';

describe('rosbagPlotPanelModel', () => {
  it('parses JSON and bare topic:field drag payloads', () => {
    expect(parseFieldDrag(JSON.stringify({
      seriesId: '/cmd_vel:linear.x',topic: '/cmd_vel',field: 'linear.x',
    }))).toEqual({
      seriesId: '/cmd_vel:linear.x',topic: '/cmd_vel',field: 'linear.x',
    });
    expect(parseFieldDrag('/cmd_vel:linear.x')).toEqual({
      seriesId: '/cmd_vel:linear.x',topic: '/cmd_vel',field: 'linear.x',
    });
    expect(parseFieldDrag('')).toBeUndefined();
  });

  it('drops a field onto a new pane or overlays an existing pane', () => {
    const started = dropFieldOnWorkspace(emptyRosbagPlotWorkspace('bag-1'), '/cmd_vel:linear.x');
    expect(started.panes).toHaveLength(1);
    expect(started.panes[0]?.seriesIds).toEqual(['/cmd_vel:linear.x']);
    const overlay = addSeriesToPane(started, started.panes[0]!.id, '/cmd_vel:angular.z');
    expect(overlay.panes[0]?.seriesIds).toEqual(['/cmd_vel:linear.x','/cmd_vel:angular.z']);
    const removed = removeSeriesFromPane(overlay, overlay.panes[0]!.id, '/cmd_vel:linear.x');
    expect(removed.panes[0]?.seriesIds).toEqual(['/cmd_vel:angular.z']);
  });

  it('hides topics without plottable fields and builds series ids', () => {
    expect(plottableTopics([
      { name: '/tf',type: 'tf2_msgs/TFMessage',fields: [],messageCount: 10 },
      { name: '/cmd_vel',type: 'geometry_msgs/Twist',fields: ['linear.x'],messageCount: 20 },
    ]).map((topic) => topic.name)).toEqual(['/cmd_vel']);
    expect(seriesIdForField('/cmd_vel', 'linear.x')).toBe('/cmd_vel:linear.x');
  });

  it('scales time series onto chart coordinates', () => {
    const scale = chartScale([{
      id: '/cmd_vel:linear.x',topic: '/cmd_vel',field: 'linear.x',
      points: [{ t: 0,v: 0 },{ t: 1,v: 1 }],
    }]);
    expect(scale.tMin).toBe(0);
    expect(scale.tMax).toBe(1);
    const points = polylineForSeries([{ t: 0,v: 0 },{ t: 1,v: 1 }], scale);
    expect(points.split(' ')).toHaveLength(2);
  });

  it('reads the Experiment id from the recording artifacts projection', () => {
    expect(experimentIdFromArtifactsPort({ experimentResourceId: 'exp-1' })).toBe('exp-1');
    expect(experimentIdFromArtifactsPort({ items: [] })).toBe('');
  });
});
