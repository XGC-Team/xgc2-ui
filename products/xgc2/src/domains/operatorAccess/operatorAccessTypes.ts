export type OperatorGrant = {
  stationId: string;
  name: string;
  role: string;
  capabilities: string[];
  visibleCores: string[];
  expiresAt?: string;
};

export type OperatorIdentity =
  | { authenticated: false; canPair: false }
  | (OperatorGrant & {
    authenticated: true;
    transport: 'local' | 'header' | 'operator-cookie';
    canPair: boolean;
  });

export type OperatorPairingOptions = {
  pairingPath: '/operator-pair';
  origins: { host: string; publicOrigin: string }[];
  grants: OperatorGrant[];
};

export type OperatorPairingIssued = {
  publicOrigin: string;
  pairingPath: '/operator-pair';
  bootstrapToken: string;
  bootstrapExpiresAt: string;
  station: OperatorGrant;
};
