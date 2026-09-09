/**
 * Single typed static RobotAssetKindContribution for Unitree B2.
 * Product roots compose this leaf; shared Robot / Experiment hosts never import it.
 */

import {
  defineRobotAssetKindContributionIdentity,
  type ContributedRobotAssetSpec,
  type RobotAssetCommonFields,
  type RobotAssetKindContribution,
  type RobotAssetWireResult,
  type RobotKindAdmission,
} from '../../robotAssetKindComposition';
import {
  normalizeUnitreeB2RobotAssetSpec,
  validateUnitreeB2RobotAssetSpec,
} from './authoring';
import {
  UNITREE_B2_CATALOG_KIND,
  UNITREE_B2_KIND,
  UNITREE_B2_LABEL,
  UNITREE_B2_PROFILE_ID,
  UNITREE_B2_ROS_DOMAIN_ID_MIN,
  UNITREE_B2_WIRE_ARM,
  isUnitreeB2RobotAsset,
  type UnitreeB2RobotAssetSpec,
} from './contracts';
import {
  UNITREE_B2_CATALOG_ENTRY,
  unitreeB2DefaultName,
  unitreeB2Endpoint,
  unitreeB2NameSequence,
  unitreeB2OverviewAttributes,
} from './catalog';
import {
  decodeUnitreeB2InventoryPayload,
  unitreeB2SpecFromDecoded,
  unitreeB2WireField,
} from './decode';
import { UnitreeB2InventoryEditor } from './editor';
import { UNITREE_B2_EXPERIMENT_BINDING } from './experimentBinding';
import { UNITREE_B2_PANEL_PROJECTION } from './panelProjection';

const unitreeB2Identity = defineRobotAssetKindContributionIdentity(
  'robot.asset.kind.unitree-b2',
);

/**
 * B2 may bind into Experiments for physical instruments / adapter runtime.
 * No simulation product — physical-only projection for instrument panels.
 */
export const UNITREE_B2_ADMISSION: RobotKindAdmission = Object.freeze({
  experimentBinding: true,
  experimentProjection: true,
  simulation: false,
  experimentDisabledReason: '',
  experimentProjectionRefusal: '',
});

function asB2(spec: RobotAssetWireResult | ContributedRobotAssetSpec): UnitreeB2RobotAssetSpec {
  if (!isUnitreeB2RobotAsset(spec)) {
    throw new Error('Expected Unitree B2 robot asset spec.');
  }
  return spec;
}

function emptyInventoryFields(): Readonly<Record<string, string>> {
  return Object.freeze({
    robotAddress: '',
    rosDomainId: String(UNITREE_B2_ROS_DOMAIN_ID_MIN),
    sshUsername: '',
    sshPassword: '',
  });
}

function fieldsFromSpec(spec: ContributedRobotAssetSpec): Readonly<Record<string, string>> {
  const b2 = asB2(spec);
  return Object.freeze({
    robotAddress: b2.unitreeB2.robotAddress,
    rosDomainId: String(b2.unitreeB2.rosDomainId),
    sshUsername: b2.unitreeB2.sshUsername,
    sshPassword: b2.unitreeB2.sshPassword,
  });
}

function specFromFields(
  common: RobotAssetCommonFields,
  fields: Readonly<Record<string, string>>,
): UnitreeB2RobotAssetSpec {
  const robotAddress = (fields.robotAddress ?? '').trim();
  return {
    name: common.name,
    description: common.description,
    tags: [...common.tags],
    profileId: common.profileId,
    kind: UNITREE_B2_KIND,
    unitreeB2: {
      // Wire still requires serialNumber; mirror the address so operators never
      // author a separate placeholder serial (IP uniquely identifies the dog).
      serialNumber: robotAddress,
      robotAddress,
      rosDomainId: Number(fields.rosDomainId),
      sshUsername: fields.sshUsername ?? '',
      sshPassword: fields.sshPassword ?? '',
    },
  };
}

/**
 * Static typed contribution for Robot.UnitreeB2.Asset.
 * Owns exact kind / profile / wire / editor / catalog / admission.
 */
export const unitreeB2RobotAssetKindContribution: RobotAssetKindContribution = Object.freeze({
  identity: unitreeB2Identity,
  catalog: UNITREE_B2_CATALOG_ENTRY,
  defaultProfileId: UNITREE_B2_PROFILE_ID,
  admission: UNITREE_B2_ADMISSION,
  experimentBinding: UNITREE_B2_EXPERIMENT_BINDING,
  panelProjection: UNITREE_B2_PANEL_PROJECTION,
  wire: Object.freeze({
    protocolKind: UNITREE_B2_KIND,
    wireArms: Object.freeze([UNITREE_B2_WIRE_ARM] as const),
    decode(common: RobotAssetCommonFields, spec: Readonly<Record<string, unknown>>, path: string): UnitreeB2RobotAssetSpec {
      return unitreeB2SpecFromDecoded(
        {
          name: common.name,
          description: common.description,
          tags: [...common.tags],
          profileId: common.profileId,
        },
        decodeUnitreeB2InventoryPayload(
          unitreeB2WireField(spec as Record<string, unknown>, path),
          path,
        ),
      );
    },
    normalize(spec: RobotAssetWireResult, common: RobotAssetCommonFields): UnitreeB2RobotAssetSpec {
      return normalizeUnitreeB2RobotAssetSpec(asB2(spec), {
        name: common.name,
        description: common.description,
        tags: [...common.tags],
        profileId: common.profileId,
      });
    },
    validate(spec: RobotAssetWireResult): string {
      return validateUnitreeB2RobotAssetSpec(asB2(spec));
    },
  }),
  endpoint: (spec) => unitreeB2Endpoint(asB2(spec)),
  overviewAttributes: (spec) => unitreeB2OverviewAttributes(asB2(spec).unitreeB2),
  defaultName: unitreeB2DefaultName,
  nameSequence: unitreeB2NameSequence,
  inventoryEditor: Object.freeze({
    emptyFields: emptyInventoryFields,
    fieldsFromSpec,
    specFromFields,
    Render: UnitreeB2InventoryEditor,
  }),
});

export {
  UNITREE_B2_CATALOG_KIND,
  UNITREE_B2_KIND,
  UNITREE_B2_LABEL,
  UNITREE_B2_PROFILE_ID,
};
