/**
 * Robot assets list grouping is dynamics / chassis class, not firmware or brand.
 *
 * The product list has exactly three chassis folders:
 * Multirotor, Mecanum, Unicycle. Scout Mini is a differential platform in
 * hardware, but ground control treats it as Unicycle — it belongs in that
 * folder. Vendor / firmware (PX4, Wheeltec, Scout) is an asset field.
 */

import { builtInRobotAssetKindComposition } from './builtInRobotAssetKindContributions';
import {
  robotAssetKindContributionByCatalogId,
  robotAssetKindContributionByProtocolKind,
  type RobotAssetKindComposition,
} from './robotAssetKindComposition';
import {
  isMecanumRobotAsset,
  isPX4RobotAsset,
  isScoutRobotAsset,
  type RobotAssetDocument,
  type RobotAssetSpec,
} from './robotAssetContracts';

export const ROBOT_CHASSIS_MULTIROTOR = 'multirotor';
export const ROBOT_CHASSIS_MECANUM = 'mecanum';
export const ROBOT_CHASSIS_UNICYCLE = 'unicycle';
export const ROBOT_CHASSIS_FILTER_ALL = 'all';

export const ROBOT_VENDOR_PX4 = 'PX4';
export const ROBOT_VENDOR_WHEELTEC = 'Wheeltec';
export const ROBOT_VENDOR_SCOUT = 'Scout';

export type RobotChassisClassId =
  | typeof ROBOT_CHASSIS_MULTIROTOR
  | typeof ROBOT_CHASSIS_MECANUM
  | typeof ROBOT_CHASSIS_UNICYCLE;

export type RobotChassisClassEntry = {
  readonly id: string;
  readonly label: string;
};

export type RobotChassisFilterId = typeof ROBOT_CHASSIS_FILTER_ALL | RobotChassisClassId;

export type RobotVendorOption = {
  readonly id: string;
  readonly label: string;
};

type ChassisBinding = {
  readonly chassisClass: RobotChassisClassId;
  readonly vendorLabel: string;
};

/** Product chassis folders — never Differential, Ackermann, or a brand name. */
export const ROBOT_CHASSIS_CLASSES: readonly RobotChassisClassEntry[] = Object.freeze([
  Object.freeze({ id: ROBOT_CHASSIS_MULTIROTOR, label: 'Multirotor' }),
  Object.freeze({ id: ROBOT_CHASSIS_MECANUM, label: 'Mecanum' }),
  Object.freeze({ id: ROBOT_CHASSIS_UNICYCLE, label: 'Unicycle' }),
]);

/**
 * Catalog id → chassis + vendor. Keys are catalog ids, not protocol kinds.
 * Optional leaf catalog ids are not named here.
 */
const CHASSIS_BY_CATALOG_ID: Readonly<Record<string, ChassisBinding>> = Object.freeze({
  px4: Object.freeze({ chassisClass: ROBOT_CHASSIS_MULTIROTOR, vendorLabel: ROBOT_VENDOR_PX4 }),
  mecanum: Object.freeze({ chassisClass: ROBOT_CHASSIS_MECANUM, vendorLabel: ROBOT_VENDOR_WHEELTEC }),
  scout: Object.freeze({
    chassisClass: ROBOT_CHASSIS_UNICYCLE,
    vendorLabel: ROBOT_VENDOR_SCOUT,
  }),
});

type Translate = (message: string) => string;

function identityTranslate(message: string) {
  return message;
}

function chassisEntry(id: string): RobotChassisClassEntry | undefined {
  return ROBOT_CHASSIS_CLASSES.find((entry) => entry.id === id);
}

function bindingForCatalogId(catalogId: string): ChassisBinding | undefined {
  return CHASSIS_BY_CATALOG_ID[catalogId];
}

export function robotChassisClassForCatalogId(catalogId: string): string {
  return bindingForCatalogId(catalogId)?.chassisClass ?? catalogId;
}

export function robotVendorLabelForCatalogId(
  catalogId: string,
  fallbackLabel = catalogId,
): string {
  return bindingForCatalogId(catalogId)?.vendorLabel ?? fallbackLabel;
}

export function robotChassisLabelForClass(
  chassisClass: string,
  t: Translate = identityTranslate,
): string {
  const entry = chassisEntry(chassisClass);
  return t(entry?.label ?? chassisClass);
}

