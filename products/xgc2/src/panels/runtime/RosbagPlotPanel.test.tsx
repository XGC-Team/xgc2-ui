// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import { selectControlOption } from '../../test/selectControlTestUtils';
import type { PanelPluginContext } from '../types';
import { RosbagPlotPanel } from './RosbagPlotPanel';
import { ROSBAG_FIELD_DRAG_TYPE } from './rosbagPlotPanelModel';

const listROSBagRecordings = vi.fn();
const getROSBagRecordingPlot = vi.fn();

vi.mock('../../domains/recording/recordingPublic', () => ({
  listROSBagRecordings: (...args: unknown[]) => listROSBagRecordings(...args),
  getROSBagRecordingPlot: (...args: unknown[]) => getROSBagRecordingPlot(...args),
}));

describe('RosbagPlotPanel', () => {
  beforeEach(() => {
    listROSBagRecordings.mockReset();
    getROSBagRecordingPlot.mockReset();
    listROSBagRecordings.mockResolvedValue({
      items: [{ id: 'bag-1',name: 'run-1/demo.bag',path: '/bags/demo.bag',size: 12,createdAt: '2026-01-01T00:00:00Z' }],
      limit: 100,offset: 0,total: 1,truncated: false,
    });
    getROSBagRecordingPlot.mockImplementation(async (_id: string, series: string[] = []) => {
      if (series.length === 0) {
        return {
          id: 'bag-1',name: 'demo.bag',title: 'demo.bag',durationSec: 1,
          topics: [{ name: '/cmd_vel',type: 'geometry_msgs/Twist',fields: ['linear.x','angular.z'],messageCount: 2 }],
          series: [],
        };
      }
      return {
        id: 'bag-1',name: 'demo.bag',title: 'demo.bag',durationSec: 1,topics: [],
        series: series.map((id) => ({
          id,topic: '/cmd_vel',field: id.split(':')[1] ?? 'linear.x',
          points: [{ t: 0,v: 0.1 },{ t: 0.5,v: 0.3 }],
        })),
      };
    });
  });

  it('loads a bag catalog and plots a dragged field', async () => {
    render(<RosbagPlotPanel panel={panel()} context={context()} />);
    await waitFor(() => expect(listROSBagRecordings).toHaveBeenCalled());
    selectControlOption('Recorded bag', 'run-1/demo.bag');
    await waitFor(() => expect(getROSBagRecordingPlot).toHaveBeenCalledWith('bag-1', [], expect.anything()));
    expect(document.querySelector('[data-xgc-role="rosbag-plot-topic"][data-xgc-id="/cmd_vel"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'linear.x' })).toBeInTheDocument();
    fireEvent.drop(document.querySelector('[data-xgc-role="rosbag-plot-stage"]')!, {
      dataTransfer: {
        getData: (type: string) => type === ROSBAG_FIELD_DRAG_TYPE || type === 'text/plain'
          ? '/cmd_vel:linear.x'
          : '',
      },
    });
    await waitFor(() => expect(document.querySelector('[data-xgc-role="rosbag-plot-pane"]')).not.toBeNull());
    expect(document.querySelector('.rosbag-plot-line')).not.toBeNull();
  });
});

function panel(): PanelInstance {
  return {
    id: 'plot',pluginId: 'rosbag-plot',title: 'Rosbag plot',
    gridPos: { x: 0,y: 0,w: 16,h: 10 },query: {},options: {},fieldConfig: {},portBindings: [],
  };
}

function context(): PanelPluginContext {
  return {
    ports: {
      actions: {},
      data: {
        'recording-artifacts': {
          id: 'recording-artifacts',label: 'Artifacts',contract: 'recording.artifacts.v1',
          connected: true,value: { experimentResourceId: 'exp-1' },trace: {},
        },
      },
      authoring: {},
      interactions: {},
    },
  };
}
