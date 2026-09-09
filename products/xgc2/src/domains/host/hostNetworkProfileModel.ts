export const NETWORK_PROFILE_SCHEMA = 'xgc2.system.network-profile/v1' as const;

export type NetworkProfileRole = 'core-router' | 'agent-egress';
export type NetworkInterfaceSelector =
  | { mode: 'auto';permanentMac?: never;nameHint?: never }
  | { mode: 'permanent-mac';permanentMac: string;nameHint?: string };

export type NetworkProfile = {
  schema: typeof NETWORK_PROFILE_SCHEMA;
  name: string;
  role: NetworkProfileRole;
  interfaces: Array<{ id: string;selector: NetworkInterfaceSelector }>;
  addresses: Array<{ interfaceId: string;mode: 'existing' | 'secondary';cidr: string }>;
  localRoutes: Array<{ destinationCidr: string;gateway: string;interfaceId: string;metric: number }>;
  forwarding: Array<{
    sourceCidr: string;
    destinationCidr: string;
    ingressInterfaceId: string;
    egressInterfaceId: string;
  }>;
  internetSharing?: {
    sourceCidrs: string[];
    ingressInterfaceId: string;
    egressInterfaceId: string;
    masquerade: boolean;
    allowEstablishedReturn: boolean;
  };
  githubProxy?: {
    listenAddresses: string[];
    port: number;
    allowedSources: string[];
    destinationPolicy: 'github';
    upstream: { mode: 'direct' | 'explicit';url?: string;credentialRef?: string };
  };
  agentEgress?: {
    mode: 'direct' | 'via-core-gateway' | 'via-core-proxy';
    interfaceId?: string;
    coreGateway?: string;
    proxyUrl?: string;
    preserveManagementRoute: boolean;
    rollbackTimeoutSeconds?: number;
  };
};

export type NetworkProfilePreset = { id: string;profile: NetworkProfile };

export type NetworkProfileAsset = {
  head: {
    resource: {
      id: string;
      domainKey: 'network-profile';
      namespaceId: string;
      name: string;
      mainHeadCommitId: string;
      revision: number;
      archivedAt?: string;
    };
    branch: { name: string;headCommitId: string;revision: number };
    commit: { id: string;version: number;rootDigest: string };
  };
  spec: NetworkProfile;
};

export type NetworkProfileMutation = {
  requestId: string;
  idempotencyKey: string;
  reason: string;
};
