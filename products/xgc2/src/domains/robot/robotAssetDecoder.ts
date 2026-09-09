import { decodeConfigResourceBranch, decodeConfigResourceHead } from '../../shared/configResourceDecoder';
import {
  protocolField,
  protocolObject,
  protocolRequiredString,
  protocolRequiredStringArray,
} from '../../shared/strictProtocolDecoder';
import {
  builtInRobotAssetKindComposition,
} from './builtInRobotAssetKindContributions';
import {
  ROBOT_DOMAIN,
  type RobotAssetDocument,
  type RobotAssetSpec,
} from './robotAssetContracts';
import { normalizeRobotAssetSpec, validateRobotAssetSpec } from './robotAssetAuthoring';
import {
  robotAssetKindCompositionWireArms,
  robotAssetKindContributionByProtocolKind,
  type RobotAssetKindComposition,
} from './robotAssetKindComposition';

export {
  defaultPhysicalMavrosLocalPort,
  defaultSimulationMavrosLocalPort,
  defaultSimulationPx4RemotePort,
} from './robotAssetDecoderPorts';

const BASE_SPEC_FIELDS = ['name', 'description', 'tags', 'kind', 'profileId'] as const;

export function decodeRobotAssetDocument(
  value: unknown,
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
): RobotAssetDocument {
  const path = 'Robot asset document';
  const document = protocolObject(value, path, ['head', 'branch', 'spec']);
  const head = decodeConfigResourceHead(protocolField(document, 'head', path), ROBOT_DOMAIN, `${path}.head`);
  const branch = decodeConfigResourceBranch(protocolField(document, 'branch', path), ROBOT_DOMAIN, `${path}.branch`);
  if (branch.resourceId !== head.resourceId) {
    throw new Error(`Protocol error: ${path}.branch.resourceId must match ${path}.head.resourceId.`);
  }
  const spec = decodeRobotAssetSpec(protocolField(document, 'spec', path), `${path}.spec`, composition);
  const issue = validateRobotAssetSpec(spec, composition);
  if (issue) throw new Error(`Protocol error: ${path}.spec is invalid: ${issue}`);
  if (JSON.stringify(normalizeRobotAssetSpec(spec, composition)) !== JSON.stringify(spec)) {
    throw new Error(`Protocol error: ${path}.spec must already be canonical.`);
  }
  return { head, branch, spec };
}

function decodeRobotAssetSpec(
  value: unknown,
  path: string,
  composition: RobotAssetKindComposition,
): RobotAssetSpec {
  const knownWireArms = robotAssetKindCompositionWireArms(composition);
  const spec = protocolObject(
    value,
    path,
    [...BASE_SPEC_FIELDS, ...knownWireArms],
  );
  const common = {
    name: protocolRequiredString(spec, 'name', path),
    description: protocolRequiredString(spec, 'description', path),
    tags: protocolRequiredStringArray(spec, 'tags', path),
    profileId: protocolRequiredString(spec, 'profileId', path),
  };
  const kind = protocolRequiredString(spec, 'kind', path);
  const contribution = robotAssetKindContributionByProtocolKind(composition, kind);
  if (!contribution) {
    throw new Error(`Protocol error: ${path}.kind is unsupported.`);
  }
  // Reject payload arms owned by other composed kinds.
  for (const arm of knownWireArms) {
    if (!contribution.wire.wireArms.includes(arm) && Object.hasOwn(spec, arm)) {
      throw new Error(`Protocol error: ${path} has fields for the wrong robot kind.`);
    }
  }
  return contribution.wire.decode(common, spec, path) as RobotAssetSpec;
}
