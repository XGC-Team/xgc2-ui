// @vitest-environment jsdom

import { describe,expect,it } from 'vitest';
import {
  defaultGazeboObstacleDraft,
  gazeboObstacleDraftError,
  gazeboSceneRunParameters,
} from './gazeboScenePanelModel';

describe('gazeboScenePanelModel', () => {
  it('validates panel input and maps it to finite Action-port inputs', () => {
    expect(gazeboObstacleDraftError(defaultGazeboObstacleDraft)).toBe('');
    expect(gazeboObstacleDraftError({ ...defaultGazeboObstacleDraft,name: 'bad-name' })).toContain('begin with a letter');
    expect(gazeboSceneRunParameters({ ...defaultGazeboObstacleDraft,x: 2,yaw: 1.5 }, 'spawn')).toEqual({
      name: 'obstacle_01',model: 'xgc2_geom_cube',x: 2,y: 0,z: 0,roll: 0,pitch: 0,yaw: 1.5,
    });
    expect(gazeboSceneRunParameters(defaultGazeboObstacleDraft, 'move')).not.toHaveProperty('model');
  });
});
