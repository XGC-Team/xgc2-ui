import { describe,expect,it } from 'vitest';
import { newExperimentSpec,validateExperimentSpec } from '../experimentModel';

describe('new Experiment configuration', () => {
  it('starts with no implicit folder or tags and gives Config one system Robot workflow', () => {
    const spec = newExperimentSpec({
      name: 'Flight Test',
      robots: [],workflowInstances: [],
    });
    expect(spec.tags).toEqual([]);
    expect(spec.robots).toEqual([]);
    expect(spec.workflowInstances).toEqual([
      expect.objectContaining({ id:'panel-robot-assets' }),
    ]);
    // Dashboard layout grids live in experimentDefaults.test.ts only.
    expect(spec.dashboards.map((dashboard) => dashboard.id)).toEqual(['config']);
    expect(spec.dashboards[0]?.panels.map((panel) => panel.id)).toEqual(['robot-assets']);
    expect(validateExperimentSpec(spec)).toBe('');
  });

  it('rejects a missing resource binding before an API mutation', () => {
    const spec = newExperimentSpec({
      name: 'Experiment',
      robots: [{
          id: 'leader',
          ref: { domain: 'robot',resourceId: '',branch: 'main' },
          namespace: '/uav1',
          hybridSource: 'physical',
          runtimeParameters: {},
          initialPose: { x: 0,y: 0,z: 0,yaw: 0 },
      }],
      workflowInstances: [],
    });
    expect(validateExperimentSpec(spec)).toBeTruthy();
  });
});
