import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  assembleRobotAssetKindComposition,
  builtInRobotAssetKindComposition,
  builtInRobotAssetKindContributions,
  defineRobotAssetKindContributionIdentity,
  emptyRobotAssetKindComposition,
  EXPERIMENT_CAPABLE_ROBOT_ADMISSION,
  robotAssetKindAdmissionForProtocolKind,
  robotAssetKindContributionByCatalogId,
  robotAssetKindContributionByProtocolKind,
  robotAssetKindCompositionWireArms,
  UNKNOWN_ROBOT_KIND_ADMISSION,
  type ContributedRobotAssetSpec,
  type RobotAssetCommonFields,
  type RobotAssetKindContribution,
} from './robotAssetPublic';
import { robotAssetKindCompositionWithUnitreeB2 } from '../../../test-fixtures/robot-kinds/with-unitree-b2';
import { robotAssetKindCompositionWithoutUnitreeB2 } from '../../../test-fixtures/robot-kinds/without-unitree-b2';
import { defineContributedRobotAssetKind } from './robotAssetKindComposition';
import {
  UNITREE_B2_KIND,
  UNITREE_B2_ADMISSION,
  type UnitreeB2RobotAssetSpec,
} from './kinds/unitree-b2';

describe('assembleRobotAssetKindComposition', () => {
  it('returns empty composition for no contributions', () => {
    const composition = assembleRobotAssetKindComposition();
    expect(composition.contributions).toEqual([]);
    expect(emptyRobotAssetKindComposition().contributions).toEqual([]);
  });

  it('rejects duplicate identity, protocol, catalog, and wire-arm identities', () => {
    const shared = defineRobotAssetKindContributionIdentity('shared');
    const first = fixtureContribution({ identity: shared, protocolKind: 'a', catalogId: 'a' });
    const second = fixtureContribution({ identity: shared, protocolKind: 'b', catalogId: 'b' });
    expect(() => assembleRobotAssetKindComposition(first, second)).toThrow(/duplicated at index/);

    expect(() => assembleRobotAssetKindComposition(
      fixtureContribution({ protocolKind: 'same', catalogId: 'one' }),
      fixtureContribution({ protocolKind: 'same', catalogId: 'two' }),
    )).toThrow(/protocol kind "same" is duplicated/);

    expect(() => assembleRobotAssetKindComposition(
      fixtureContribution({ protocolKind: 'one', catalogId: 'same' }),
      fixtureContribution({ protocolKind: 'two', catalogId: 'same' }),
    )).toThrow(/catalog id "same" is duplicated/);

    const firstArm = fixtureContribution({ protocolKind: 'one', catalogId: 'one', wireArm: 'shared' });
    const secondArm = fixtureContribution({ protocolKind: 'two', catalogId: 'two', wireArm: 'shared' });
    expect(() => assembleRobotAssetKindComposition(firstArm, secondArm))
      .toThrow(/wire arm "shared" is duplicated/);
  });

  it('composes built-ins as experiment-capable and fails closed for unknown kinds', () => {
    const composition = builtInRobotAssetKindComposition();
    expect(composition.contributions.map((c) => c.catalog.id)).toEqual(['px4', 'scout', 'mecanum']);
    expect(robotAssetKindCompositionWireArms(composition)).toEqual(
      expect.arrayContaining(['px4', 'scout', 'mecanum']),
    );
    expect(robotAssetKindAdmissionForProtocolKind(composition, 'px4_multirotor'))
      .toBe(EXPERIMENT_CAPABLE_ROBOT_ADMISSION);
    expect(robotAssetKindAdmissionForProtocolKind(composition, 'not-a-kind'))
      .toEqual(UNKNOWN_ROBOT_KIND_ADMISSION);
    expect(robotAssetKindContributionByProtocolKind(composition, UNITREE_B2_KIND)).toBeUndefined();
  });

  it('subscribes FS150 instruments to the real four-frequency and RTT channels', () => {
    const telemetry = robotAssetKindContributionByProtocolKind(
      builtInRobotAssetKindComposition(),
      'px4_multirotor',
    )?.productModels?.find((model) => model.id === 'fs150')?.telemetry;
    expect(telemetry?.poseChannelId).toBe('state.pose');
    expect(telemetry?.velocityChannelId).toBe('state.velocity');
    expect(telemetry?.linkChannelId).toBe('diagnostic.fcu-link');
    expect(telemetry?.instrumentChannels).toEqual(expect.arrayContaining([
      'state.flight','state.pose','state.velocity','state.imu','setpoint.local',
      'state.mocap.pose','diagnostic.fcu-link','diagnostic.stream-health',
    ]));
    expect(telemetry?.instrumentChannels).not.toContain('diagnostic.offboard-input');
  });

  it('brands real contributed leaves and rejects no-arm and partial-arm built-ins',() => {
    type MissingArmPX4 = RobotAssetCommonFields & {
      kind:'px4_multirotor';
    };
    type MissingModelPX4 = RobotAssetCommonFields & {
      kind:'px4_multirotor';
      px4:{ mavSystemId:number };
    };
    expectTypeOf<MissingArmPX4>().not.toMatchTypeOf<ContributedRobotAssetSpec>();
    expectTypeOf<MissingModelPX4>().not.toMatchTypeOf<ContributedRobotAssetSpec>();
    expectTypeOf<UnitreeB2RobotAssetSpec>().toMatchTypeOf<ContributedRobotAssetSpec>();
    expect(UNITREE_B2_KIND).toBe('unitree_b2');
    expect(defineContributedRobotAssetKind('fixture_extension')).toBe('fixture_extension');

    const dynamicBuiltInKind: string = 'px4_multirotor';
    expect(() => defineContributedRobotAssetKind(dynamicBuiltInKind))
      .toThrow(/cannot be contributed/);

    const contribution=robotAssetKindContributionByProtocolKind(
      builtInRobotAssetKindComposition(),'px4_multirotor',
    )!;
    expect(() => contribution.wire.decode({
      name:'PX4',description:'',tags:[],profileId:contribution.defaultProfileId,
    },{ px4:{ mavSystemId:1 } },'spec')).toThrow(/modelId/);
  });

  it('includes the B2 leaf only in the true fixture composition', () => {
    const withB2 = robotAssetKindCompositionWithUnitreeB2;
    const withoutB2 = robotAssetKindCompositionWithoutUnitreeB2;
    expect(robotAssetKindContributionByProtocolKind(withB2, UNITREE_B2_KIND)?.admission)
      .toBe(UNITREE_B2_ADMISSION);
    expect(robotAssetKindContributionByCatalogId(withB2, 'unitreeB2')?.catalog.label)
      .toBe('Unitree B2');
    expect(robotAssetKindContributionByProtocolKind(withoutB2, UNITREE_B2_KIND)).toBeUndefined();
    expect(robotAssetKindAdmissionForProtocolKind(withoutB2, UNITREE_B2_KIND))
      .toEqual(UNKNOWN_ROBOT_KIND_ADMISSION);
    const contribution = robotAssetKindContributionByProtocolKind(withB2, UNITREE_B2_KIND);
    expect(withB2.experimentBindingArms).toEqual(['unitreeB2']);
    expect(withB2.contributionByExperimentBindingArm('unitreeB2')).toBe(contribution);
    expect(contribution?.experimentBinding?.authoring).toMatchObject({
      slotIdPrefix:'b2',namespacePrefix:'b2',initialPoseZ:0.55,
    });
    expect(contribution?.panelProjection?.instrumentChannels).toEqual(expect.arrayContaining([
      'state.pose','state.velocity','state.speed','state.power','state.health',
      'state.locomotion','state.joints','diagnostic.link','diagnostic.stream-health',
    ]));
    expect(contribution?.panelProjection?.listChannels).not.toContain('state.joints');
    expect(withoutB2.experimentBindingArms).toEqual([]);
    expect(withoutB2.contributionByExperimentBindingArm('unitreeB2')).toBeUndefined();
    expect(builtInRobotAssetKindContributions).toHaveLength(3);
  });
});

