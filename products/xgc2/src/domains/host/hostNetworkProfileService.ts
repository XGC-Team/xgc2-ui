import { request,type ApiTargetOptions } from '../../api/http';
import { configurationMutationInit } from '../../shared/configurationTransport';
import { segment } from '../../shared/url';
import {
  NETWORK_PROFILE_SCHEMA,
  type NetworkProfile,
  type NetworkProfileAsset,
  type NetworkProfileMutation,
  type NetworkProfilePreset,
} from './hostNetworkProfileModel';

export async function listNetworkProfilePresets(signal?: AbortSignal,options?: ApiTargetOptions): Promise<NetworkProfilePreset[]> {
  const value = await request<unknown>('/network-profile-presets',{ signal },options);
  return array(value,'/network-profile-presets').map((item,index) => decodePreset(item,`preset[${index}]`));
}

export async function listNetworkProfiles(signal?: AbortSignal,options?: ApiTargetOptions): Promise<NetworkProfileAsset[]> {
  const value = await request<unknown>('/network-profiles',{ signal },options);
  return array(value,'/network-profiles').map((item,index) => decodeAsset(item,`profile[${index}]`));
}

export async function createNetworkProfile(
  profile: NetworkProfile,
  mutation: NetworkProfileMutation,
  options?: ApiTargetOptions,
): Promise<NetworkProfileAsset> {
  const value = await request<unknown>('/network-profiles',{
    method: 'POST',
    ...configurationMutationInit({ namespaceId: '',profile,...mutation }),
  },options);
  return decodeAsset(value,'created network profile');
}

export async function commitNetworkProfile(
  asset: NetworkProfileAsset,
  profile: NetworkProfile,
  mutation: NetworkProfileMutation,
  options?: ApiTargetOptions,
): Promise<NetworkProfileAsset> {
  const value = await request<unknown>(
    `/network-profiles/${segment(asset.head.resource.id)}/branches/${segment(asset.head.branch.name)}/commits`,
    {
      method: 'POST',
      ...configurationMutationInit({
        profile,
        baseCommitId: asset.head.commit.id,
        expectedBranchRevision: asset.head.branch.revision,
        expectedResourceRevision: asset.head.resource.revision,
        ...mutation,
      }),
    },options,
  );
  return decodeAsset(value,'committed network profile');
}

function decodePreset(value: unknown,path: string): NetworkProfilePreset {
  const item = record(value,path);
  return { id: text(item.id,`${path}.id`),profile: decodeProfile(item.profile,`${path}.profile`) };
}

function decodeAsset(value: unknown,path: string): NetworkProfileAsset {
  const item = record(value,path);
  const head = record(item.head,`${path}.head`);
  const resource = record(head.resource,`${path}.head.resource`);
  const branch = record(head.branch,`${path}.head.branch`);
  const commit = record(head.commit,`${path}.head.commit`);
  if (resource.domainKey !== 'network-profile') throw new Error(`${path}.head.resource.domainKey is invalid`);
  return {
    head: {
      resource: {
        id: text(resource.id,`${path}.head.resource.id`),
        domainKey: 'network-profile',
        namespaceId: optionalText(resource.namespaceId),
        name: text(resource.name,`${path}.head.resource.name`),
        mainHeadCommitId: text(resource.mainHeadCommitId,`${path}.head.resource.mainHeadCommitId`),
        revision: number(resource.revision,`${path}.head.resource.revision`),
        ...(typeof resource.archivedAt === 'string' ? { archivedAt: resource.archivedAt } : {}),
      },
      branch: {
        name: text(branch.name,`${path}.head.branch.name`),
        headCommitId: text(branch.headCommitId,`${path}.head.branch.headCommitId`),
        revision: number(branch.revision,`${path}.head.branch.revision`),
      },
      commit: {
        id: text(commit.id,`${path}.head.commit.id`),
        version: number(commit.version,`${path}.head.commit.version`),
        rootDigest: text(commit.rootDigest,`${path}.head.commit.rootDigest`),
      },
    },
    spec: decodeProfile(item.spec,`${path}.spec`),
  };
}

function decodeProfile(value: unknown,path: string): NetworkProfile {
  const profile = record(value,path);
  if (profile.schema !== NETWORK_PROFILE_SCHEMA) throw new Error(`${path}.schema is invalid`);
  if (profile.role !== 'core-router' && profile.role !== 'agent-egress') throw new Error(`${path}.role is invalid`);
  array(profile.interfaces,`${path}.interfaces`);
  array(profile.addresses,`${path}.addresses`);
  array(profile.localRoutes,`${path}.localRoutes`);
  array(profile.forwarding,`${path}.forwarding`);
  text(profile.name,`${path}.name`);
  return profile as NetworkProfile;
}

function record(value: unknown,path: string): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string,unknown>;
}

function array(value: unknown,path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}

function text(value: unknown,path: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`${path} must be a non-empty string`);
  return value;
}

function optionalText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function number(value: unknown,path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a number`);
  return value;
}
