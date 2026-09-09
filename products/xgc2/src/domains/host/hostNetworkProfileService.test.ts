import { beforeEach,describe,expect,it,vi } from 'vitest';
import { NETWORK_PROFILE_SCHEMA,type NetworkProfileAsset } from './hostNetworkProfileModel';
import {
  commitNetworkProfile,
  createNetworkProfile,
  listNetworkProfilePresets,
  listNetworkProfiles,
} from './hostNetworkProfileService';

const http = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../api/http',() => ({ request: http.request }));

describe('hostNetworkProfileService',() => {
  beforeEach(() => vi.clearAllMocks());

  it('decodes presets and versioned assets fail closed',async () => {
    const options = { targetCoreId: 'core-a' };
    http.request.mockResolvedValueOnce([{ id: 'auto',profile: profile() }]);
    await expect(listNetworkProfilePresets(undefined,options)).resolves.toEqual([{ id: 'auto',profile: profile() }]);
    expect(http.request).toHaveBeenNthCalledWith(1,'/network-profile-presets',{ signal: undefined },options);

    http.request.mockResolvedValueOnce([asset()]);
    await expect(listNetworkProfiles(undefined,options)).resolves.toEqual([asset()]);
    expect(http.request).toHaveBeenNthCalledWith(2,'/network-profiles',{ signal: undefined },options);

    http.request.mockResolvedValueOnce([{ id: 'bad',profile: { ...profile(),schema: 'legacy' } }]);
    await expect(listNetworkProfilePresets(undefined,options)).rejects.toThrow('schema is invalid');
  });

  it('creates and commits with configuration mutation identity and CAS',async () => {
    const options = { targetCoreId: 'core-a' };
    http.request.mockResolvedValueOnce(asset());
    await createNetworkProfile(profile(),{
      requestId: 'create-1',idempotencyKey: 'create-1',reason: 'save profile',
    },options);
    expect(http.request).toHaveBeenNthCalledWith(1,'/network-profiles',expect.objectContaining({
      method: 'POST',
      headers: { 'X-Request-ID': 'create-1','Idempotency-Key': 'create-1' },
    }),options);
    expect(JSON.parse(http.request.mock.calls[0][1].body)).toEqual(expect.objectContaining({
      namespaceId: '',profile: profile(),requestId: 'create-1',idempotencyKey: 'create-1',
    }));

    http.request.mockResolvedValueOnce({ ...asset(),head: {
      ...asset().head,commit: { ...asset().head.commit,id: 'commit-2',version: 2 },
    } });
    await commitNetworkProfile(asset(),{ ...profile(),name: 'Auto v2' },{
      requestId: 'commit-2',idempotencyKey: 'commit-2',reason: 'save profile version',
    },options);
    expect(http.request).toHaveBeenNthCalledWith(
      2,'/network-profiles/profile%2F1/branches/main/commits',expect.objectContaining({ method: 'POST' }),
      options,
    );
    expect(JSON.parse(http.request.mock.calls[1][1].body)).toEqual(expect.objectContaining({
      baseCommitId: 'commit-1',expectedBranchRevision: 4,expectedResourceRevision: 7,
    }));
  });
});

function profile() {
  return {
    schema: NETWORK_PROFILE_SCHEMA,
    name: 'Auto',
    role: 'core-router' as const,
    interfaces: [{ id: 'robot-lan',selector: { mode: 'auto' as const } }],
    addresses: [],localRoutes: [],forwarding: [],
  };
}

function asset(): NetworkProfileAsset {
  return {
    head: {
      resource: {
        id: 'profile/1',domainKey: 'network-profile',namespaceId: '',name: 'Auto',
        mainHeadCommitId: 'commit-1',revision: 7,
      },
      branch: { name: 'main',headCommitId: 'commit-1',revision: 4 },
      commit: { id: 'commit-1',version: 1,rootDigest: 'digest-1' },
    },
    spec: profile(),
  };
}
