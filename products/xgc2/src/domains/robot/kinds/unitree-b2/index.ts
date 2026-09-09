/**
 * Static leaf owner for Robot.UnitreeB2.Asset.
 *
 * Exports one typed static RobotAssetKindContribution for product-root
 * composition. Shared Robot / Experiment / panel production hosts must never
 * import this package.
 */

export {
  UNITREE_B2_ADMISSION,
  UNITREE_B2_CATALOG_KIND,
  UNITREE_B2_KIND,
  UNITREE_B2_LABEL,
  UNITREE_B2_PROFILE_ID,
  unitreeB2RobotAssetKindContribution,
} from './contribution';

export {
  UNITREE_B2_CATALOG_ENTRY,
  UNITREE_B2_DEFAULT_PROFILE_ID,
  UNITREE_B2_PAYLOAD_FIELDS,
  UNITREE_B2_ROS_DOMAIN_ID_MAX,
  UNITREE_B2_ROS_DOMAIN_ID_MIN,
  UNITREE_B2_WIRE_ARM,
  isUnitreeB2Kind,
  isUnitreeB2RobotAsset,
  unitreeB2DefaultName,
  unitreeB2Endpoint,
  unitreeB2NameSequence,
  unitreeB2OverviewAttributes,
} from './leafPublic';
export type {
  UnitreeB2InventoryPayload,
  UnitreeB2OverviewAttr,
  UnitreeB2RobotAssetSpec,
} from './leafPublic';

export {
  normalizeUnitreeB2Payload,
  normalizeUnitreeB2RobotAssetSpec,
  validateUnitreeB2RobotAssetSpec,
} from './authoring';

export {
  decodeUnitreeB2InventoryPayload,
  unitreeB2SpecFromDecoded,
  unitreeB2WireField,
} from './decode';
