import {
  interpreterUsesSource,
  isUsernodeInputKind,
  isUsernodeInterpreter,
  USERNODE_DEFAULT_TIMEOUT_SECONDS,
  USERNODE_SCHEMA_VERSION,
  type UsernodeAssetSpec,
  type UsernodeInputKind,
  type UsernodeInterpreter,
  type UsernodeScriptInput,
} from './usernodeContractsPublic';

export function newUsernodeAssetSpec(name = ''): UsernodeAssetSpec {
  return {
    schemaVersion: USERNODE_SCHEMA_VERSION,
    name,
    description: '',
    tags: [],
    interpreter: 'bash',
    source: '#!/usr/bin/env bash\nset -euo pipefail\n\necho "hello from XGC2"\n',
    package: '',
    executable: '',
    launchFile: '',
    defaultArgs: [],
    setupScripts: [],
    env: {},
    timeoutSeconds: USERNODE_DEFAULT_TIMEOUT_SECONDS,
    inputs: [],
  };
}

export function newUsernodeScriptInput(kind: UsernodeInputKind = 'string'): UsernodeScriptInput {
  return { name: '',kind,required: false,default: '',description: '' };
}

/**
 * normalizeUsernodeAssetSpec mirrors the Core canonicalization: the fields that
 * do not belong to the selected interpreter are cleared rather than sent, so an
 * operator switching interpreters cannot commit a contradictory payload.
 */
export function normalizeUsernodeAssetSpec(spec: UsernodeAssetSpec): UsernodeAssetSpec {
  if (!isUsernodeInterpreter(spec.interpreter)) {
    throw new Error(`User script interpreter "${String(spec.interpreter)}" is invalid.`);
  }
  const interpreter: UsernodeInterpreter = spec.interpreter;
  const usesSource = interpreterUsesSource(interpreter);
  return {
    schemaVersion: USERNODE_SCHEMA_VERSION,
    name: normalizedText(spec.name),
    description: normalizedText(spec.description),
    tags: normalizedTags(spec.tags),
    interpreter,
    source: usesSource ? normalizedSource(spec.source) : '',
    package: usesSource ? '' : spec.package.trim(),
    executable: interpreter === 'rosrun' ? spec.executable.trim() : '',
    launchFile: interpreter === 'roslaunch' ? spec.launchFile.trim() : '',
    defaultArgs: normalizedList(spec.defaultArgs),
    setupScripts: normalizedList(spec.setupScripts),
    env: normalizedEnv(spec.env),
    timeoutSeconds: spec.timeoutSeconds || USERNODE_DEFAULT_TIMEOUT_SECONDS,
    inputs: spec.inputs.map((input) => {
      if (!isUsernodeInputKind(input.kind)) throw new Error(`User script input kind "${String(input.kind)}" is invalid.`);
      return {
        name: input.name.trim(),
        kind: input.kind,
        required: Boolean(input.required),
        default: normalizedText(input.default),
        description: normalizedText(input.description),
      };
    }).sort((left,right) => left.name.localeCompare(right.name)),
  };
}

/** Core stores the source verbatim apart from line endings and trailing blanks. */
function normalizedSource(value: string): string {
  return value.replace(/\r\n/g,'\n').replace(/[ \t\n]+$/,'');
}

function normalizedTags(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizedText).filter(Boolean))).sort();
}

/** Arguments and setup scripts are positional, so order and duplicates survive. */
function normalizedList(values: string[]): string[] {
  return values.map(normalizedText).filter(Boolean);
}

function normalizedEnv(values: Record<string,string>): Record<string,string> {
  const result: Record<string,string> = {};
  for (const [name,value] of Object.entries(values)) {
    const trimmed = name.trim();
    if (trimmed) result[trimmed] = value.normalize('NFC');
  }
  return result;
}

function normalizedText(value: string): string {
  return value.trim().normalize('NFC');
}
