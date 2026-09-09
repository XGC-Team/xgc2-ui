import { describe,expect,it } from 'vitest';
import {
  EXPERIMENT_SCHEMA_VERSION,
  normalizeExperimentSpec,
  validateExperimentSpec,
  type ExperimentRobotBinding,
  type ExperimentSpec,
} from './experimentModel';
import { robotAssetKindCompositionWithUnitreeB2 } from '../../../test-fixtures/robot-kinds/with-unitree-b2';

describe('Experiment Robot bindings', () => {
  it('keeps the authored Robot list and permits an empty Robot selection', () => {
    const ordered = spec([
      binding('wingman','robot-2','/uav2'),
      binding('leader','robot-1','/uav1'),
    ]);

    expect(normalizeExperimentSpec(ordered).robots.map((item) => item.id))
      .toEqual(['wingman','leader']);
    expect(validateExperimentSpec(spec([]))).toBe('');
  });

  it('rejects duplicate logical IDs, Robot assets, and ROS namespaces', () => {
    expect(validateExperimentSpec(spec([
      binding('leader','robot-1','/uav1'),
      binding('leader','robot-2','/uav2'),
    ]))).toContain('Experiment Robot ID "leader" must be unique');

    expect(validateExperimentSpec(spec([
      binding('leader','robot-1','/uav1'),
      binding('wingman','robot-1','/uav2'),
    ]))).toContain('cannot be added to this Experiment more than once');

    expect(validateExperimentSpec(spec([
      binding('leader','robot-1','/uav1'),
      binding('wingman','robot-2','/uav1'),
    ]))).toContain('ROS namespace "/uav1" must be unique');
  });

  it('rejects runtime parameters owned by the Experiment Robot configuration', () => {
    const withNamespace = binding('leader','robot-1','/uav1');
    withNamespace.runtimeParameters.namespace = '/other';
    expect(validateExperimentSpec(spec([withNamespace]))).toContain(
      'runtime parameter "namespace" is reserved',
    );

    const withRigidBody = binding('leader','robot-1','/uav1');
    withRigidBody.runtimeParameters.mocap_rigid_body = 'rigid-body';
    expect(validateExperimentSpec(spec([withRigidBody]))).toContain(
      'runtime parameter "mocap_rigid_body" is reserved',
    );

    const withMav = binding('leader','robot-1','/uav1');
    withMav.runtimeParameters.mav_system_id = '1';
    expect(validateExperimentSpec(spec([withMav]))).toContain(
      'runtime parameter "mav_system_id" is reserved',
    );
  });

  it('rejects residual Scout transport fields', () => {
    const polluted = {
      ...binding('scout-a','robot-s1','/ugv1'),
      px4: undefined,
      scout: {
        lidarSimulationEnabled: false,
        imageSimulationEnabled: true,
        managementAddress: '192.0.2.1',
      },
    } as unknown as ExperimentRobotBinding;
    expect(validateExperimentSpec(spec([polluted]))).toContain(
      'scout overrides may only set lidar/image simulation switches',
    );
  });

  it('accepts empty PX4 kind markers and rejects residual transport fields', () => {
    expect(validateExperimentSpec(spec([
      px4Binding('leader','robot-1'),
      px4Binding('wingman','robot-2'),
    ]))).toBe('');

    const polluted = invalidPX4Binding('leader','robot-1',{
      experimentLocalPort: 9010,
    });
    expect(validateExperimentSpec(spec([polluted]))).toContain(
      'px4 overrides must be empty',
    );
  });

  it('accepts empty Mecanum kind markers and rejects residual transport fields', () => {
    expect(validateExperimentSpec(spec([
      mecanumBinding('mecanum-a','robot-m1'),
      mecanumBinding('mecanum-b','robot-m2'),
    ]))).toBe('');

    const polluted = {
      ...mecanumBinding('mecanum-a','robot-m1'),
      mecanum: { managementAddress: '192.0.2.1' },
    } as unknown as ExperimentRobotBinding;
    expect(validateExperimentSpec(spec([polluted]))).toContain(
      'mecanum overrides must be empty',
    );
  });

  it('requires exactly one kind marker on a single slot', () => {
    const both = {
      ...px4Binding('leader','robot-1'),
      scout: { lidarSimulationEnabled: false,imageSimulationEnabled: false },
    };
    expect(validateExperimentSpec(spec([both]))).toContain(
      'requires exactly one Robot kind settings arm',
    );

    const px4AndMecanum = {
      ...px4Binding('leader','robot-1'),
      mecanum: {},
    };
    expect(validateExperimentSpec(spec([px4AndMecanum]))).toContain(
      'requires exactly one Robot kind settings arm',
    );

    const markerless = binding('leader','robot-1','/uav1');
    delete markerless.px4;
    expect(validateExperimentSpec(spec([markerless]))).toContain(
      'requires exactly one Robot kind settings arm',
    );
  });

  it('preserves empty Mecanum markers when normalizing', () => {
    expect(normalizeExperimentSpec(spec([
      mecanumBinding('mecanum-a','robot-m1'),
    ])).robots[0]).toEqual(mecanumBinding('mecanum-a','robot-m1'));
  });

  it('normalizes and validates a leaf-owned marker only through its composition', () => {
    const contributed = {
      ...binding('b2-01','robot-b2','/b21'),
      px4: undefined,
      unitreeB2: {},
    } as ExperimentRobotBinding;
    expect(validateExperimentSpec(
      spec([contributed]),
      robotAssetKindCompositionWithUnitreeB2,
    )).toBe('');
    expect(normalizeExperimentSpec(
      spec([contributed]),
      robotAssetKindCompositionWithUnitreeB2,
    ).robots[0]?.unitreeB2).toEqual({});
    expect(validateExperimentSpec(spec([contributed]))).toContain(
      'requires exactly one Robot kind settings arm',
    );

    const polluted = { ...contributed,unitreeB2:{ robotAddress:'forbidden' } };
    expect(validateExperimentSpec(
      spec([polluted]),
      robotAssetKindCompositionWithUnitreeB2,
    )).toContain('overrides must be empty');
  });
});

