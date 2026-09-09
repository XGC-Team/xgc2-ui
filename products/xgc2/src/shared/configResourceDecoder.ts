import type { ConfigResourceBranch,ConfigResourceHead } from './configResource';
import {
  protocolObject,
  protocolOptionalBoolean,
  protocolOptionalString,
  protocolRequiredArray,
  protocolRequiredInteger,
  protocolRequiredString,
  protocolStringArray,
} from './strictProtocolDecoder';

const HEAD_FIELDS = [
  'domain','resourceId','namespaceId','system','originResourceId','originCommitId','name','description','tags',
  'mainCommitId','currentVersion','digest','revision','archived','createdAt','updatedAt',
] as const;

const BRANCH_FIELDS = [
  'domain','resourceId','name','headCommitId','headVersion','revision','createdFromCommitId','archived','createdAt','updatedAt',
] as const;

export function decodeConfigResourceHead(value: unknown,expectedDomain: string,path: string): ConfigResourceHead {
  const record = protocolObject(value,path,HEAD_FIELDS);
  const domain = protocolRequiredString(record,'domain',path);
  if (domain !== expectedDomain) {
    throw new Error(`Protocol error: ${path}.domain must be "${expectedDomain}".`);
  }
  const namespaceId = protocolOptionalString(record,'namespaceId',path);
  const system = protocolOptionalBoolean(record,'system',path);
  const originResourceId = protocolOptionalString(record,'originResourceId',path);
  const originCommitId = protocolOptionalString(record,'originCommitId',path);
  const description = protocolOptionalString(record,'description',path);
  const archived = protocolOptionalBoolean(record,'archived',path);
  return {
    domain,
    resourceId: protocolRequiredString(record,'resourceId',path),
    ...(namespaceId === undefined ? {} : { namespaceId }),
    ...(system === undefined ? {} : { system }),
    ...(originResourceId === undefined ? {} : { originResourceId }),
    ...(originCommitId === undefined ? {} : { originCommitId }),
    name: protocolRequiredString(record,'name',path),
    ...(description === undefined ? {} : { description }),
    tags: protocolStringArray(protocolRequiredArray(record,'tags',path),`${path}.tags`),
    mainCommitId: protocolRequiredString(record,'mainCommitId',path),
    currentVersion: protocolRequiredInteger(record,'currentVersion',path),
    digest: protocolRequiredString(record,'digest',path),
    revision: protocolRequiredInteger(record,'revision',path),
    ...(archived === undefined ? {} : { archived }),
    createdAt: protocolRequiredString(record,'createdAt',path),
    updatedAt: protocolRequiredString(record,'updatedAt',path),
  };
}

export function decodeConfigResourceBranch(value: unknown,expectedDomain: string,path: string): ConfigResourceBranch {
  const record = protocolObject(value,path,BRANCH_FIELDS);
  const domain = protocolRequiredString(record,'domain',path);
  if (domain !== expectedDomain) {
    throw new Error(`Protocol error: ${path}.domain must be "${expectedDomain}".`);
  }
  const createdFromCommitId = protocolOptionalString(record,'createdFromCommitId',path);
  const archived = protocolOptionalBoolean(record,'archived',path);
  return {
    domain,
    resourceId: protocolRequiredString(record,'resourceId',path),
    name: protocolRequiredString(record,'name',path),
    headCommitId: protocolRequiredString(record,'headCommitId',path),
    headVersion: protocolRequiredInteger(record,'headVersion',path),
    revision: protocolRequiredInteger(record,'revision',path),
    ...(createdFromCommitId === undefined ? {} : { createdFromCommitId }),
    ...(archived === undefined ? {} : { archived }),
    createdAt: protocolRequiredString(record,'createdAt',path),
    updatedAt: protocolRequiredString(record,'updatedAt',path),
  };
}
