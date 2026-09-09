import {
  builtInRobotAssetKindComposition,
} from './builtInRobotAssetKindContributions';
import {
  PX4_MODEL_FS150,
  isMecanumRobotAsset,
  isPX4RobotAsset,
  isScoutRobotAsset,
  px4RobotModelId,
  robotAssetProtocolKind,
  type RobotAssetDocument,
  type RobotAssetSpec,
} from './robotAssetContracts';
import {
  robotAssetKindCatalogEntries,
  robotAssetKindContributionByCatalogId,
  robotAssetKindContributionByProtocolKind,
  robotAssetKindDefaultProfileIds,
  type RobotAssetKindComposition,
  type RobotAssetOverviewAttr,
  type RobotModelOption,
  type RobotProductModelOption,
} from './robotAssetKindComposition';
import { mavrosFcuUrl, vrpnPoseTopic } from './robotAssetConnectionAuthoring';

export type { RobotModelOption };

/** Built-in catalog ids for shared physical editor branches. */
export type BuiltinRobotCatalogKind = 'px4' | 'scout' | 'mecanum';

/** Catalog / folder id from composition (built-in or contributed). */
export type SupportedRobotKind = string;

export type SimulatableRobotKind = BuiltinRobotCatalogKind;

export function supportedRobotKinds(
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
): ReadonlyArray<{ id: string; label: string }> {
  return robotAssetKindCatalogEntries(composition).map((entry) => ({
    id: entry.id,
    label: entry.label,
  }));
}

export function defaultRobotProfileIds(
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
): Readonly<Record<string, string>> {
  return robotAssetKindDefaultProfileIds(composition);
}

/** Simulation models for a simulatable catalog kind (empty when inventory-only / unknown). */
export function supportedRobotModelsForKind(
  catalogId: string,
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
): readonly RobotModelOption[] {
  return robotAssetKindContributionByCatalogId(composition, catalogId)?.simulationModels ?? [];
}

/** Concrete PX4 products beneath the shared PX4 Multirotor kind. */
export function supportedPX4ProductModels(
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
): readonly RobotProductModelOption[] {
  return robotAssetKindContributionByCatalogId(composition, 'px4')?.productModels ?? [];
}

/**
 * Built-in simulation model tables (PX4 / Scout / Mecanum).
 * Contributed inventory-only kinds are intentionally absent.
 */
export function supportedRobotModels(
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
): Readonly<Record<BuiltinRobotCatalogKind, RobotModelOption[]>> {
  return {
    px4: [...supportedRobotModelsForKind('px4', composition)],
    scout: [...supportedRobotModelsForKind('scout', composition)],
    mecanum: [...supportedRobotModelsForKind('mecanum', composition)],
  };
}

export function robotAssetKind(
  spec: RobotAssetSpec,
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
): SupportedRobotKind {
  const contribution = robotAssetKindContributionByProtocolKind(composition, spec.kind);
  if (contribution) return contribution.catalog.id;
  if (isPX4RobotAsset(spec)) return 'px4';
  if (isMecanumRobotAsset(spec)) return 'mecanum';
  if (isScoutRobotAsset(spec)) return 'scout';
  return spec.kind;
}

export function robotAssetKindLabel(
  value: RobotAssetSpec | RobotAssetDocument,
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
) {
  const protocolKind = robotAssetProtocolKind(value);
  const contribution = robotAssetKindContributionByProtocolKind(composition, protocolKind);
  if (contribution) return contribution.catalog.label;
  if (isPX4RobotAsset(value)) return 'PX4 multirotor';
  if (isMecanumRobotAsset(value)) return 'Mecanum UGV';
  if (isScoutRobotAsset(value)) return 'Scout Mini';
  return protocolKind;
}

export function robotAssetEndpoint(
  document: RobotAssetDocument,
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
) {
  const contribution = robotAssetKindContributionByProtocolKind(composition, document.spec.kind);
  if (contribution) return contribution.endpoint(document.spec);
  if (isPX4RobotAsset(document)) return document.spec.px4.managementIp;
  if (isMecanumRobotAsset(document)) return document.spec.mecanum.mocapRigidBodyName;
  if (isScoutRobotAsset(document)) return document.spec.scout.managementAddress;
  return '';
}

