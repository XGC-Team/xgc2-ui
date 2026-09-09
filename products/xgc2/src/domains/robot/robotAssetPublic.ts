export {
  MECANUM_UGV_KIND,
  PX4_MODEL_FS150,
  PX4_MODEL_MOCAP_ROTOR,
  PX4_MOCAP_ROTOR_PROFILE_ID,
  PX4_MULTIROTOR_KIND,
  ROBOT_DOMAIN,
  SCOUT_MINI_KIND,
  isContributedRobotAsset,
  isMecanumRobotAsset,
  isPX4RobotAsset,
  isScoutRobotAsset,
  px4RobotModelId,
  robotAssetProtocolKind,
} from './robotAssetContracts';
export type {
  ContributedRobotAssetSpec,
  MecanumRobotAssetSpec,
  PX4RobotAssetSpec,
  RobotAssetDocument,
  RobotAssetSpec,
  RobotNamespace,
  RobotSimulationConfig,
  ScoutRobotAssetSpec,
} from './robotAssetTypes';
export {
  normalizeRobotAssetSpec,
  normalizeRobotNamespace,
  validRobotProfileId,
  validateRobotAssetSpec,
} from './robotAssetAuthoring';
export {
  decodeRobotAssetDocument,
  defaultPhysicalMavrosLocalPort,
  defaultSimulationMavrosLocalPort,
  defaultSimulationPx4RemotePort,
} from './robotAssetDecoder';
export {
  archiveRobotAsset,
  archiveRobotNamespace,
  commitRobotAsset,
  createRobotAsset,
  createRobotNamespace,
  checkRobotAssetReachability,
  getRobotAsset,
  isRobotAssetCASConflict,
  listRobotAssets,
  listRobotNamespaces,
  updateRobotNamespace,
} from './robotAssetService';
export { useRobotAssetStore } from './robotAssetStore';
export { useRobotAssetReachability } from './useRobotAssetReachability';
export type { RobotAssetReachabilityState } from './useRobotAssetReachability';
export { useRobotText } from './robotMessages';
export { robotAssetDocumentHash,robotAssetListHash } from './robotAssetNavigation';
export {
  defaultRobotProfileIds,
  isBuiltinRobotCatalogKind,
  robotAssetEndpoint,
  robotAssetKind,
  robotAssetKindLabel,
  robotAssetOverviewAttributes,
  supportedPX4ProductModels,
  supportedRobotKinds,
  supportedRobotModels,
  supportedRobotModelsForKind,
} from './robotAssetCatalog';
export {
  ROBOT_CHASSIS_MECANUM,
  ROBOT_CHASSIS_MULTIROTOR,
  ROBOT_CHASSIS_UNICYCLE,
  robotAssetChassisClass,
  robotAssetChassisLabel,
  robotAssetVendorLabel,
  robotChassisFolderEntries,
  robotChassisSelectOptions,
  robotVendorOptionsForChassis,
} from './robotAssetChassis';
export type {
  BuiltinRobotCatalogKind,
  RobotModelOption,
  SupportedRobotKind,
} from './robotAssetCatalog';
/** Generic admission — Experiment production must use these, not kind-name checks. */
export {
  EXPERIMENT_CAPABLE_ROBOT_ADMISSION,
  UNKNOWN_ROBOT_KIND_ADMISSION,
  assertRobotAssetExperimentProjection,
  robotAssetAdmission,
  robotAssetAllowsExperimentProjection,
  robotAssetAllowsSimulation,
  robotAssetExperimentDisabledReason,
} from './robotAssetAdmission';
export type { RobotKindAdmission } from './robotAssetAdmission';
/** Static kind composition seam for product roots / tests / fixtures. */
export {
  RobotAssetKindCompositionProvider,
  assembleRobotAssetKindComposition,
  defineContributedRobotAssetKind,
  defineRobotAssetKindContributionIdentity,
  emptyRobotAssetKindComposition,
  robotAssetKindAdmissionForProtocolKind,
  robotAssetKindCatalogEntries,
  robotAssetKindCompositionWireArms,
  robotAssetKindContributionByCatalogId,
  robotAssetKindContributionByProtocolKind,
  robotAssetKindDefaultProfileIds,
  useOptionalRobotAssetKindComposition,
} from './robotAssetKindComposition';
export { useRobotAssetKindComposition } from './useRobotAssetKindComposition';
export type {
  ContributedRobotAssetKind,
  RobotAssetCommonFields,
  RobotAssetKindCatalogEntry,
  RobotAssetKindComposition,
  RobotAssetKindContribution,
  RobotAssetKindContributionIdentity,
  RobotAssetKindInventoryEditor,
  RobotAssetKindInventoryEditorProps,
  RobotAssetKindPanelProjection,
  RobotAssetKindWireAdapter,
  RobotAssetOverviewAttr,
  RobotExperimentBindingAdapter,
  RobotKindPanelChannel,
  RobotKindPanelHealthInput,
  RobotKindPanelHealthTone,
  RobotKindPanelRenderProps,
  RobotProductModelOption,
  RobotProductTelemetryProjection,
  RobotAssetWireResult,
} from './robotAssetKindComposition';
export {
  builtInRobotAssetKindComposition,
  builtInRobotAssetKindContributions,
  mecanumRobotAssetKindContribution,
  px4RobotAssetKindContribution,
  px4RobotAssetKindContributionForModels,
  scoutRobotAssetKindContribution,
} from './builtInRobotAssetKindContributions';
