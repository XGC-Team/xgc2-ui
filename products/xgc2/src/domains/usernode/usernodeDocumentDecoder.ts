import { decodeConfigResourceBranch,decodeConfigResourceHead } from '../../shared/configResourceDecoder';
import {
  protocolEnum,
  protocolField,
  protocolObject,
  protocolRequiredArray,
  protocolRequiredBoolean,
  protocolRequiredInteger,
  protocolRequiredString,
  protocolRequiredStringArray,
  protocolString,
} from '../../shared/strictProtocolDecoder';
import {
  USERNODE_DOMAIN,
  USERNODE_INPUT_KINDS,
  USERNODE_INTERPRETERS,
  USERNODE_SCHEMA_VERSION,
  type UsernodeAssetDocument,
  type UsernodeAssetSpec,
  type UsernodeScriptInput,
} from './usernodeContractsPublic';
import { validateUsernodeAssetSpec } from './usernodeValidation';

export function decodeUsernodeAssetDocument(value: unknown): UsernodeAssetDocument {
  const path = 'User script asset document';
  const document = protocolObject(value,path,['head','branch','spec']);
  const head = decodeConfigResourceHead(protocolField(document,'head',path),USERNODE_DOMAIN,`${path}.head`);
  const branch = decodeConfigResourceBranch(protocolField(document,'branch',path),USERNODE_DOMAIN,`${path}.branch`);
  if (branch.resourceId !== head.resourceId) {
    throw new Error(`Protocol error: ${path}.branch.resourceId must match ${path}.head.resourceId.`);
  }
  const spec = decodeUsernodeAssetSpec(protocolField(document,'spec',path),`${path}.spec`);
  const validationError = validateUsernodeAssetSpec(spec);
  if (validationError) throw new Error(`Protocol error: ${path}.spec is invalid: ${validationError}`);
  return { head,branch,spec };
}

function decodeUsernodeAssetSpec(value: unknown,path: string): UsernodeAssetSpec {
  const spec = protocolObject(value,path,[
    'schemaVersion','name','description','tags','interpreter','source','package','executable',
    'launchFile','defaultArgs','setupScripts','env','timeoutSeconds','inputs',
  ]);
  const schemaVersion = protocolRequiredInteger(spec,'schemaVersion',path);
  if (schemaVersion !== USERNODE_SCHEMA_VERSION) {
    throw new Error(`Protocol error: ${path}.schemaVersion must be ${USERNODE_SCHEMA_VERSION}.`);
  }
  return {
    schemaVersion,
    name: protocolRequiredString(spec,'name',path),
    description: protocolRequiredString(spec,'description',path),
    tags: protocolRequiredStringArray(spec,'tags',path),
    interpreter: protocolEnum(protocolField(spec,'interpreter',path),USERNODE_INTERPRETERS,`${path}.interpreter`),
    source: protocolRequiredString(spec,'source',path),
    package: protocolRequiredString(spec,'package',path),
    executable: protocolRequiredString(spec,'executable',path),
    launchFile: protocolRequiredString(spec,'launchFile',path),
    defaultArgs: protocolRequiredStringArrayAllowNull(spec,'defaultArgs',path),
    setupScripts: protocolRequiredStringArrayAllowNull(spec,'setupScripts',path),
    env: decodeUsernodeEnv(protocolField(spec,'env',path),`${path}.env`),
    timeoutSeconds: protocolRequiredInteger(spec,'timeoutSeconds',path),
    inputs: protocolRequiredArray(spec,'inputs',path)
      .map((item,index) => decodeUsernodeScriptInput(item,`${path}.inputs[${index}]`)),
  };
}

/** Go encodes a nil string slice as JSON null; the protocol still wants an array. */
function protocolRequiredStringArrayAllowNull(
  record: { readonly [key: string]: unknown },
  key: string,
  path: string,
): string[] {
  const value = protocolField(record,key,path);
  if (value === null) return [];
  return protocolRequiredStringArray(record,key,path);
}

function decodeUsernodeEnv(value: unknown,path: string): Record<string,string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Protocol error: ${path} must be an object.`);
  }
  const result: Record<string,string> = {};
  for (const [name,item] of Object.entries(value as Record<string,unknown>)) {
    result[name] = protocolString(item,`${path}.${name}`);
  }
  return result;
}

function decodeUsernodeScriptInput(value: unknown,path: string): UsernodeScriptInput {
  const input = protocolObject(value,path,['name','kind','required','default','description']);
  return {
    name: protocolRequiredString(input,'name',path),
    kind: protocolEnum(protocolField(input,'kind',path),USERNODE_INPUT_KINDS,`${path}.kind`),
    required: protocolRequiredBoolean(input,'required',path),
    default: protocolRequiredString(input,'default',path),
    description: protocolRequiredString(input,'description',path),
  };
}