function fixtureContribution(overrides: {
  identity?: ReturnType<typeof defineRobotAssetKindContributionIdentity>;
  protocolKind?: string;
  catalogId?: string;
  wireArm?: string;
}): RobotAssetKindContribution {
  const protocolKind = overrides.protocolKind ?? 'fixture.kind';
  const catalogId = overrides.catalogId ?? 'fixture';
  return {
    identity: overrides.identity ?? defineRobotAssetKindContributionIdentity(protocolKind),
    catalog: { id: catalogId, label: catalogId },
    defaultProfileId: 'fixture.v1',
    admission: EXPERIMENT_CAPABLE_ROBOT_ADMISSION,
    wire: {
      protocolKind,
      wireArms: [overrides.wireArm ?? catalogId],
      decode: (common) => ({
        name: common.name,
        description: common.description,
        tags: [...common.tags],
        profileId: common.profileId,
        kind: protocolKind,
      }),
      normalize: (spec) => spec,
      validate: () => '',
    },
    endpoint: () => '',
    overviewAttributes: () => [],
    defaultName: (sequence) => `Fixture ${sequence}`,
    simulationModels: [{
      id: 'fixture-sim',
      label: 'Fixture',
      launchPackage: 'fixture',
      launchFile: 'fixture.launch',
    }],
  };
}