export function robotAssetChassisClass(
  spec: RobotAssetSpec,
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
): string {
  const contribution = robotAssetKindContributionByProtocolKind(composition, spec.kind);
  if (contribution) return robotChassisClassForCatalogId(contribution.catalog.id);
  if (isPX4RobotAsset(spec)) return ROBOT_CHASSIS_MULTIROTOR;
  if (isMecanumRobotAsset(spec)) return ROBOT_CHASSIS_MECANUM;
  if (isScoutRobotAsset(spec)) return ROBOT_CHASSIS_UNICYCLE;
  return spec.kind;
}

export function robotAssetChassisLabel(
  value: RobotAssetSpec | RobotAssetDocument,
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
  t: Translate = identityTranslate,
): string {
  const spec = robotAssetSpec(value);
  return robotChassisLabelForClass(robotAssetChassisClass(spec, composition), t);
}

export function robotAssetVendorLabel(
  value: RobotAssetSpec | RobotAssetDocument,
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
): string {
  const spec = robotAssetSpec(value);
  const contribution = robotAssetKindContributionByProtocolKind(composition, spec.kind);
  if (contribution) {
    return robotVendorLabelForCatalogId(contribution.catalog.id, contribution.catalog.label);
  }
  if (isPX4RobotAsset(spec)) return ROBOT_VENDOR_PX4;
  if (isMecanumRobotAsset(spec)) return ROBOT_VENDOR_WHEELTEC;
  if (isScoutRobotAsset(spec)) return ROBOT_VENDOR_SCOUT;
  return spec.kind;
}

function robotAssetSpec(value: RobotAssetSpec | RobotAssetDocument): RobotAssetSpec {
  return 'head' in value && 'branch' in value && 'spec' in value
    ? (value as RobotAssetDocument).spec
    : value as RobotAssetSpec;
}

/** List toolbar: All plus the three product chassis folders. */
export function robotChassisFilterOptions(
  t: Translate = identityTranslate,
): ReadonlyArray<{ value: string; label: string }> {
  return [
    { value: ROBOT_CHASSIS_FILTER_ALL, label: t('All') },
    ...ROBOT_CHASSIS_CLASSES.map((entry) => ({ value: entry.id, label: t(entry.label) })),
  ];
}

/** List folders are always the three product chassis classes. */
export function robotChassisFolderEntries(
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
  t: Translate = identityTranslate,
): ReadonlyArray<{ id: string; title: string }> {
  void composition;
  return ROBOT_CHASSIS_CLASSES.map((entry) => ({ id: entry.id, title: t(entry.label) }));
}

/** Chassis options that have at least one vendor/firmware stack. */
export function robotChassisSelectOptions(
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
  t: Translate = identityTranslate,
): ReadonlyArray<{ id: string; label: string }> {
  const present = new Set(
    composition.contributions.map((contribution) => (
      robotChassisClassForCatalogId(contribution.catalog.id)
    )),
  );
  const product = ROBOT_CHASSIS_CLASSES
    .filter((entry) => present.has(entry.id))
    .map((entry) => ({ id: entry.id, label: t(entry.label) }));
  const extra = composition.contributions
    .filter((contribution) => !bindingForCatalogId(contribution.catalog.id))
    .map((contribution) => ({
      id: contribution.catalog.id,
      label: t(contribution.catalog.label),
    }));
  return [...product, ...extra];
}

/** Firmware / vendor stacks available for one chassis class. */
export function robotVendorOptionsForChassis(
  chassisClass: string,
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
): readonly RobotVendorOption[] {
  return composition.contributions
    .filter((contribution) => robotChassisClassForCatalogId(contribution.catalog.id) === chassisClass)
    .map((contribution) => ({
      id: contribution.catalog.id,
      label: robotVendorLabelForCatalogId(contribution.catalog.id, contribution.catalog.label),
    }));
}

export function robotFirstVendorCatalogIdForChassis(
  chassisClass: string,
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
): string | undefined {
  return robotVendorOptionsForChassis(chassisClass, composition)[0]?.id;
}

export function robotChassisClassForDraftKind(
  catalogId: string,
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
): string {
  const contribution = robotAssetKindContributionByCatalogId(composition, catalogId);
  if (contribution) return robotChassisClassForCatalogId(contribution.catalog.id);
  return robotChassisClassForCatalogId(catalogId);
}
