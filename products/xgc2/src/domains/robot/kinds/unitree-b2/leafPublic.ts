/** Leaf-local re-exports used by the package index (not shared hosts). */

export {
  UNITREE_B2_CATALOG_KIND,
  UNITREE_B2_KIND,
  UNITREE_B2_LABEL,
  UNITREE_B2_PAYLOAD_FIELDS,
  UNITREE_B2_PROFILE_ID,
  UNITREE_B2_ROS_DOMAIN_ID_MAX,
  UNITREE_B2_ROS_DOMAIN_ID_MIN,
  UNITREE_B2_WIRE_ARM,
  isUnitreeB2Kind,
  isUnitreeB2RobotAsset,
  type UnitreeB2InventoryPayload,
  type UnitreeB2RobotAssetSpec,
} from './contracts';

export {
  UNITREE_B2_CATALOG_ENTRY,
  UNITREE_B2_DEFAULT_PROFILE_ID,
  unitreeB2DefaultName,
  unitreeB2Endpoint,
  unitreeB2NameSequence,
  unitreeB2OverviewAttributes,
  type UnitreeB2OverviewAttr,
} from './catalog';
