import {
  protocolField,
  protocolObject,
  protocolRequiredInteger,
  protocolRequiredString,
} from '../../../../shared/strictProtocolDecoder';
import {
  UNITREE_B2_KIND,
  UNITREE_B2_PAYLOAD_FIELDS,
  UNITREE_B2_WIRE_ARM,
  type UnitreeB2InventoryPayload,
  type UnitreeB2RobotAssetSpec,
} from './contracts';

/**
 * Decode the current unitreeB2 inventory arm from a protocol object already
 * known to have kind=unitree_b2. All five inventory facts are mandatory.
 */
export function decodeUnitreeB2InventoryPayload(
  unitreeB2Value: unknown,
  path: string,
): UnitreeB2InventoryPayload {
  const b2Path = `${path}.${UNITREE_B2_WIRE_ARM}`;
  const unitreeB2 = protocolObject(
    unitreeB2Value,
    b2Path,
    [...UNITREE_B2_PAYLOAD_FIELDS],
  );
  return {
    serialNumber: protocolRequiredString(unitreeB2, 'serialNumber', b2Path),
    robotAddress: protocolRequiredString(unitreeB2, 'robotAddress', b2Path),
    rosDomainId: protocolRequiredInteger(unitreeB2, 'rosDomainId', b2Path),
    sshUsername: protocolRequiredString(unitreeB2, 'sshUsername', b2Path),
    sshPassword: protocolRequiredString(unitreeB2, 'sshPassword', b2Path),
  };
}

/** Build a full B2 asset spec from common base fields + decoded inventory arm. */
export function unitreeB2SpecFromDecoded(
  common: {
    name: string;
    description: string;
    tags: string[];
    profileId: string;
  },
  unitreeB2: UnitreeB2InventoryPayload,
): UnitreeB2RobotAssetSpec {
  return {
    ...common,
    kind: UNITREE_B2_KIND,
    unitreeB2,
  };
}

/** Read the unitreeB2 field from a parent protocol object. */
export function unitreeB2WireField(spec: Record<string, unknown>, path: string) {
  return protocolField(spec, UNITREE_B2_WIRE_ARM, path);
}
