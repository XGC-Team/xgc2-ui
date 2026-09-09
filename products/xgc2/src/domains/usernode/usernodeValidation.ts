import {
  interpreterUsesSource,
  isUsernodeInputKind,
  isUsernodeInterpreter,
  USERNODE_MAX_SOURCE_BYTES,
  USERNODE_SCHEMA_VERSION,
  type UsernodeAssetSpec,
  type UsernodeInputKind,
} from './usernodeContractsPublic';

const INPUT_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const ROS_PACKAGE = /^[A-Za-z][A-Za-z0-9_]{0,127}$/;
const ROS_MEMBER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const NUMBER_VALUE = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+)?$/;

/**
 * validateUsernodeAssetSpec mirrors the Core contract so an operator sees the
 * failure while editing. It deliberately reviews structure only: the product
 * performs no safety analysis of script content.
 */
export function validateUsernodeAssetSpec(spec: UsernodeAssetSpec): string {
  if (spec.schemaVersion !== USERNODE_SCHEMA_VERSION) return `Unsupported user script schema version ${spec.schemaVersion}.`;
  if (!spec.name.trim()) return 'User script name is required.';
  if (!isUsernodeInterpreter(spec.interpreter)) return 'User script interpreter is invalid.';

  const payloadError = validatePayload(spec);
  if (payloadError) return payloadError;

  if (!Number.isInteger(spec.timeoutSeconds) || spec.timeoutSeconds < 1 || spec.timeoutSeconds > 86400) {
    return 'Timeout must be a whole number of seconds between 1 and 86400.';
  }
  if (spec.setupScripts.length > 8) return 'A user script may source at most 8 setup scripts.';
  for (const path of spec.setupScripts) {
    if (!path.startsWith('/') || path.includes('..')) return `Setup script "${path}" must be an absolute path without "..".`;
  }
  if (spec.defaultArgs.length > 64) return 'A user script may declare at most 64 default arguments.';
  if (spec.interpreter === 'roslaunch') {
    const invalid = spec.defaultArgs.find((argument) => !argument.includes(':='));
    if (invalid) return `roslaunch argument "${invalid}" must use the key:=value form.`;
  }

  const envNames = Object.keys(spec.env);
  if (envNames.length > 32) return 'A user script may declare at most 32 environment values.';
  for (const name of envNames) {
    if (!ENV_NAME.test(name)) return `Environment name "${name}" is invalid.`;
    if (name.startsWith('XGC_IN_')) return `Environment name "${name}" is reserved for declared inputs.`;
  }

  return validateInputs(spec);
}

function validatePayload(spec: UsernodeAssetSpec): string {
  if (interpreterUsesSource(spec.interpreter)) {
    if (!spec.source.trim()) return 'A bash or python3 user script requires a script body.';
    if (new TextEncoder().encode(spec.source).length > USERNODE_MAX_SOURCE_BYTES) {
      return `Script body must be ${USERNODE_MAX_SOURCE_BYTES} bytes or fewer.`;
    }
    return '';
  }
  if (!ROS_PACKAGE.test(spec.package)) return 'A ROS package name is required.';
  if (spec.interpreter === 'rosrun' && !ROS_MEMBER.test(spec.executable)) return 'A ROS executable name is required.';
  if (spec.interpreter === 'roslaunch' && !ROS_MEMBER.test(spec.launchFile)) return 'A ROS launch file name is required.';
  return '';
}

function validateInputs(spec: UsernodeAssetSpec): string {
  if (spec.inputs.length > 32) return 'A user script may declare at most 32 inputs.';
  const names = new Set<string>();
  for (const input of spec.inputs) {
    if (!INPUT_NAME.test(input.name)) {
      return 'Input names must start with a letter and contain at most 64 letters, numbers, or underscores.';
    }
    // Inputs are exported as XGC_IN_<NAME>, so case-insensitive collisions are
    // rejected here exactly as Core rejects them.
    const key = input.name.toUpperCase();
    if (names.has(key)) return `Input name "${input.name}" must be unique.`;
    names.add(key);
    if (!isUsernodeInputKind(input.kind)) return `Input "${input.name}" kind is invalid.`;
    if (input.default) {
      const valueError = usernodeInputValueError(input.kind,input.default);
      if (valueError) return `Input "${input.name}" default ${valueError}`;
    }
  }
  return '';
}

export function usernodeInputValueError(kind: UsernodeInputKind,value: string): string {
  if (value.length > 8192) return 'must be 8192 characters or fewer.';
  if (kind === 'number' && !NUMBER_VALUE.test(value)) return 'must be a number.';
  if (kind === 'boolean' && value !== 'true' && value !== 'false') return 'must be true or false.';
  return '';
}
