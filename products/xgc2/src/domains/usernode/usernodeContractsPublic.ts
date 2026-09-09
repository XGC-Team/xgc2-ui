import type { ConfigResourceBranch,ConfigResourceHead,ConfigResourceNamespace } from '../../shared/configResource';

export const USERNODE_DOMAIN = 'usernode';
export const USERNODE_SCHEMA_VERSION = 1;

export type UsernodeNamespace = ConfigResourceNamespace & { domain: typeof USERNODE_DOMAIN };

export type UsernodeInterpreter = 'bash' | 'python3' | 'rosrun' | 'roslaunch';
export type UsernodeInputKind = 'string' | 'number' | 'boolean';

export const USERNODE_INTERPRETERS = [
  'bash','python3','rosrun','roslaunch',
] as const satisfies readonly UsernodeInterpreter[];

export const USERNODE_INPUT_KINDS = [
  'string','number','boolean',
] as const satisfies readonly UsernodeInputKind[];

export const USERNODE_DEFAULT_TIMEOUT_SECONDS = 600;
export const USERNODE_MAX_SOURCE_BYTES = 262144;

export function isUsernodeInterpreter(value: unknown): value is UsernodeInterpreter {
  return typeof value === 'string' && USERNODE_INTERPRETERS.includes(value as UsernodeInterpreter);
}

export function isUsernodeInputKind(value: unknown): value is UsernodeInputKind {
  return typeof value === 'string' && USERNODE_INPUT_KINDS.includes(value as UsernodeInputKind);
}

/** interpreterUsesSource reports the two interpreters whose payload is an inline body. */
export function interpreterUsesSource(interpreter: UsernodeInterpreter) {
  return interpreter === 'bash' || interpreter === 'python3';
}

export type UsernodeScriptInput = {
  name: string;
  kind: UsernodeInputKind;
  required: boolean;
  default: string;
  description: string;
};

export type UsernodeAssetSpec = {
  schemaVersion: typeof USERNODE_SCHEMA_VERSION;
  name: string;
  description: string;
  tags: string[];
  interpreter: UsernodeInterpreter;
  source: string;
  package: string;
  executable: string;
  launchFile: string;
  defaultArgs: string[];
  setupScripts: string[];
  env: Record<string,string>;
  timeoutSeconds: number;
  inputs: UsernodeScriptInput[];
};

export type UsernodeAssetDocument = {
  head: ConfigResourceHead;
  branch: ConfigResourceBranch;
  spec: UsernodeAssetSpec;
};

export type CreateUsernodeAssetInput = MutationIdentity & { namespaceId?: string;spec: UsernodeAssetSpec;reason: string };
export type CommitUsernodeAssetInput = MutationIdentity & {
  spec: UsernodeAssetSpec;
  baseCommitId: string;
  expectedBranchRevision: number;
  expectedResourceRevision: number;
  namespaceId?: string;
  reason: string;
};
export type ArchiveUsernodeAssetInput = MutationIdentity & { expectedRevision: number;reason: string };
export type CreateUsernodeNamespaceInput = MutationIdentity & { parentNamespaceId?: string;name: string };
export type UpdateUsernodeNamespaceInput = MutationIdentity & { name?: string;parentNamespaceId?: string;expectedRevision: number };
export type ArchiveUsernodeNamespaceInput = MutationIdentity & { expectedRevision: number };

type MutationIdentity = { requestId?: string;idempotencyKey?: string };
