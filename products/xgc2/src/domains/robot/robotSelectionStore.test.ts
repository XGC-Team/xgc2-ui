// @vitest-environment jsdom

import { afterEach,describe,expect,it } from 'vitest';
import {
  canonicalRobotSelectionParameters,
  readRobotSelection,
  robotSelectionKey,
  robotSelectionWorkflowParameters,
} from './robotSelectionStore';

describe('robotSelectionWorkflowParameters',() => {
  afterEach(() => {
    window.localStorage.removeItem(robotSelectionKey({ experimentId:'experiment-a',shared:'experiment' }));
  });

  it('maps the experiment selection owner to typed Panel Run parameters',() => {
    const key = robotSelectionKey({ experimentId:'experiment-a',shared:'experiment' });
    window.localStorage.setItem(key, JSON.stringify(['scout-01']));
    expect(readRobotSelection({ experimentId:'experiment-a',shared:'experiment' })).toEqual(['scout-01']);
    expect(robotSelectionWorkflowParameters('experiment-a')).toEqual({
      robotIds:['scout-01'],robotId:'scout-01',selectionKey:'selected:["scout-01"]',
    });

    window.localStorage.setItem(key, JSON.stringify(['scout-01','uav-01']));
    expect(robotSelectionWorkflowParameters('experiment-a')).toEqual({
      robotIds:['scout-01','uav-01'],robotId:'',selectionKey:'selected:["scout-01","uav-01"]',
    });

    window.localStorage.removeItem(key);
    expect(robotSelectionWorkflowParameters('experiment-a')).toEqual({
      robotIds:[],robotId:'',selectionKey:'all',
    });
  });

  it('sorts selected robotIds so run-robots admission matches selectionKey',() => {
    expect(canonicalRobotSelectionParameters(['uav-01','scout-01','uav-01'])).toEqual({
      robotIds:['scout-01','uav-01'],robotId:'',selectionKey:'selected:["scout-01","uav-01"]',
    });
    const key = robotSelectionKey({ experimentId:'experiment-a',shared:'experiment' });
    window.localStorage.setItem(key, JSON.stringify(['uav-01','scout-01']));
    expect(robotSelectionWorkflowParameters('experiment-a')).toEqual({
      robotIds:['scout-01','uav-01'],robotId:'',selectionKey:'selected:["scout-01","uav-01"]',
    });
  });
});