function binding(id: string,resourceId: string,namespace: string): ExperimentRobotBinding {
  return {
    id,
    ref: { domain: 'robot',resourceId,branch: 'main' },
    namespace,
    hybridSource: 'physical',
    runtimeParameters: {},
    initialPose: { x: 0,y: 0,z: 0,yaw: 0 },
    // Fixture default: empty PX4 kind marker (core requires exactly one arm).
    px4: {},
  };
}

function px4Binding(id: string,resourceId: string): ExperimentRobotBinding {
  return {
    ...binding(id,resourceId,`/${id}`),
    px4: {},
  };
}

function mecanumBinding(id: string,resourceId: string): ExperimentRobotBinding {
  // Namespace must be a valid absolute ROS name (hyphens are not allowed).
  const namespace = `/${id.replace(/-/g,'_')}`;
  const { px4: _dropPx4,...base } = binding(id,resourceId,namespace);
  return {
    ...base,
    mecanum: {},
  };
}

function invalidPX4Binding(
  id: string,
  resourceId: string,
  px4: Record<string,unknown>,
): ExperimentRobotBinding {
  // Bypass the TS shape only to prove non-contract fields are rejected.
  return { ...px4Binding(id,resourceId),px4 } as unknown as ExperimentRobotBinding;
}

function spec(robots: ExperimentRobotBinding[]): ExperimentSpec {
  return {
    schemaVersion: EXPERIMENT_SCHEMA_VERSION,
    name: 'Experiment',
    description: '',
    tags: [],
    runModes: ['simulation','physical'],
    localizationOffset:{ x:0,y:0,z:0 },
    robots,workflowInstances: [],
    dashboards: [{ id: 'gcs',name: 'GCS',description: '',panels: [] }],
  };
}