/**
 * Kind-specific connection / identity parameters for list cards.
 * Built-in physical kinds enrich contribution overview with derived topics;
 * contributed inventory-only kinds use the contribution overview as-is.
 */
export function robotAssetOverviewAttributes(
  asset: RobotAssetDocument,
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
): RobotAssetOverviewAttr[] {
  if (isPX4RobotAsset(asset)) {
    const px4 = asset.spec.px4;
    const modelId = px4RobotModelId(asset.spec);
    const model = supportedPX4ProductModels(composition).find((candidate) => candidate.id === modelId);
    const directMavros = model?.directMavros ?? modelId === PX4_MODEL_FS150;
    const rows: RobotAssetOverviewAttr[] = [
      { id: 'model', label: 'Model', value: model?.label ?? modelId },
      { id: 'mav-system-id', label: 'MAV sys ID', value: String(px4.mavSystemId) },
      { id: 'remote-ip', label: directMavros ? 'Remote IP' : 'Onboard IP', value: px4.managementIp || '—' },
      { id: 'mocap', label: directMavros ? 'Mocap' : 'Onboard mocap', value: px4.mocapRigidBodyName || '—' },
    ];
    if (directMavros) {
      rows.splice(3, 0,
        { id: 'mavlink-local', label: 'MAVLink local port', value: String(px4.physicalMavrosLocalPort) },
        { id: 'mavlink-remote', label: 'MAVLink remote port', value: String(px4.physicalFcuRemotePort) },
      );
      rows.push({ id: 'vrpn-pose', label: 'VRPN pose', value: vrpnPoseTopic(px4.mocapRigidBodyName) });
      rows.push({
        id: 'mavros-fcu',
        label: 'MAVROS FCU URL',
        value: mavrosFcuUrl(
          px4.physicalMavrosLocalPort,
          px4.managementIp,
          px4.physicalFcuRemotePort,
        ) || '—',
      });
    } else {
      rows.push({ id: 'telemetry', label: 'Ground telemetry', value: 'Zenoh · read only' });
    }
    return rows;
  }
  if (isMecanumRobotAsset(asset)) {
    const mecanum = asset.spec.mecanum;
    return [
      { id: 'remote-ip', label: 'Remote IP', value: mecanum.managementAddress || '—' },
      { id: 'connector', label: 'Connector', value: mecanum.connector || '—' },
      { id: 'telemetry-remote', label: 'Telemetry', value: String(mecanum.telemetryRemotePort || '—') },
      { id: 'control-local', label: 'Control local', value: String(mecanum.controlLocalPort || '—') },
      { id: 'mocap', label: 'Mocap', value: mecanum.mocapRigidBodyName || '—' },
      { id: 'vrpn-pose', label: 'VRPN pose', value: vrpnPoseTopic(mecanum.mocapRigidBodyName) },
    ];
  }
  if (isScoutRobotAsset(asset)) {
    const scout = asset.spec.scout;
    return [
      { id: 'remote-ip', label: 'Remote IP', value: scout.managementAddress || '—' },
      { id: 'connector', label: 'Connector', value: scout.connector || '—' },
      { id: 'telemetry-remote', label: 'Telemetry', value: String(scout.telemetryRemotePort || '—') },
      { id: 'control-local', label: 'Control local', value: String(scout.controlLocalPort || '—') },
      { id: 'mocap', label: 'Mocap', value: scout.mocapRigidBodyName || '—' },
      { id: 'vrpn-pose', label: 'VRPN pose', value: vrpnPoseTopic(scout.mocapRigidBodyName) },
    ];
  }
  const contribution = robotAssetKindContributionByProtocolKind(composition, asset.spec.kind);
  if (contribution) {
    return [...contribution.overviewAttributes(asset.spec)];
  }
  return [];
}

export function isBuiltinRobotCatalogKind(kind: string): kind is BuiltinRobotCatalogKind {
  return kind === 'px4' || kind === 'scout' || kind === 'mecanum';
}
